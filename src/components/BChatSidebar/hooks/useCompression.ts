/**
 * @file useCompression.ts
 * @description 会话压缩管理 hook，提供手动压缩能力。
 */
import type { ConversationSummaryRecord } from '../utils/compression/types';
import type { Message } from '../utils/types';
import { computed, ref } from 'vue';
import { chatSummariesStorage } from '@/shared/storage/chat-summaries';
import { createCompressionCoordinator } from '../utils/compression/coordinator';
import { CompressionCancelledError, CompressionError, getCompressionErrorMessage } from '../utils/compression/error';

/**
 * 压缩管理 Hook 的依赖项
 */
interface CompressionOptions {
  /** 获取会话 ID */
  getSessionId: () => string | undefined;
  /** 获取消息列表 */
  getMessages: () => Message[];
  /** 开始压缩任务并返回取消信号 */
  beginCompressionTask: (onAbort?: () => void) => AbortSignal | undefined;
  /** 结束压缩任务 */
  finishCompressionTask: () => void;
}

/**
 * 手动压缩执行结果。
 */
export interface CompressionExecutionResult {
  /** 是否成功完成压缩 */
  success: boolean;
  /** 新生成的摘要记录 */
  summary?: ConversationSummaryRecord;
  /** 错误信息 */
  errorMessage?: string;
  /** 是否为用户主动取消 */
  cancelled?: boolean;
}

/**
 * 压缩管理 hook
 * @param options - 依赖项配置
 * @returns 压缩状态和操作方法
 */
export function useCompression(options: CompressionOptions) {
  const { getSessionId, getMessages, beginCompressionTask, finishCompressionTask } = options;

  /** 压缩状态 */
  const compressing = ref(false);
  /** 压缩错误 */
  const error = ref<string | undefined>();

  /** 压缩协调器（稳定引用，避免重复创建） */
  const coordinator = computed(() => createCompressionCoordinator(chatSummariesStorage));

  /**
   * 统一设置错误信息
   * @param err - 捕获到的异常
   */
  function setError(err: unknown): void {
    if (err instanceof CompressionError) {
      error.value = getCompressionErrorMessage(err.stage);
    } else {
      error.value = err instanceof Error ? err.message : '压缩失败';
    }
  }

  /**
   * 手动触发压缩
   * @param callbacks - 压缩过程回调
   * @returns 是否压缩成功
   */
  async function compress(callbacks?: { onAbort?: () => void }): Promise<CompressionExecutionResult> {
    const sessionId = getSessionId();
    if (!sessionId) {
      error.value = '没有活跃的会话';
      return { success: false, errorMessage: error.value };
    }

    const messages = getMessages();
    if (messages.length === 0) {
      error.value = '没有可压缩的消息';
      return { success: false, errorMessage: error.value };
    }

    compressing.value = true;
    error.value = undefined;
    const signal = beginCompressionTask(callbacks?.onAbort);

    try {
      const result = await coordinator.value.compressSessionManually({ sessionId, messages, signal });

      if (!result) {
        error.value = '没有可压缩的消息';
        return { success: false, errorMessage: error.value };
      }

      // 如果是因体量过大而降级到增量模式，静默处理而非报错
      if (result.degradeReason === 'degraded_to_incremental') {
        error.value = undefined;
      }
      return { success: true, summary: result };
    } catch (err) {
      if (err instanceof CompressionCancelledError) {
        error.value = undefined;
        return { success: false, cancelled: true };
      }
      setError(err);
      return { success: false, errorMessage: error.value };
    } finally {
      compressing.value = false;
      finishCompressionTask();
    }
  }

  return {
    compressing,
    error,
    compress
  };
}
