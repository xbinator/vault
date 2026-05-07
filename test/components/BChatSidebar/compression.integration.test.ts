/**
 * @file compression.integration.test.ts
 * @description 压缩功能集成测试：测试完整的压缩流程和 UI 交互。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConversationSummaryRecord } from '@/components/BChatSidebar/utils/compression/types';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * @vitest-environment jsdom
 */

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null)
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock
});

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
  }),
  hasElectronAPI: vi.fn().mockReturnValue(false)
}));

/**
 * 创建测试用消息
 */
function createTestMessage(id: string, role: 'user' | 'assistant', content: string): Message {
  return {
    id,
    role,
    content,
    parts: [{ type: 'text', text: content }],
    createdAt: new Date().toISOString(),
    loading: false
  };
}

/**
 * 创建测试用摘要记录
 */
function createTestSummary(overrides: Partial<ConversationSummaryRecord> = {}): ConversationSummaryRecord {
  return {
    id: 'summary-1',
    sessionId: 'session-1',
    buildMode: 'incremental',
    coveredStartMessageId: 'm1',
    coveredEndMessageId: 'm30',
    coveredUntilMessageId: 'm30',
    sourceMessageIds: Array.from({ length: 30 }, (_, i) => `m${i + 1}`),
    preservedMessageIds: [],
    summaryText: 'Test summary text.',
    structuredSummary: {
      goal: 'Test goal',
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
    messageCountSnapshot: 30,
    charCountSnapshot: 50000,
    schemaVersion: 1,
    status: 'valid',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

describe('Compression Integration', () => {
  describe('useCompression hook', () => {
    it('provides compression state and methods', async () => {
      const { useCompression } = await import('@/components/BChatSidebar/hooks/useCompression');

      const messages = [createTestMessage('m1', 'user', 'Hello')];
      const compression = useCompression({
        getSessionId: () => 'session-1',
        getMessages: () => messages
      });

      expect(compression.compressing.value).toBe(false);
      expect(compression.currentSummary.value).toBeUndefined();
      expect(compression.error.value).toBeUndefined();
      expect(typeof compression.compress).toBe('function');
      expect(typeof compression.loadSummary).toBe('function');
      expect(typeof compression.clearError).toBe('function');
    });

    it('handles compression without session ID', async () => {
      const { useCompression } = await import('@/components/BChatSidebar/hooks/useCompression');

      const messages = [createTestMessage('m1', 'user', 'Hello')];
      const compression = useCompression({
        getSessionId: () => undefined,
        getMessages: () => messages
      });

      const success = await compression.compress();
      expect(success).toBe(false);
      expect(compression.error.value).toBe('没有活跃的会话');
    });

    it('handles compression with empty messages', async () => {
      const { useCompression } = await import('@/components/BChatSidebar/hooks/useCompression');

      const compression = useCompression({
        getSessionId: () => 'session-1',
        getMessages: () => []
      });

      const success = await compression.compress();
      expect(success).toBe(false);
      expect(compression.error.value).toBe('没有可压缩的消息');
    });

    it('supports manual compression even when the last message is from the assistant', async () => {
      const { useCompression } = await import('@/components/BChatSidebar/hooks/useCompression');

      const messages: Message[] = [];
      for (let i = 1; i <= 14; i += 1) {
        messages.push(createTestMessage(`m${i}`, i % 2 === 1 ? 'user' : 'assistant', `Message ${i}`));
      }

      const compression = useCompression({
        getSessionId: () => 'session-1',
        getMessages: () => messages
      });

      const success = await compression.compress();
      expect(success).toBe(true);
      expect(compression.currentSummary.value?.triggerReason).toBe('manual');
    });

    it('clears error correctly', async () => {
      const { useCompression } = await import('@/components/BChatSidebar/hooks/useCompression');

      const compression = useCompression({
        getSessionId: () => undefined,
        getMessages: () => []
      });

      await compression.compress();
      expect(compression.error.value).toBeDefined();

      compression.clearError();
      expect(compression.error.value).toBeUndefined();
    });
  });

  describe('SummaryModal component', () => {
    it('mounts correctly with summary', async () => {
      const { mount } = await import('@vue/test-utils');
      const SummaryModal = (await import('@/components/BChatSidebar/components/SummaryModal.vue')).default;

      const summary = createTestSummary();
      const wrapper = mount(SummaryModal, {
        props: {
          open: true,
          summary
        },
        global: {
          stubs: {
            BModal: {
              template: '<div class="b-modal"><slot /></div>',
              props: ['open', 'title', 'footer', 'width']
            }
          }
        }
      });

      expect(wrapper.exists()).toBe(true);
    });

    it('mounts correctly without summary', async () => {
      const { mount } = await import('@vue/test-utils');
      const SummaryModal = (await import('@/components/BChatSidebar/components/SummaryModal.vue')).default;

      const wrapper = mount(SummaryModal, {
        props: {
          open: true,
          summary: undefined
        },
        global: {
          stubs: {
            BModal: {
              template: '<div class="b-modal"><slot /></div>',
              props: ['open', 'title', 'footer', 'width']
            }
          }
        }
      });

      expect(wrapper.exists()).toBe(true);
    });
  });

  describe('useCompression.loadSummary', () => {
    it('loads valid summary from storage', async () => {
      localStorage.clear();
      const { chatSummariesStorage } = await import('@/shared/storage/chat-summaries');
      const { useCompression } = await import('@/components/BChatSidebar/hooks/useCompression');

      // 创建一个有效摘要
      await chatSummariesStorage.createSummary({
        sessionId: 'session-1',
        buildMode: 'incremental',
        coveredStartMessageId: 'm1',
        coveredEndMessageId: 'm10',
        coveredUntilMessageId: 'm10',
        sourceMessageIds: ['m1'],
        preservedMessageIds: [],
        summaryText: 'loaded summary',
        structuredSummary: {
          goal: 'test',
          recentTopic: 'testing',
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

      const compression = useCompression({
        getSessionId: () => 'session-1',
        getMessages: () => []
      });

      await compression.loadSummary();
      expect(compression.currentSummary.value).toBeDefined();
      expect(compression.currentSummary.value?.summaryText).toBe('loaded summary');
    });

    it('handles storage error gracefully', async () => {
      const { useCompression } = await import('@/components/BChatSidebar/hooks/useCompression');
      // 使用不存在的 sessionId，不应抛出异常
      const compression = useCompression({
        getSessionId: () => undefined,
        getMessages: () => []
      });

      await compression.loadSummary();
      expect(compression.currentSummary.value).toBeUndefined();
    });
  });

  describe('useCompression.compress flow', () => {
    it('calls loadSummary after successful compression', async () => {
      const { useCompression } = await import('@/components/BChatSidebar/hooks/useCompression');

      const messages: Message[] = [];
      for (let i = 1; i <= 14; i += 1) {
        messages.push(createTestMessage(`m${i}`, i % 2 === 1 ? 'user' : 'assistant', `Message ${i}`));
      }

      const compression = useCompression({
        getSessionId: () => 'session-1',
        getMessages: () => messages
      });

      const success = await compression.compress();
      expect(success).toBe(true);
      // 压缩成功后应自动加载摘要
      expect(compression.currentSummary.value).toBeDefined();
    });
  });

});
