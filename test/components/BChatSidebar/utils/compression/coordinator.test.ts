/**
 * @file coordinator.test.ts
 * @description Coordinator 模块测试：手动压缩流程编排、并发锁与失败兜底。
 */
import dayjs from 'dayjs';
import { describe, expect, it, vi } from 'vitest';
import type { CompressionRecord, CompressionRecordStorage } from '@/components/BChatSidebar/utils/compression/types';
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
 * 创建测试用压缩记录。
 */
function makeRecord(overrides: Partial<CompressionRecord> = {}): CompressionRecord {
  return {
    id: 'record-1',
    sessionId: 'session-1',
    buildMode: 'incremental',
    coveredStartMessageId: 'm1',
    coveredEndMessageId: 'm5',
    coveredUntilMessageId: 'm5',
    sourceMessageIds: ['m1', 'm2', 'm3', 'm4', 'm5'],
    preservedMessageIds: [],
    recordText: 'Test record text.',
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
 * 创建模拟的 CompressionRecordStorage。
 */
function createMockStorage(record?: CompressionRecord): CompressionRecordStorage {
  return {
    getLatestValidRecord: vi.fn().mockResolvedValue(record),
    createRecord: vi.fn().mockImplementation((nextRecord) =>
      Promise.resolve({
        ...nextRecord,
        id: 'new-record-id',
        createdAt: dayjs().toISOString(),
        updatedAt: dayjs().toISOString()
      })
    ),
    updateRecordStatus: vi.fn().mockResolvedValue(undefined),
    getAllRecords: vi.fn().mockResolvedValue([])
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

describe('coordinator - compressSessionManually', () => {
  it('creates a full_rebuild compression record', async () => {
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

  it('still creates a manual compression record for short conversations', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const mockStorage = createMockStorage();

    const coordinator = createCompressionCoordinator(mockStorage);
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

  it('aborts manual compression when the abort signal is triggered', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const controller = new AbortController();
    const mockStorage = createMockStorage();
    const coordinator = createCompressionCoordinator(mockStorage);
    const messages: Message[] = [
      makeMsg({ id: 'm1', role: 'user', content: 'Hello', parts: [{ type: 'text', text: 'Hello' } as never] }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'World', parts: [{ type: 'text', text: 'World' } as never] })
    ];

    controller.abort();

    await expect(
      coordinator.compressSessionManually({
        sessionId: 'session-1',
        messages,
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'CompressionCancelledError' });
  });

  it('marks old record as superseded when creating a new one', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const existingRecord = makeRecord({ id: 'old-record' });
    const mockStorage = createMockStorage(existingRecord);

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

    expect(mockStorage.updateRecordStatus).toHaveBeenCalledWith('old-record', 'superseded');
  });

  it('creates multi-segment compression records as draft records before promotion', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const existingRecord = makeRecord({ id: 'old-record' });
    const createdRecords: Array<Parameters<CompressionRecordStorage['createRecord']>[0]> = [];
    const mockStorage = createMockStorage(existingRecord);

    mockStorage.createRecord = vi.fn().mockImplementation(async (record) => {
      createdRecords.push(record);
      if (createdRecords.length === 2) {
        throw new Error('segment write failed');
      }
      return {
        ...record,
        id: `record-${createdRecords.length}`,
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
    expect(mockStorage.updateRecordStatus).not.toHaveBeenCalledWith('old-record', 'superseded');
  });

  it('degrades to incremental when input exceeds char limit', async () => {
    const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
    const mockStorage = createMockStorage();

    const coordinator = createCompressionCoordinator(mockStorage);
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
    let callCount = 0;
    mockStorage.createRecord = vi.fn().mockImplementation((record) => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve({
          ...record,
          id: 'first-record',
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

    const result1 = await coordinator.compressSessionManually({ sessionId: 'session-1', messages });
    expect(result1).toBeDefined();

    await expect(coordinator.compressSessionManually({ sessionId: 'session-1', messages })).rejects.toThrow('压缩记录保存失败');

    mockStorage.createRecord = vi.fn().mockImplementation((record) =>
      Promise.resolve({
        ...record,
        id: 'third-record',
        createdAt: dayjs().toISOString(),
        updatedAt: dayjs().toISOString()
      })
    );
    const result3 = await coordinator.compressSessionManually({ sessionId: 'session-1', messages });
    expect(result3).toBeDefined();
    expect(result3?.id).toBe('third-record');
  });
});
