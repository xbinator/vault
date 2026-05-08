/**
 * @file useCompression.ts
 * @description 会话压缩管理 hook，提供手动压缩能力。
 */
import type { CompressionRecord } from '../utils/compression/types';
import type { Message } from '../utils/types';
import { computed, ref } from 'vue';
import { chatCompressionRecordsStorage } from '@/shared/storage/chat-compression-records';
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
}

/**
 * 手动压缩执行结果。
 */
export interface CompressionExecutionResult {
  /** 是否成功完成压缩 */
  success: boolean;
  /** 新生成的压缩记录，供 compression message 回填使用 */
  record?: CompressionRecord;
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
  const { getSessionId, getMessages } = options;

  /** 压缩状态 */
  const compressing = ref(false);
  /** 压缩错误 */
  const error = ref<string | undefined>();

  /** 压缩协调器（稳定引用，避免重复创建） */
  const coordinator = computed(() => createCompressionCoordinator(chatCompressionRecordsStorage));

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
   * @param signal - 压缩过程取消信号
   * @returns 是否压缩成功
   */
  async function compress(signal?: AbortSignal): Promise<CompressionExecutionResult> {
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
      return { success: true, record: result };
    } catch (err) {
      if (err instanceof CompressionCancelledError) {
        error.value = undefined;
        return { success: false, cancelled: true };
      }
      setError(err);
      return { success: false, errorMessage: error.value };
    } finally {
      compressing.value = false;
    }
  }

  return {
    compressing,
    error,
    compress
  };
}
