/**
 * @file compression-boundary.model-context.test.ts
 * @description 压缩消息上下文边界测试。
 */
import { describe, expect, test } from 'vitest';
import { convert, create, sliceMessagesFromCompressionBoundary } from '@/components/BChatSidebar/utils/messageHelper';
import type { Message } from '@/components/BChatSidebar/utils/types';

describe('compression boundary model context', () => {
  test('uses the latest successful compression message as the new context start', () => {
    const sourceMessages: Message[] = [
      create.userMessage('old user'),
      {
        id: 'old-assistant',
        role: 'assistant',
        content: 'old assistant',
        parts: [{ type: 'text', text: 'old assistant' }],
        createdAt: '2026-05-07T00:00:00.000Z',
        finished: true
      },
      create.compressionMessage({
        summaryText: '历史对话摘要',
        status: 'success',
        summaryId: 'summary-1',
        coveredUntilMessageId: 'old-assistant',
        sourceMessageIds: ['old-user', 'old-assistant']
      }),
      create.userMessage('new question')
    ];

    const slicedMessages = sliceMessagesFromCompressionBoundary(sourceMessages);
    const modelMessages = convert.toModelMessages(sourceMessages);

    expect(slicedMessages).toHaveLength(2);
    expect(modelMessages).toEqual([
      { role: 'assistant', content: '历史对话摘要' },
      { role: 'user', content: 'new question' }
    ]);
  });
});
