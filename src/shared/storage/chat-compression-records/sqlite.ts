/**
 * @file sqlite.ts
 * @description 聊天会话压缩记录的 SQLite 存储实现。
 */
import dayjs from 'dayjs';
import { cloneDeep, orderBy } from 'lodash-es';
import { CURRENT_SCHEMA_VERSION } from '@/components/BChatSidebar/utils/compression/constant';
import type {
  CompressionBuildMode,
  CompressionRecord,
  CompressionRecordStatus,
  CompressionRecordStorage,
  StructuredConversationSummary,
  TriggerReason
} from '@/components/BChatSidebar/utils/compression/types';
import { local } from '@/shared/storage/base';
import { dbExecute, dbSelect, isDatabaseAvailable, parseJson, stringifyJson } from '../utils';

const CHAT_COMPRESSION_RECORDS_STORAGE_KEY = 'chat_session_compression_records_fallback';

const SELECT_LATEST_VALID_RECORD_SQL = `
  SELECT *
  FROM chat_session_compression_records
  WHERE session_id = ? AND status = 'valid'
  ORDER BY created_at DESC
  LIMIT 1
`;

const INSERT_RECORD_SQL = `
  INSERT INTO chat_session_compression_records (
    id, session_id, build_mode, derived_from_record_id,
    covered_start_message_id, covered_end_message_id, covered_until_message_id,
    source_message_ids_json, preserved_message_ids_json,
    record_text, structured_summary_json,
    trigger_reason, message_count_snapshot, char_count_snapshot, token_count_snapshot,
    schema_version, status, invalid_reason, degrade_reason,
    record_set_id, segment_index, segment_count, topic_tags_json,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const UPDATE_RECORD_STATUS_SQL = `
  UPDATE chat_session_compression_records
  SET status = ?, invalid_reason = ?, updated_at = ?
  WHERE id = ?
`;

const SELECT_ALL_RECORDS_SQL = `
  SELECT *
  FROM chat_session_compression_records
  WHERE session_id = ?
  ORDER BY created_at DESC
`;

/**
 * 压缩记录数据表行。
 */
interface ChatCompressionRecordRow {
  /** 压缩记录 ID */
  id: string;
  /** 会话 ID */
  session_id: string;
  /** 构建模式 */
  build_mode: string;
  /** 上一条压缩记录 ID */
  derived_from_record_id: string | null;
  /** 覆盖起点消息 ID */
  covered_start_message_id: string;
  /** 覆盖终点消息 ID */
  covered_end_message_id: string;
  /** 覆盖边界消息 ID */
  covered_until_message_id: string;
  /** 源消息 ID 列表 JSON */
  source_message_ids_json: string;
  /** 保留消息 ID 列表 JSON */
  preserved_message_ids_json: string;
  /** 可读压缩记录文本 */
  record_text: string;
  /** 结构化摘要 JSON */
  structured_summary_json: string;
  /** 触发原因 */
  trigger_reason: string;
  /** 消息轮数快照 */
  message_count_snapshot: number;
  /** 字符体积快照 */
  char_count_snapshot: number;
  /** token 体积快照 */
  token_count_snapshot: number | null;
  /** schema 版本 */
  schema_version: number;
  /** 状态 */
  status: string;
  /** 失效原因 */
  invalid_reason: string | null;
  /** 降级原因 */
  degrade_reason: string | null;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
  /** 记录集 ID */
  record_set_id: string | null;
  /** 分段索引 */
  segment_index: number | null;
  /** 分段总数 */
  segment_count: number | null;
  /** 主题标签 JSON */
  topic_tags_json: string | null;
}

/**
 * 解析并验证结构化摘要 JSON。
 * @param row - 数据库行
 * @returns 合法的结构化摘要，不合法时返回 null
 */
function parseStructuredSummary(row: ChatCompressionRecordRow): StructuredConversationSummary | null {
  if (row.schema_version !== CURRENT_SCHEMA_VERSION && row.schema_version !== 1) {
    return null;
  }

  const parsed = parseJson<StructuredConversationSummary>(row.structured_summary_json);
  if (!parsed) {
    return null;
  }

  if (typeof parsed.goal !== 'string' || typeof parsed.recentTopic !== 'string') {
    return null;
  }

  const arrayFields: (keyof StructuredConversationSummary)[] = [
    'userPreferences',
    'constraints',
    'decisions',
    'importantFacts',
    'fileContext',
    'openQuestions',
    'pendingActions'
  ];

  for (const field of arrayFields) {
    if (!Array.isArray(parsed[field])) {
      return null;
    }
  }

  return parsed;
}

/**
 * 将数据库行映射为压缩记录对象。
 * @param row - 数据库行
 * @returns 压缩记录，不合法时返回 null
 */
function mapRowToRecord(row: ChatCompressionRecordRow): CompressionRecord | null {
  const parsedSummary = parseStructuredSummary(row);
  if (!parsedSummary) {
    return null;
  }

  const isV1 = row.schema_version === 1;

  return {
    id: row.id,
    sessionId: row.session_id,
    buildMode: row.build_mode as CompressionBuildMode,
    derivedFromRecordId: row.derived_from_record_id ?? undefined,
    coveredStartMessageId: row.covered_start_message_id,
    coveredEndMessageId: row.covered_end_message_id,
    coveredUntilMessageId: row.covered_until_message_id,
    sourceMessageIds: parseJson<string[]>(row.source_message_ids_json) ?? [],
    preservedMessageIds: parseJson<string[]>(row.preserved_message_ids_json) ?? [],
    recordText: row.record_text,
    structuredSummary: parsedSummary,
    triggerReason: row.trigger_reason as TriggerReason,
    messageCountSnapshot: row.message_count_snapshot,
    charCountSnapshot: row.char_count_snapshot,
    tokenCountSnapshot: row.token_count_snapshot ?? undefined,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    status: isV1 ? 'valid' : (row.status as CompressionRecordStatus),
    invalidReason: row.invalid_reason ?? undefined,
    degradeReason: (row.degrade_reason as 'degraded_to_incremental' | null) ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recordSetId: row.record_set_id ?? row.id,
    segmentIndex: row.segment_index ?? 0,
    segmentCount: row.segment_count ?? 1,
    topicTags: parseJson<string[]>(row.topic_tags_json) ?? [],
    relevanceEmbedding: undefined
  };
}

/**
 * 聊天会话压缩记录存储实现。
 */
export const chatCompressionRecordsStorage: CompressionRecordStorage = {
  /**
   * 获取会话最新有效压缩记录。
   * @param sessionId - 会话 ID
   * @returns 最新有效压缩记录
   */
  async getLatestValidRecord(sessionId: string): Promise<CompressionRecord | undefined> {
    if (isDatabaseAvailable()) {
      const rows = await dbSelect<ChatCompressionRecordRow>(SELECT_LATEST_VALID_RECORD_SQL, [sessionId]);
      const invalidRowIds: string[] = [];
      let latestValidRecord: CompressionRecord | undefined;

      for (const row of rows) {
        const parsed = mapRowToRecord(row);
        if (parsed) {
          latestValidRecord = parsed;
          break;
        }
        invalidRowIds.push(row.id);
      }

      await Promise.all(invalidRowIds.map((id) => chatCompressionRecordsStorage.updateRecordStatus(id, 'invalid', 'unsupported_schema_version')));

      return latestValidRecord;
    }

    const allRecords = local.getItem<CompressionRecord[]>(CHAT_COMPRESSION_RECORDS_STORAGE_KEY) ?? [];
    const validRecords = allRecords.filter((record) => {
      return record.sessionId === sessionId && record.status === 'valid' && (record.schemaVersion === CURRENT_SCHEMA_VERSION || record.schemaVersion === 1);
    });
    const [latestRecord] = orderBy(validRecords, ['createdAt'], ['desc']);
    return latestRecord;
  },

  /**
   * 创建压缩记录。
   * @param record - 待持久化的压缩记录
   * @returns 带主键和时间戳的压缩记录
   */
  async createRecord(record: Omit<CompressionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<CompressionRecord> {
    const now = dayjs().toISOString();
    const newRecord: CompressionRecord = {
      ...record,
      id: `compression-record-${dayjs().valueOf()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: now,
      updatedAt: now
    };

    if (isDatabaseAvailable()) {
      await dbExecute(INSERT_RECORD_SQL, [
        newRecord.id,
        newRecord.sessionId,
        newRecord.buildMode,
        newRecord.derivedFromRecordId ?? null,
        newRecord.coveredStartMessageId,
        newRecord.coveredEndMessageId,
        newRecord.coveredUntilMessageId,
        stringifyJson(newRecord.sourceMessageIds),
        stringifyJson(newRecord.preservedMessageIds),
        newRecord.recordText,
        stringifyJson(newRecord.structuredSummary),
        newRecord.triggerReason,
        newRecord.messageCountSnapshot,
        newRecord.charCountSnapshot,
        newRecord.tokenCountSnapshot ?? null,
        newRecord.schemaVersion,
        newRecord.status,
        newRecord.invalidReason ?? null,
        newRecord.degradeReason ?? null,
        newRecord.recordSetId ?? null,
        newRecord.segmentIndex ?? null,
        newRecord.segmentCount ?? null,
        stringifyJson(newRecord.topicTags ?? []),
        newRecord.createdAt,
        newRecord.updatedAt
      ]);
    } else {
      const allRecords = local.getItem<CompressionRecord[]>(CHAT_COMPRESSION_RECORDS_STORAGE_KEY) ?? [];
      allRecords.push(newRecord);
      local.setItem(CHAT_COMPRESSION_RECORDS_STORAGE_KEY, allRecords);
    }

    return newRecord;
  },

  /**
   * 更新压缩记录状态。
   * @param id - 压缩记录 ID
   * @param status - 新状态
   * @param invalidReason - 失效原因
   */
  async updateRecordStatus(id: string, status: CompressionRecordStatus, invalidReason?: string): Promise<void> {
    const now = dayjs().toISOString();

    if (isDatabaseAvailable()) {
      await dbExecute(UPDATE_RECORD_STATUS_SQL, [status, invalidReason ?? null, now, id]);
      return;
    }

    const rawRecords = local.getItem<CompressionRecord[]>(CHAT_COMPRESSION_RECORDS_STORAGE_KEY) ?? [];
    const allRecords = cloneDeep(rawRecords);
    const index = allRecords.findIndex((record) => record.id === id);
    if (index !== -1) {
      allRecords[index] = {
        ...allRecords[index],
        status,
        invalidReason,
        updatedAt: now
      };
      local.setItem(CHAT_COMPRESSION_RECORDS_STORAGE_KEY, allRecords);
    }
  },

  /**
   * 获取会话的所有压缩记录。
   * @param sessionId - 会话 ID
   * @returns 会话对应的全部压缩记录
   */
  async getAllRecords(sessionId: string): Promise<CompressionRecord[]> {
    if (isDatabaseAvailable()) {
      const rows = await dbSelect<ChatCompressionRecordRow>(SELECT_ALL_RECORDS_SQL, [sessionId]);
      return rows.map(mapRowToRecord).filter((record): record is CompressionRecord => record !== null);
    }

    const allRecords = local.getItem<CompressionRecord[]>(CHAT_COMPRESSION_RECORDS_STORAGE_KEY) ?? [];
    return allRecords.filter((record) => record.sessionId === sessionId);
  }
};
