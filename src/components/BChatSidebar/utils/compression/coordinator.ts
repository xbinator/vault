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
import { assembleContext } from './assembler';
import { CURRENT_SCHEMA_VERSION, RECENT_ROUND_PRESERVE } from './constant';
import { CompressionError } from './error';
import { planCompression } from './planner';
import { computeCompressionTokenThreshold, countMessageRounds, estimateContextSize, evaluateFromSnapshot } from './policy';
import { selectRelevantSegments } from './segmentRecall';
import { ruleTrim, truncateSummaryText } from './summarizer';
import { generateStructuredSummary, generateSummaryText } from './summaryGenerator';
import { createTokenEstimator } from './tokenEstimator';
import { detectTopicBoundaries, segmentMessages } from './topicSegmenter';

/**
 * 会话级压缩锁，防止同一会话并发压缩。
 */
const sessionLocks = new Map<string, Promise<void>>();

/**
 * 获取会话锁，如果锁已被占用则等待。
 * 返回一个释放锁的函数，以及一个标志表示是否应该继续执行。
 */
async function acquireSessionLock(sessionId: string): Promise<() => void> {
  // 等待现有锁释放
  const existingLock = sessionLocks.get(sessionId);
  if (existingLock) {
    await asyncTo(existingLock);
    // 等待的锁失败了，继续尝试获取
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
 * 计算增量压缩窗口：从上一条摘要的 coveredEndMessageId 之后开始，过滤当前用户消息。
 * 这与设计文档中「真正增量摘要」对齐——增量压缩只摘要上次未覆盖的新消息。
 * @param messages - 全量消息列表
 * @param currentSummary - 当前有效摘要
 * @param currentUserMessageId - 当前用户消息 ID（若提供则排除）
 * @returns 增量窗口内的消息列表
 */
function resolveIncrementalWindow(messages: Message[], currentSummary: ConversationSummaryRecord | undefined, currentUserMessageId?: string): Message[] {
  if (!currentSummary) {
    return messages.filter((message) => message.id !== currentUserMessageId);
  }

  // 从上一条摘要覆盖的最后一条消息之后开始
  const startIndex = messages.findIndex((message) => message.id === currentSummary.coveredEndMessageId);
  const tailMessages = startIndex >= 0 ? messages.slice(startIndex + 1) : messages;
  return tailMessages.filter((message) => message.id !== currentUserMessageId);
}

/**
 * 基于摘要边界拆分穿透消息和近期原文消息。
 * @param messages - 全量消息列表
 * @param currentUserMessageId - 当前用户消息 ID
 * @param summaryRecord - 当前有效摘要
 * @returns 组装上下文所需的消息分段
 */
function splitMessagesForAssembly(messages: Message[], currentUserMessageId: string, summaryRecord?: ConversationSummaryRecord) {
  const messagesWithoutCurrent = messages.filter((message) => message.id !== currentUserMessageId);
  if (!summaryRecord) {
    return {
      preservedMessages: [],
      recentMessages: messagesWithoutCurrent
    };
  }

  const preservedIdSet = new Set(summaryRecord.preservedMessageIds);
  const preservedMessages = messages.filter((message) => preservedIdSet.has(message.id));
  const coveredIndex = messages.findIndex((message) => message.id === summaryRecord.coveredUntilMessageId);
  const boundaryMessages = coveredIndex >= 0 ? messages.slice(coveredIndex + 1) : messagesWithoutCurrent;
  const recentMessages = boundaryMessages.filter((message) => {
    return message.id !== currentUserMessageId && !preservedIdSet.has(message.id);
  });

  return {
    preservedMessages,
    recentMessages
  };
}

/**
 * 为上下文预算估算解析需要注入的摘要集合。
 * 当摘要属于多段摘要集时，需要按与真实发送一致的召回规则取回相关 segment。
 * @param currentUserMessage - 当前用户消息
 * @param summaryRecord - 当前摘要记录
 * @param storage - 摘要存储层
 * @returns 用于组装的多段摘要列表
 */
async function resolveSummaryRecordsForAssembly(
  currentUserMessage: Message,
  summaryRecord: ConversationSummaryRecord | undefined,
  storage: SummaryStorage
): Promise<ConversationSummaryRecord[] | undefined> {
  if (!summaryRecord?.summarySetId || (summaryRecord.segmentCount ?? 1) <= 1) {
    return undefined;
  }

  const allSummaries = await storage.getAllSummaries(summaryRecord.sessionId);
  const validSummaryRecords = allSummaries
    .filter((item) => item.summarySetId === summaryRecord.summarySetId && item.status === 'valid')
    .sort((a, b) => (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0));

  return selectRelevantSegments(currentUserMessage, validSummaryRecords, {
    maxSegments: 3,
    maxSummaryTokens: 2000,
    alwaysIncludeRecentSegment: true
  });
}

/**
 * 估算工具定义的字符体积。
 * @param toolDefinitions - 工具定义列表
 * @returns 字符体积
 */
function estimateToolDefinitionsCharCount(toolDefinitions?: unknown[]): number {
  if (!toolDefinitions || toolDefinitions.length === 0) {
    return 0;
  }
  return JSON.stringify(toolDefinitions).length;
}

/**
 * 解析当前模型的上下文窗口大小。
 * @param providerId - 提供商 ID
 * @param modelId - 模型 ID
 * @returns 模型上下文窗口，未知时返回 undefined
 */
async function resolveModelContextWindow(providerId: string | undefined, modelId: string | undefined): Promise<number | undefined> {
  if (!providerId || !modelId) {
    return undefined;
  }

  const provider = await providerStorage.getProvider(providerId);
  const model = provider?.models?.find((item) => item.id === modelId);
  const contextWindow = model?.contextWindow;

  return contextWindow && contextWindow > 0 ? contextWindow : undefined;
}

/**
 * buildMultiSegmentSummary 参数集合。
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
  /** 当前有效摘要 */
  currentSummary?: ConversationSummaryRecord;
  /** 消息分类结果 */
  classification: ReturnType<typeof planCompression>;
  /** 话题分段结果 */
  segments: TopicSegment[];
  /** 当前用户消息 ID（若提供则排除） */
  currentUserMessageId?: string;
  /** 降级原因（全量重建截断时降级为增量） */
  degradeReason?: 'degraded_to_incremental';
}

/**
 * 生成多段摘要记录。
 * 每段独立生成摘要，共享同一个 summarySetId。
 */
async function buildMultiSegmentSummary(params: BuildMultiSegmentSummaryParams): Promise<BuildSummaryResult | undefined> {
  const { storage, sessionId, messages, buildMode, triggerReason, currentSummary, classification, segments, degradeReason } = params;
  const summarySetId = `set-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const segmentCount = segments.length;
  const records: ConversationSummaryRecord[] = [];
  try {
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      /* eslint-disable no-await-in-loop -- 多段摘要需要顺序生成（每段依赖上一段上下文） */
      let trimmed: ReturnType<typeof ruleTrim>;
      try {
        trimmed = ruleTrim(segment.messages);
      } catch (error) {
        throw new CompressionError('消息裁剪失败', 'rule_trim', error);
      }

      let structuredSummary: StructuredConversationSummary;
      try {
        structuredSummary = await generateStructuredSummary({
          items: trimmed.items,
          previousSummary:
            i > 0 && records.length > 0
              ? { summaryText: records[records.length - 1].summaryText, structuredSummary: records[records.length - 1].structuredSummary }
              : currentSummary
        });
      } catch (error) {
        throw new CompressionError('AI 摘要生成失败', 'ai_summary', error);
      }

      const summaryText = truncateSummaryText(generateSummaryText(structuredSummary));

      try {
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
      /* eslint-enable no-await-in-loop */
    }

    for (const record of records) {
      /* eslint-disable no-await-in-loop -- 保证摘要集按顺序提升状态 */
      await storage.updateSummaryStatus(record.id, 'valid');
      record.status = 'valid';
      /* eslint-enable no-await-in-loop */
    }

    if (currentSummary) {
      await storage.updateSummaryStatus(currentSummary.id, 'superseded');
    }

    return {
      summaryRecord: records[0],
      classification
    };
  } catch (error) {
    for (const record of records) {
      /* eslint-disable no-await-in-loop -- 失败时逐条回收 draft 记录 */
      await asyncTo(storage.updateSummaryStatus(record.id, 'invalid', 'incomplete_summary_set'));
      // 忽略回收失败，保留原始错误
      /* eslint-enable no-await-in-loop */
    }
    throw error;
  }
}

/**
 * buildSummaryRecord 函数选项
 */
interface BuildSummaryRecordOptions {
  /** 摘要存储 */
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
  /** 需要显式排除的消息 ID */
  excludeMessageIds?: string[];
  /** 降级原因 */
  degradeReason?: 'degraded_to_incremental';
}

/**
 * 生成并持久化摘要记录。
 * @param options - 函数选项
 * @returns 新摘要记录及对应的消息分类结果
 */
async function buildSummaryRecord(options: BuildSummaryRecordOptions): Promise<BuildSummaryResult | undefined> {
  const { storage, sessionId, messages, buildMode, triggerReason, currentSummary, currentUserMessageId, excludeMessageIds, degradeReason } = options;
  // 增量模式或降级到增量的全量重建模式：只压缩上次摘要未覆盖的新消息
  const useIncrementalWindow = buildMode === 'incremental' || degradeReason === 'degraded_to_incremental';
  const windowMessages = useIncrementalWindow
    ? resolveIncrementalWindow(messages, currentSummary, currentUserMessageId)
    : messages.filter((message) => message.id !== currentUserMessageId);

  let classification: ReturnType<typeof planCompression>;
  try {
    classification = planCompression(windowMessages, RECENT_ROUND_PRESERVE, currentUserMessageId, excludeMessageIds);
  } catch (error) {
    throw new CompressionError('消息分类失败', 'planner', error);
  }

  if (classification.compressibleMessages.length === 0) {
    return undefined;
  }

  // 合并文件语义消息和可压缩消息，按原始消息顺序排列以保证 coveredStart/EndMessageId 正确
  const summarizedIdSet = new Set([...classification.fileSemanticMessages.map((m) => m.id), ...classification.compressibleMessages.map((m) => m.id)]);
  const orderedSummarizedMessages = windowMessages.filter((m) => summarizedIdSet.has(m.id));
  const trimInputMessages = orderedSummarizedMessages;

  // 检测是否需要分段（多段摘要）
  const segments = segmentMessages(trimInputMessages, detectTopicBoundaries(trimInputMessages));
  const useMultiSegment = segments.length >= 3 && trimInputMessages.length > 20;

  if (useMultiSegment) {
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
      degradeReason
    });
  }

  let trimmed: ReturnType<typeof ruleTrim>;
  try {
    trimmed = ruleTrim(trimInputMessages);
  } catch (error) {
    throw new CompressionError('消息裁剪失败', 'rule_trim', error);
  }

  // 增量模式下传入上一条摘要作为上下文
  let structuredSummary: StructuredConversationSummary;
  try {
    structuredSummary = await generateStructuredSummary({
      items: trimmed.items,
      previousSummary: useIncrementalWindow ? currentSummary : undefined
    });
  } catch (error) {
    throw new CompressionError('AI 摘要生成失败', 'ai_summary', error);
  }

  const summaryText = truncateSummaryText(generateSummaryText(structuredSummary));
  // 所有进入摘要的消息 ID，保持原始顺序
  const allSummarizedIds = orderedSummarizedMessages.map((m) => m.id);
  // 增量模式下 coveredStartMessageId 从上一条摘要边界之后开始
  const coveredStartMessageId = useIncrementalWindow ? allSummarizedIds[0] ?? currentSummary?.coveredEndMessageId ?? '' : allSummarizedIds[0] ?? '';
  const coveredEndMessageId = allSummarizedIds[allSummarizedIds.length - 1];

  const preservedSet = new Set(classification.preservedMessageIds);
  const lastNonPreserved = findLast(allSummarizedIds, (id) => !preservedSet.has(id));
  const coveredUntilMessageId = lastNonPreserved ?? coveredEndMessageId;

  let summaryRecord: ConversationSummaryRecord;
  try {
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
      messageCountSnapshot: Math.ceil(messages.filter((message) => message.role === 'user' || message.role === 'assistant').length / 2),
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

  return {
    summaryRecord,
    classification
  };
}

/**
 * 组装上下文并返回统一结果格式。
 * 支持多段摘要：当 summaryRecord 是多段摘要的一部分时，检索同 summarySetId 的所有段。
 * @param messages - 全量消息
 * @param currentUserMessage - 当前用户消息
 * @param summaryRecord - 摘要记录
 * @param compressed - 是否已压缩
 * @param storage - 存储层（用于检索多段摘要）
 * @returns 组装后的上下文输出
 */
async function assembleAndReturn(
  messages: Message[],
  currentUserMessage: Message,
  summaryRecord: ConversationSummaryRecord | undefined,
  compressed: boolean,
  storage?: SummaryStorage
): Promise<PrepareMessagesOutput> {
  const { preservedMessages, recentMessages } = splitMessagesForAssembly(messages, currentUserMessage.id, summaryRecord);

  // 多段摘要支持：当 summaryRecord 有 summarySetId 且 segmentCount > 1 时，检索同集所有段
  const summaryRecords = storage ? await resolveSummaryRecordsForAssembly(currentUserMessage, summaryRecord, storage) : undefined;

  const assembled = assembleContext({
    summaryRecord,
    summaryRecords,
    preservedMessages,
    recentMessages,
    currentUserMessage
  });
  return {
    modelMessages: assembled.modelMessages,
    compressed
  };
}

/**
 * 构建上下文预算快照，用于 policy 判断。
 * 支持 token 估算（当 modelId 可用时）和字符级降级。
 * @param messages - 全量消息列表
 * @param currentSummary - 当前有效摘要
 * @param currentUserMessage - 当前用户消息
 * @param storage - 摘要存储层（用于读取多段摘要）
 * @param providerId - 当前提供商 ID
 * @param modelId - 当前模型 ID（可选）
 * @param toolDefinitions - 当前请求附带的工具定义
 * @returns ContextBudgetSnapshot
 */
export async function buildContextBudgetSnapshot(
  messages: Message[],
  currentSummary: ConversationSummaryRecord | undefined,
  currentUserMessage: Message,
  storage: SummaryStorage,
  providerId?: string,
  modelId?: string,
  toolDefinitions?: unknown[]
): Promise<ContextBudgetSnapshot> {
  // 计算轮数
  let roundCount: number;
  if (currentSummary && currentSummary.status === 'valid') {
    const preservedIdSet = new Set(currentSummary.preservedMessageIds ?? []);
    const preservedMsgs = messages.filter((m) => preservedIdSet.has(m.id));
    const coveredIndex = messages.findIndex((m) => m.id === currentSummary.coveredUntilMessageId);
    const recentMsgs = coveredIndex >= 0 ? messages.slice(coveredIndex + 1).filter((m) => !preservedIdSet.has(m.id)) : messages;
    roundCount = countMessageRounds([...preservedMsgs, ...recentMsgs]);
  } else {
    roundCount = countMessageRounds(messages);
  }

  // 字符级估算（始终计算），并与真实 assembleContext 的注入形状对齐
  const { preservedMessages, recentMessages } = splitMessagesForAssembly(messages, currentUserMessage.id, currentSummary);
  const summaryRecords = await resolveSummaryRecordsForAssembly(currentUserMessage, currentSummary, storage);
  const assembled = assembleContext({
    summaryRecord: currentSummary,
    summaryRecords,
    preservedMessages,
    recentMessages,
    currentUserMessage
  });
  const charCount = estimateContextSize(assembled.modelMessages) + estimateToolDefinitionsCharCount(toolDefinitions);

  // token 估算（可选）
  let tokenCount: number | undefined;
  let tokenThreshold: number | undefined;
  let tokenAccuracy: ContextBudgetSnapshot['tokenAccuracy'];

  if (modelId) {
    const tokenEstimator = await createTokenEstimator(modelId);
    if (tokenEstimator) {
      tokenCount = tokenEstimator.estimate(assembled.modelMessages);
      if (toolDefinitions && toolDefinitions.length > 0) {
        tokenCount += tokenEstimator.estimateText(JSON.stringify(toolDefinitions));
      }
      const contextWindow = await resolveModelContextWindow(providerId, modelId);
      if (contextWindow) {
        tokenThreshold = computeCompressionTokenThreshold(contextWindow);
      }
      tokenAccuracy = 'native_like';
    } else {
      tokenAccuracy = 'char_fallback';
    }
  }

  return { charCount, tokenCount, tokenThreshold, tokenAccuracy, roundCount };
}

/**
 * 创建压缩协调器。
 * @param storage - 摘要存储层接口
 * @returns 协调器对象
 */
export function createCompressionCoordinator(storage: SummaryStorage) {
  return {
    /**
     * 准备发送前的消息上下文。
     * 根据双阈值判断是否压缩，执行压缩流程，失败时降级到原始上下文。
     * @param input - 准备参数
     * @returns 组装后的模型消息列表和压缩标记
     */
    async prepareMessagesBeforeSend(input: PrepareMessagesInput): Promise<PrepareMessagesOutput> {
      const { sessionId, messages, currentUserMessage, excludeMessageIds, providerId, modelId, toolDefinitions } = input;

      // 获取当前有效摘要
      const currentSummary = await storage.getValidSummary(sessionId);

      // 构建 ContextBudgetSnapshot（支持 token 估算）
      const snapshot = await buildContextBudgetSnapshot(messages, currentSummary, currentUserMessage, storage, providerId, modelId, toolDefinitions);

      // 使用 snapshot 判断是否需要压缩
      const policyResult = evaluateFromSnapshot(snapshot);

      // 如果不需要压缩，直接组装原始上下文
      if (!policyResult.shouldCompress) {
        return assembleAndReturn(messages, currentUserMessage, currentSummary, false, storage);
      }

      // 需要压缩，获取会话锁
      const releaseLock = await acquireSessionLock(sessionId);

      try {
        // 再次检查是否需要压缩（可能在等待锁期间已被其他请求压缩）
        const latestSummary = await storage.getValidSummary(sessionId);
        const latestSnapshot = await buildContextBudgetSnapshot(messages, latestSummary, currentUserMessage, storage, providerId, modelId, toolDefinitions);
        const latestPolicy = evaluateFromSnapshot(latestSnapshot);

        if (!latestPolicy.shouldCompress) {
          return assembleAndReturn(messages, currentUserMessage, latestSummary, false, storage);
        }

        // 执行压缩流程
        try {
          const summaryResult = await buildSummaryRecord({
            storage,
            sessionId,
            messages,
            buildMode: 'incremental',
            triggerReason: policyResult.triggerReason,
            currentSummary: latestSummary,
            currentUserMessageId: currentUserMessage.id,
            excludeMessageIds
          });

          if (!summaryResult) {
            return assembleAndReturn(messages, currentUserMessage, latestSummary, false, storage);
          }

          const savedSummary = summaryResult.summaryRecord;
          return assembleAndReturn(messages, currentUserMessage, savedSummary, true, storage);
        } catch (error) {
          // 压缩失败，降级到原始上下文
          console.error('[压缩] 压缩上下文失败:', error);
          return assembleAndReturn(messages, currentUserMessage, currentSummary, false, storage);
        }
      } finally {
        releaseLock();
      }
    },

    /**
     * 手动触发会话压缩。
     * @param input - 压缩输入参数
     * @returns 新生成的摘要记录；无可压缩内容时返回 undefined
     */
    async compressSessionManually(input: { sessionId: string; messages: Message[] }): Promise<ConversationSummaryRecord | undefined> {
      const { sessionId, messages } = input;
      const releaseLock = await acquireSessionLock(sessionId);

      try {
        const currentSummary = await storage.getValidSummary(sessionId);

        // 手动全量重建时检查输入是否被截断，若截断则降级为增量模式
        // 设计规范：buildMode 仍记为 full_rebuild（用户意图是全量重算），通过 degradeReason 标记执行层降级
        const fullRebuildTrim = ruleTrim(messages);
        const degradeReason = fullRebuildTrim.truncated ? ('degraded_to_incremental' as const) : undefined;

        const summaryResult = await buildSummaryRecord({
          storage,
          sessionId,
          messages,
          buildMode: 'full_rebuild',
          triggerReason: 'manual',
          currentSummary,
          degradeReason
        });
        return summaryResult?.summaryRecord;
      } finally {
        releaseLock();
      }
    }
  };
}
