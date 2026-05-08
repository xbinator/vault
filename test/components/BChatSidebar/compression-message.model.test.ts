/**
 * @file compression-message.model.test.ts
 * @description 压缩消息模型测试，覆盖角色、状态与边界判断。
 */
import { describe, expect, test } from 'vitest';
import { createCompressionMessage } from '@/components/BChatSidebar/hooks/useCompactContext';
import { is } from '@/components/BChatSidebar/utils/messageHelper';

describe('compression message model', () => {
  test('creates a persistable compression message with pending status', () => {
    const message = createCompressionMessage({
      summaryText: '准备压缩上下文…',
      status: 'pending',
      coveredUntilMessageId: undefined
    });

    expect(message.role).toBe('compression');
    expect(message.compression?.status).toBe('pending');
    expect(is.persistableMessage(message)).toBe(true);
    expect(is.modelBoundaryCompressionMessage(message)).toBe(false);
  });

  test('marks a successful compression message as a model boundary', () => {
    const message = createCompressionMessage({
      summaryText: '历史对话已压缩',
      status: 'success',
      summaryId: 'summary-1',
      coveredUntilMessageId: 'message-42',
      sourceMessageIds: ['message-1', 'message-42']
    });

    expect(is.modelBoundaryCompressionMessage(message)).toBe(true);
  });

  test('supports cancelled compression messages without marking them as model boundaries', () => {
    const message = createCompressionMessage({
      summaryText: '',
      status: 'cancelled',
      errorMessage: '用户已取消'
    });

    expect(message.compression?.status).toBe('cancelled');
    expect(is.modelBoundaryCompressionMessage(message)).toBe(false);
  });
});
