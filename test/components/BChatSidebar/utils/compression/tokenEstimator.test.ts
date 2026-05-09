/**
 * @file tokenEstimator.test.ts
 * @description TokenEstimator 模块测试：消息哈希与 token 估算缓存失效判断。
 */
import { describe, expect, it } from 'vitest';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * 创建测试用基础消息。
 */
function makeMsg(overrides: Partial<Message> & { id: string; content: string }): Message {
  return {
    role: 'user',
    parts: [{ type: 'text', text: overrides.content } as never],
    loading: false,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

describe('buildMessageContentHash', () => {
  it('changes when content changes even if content length and part count stay the same', async () => {
    const { buildMessageContentHash } = await import('@/components/BChatSidebar/utils/compression/tokenEstimator');

    const first = makeMsg({ id: 'm1', content: 'abcd' });
    const second = makeMsg({ id: 'm1', content: 'wxyz' });

    expect(buildMessageContentHash(first)).not.toBe(buildMessageContentHash(second));
  });
});
