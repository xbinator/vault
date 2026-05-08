/**
 * @file coordinator.ts
 * @description 压缩流程协调层：串联 policy、planner、summarizer、assembler，管理会话级压缩状态。
 */
import type { TopicSegment } from './topicSegmenter';
import type {
  BuildSummaryResult,
  ConversationSummaryRecord,
  ContextBudgetSnapshot,
  PrepareMessagesInput,
  PrepareMessagesOutput,
  StructuredConversationSummary,
  SummaryBuildMode,
  SummaryStorage,
  TriggerReason
} from './types';
import { findLast } from 'lodash-es';
import type { Message } from '@/components/BChatSidebar/utils/types';
import { providerStorage } from '@/shared/storage';
import { asyncTo } from '@/utils/asyncTo';
import { findLatestCompressionBoundaryIndex, sliceMessagesFromCompressionBoundary } from '../messageHelper';
import { assembleContext } from './assembler';
import { CURRENT_SCHEMA_VERSION, RECENT_ROUND_PRESERVE } from './constant';
import { CompressionCancelledError, CompressionError } from './error';
import { planCompression } from './planner';
import { computeCompressionTokenThreshold, countMessageRounds, estimateContextSize, evaluateFromSnapshot } from './policy';
import { selectRelevantSegments } from './segmentRecall';
import { ruleTrim, truncateSummaryText } from './summarizer';
import { generateStructuredSummary, generateSummaryText } from './summaryGenerator';
import { createTokenEstimator } from './tokenEstimator';
import { detectTopicBoundaries, segmentMessages } from './topicSegmenter';

/**
 * 会话级压缩锁，防止同一会话并发触发压缩。
 */
const sessionLocks = new Map<string, Promise<void>>();

/**
 * 获取多段摘要生成中的前置上下文摘要。
 * 当存在上一段记录时，返回其摘要信息；否则使用当前摘要作为前置上下文。
 *
 * @param currentIndex - 当前处理的分段索引
 * @param records - 已生成的摘要记录列表
 * @param currentSummary - 当前有效摘要（用于继承上下文）
 * @returns 前置上下文摘要，优先使用上一段记录，否则使用当前摘要
 */
function getPreviousSummaryForSegment(currentIndex: number, records: ConversationSummaryRecord[], currentSummary?: ConversationSummaryRecord) {
  if (currentIndex > 0 && records.length > 0) {
    const lastRecord = records[records.length - 1];
    return { summaryText: lastRecord.summaryText, structuredSummary: lastRecord.structuredSummary };
  }
  return currentSummary;
}

/**
 * 获取会话级互斥锁。若锁已被占用，则等待其释放后再继续。
 * @param sessionId - 会话 ID
 * @returns 释放锁的回调函数
 */
async function acquireSessionLock(sessionId: string): Promise<() => void> {
  const existingLock = sessionLocks.get(sessionId);
  if (existingLock) {
    await asyncTo(existingLock);
  }

  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = () => {
      sessionLocks.delete(sessionId);
      resolve();
    };
  });
  sessionLocks.set(sessionId, lockPromise);
  return () => {
    sessionLocks.delete(sessionId);
    releaseLock!();
  };
}

/**
 * 解析待压缩消息窗口参数
 */
interface ResolveIncrementalWindowOptions {
  /** 全量消息列表 */
  messages: Message[];
  /** 是否为增量模式 */
  isIncrementalMode: boolean;
  /** 当前有效摘要（增量模式必需） */
  currentSummary?: ConversationSummaryRecord;
  /** 当前用户消息 ID（从结果中排除） */
  currentUserMessageId?: string;
}

/**
 * 解析待压缩消息窗口。
 *
 * - 增量模式：根据当前摘要边界截取增量消息
 * - 非增量模式：返回除当前用户消息外的所有消息
 *
 * @param options - 解析参数选项
 * @returns 待压缩的消息窗口
 */
function resolveIncrementalWindow(options: ResolveIncrementalWindowOptions): Message[] {
  const { messages, isIncrementalMode, currentSummary, currentUserMessageId } = options;

  if (!isIncrementalMode) {
    return messages.filter((m) => m.id !== currentUserMessageId);
  }

  if (!currentSummary) {
    return messages.filter((m) => m.id !== currentUserMessageId);
  }

  const startIndex = messages.findIndex((m) => m.id === currentSummary.coveredEndMessageId);
  const tailMessages = startIndex >= 0 ? messages.slice(startIndex + 1) : messages;
  return tailMessages.filter((m) => m.id !== currentUserMessageId);
}

/**
 * 以摘要边界为基准，将消息拆分为「穿透保留消息」和「近期原文消息」两段，
 * 供 assembleContext 使用。
 *
 * @param messages - 全量消息列表
 * @param currentUserMessageId - 当前用户消息 ID（从近期消息中排除）
 * @param summaryRecord - 当前有效摘要（无则近期消息为全量）
 * @returns 包含 preservedMessages 和 recentMessages 的分段结果
 */
function splitMessagesForAssembly(messages: Message[], currentUserMessageId: string, summaryRecord?: ConversationSummaryRecord) {
  const messagesWithoutCurrent = messages.filter((m) => m.id !== currentUserMessageId);

  if (!summaryRecord) {
    return { preservedMessages: [], recentMessages: messagesWithoutCurrent };
  }

  const preservedIdSet = new Set(summaryRecord.preservedMessageIds);
  const preservedMessages = messages.filter((m) => preservedIdSet.has(m.id));

  const coveredIndex = messages.findIndex((m) => m.id === summaryRecord.coveredUntilMessageId);
  const boundaryMessages = coveredIndex >= 0 ? messages.slice(coveredIndex + 1) : messagesWithoutCurrent;
  const recentMessages = boundaryMessages.filter((m) => m.id !== currentUserMessageId && !preservedIdSet.has(m.id));

  return { preservedMessages, recentMessages };
}

/**
 * 解析多段摘要记录参数
 */
interface ResolveSummaryRecordsForAssemblyOptions {
  /** 当前用户消息 */
  currentUserMessage: Message;
  /** 摘要存储层（可选） */
  storage?: SummaryStorage;
  /** 当前摘要记录 */
  summaryRecord?: ConversationSummaryRecord;
}

/**
 * 解析上下文预算估算所需的摘要记录集合。
 *
 * 若当前摘要属于多段摘要集（summarySetId 存在且 segmentCount > 1），
 * 则按与真实发送一致的召回规则，从存储中检索相关段落。
 *
 * @param options - 解析参数选项
 * @returns 用于上下文组装的多段摘要列表；单段摘要或无 storage 时返回 undefined
 */
async function resolveSummaryRecordsForAssembly(options: ResolveSummaryRecordsForAssemblyOptions): Promise<ConversationSummaryRecord[] | undefined> {
  const { currentUserMessage, storage, summaryRecord } = options;

  if (!storage) return undefined;

  const isMultiSegment = summaryRecord?.summarySetId && (summaryRecord.segmentCount ?? 1) > 1;
  if (!isMultiSegment) return undefined;

  const allSummaries = await storage.getAllSummaries(summaryRecord!.sessionId);
  const validSegments = allSummaries
    .filter((item) => item.summarySetId === summaryRecord!.summarySetId && item.status === 'valid')
    .sort((a, b) => (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0));

  return selectRelevantSegments(currentUserMessage, validSegments, {
    maxSegments: 3,
    maxSummaryTokens: 2000,
    alwaysIncludeRecentSegment: true
  });
}

/**
 * 估算工具定义列表的序列化字符数。
 *
 * @param toolDefinitions - 工具定义列表
 * @returns 字符数；列表为空时返回 0
 */
function estimateToolDefinitionsCharCount(toolDefinitions?: unknown[]): number {
  if (!toolDefinitions || toolDefinitions.length === 0) return 0;
  return JSON.stringify(toolDefinitions).length;
}

/**
 * 查询指定模型的上下文窗口大小。
 *
 * @param providerId - 提供商 ID
 * @param modelId - 模型 ID
 * @returns 上下文窗口大小；无法解析时返回 undefined
 */
async function resolveModelContextWindow(providerId: string | undefined, modelId: string | undefined): Promise<number | undefined> {
  if (!providerId || !modelId) return undefined;

  const provider = await providerStorage.getProvider(providerId);
  const model = provider?.models?.find((m) => m.id === modelId);
  const contextWindow = model?.contextWindow;

  return contextWindow && contextWindow > 0 ? contextWindow : undefined;
}

// ─────────────────────────────────────────────────────────────
// 多段摘要构建
// ─────────────────────────────────────────────────────────────

/**
 * buildMultiSegmentSummary 的入参集合。
 */
interface BuildMultiSegmentSummaryParams {
  /** 摘要存储层 */
  storage: SummaryStorage;
  /** 会话 ID */
  sessionId: string;
  /** 全量消息列表 */
  messages: Message[];
  /** 摘要构建模式 */
  buildMode: SummaryBuildMode;
  /** 触发原因 */
  triggerReason: TriggerReason;
  /** 当前有效摘要（用于继承上下文） */
  currentSummary?: ConversationSummaryRecord;
  /** 消息分类结果 */
  classification: ReturnType<typeof planCompression>;
  /** 话题分段列表 */
  segments: TopicSegment[];
  /** 当前用户消息 ID（排除后不进入摘要） */
  currentUserMessageId?: string;
  /** 降级原因：全量重建被截断时降级为增量 */
  degradeReason?: 'degraded_to_incremental';
  /** 压缩取消信号 */
  signal?: AbortSignal;
}

/**
 * 在关键阶段边界检查压缩任务是否已被用户取消。
 * @param signal - 压缩取消信号
 */
function throwIfCompressionCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CompressionCancelledError();
  }
}

/**
 * 按话题分段顺序生成并持久化多段摘要记录。
 *
 * 各段独立生成摘要文本，共享同一个 summarySetId。
 * 若中途任一段失败，已写入的 draft 记录将全部回收为 invalid。
 *
 * @param params - 构建参数
 * @returns 新摘要集合的首条记录及消息分类结果；无可压缩内容时返回 undefined
 */
async function buildMultiSegmentSummary(params: BuildMultiSegmentSummaryParams): Promise<BuildSummaryResult | undefined> {
  const { storage, sessionId, messages, buildMode, triggerReason, currentSummary, classification, segments, degradeReason, signal } = params;

  const summarySetId = `set-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const segmentCount = segments.length;
  const records: ConversationSummaryRecord[] = [];

  try {
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      throwIfCompressionCancelled(signal);

      let trimmed: ReturnType<typeof ruleTrim>;
      try {
        trimmed = ruleTrim(segment.messages);
      } catch (error) {
        throw new CompressionError('消息裁剪失败', 'rule_trim', error);
      }

      // 增量段落：以上一段摘要作为前置上下文，保持多段之间的连贯性
      const previousSummary = getPreviousSummaryForSegment(i, records, currentSummary);

      let structuredSummary: StructuredConversationSummary;
      try {
        throwIfCompressionCancelled(signal);
        /* eslint-disable-next-line no-await-in-loop -- 多段摘要需按顺序生成，每段依赖前一段上下文 */
        structuredSummary = await generateStructuredSummary({ items: trimmed.items, previousSummary });
        throwIfCompressionCancelled(signal);
      } catch (error) {
        throw new CompressionError('AI 摘要生成失败', 'ai_summary', error);
      }

      const summaryText = truncateSummaryText(generateSummaryText(structuredSummary));

      try {
        throwIfCompressionCancelled(signal);
        /* eslint-disable-next-line no-await-in-loop -- 按顺序持久化每段摘要，保证 segmentIndex 与生成顺序一致 */
        const record = await storage.createSummary({
          sessionId,
          buildMode,
          derivedFromSummaryId: currentSummary?.id,
          coveredStartMessageId: segment.startMessageId,
          coveredEndMessageId: segment.endMessageId,
          coveredUntilMessageId: segment.endMessageId,
          sourceMessageIds: segment.messages.map((m) => m.id),
          preservedMessageIds: classification.preservedMessageIds,
          summaryText,
          structuredSummary,
          triggerReason,
          messageCountSnapshot: Math.ceil(messages.filter((m) => m.role === 'user' || m.role === 'assistant').length / 2),
          charCountSnapshot: trimmed.charCount,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          status: 'draft',
          invalidReason: undefined,
          degradeReason,
          summarySetId,
          segmentIndex: i,
          segmentCount,
          topicTags: []
        });
        records.push(record);
      } catch (error) {
        throw new CompressionError('摘要保存失败', 'storage', error);
      }
    }

    // 所有段写入完毕后，统一提升为 valid 状态
    for (const record of records) {
      /* eslint-disable-next-line no-await-in-loop -- 按顺序提升摘要集状态，保证一致性 */
      await storage.updateSummaryStatus(record.id, 'valid');
      record.status = 'valid';
    }

    if (currentSummary) {
      await storage.updateSummaryStatus(currentSummary.id, 'superseded');
    }

    return { summaryRecord: records[0], classification };
  } catch (error) {
    // 构建失败：将已写入的 draft 记录全部标记为 invalid，忽略回收失败以保留原始错误
    for (const record of records) {
      /* eslint-disable-next-line no-await-in-loop -- 逐条回收 draft 记录 */
      await asyncTo(storage.updateSummaryStatus(record.id, 'invalid', 'incomplete_summary_set'));
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// 单次摘要构建
// ─────────────────────────────────────────────────────────────

/**
 * buildSummaryRecord 的入参集合。
 */
interface BuildSummaryRecordOptions {
  /** 摘要存储层 */
  storage: SummaryStorage;
  /** 会话 ID */
  sessionId: string;
  /** 全量消息列表 */
  messages: Message[];
  /** 摘要构建模式 */
  buildMode: SummaryBuildMode;
  /** 触发原因 */
  triggerReason: TriggerReason;
  /** 当前有效摘要 */
  currentSummary?: ConversationSummaryRecord;
  /** 当前用户消息 ID（自动发送时排除） */
  currentUserMessageId?: string;
  /** 需要显式排除的消息 ID 列表 */
  excludeMessageIds?: string[];
  /** 降级原因 */
  degradeReason?: 'degraded_to_incremental';
  /** 压缩取消信号 */
  signal?: AbortSignal;
}

/**
 * 生成并持久化摘要记录。
 *
 * - 增量模式（incremental）或降级为增量的全量重建：仅压缩上次摘要未覆盖的新消息。
 * - 话题分段数 ≥ 3 且消息数 > 20 时，自动切换至多段摘要构建。
 *
 * @param options - 构建选项
 * @returns 新摘要记录及对应的消息分类结果；无可压缩内容时返回 undefined
 */
async function buildSummaryRecord(options: BuildSummaryRecordOptions): Promise<BuildSummaryResult | undefined> {
  const { storage, sessionId, messages, buildMode, triggerReason, currentSummary, currentUserMessageId, excludeMessageIds, degradeReason, signal } = options;
  throwIfCompressionCancelled(signal);

  const isIncrementalMode = buildMode === 'incremental' || degradeReason === 'degraded_to_incremental';
  const windowMessages = resolveIncrementalWindow({
    messages,
    isIncrementalMode,
    currentSummary,
    currentUserMessageId
  });

  const classification = planCompression(windowMessages, RECENT_ROUND_PRESERVE, currentUserMessageId, excludeMessageIds);
  if (!classification.compressibleMessages.length) return undefined;

  // 合并文件语义消息与可压缩消息，按原始顺序排列，确保 coveredStart/EndMessageId 正确
  const summarizedIdSet = new Set([...classification.fileSemanticMessages.map((m) => m.id), ...classification.compressibleMessages.map((m) => m.id)]);
  const orderedSummarizedMessages = windowMessages.filter((m) => summarizedIdSet.has(m.id));

  // 话题分段检测：满足条件时切换至多段摘要构建
  const segments = segmentMessages(orderedSummarizedMessages, detectTopicBoundaries(orderedSummarizedMessages));
  if (segments.length >= 3 && orderedSummarizedMessages.length > 20) {
    return buildMultiSegmentSummary({
      storage,
      sessionId,
      messages,
      buildMode,
      triggerReason,
      currentSummary,
      classification,
      segments,
      currentUserMessageId,
      degradeReason,
      signal
    });
  }

  let trimmed: ReturnType<typeof ruleTrim>;
  try {
    throwIfCompressionCancelled(signal);
    trimmed = ruleTrim(orderedSummarizedMessages);
    throwIfCompressionCancelled(signal);
  } catch (error) {
    throw new CompressionError('消息裁剪失败', 'rule_trim', error);
  }

  // 增量模式下将上一条摘要作为上下文传入，以保持摘要连贯性
  throwIfCompressionCancelled(signal);
  const structuredSummary = await generateStructuredSummary({
    items: trimmed.items,
    previousSummary: isIncrementalMode ? currentSummary : undefined
  });
  throwIfCompressionCancelled(signal);

  const summaryText = truncateSummaryText(generateSummaryText(structuredSummary));
  const allSummarizedIds = orderedSummarizedMessages.map((m) => m.id);

  // 增量模式下，覆盖起点从上次摘要边界之后开始
  const coveredStartMessageId = isIncrementalMode ? allSummarizedIds[0] ?? currentSummary?.coveredEndMessageId ?? '' : allSummarizedIds[0] ?? '';
  const coveredEndMessageId = allSummarizedIds[allSummarizedIds.length - 1];

  // coveredUntilMessageId 取最后一条非保留消息，标记摘要实际覆盖的边界
  const preservedSet = new Set(classification.preservedMessageIds);
  const lastNonPreserved = findLast(allSummarizedIds, (id) => !preservedSet.has(id));
  const coveredUntilMessageId = lastNonPreserved ?? coveredEndMessageId;

  let summaryRecord: ConversationSummaryRecord;
  try {
    throwIfCompressionCancelled(signal);
    summaryRecord = await storage.createSummary({
      sessionId,
      buildMode,
      derivedFromSummaryId: currentSummary?.id,
      coveredStartMessageId,
      coveredEndMessageId,
      coveredUntilMessageId,
      sourceMessageIds: allSummarizedIds.filter((id) => !preservedSet.has(id)),
      preservedMessageIds: classification.preservedMessageIds,
      summaryText,
      structuredSummary,
      triggerReason,
      messageCountSnapshot: Math.ceil(messages.filter((m) => m.role === 'user' || m.role === 'assistant').length / 2),
      charCountSnapshot: trimmed.charCount,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      status: 'valid',
      invalidReason: undefined,
      degradeReason
    });
  } catch (error) {
    throw new CompressionError('摘要保存失败', 'storage', error);
  }

  if (currentSummary && currentSummary.id !== summaryRecord.id) {
    await storage.updateSummaryStatus(currentSummary.id, 'superseded');
  }

  return { summaryRecord, classification };
}

// ─────────────────────────────────────────────────────────────
// 上下文组装
// ─────────────────────────────────────────────────────────────

/**
 * 组装上下文并以统一格式返回结果。
 *
 * 若 summaryRecord 属于多段摘要集，会先从存储中检索同集的所有相关段落，
 * 再交由 assembleContext 统一处理。
 *
 * @param messages - 全量消息列表
 * @param currentUserMessage - 当前用户消息
 * @param summaryRecord - 当前有效摘要（可为 undefined）
 * @param compressed - 本次调用是否执行了压缩
 * @param storage - 摘要存储层（用于检索多段摘要）
 * @returns 组装后的模型消息列表及压缩标记
 */
async function assembleAndReturn(
  messages: Message[],
  currentUserMessage: Message,
  summaryRecord: ConversationSummaryRecord | undefined,
  compressed: boolean,
  storage?: SummaryStorage
): Promise<PrepareMessagesOutput> {
  const { preservedMessages, recentMessages } = splitMessagesForAssembly(messages, currentUserMessage.id, summaryRecord);
  const summaryRecords = await resolveSummaryRecordsForAssembly({
    currentUserMessage,
    storage,
    summaryRecord
  });

  const assembled = assembleContext({
    summaryRecord,
    summaryRecords,
    preservedMessages,
    recentMessages,
    currentUserMessage
  });

  return { modelMessages: assembled.modelMessages, compressed };
}

// ─────────────────────────────────────────────────────────────
// 上下文预算快照
// ─────────────────────────────────────────────────────────────

/**
 * resolveTokenEstimate 的返回结构。
 */
interface TokenEstimateResult {
  tokenCount: number | undefined;
  tokenThreshold: number | undefined;
  tokenAccuracy: ContextBudgetSnapshot['tokenAccuracy'];
}

/**
 * 估算组装后上下文的 token 数量及压缩阈值。
 *
 * 若 tokenEstimator 无法创建（模型不支持），则降级为字符估算标记。
 *
 * @param modelId - 模型 ID
 * @param providerId - 提供商 ID（用于获取 contextWindow）
 * @param modelMessages - 已组装的模型消息列表
 * @param toolDefinitions - 当前请求附带的工具定义
 * @returns token 数量、压缩阈值及精度标记
 */
/**
 * Token 估算参数
 */
interface ResolveTokenEstimateOptions {
  /** 模型 ID（可选） */
  modelId?: string;
  /** 提供商 ID */
  providerId?: string;
  /** 模型消息列表 */
  modelMessages: Parameters<typeof estimateContextSize>[0];
  /** 工具定义列表 */
  toolDefinitions?: unknown[];
}

/**
 * 解析 Token 估算结果。
 *
 * - 当 modelId 可用时：调用 token 估算器进行精确计算
 * - 当 modelId 不可用时：返回 undefined 值，表示无法估算
 *
 * @param options - 估算参数选项
 * @returns Token 估算结果
 */
async function resolveTokenEstimate(options: ResolveTokenEstimateOptions): Promise<TokenEstimateResult> {
  const { modelId, providerId, modelMessages, toolDefinitions } = options;

  if (!modelId) {
    return { tokenCount: undefined, tokenThreshold: undefined, tokenAccuracy: 'char_fallback' };
  }

  const tokenEstimator = await createTokenEstimator(modelId);
  if (!tokenEstimator) {
    return { tokenCount: undefined, tokenThreshold: undefined, tokenAccuracy: 'char_fallback' };
  }

  let tokenCount = tokenEstimator.estimate(modelMessages);
  if (toolDefinitions && toolDefinitions.length > 0) {
    tokenCount += tokenEstimator.estimateText(JSON.stringify(toolDefinitions));
  }

  const contextWindow = await resolveModelContextWindow(providerId, modelId);
  const tokenThreshold = contextWindow ? computeCompressionTokenThreshold(contextWindow) : undefined;

  return { tokenCount, tokenThreshold, tokenAccuracy: 'native_like' };
}

/**
 * 构建上下文预算快照参数
 */
interface BuildContextBudgetSnapshotOptions {
  /** 全量消息列表 */
  messages: Message[];
  /** 当前有效摘要 */
  currentSummary?: ConversationSummaryRecord;
  /** 当前用户消息 */
  currentUserMessage: Message;
  /** 摘要存储层 */
  storage: SummaryStorage;
  /** 提供商 ID */
  providerId?: string;
  /** 模型 ID（用于 token 估算） */
  modelId?: string;
  /** 当前请求附带的工具定义 */
  toolDefinitions?: unknown[];
}

/**
 * 构建上下文预算快照，供 policy 层判断是否需要压缩。
 *
 * 优先使用 token 级估算（需 modelId 可用），降级时使用字符级估算。
 * 估算形状与 assembleContext 真实注入对齐，保证判断精度。
 *
 * @param options - 构建参数选项
 * @returns ContextBudgetSnapshot
 */
export async function buildContextBudgetSnapshot(options: BuildContextBudgetSnapshotOptions): Promise<ContextBudgetSnapshot> {
  const { messages, currentSummary, currentUserMessage, storage, providerId, modelId, toolDefinitions } = options;
  const effectiveMessages = sliceMessagesFromCompressionBoundary(messages);
  const effectiveSummary = findLatestCompressionBoundaryIndex(messages) >= 0 ? undefined : currentSummary;

  // 计算有效消息轮数（已压缩时仅统计摘要边界后的消息）
  let roundCount: number;
  if (effectiveSummary && effectiveSummary.status === 'valid') {
    const preservedIdSet = new Set(effectiveSummary.preservedMessageIds ?? []);
    const preservedMsgs = effectiveMessages.filter((m) => preservedIdSet.has(m.id));
    const coveredIndex = effectiveMessages.findIndex((m) => m.id === effectiveSummary.coveredUntilMessageId);
    const recentMsgs = coveredIndex >= 0 ? effectiveMessages.slice(coveredIndex + 1).filter((m) => !preservedIdSet.has(m.id)) : effectiveMessages;
    roundCount = countMessageRounds([...preservedMsgs, ...recentMsgs]);
  } else {
    roundCount = countMessageRounds(effectiveMessages);
  }

  // 字符级估算：与 assembleContext 的真实注入形状保持一致
  const { preservedMessages, recentMessages } = splitMessagesForAssembly(effectiveMessages, currentUserMessage.id, effectiveSummary);
  const summaryRecords = await resolveSummaryRecordsForAssembly({
    currentUserMessage,
    storage,
    summaryRecord: effectiveSummary
  });
  const assembled = assembleContext({
    summaryRecord: effectiveSummary,
    summaryRecords,
    preservedMessages,
    recentMessages,
    currentUserMessage
  });
  const charCount = estimateContextSize(assembled.modelMessages) + estimateToolDefinitionsCharCount(toolDefinitions);

  // Token 级估算（可选，取决于 modelId 是否可用）
  const { tokenCount, tokenThreshold, tokenAccuracy } = await resolveTokenEstimate({
    modelId,
    providerId,
    modelMessages: assembled.modelMessages,
    toolDefinitions
  });

  return { charCount, tokenCount, tokenThreshold, tokenAccuracy, roundCount };
}

// ─────────────────────────────────────────────────────────────
// 压缩协调器
// ─────────────────────────────────────────────────────────────

/**
 * 创建压缩协调器。
 *
 * 协调器负责串联压缩策略判断、摘要生成与上下文组装，
 * 并通过会话级互斥锁防止并发压缩导致的状态冲突。
 *
 * @param storage - 摘要存储层接口
 * @returns 协调器对象
 */
export function createCompressionCoordinator(storage: SummaryStorage) {
  /**
   * 执行压缩参数
   */
  interface RunCompressionOptions {
    /** prepareMessagesBeforeSend 的原始入参 */
    input: PrepareMessagesInput;
    /** 已经过边界裁剪的有效消息列表 */
    effectiveMessages: Message[];
    /** 二次校验后获取的最新有效摘要 */
    latestSummary?: ConversationSummaryRecord;
    /** 本次压缩的触发原因（来自首次 policy 评估） */
    triggerReason: TriggerReason;
    /** 压缩取消信号 */
    signal?: AbortSignal;
  }

  /**
   * 执行压缩并组装上下文，供 prepareMessagesBeforeSend 在持锁后调用。
   *
   * 若无可压缩内容，直接返回未压缩的上下文。
   * 若压缩过程抛出异常，降级返回基于当前摘要的原始上下文。
   *
   * @param options - 执行参数选项
   * @returns 组装后的模型消息列表及压缩标记
   */
  async function runCompression(options: RunCompressionOptions): Promise<PrepareMessagesOutput> {
    const { input, effectiveMessages, latestSummary, triggerReason, signal } = options;
    const { sessionId, currentUserMessage, excludeMessageIds } = input;
    try {
      const summaryResult = await buildSummaryRecord({
        storage,
        sessionId,
        messages: effectiveMessages,
        buildMode: 'incremental',
        triggerReason,
        currentSummary: latestSummary,
        currentUserMessageId: currentUserMessage.id,
        excludeMessageIds,
        signal
      });

      if (!summaryResult) {
        return assembleAndReturn(effectiveMessages, currentUserMessage, latestSummary, false, storage);
      }

      return assembleAndReturn(effectiveMessages, currentUserMessage, summaryResult.summaryRecord, true, storage);
    } catch (error) {
      // 压缩失败，降级返回未压缩的原始上下文
      console.error('[压缩] 上下文压缩失败，降级返回原始上下文:', error);
      return assembleAndReturn(effectiveMessages, currentUserMessage, latestSummary, false, storage);
    }
  }

  return {
    /**
     * 在消息发送前准备模型上下文。
     *
     * 流程：
     * 1. 基于双阈值策略判断是否需要压缩。
     * 2. 需要压缩时，获取会话锁并二次校验（避免重复压缩）。
     * 3. 执行压缩；若失败，降级为返回未压缩的原始上下文。
     *
     * @param input - 准备参数
     * @returns 组装后的模型消息列表及压缩标记
     */
    async prepareMessagesBeforeSend(input: PrepareMessagesInput): Promise<PrepareMessagesOutput> {
      const { sessionId, messages, currentUserMessage, providerId, modelId, toolDefinitions } = input;
      const effectiveMessages = sliceMessagesFromCompressionBoundary(messages);
      const hasCompressionBoundary = findLatestCompressionBoundaryIndex(messages) >= 0;
      const currentSummary = hasCompressionBoundary ? undefined : await storage.getValidSummary(sessionId);
      const snapshot = await buildContextBudgetSnapshot({
        messages: effectiveMessages,
        currentSummary,
        currentUserMessage,
        storage,
        providerId,
        modelId,
        toolDefinitions
      });
      const policyResult = evaluateFromSnapshot(snapshot);

      if (!policyResult.shouldCompress) {
        return assembleAndReturn(effectiveMessages, currentUserMessage, currentSummary, false, storage);
      }

      // 压缩路径：获取会话锁后二次检查，防止等锁期间已被其他请求完成压缩
      const releaseLock = await acquireSessionLock(sessionId);
      try {
        const latestSummary = hasCompressionBoundary ? undefined : await storage.getValidSummary(sessionId);
        const latestSnapshot = await buildContextBudgetSnapshot({
          messages: effectiveMessages,
          currentSummary: latestSummary,
          currentUserMessage,
          storage,
          providerId,
          modelId,
          toolDefinitions
        });
        const latestPolicy = evaluateFromSnapshot(latestSnapshot);

        if (!latestPolicy.shouldCompress) {
          return assembleAndReturn(effectiveMessages, currentUserMessage, latestSummary, false, storage);
        }

        return runCompression({
          input,
          effectiveMessages,
          latestSummary,
          triggerReason: policyResult.triggerReason
        });
      } finally {
        releaseLock();
      }
    },

    /**
     * 手动触发会话全量压缩。
     *
     * 若输入消息被截断，buildMode 仍记为 full_rebuild（体现用户意图），
     * 但通过 degradeReason 标记执行层实际降级为增量模式。
     *
     * @param input - 压缩输入参数
     * @returns 新生成的摘要记录；无可压缩内容时返回 undefined
     */
    async compressSessionManually(input: { sessionId: string; messages: Message[]; signal?: AbortSignal }): Promise<ConversationSummaryRecord | undefined> {
      const { sessionId, messages, signal } = input;
      const releaseLock = await acquireSessionLock(sessionId);

      try {
        throwIfCompressionCancelled(signal);
        const currentSummary = await storage.getValidSummary(sessionId);
        throwIfCompressionCancelled(signal);

        const fullRebuildTrim = ruleTrim(messages);
        const degradeReason = fullRebuildTrim.truncated ? ('degraded_to_incremental' as const) : undefined;
        throwIfCompressionCancelled(signal);

        const summaryResult = await buildSummaryRecord({
          storage,
          sessionId,
          messages,
          buildMode: 'full_rebuild',
          triggerReason: 'manual',
          currentSummary,
          degradeReason,
          signal
        });

        return summaryResult?.summaryRecord;
      } finally {
        releaseLock();
      }
    }
  };
}
