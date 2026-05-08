/**
 * @file useCompactContext.ts
 * @description 手动上下文压缩命令 hook，负责 pending 压缩消息的创建、回填、提示反馈以及实际压缩执行。
 */
import type { CompressionRecord } from '../utils/compression/types';
import type { Message } from '../utils/types';
import type { ChatCompressionStatus } from 'types/chat';
import type { Ref } from 'vue';
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import { chatCompressionRecordsStorage } from '@/shared/storage/chat-compression-records';
import { createCompressionCoordinator } from '../utils/compression/coordinator';
import { CompressionCancelledError, CompressionError, getCompressionErrorMessage } from '../utils/compression/error';
import { createBase } from '../utils/messageHelper';

/**
 * 手动压缩执行结果。
 */
interface CompressionExecutionResult {
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
 * 压缩边界消息的公共字段
 */
interface CompressionBoundaryMessageBase {
  /** 压缩边界消息内容 */
  boundaryText: string;
  /** 压缩记录 ID */
  recordId?: string;
  /** 覆盖范围结束消息 ID */
  coveredUntilMessageId?: string;
  /** 压缩源消息 ID 列表 */
  sourceMessageIds?: string[];
}

/**
 * 创建压缩成功边界消息的输入参数
 */
interface CreateSuccessfulCompressionBoundaryMessageInput extends CompressionBoundaryMessageBase {
  /** 压缩记录的唯一标识 */
  recordId: string;
}

/**
 * 创建压缩消息的输入参数
 */
interface CreateCompressionMessageInput extends CompressionBoundaryMessageBase {
  /** 压缩状态 */
  status: ChatCompressionStatus;
  /** 压缩失败提示 */
  errorMessage?: string;
}

/**
 * 手动上下文压缩 hook 的依赖项。
 */
interface UseCompactContextOptions {
  /** 当前消息列表 */
  messages: Ref<Message[]>;
  /** 获取活跃会话 ID */
  getSessionId: () => string | undefined;
  /** 启动压缩任务 */
  beginCompactTask: (onAbort?: () => void) => { ok: boolean; signal?: AbortSignal; reason?: 'busy' };
  /** 结束压缩任务 */
  finishCompactTask: () => void;
  /** 持久化新增的压缩消息 */
  persistMessage: (sessionId: string, nextMessage: Message) => Promise<void>;
  /** 持久化当前完整消息列表 */
  persistMessages: (sessionId: string | undefined, nextMessages: Message[]) => Promise<void>;
  /** 将对话滚动到底部 */
  scrollToBottom: () => void;
}

/**
 * 兼容测试与调用方的压缩消息创建入口。
 * @param input - 压缩消息数据
 * @returns 压缩消息
 */
export function createCompressionMessage(input: CreateCompressionMessageInput): Message {
  return createBase({
    role: 'compression',
    content: input.boundaryText,
    parts: input.boundaryText ? [{ type: 'text', text: input.boundaryText }] : [],
    compression: {
      status: input.status,
      recordText: input.boundaryText,
      recordId: input.recordId,
      coveredUntilMessageId: input.coveredUntilMessageId,
      sourceMessageIds: input.sourceMessageIds,
      errorMessage: input.errorMessage
    },
    finished: input.status !== 'pending',
    loading: input.status === 'pending'
  });
}

/**
 * 创建待处理中的压缩消息。
 * @returns pending 状态的压缩消息
 */
function createPendingCompressionMessage(): Message {
  return createCompressionMessage({
    boundaryText: '正在压缩上下文…',
    status: 'pending'
  });
}

/**
 * 创建压缩成功消息。
 * @param input - 压缩成功所需的边界信息
 * @returns success 状态的压缩边界消息
 */
function createSuccessfulCompressionMessage(input: CreateSuccessfulCompressionBoundaryMessageInput): Message {
  return createCompressionMessage({
    boundaryText: input.boundaryText,
    status: 'success',
    recordId: input.recordId,
    coveredUntilMessageId: input.coveredUntilMessageId,
    sourceMessageIds: input.sourceMessageIds
  });
}

/**
 * 创建压缩失败消息。
 * @param errorMessage - 失败提示
 * @returns failed 状态的压缩消息
 */
function createFailedCompressionMessage(errorMessage: string): Message {
  return createCompressionMessage({
    boundaryText: '上下文压缩失败',
    status: 'failed',
    errorMessage
  });
}

/**
 * 创建压缩取消消息。
 * @returns cancelled 状态的压缩消息
 */
function createCancelledCompressionMessage(): Message {
  return createCompressionMessage({
    boundaryText: '',
    status: 'cancelled'
  });
}

/**
 * 手动上下文压缩 hook。
 * @param options - hook 依赖项
 * @returns 手动压缩命令处理函数
 */
export function useCompactContext(options: UseCompactContextOptions) {
  const { messages, getSessionId, beginCompactTask, finishCompactTask, persistMessage, persistMessages, scrollToBottom } = options;

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
   * 执行会话压缩。
   * @param signal - 压缩过程取消信号
   * @returns 压缩执行结果
   */
  async function compress(signal?: AbortSignal): Promise<CompressionExecutionResult> {
    const sessionId = getSessionId();
    if (!sessionId) {
      error.value = '没有活跃的会话';
      return { success: false, errorMessage: error.value };
    }

    if (messages.value.length === 0) {
      error.value = '没有可压缩的消息';
      return { success: false, errorMessage: error.value };
    }

    compressing.value = true;
    error.value = undefined;

    try {
      const result = await coordinator.value.compressSessionManually({ sessionId, messages: messages.value, signal });

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

  /**
   * 将压缩消息的最新状态同步回消息列表与持久化存储。
   * @param messageId - 目标压缩消息 ID
   * @param nextMessage - 最新压缩消息内容
   */
  async function updateCompressionMessage(messageId: string, nextMessage: Message): Promise<void> {
    const targetMessage = messages.value.find((item) => item.id === messageId);
    if (!targetMessage) {
      return;
    }

    targetMessage.content = nextMessage.content;
    targetMessage.parts = nextMessage.parts;
    targetMessage.loading = nextMessage.loading;
    targetMessage.finished = nextMessage.finished;
    targetMessage.compression = nextMessage.compression;

    await persistMessages(getSessionId(), messages.value);
  }

  /**
   * 根据压缩执行结果构建对应的压缩边界消息。
   * @param result - 压缩执行结果
   * @returns 对应状态的压缩边界消息
   */
  function buildCompressionBoundaryMessage(result: CompressionExecutionResult): Message {
    if (result.success && result.record) {
      return createSuccessfulCompressionMessage({
        boundaryText: result.record.recordText,
        recordId: result.record.id,
        coveredUntilMessageId: result.record.coveredUntilMessageId,
        sourceMessageIds: result.record.sourceMessageIds
      });
    }

    if (result.cancelled) {
      return createCancelledCompressionMessage();
    }

    return createFailedCompressionMessage(result.errorMessage ?? '压缩失败');
  }

  /**
   * 处理 slash command 触发的手动上下文压缩。
   */
  async function handleCompactContext(): Promise<void> {
    const sessionId = getSessionId();
    if (!sessionId) {
      message.error('没有活跃的会话');
      return;
    }

    if (messages.value.length === 0) {
      message.error('没有可压缩的消息');
      return;
    }

    const pendingMessage = createPendingCompressionMessage();
    const task = beginCompactTask(() => {
      updateCompressionMessage(pendingMessage.id, createCancelledCompressionMessage()).catch(() => undefined);
    });
    if (!task.ok) {
      message.info('当前有任务正在执行，请先等待完成或停止当前任务');
      return;
    }
    try {
      messages.value.push(pendingMessage);
      await persistMessage(sessionId, pendingMessage);
      scrollToBottom();

      const result = await compress(task.signal);
      await updateCompressionMessage(pendingMessage.id, buildCompressionBoundaryMessage(result));
    } finally {
      finishCompactTask();
    }
  }

  return {
    compress,
    compressing,
    error,
    handleCompactContext
  };
}
