/**
 * @file useContextUsage.test.ts
 * @description 上下文窗口用量 hook 的压缩边界计算测试。
 */
import { computed, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { createCompressionMessage } from '@/components/BChatSidebar/hooks/useCompactContext';
import { useContextUsage } from '@/components/BChatSidebar/hooks/useContextUsage';
import { create } from '@/components/BChatSidebar/utils/messageHelper';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * 创建带 API usage 的助手消息。
 * @param id - 消息 ID
 * @param content - 消息正文
 * @param inputTokens - API 上报的输入 token 数
 * @returns 助手消息
 */
function createAssistantMessageWithUsage(id: string, content: string, inputTokens: number): Message {
  return {
    id,
    role: 'assistant',
    content,
    parts: [{ type: 'text', text: content }],
    createdAt: '2026-05-16T00:00:00.000Z',
    finished: true,
    loading: false,
    usage: {
      inputTokens,
      outputTokens: 1,
      totalTokens: inputTokens + 1
    }
  };
}

describe('useContextUsage', () => {
  it('uses API reported usage while idle when no compression boundary exists', () => {
    const messages = ref<Message[]>([create.userMessage('hello'), createAssistantMessageWithUsage('assistant-1', 'world', 1000)]);

    const { usedTokens } = useContextUsage({
      messages,
      contextWindow: computed(() => 2000),
      selectedModel: computed(() => ({ providerId: 'openai', modelId: 'gpt-4o' })),
      streaming: computed(() => false)
    });

    expect(usedTokens.value).toBe(1000);
  });

  it('uses compressed model context estimate when idle API usage is older than the latest compression boundary', () => {
    const oldUser = { ...create.userMessage('old user'), id: 'old-user' };
    const oldAssistant = createAssistantMessageWithUsage('old-assistant', 'old assistant', 1000);
    const compression = createCompressionMessage({
      boundaryText: '摘要',
      status: 'success',
      recordId: 'record-1',
      coveredUntilMessageId: 'old-assistant',
      sourceMessageIds: ['old-user', 'old-assistant']
    });
    const messages = ref<Message[]>([oldUser, oldAssistant, compression]);

    const { usedTokens } = useContextUsage({
      messages,
      contextWindow: computed(() => 2000),
      selectedModel: computed(() => ({ providerId: 'openai', modelId: 'gpt-4o' })),
      streaming: computed(() => false)
    });

    expect(usedTokens.value).toBe(1);
  });
});
