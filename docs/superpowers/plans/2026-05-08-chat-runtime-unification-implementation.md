<!--
  @file 2026-05-08-chat-runtime-unification-implementation.md
  @description 聊天侧边栏统一任务运行时与压缩链路收敛实施计划。
-->

# Chat Runtime Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将聊天发送与 `/compact` 压缩统一到一个任务运行时中，删除发送前自动压缩与独立摘要助理语义，并以成功的 `compression` 消息作为唯一上下文边界。

**Architecture:** 新增一个统一 runtime 作为唯一任务入口，`useChatStream` 收缩为纯聊天流执行器，`useCompactContext` 只负责压缩消息生命周期，`summaryGenerator` 统一改走当前 chat 模型，旧的自动压缩与 system summary 注入路径被删除。所有发送型入口通过 runtime 施加底层发送锁，组件销毁时统一清理活跃任务。

**Tech Stack:** Vue 3 Composition API、TypeScript、Vitest、Ant Design Vue、现有 `BChatSidebar` hooks / compression utilities

---

## File Map

### New

- `src/components/BChatSidebar/hooks/useChatTaskRuntime.ts`
  - 统一任务运行时，管理 `idle | chat | compact`、并发控制、abort、自愈与 `dispose()`

### Modify

- `src/components/BChatSidebar/index.vue`
  - 接入统一 runtime
  - 所有发送型入口改走 runtime
  - 在卸载时调用 `dispose()`
- `src/components/BChatSidebar/hooks/useChatStream.ts`
  - 删除发送前自动压缩路径
  - 保留纯聊天流、工具续轮、重新生成与 chat abort
- `src/components/BChatSidebar/hooks/useCompactContext.ts`
  - 改为由 runtime 驱动压缩任务
  - 保持 compression message 生命周期与持久化
- `src/components/BChatSidebar/hooks/useCompression.ts`
  - 从“共享 loading 接线器”收缩为压缩执行器
  - 使用当前 chat 模型生成摘要
- `src/components/BChatSidebar/hooks/useSlashCommands.ts`
  - 将命令定义扩展为包含 `concurrencyPolicy` 与 `run(context)`
  - 派发时接入 runtime 约束
- `src/components/BChatSidebar/utils/compression/coordinator.ts`
  - 删除或收缩 `prepareMessagesBeforeSend()` 自动压缩入口
  - 保留显式手动压缩与边界相关能力
- `src/components/BChatSidebar/utils/compression/summaryGenerator.ts`
  - 移除 `summarize` 配置优先级
  - 统一读取当前 chat 模型
- `src/components/BChatSidebar/utils/compression/assembler.ts`
  - 删除旧的 system summary 注入路径
  - 保持 compression message -> assistant 边界消息转换的一致性
- `src/components/BChatSidebar/utils/messageHelper.ts`
  - 明确成功 compression 消息的模型转换规则
  - 保持边界切片逻辑与压缩消息转换一致
- `changelog/2026-05-08.md`
  - 记录本次运行时统一化、自动压缩删除与命令机制收敛

### Tests

- `test/useChatStream.test.ts`
  - 删除自动压缩前置依赖断言
  - 保留聊天 abort、工具续轮基础行为验证
- `test/components/BChatSidebar/compression.integration.test.ts`
  - 更新压缩执行链路为 runtime 驱动后的断言
- `test/components/BChatSidebar/chat-slash-commands.test.ts`
  - 更新 slash command 调度与并发策略测试
- `test/components/BChatSidebar/compression-boundary.model-context.test.ts`
  - 保留并加强成功/失败/取消压缩边界行为测试
- `test/components/BChatSidebar/compression-message.model.test.ts`
  - 保留 compression message 状态语义测试
- `test/stores/chat.compression-message.test.ts`
  - 保持 compression message 持久化元数据回归
- `test/components/BChatSidebar/utils/compression/coordinator.test.ts`
  - 删除或更新依赖 `prepareMessagesBeforeSend()` 自动压缩的旧断言
- `test/components/BChatSidebar/utils/messageHelper.test.ts`
  - 补充 compression message 转模型消息的边界断言
- `test/components/BChatSidebar/chat-runtime.test.ts`
  - 新增 runtime 独立测试，覆盖发送锁、自愈、销毁清理

## Task 1: Build the unified task runtime

**Files:**
- Create: `src/components/BChatSidebar/hooks/useChatTaskRuntime.ts`
- Test: `test/components/BChatSidebar/chat-runtime.test.ts`

- [ ] **Step 1: Write the failing runtime tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { useChatTaskRuntime } from '@/components/BChatSidebar/hooks/useChatTaskRuntime';

describe('chat task runtime', () => {
  it('blocks starting a second task while one task is active', async () => {
    const runtime = useChatTaskRuntime();
    const firstTask = runtime.startTask('chat', async () => {
      await new Promise(() => undefined);
    });

    expect(runtime.loading.value).toBe(true);
    await expect(runtime.startTask('compact', async () => undefined)).resolves.toEqual({
      ok: false,
      reason: 'busy'
    });

    void firstTask;
  });

  it('resets to idle after task factory throws', async () => {
    const runtime = useChatTaskRuntime();

    await expect(
      runtime.startTask('chat', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(runtime.activeTask.value).toBe('idle');
    expect(runtime.loading.value).toBe(false);
  });

  it('disposes an active compact task and triggers registered abort cleanup', async () => {
    const runtime = useChatTaskRuntime();
    const onAbort = vi.fn();

    void runtime.startTask('compact', async ({ signal, onAbort: registerAbort }) => {
      registerAbort(onAbort);
      await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    });

    runtime.dispose();

    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(runtime.activeTask.value).toBe('idle');
    expect(runtime.loading.value).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/components/BChatSidebar/chat-runtime.test.ts`
Expected: FAIL with `Cannot find module '@/components/BChatSidebar/hooks/useChatTaskRuntime'`

- [ ] **Step 3: Write the minimal runtime implementation**

```ts
import { computed, ref } from 'vue';

export type ChatTaskKind = 'chat' | 'compact';
export type ChatTaskState = 'idle' | ChatTaskKind;

interface TaskContext {
  signal: AbortSignal;
  onAbort: (handler: () => void) => void;
}

interface StartTaskBusyResult {
  ok: false;
  reason: 'busy';
}

interface StartTaskSuccessResult<T> {
  ok: true;
  value: T;
}

type StartTaskResult<T> = StartTaskBusyResult | StartTaskSuccessResult<T>;

export function useChatTaskRuntime() {
  const activeTask = ref<ChatTaskState>('idle');
  const controller = ref<AbortController | null>(null);
  const abortHandler = ref<(() => void) | null>(null);
  const loading = computed(() => activeTask.value !== 'idle');

  function resetToIdle(): void {
    controller.value = null;
    abortHandler.value = null;
    activeTask.value = 'idle';
  }

  async function startTask<T>(kind: ChatTaskKind, factory: (context: TaskContext) => Promise<T>): Promise<StartTaskResult<T>> {
    if (activeTask.value !== 'idle') {
      return { ok: false, reason: 'busy' };
    }

    controller.value = new AbortController();
    abortHandler.value = null;
    activeTask.value = kind;

    const taskContext: TaskContext = {
      signal: controller.value.signal,
      onAbort: (handler) => {
        abortHandler.value = handler;
      }
    };

    try {
      const value = await factory(taskContext);
      resetToIdle();
      return { ok: true, value };
    } catch (error) {
      resetToIdle();
      throw error;
    }
  }

  function abortActiveTask(): void {
    controller.value?.abort();
    abortHandler.value?.();
    resetToIdle();
  }

  function dispose(): void {
    abortActiveTask();
  }

  return {
    activeTask,
    loading,
    startTask,
    abortActiveTask,
    resetToIdle,
    dispose
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test test/components/BChatSidebar/chat-runtime.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BChatSidebar/hooks/useChatTaskRuntime.ts test/components/BChatSidebar/chat-runtime.test.ts
git commit -m "feat: add unified chat task runtime"
```

## Task 2: Route chat submit and compact through the runtime

**Files:**
- Modify: `src/components/BChatSidebar/index.vue`
- Modify: `src/components/BChatSidebar/hooks/useCompactContext.ts`
- Modify: `test/components/BChatSidebar/chat-slash-commands.test.ts`
- Modify: `test/components/BChatSidebar/compression.integration.test.ts`

- [ ] **Step 1: Write the failing integration tests for runtime gating**

```ts
test('does not start /compact while a chat task is active', async () => {
  chatStreamLoadingState.value = true;
  const wrapper = mountSidebar();

  await wrapper.vm.handleSlashCommand?.({ id: 'compact', trigger: '/compact', title: '压缩上下文', description: '', type: 'action' });

  expect(compressionHookTriggerMock).not.toHaveBeenCalled();
});

test('does not send a new chat message while runtime is busy', async () => {
  chatStreamLoadingState.value = true;
  const wrapper = mountSidebar();

  await wrapper.vm.handleChatSubmit?.();

  expect(streamMessagesMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `pnpm test test/components/BChatSidebar/chat-slash-commands.test.ts test/components/BChatSidebar/compression.integration.test.ts`
Expected: FAIL because current handlers still rely on scattered `loading` / direct calls

- [ ] **Step 3: Wire `index.vue` and `useCompactContext` into the runtime**

```ts
const runtime = useChatTaskRuntime();

async function handleChatSubmit(): Promise<void> {
  const config = await stream.resolveServiceConfig();
  if (!config || !canSubmit.value) {
    return;
  }

  const startResult = await runtime.startTask('chat', async () => {
    const userMessage = await buildUserMessage();
    messages.value.push(userMessage);
    await chatStore.addSessionMessage(sessionId, userMessage);
    await stream.streamMessages(messages.value, config);
  });

  if (!startResult.ok) {
    return;
  }
}
```

```ts
async function handleCompactContext(): Promise<void> {
  const startResult = await runtime.startTask('compact', async ({ onAbort }) => {
    const pendingMessage = createPendingCompressionMessage();
    messages.value.push(pendingMessage);
    await persistMessage(sessionId, pendingMessage);

    onAbort(() => {
      updateCompressionMessage(pendingMessage.id, createCancelledCompressionMessage()).catch(() => undefined);
    });

    const result = await compress();
    await updateCompressionMessage(pendingMessage.id, resolveCompressionMessage(result));
  });

  if (!startResult.ok) {
    message.info('当前有任务正在执行，请先等待完成或停止当前任务');
  }
}
```

- [ ] **Step 4: Run tests to verify the new gating passes**

Run: `pnpm test test/components/BChatSidebar/chat-slash-commands.test.ts test/components/BChatSidebar/compression.integration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BChatSidebar/index.vue src/components/BChatSidebar/hooks/useCompactContext.ts test/components/BChatSidebar/chat-slash-commands.test.ts test/components/BChatSidebar/compression.integration.test.ts
git commit -m "refactor: route chat and compact through task runtime"
```

## Task 3: Remove automatic compression from chat sends

**Files:**
- Modify: `src/components/BChatSidebar/hooks/useChatStream.ts`
- Modify: `src/components/BChatSidebar/utils/compression/coordinator.ts`
- Modify: `test/useChatStream.test.ts`
- Modify: `test/components/BChatSidebar/utils/compression/coordinator.test.ts`

- [ ] **Step 1: Write the failing tests proving chat sends no longer auto-compress**

```ts
it('does not call prepareMessagesBeforeSend during normal chat sends', async () => {
  const { stream } = useChatStream({ messages, getSessionId: () => 'session-1' });

  await stream.streamMessages([create.userMessage('hello')], config);

  expect(prepareMessagesBeforeSendMock).not.toHaveBeenCalled();
});
```

```ts
it('keeps manual compression available after removing prepareMessagesBeforeSend', async () => {
  const result = await coordinator.compressSessionManually({ sessionId: 'session-1', messages });
  expect(result?.triggerReason).toBe('manual');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test test/useChatStream.test.ts test/components/BChatSidebar/utils/compression/coordinator.test.ts`
Expected: FAIL because `streamMessages()` still calls `prepareMessagesBeforeSend()`

- [ ] **Step 3: Delete auto-compression from `useChatStream` and shrink the coordinator surface**

```ts
async function handleStreamMessages(sourceMessages: Message[], config: ServiceConfig, reuseLastAssistant = false): Promise<void> {
  !reuseLastAssistant && startToolLoopSession();
  loading.value = true;
  lastServiceConfig = config;
  currentToolRoundId += 1;
  currentToolCallTracker = createToolCallTracker();
  handlePrepareAssistantMessage(reuseLastAssistant);

  const nextMessages = buildChatMessageReferences(sourceMessages);
  const transportTools = config.toolSupport.supported && Boolean(tools?.length) ? toTransportTools(tools ?? []) : undefined;
  currentModelMessageCache = convert.toCachedModelMessages(nextMessages, currentModelMessageCache);

  agent.stream({
    messages: currentModelMessageCache.modelMessages,
    modelId: config.modelId,
    providerId: config.providerId,
    tools: transportTools
  });
}
```

- [ ] **Step 4: Run tests to verify auto-compression is gone and manual compression still works**

Run: `pnpm test test/useChatStream.test.ts test/components/BChatSidebar/utils/compression/coordinator.test.ts`
Expected: PASS after updating outdated coordinator assertions

- [ ] **Step 5: Commit**

```bash
git add src/components/BChatSidebar/hooks/useChatStream.ts src/components/BChatSidebar/utils/compression/coordinator.ts test/useChatStream.test.ts test/components/BChatSidebar/utils/compression/coordinator.test.ts
git commit -m "refactor: remove automatic compression from chat sends"
```

## Task 4: Unify compression onto the current chat model

**Files:**
- Modify: `src/components/BChatSidebar/utils/compression/summaryGenerator.ts`
- Modify: `src/components/BChatSidebar/hooks/useCompression.ts`
- Modify: `test/components/BChatSidebar/compression.integration.test.ts`

- [ ] **Step 1: Write the failing test for summary model selection**

```ts
it('uses the current chat model configuration for compression summaries', async () => {
  const summary = await generateStructuredSummary({
    items: [{ role: 'user', trimmedText: 'hello' }],
    previousSummary: undefined
  });

  expect(getConfigMock).toHaveBeenCalledWith('chat');
  expect(getConfigMock).not.toHaveBeenCalledWith('summarize');
  expect(summary.goal).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test test/components/BChatSidebar/compression.integration.test.ts`
Expected: FAIL because `summaryGenerator.ts` still checks `summarize`

- [ ] **Step 3: Update `summaryGenerator.ts` to read only the chat configuration**

```ts
async function getSummaryModelConfig(): Promise<{ providerId: string; modelId: string } | null> {
  const chatConfig = await serviceModelsStorage.getConfig('chat');
  if (!chatConfig?.providerId || !chatConfig?.modelId) {
    return null;
  }

  const provider = await providerStorage.getProvider(chatConfig.providerId);
  if (!provider?.isEnabled) {
    return null;
  }

  return {
    providerId: chatConfig.providerId,
    modelId: chatConfig.modelId
  };
}
```

- [ ] **Step 4: Run tests to verify compression uses the current chat model**

Run: `pnpm test test/components/BChatSidebar/compression.integration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BChatSidebar/utils/compression/summaryGenerator.ts src/components/BChatSidebar/hooks/useCompression.ts test/components/BChatSidebar/compression.integration.test.ts
git commit -m "refactor: use chat model for compression summaries"
```

## Task 5: Make compression messages the only context boundary

**Files:**
- Modify: `src/components/BChatSidebar/utils/messageHelper.ts`
- Modify: `src/components/BChatSidebar/utils/compression/assembler.ts`
- Modify: `test/components/BChatSidebar/compression-boundary.model-context.test.ts`
- Modify: `test/components/BChatSidebar/utils/messageHelper.test.ts`

- [ ] **Step 1: Write the failing boundary conversion tests**

```ts
test('maps a successful compression message into an assistant boundary message for model context', () => {
  const modelMessages = convert.toModelMessages([
    createCompressionMessage({
      summaryText: '压缩摘要',
      status: 'success',
      coveredUntilMessageId: 'message-1'
    })
  ]);

  expect(modelMessages).toEqual([
    { role: 'assistant', content: '压缩摘要' }
  ]);
});

test('does not convert failed or cancelled compression messages into model messages', () => {
  expect(convert.toModelMessages([createCompressionMessage({ summaryText: '', status: 'cancelled' })])).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test test/components/BChatSidebar/compression-boundary.model-context.test.ts test/components/BChatSidebar/utils/messageHelper.test.ts`
Expected: FAIL because conversion still depends on older summary injection assumptions

- [ ] **Step 3: Update conversion and remove old assembler summary injection**

```ts
function compressionBoundaryMessage(message: Message): ModelMessage[] {
  if (message.role !== 'compression' || message.compression?.status !== 'success' || !message.content) {
    return [];
  }

  return [{ role: 'assistant', content: message.content }];
}
```

```ts
export function assembleContext(input: AssemblerInput): AssembledContext {
  return {
    modelMessages: [
      ...convert.toModelMessages(input.recentMessages),
      ...convert.toModelMessages([input.currentUserMessage])
    ]
  };
}
```

- [ ] **Step 4: Run tests to verify only successful compression messages define the boundary**

Run: `pnpm test test/components/BChatSidebar/compression-boundary.model-context.test.ts test/components/BChatSidebar/utils/messageHelper.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BChatSidebar/utils/messageHelper.ts src/components/BChatSidebar/utils/compression/assembler.ts test/components/BChatSidebar/compression-boundary.model-context.test.ts test/components/BChatSidebar/utils/messageHelper.test.ts
git commit -m "refactor: use compression messages as the only context boundary"
```

## Task 6: Add runtime disposal and sidebar unmount cleanup

**Files:**
- Modify: `src/components/BChatSidebar/index.vue`
- Modify: `test/components/BChatSidebar/chat-runtime.test.ts`
- Modify: `test/useChatStream.test.ts`

- [ ] **Step 1: Write the failing tests for unmount cleanup**

```ts
it('calls runtime dispose when the sidebar unmounts', async () => {
  const disposeMock = vi.fn();
  mockTaskRuntimeReturn.dispose = disposeMock;

  const wrapper = mountSidebar();
  wrapper.unmount();

  expect(disposeMock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test test/components/BChatSidebar/chat-runtime.test.ts`
Expected: FAIL because `index.vue` does not yet call `dispose()`

- [ ] **Step 3: Implement unmount cleanup**

```ts
const runtime = useChatTaskRuntime();

onUnmounted(() => {
  runtime.dispose();
});
```

- [ ] **Step 4: Run tests to verify runtime cleanup on destroy**

Run: `pnpm test test/components/BChatSidebar/chat-runtime.test.ts test/useChatStream.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BChatSidebar/index.vue test/components/BChatSidebar/chat-runtime.test.ts test/useChatStream.test.ts
git commit -m "fix: dispose active chat tasks on sidebar unmount"
```

## Task 7: Refactor slash commands to use concurrency policies

**Files:**
- Modify: `src/components/BChatSidebar/hooks/useSlashCommands.ts`
- Modify: `test/components/BChatSidebar/chat-slash-commands.test.ts`

- [ ] **Step 1: Write the failing slash command policy tests**

```ts
test('prevents allowWhenIdleOnly commands while runtime is busy', () => {
  const handleBusyMock = vi.fn();
  const { handleSlashCommand } = useSlashCommands({
    commands: [
      {
        id: 'compact',
        trigger: '/compact',
        title: '压缩上下文',
        description: '',
        concurrencyPolicy: 'allowWhenIdleOnly',
        run: vi.fn()
      }
    ],
    isBusy: () => true,
    onBusyCommandRejected: handleBusyMock
  });

  handleSlashCommand({ id: 'compact', trigger: '/compact', title: '', description: '', type: 'action' });
  expect(handleBusyMock).toHaveBeenCalledWith('compact');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test test/components/BChatSidebar/chat-slash-commands.test.ts`
Expected: FAIL because current slash commands only map ids to handlers

- [ ] **Step 3: Refactor slash command definitions around `concurrencyPolicy`**

```ts
type CommandConcurrencyPolicy = 'allowWhenIdleOnly' | 'allowAlways';

interface RuntimeSlashCommand {
  id: string;
  trigger: string;
  title: string;
  description: string;
  concurrencyPolicy: CommandConcurrencyPolicy;
  run: () => void | Promise<void>;
}
```

- [ ] **Step 4: Run tests to verify busy commands are rejected consistently**

Run: `pnpm test test/components/BChatSidebar/chat-slash-commands.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BChatSidebar/hooks/useSlashCommands.ts test/components/BChatSidebar/chat-slash-commands.test.ts
git commit -m "refactor: add slash command concurrency policies"
```

## Task 8: Final regression, docs, and cleanup

**Files:**
- Modify: `changelog/2026-05-08.md`
- Verify: `src/components/BChatSidebar/index.vue`
- Verify: `src/components/BChatSidebar/hooks/useChatTaskRuntime.ts`
- Verify: `src/components/BChatSidebar/hooks/useChatStream.ts`
- Verify: `src/components/BChatSidebar/hooks/useCompactContext.ts`
- Verify: `src/components/BChatSidebar/utils/compression/summaryGenerator.ts`
- Verify: `src/components/BChatSidebar/utils/messageHelper.ts`

- [ ] **Step 1: Update changelog with the final runtime unification entries**

```md
## Changed
- 新增统一聊天任务运行时，聊天发送与 `/compact` 压缩共享底层发送锁与清理语义
- 删除发送前自动压缩链路，普通发送不再隐式生成摘要
- 压缩摘要统一使用当前 chat 模型，不再保留独立 `summarize` 助手语义
- 成功的 compression 消息成为唯一模型上下文边界

## Fixed
- 修复消息生成中仍可再次发送或执行 `/compact` 的并发穿透问题
- 修复 sidebar 销毁时活跃任务可能遗留 loading 状态的问题
```

- [ ] **Step 2: Run the focused lint and test suite**

Run: `pnpm exec eslint src/components/BChatSidebar/index.vue src/components/BChatSidebar/hooks/useChatTaskRuntime.ts src/components/BChatSidebar/hooks/useChatStream.ts src/components/BChatSidebar/hooks/useCompactContext.ts src/components/BChatSidebar/hooks/useCompression.ts src/components/BChatSidebar/hooks/useSlashCommands.ts src/components/BChatSidebar/utils/messageHelper.ts src/components/BChatSidebar/utils/compression/coordinator.ts src/components/BChatSidebar/utils/compression/summaryGenerator.ts src/components/BChatSidebar/utils/compression/assembler.ts test/useChatStream.test.ts test/components/BChatSidebar/chat-runtime.test.ts test/components/BChatSidebar/compression.integration.test.ts test/components/BChatSidebar/chat-slash-commands.test.ts test/components/BChatSidebar/compression-boundary.model-context.test.ts test/components/BChatSidebar/compression-message.model.test.ts test/components/BChatSidebar/utils/messageHelper.test.ts test/components/BChatSidebar/utils/compression/coordinator.test.ts test/stores/chat.compression-message.test.ts --format unix`

Expected: exit code `0`

- [ ] **Step 3: Run the focused regression suite**

Run: `pnpm test test/useChatStream.test.ts test/components/BChatSidebar/chat-runtime.test.ts test/components/BChatSidebar/compression.integration.test.ts test/components/BChatSidebar/chat-slash-commands.test.ts test/components/BChatSidebar/compression-boundary.model-context.test.ts test/components/BChatSidebar/compression-message.model.test.ts test/components/BChatSidebar/utils/messageHelper.test.ts test/components/BChatSidebar/utils/compression/coordinator.test.ts test/stores/chat.compression-message.test.ts`

Expected: all targeted test files PASS

- [ ] **Step 4: Inspect `git diff` for leftover auto-compression branches or stale summarize references**

Run: `git diff -- src/components/BChatSidebar/hooks/useChatStream.ts src/components/BChatSidebar/utils/compression/coordinator.ts src/components/BChatSidebar/utils/compression/summaryGenerator.ts src/components/BChatSidebar/hooks/useSlashCommands.ts`

Expected: diff only shows runtime unification, no remaining `prepareMessagesBeforeSend()` send-path calls or `getConfig('summarize')`

- [ ] **Step 5: Commit**

```bash
git add changelog/2026-05-08.md src/components/BChatSidebar/index.vue src/components/BChatSidebar/hooks/useChatTaskRuntime.ts src/components/BChatSidebar/hooks/useChatStream.ts src/components/BChatSidebar/hooks/useCompactContext.ts src/components/BChatSidebar/hooks/useCompression.ts src/components/BChatSidebar/hooks/useSlashCommands.ts src/components/BChatSidebar/utils/messageHelper.ts src/components/BChatSidebar/utils/compression/coordinator.ts src/components/BChatSidebar/utils/compression/summaryGenerator.ts src/components/BChatSidebar/utils/compression/assembler.ts test/useChatStream.test.ts test/components/BChatSidebar/chat-runtime.test.ts test/components/BChatSidebar/compression.integration.test.ts test/components/BChatSidebar/chat-slash-commands.test.ts test/components/BChatSidebar/compression-boundary.model-context.test.ts test/components/BChatSidebar/compression-message.model.test.ts test/components/BChatSidebar/utils/messageHelper.test.ts test/components/BChatSidebar/utils/compression/coordinator.test.ts test/stores/chat.compression-message.test.ts changelog/2026-05-08.md
git commit -m "refactor: unify chat runtime and compression flow"
```

## Self-Review

- Spec coverage:
  - 统一 runtime：Task 1、Task 2、Task 6
  - 删除发送前自动压缩：Task 3
  - 统一使用 chat 模型：Task 4
  - compression 消息为唯一边界：Task 5
  - slash command 扩展与并发策略：Task 7
  - 回归与文档：Task 8
- Placeholder scan:
  - 已避免使用 TBD / TODO / “later” 等占位词
  - 每个任务都包含目标文件、命令和预期结果
- Type consistency:
  - 统一使用 `ChatTaskKind`、`ChatTaskState`、`concurrencyPolicy`
  - runtime 对外统一暴露 `startTask / abortActiveTask / dispose / resetToIdle`
