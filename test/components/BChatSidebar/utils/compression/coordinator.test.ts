/**
 * @file coordinator.test.ts
 * @description Coordinator 模块测试：压缩流程编排、并发锁、失败兜底。
 */
import dayjs from 'dayjs';
import { describe, expect, it, vi } from 'vitest';
import type { ConversationSummaryRecord, SummaryStorage } from '@/components/BChatSidebar/utils/compression/types';
import type { Message } from '@/components/BChatSidebar/utils/types';

// Mock 存储模块
vi.mock('@/shared/storage', () => ({
  providerStorage: {
    getProvider: vi.fn().mockResolvedValue(null)
  },
  serviceModelsStorage: {
    getConfig: vi.fn().mockResolvedValue(null)
  }
}));

// Mock electron API
vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn().mockReturnValue({
    aiInvoke: vi.fn().mockResolvedValue([null, { text: '{}' }])
  })
}));

/**
 * 创建测试用基础消息。
 */
function makeMsg(overrides: Partial<Message> & { id: string }): Message {
  return {
    role: 'user',
    content: '',
    parts: [],
    loading: false,
    createdAt: dayjs().toISOString(),
    ...overrides
  };
}

/**
 * 创建测试用摘要记录。
 */
function makeSummary(overrides: Partial<ConversationSummaryRecord> = {}): ConversationSummaryRecord {
  return {
    id: 'summary-1',
    sessionId: 'session-1',
    buildMode: 'incremental',
    coveredStartMessageId: 'm1',
    coveredEndMessageId: 'm5',
    coveredUntilMessageId: 'm5',
    sourceMessageIds: ['m1', 'm2', 'm3', 'm4', 'm5'],
    preservedMessageIds: [],
    summaryText: 'Test summary text.',
    structuredSummary: {
      goal: 'Test',
      recentTopic: 'Testing',
      userPreferences: [],
      constraints: [],
      decisions: [],
      importantFacts: [],
      fileContext: [],
      openQuestions: [],
      pendingActions: []
    },
    triggerReason: 'message_count',
    messageCountSnapshot: 10,
    charCountSnapshot: 2000,
    schemaVersion: 1,
    status: 'valid',
    createdAt: dayjs().toISOString(),
    updatedAt: dayjs().toISOString(),
    ...overrides
  };
}

/**
 * 创建模拟的 SummaryStorage。
 */
function createMockStorage(summary?: ConversationSummaryRecord): SummaryStorage {
  return {
    getValidSummary: vi.fn().mockResolvedValue(summary),
    createSummary: vi.fn().mockImplementation((record) =>
      Promise.resolve({
        ...record,
        id: 'new-summary-id',
        createdAt: dayjs().toISOString(),
        updatedAt: dayjs().toISOString()
      })
    ),
    updateSummaryStatus: vi.fn().mockResolvedValue(undefined),
    getAllSummaries: vi.fn().mockResolvedValue([])
  };
}

/**
 * 创建带时间分段的测试消息，便于触发多段摘要。
 */
function createSegmentedMessages(totalMessages: number): Message[] {
  const messages: Message[] = [];
  const baseTime = dayjs('2026-05-07T00:00:00.000Z').valueOf();

  for (let i = 1; i <= totalMessages; i += 1) {
    const role = i % 2 === 1 ? 'user' : 'assistant';
    let timeOffset = 0;
    if (i >= 13 && i < 25) {
      timeOffset = 31 * 60 * 1000;
    } else if (i >= 25 && i < 37) {
      timeOffset = 62 * 60 * 1000;
    } else if (i >= 37) {
      timeOffset = 63 * 60 * 1000;
    }

    messages.push(
      makeMsg({
        id: `m${i}`,
        role,
        content: `Segmented message ${i} with enough text to participate in compression and summary generation`,
        parts: [{ type: 'text', text: `Segmented message ${i} with enough text to participate in compression and summary generation` } as never],
        createdAt: dayjs(baseTime + timeOffset + i * 1000).toISOString()
      })
    );
  }

  return messages;
}

describe('coordinator - prepareMessagesBeforeSend', () => {
  it('returns assembled messages without compression when under threshold', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const mockStorage = createMockStorage();

    const coordinator = createCompressionCoordinator(mockStorage);
    const messages: Message[] = [
      makeMsg({ id: 'm1', role: 'user', content: 'Hello', parts: [{ type: 'text', text: 'Hello' } as never] }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'Hi', parts: [{ type: 'text', text: 'Hi' } as never] })
    ];
    const currentUserMessage = makeMsg({ id: 'current', role: 'user', content: 'New question', parts: [{ type: 'text', text: 'New question' } as never] });

    const result = await coordinator.prepareMessagesBeforeSend({
      sessionId: 'session-1',
      messages,
      currentUserMessage
    });

    expect(result.modelMessages.length).toBeGreaterThan(0);
    expect(result.compressed).toBe(false);
    const userMessages = result.modelMessages.filter((message) => message.role === 'user');
    const currentMessages = userMessages.filter((message) => message.content === 'New question');
    expect(currentMessages).toHaveLength(1);
  });

  it('returns compressed context when over threshold', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const mockStorage = createMockStorage();

    const coordinator = createCompressionCoordinator(mockStorage);

    // Create many messages to exceed round threshold
    const messages: Message[] = [];
    for (let i = 1; i <= 62; i += 1) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      messages.push(
        makeMsg({
          id: `m${i}`,
          role,
          content: `Message ${i} with some additional text to make it longer and exceed the character threshold`,
          parts: [{ type: 'text', text: `Message ${i} with some additional text to make it longer and exceed the character threshold` } as never]
        })
      );
    }
    const currentUserMessage = makeMsg({ id: 'current', role: 'user', content: 'New question', parts: [{ type: 'text', text: 'New question' } as never] });

    const result = await coordinator.prepareMessagesBeforeSend({
      sessionId: 'session-1',
      messages,
      currentUserMessage
    });

    expect(result.modelMessages.length).toBeGreaterThan(0);
    // Should have compressed
    expect(result.compressed).toBe(true);
    // Should have created a summary
    expect(mockStorage.createSummary).toHaveBeenCalled();
  });

  it('falls back to original context on compression failure', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const mockStorage = createMockStorage();
    // Make createSummary throw
    mockStorage.createSummary = vi.fn().mockRejectedValue(new Error('DB write failed'));

    const coordinator = createCompressionCoordinator(mockStorage);

    // Create enough messages to trigger compression
    const messages: Message[] = [];
    for (let i = 1; i <= 62; i += 1) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      messages.push(
        makeMsg({
          id: `m${i}`,
          role,
          content: `Message ${i} with extra text to exceed thresholds`,
          parts: [{ type: 'text', text: `Message ${i} with extra text to exceed thresholds` } as never]
        })
      );
    }
    const currentUserMessage = makeMsg({ id: 'current', role: 'user', content: 'New question', parts: [{ type: 'text', text: 'New question' } as never] });

    const result = await coordinator.prepareMessagesBeforeSend({
      sessionId: 'session-1',
      messages,
      currentUserMessage
    });

    // Should still return messages (fallback to original)
    expect(result.modelMessages.length).toBeGreaterThan(0);
    expect(result.compressed).toBe(false);
    const userMessages = result.modelMessages.filter((message) => message.role === 'user');
    const currentMessages = userMessages.filter((message) => message.content === 'New question');
    expect(currentMessages).toHaveLength(1);
  });

  it('maintains session-level lock to prevent concurrent compression', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const mockStorage = createMockStorage();

    // Track the created summary so getValidSummary can return it
    let createdSummary: ConversationSummaryRecord | undefined;
    mockStorage.createSummary = vi.fn().mockImplementation((record) => {
      const summary: ConversationSummaryRecord = {
        ...record,
        id: 'new-summary',
        createdAt: dayjs().toISOString(),
        updatedAt: dayjs().toISOString()
      };
      createdSummary = summary;
      return new Promise((resolve) => {
        setTimeout(() => resolve(summary), 100);
      });
    });
    mockStorage.getValidSummary = vi.fn().mockImplementation(() => {
      return Promise.resolve(createdSummary);
    });

    const coordinator = createCompressionCoordinator(mockStorage);

    // Create enough messages to trigger compression
    const messages: Message[] = [];
    for (let i = 1; i <= 62; i += 1) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      messages.push(
        makeMsg({
          id: `m${i}`,
          role,
          content: `Message ${i} lots of text to fill up the character threshold for compression triggers`,
          parts: [{ type: 'text', text: `Message ${i} lots of text to fill up the character threshold for compression triggers` } as never]
        })
      );
    }
    const currentUserMessage = makeMsg({ id: 'current', role: 'user', content: 'New question', parts: [{ type: 'text', text: 'New question' } as never] });

    // Send two concurrent requests
    const [result1, result2] = await Promise.all([
      coordinator.prepareMessagesBeforeSend({ sessionId: 'session-1', messages, currentUserMessage }),
      coordinator.prepareMessagesBeforeSend({
        sessionId: 'session-1',
        messages,
        currentUserMessage: makeMsg({ id: 'current2', role: 'user', content: 'Second', parts: [{ type: 'text', text: 'Second' } as never] })
      })
    ]);

    // Both should succeed
    expect(result1.modelMessages.length).toBeGreaterThan(0);
    expect(result2.modelMessages.length).toBeGreaterThan(0);
    // createSummary should only be called once (second call skips compression due to lock)
    expect(mockStorage.createSummary).toHaveBeenCalledTimes(1);
  });

  it('excludes current user message from compression', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const mockStorage = createMockStorage();

    const coordinator = createCompressionCoordinator(mockStorage);

    // Create enough messages to trigger compression
    const messages: Message[] = [];
    for (let i = 1; i <= 62; i += 1) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      messages.push(
        makeMsg({
          id: `m${i}`,
          role,
          content: `Message ${i} with some extra padding to reach the compression threshold`,
          parts: [{ type: 'text', text: `Message ${i} with some extra padding to reach the compression threshold` } as never]
        })
      );
    }
    const currentUserMessage = makeMsg({
      id: 'current',
      role: 'user',
      content: 'Current question',
      parts: [{ type: 'text', text: 'Current question' } as never]
    });

    const result = await coordinator.prepareMessagesBeforeSend({
      sessionId: 'session-1',
      messages,
      currentUserMessage,
      excludeMessageIds: [currentUserMessage.id]
    });

    // Current user message should be the last message
    const lastMsg = result.modelMessages[result.modelMessages.length - 1];
    expect(lastMsg.role).toBe('user');
    if (typeof lastMsg.content === 'string') {
      expect(lastMsg.content).toContain('Current');
    }
  });

  it('counts injected summary overhead when deciding whether to compress', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const currentSummary = makeSummary({
      summaryText: 'S'.repeat(26_000),
      coveredEndMessageId: 'm2',
      coveredUntilMessageId: 'm2'
    });
    const mockStorage = createMockStorage(currentSummary);
    const coordinator = createCompressionCoordinator(mockStorage);

    const messages: Message[] = [
      makeMsg({ id: 'm1', role: 'user', content: 'hello', parts: [{ type: 'text', text: 'hello' } as never] }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'world', parts: [{ type: 'text', text: 'world' } as never] })
    ];
    for (let i = 3; i <= 16; i += 1) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      messages.push(
        makeMsg({
          id: `m${i}`,
          role,
          content: `recent ${i}`,
          parts: [{ type: 'text', text: `recent ${i}` } as never]
        })
      );
    }
    const currentUserMessage = makeMsg({ id: 'current', role: 'user', content: 'next', parts: [{ type: 'text', text: 'next' } as never] });

    const result = await coordinator.prepareMessagesBeforeSend({
      sessionId: 'session-1',
      messages,
      currentUserMessage
    });

    expect(result.compressed).toBe(true);
    expect(mockStorage.createSummary).toHaveBeenCalled();
  });

  it('counts tool schema overhead in token budget before sending', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const mockStorage = createMockStorage();
    const coordinator = createCompressionCoordinator(mockStorage);

    const messages: Message[] = [
      makeMsg({ id: 'm1', role: 'user', content: 'hello', parts: [{ type: 'text', text: 'hello' } as never] }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'world', parts: [{ type: 'text', text: 'world' } as never] })
    ];
    for (let i = 3; i <= 16; i += 1) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      messages.push(
        makeMsg({
          id: `m${i}`,
          role,
          content: `small ${i}`,
          parts: [{ type: 'text', text: `small ${i}` } as never]
        })
      );
    }
    const currentUserMessage = makeMsg({ id: 'current', role: 'user', content: 'next', parts: [{ type: 'text', text: 'next' } as never] });
    const oversizedToolInput: Parameters<typeof coordinator.prepareMessagesBeforeSend>[0] & {
      toolDefinitions: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    } = {
      sessionId: 'session-1',
      messages,
      currentUserMessage,
      toolDefinitions: [
        {
          name: 'huge_tool',
          description: '描'.repeat(26_000),
          parameters: {
            type: 'object',
            properties: {
              value: {
                type: 'string',
                description: '说'.repeat(6_000)
              }
            }
          }
        }
      ]
    };

    const result = await coordinator.prepareMessagesBeforeSend(oversizedToolInput);

    expect(result.compressed).toBe(true);
    expect(mockStorage.createSummary).toHaveBeenCalled();
  });

  it('compresses based on valid summary boundary', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');

    // Provide a valid summary that covers messages 1-30
    const existingSummary = makeSummary({
      id: 'existing-summary',
      coveredUntilMessageId: 'm30',
      sourceMessageIds: Array.from({ length: 30 }, (_, i) => `m${i + 1}`)
    });
    const mockStorage = createMockStorage(existingSummary);

    const coordinator = createCompressionCoordinator(mockStorage);

    // Create more messages (31-92) beyond the summary boundary to trigger new compression
    // Need at least 30 rounds (60 messages) after the summary to trigger compression
    const messages: Message[] = [];
    for (let i = 1; i <= 92; i += 1) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      messages.push(
        makeMsg({
          id: `m${i}`,
          role,
          content: `Message ${i} with additional text content to fill space`,
          parts: [{ type: 'text', text: `Message ${i} with additional text content to fill space` } as never]
        })
      );
    }
    const currentUserMessage = makeMsg({ id: 'current', role: 'user', content: 'New question', parts: [{ type: 'text', text: 'New question' } as never] });

    const result = await coordinator.prepareMessagesBeforeSend({
      sessionId: 'session-1',
      messages,
      currentUserMessage
    });

    expect(result.modelMessages.length).toBeGreaterThan(0);
    // Should have triggered compression of new messages (31-92, which is 31 rounds)
    expect(mockStorage.createSummary).toHaveBeenCalled();
  });

  it('keeps preserved messages once and does not retain raw recent messages when preserve window is disabled', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const mockStorage = createMockStorage();

    const coordinator = createCompressionCoordinator(mockStorage);
    const messages: Message[] = [];

    for (let i = 1; i <= 62; i += 1) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      if (i === 49) {
        messages.push(
          makeMsg({
            id: 'm49',
            role: 'assistant',
            content: 'pending confirmation',
            parts: [
              { type: 'text', text: 'pending confirmation' } as never,
              { type: 'confirmation', title: 'Confirm deploy', confirmationStatus: 'pending' } as never
            ]
          })
        );
        continue;
      }

      const content = i >= 57 ? `Recent message ${i}` : `Message ${i} with extra padding to trigger compression`;
      messages.push(
        makeMsg({
          id: `m${i}`,
          role,
          content,
          parts: [{ type: 'text', text: content } as never]
        })
      );
    }

    const currentUserMessage = makeMsg({
      id: 'current',
      role: 'user',
      content: 'Current question',
      parts: [{ type: 'text', text: 'Current question' } as never]
    });

    const result = await coordinator.prepareMessagesBeforeSend({
      sessionId: 'session-1',
      messages,
      currentUserMessage,
      excludeMessageIds: [currentUserMessage.id]
    });

    const pendingConfirmationMessages = result.modelMessages.filter((message) => {
      if (typeof message.content === 'string') {
        return message.content.includes('pending confirmation');
      }
      if (Array.isArray(message.content)) {
        return message.content.some((part) => {
          return part.type === 'text' && part.text.includes('pending confirmation');
        });
      }
      return false;
    });
    expect(pendingConfirmationMessages).toHaveLength(1);

    const recentAssistant = result.modelMessages.find((message) => {
      if (message.role !== 'assistant') {
        return false;
      }
      if (typeof message.content === 'string') {
        return message.content === 'Recent message 58';
      }
      if (Array.isArray(message.content)) {
        return message.content.some((part) => part.type === 'text' && part.text === 'Recent message 58');
      }
      return false;
    });
    expect(recentAssistant).toBeUndefined();
  });

  it('starts incremental summaries after the previous coveredEndMessageId', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');

    // 已有摘要覆盖 m1-m30
    const existingSummary = makeSummary({
      id: 'summary-prev',
      coveredStartMessageId: 'm1',
      coveredEndMessageId: 'm30',
      coveredUntilMessageId: 'm30',
      summaryText: 'previous summary',
      structuredSummary: {
        goal: 'Existing goal',
        recentTopic: 'Existing topic',
        userPreferences: [],
        constraints: [],
        decisions: [],
        importantFacts: [],
        fileContext: [],
        openQuestions: [],
        pendingActions: []
      }
    });
    const mockStorage = createMockStorage(existingSummary);

    const coordinator = createCompressionCoordinator(mockStorage);

    // 创建 92 条消息（46 轮），使得 m31-m92（31 轮）足以触发压缩阈值
    const messages: Message[] = [];
    const totalMessages = 92;
    for (let i = 1; i <= totalMessages; i += 1) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      messages.push(
        makeMsg({
          id: `m${i}`,
          role,
          content: `Message ${i} with some extra padding to push the character estimate over the compression threshold`,
          parts: [{ type: 'text', text: `Message ${i} with some extra padding to push the character estimate over the compression threshold` } as never]
        })
      );
    }
    const currentUserMessage = makeMsg({
      id: 'current',
      role: 'user',
      content: 'Current question',
      parts: [{ type: 'text', text: 'Current question' } as never]
    });

    await coordinator.prepareMessagesBeforeSend({
      sessionId: 'session-1',
      messages,
      currentUserMessage,
      excludeMessageIds: [currentUserMessage.id]
    });

    // 增量模式下，新摘要应该从上一条摘要的边界之后开始（m31）
    expect(mockStorage.createSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        derivedFromSummaryId: 'summary-prev',
        coveredStartMessageId: 'm31'
      })
    );
  });

  it('does not count the current user message twice when evaluating budget', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const mockStorage = createMockStorage();
    const coordinator = createCompressionCoordinator(mockStorage);

    const messages: Message[] = [];
    for (let i = 1; i <= 10; i += 1) {
      messages.push(
        makeMsg({
          id: `m${i}`,
          role: i % 2 === 1 ? 'user' : 'assistant',
          content: 'A'.repeat(500),
          parts: [{ type: 'text', text: 'A'.repeat(500) } as never]
        })
      );
    }

    const currentUserMessage = makeMsg({
      id: 'current',
      role: 'user',
      content: 'B'.repeat(10000),
      parts: [{ type: 'text', text: 'B'.repeat(10000) } as never]
    });
    messages.push(currentUserMessage);

    const result = await coordinator.prepareMessagesBeforeSend({
      sessionId: 'session-1',
      messages,
      currentUserMessage,
      excludeMessageIds: [currentUserMessage.id]
    });

    expect(result.compressed).toBe(false);
    expect(mockStorage.createSummary).not.toHaveBeenCalled();
  });

  it('limits multi-segment recall instead of injecting the whole summary set', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');

    const multiSegmentSummary = makeSummary({
      id: 'segment-0',
      summarySetId: 'set-1',
      segmentIndex: 0,
      segmentCount: 5,
      summaryText: 'alpha summary',
      topicTags: [],
      coveredUntilMessageId: 'm5'
    });
    const allSegments = [
      multiSegmentSummary,
      makeSummary({ id: 'segment-1', summarySetId: 'set-1', segmentIndex: 1, segmentCount: 5, summaryText: 'beta summary', topicTags: [] }),
      makeSummary({ id: 'segment-2', summarySetId: 'set-1', segmentIndex: 2, segmentCount: 5, summaryText: 'gamma summary', topicTags: [] }),
      makeSummary({ id: 'segment-3', summarySetId: 'set-1', segmentIndex: 3, segmentCount: 5, summaryText: 'delta summary', topicTags: [] }),
      makeSummary({ id: 'segment-4', summarySetId: 'set-1', segmentIndex: 4, segmentCount: 5, summaryText: 'epsilon summary', topicTags: [] })
    ];
    const mockStorage = createMockStorage(multiSegmentSummary);
    mockStorage.getAllSummaries = vi.fn().mockResolvedValue(allSegments);

    const coordinator = createCompressionCoordinator(mockStorage);
    const messages: Message[] = [
      makeMsg({ id: 'm1', role: 'user', content: 'hello', parts: [{ type: 'text', text: 'hello' } as never] }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'world', parts: [{ type: 'text', text: 'world' } as never] })
    ];
    const currentUserMessage = makeMsg({
      id: 'current',
      role: 'user',
      content: 'please continue beta delta work',
      parts: [{ type: 'text', text: 'please continue beta delta work' } as never]
    });

    const result = await coordinator.prepareMessagesBeforeSend({
      sessionId: 'session-1',
      messages,
      currentUserMessage
    });

    const summarySystemMessage = result.modelMessages.find((message) => message.role === 'system');
    expect(summarySystemMessage).toBeDefined();
    const content = typeof summarySystemMessage?.content === 'string' ? summarySystemMessage.content : '';
    expect(content.match(/<conversation_summary segment="/g)?.length ?? 0).toBe(3);
    expect(content).toContain('beta summary');
    expect(content).toContain('delta summary');
    expect(content).toContain('epsilon summary');
    expect(content).not.toContain('alpha summary');
    expect(content).not.toContain('gamma summary');
  });
});

describe('coordinator - compressSessionManually', () => {
  it('creates full_rebuild summary', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const mockStorage = createMockStorage();

    const coordinator = createCompressionCoordinator(mockStorage);
    const messages: Message[] = [];
    for (let i = 1; i <= 14; i += 1) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      messages.push(
        makeMsg({
          id: `m${i}`,
          role,
          content: `Message ${i}`,
          parts: [{ type: 'text', text: `Message ${i}` } as never]
        })
      );
    }

    const result = await coordinator.compressSessionManually({
      sessionId: 'session-1',
      messages
    });

    expect(result).toBeDefined();
    expect(result?.buildMode).toBe('full_rebuild');
    expect(result?.triggerReason).toBe('manual');
  });

  it('still creates a manual compression summary for short conversations', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const mockStorage = createMockStorage();

    const coordinator = createCompressionCoordinator(mockStorage);
    // 手动压缩语义已收敛为“显式请求即生成压缩边界”，短会话也会产出摘要。
    const messages: Message[] = [
      makeMsg({ id: 'm1', role: 'user', content: 'Hello', parts: [{ type: 'text', text: 'Hello' } as never] }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'Hi', parts: [{ type: 'text', text: 'Hi' } as never] })
    ];

    const result = await coordinator.compressSessionManually({
      sessionId: 'session-1',
      messages
    });

    expect(result).toBeDefined();
    expect(result?.triggerReason).toBe('manual');
    expect(result?.sourceMessageIds).toEqual(['m1', 'm2']);
  });

  it('marks old summary as superseded when creating new one', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const existingSummary = makeSummary({ id: 'old-summary' });
    const mockStorage = createMockStorage(existingSummary);

    const coordinator = createCompressionCoordinator(mockStorage);
    const messages: Message[] = [];
    for (let i = 1; i <= 14; i += 1) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      messages.push(
        makeMsg({
          id: `m${i}`,
          role,
          content: `Message ${i}`,
          parts: [{ type: 'text', text: `Message ${i}` } as never]
        })
      );
    }

    await coordinator.compressSessionManually({ sessionId: 'session-1', messages });

    expect(mockStorage.updateSummaryStatus).toHaveBeenCalledWith('old-summary', 'superseded');
  });

  it('creates multi-segment summaries as draft records before promotion', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const existingSummary = makeSummary({ id: 'old-summary' });
    const createdRecords: Array<Parameters<SummaryStorage['createSummary']>[0]> = [];
    const mockStorage = createMockStorage(existingSummary);

    mockStorage.createSummary = vi.fn().mockImplementation(async (record) => {
      createdRecords.push(record);
      if (createdRecords.length === 2) {
        throw new Error('segment write failed');
      }
      return {
        ...record,
        id: `summary-${createdRecords.length}`,
        createdAt: dayjs().toISOString(),
        updatedAt: dayjs().toISOString()
      };
    });

    const coordinator = createCompressionCoordinator(mockStorage);

    await expect(
      coordinator.compressSessionManually({
        sessionId: 'session-1',
        messages: createSegmentedMessages(48)
      })
    ).rejects.toThrow();

    expect(createdRecords[0]?.status).toBe('draft');
    expect(mockStorage.updateSummaryStatus).not.toHaveBeenCalledWith('old-summary', 'superseded');
  });

  it('degrades to incremental when input exceeds char limit', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const mockStorage = createMockStorage();

    const coordinator = createCompressionCoordinator(mockStorage);
    // 创建大量超长消息，确保 ruleTrim 超过 COMPRESSION_INPUT_CHAR_LIMIT
    const messages: Message[] = [];
    for (let i = 1; i <= 200; i += 1) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      messages.push(
        makeMsg({
          id: `m${i}`,
          role,
          content: `Message ${i} `.padEnd(1000, 'X'),
          parts: [{ type: 'text', text: `Message ${i} `.padEnd(1000, 'X') } as never]
        })
      );
    }

    const result = await coordinator.compressSessionManually({ sessionId: 'session-1', messages });

    expect(result?.buildMode).toBe('full_rebuild');
    expect(result?.degradeReason).toBe('degraded_to_incremental');
  });

  it('releases session lock after exception', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const mockStorage = createMockStorage();
    // 使 createSummary 在第二次调用时抛出异常
    let callCount = 0;
    mockStorage.createSummary = vi.fn().mockImplementation((record) => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve({
          ...record,
          id: 'first-summary',
          createdAt: dayjs().toISOString(),
          updatedAt: dayjs().toISOString()
        });
      }
      return Promise.reject(new Error('DB error'));
    });

    const coordinator = createCompressionCoordinator(mockStorage);
    const messages: Message[] = [];
    for (let i = 1; i <= 14; i += 1) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      messages.push(
        makeMsg({
          id: `m${i}`,
          role,
          content: `Message ${i}`,
          parts: [{ type: 'text', text: `Message ${i}` } as never]
        })
      );
    }

    // 第一次调用成功
    const result1 = await coordinator.compressSessionManually({ sessionId: 'session-1', messages });
    expect(result1).toBeDefined();

    // 第二次调用应抛出异常（CompressionError wrapping storage error）
    await expect(coordinator.compressSessionManually({ sessionId: 'session-1', messages })).rejects.toThrow('摘要保存失败');

    // 第三次调用应能正常获取锁（锁已释放）
    mockStorage.createSummary = vi.fn().mockImplementation((record) =>
      Promise.resolve({
        ...record,
        id: 'third-summary',
        createdAt: dayjs().toISOString(),
        updatedAt: dayjs().toISOString()
      })
    );
    const result3 = await coordinator.compressSessionManually({ sessionId: 'session-1', messages });
    expect(result3).toBeDefined();
    expect(result3?.id).toBe('third-summary');
  });
});
