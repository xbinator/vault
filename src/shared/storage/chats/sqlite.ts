import type { AIUsage } from 'types/ai';
import type { ChatMessageFile, ChatMessageRecord, ChatSession, ChatSessionType } from 'types/chat';
import { local } from '@/shared/storage/base';
import { getElectronAPI, hasElectronAPI } from '../../platform/electron-api';

const CHAT_SESSIONS_STORAGE_KEY = 'chat_sessions_fallback';
const CHAT_MESSAGES_STORAGE_KEY = 'chat_messages_fallback';

const SELECT_SESSIONS_BY_TYPE_SQL = `
  SELECT id, type, title, created_at, updated_at, last_message_at
  FROM chat_sessions
  WHERE type = ?
  ORDER BY last_message_at DESC, updated_at DESC, created_at DESC
`;
const SELECT_ONE_SESSION_SQL = `
  SELECT id, type, title, created_at, updated_at, last_message_at
  FROM chat_sessions
  WHERE id = ?
  LIMIT 1
`;
const UPSERT_SESSION_SQL = `
  INSERT OR REPLACE INTO chat_sessions
    (id, type, title, created_at, updated_at, last_message_at)
  VALUES (?, ?, ?, ?, ?, ?)
`;
const UPDATE_SESSION_SQL = `
  UPDATE chat_sessions
  SET title = ?, updated_at = ?, last_message_at = ?
  WHERE id = ?
`;
const DELETE_SESSION_SQL = 'DELETE FROM chat_sessions WHERE id = ?';

const SELECT_MESSAGES_BY_SESSION_SQL = `
  SELECT id, session_id, role, content, files_json, usage_json, created_at
  FROM chat_messages
  WHERE session_id = ?
  ORDER BY created_at ASC
`;
const UPSERT_MESSAGE_SQL = `
  INSERT OR REPLACE INTO chat_messages
    (id, session_id, role, content, files_json, usage_json, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;
const DELETE_MESSAGE_SQL = 'DELETE FROM chat_messages WHERE id = ?';
const DELETE_MESSAGES_BY_SESSION_SQL = 'DELETE FROM chat_messages WHERE session_id = ?';

interface ChatSessionRow {
  id: string;
  type: string;
  title: string;
  created_at: number;
  updated_at: number;
  last_message_at: number;
}

interface ChatMessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  files_json: string | null;
  usage_json: string | null;
  created_at: number;
}

interface FallbackMessagesMap {
  [sessionId: string]: ChatMessageRecord[] | undefined;
}

interface UpdateChatSessionPayload {
  title: string;
  updatedAt: number;
  lastMessageAt: number;
}

function isChatSessionType(value: string): value is ChatSessionType {
  return ['chat', 'document', 'assistant', 'workflow'].includes(value);
}

function dbAvailable(): boolean {
  return hasElectronAPI();
}

async function dbSelect<T>(sql: string, params?: unknown[]): Promise<T[]> {
  if (!dbAvailable()) return [];
  return getElectronAPI().dbSelect<T>(sql, params);
}

async function dbExecute(sql: string, params?: unknown[]): Promise<void> {
  if (!dbAvailable()) return;
  await getElectronAPI().dbExecute(sql, params);
}

function parseJsonValue<T>(json: string | null): T | undefined {
  if (!json) return undefined;

  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

function serializeJsonValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function mapSessionRow(row: ChatSessionRow): ChatSession | null {
  if (!isChatSessionType(row.type)) return null;

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at
  };
}

function mapMessageRow(row: ChatMessageRow): ChatMessageRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
    files: parseJsonValue<ChatMessageFile[]>(row.files_json),
    usage: parseJsonValue<AIUsage>(row.usage_json),
    createdAt: row.created_at
  };
}

function loadFallbackSessions(): ChatSession[] {
  return local.getItem<ChatSession[]>(CHAT_SESSIONS_STORAGE_KEY) ?? [];
}

function saveFallbackSessions(sessions: ChatSession[]): void {
  local.setItem(CHAT_SESSIONS_STORAGE_KEY, sessions);
}

function loadFallbackMessages(): FallbackMessagesMap {
  return local.getItem<FallbackMessagesMap>(CHAT_MESSAGES_STORAGE_KEY) ?? {};
}

function saveFallbackMessages(messages: FallbackMessagesMap): void {
  local.setItem(CHAT_MESSAGES_STORAGE_KEY, messages);
}

function sortSessions(sessions: ChatSession[]): ChatSession[] {
  return [...sessions].sort((left, right) => {
    if (right.lastMessageAt !== left.lastMessageAt) return right.lastMessageAt - left.lastMessageAt;
    if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
    return right.createdAt - left.createdAt;
  });
}

function sortMessages(messages: ChatMessageRecord[]): ChatMessageRecord[] {
  return [...messages].sort((left, right) => left.createdAt - right.createdAt);
}

export const chatStorage = {
  async getSessionsByType(type: ChatSessionType): Promise<ChatSession[]> {
    if (!dbAvailable()) {
      return sortSessions(loadFallbackSessions().filter((item) => item.type === type));
    }

    const rows = await dbSelect<ChatSessionRow>(SELECT_SESSIONS_BY_TYPE_SQL, [type]);
    return rows.map(mapSessionRow).filter((item): item is ChatSession => item !== null);
  },

  async getSession(id: string): Promise<ChatSession | null> {
    if (!dbAvailable()) {
      return loadFallbackSessions().find((item) => item.id === id) ?? null;
    }

    const rows = await dbSelect<ChatSessionRow>(SELECT_ONE_SESSION_SQL, [id]);
    return rows[0] ? mapSessionRow(rows[0]) : null;
  },

  async createSession(session: ChatSession): Promise<void> {
    if (!dbAvailable()) {
      const sessions = loadFallbackSessions().filter((item) => item.id !== session.id);
      sessions.unshift(session);
      saveFallbackSessions(sortSessions(sessions));
      return;
    }

    await dbExecute(UPSERT_SESSION_SQL, [session.id, session.type, session.title, session.createdAt, session.updatedAt, session.lastMessageAt]);
  },

  async updateSession(id: string, payload: UpdateChatSessionPayload): Promise<void> {
    if (!dbAvailable()) {
      const sessions = loadFallbackSessions();
      const index = sessions.findIndex((item) => item.id === id);
      if (index === -1) return;

      sessions[index] = { ...sessions[index], title: payload.title, updatedAt: payload.updatedAt, lastMessageAt: payload.lastMessageAt };
      saveFallbackSessions(sortSessions(sessions));
      return;
    }

    await dbExecute(UPDATE_SESSION_SQL, [payload.title, payload.updatedAt, payload.lastMessageAt, id]);
  },

  async deleteSession(id: string): Promise<void> {
    if (!dbAvailable()) {
      const sessions = loadFallbackSessions().filter((item) => item.id !== id);
      const messages = loadFallbackMessages();
      delete messages[id];
      saveFallbackSessions(sessions);
      saveFallbackMessages(messages);
      return;
    }

    await dbExecute(DELETE_MESSAGES_BY_SESSION_SQL, [id]);
    await dbExecute(DELETE_SESSION_SQL, [id]);
  },

  async getMessages(sessionId: string): Promise<ChatMessageRecord[]> {
    if (!dbAvailable()) {
      const messages = loadFallbackMessages()[sessionId] ?? [];
      return sortMessages(messages);
    }

    const rows = await dbSelect<ChatMessageRow>(SELECT_MESSAGES_BY_SESSION_SQL, [sessionId]);
    return rows.map(mapMessageRow);
  },

  async saveMessage(message: ChatMessageRecord): Promise<void> {
    if (!dbAvailable()) {
      const messages = loadFallbackMessages();
      const sessionMessages = messages[message.sessionId] ?? [];
      const nextMessages = sessionMessages.filter((item) => item.id !== message.id);
      nextMessages.push(message);
      messages[message.sessionId] = sortMessages(nextMessages);
      saveFallbackMessages(messages);
      return;
    }

    await dbExecute(UPSERT_MESSAGE_SQL, [
      message.id,
      message.sessionId,
      message.role,
      message.content,
      serializeJsonValue(message.files),
      serializeJsonValue(message.usage),
      message.createdAt
    ]);
  },

  async replaceMessages(sessionId: string, messages: ChatMessageRecord[]): Promise<void> {
    if (!dbAvailable()) {
      const allMessages = loadFallbackMessages();
      allMessages[sessionId] = sortMessages(messages);
      saveFallbackMessages(allMessages);
      return;
    }

    await dbExecute(DELETE_MESSAGES_BY_SESSION_SQL, [sessionId]);

    for (const message of messages) {
      await dbExecute(UPSERT_MESSAGE_SQL, [
        message.id,
        message.sessionId,
        message.role,
        message.content,
        serializeJsonValue(message.files),
        serializeJsonValue(message.usage),
        message.createdAt
      ]);
    }
  },

  async deleteMessage(id: string, sessionId: string): Promise<void> {
    if (!dbAvailable()) {
      const messages = loadFallbackMessages();
      messages[sessionId] = (messages[sessionId] ?? []).filter((item) => item.id !== id);
      saveFallbackMessages(messages);
      return;
    }

    await dbExecute(DELETE_MESSAGE_SQL, [id]);
  },

  async getSessionUsage(sessionId: string): Promise<AIUsage> {
    const messages = await this.getMessages(sessionId);

    return messages.reduce<AIUsage>(
      (usage, message) => ({
        inputTokens: usage.inputTokens + (message.usage?.inputTokens ?? 0),
        outputTokens: usage.outputTokens + (message.usage?.outputTokens ?? 0),
        totalTokens: usage.totalTokens + (message.usage?.totalTokens ?? 0)
      }),
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    );
  }
};
