/**
 * @file useChatStream.test.ts
 * @description 校验聊天流在用户主动中止时会正确收尾助手消息并触发持久化回调。
 */
import type { AIToolExecutor } from 'types/ai';
import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAwaitingUserInputResult } from '@/ai/tools/results';
import { useChatStream } from '@/components/BChatSidebar/hooks/useChatStream';
import { create } from '@/components/BChatSidebar/utils/messageHelper';
import type { Message, ServiceConfig } from '@/components/BChatSidebar/utils/types';

/**
 * 被测 hook 传给底层流式 Hook 的回调集合。
 */
interface MockChatCallbacks {
  /** 流式完成回调 */
  onComplete?: () => void | Promise<void>;
  /** 流式结束回调 */
  onFinish?: (chunk: import('types/ai').AIStreamFinishChunk) => void | Promise<void>;
  /** 工具输入开始回调 */
  onToolInputStart?: (chunk: import('types/ai').AIStreamToolInputStartChunk) => void | Promise<void>;
  /** 工具输入增量回调 */
  onToolInputDelta?: (chunk: import('types/ai').AIStreamToolInputDeltaChunk) => void | Promise<void>;
  /** 工具输入结束回调 */
  onToolInputEnd?: (chunk: import('types/ai').AIStreamToolInputEndChunk) => void | Promise<void>;
  /** 工具调用回调 */
  onToolCall?: (chunk: import('types/ai').AIStreamToolCallChunk) => void | Promise<void>;
  /** 工具结果回调 */
  onToolResult?: (chunk: import('types/ai').AIStreamToolResultChunk) => void | Promise<void>;
}

/**
 * 当前测试轮次里底层流式 Hook 捕获到的回调。
 */
let capturedCallbacks: MockChatCallbacks | null = null;
const streamSpy = vi.fn();
const getAvailableServiceConfigMock = vi.fn();

/**
 * 底层流式中止桩函数，用于模拟 Electron 流结束时的完成回调。
 */
const abortSpy = vi.fn<() => void>(() => {
  capturedCallbacks?.onComplete?.();
});

vi.mock('@/hooks/useChat', () => ({
  /**
   * 模拟底层聊天流 Hook，仅暴露本用例需要的 abort 行为。
   */
  useChat: (options: MockChatCallbacks) => {
    capturedCallbacks = options;
    return {
      agent: {
        invoke: vi.fn(),
        stream: streamSpy,
        abort: abortSpy
      }
    };
  }
}));

vi.mock('@/components/BChatSidebar/utils/compression/coordinator', () => ({
  createCompressionCoordinator: () => ({
    compressSessionManually: vi.fn()
  })
}));

vi.mock('@/stores/serviceModel', () => ({
  /**
   * 模拟服务模型 store，避免测试初始化时依赖真实 store。
   */
  useServiceModelStore: () => ({
    getAvailableServiceConfig: getAvailableServiceConfigMock
  })
}));

vi.mock('@/stores/toolSettings', () => ({
  /**
   * 模拟工具设置 store，避免测试初始化时依赖真实 store。
   */
  useToolSettingsStore: () => ({
    getEnabledToolNames: () => [],
    isToolEnabled: () => true
  })
}));

/**
 * 创建一个已经收到部分流式内容、但仍处于 loading 的助手消息。
 * @returns 可用于中止测试的助手消息。
 */
function createStreamingAssistantMessage(): Message {
  const message = create.assistantPlaceholder();
  message.parts.push({ type: 'text', text: '部分回复' });
  message.content = '部分回复';
  message.createdAt = '2026-04-30T00:00:00.000Z';
  return message;
}

describe('useChatStream abort', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    capturedCallbacks = null;
    abortSpy.mockClear();
    streamSpy.mockClear();
    getAvailableServiceConfigMock.mockReset();
  });

  it('finalizes the current assistant message and calls onComplete once when the user aborts', () => {
    const messages = ref<Message[]>([create.userMessage('你好'), createStreamingAssistantMessage()]);
    const onComplete = vi.fn<(message: Message) => void>();
    const { stream, loading } = useChatStream({
      messages,
      onComplete
    });

    loading.value = true;
    stream.abort();

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(loading.value).toBe(false);
    expect(messages.value).toHaveLength(2);
    expect(messages.value[1].loading).toBe(false);
    expect(messages.value[1].finished).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(messages.value[1]);
  });

  it('streams converted model messages during chat sends without invoking automatic compression', async () => {
    const messages = ref<Message[]>([]);
    const { stream } = useChatStream({
      messages,
      getSessionId: () => 'session-1'
    });

    const sourceMessages = [create.userMessage('需要压缩上下文')];
    messages.value = [...sourceMessages];

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: false
      }
    };

    await stream.streamMessages(sourceMessages, config);

    expect(streamSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: '需要压缩上下文' }],
        modelId: 'gpt-4o'
      })
    );
  });

  it('retries resolving service config when startup race makes the first lookup return null', async () => {
    getAvailableServiceConfigMock.mockResolvedValueOnce(null).mockResolvedValueOnce({
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: false
      }
    } satisfies ServiceConfig);

    const messages = ref<Message[]>([]);
    const { stream } = useChatStream({ messages });

    await expect(stream.resolveServiceConfig()).resolves.toEqual(
      expect.objectContaining({
        providerId: 'openai',
        modelId: 'gpt-4o',
        toolSupport: expect.objectContaining({
          supported: false
        })
      })
    );
    expect(getAvailableServiceConfigMock).toHaveBeenCalledTimes(2);
  });

  it('does not try to execute Tavily SDK tools locally when the stream emits a remote tool call', async () => {
    const messages = ref<Message[]>([create.userMessage('搜索一下最新消息')]);
    const onComplete = vi.fn<(message: Message) => void>();
    const { stream } = useChatStream({
      messages,
      tools: [],
      onComplete
    });

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    };

    await stream.streamMessages(messages.value, config);
    capturedCallbacks?.onToolCall?.({
      toolCallId: 'tool-call-1',
      toolName: 'tavily_search',
      input: { query: 'AI news' }
    });
    capturedCallbacks?.onComplete?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(messages.value).toHaveLength(2);
    expect(messages.value[1].role).toBe('assistant');
    expect(messages.value[1].parts).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'tool-call-1',
        toolName: 'tavily_search',
        input: { query: 'AI news' }
      }
    ]);
    expect(messages.value[1].parts.some((part) => part.type === 'tool-result')).toBe(false);
    expect(messages.value.some((message) => message.role === 'error')).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('appends Tavily remote tool results into assistant message parts', async () => {
    const messages = ref<Message[]>([create.userMessage('搜索一下最新消息')]);
    const { stream } = useChatStream({
      messages,
      tools: []
    });

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    };

    await stream.streamMessages(messages.value, config);
    capturedCallbacks?.onToolCall?.({
      toolCallId: 'tool-call-1',
      toolName: 'tavily_search',
      input: { query: 'AI news' }
    });
    capturedCallbacks?.onToolResult?.({
      toolCallId: 'tool-call-1',
      toolName: 'tavily_search',
      result: {
        toolName: 'tavily_search',
        status: 'success',
        data: {
          answer: 'AI news summary',
          results: [{ title: 'Headline' }]
        }
      }
    });

    expect(messages.value[1].parts).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'tool-call-1',
        toolName: 'tavily_search',
        input: { query: 'AI news' }
      },
      {
        type: 'tool-result',
        toolCallId: 'tool-call-1',
        toolName: 'tavily_search',
        result: {
          toolName: 'tavily_search',
          status: 'success',
          data: {
            answer: 'AI news summary',
            results: [{ title: 'Headline' }]
          }
        }
      }
    ]);
  });

  it('automatically continues after a Tavily tool result when the first stream stops at tool-calls', async () => {
    const messages = ref<Message[]>([create.userMessage('搜索一下最新消息')]);
    const { stream } = useChatStream({
      messages,
      tools: []
    });

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    };

    await stream.streamMessages(messages.value, config);
    capturedCallbacks?.onToolCall?.({
      toolCallId: 'tool-call-1',
      toolName: 'tavily_search',
      input: { query: 'AI news' }
    });
    capturedCallbacks?.onToolResult?.({
      toolCallId: 'tool-call-1',
      toolName: 'tavily_search',
      result: {
        toolName: 'tavily_search',
        status: 'success',
        data: { results: [{ title: 'Headline' }] }
      }
    });
    capturedCallbacks?.onFinish?.({
      finishReason: 'tool-calls',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    });
    await capturedCallbacks?.onComplete?.();
    await nextTick();
    await Promise.resolve();

    expect(streamSpy).toHaveBeenCalledTimes(2);
    expect(messages.value[1].parts).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'tool-call-1',
        toolName: 'tavily_search',
        input: { query: 'AI news' }
      },
      {
        type: 'tool-result',
        toolCallId: 'tool-call-1',
        toolName: 'tavily_search',
        result: {
          toolName: 'tavily_search',
          status: 'success',
          data: { results: [{ title: 'Headline' }] }
        }
      }
    ]);
    expect(messages.value[1].parts.some((part) => part.type === 'error')).toBe(false);
  });

  it('keeps stream loading active but finalizes the assistant message while awaiting user choice submission', async () => {
    const askUserQuestionTool: AIToolExecutor = {
      definition: {
        name: 'ask_user_question',
        description: 'Ask the user a question and wait for input.',
        source: 'builtin',
        riskLevel: 'read',
        requiresActiveDocument: false,
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      async execute() {
        return createAwaitingUserInputResult('ask_user_question', {
          questionId: 'question-1',
          toolCallId: '',
          mode: 'single',
          question: '请选择渠道',
          options: [{ label: '官网', value: 'official' }]
        });
      }
    };
    const messages = ref<Message[]>([create.userMessage('需要你确认渠道')]);
    const onComplete = vi.fn<(message: Message) => void>();
    const { stream, loading } = useChatStream({
      messages,
      tools: [askUserQuestionTool],
      onComplete
    });

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    };

    await stream.streamMessages(messages.value, config);
    capturedCallbacks?.onToolCall?.({
      toolCallId: 'tool-call-1',
      toolName: 'ask_user_question',
      input: {}
    });
    await Promise.resolve();
    await capturedCallbacks?.onComplete?.();
    await Promise.resolve();

    expect(loading.value).toBe(true);
    expect(messages.value[1].loading).toBe(false);
    expect(messages.value[1].finished).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(messages.value[1]);
  });

  it('appends tool-loop stop errors to the current assistant message instead of creating a new one', async () => {
    const messages = ref<Message[]>([create.userMessage('继续读取文档')]);
    const onComplete = vi.fn<(message: Message) => void>();
    const { stream } = useChatStream({
      messages,
      onComplete
    });

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    };

    await stream.streamMessages(messages.value, config);
    capturedCallbacks?.onToolCall?.({
      toolCallId: 'tool-call-1',
      toolName: 'read_current_document',
      input: {}
    });
    capturedCallbacks?.onToolCall?.({
      toolCallId: 'tool-call-2',
      toolName: 'read_current_document',
      input: {}
    });
    capturedCallbacks?.onToolCall?.({
      toolCallId: 'tool-call-3',
      toolName: 'read_current_document',
      input: {}
    });
    await Promise.resolve();

    expect(messages.value).toHaveLength(2);
    expect(messages.value[1].role).toBe('assistant');
    expect(messages.value[1].parts.at(-1)).toEqual({
      type: 'error',
      text: '工具 `read_current_document` 使用相同参数重复调用超过限制（2），已停止自动续轮。'
    });
    expect(messages.value[1].finished).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(messages.value[1]);
  });

  it('allows submitting user choice while stream loading remains active for awaiting input', async () => {
    const askUserQuestionTool: AIToolExecutor = {
      definition: {
        name: 'ask_user_question',
        description: 'Ask the user a question and wait for input.',
        source: 'builtin',
        riskLevel: 'read',
        requiresActiveDocument: false,
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      async execute() {
        return createAwaitingUserInputResult('ask_user_question', {
          questionId: 'question-1',
          toolCallId: '',
          mode: 'single',
          question: '请选择渠道',
          options: [{ label: '官网', value: 'official' }]
        });
      }
    };
    getAvailableServiceConfigMock.mockResolvedValue({
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    } satisfies ServiceConfig);
    const messages = ref<Message[]>([create.userMessage('需要你确认渠道')]);
    const { stream, loading } = useChatStream({
      messages,
      tools: [askUserQuestionTool]
    });

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    };

    await stream.streamMessages(messages.value, config);
    capturedCallbacks?.onToolCall?.({
      toolCallId: 'tool-call-1',
      toolName: 'ask_user_question',
      input: {}
    });
    await Promise.resolve();
    await capturedCallbacks?.onComplete?.();
    await Promise.resolve();

    expect(loading.value).toBe(true);

    const submitted = await stream.submitUserChoice({
      questionId: 'question-1',
      toolCallId: 'tool-call-1',
      answers: ['official'],
      otherText: ''
    });
    await nextTick();

    expect(submitted).toBe(true);
    expect(streamSpy).toHaveBeenCalledTimes(2);
  });

  it('shows a streamed write_file preview before the final tool-call arrives', async () => {
    const messages = ref<Message[]>([create.userMessage('帮我写一份发布说明')]);
    const { stream } = useChatStream({
      messages,
      tools: []
    });

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    };

    await stream.streamMessages(messages.value, config);

    capturedCallbacks?.onToolInputStart?.({
      toolCallId: 'tool-call-1',
      toolName: 'write_file'
    });
    await capturedCallbacks?.onToolInputDelta?.({
      toolCallId: 'tool-call-1',
      inputTextDelta: '{"path":"docs/release-notes.md","content":"# Release'
    });

    expect(messages.value[1].parts).toHaveLength(1);
    expect(messages.value[1].parts[0]).toMatchObject({
      type: 'tool-input',
      toolCallId: 'tool-call-1',
      toolName: 'write_file',
      input: {
        path: 'docs/release-notes.md',
        content: '# Release'
      },
      inputText: '{"path":"docs/release-notes.md","content":"# Release'
    });

    capturedCallbacks?.onToolCall?.({
      toolCallId: 'tool-call-1',
      toolName: 'write_file',
      input: {
        path: 'docs/release-notes.md',
        content: '# Release\n\n- Added preview state\n'
      }
    });

    expect(messages.value[1].parts).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'tool-call-1',
        toolName: 'write_file',
        input: {
          path: 'docs/release-notes.md',
          content: '# Release\n\n- Added preview state\n'
        }
      }
    ]);
  });
});
