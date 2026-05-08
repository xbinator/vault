/**
 * @file error.ts
 * @description 压缩模块结构化错误类型和事件通知机制。
 */
/* eslint-disable max-classes-per-file */

/**
 * 压缩失败阶段
 */
export type CompressionStage = 'policy' | 'planner' | 'rule_trim' | 'ai_summary' | 'storage' | 'lock';

/**
 * 结构化压缩错误，携带失败阶段信息用于生成用户提示。
 */
export class CompressionError extends Error {
  constructor(message: string, public readonly stage: CompressionStage, public readonly cause?: unknown) {
    super(message);
    this.name = 'CompressionError';
  }
}

/**
 * 用户主动取消压缩任务时抛出的受控错误。
 */
export class CompressionCancelledError extends Error {
  constructor() {
    super('Compression cancelled');
    this.name = 'CompressionCancelledError';
  }
}

/**
 * 压缩阶段到用户提示的映射。
 */
const STAGE_ERROR_MESSAGES: Record<CompressionStage, string> = {
  policy: '上下文评估失败，已继续使用原始上下文',
  planner: '消息分类失败，已继续使用原始上下文',
  rule_trim: '消息裁剪失败，已继续使用原始上下文',
  ai_summary: 'AI 摘要生成失败，已继续使用原始上下文',
  storage: '摘要保存失败，已继续使用原始上下文',
  lock: '压缩任务冲突，请稍后重试'
};

/**
 * 获取压缩错误的用户提示。
 * @param stage - 失败阶段
 * @returns 用户可读的错误提示
 */
export function getCompressionErrorMessage(stage: CompressionStage): string {
  return STAGE_ERROR_MESSAGES[stage];
}

// ─── 轻量事件通知机制 ─────────────────────────────────────────────────────

export type CompressionEventType = 'auto_compressed' | 'auto_compress_failed';

export interface CompressionEvent {
  type: CompressionEventType;
  message?: string;
}

type CompressionEventListener = (event: CompressionEvent) => void;

const listeners: CompressionEventListener[] = [];

/**
 * 注册压缩事件监听器。
 * @param listener - 事件监听函数
 * @returns 取消注册的函数
 */
export function onCompressionEvent(listener: CompressionEventListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };
}

/**
 * 触发压缩事件。
 * @param event - 事件对象
 */
export function emitCompressionEvent(event: CompressionEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error('[CompressionEvent] Listener error:', err);
    }
  }
}
