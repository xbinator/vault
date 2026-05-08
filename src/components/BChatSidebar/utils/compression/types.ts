/**
 * @file types.ts
 * @description 上下文压缩模块类型定义，包含压缩记录结构、策略结果与存储接口。
 */
import type { Message } from '@/components/BChatSidebar/utils/types';

// ─── 摘要构建模式 ─────────────────────────────────────────────────────────────

/** 压缩记录构建模式 */
export type CompressionBuildMode = 'incremental' | 'full_rebuild';

// ─── 压缩状态 ─────────────────────────────────────────────────────────────────

/** 压缩记录状态 */
export type CompressionRecordStatus = 'draft' | 'valid' | 'superseded' | 'invalid';

// ─── 触发原因 ─────────────────────────────────────────────────────────────────

/** 压缩触发原因 */
export type TriggerReason = 'message_count' | 'context_size' | 'manual';

// ─── 文件上下文摘要 ──────────────────────────────────────────────────────────

/**
 * 文件上下文摘要，记录历史文件引用的关键信息。
 */
export interface FileContextSummary {
  /** 文件路径 */
  filePath: string;
  /** 起始行号 */
  startLine?: number;
  /** 结束行号 */
  endLine?: number;
  /** 用户操作意图描述 */
  userIntent: string;
  /** 关键摘录摘要 */
  keySnippetSummary: string;
  /** 后续是否需要按需重新加载原文 */
  shouldReloadOnDemand: boolean;
}

// ─── 结构化摘要 ──────────────────────────────────────────────────────────────

/**
 * 结构化会话摘要，由 AI 摘要模型产出。
 */
export interface StructuredConversationSummary {
  /** 用户目标 */
  goal: string;
  /** 最近话题 */
  recentTopic: string;
  /** 用户偏好列表 */
  userPreferences: string[];
  /** 约束条件列表 */
  constraints: string[];
  /** 已做出的决策列表 */
  decisions: string[];
  /** 重要事实列表 */
  importantFacts: string[];
  /** 文件上下文摘要列表 */
  fileContext: FileContextSummary[];
  /** 待解决问题列表 */
  openQuestions: string[];
  /** 待处理操作列表 */
  pendingActions: string[];
}

// ─── 摘要记录 ────────────────────────────────────────────────────────────────

/**
 * 会话压缩记录持久化对象。
 */
export interface CompressionRecord {
  /** 压缩记录唯一标识 */
  id: string;
  /** 所属会话 ID */
  sessionId: string;
  /** 压缩记录构建模式 */
  buildMode: CompressionBuildMode;
  /** 继承的上一条压缩记录 ID（增量模式下使用） */
  derivedFromRecordId?: string;
  /** 压缩记录覆盖区间起点消息 ID */
  coveredStartMessageId: string;
  /** 压缩记录覆盖区间终点消息 ID（记录实际分析到的最后一条消息） */
  coveredEndMessageId: string;
  /** 上下文截断边界消息 ID（ID 在此之后的消息作为原文注入） */
  coveredUntilMessageId: string;
  /** 实际进入压缩记录的消息 ID 列表 */
  sourceMessageIds: string[];
  /** 位于覆盖区间内但必须原文穿透的消息 ID 列表 */
  preservedMessageIds: string[];
  /** 可读压缩记录文本 */
  recordText: string;
  /** 结构化摘要内容 */
  structuredSummary: StructuredConversationSummary;
  /** 触发原因 */
  triggerReason: TriggerReason;
  /** 生成时的消息轮数快照 */
  messageCountSnapshot: number;
  /** 生成时的字符体积快照 */
  charCountSnapshot: number;
  /** 生成时的 token 体积快照（第三阶段） */
  tokenCountSnapshot?: number;
  /** 压缩记录 schema 版本 */
  schemaVersion: number;
  /** 压缩记录状态 */
  status: CompressionRecordStatus;
  /** 失效原因 */
  invalidReason?: string;
  /** 降级原因（手动压缩触发体量降级时记录） */
  degradeReason?: 'degraded_to_incremental';
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 记录集标识，同一次生成的多个 segment 共享同一个 recordSetId（多段压缩） */
  recordSetId?: string;
  /** 记录分段索引，从 0 开始，同一记录集内按时间顺序递增（多段压缩） */
  segmentIndex?: number;
  /** 本次记录集的总段数（多段压缩） */
  segmentCount?: number;
  /** 记录主题标签，由 AI 摘要模型生成（多段压缩） */
  topicTags?: string[];
  /** 记录相关性向量（预留） */
  relevanceEmbedding?: number[];
}

/**
 * 上下文预算快照，用于 policy 判断。
 */
export interface ContextBudgetSnapshot {
  /** 字符级体积估算 */
  charCount: number;
  /** token 级体积估算（可选，tokenizer 不可用时为 undefined） */
  tokenCount?: number;
  /** 本次评估使用的 token 阈值（可选，优先于默认固定阈值） */
  tokenThreshold?: number;
  /** token 估算精度等级 */
  tokenAccuracy?: 'native_like' | 'approximate' | 'char_fallback';
  /** 消息轮数 */
  roundCount: number;
}

// ─── 压缩计划 ─────────────────────────────────────────────────────────────────

/**
 * Policy 模块输出的压缩策略判断结果。
 */
export interface CompressionPolicyResult {
  /** 是否应该触发压缩 */
  shouldCompress: boolean;
  /** 触发原因 */
  triggerReason: TriggerReason;
  /** 当前消息轮数 */
  roundCount: number;
  /** 当前上下文字符估算体积 */
  charCount: number;
  /** 当前上下文 token 估算体积（第三阶段） */
  tokenCount?: number;
  /** 当前有效压缩记录（若有） */
  currentRecord?: CompressionRecord;
}

// ─── 消息分类 ─────────────────────────────────────────────────────────────────

/**
 * Planner 模块输出的消息切分结果。
 */
export interface MessageClassificationResult {
  /** 必须保留原文的消息列表（最近窗口 + 未完成交互） */
  preservedMessages: Message[];
  /** 保留轻量文件语义的历史消息列表 */
  fileSemanticMessages: Message[];
  /** 可进入摘要的消息列表 */
  compressibleMessages: Message[];
  /** 必须原文穿透的消息 ID 列表（在压缩覆盖区间内但必须保留原文） */
  preservedMessageIds: string[];
}

// ─── 摘要构建结果 ─────────────────────────────────────────────────────────────

/**
 * buildCompressionRecord / buildMultiSegmentSummary 的返回值类型。
 */
export interface BuildCompressionRecordResult {
  /** 新生成的压缩记录 */
  compressionRecord: CompressionRecord;
  /** 消息分类结果 */
  classification: MessageClassificationResult;
}

// ─── 规则裁剪 ─────────────────────────────────────────────────────────────────

/**
 * 规则裁剪后的一条压缩消息项。
 */
export interface TrimmedMessageItem {
  /** 原始消息 ID */
  messageId: string;
  /** 消息角色 */
  role: 'user' | 'assistant';
  /** 裁剪后的文本内容 */
  trimmedText: string;
}

/**
 * 结构化摘要生成器的输入参数。
 */
export interface GenerateStructuredSummaryInput {
  /** 规则裁剪后的消息项列表 */
  items: TrimmedMessageItem[];
  /** 上一条压缩记录（增量模式下传入） */
  previousRecord?: Pick<CompressionRecord, 'recordText' | 'structuredSummary'>;
}

/**
 * Summarizer 规则裁剪阶段的输出。
 */
export interface RuleTrimResult {
  /** 裁剪后的消息项列表 */
  items: TrimmedMessageItem[];
  /** 裁剪后的总字符数 */
  charCount: number;
  /** 是否触发了硬截断 */
  truncated: boolean;
}

// ─── 存储层接口 ───────────────────────────────────────────────────────────────

/**
 * 压缩记录存储层接口。
 */
export interface CompressionRecordStorage {
  /** 获取会话的最新有效压缩记录 */
  getLatestValidRecord(sessionId: string): Promise<CompressionRecord | undefined>;
  /** 创建压缩记录 */
  createRecord(record: Omit<CompressionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<CompressionRecord>;
  /** 更新压缩记录状态 */
  updateRecordStatus(id: string, status: CompressionRecordStatus, invalidReason?: string): Promise<void>;
  /** 获取会话的所有压缩记录 */
  getAllRecords(sessionId: string): Promise<CompressionRecord[]>;
}
