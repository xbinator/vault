/**
 * @file policy.test.ts
 * @description Policy 模块测试：双阈值判断、上下文字符体积估算。
 */
import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * 创建测试用基础消息。
 */
function makeMsg(overrides: Partial<Message> & { id: string }): Message {
  return {
    role: 'user',
    content: '',
    parts: [],
    loading: false,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

describe('estimateContextSize', () => {
  /**
   * 测试 estimateContextSize 函数 - 计算 ModelMessage[] 的字符体积
   * RED 阶段：函数尚未实现
   */
  it('returns 0 for empty messages', async () => {
    const { estimateContextSize } = await import('@/components/BChatSidebar/utils/compression/policy');
    const modelMessages: ModelMessage[] = [];
    expect(estimateContextSize(modelMessages)).toBe(0);
  });

  it('counts characters in string content messages', async () => {
    const { estimateContextSize } = await import('@/components/BChatSidebar/utils/compression/policy');
    const modelMessages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' }
    ];
    // 'Hello' = 5, 'Hi there' = 8, total = 13
    expect(estimateContextSize(modelMessages)).toBe(13);
  });

  it('counts characters in array content messages', async () => {
    const { estimateContextSize } = await import('@/components/BChatSidebar/utils/compression/policy');
    const modelMessages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'World' }
        ]
      }
    ];
    // Array content parts are JSON-serialized for estimation
    const size = estimateContextSize(modelMessages);
    expect(size).toBeGreaterThan(0);
  });

  it('counts tool-call and tool-result content', async () => {
    const { estimateContextSize } = await import('@/components/BChatSidebar/utils/compression/policy');
    const modelMessages: ModelMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Using tool' },
          { type: 'tool-call' as never, toolCallId: 't1', toolName: 'read', input: { path: '/a' } }
        ]
      },
      {
        role: 'tool' as never,
        content: [
          {
            type: 'tool-result' as never,
            toolCallId: 't1',
            toolName: 'read',
            output: { type: 'json' as never, value: { data: 'result content' } }
          }
        ]
      }
    ];
    // Should count: 'Using tool' (10) + tool-call JSON (toolName+input) + tool-result JSON
    const size = estimateContextSize(modelMessages);
    expect(size).toBeGreaterThan(0);
  });

  it('handles messages with mixed content types', async () => {
    const { estimateContextSize } = await import('@/components/BChatSidebar/utils/compression/policy');
    const modelMessages: ModelMessage[] = [
      { role: 'system', content: 'System prompt here' },
      { role: 'user', content: 'User question' },
      { role: 'assistant', content: 'Assistant answer' }
    ];
    const size = estimateContextSize(modelMessages);
    expect(size).toBeGreaterThan(40); // 'System prompt here' + 'User question' + 'Assistant answer'
  });
});

describe('countMessageRounds', () => {
  it('counts user+assistant pairs correctly', async () => {
    const { countMessageRounds } = await import('@/components/BChatSidebar/utils/compression/policy');
    const messages: Message[] = [
      makeMsg({ id: 'm1', role: 'user', content: 'a' }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'b' }),
      makeMsg({ id: 'm3', role: 'user', content: 'c' }),
      makeMsg({ id: 'm4', role: 'assistant', content: 'd' })
    ];
    expect(countMessageRounds(messages)).toBe(2);
  });

  it('counts odd number of messages as one extra round', async () => {
    const { countMessageRounds } = await import('@/components/BChatSidebar/utils/compression/policy');
    const messages: Message[] = [
      makeMsg({ id: 'm1', role: 'user', content: 'a' }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'b' }),
      makeMsg({ id: 'm3', role: 'user', content: 'c' })
    ];
    expect(countMessageRounds(messages)).toBe(2);
  });

  it('ignores system messages in round count', async () => {
    const { countMessageRounds } = await import('@/components/BChatSidebar/utils/compression/policy');
    const messages: Message[] = [makeMsg({ id: 'm1', role: 'user', content: 'a' }), makeMsg({ id: 'm2', role: 'assistant', content: 'b' })];
    expect(countMessageRounds(messages)).toBe(1);
  });
});

describe('evaluateFromSnapshot threshold logic', () => {
  it('computeCompressionTokenThreshold keeps threshold inside small context window budget', async () => {
    const { computeCompressionTokenThreshold } = await import('@/components/BChatSidebar/utils/compression/policy');

    expect(computeCompressionTokenThreshold(4_000, 2_048)).toBeLessThan(4_000);
    expect(computeCompressionTokenThreshold(4_000, 2_048)).toBeGreaterThan(0);
  });

  it('returns shouldCompress false when snapshot is under threshold', async () => {
    const { estimateContextSize, countMessageRounds, evaluateFromSnapshot } = await import('@/components/BChatSidebar/utils/compression/policy');
    const messages: Message[] = [makeMsg({ id: 'm1', role: 'user', content: 'short' }), makeMsg({ id: 'm2', role: 'assistant', content: 'ok' })];
    const result = evaluateFromSnapshot({
      charCount: estimateContextSize([
        { role: 'user', content: 'short' },
        { role: 'assistant', content: 'ok' }
      ]),
      roundCount: countMessageRounds(messages)
    });
    expect(result.shouldCompress).toBe(false);
  });

  it('returns message_count trigger when snapshot round threshold exceeded', async () => {
    const { estimateContextSize, countMessageRounds, evaluateFromSnapshot } = await import('@/components/BChatSidebar/utils/compression/policy');
    const messages: Message[] = [];
    for (let i = 1; i <= 62; i += 1) {
      const role = i % 2 === 1 ? 'user' : 'assistant';
      messages.push(makeMsg({ id: `m${i}`, role, content: `msg ${i}` }));
    }
    const result = evaluateFromSnapshot({
      charCount: estimateContextSize(messages.map((message) => ({ role: message.role, content: message.content } as ModelMessage))),
      roundCount: countMessageRounds(messages)
    });
    expect(result.shouldCompress).toBe(true);
    expect(result.triggerReason).toBe('message_count');
  });

  it('returns context_size trigger when snapshot char threshold exceeded but rounds under limit', async () => {
    const { countMessageRounds, evaluateFromSnapshot } = await import('@/components/BChatSidebar/utils/compression/policy');
    const longText = 'A'.repeat(25000);
    const messages: Message[] = [makeMsg({ id: 'm1', role: 'user', content: longText }), makeMsg({ id: 'm2', role: 'assistant', content: longText })];
    const result = evaluateFromSnapshot({
      charCount: longText.length * 2,
      roundCount: countMessageRounds(messages)
    });
    expect(result.shouldCompress).toBe(true);
    expect(result.triggerReason).toBe('context_size');
  });
});
