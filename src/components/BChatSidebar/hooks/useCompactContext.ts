/**
 * @file useCompactContext.ts
 * @description 手动上下文压缩命令 hook，负责 pending 压缩消息的创建、回填与提示反馈。
 */
import type { CompressionExecutionResult } from './useCompression';
import type { Message } from '../utils/types';
import type { ChatCompressionStatus } from 'types/chat';
import type { Ref } from 'vue';
import { message } from 'ant-design-vue';
import { createBase } from '../utils/messageHelper';

/**
 * 压缩消息的公共字段
 */
interface CompressionMessageBase {
  /** 压缩消息内容 */
  summaryText: string;
  /** 压缩摘要 ID */
  summaryId?: string;
  /** 覆盖范围结束消息 ID */
  coveredUntilMessageId?: string;
  /** 压缩源消息 ID 列表 */
  sourceMessageIds?: string[];
}

/**
 * 创建压缩成功消息的输入参数
 */
interface CreateSuccessfulCompressionMessageInput extends CompressionMessageBase {
  /** 压缩摘要的唯一标识 */
  summaryId: string;
}

/**
 * 创建压缩消息的输入参数
 */
interface CreateCompressionMessageInput extends CompressionMessageBase {
  /** 压缩状态 */
  status: ChatCompressionStatus;
  /** 压缩失败提示 */
  errorMessage?: string;
}

/**
 * 创建压缩消息。
 * @param input - 压缩消息数据
 * @returns 压缩消息
 */
export function createCompressionMessage(input: CreateCompressionMessageInput): Message {
  return createBase({
    role: 'compression',
    content: input.summaryText,
    parts: input.summaryText ? [{ type: 'text', text: input.summaryText }] : [],
    compression: input,
    finished: input.status !== 'pending',
    loading: input.status === 'pending'
  });
}

/**
 * 创建待处理中的压缩消息。
 * @returns pending 状态的压缩消息
 */
export function createPendingCompressionMessage(): Message {
  return createCompressionMessage({
    summaryText: '正在压缩上下文…',
    status: 'pending'
  });
}

/**
 * 创建压缩成功消息。
 * @param input - 压缩成功所需的摘要信息
 * @returns success 状态的压缩消息
 */
export function createSuccessfulCompressionMessage(input: CreateSuccessfulCompressionMessageInput): Message {
  return createCompressionMessage({
    summaryText: input.summaryText,
    status: 'success',
    summaryId: input.summaryId,
    coveredUntilMessageId: input.coveredUntilMessageId,
    sourceMessageIds: input.sourceMessageIds
  });
}

/**
 * 创建压缩失败消息。
 * @param errorMessage - 失败提示
 * @returns failed 状态的压缩消息
 */
export function createFailedCompressionMessage(errorMessage: string): Message {
  return createCompressionMessage({
    summaryText: '上下文压缩失败',
    status: 'failed',
    errorMessage
  });
}

/**
 * 创建压缩取消消息。
 * @returns cancelled 状态的压缩消息
 */
export function createCancelledCompressionMessage(): Message {
  return createCompressionMessage({
    summaryText: '',
    status: 'cancelled'
  });
}

/**
 * 手动上下文压缩 hook 的依赖项。
 */
interface UseCompactContextOptions {
  /** 当前消息列表 */
  messages: Ref<Message[]>;
  /** 获取活跃会话 ID */
  getSessionId: () => string | undefined;
  /** 执行压缩 */
  compress: () => Promise<CompressionExecutionResult>;
  /** 持久化新增的压缩消息 */
  persistMessage: (sessionId: string, nextMessage: Message) => Promise<void>;
  /** 持久化当前完整消息列表 */
  persistMessages: (sessionId: string | undefined, nextMessages: Message[]) => Promise<void>;
  /** 将对话滚动到底部 */
  scrollToBottom: () => void;
}

/**
 * 手动上下文压缩 hook。
 * @param options - hook 依赖项
 * @returns 手动压缩命令处理函数
 */
export function useCompactContext(options: UseCompactContextOptions) {
  const { messages, getSessionId, compress, persistMessage, persistMessages, scrollToBottom } = options;

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
   * 根据压缩执行结果解析出对应的压缩消息。
   * @param result - 压缩执行结果
   * @returns 对应状态的压缩消息
   */
  function resolveCompressionMessage(result: CompressionExecutionResult): Message {
    if (result.success && result.summary) {
      return createSuccessfulCompressionMessage({
        summaryText: result.summary.summaryText,
        summaryId: result.summary.id,
        coveredUntilMessageId: result.summary.coveredUntilMessageId,
        sourceMessageIds: result.summary.sourceMessageIds
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
    messages.value.push(pendingMessage);
    await persistMessage(sessionId, pendingMessage);
    scrollToBottom();

    const result = await compress();
    await updateCompressionMessage(pendingMessage.id, resolveCompressionMessage(result));
  }

  return {
    handleCompactContext
  };
}
