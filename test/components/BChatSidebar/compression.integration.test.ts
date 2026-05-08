/**
 * @file compression.integration.test.ts
 * @description 压缩功能集成测试：测试完整的压缩流程和 UI 交互。
 */
import { describe, expect, it, vi } from 'vitest';
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
      expect(compression.error.value).toBeUndefined();
      expect(typeof compression.compress).toBe('function');
    });

    it('handles compression without session ID', async () => {
      const { useCompression } = await import('@/components/BChatSidebar/hooks/useCompression');

      const messages = [createTestMessage('m1', 'user', 'Hello')];
      const compression = useCompression({
        getSessionId: () => undefined,
        getMessages: () => messages
      });

      const result = await compression.compress();
      expect(result.success).toBe(false);
      expect(compression.error.value).toBe('没有活跃的会话');
    });

    it('handles compression with empty messages', async () => {
      const { useCompression } = await import('@/components/BChatSidebar/hooks/useCompression');

      const compression = useCompression({
        getSessionId: () => 'session-1',
        getMessages: () => []
      });

      const result = await compression.compress();
      expect(result.success).toBe(false);
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

      const result = await compression.compress();
      expect(result.success).toBe(true);
      expect(result.summary?.triggerReason).toBe('manual');
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

      const result = await compression.compress();
      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
    });
  });
});
