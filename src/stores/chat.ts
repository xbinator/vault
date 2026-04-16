/**
 * 聊天会话状态管理
 * 负责处理聊天会话的创建、切换、消息管理等功能
 */
import type { AIUsage } from 'types/ai';
import type { ChatMessageRecord, ChatSession, ChatSessionType } from 'types/chat';
import { defineStore } from 'pinia';
import { nanoid } from 'nanoid';
import type { Message } from '@/components/BChat/types';
import { chatStorage } from '@/shared/storage';

/**
 * 聊天状态接口
 */
interface ChatState {
  /** 当前活动的会话类型 */
  activeType: ChatSessionType;
  /** 所有会话列表 */
  sessions: ChatSession[];
  /** 按会话ID存储的消息列表 */
  messagesBySessionId: Record<string, Message[]>;
  /** 已初始化的会话类型列表 */
  initializedTypes: ChatSessionType[];
}

/**
 * 判断消息是否可持久化
 * @param message 消息对象
 * @returns 是否可持久化
 */
function isPersistableMessage(message: Message): boolean {
  // 过滤掉正在加载且内容为空的助手消息
  if (message.role === 'assistant' && message.loading && !message.content.trim()) {
    return false;
  }

  return true;
}

/**
 * 将消息转换为存储格式
 * @param sessionId 会话ID
 * @param message 消息对象
 * @returns 存储格式的消息记录
 */
function toStoredMessage(sessionId: string, message: Message): ChatMessageRecord {
  return {
    id: message.id,
    sessionId,
    role: message.role,
    content: message.content,
    files: message.files,
    usage: message.usage,
    createdAt: message.createdAt
  };
}

/**
 * 将存储格式的消息转换为视图格式
 * @param message 存储格式的消息记录
 * @returns 视图格式的消息对象
 */
function toViewMessage(message: ChatMessageRecord): Message {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    files: message.files,
    usage: message.usage,
    createdAt: message.createdAt,
    finished: true
  };
}

/**
 * 根据消息构建会话标题
 * @param messages 消息列表
 * @returns 会话标题
 */
function buildSessionTitle(messages: Message[]): string {
  // 查找第一条非空用户消息作为标题
  const firstUserMessage = messages.find((item) => item.role === 'user' && item.content.trim());

  if (!firstUserMessage) return '新对话';

  // 提取消息内容前30个字符作为标题
  const title = firstUserMessage.content.replace(/\s+/g, ' ').trim().slice(0, 30);
  return title || '新对话';
}

/**
 * 获取会话的时间信息
 * @param messages 消息列表
 * @param fallback  fallback时间戳
 * @returns 会话的更新时间和最后消息时间
 */
function getSessionTimes(messages: Message[], fallback: number): Pick<ChatSession, 'updatedAt' | 'lastMessageAt'> {
  // 找到最后一条消息
  const lastMessage = [...messages].sort((left, right) => right.createdAt - left.createdAt)[0];
  const timestamp = lastMessage?.createdAt ?? fallback;

  return {
    updatedAt: timestamp,
    lastMessageAt: timestamp
  };
}

/**
 * 聊天会话状态管理Store
 */
export const useChatStore = defineStore('chat', {
  /**
   * 状态定义
   */
  state: (): ChatState => ({
    activeType: 'chat',
    sessions: [],
    messagesBySessionId: {},
    initializedTypes: []
  }),

  /**
   * 计算属性
   */
  getters: {
    /**
     * 获取按时间排序的会话列表
     * @param state 状态对象
     * @returns 排序后的会话列表
     */
    sortedSessions(state): ChatSession[] {
      return [...state.sessions].sort((left, right) => {
        // 按最后消息时间排序
        if (right.lastMessageAt !== left.lastMessageAt) return right.lastMessageAt - left.lastMessageAt;
        // 按更新时间排序
        if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
        // 按创建时间排序
        return right.createdAt - left.createdAt;
      });
    }
  },

  /**
   * 动作方法
   */
  actions: {
    /**
     * 初始化指定类型的会话
     * @param type 会话类型，默认为'chat'
     */
    async initialize(type: ChatSessionType = 'chat'): Promise<void> {
      this.activeType = type;
      // 刷新会话列表
      await this.refreshSessions(type);

      // 标记该类型已初始化
      if (!this.initializedTypes.includes(type)) {
        this.initializedTypes.push(type);
      }
    },

    /**
     * 刷新指定类型的会话列表
     * @param type 会话类型，默认为当前活动类型
     */
    async refreshSessions(type?: ChatSessionType): Promise<void> {
      const targetType = type ?? this.activeType;
      const sessions = await chatStorage.getSessionsByType(targetType);
      // 只有当目标类型是当前活动类型时才更新会话列表
      if (targetType === this.activeType) {
        this.sessions = sessions;
      }
    },

    /**
     * 创建新会话
     * @param type 会话类型，默认为当前活动类型
     * @returns 新会话ID
     */
    async createSession(type?: ChatSessionType): Promise<string> {
      const targetType = type ?? this.activeType;
      const now = Date.now();
      // 创建新会话对象
      const session: ChatSession = {
        id: nanoid(),
        type: targetType,
        title: '新对话',
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now
      };

      // 保存到存储
      await chatStorage.createSession(session);

      // 如果是当前活动类型，则更新会话列表
      if (targetType === this.activeType) {
        this.sessions = [session, ...this.sessions.filter((item) => item.id !== session.id)];
      }

      // 初始化消息列表
      this.messagesBySessionId[session.id] = [];
      // 设置活动类型
      this.activeType = targetType;

      return session.id;
    },

    async loadSessionMessages(sessionId: string): Promise<Message[]> {
      if (this.messagesBySessionId[sessionId]) {
        return this.messagesBySessionId[sessionId];
      }

      const messages = await chatStorage.getMessages(sessionId);
      this.messagesBySessionId[sessionId] = messages.map(toViewMessage);
      return this.messagesBySessionId[sessionId];
    },

    /**
     * 设置会话消息
     * @param sessionId 会话ID
     * @param messages 消息列表
     * @param persist 是否持久化，默认为true
     */
    async setSessionMessages(sessionId: string | null, messages: Message[], persist = true) {
      if (!sessionId) return;

      // 更新消息列表
      this.messagesBySessionId[sessionId] = [...messages];
      // 同步会话快照
      this.syncSessionSnapshot(sessionId);

      // 如果需要持久化，则保存到存储
      persist && (await this.persistSession(sessionId));
    },

    /**
     * 追加消息到会话
     * @param sessionId 会话ID
     * @param message 消息对象
     * @param persist 是否持久化，默认为true
     */
    async appendMessage(sessionId: string | null, message: Message, persist = true) {
      if (!sessionId) return;

      // 获取当前消息列表
      const currentMessages = this.messagesBySessionId[sessionId] ?? [];
      // 追加消息并保存
      await this.setSessionMessages(sessionId, [...currentMessages, message], persist);
    },

    /**
     * 更新消息
     * @param sessionId 会话ID
     * @param messageId 消息ID
     * @param patch 要更新的消息属性
     * @param persist 是否持久化，默认为true
     */
    async updateMessage(sessionId: string, messageId: string, patch: Partial<Message>, persist = true): Promise<void> {
      // 获取当前消息列表
      const currentMessages = this.messagesBySessionId[sessionId] ?? [];
      // 查找消息索引
      const index = currentMessages.findIndex((item) => item.id === messageId);
      if (index === -1) return;

      // 更新消息
      const nextMessages = [...currentMessages];
      nextMessages[index] = { ...nextMessages[index], ...patch };
      // 保存更新后的消息列表
      await this.setSessionMessages(sessionId, nextMessages, persist);
    },

    /**
     * 截断消息列表，保留指定消息之前的消息
     * @param sessionId 会话ID
     * @param fromMessageId 起始消息ID
     * @param persist 是否持久化，默认为true
     */
    async truncateMessages(sessionId: string, fromMessageId: string, persist = true): Promise<void> {
      // 获取当前消息列表
      const currentMessages = this.messagesBySessionId[sessionId] ?? [];
      // 查找消息索引
      const index = currentMessages.findIndex((item) => item.id === fromMessageId);
      if (index === -1) return;

      // 截断消息列表并保存
      await this.setSessionMessages(sessionId, currentMessages.slice(0, index), persist);
    },

    /**
     * 根据会话ID获取消息列表
     * @param sessionId 会话ID
     * @returns 消息列表
     */
    getMessagesBySessionId(sessionId?: string | null): Message[] {
      if (!sessionId) return [];

      if (!this.messagesBySessionId[sessionId]) {
        this.messagesBySessionId[sessionId] = [];
      }

      return this.messagesBySessionId[sessionId];
    },

    /**
     * 持久化会话
     * @param sessionId 会话ID
     */
    async persistSession(sessionId: string): Promise<void> {
      // 查找会话
      const session = this.sessions.find((item) => item.id === sessionId);
      if (!session) return;

      // 获取消息列表
      const messages = this.messagesBySessionId[sessionId] ?? [];
      // 过滤可持久化的消息并转换为存储格式
      const persistableMessages = messages.filter(isPersistableMessage).map((item) => toStoredMessage(sessionId, item));
      // 构建会话标题
      const nextTitle = buildSessionTitle(messages);
      // 获取会话时间信息
      const nextTimes = getSessionTimes(messages, session.createdAt);

      // 保存消息到存储
      await chatStorage.replaceMessages(sessionId, persistableMessages);
      // 更新会话信息
      await chatStorage.updateSession(sessionId, {
        title: nextTitle,
        updatedAt: nextTimes.updatedAt,
        lastMessageAt: nextTimes.lastMessageAt
      });

      // 更新内存中的会话信息
      this.sessions = this.sessions.map((item) =>
        item.id === sessionId ? { ...item, title: nextTitle, updatedAt: nextTimes.updatedAt, lastMessageAt: nextTimes.lastMessageAt } : item
      );
    },

    /**
     * 删除会话
     * @param id 会话ID
     */
    async deleteSession(id: string): Promise<void> {
      // 从存储中删除会话
      await chatStorage.deleteSession(id);

      // 从内存中删除会话和消息
      delete this.messagesBySessionId[id];
      this.sessions = this.sessions.filter((item) => item.id !== id);
    },

    /**
     * 重命名会话
     * @param id 会话ID
     * @param title 新标题
     */
    async renameSession(id: string, title: string): Promise<void> {
      // 查找会话
      const session = this.sessions.find((item) => item.id === id);
      if (!session) return;

      // 处理标题
      const nextTitle = title.trim();
      if (!nextTitle || nextTitle === session.title) return;

      const updatedAt = Date.now();

      // 更新会话信息到存储
      await chatStorage.updateSession(id, {
        title: nextTitle,
        updatedAt,
        lastMessageAt: session.lastMessageAt
      });

      // 更新内存中的会话信息
      this.sessions = this.sessions.map((item) => (item.id === id ? { ...item, title: nextTitle, updatedAt } : item));
    },

    /**
     * 获取会话的AI使用情况
     * @param sessionId 会话ID
     * @returns AI使用情况
     */
    async getSessionUsage(sessionId: string): Promise<AIUsage> {
      return chatStorage.getSessionUsage(sessionId);
    },

    /**
     * 同步会话快照
     * @param sessionId 会话ID
     */
    syncSessionSnapshot(sessionId: string): void {
      // 查找会话
      const session = this.sessions.find((item) => item.id === sessionId);
      if (!session) return;

      // 获取消息列表
      const messages = this.messagesBySessionId[sessionId] ?? [];
      // 构建会话标题
      const nextTitle = buildSessionTitle(messages);
      // 获取会话时间信息
      const nextTimes = getSessionTimes(messages, session.createdAt);

      // 更新会话信息并重新排序
      this.sessions = this.sortedSessions
        .map((item) => (item.id === sessionId ? { ...item, title: nextTitle, updatedAt: nextTimes.updatedAt, lastMessageAt: nextTimes.lastMessageAt } : item))
        .sort((left, right) => right.lastMessageAt - left.lastMessageAt);
    },

    /**
     * 创建消息对象
     * @param payload 消息参数
     * @returns 消息对象
     */
    createMessage(payload: Omit<Message, 'id'> & { id?: string }): Message {
      return {
        id: payload.id ?? nanoid(),
        role: payload.role,
        content: payload.content,
        files: payload.files,
        usage: payload.usage,
        createdAt: payload.createdAt,
        loading: payload.loading,
        finished: payload.finished,
        error: payload.error
      };
    }
  }
});
