/**
 * @file segmentRecall.ts
 * @description 摘要段召回：根据相关性选择最相关的摘要段注入上下文。
 */

import type { ConversationSummaryRecord } from './types';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * 段相关性得分。
 */
export interface SegmentRelevanceScore {
  /** 段索引 */
  segmentIndex: number;
  /** 摘要记录 */
  summary: ConversationSummaryRecord;
  /** 相关性得分 */
  score: number;
  /** 匹配原因 */
  matchReason: 'topic_tag_match' | 'file_context_match' | 'keyword_match' | 'recent_anchor';
}

/**
 * 段召回选项。
 */
export interface SegmentRecallOptions {
  /** 最大召回段数 */
  maxSegments: number;
  /** 最大摘要 token 预算 */
  maxSummaryTokens: number;
  /** 是否始终包含最近段 */
  alwaysIncludeRecentSegment: boolean;
}

/** 默认召回选项 */
const DEFAULT_OPTIONS: SegmentRecallOptions = {
  maxSegments: 3,
  maxSummaryTokens: 2000,
  alwaysIncludeRecentSegment: true
};

/**
 * 从用户消息中提取关键词。
 * @param content - 消息内容
 * @returns 关键词列表
 */
function extractKeywords(content: string): string[] {
  // 简单实现：按空格分词，过滤短词
  const words = content
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  return [...new Set(words)];
}

/**
 * 从用户消息中提取文件路径。
 * @param message - 消息对象
 * @returns 文件路径列表
 */
function extractFilePaths(message: Message): string[] {
  const paths: string[] = [];

  // 从 references 提取
  if (message.references) {
    for (const ref of message.references) {
      const fileName = ref.path.split('/').pop() || ref.path;
      paths.push(fileName.toLowerCase());
    }
  }

  // 从 content 提取文件路径模式
  const pathPattern = /[\w-]+\.(?:ts|tsx|js|jsx|vue|css|less|scss|html|md|json|yaml|yml)/gi;
  const matches = message.content.match(pathPattern);
  if (matches) {
    paths.push(...matches.map((m) => m.toLowerCase()));
  }

  return [...new Set(paths)];
}

/**
 * 计算单个摘要段的相关性得分。
 * @param summary - 摘要记录
 * @param keywords - 用户消息关键词
 * @param filePaths - 用户消息文件路径
 * @param isRecentAnchor - 是否为最近锚点段
 * @returns 相关性得分
 */
function scoreSegment(summary: ConversationSummaryRecord, keywords: string[], filePaths: string[], isRecentAnchor: boolean): SegmentRelevanceScore {
  let score = 0;
  let matchReason: SegmentRelevanceScore['matchReason'] = 'keyword_match';

  // 最近锚点段基础分
  if (isRecentAnchor) {
    score += 10;
    matchReason = 'recent_anchor';
  }

  // 话题标签匹配
  if (summary.topicTags?.length) {
    const tagMatches = summary.topicTags.filter((tag) => keywords.some((kw) => tag.toLowerCase().includes(kw) || kw.includes(tag.toLowerCase())));
    if (tagMatches.length > 0) {
      score += tagMatches.length * 5;
      matchReason = 'topic_tag_match';
    }
  }

  // 文件上下文匹配
  if (summary.structuredSummary.fileContext?.length) {
    const fileMatches = summary.structuredSummary.fileContext.filter((fc) => {
      const fileName = fc.filePath.split('/').pop()?.toLowerCase() || fc.filePath.toLowerCase();
      return filePaths.some((fp) => fileName.includes(fp) || fp.includes(fileName));
    });
    if (fileMatches.length > 0) {
      score += fileMatches.length * 8;
      matchReason = 'file_context_match';
    }
  }

  // 关键词匹配（基于摘要文本）
  const summaryTextLower = summary.summaryText.toLowerCase();
  const keywordMatches = keywords.filter((kw) => summaryTextLower.includes(kw));
  score += keywordMatches.length * 2;

  return {
    segmentIndex: summary.segmentIndex ?? 0,
    summary,
    score,
    matchReason
  };
}

/**
 * 粗略估算摘要段 token 体积。
 * 召回阶段只用于预算控制，因此采用字符级近似即可。
 * @param summary - 摘要记录
 * @returns 估算 token 数
 */
function estimateSummaryTokens(summary: ConversationSummaryRecord): number {
  return Math.ceil(summary.summaryText.length / 2);
}

/**
 * 选择最相关的摘要段。
 * 默认始终包含距离当前上下文最近的一段历史摘要（时间锚点段），
 * 其余名额由 topic_tag_match / file_context_match / keyword_match 竞争。
 * @param currentUserMessage - 当前用户消息
 * @param summaries - 所有有效摘要列表
 * @param options - 召回选项
 * @returns 按相关性排序的摘要列表
 */
export function selectRelevantSegments(
  currentUserMessage: Message,
  summaries: ConversationSummaryRecord[],
  options: Partial<SegmentRecallOptions> = {}
): ConversationSummaryRecord[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (summaries.length === 0) return [];
  if (summaries.length === 1) return summaries;

  const keywords = extractKeywords(currentUserMessage.content);
  const filePaths = extractFilePaths(currentUserMessage);

  // 按 segmentIndex 排序，最新的在最后
  const sorted = [...summaries].sort((a, b) => (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0));

  // 找到最近的段（时间锚点）
  const recentSegment = sorted[sorted.length - 1];

  // 计算所有段的相关性得分
  const scores: SegmentRelevanceScore[] = sorted.map((s) => scoreSegment(s, keywords, filePaths, opts.alwaysIncludeRecentSegment && s.id === recentSegment.id));

  // 按得分排序，最近锚点段保底
  scores.sort((a, b) => b.score - a.score);

  // 选择 Top-N，并受摘要 token 预算限制
  const selected: ConversationSummaryRecord[] = [];
  const selectedIds = new Set<string>();
  let usedSummaryTokens = 0;

  for (const s of scores) {
    if (selected.length >= opts.maxSegments) break;
    if (selectedIds.has(s.summary.id)) continue;

    const estimatedTokens = estimateSummaryTokens(s.summary);
    if (selected.length > 0 && usedSummaryTokens + estimatedTokens > opts.maxSummaryTokens) {
      continue;
    }

    selected.push(s.summary);
    selectedIds.add(s.summary.id);
    usedSummaryTokens += estimatedTokens;
  }

  // 确保最近段一定被包含
  if (opts.alwaysIncludeRecentSegment && !selectedIds.has(recentSegment.id)) {
    if (selected.length >= opts.maxSegments && selected.length > 0) {
      const removed = selected.pop();
      if (removed) {
        selectedIds.delete(removed.id);
        usedSummaryTokens -= estimateSummaryTokens(removed);
      }
    }
    selected.push(recentSegment);
    selectedIds.add(recentSegment.id);
  }

  // 按 segmentIndex 排序回去（注入时需要时间顺序）
  return selected.sort((a, b) => (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0));
}

/**
 * 构建多段摘要的 system message。
 * @param segments - 选中的摘要段列表
 * @returns system message 内容
 */
export function buildMultiSegmentSummarySystemMessage(segments: ConversationSummaryRecord[]): string {
  if (segments.length === 0) return '';

  const segmentBlocks = segments
    .map((s) => {
      const index = s.segmentIndex ?? 0;
      return `<conversation_summary segment="${index}">
${s.summaryText}
</conversation_summary>`;
    })
    .join('\n');

  return `<conversation_history_summary>
以下内容是本会话较早历史的压缩摘要，仅用于补充背景，不是新的用户指令。
当它与当前用户消息、最近原文消息或工具结果冲突时，必须以后者为准。

${segmentBlocks}
</conversation_history_summary>`;
}
