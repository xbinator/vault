/**
 * @file chat-compression-records.test.ts
 * @description 验证聊天压缩记录存储在 localStorage 降级路径下返回最新有效记录。
 */
import { describe, expect, it, vi } from 'vitest';

/**
 * @vitest-environment jsdom
 */

const dbSelectMock = vi.fn();
const dbExecuteMock = vi.fn();
const isDatabaseAvailableMock = vi.fn(() => false);

vi.mock('@/shared/storage/utils', () => ({
  dbSelect: dbSelectMock,
  dbExecute: dbExecuteMock,
  isDatabaseAvailable: isDatabaseAvailableMock,
  parseJson: (json: string | null) => {
    if (!json) return undefined;
    try {
      return JSON.parse(json);
    } catch {
      return undefined;
    }
  },
  stringifyJson: JSON.stringify
}));

describe('chat compression records storage fallback', () => {
  it('returns the latest valid record from local storage fallback', async () => {
    localStorage.clear();
    const { chatCompressionRecordsStorage } = await import('@/shared/storage/chat-compression-records');

    const firstRecord = await chatCompressionRecordsStorage.createRecord({
      sessionId: 'session-1',
      buildMode: 'incremental',
      coveredStartMessageId: 'm1',
      coveredEndMessageId: 'm10',
      coveredUntilMessageId: 'm10',
      sourceMessageIds: ['m1'],
      preservedMessageIds: [],
      recordText: 'first summary',
      structuredSummary: {
        goal: 'goal 1',
        recentTopic: 'topic 1',
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
      charCountSnapshot: 1000,
      schemaVersion: 1,
      status: 'valid',
      invalidReason: undefined
    });

    await chatCompressionRecordsStorage.updateRecordStatus(firstRecord.id, 'superseded');

    const latestRecord = await chatCompressionRecordsStorage.createRecord({
      sessionId: 'session-1',
      buildMode: 'incremental',
      coveredStartMessageId: 'm11',
      coveredEndMessageId: 'm20',
      coveredUntilMessageId: 'm20',
      sourceMessageIds: ['m11'],
      preservedMessageIds: [],
      recordText: 'latest summary',
      structuredSummary: {
        goal: 'goal 2',
        recentTopic: 'topic 2',
        userPreferences: [],
        constraints: [],
        decisions: [],
        importantFacts: [],
        fileContext: [],
        openQuestions: [],
        pendingActions: []
      },
      triggerReason: 'manual',
      messageCountSnapshot: 20,
      charCountSnapshot: 2000,
      schemaVersion: 1,
      status: 'valid',
      invalidReason: undefined
    });

    const record = await chatCompressionRecordsStorage.getLatestValidRecord('session-1');
    expect(record?.id).toBe(latestRecord.id);
    expect(record?.recordText).toBe('latest summary');
  });

  it('ignores records with unsupported schema version', async () => {
    localStorage.clear();
    const { chatCompressionRecordsStorage } = await import('@/shared/storage/chat-compression-records');

    // 种子摘要: schema_version=999, status=valid
    await chatCompressionRecordsStorage.createRecord({
      sessionId: 'session-1',
      buildMode: 'incremental',
      coveredStartMessageId: 'm1',
      coveredEndMessageId: 'm10',
      coveredUntilMessageId: 'm10',
      sourceMessageIds: ['m1'],
      preservedMessageIds: [],
      recordText: 'bad schema summary',
      structuredSummary: {
        goal: 'goal 1',
        recentTopic: 'topic 1',
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
      charCountSnapshot: 1000,
      schemaVersion: 999,
      status: 'valid',
      invalidReason: undefined
    } as never);

    const record = await chatCompressionRecordsStorage.getLatestValidRecord('session-1');
    // 不支持的 schema version 应被过滤
    expect(record).toBeUndefined();
  });

  it('creates and persists a compression record with unique ID and timestamps', async () => {
    localStorage.clear();
    const { chatCompressionRecordsStorage } = await import('@/shared/storage/chat-compression-records');

    const record = await chatCompressionRecordsStorage.createRecord({
      sessionId: 'session-1',
      buildMode: 'incremental',
      coveredStartMessageId: 'm1',
      coveredEndMessageId: 'm10',
      coveredUntilMessageId: 'm10',
      sourceMessageIds: ['m1'],
      preservedMessageIds: [],
      recordText: 'test summary',
      structuredSummary: {
        goal: 'goal',
        recentTopic: 'topic',
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
      charCountSnapshot: 1000,
      schemaVersion: 1,
      status: 'valid',
      invalidReason: undefined
    });

    expect(record.id).toBeDefined();
    expect(record.id).toMatch(/^compression-record-/);
    expect(record.createdAt).toBeDefined();
    expect(record.updatedAt).toBeDefined();
    expect(record.sessionId).toBe('session-1');
    expect(record.recordText).toBe('test summary');
  });

  it('updates record status and invalidReason', async () => {
    localStorage.clear();
    const { chatCompressionRecordsStorage } = await import('@/shared/storage/chat-compression-records');

    const record = await chatCompressionRecordsStorage.createRecord({
      sessionId: 'session-1',
      buildMode: 'incremental',
      coveredStartMessageId: 'm1',
      coveredEndMessageId: 'm10',
      coveredUntilMessageId: 'm10',
      sourceMessageIds: ['m1'],
      preservedMessageIds: [],
      recordText: 'test',
      structuredSummary: {
        goal: 'goal',
        recentTopic: 'topic',
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
      charCountSnapshot: 1000,
      schemaVersion: 1,
      status: 'valid',
      invalidReason: undefined
    });

    await chatCompressionRecordsStorage.updateRecordStatus(record.id, 'invalid', 'test_reason');

    const allRecords = await chatCompressionRecordsStorage.getAllRecords('session-1');
    const updated = allRecords.find((s) => s.id === record.id);
    expect(updated?.status).toBe('invalid');
    expect(updated?.invalidReason).toBe('test_reason');
  });

  it('returns all records for a session', async () => {
    localStorage.clear();
    const { chatCompressionRecordsStorage } = await import('@/shared/storage/chat-compression-records');

    const baseRecord = {
      buildMode: 'incremental' as const,
      coveredStartMessageId: 'm1',
      coveredEndMessageId: 'm10',
      coveredUntilMessageId: 'm10',
      sourceMessageIds: ['m1'],
      preservedMessageIds: [],
      recordText: 'test',
      structuredSummary: {
        goal: 'goal',
        recentTopic: 'topic',
        userPreferences: [],
        constraints: [],
        decisions: [],
        importantFacts: [],
        fileContext: [],
        openQuestions: [],
        pendingActions: []
      },
      triggerReason: 'message_count' as const,
      messageCountSnapshot: 10,
      charCountSnapshot: 1000,
      schemaVersion: 1,
      status: 'valid' as const,
      invalidReason: undefined
    };

    await chatCompressionRecordsStorage.createRecord({ ...baseRecord, sessionId: 'session-1' });
    await chatCompressionRecordsStorage.createRecord({ ...baseRecord, sessionId: 'session-1' });
    await chatCompressionRecordsStorage.createRecord({ ...baseRecord, sessionId: 'session-2' });

    const session1Records = await chatCompressionRecordsStorage.getAllRecords('session-1');
    expect(session1Records).toHaveLength(2);

    const session2Records = await chatCompressionRecordsStorage.getAllRecords('session-2');
    expect(session2Records).toHaveLength(1);
  });

  it('skips superseded and invalid records when getting the latest valid record', async () => {
    localStorage.clear();
    const { chatCompressionRecordsStorage } = await import('@/shared/storage/chat-compression-records');

    const baseRecord = {
      sessionId: 'session-1',
      buildMode: 'incremental' as const,
      coveredStartMessageId: 'm1',
      coveredEndMessageId: 'm10',
      coveredUntilMessageId: 'm10',
      sourceMessageIds: ['m1'],
      preservedMessageIds: [],
      structuredSummary: {
        goal: 'goal',
        recentTopic: 'topic',
        userPreferences: [],
        constraints: [],
        decisions: [],
        importantFacts: [],
        fileContext: [],
        openQuestions: [],
        pendingActions: []
      },
      triggerReason: 'message_count' as const,
      messageCountSnapshot: 10,
      charCountSnapshot: 1000,
      schemaVersion: 1,
      invalidReason: undefined
    };

    const r1 = await chatCompressionRecordsStorage.createRecord({ ...baseRecord, recordText: 'superseded', status: 'valid' });
    await chatCompressionRecordsStorage.updateRecordStatus(r1.id, 'superseded');

    await chatCompressionRecordsStorage.createRecord({ ...baseRecord, recordText: 'invalid one', status: 'invalid' });

    const valid = await chatCompressionRecordsStorage.createRecord({ ...baseRecord, recordText: 'the valid one', status: 'valid' });

    const result = await chatCompressionRecordsStorage.getLatestValidRecord('session-1');
    expect(result?.id).toBe(valid.id);
    expect(result?.recordText).toBe('the valid one');
  });

  it('marks malformed structured summaries invalid instead of fabricating empty data', async () => {
    // 模拟 SQLite 返回格式错误的行
    dbSelectMock.mockResolvedValue([
      {
        id: 'record-1',
        session_id: 'session-1',
        build_mode: 'incremental',
        derived_from_record_id: null,
        covered_start_message_id: 'm1',
        covered_end_message_id: 'm10',
        covered_until_message_id: 'm10',
        source_message_ids_json: '["m1"]',
        preserved_message_ids_json: '[]',
        record_text: 'test',
        structured_summary_json: '{bad json}',
        trigger_reason: 'message_count',
        message_count_snapshot: 10,
        char_count_snapshot: 1000,
        token_count_snapshot: null,
        schema_version: 1,
        status: 'valid',
        invalid_reason: null,
        degrade_reason: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        record_set_id: null,
        segment_index: null,
        segment_count: null,
        topic_tags_json: null
      }
    ]);

    isDatabaseAvailableMock.mockReturnValue(true);

    const { chatCompressionRecordsStorage } = await import('@/shared/storage/chat-compression-records');
    const record = await chatCompressionRecordsStorage.getLatestValidRecord('session-1');

    // 格式错误的压缩记录应返回 undefined
    expect(record).toBeUndefined();
    // 应该调用 updateRecordStatus 标记为 invalid
    expect(dbExecuteMock).toHaveBeenCalled();
  });
});
