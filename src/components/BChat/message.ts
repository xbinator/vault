/**
 * @file message.ts
 * @description BChat 消息创建、转换与持久化过滤工具。
 */
import type { Message, MessageToolCall } from './types';
import type { ModelMessage } from 'ai';
import type { ChatMessageRole } from 'types/chat';
import { nanoid } from 'nanoid';

/**
 * 可传给模型的消息
 */
export type ModelCompatibleMessage = Message & { role: Extract<ChatMessageRole, 'user' | 'assistant'> };

/**
 * 可持久化的消息
 */
export type PersistableMessage = Message & { role: ChatMessageRole };

/**
 * 单条消息的模型转换缓存条目
 */
export interface CachedModelMessageEntry {
  /** 缓存生成时对应的原始消息引用 */
  sourceMessage: Message;
  /** 参与模型转换的消息签名 */
  signature: string;
  /** 转换后的模型消息；不可传给模型的消息为空 */
  modelMessage?: ModelMessage;
}

/**
 * 模型消息转换缓存结果
 */
export interface CachedModelMessagesResult {
  /** 每条原始消息对应的缓存条目 */
  entries: CachedModelMessageEntry[];
  /** 过滤后的模型消息列表 */
  modelMessages: ModelMessage[];
}

/**
 * assistant 工具调用内容片段
 */
interface AssistantToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
}

/**
 * 判断消息是否可传给模型
 * @param message - 待判断的消息
 */
export function isModelMessage(message: Message): message is ModelCompatibleMessage {
  return message.role === 'user' || message.role === 'assistant';
}

/**
 * 判断消息是否可持久化
 * @param message - 待判断的消息
 */
export function isPersistableMessage(message: Message): message is PersistableMessage {
  return message.role === 'user' || message.role === 'assistant' || message.role === 'error';
}

/**
 * 判断 assistant 消息是否仍可视为空占位
 * @param message - 待判断的消息
 */
export function isRemovableAssistantPlaceholder(message: Message | undefined): boolean {
  if (!message || message.role !== 'assistant') {
    return false;
  }

  return !message.content && !message.usage && !message.toolCalls?.length;
}

/**
 * 将 assistant 工具调用记录转换为 AI SDK 所需的内容片段
 * @param toolCalls - 工具调用记录
 */
function toAssistantToolCallParts(toolCalls: MessageToolCall[]): AssistantToolCallPart[] {
  return toolCalls.map((item) => ({ type: 'tool-call', toolCallId: item.toolCallId, toolName: item.toolName, input: item.input }));
}

/**
 * 生成参与模型转换的消息签名，用于判断缓存是否还能复用。
 * @param message - 待签名的消息
 */
function createModelMessageSignature(message: Message): string {
  return JSON.stringify({
    role: message.role,
    content: message.content,
    toolCalls:
      message.toolCalls?.map((item) => ({
        toolCallId: item.toolCallId,
        toolName: item.toolName,
        input: item.input
      })) ?? []
  });
}

/**
 * 将单条组件消息转换为 AI SDK 的 ModelMessage。
 * @param message - 组件内部消息
 */
function toModelMessage(message: Message): ModelMessage | undefined {
  if (!isModelMessage(message)) {
    return undefined;
  }

  if (message.role !== 'assistant' || !message.toolCalls?.length) {
    return { role: message.role, content: message.content };
  }

  const contentParts = [...(message.content ? [{ type: 'text' as const, text: message.content }] : []), ...toAssistantToolCallParts(message.toolCalls)];
  return { role: message.role, content: contentParts };
}

/**
 * 判断单条消息是否可以直接复用已有缓存条目。
 * @param entry - 旧缓存条目
 * @param message - 当前消息
 */
function canReuseCachedEntry(entry: CachedModelMessageEntry, message: Message): boolean {
  if (entry.sourceMessage.id !== message.id || entry.sourceMessage.role !== message.role) {
    return false;
  }

  return entry.signature === createModelMessageSignature(message);
}

/**
 * 将组件消息转换为带缓存的模型消息结果，尽量复用前缀历史。
 * @param sourceMessages - 组件内部消息
 * @param previousCache - 上一次转换得到的缓存
 */
export function toCachedModelMessages(sourceMessages: Message[], previousCache?: CachedModelMessagesResult): CachedModelMessagesResult {
  const entries: CachedModelMessageEntry[] = [];
  const modelMessages: ModelMessage[] = [];
  let reuseCount = 0;

  if (previousCache) {
    const maxReusableLength = Math.min(sourceMessages.length, previousCache.entries.length);

    while (reuseCount < maxReusableLength) {
      const previousEntry = previousCache.entries[reuseCount];
      const message = sourceMessages[reuseCount];
      if (!canReuseCachedEntry(previousEntry, message)) {
        break;
      }

      entries.push(previousEntry);
      if (previousEntry.modelMessage) {
        modelMessages.push(previousEntry.modelMessage);
      }
      reuseCount += 1;
    }
  }

  for (let index = reuseCount; index < sourceMessages.length; index += 1) {
    const sourceMessage = sourceMessages[index];
    const modelMessage = toModelMessage(sourceMessage);
    const entry: CachedModelMessageEntry = {
      sourceMessage,
      signature: createModelMessageSignature(sourceMessage),
      modelMessage
    };

    entries.push(entry);
    if (modelMessage) {
      modelMessages.push(modelMessage);
    }
  }

  return { entries, modelMessages };
}

/**
 * 将组件消息转换为 AI SDK 的 ModelMessage
 * @param sourceMessages - 组件内部消息
 */
export function toModelMessages(sourceMessages: Message[]): ModelMessage[] {
  return toCachedModelMessages(sourceMessages).modelMessages;
}

/**
 * 创建 assistant 占位消息
 */
export function createAssistantPlaceholder(): Message {
  return { id: nanoid(), role: 'assistant', content: '', thinking: '', createdAt: '', loading: true };
}

/**
 * 创建错误消息
 * @param content - 错误说明
 */
export function createErrorMessage(content: string): Message {
  return { id: nanoid(), role: 'error', content, createdAt: new Date().toISOString(), loading: false, finished: true };
}
