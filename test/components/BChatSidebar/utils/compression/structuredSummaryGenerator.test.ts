/**
 * @file structuredSummaryGenerator.test.ts
 * @description 验证结构化摘要生成器会请求 AI SDK 的结构化输出能力。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiInvokeMock = vi.fn();
const getProviderMock = vi.fn();
const getConfigMock = vi.fn();

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => ({
    aiInvoke: aiInvokeMock
  }))
}));

vi.mock('@/shared/storage', () => ({
  providerStorage: {
    getProvider: getProviderMock
  },
  serviceModelsStorage: {
    getConfig: getConfigMock
  }
}));

describe('structuredSummaryGenerator', () => {
  beforeEach(() => {
    aiInvokeMock.mockReset();
    getProviderMock.mockReset();
    getConfigMock.mockReset();
  });

  it('requests structured output schema when generating summary', async () => {
    const { generateStructuredSummary } = await import('@/components/BChatSidebar/utils/compression/structuredSummaryGenerator');
    const structuredSummaryJson = JSON.stringify({
      goal: '整理需求',
      recentTopic: '上下文压缩',
      userPreferences: [],
      constraints: [],
      decisions: [],
      importantFacts: [],
      fileContext: [],
      openQuestions: [],
      pendingActions: []
    });

    getConfigMock.mockResolvedValue({ providerId: 'provider-1', modelId: 'model-1' });
    getProviderMock.mockResolvedValue({
      id: 'provider-1',
      name: 'Provider',
      type: 'openai',
      isEnabled: true,
      apiKey: 'key'
    });
    aiInvokeMock.mockResolvedValue([
      undefined,
      {
        text: structuredSummaryJson,
        output: {
          goal: '整理需求',
          recentTopic: '上下文压缩',
          userPreferences: [],
          constraints: [],
          decisions: [],
          importantFacts: [],
          fileContext: [],
          openQuestions: [],
          pendingActions: []
        }
      }
    ]);

    const result = await generateStructuredSummary({
      items: [
        {
          messageId: 'm1',
          role: 'user',
          trimmedText: '请总结这段会话'
        }
      ]
    });

    expect(aiInvokeMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        output: expect.objectContaining({
          name: 'conversation_summary',
          schema: expect.objectContaining({
            type: 'object',
            properties: expect.objectContaining({
              goal: expect.any(Object),
              recentTopic: expect.any(Object),
              fileContext: expect.any(Object)
            })
          })
        })
      })
    );
    expect(result.goal).toBe('整理需求');
    expect(result.recentTopic).toBe('上下文压缩');
  });

  it('generates readable summary text from structured summary', async () => {
    const { generateSummaryText } = await import('@/components/BChatSidebar/utils/compression/structuredSummaryGenerator');
    const summary = {
      goal: '实现压缩功能',
      recentTopic: '上下文压缩',
      userPreferences: ['喜欢简洁代码'],
      constraints: ['不改变架构'],
      decisions: ['使用双阈值'],
      importantFacts: ['Phase 1 已完成'],
      fileContext: [],
      openQuestions: ['token 估算精度'],
      pendingActions: ['补全测试']
    };
    const text = generateSummaryText(summary);
    expect(text).toContain('目标：实现压缩功能');
    expect(text).toContain('话题：上下文压缩');
    expect(text).toContain('用户偏好：喜欢简洁代码');
    expect(text).toContain('已做决策：使用双阈值');
    expect(text).toContain('重要事实：Phase 1 已完成');
    expect(text).toContain('待解决问题：token 估算精度');
    expect(text).toContain('待处理操作：补全测试');
  });

  it('omits empty fields from summary text', async () => {
    const { generateSummaryText } = await import('@/components/BChatSidebar/utils/compression/structuredSummaryGenerator');
    const summary = {
      goal: '测试目标',
      recentTopic: '测试话题',
      userPreferences: [],
      constraints: [],
      decisions: [],
      importantFacts: [],
      fileContext: [],
      openQuestions: [],
      pendingActions: []
    };
    const text = generateSummaryText(summary);
    expect(text).not.toContain('用户偏好');
    expect(text).not.toContain('已做决策');
    expect(text).not.toContain('重要事实');
    expect(text).not.toContain('待解决');
    expect(text).not.toContain('待处理');
  });

  it('falls back when no model config available', async () => {
    const { generateStructuredSummary } = await import('@/components/BChatSidebar/utils/compression/structuredSummaryGenerator');

    getConfigMock.mockResolvedValue(null);

    const result = await generateStructuredSummary({
      items: [
        { messageId: 'm1', role: 'user', trimmedText: '请帮我实现一个功能' },
        { messageId: 'm2', role: 'assistant', trimmedText: '好的，我来实现' }
      ]
    });

    expect(result.goal).toBe('用户正在进行对话');
    expect(result.recentTopic).toContain('请帮我实现一个功能');
  });

  it('falls back when provider not found', async () => {
    const { generateStructuredSummary } = await import('@/components/BChatSidebar/utils/compression/structuredSummaryGenerator');

    getConfigMock.mockResolvedValue({ providerId: 'missing-provider', modelId: 'model-1' });
    getProviderMock.mockResolvedValue(null);

    const result = await generateStructuredSummary({
      items: [{ messageId: 'm1', role: 'user', trimmedText: '测试消息' }]
    });

    expect(result.goal).toBe('用户正在进行对话');
  });

  it('falls back when AI invoke returns error', async () => {
    const { generateStructuredSummary } = await import('@/components/BChatSidebar/utils/compression/structuredSummaryGenerator');

    getConfigMock.mockResolvedValue({ providerId: 'provider-1', modelId: 'model-1' });
    getProviderMock.mockResolvedValue({
      id: 'provider-1',
      name: 'Provider',
      type: 'openai',
      isEnabled: true,
      apiKey: 'key'
    });
    aiInvokeMock.mockResolvedValue([new Error('API rate limit'), null]);

    const result = await generateStructuredSummary({
      items: [{ messageId: 'm1', role: 'user', trimmedText: '测试消息' }]
    });

    expect(result.goal).toBe('用户正在进行对话');
  });

  it('falls back when structured output missing goal', async () => {
    const { generateStructuredSummary } = await import('@/components/BChatSidebar/utils/compression/structuredSummaryGenerator');

    getConfigMock.mockResolvedValue({ providerId: 'provider-1', modelId: 'model-1' });
    getProviderMock.mockResolvedValue({
      id: 'provider-1',
      name: 'Provider',
      type: 'openai',
      isEnabled: true,
      apiKey: 'key'
    });
    aiInvokeMock.mockResolvedValue([
      undefined,
      {
        text: '{}',
        output: {
          goal: '',
          recentTopic: '',
          userPreferences: [],
          constraints: [],
          decisions: [],
          importantFacts: [],
          fileContext: [],
          openQuestions: [],
          pendingActions: []
        }
      }
    ]);

    const result = await generateStructuredSummary({
      items: [{ messageId: 'm1', role: 'user', trimmedText: '测试消息' }]
    });

    expect(result.goal).toBe('用户正在进行对话');
  });

  it('falls back when JSON parsing fails', async () => {
    const { generateStructuredSummary } = await import('@/components/BChatSidebar/utils/compression/structuredSummaryGenerator');

    getConfigMock.mockResolvedValue({ providerId: 'provider-1', modelId: 'model-1' });
    getProviderMock.mockResolvedValue({
      id: 'provider-1',
      name: 'Provider',
      type: 'openai',
      isEnabled: true,
      apiKey: 'key'
    });
    aiInvokeMock.mockResolvedValue([undefined, { text: 'not a json response', output: null }]);

    const result = await generateStructuredSummary({
      items: [{ messageId: 'm1', role: 'user', trimmedText: '测试消息' }]
    });

    expect(result.goal).toBe('用户正在进行对话');
  });

  it('uses previous compression record context in incremental mode prompts', async () => {
    const { generateStructuredSummary } = await import('@/components/BChatSidebar/utils/compression/structuredSummaryGenerator');

    getConfigMock.mockResolvedValue({ providerId: 'provider-1', modelId: 'model-1' });
    getProviderMock.mockResolvedValue({
      id: 'provider-1',
      name: 'Provider',
      type: 'openai',
      isEnabled: true,
      apiKey: 'key'
    });
    aiInvokeMock.mockResolvedValue([
      undefined,
      {
        text: '{}',
        output: {
          goal: 'Updated goal',
          recentTopic: 'Updated topic',
          userPreferences: [],
          constraints: [],
          decisions: [],
          importantFacts: [],
          fileContext: [],
          openQuestions: [],
          pendingActions: []
        }
      }
    ]);

    await generateStructuredSummary({
      items: [{ messageId: 'm1', role: 'user', trimmedText: 'new detail' }],
      previousRecord: {
        recordText: 'previous summary text',
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
      }
    });

    expect(aiInvokeMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('previous summary text')
          })
        ])
      })
    );
  });

  it('shows 无 when no previous compression record in prompt', async () => {
    const { generateStructuredSummary } = await import('@/components/BChatSidebar/utils/compression/structuredSummaryGenerator');

    getConfigMock.mockResolvedValue({ providerId: 'provider-1', modelId: 'model-1' });
    getProviderMock.mockResolvedValue({
      id: 'provider-1',
      name: 'Provider',
      type: 'openai',
      isEnabled: true,
      apiKey: 'key'
    });
    aiInvokeMock.mockResolvedValue([
      undefined,
      {
        text: '{}',
        output: {
          goal: 'goal',
          recentTopic: 'topic',
          userPreferences: [],
          constraints: [],
          decisions: [],
          importantFacts: [],
          fileContext: [],
          openQuestions: [],
          pendingActions: []
        }
      }
    ]);

    await generateStructuredSummary({
      items: [{ messageId: 'm1', role: 'user', trimmedText: 'test' }]
    });

    expect(aiInvokeMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('无')
          })
        ])
      })
    );
  });

  it('includes previous compression record context in incremental summary prompts', async () => {
    const { generateStructuredSummary } = await import('@/components/BChatSidebar/utils/compression/structuredSummaryGenerator');

    getConfigMock.mockResolvedValue({ providerId: 'provider-1', modelId: 'model-1' });
    getProviderMock.mockResolvedValue({
      id: 'provider-1',
      name: 'Provider',
      type: 'openai',
      isEnabled: true,
      apiKey: 'key'
    });
    aiInvokeMock.mockResolvedValue([
      undefined,
      {
        text: '{}',
        output: {
          goal: 'Updated goal',
          recentTopic: 'Updated topic',
          userPreferences: [],
          constraints: [],
          decisions: [],
          importantFacts: [],
          fileContext: [],
          openQuestions: [],
          pendingActions: []
        }
      }
    ]);

    await generateStructuredSummary({
      items: [{ messageId: 'm1', role: 'user', trimmedText: 'new detail' }],
      previousRecord: {
        recordText: 'previous summary',
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
      }
    });

    // 增量摘要的提示词应包含上一条摘要信息
    expect(aiInvokeMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('previous summary')
          })
        ])
      })
    );
  });
});
