/**
 * @file useCompression.ts
 * @description 会话压缩管理 hook，提供手动压缩和摘要查看功能。
 */
import type { CompressionBudgetInfo, ConversationSummaryRecord } from '../utils/compression/types';
import type { Message } from '../utils/types';
import { computed, ref, watch } from 'vue';
import { chatSummariesStorage } from '@/shared/storage/chat-summaries';
import { COMPRESSION_CHAR_THRESHOLD } from '../utils/compression/constant';
import { buildContextBudgetSnapshot, createCompressionCoordinator } from '../utils/compression/coordinator';
import { CompressionError, getCompressionErrorMessage } from '../utils/compression/error';
import { COMPRESSION_TOKEN_THRESHOLD } from '../utils/compression/policy';

/**
 * 压缩管理 Hook 的依赖项
 */
interface CompressionOptions {
  /** 获取会话 ID */
  getSessionId: () => string | undefined;
  /** 获取消息列表 */
  getMessages: () => Message[];
  /** 获取当前提供商 ID */
  getProviderId?: () => string | undefined;
  /** 获取当前模型 ID */
  getModelId?: () => string | undefined;
  /** 获取当前请求的工具定义 */
  getToolDefinitions?: () => unknown[] | undefined;
}

/**
 * 创建空用户消息（用于压缩预算占位）
 * @returns 空的用户消息对象
 */
function createEmptyUserMessage(): Message {
  return {
    id: '__compression-budget__',
    role: 'user',
    content: '',
    parts: [{ type: 'text', text: '' }],
    createdAt: new Date().toISOString(),
    loading: false
  };
}

/**
 * 从 snapshot 计算预算展示信息（纯函数，便于独立测试）
 * 预算展示优先使用 token，拿不到 token 时退回字符级估算。
 * @param snapshot - buildContextBudgetSnapshot 的返回值
 * @param summary - 当前会话的摘要记录
 * @returns 预算展示信息
 */
function budgetFromSnapshot(
  snapshot: Awaited<ReturnType<typeof buildContextBudgetSnapshot>>,
  summary: ConversationSummaryRecord | undefined
): CompressionBudgetInfo {
  const unit = snapshot.tokenCount !== undefined ? 'token' : 'char';
  const currentValue = snapshot.tokenCount ?? snapshot.charCount;
  const thresholdValue = snapshot.tokenCount !== undefined ? snapshot.tokenThreshold ?? COMPRESSION_TOKEN_THRESHOLD : COMPRESSION_CHAR_THRESHOLD;
  const percentage = thresholdValue > 0 ? Math.min(100, Math.max(0, (currentValue / thresholdValue) * 100)) : 0;

  return {
    currentValue,
    thresholdValue,
    percentage,
    unit,
    charCount: snapshot.charCount,
    tokenCount: snapshot.tokenCount,
    tokenThreshold: snapshot.tokenThreshold,
    tokenAccuracy: snapshot.tokenAccuracy,
    hasSummary: Boolean(summary),
    summaryMessageCount: summary?.messageCountSnapshot,
    summaryUpdatedAt: summary?.updatedAt
  };
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
  /** 当前摘要 */
  const currentSummary = ref<ConversationSummaryRecord | undefined>();
  /** 压缩错误 */
  const error = ref<string | undefined>();
  /** 当前预算展示信息 */
  const budget = ref<CompressionBudgetInfo | undefined>();

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
   * 加载当前会话的摘要
   */
  async function loadSummary(): Promise<void> {
    const sessionId = getSessionId();
    if (!sessionId) {
      currentSummary.value = undefined;
      return;
    }

    try {
      currentSummary.value = await chatSummariesStorage.getValidSummary(sessionId);
    } catch (err) {
      console.error('[useCompression] Failed to load summary:', err);
      currentSummary.value = undefined;
    }
  }

  /**
   * 刷新当前预算信息。
   * 预算展示优先使用 token，拿不到 token 时退回字符级估算。
   */
  async function refreshBudget(): Promise<void> {
    const sessionId = getSessionId();
    const messages = getMessages();

    if (!sessionId || messages.length === 0) {
      budget.value = undefined;
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const currentUserMessage = lastMessage?.role === 'user' ? lastMessage : createEmptyUserMessage();

    const snapshot = await buildContextBudgetSnapshot(
      messages,
      currentSummary.value,
      currentUserMessage,
      chatSummariesStorage,
      options.getProviderId?.(),
      options.getModelId?.(),
      options.getToolDefinitions?.()
    );

    budget.value = budgetFromSnapshot(snapshot, currentSummary.value);
  }

  /**
   * 加载摘要并刷新预算，消除重复调用配对。
   * session 切换时使用，确保摘要与预算始终同步。
   */
  async function loadAndRefresh(): Promise<void> {
    await loadSummary();
    await refreshBudget();
  }

  /**
   * 手动触发压缩
   * @returns 是否压缩成功
   */
  async function compress(): Promise<boolean> {
    const sessionId = getSessionId();
    if (!sessionId) {
      error.value = '没有活跃的会话';
      return false;
    }

    const messages = getMessages();
    if (messages.length === 0) {
      error.value = '没有可压缩的消息';
      return false;
    }

    compressing.value = true;
    error.value = undefined;

    try {
      const result = await coordinator.value.compressSessionManually({ sessionId, messages });

      if (!result) {
        error.value = '没有可压缩的消息';
        return false;
      }

      // 如果是因体量过大而降级到增量模式，静默处理而非报错
      if (result.degradeReason === 'degraded_to_incremental') {
        error.value = undefined;
      }

      // 重新加载摘要
      await loadAndRefresh();
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      compressing.value = false;
    }
  }

  /**
   * 清除错误
   */
  function clearError(): void {
    error.value = undefined;
  }

  // session 变化：需要重新加载摘要并刷新预算
  watch(() => getSessionId(), loadAndRefresh, { immediate: true });

  // 消息/模型变化：只需刷新预算（摘要不变）
  watch([() => getMessages(), () => options.getProviderId?.(), () => options.getModelId?.(), () => currentSummary.value?.updatedAt], refreshBudget, {
    immediate: true,
    deep: true
  });

  return {
    compressing,
    currentSummary,
    error,
    budget,
    compress,
    loadSummary,
    refreshBudget,
    clearError
  };
}
