# Cancelable Compression Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `/compact` 手动压缩接入现有聊天发送态与 `abort` 入口，在用户中止时将压缩消息持久化更新为 `cancelled`，且不推进上下文边界。

**Architecture:** 保持压缩消息仍是独立的 `compression` 消息，不伪造 user message；在 `useChatStream` 中增加轻量任务类型与压缩取消控制器，`useCompression` 改为借用该任务框架启动压缩。压缩协调器在关键异步阶段显式检查取消信号，抛出受控取消错误，上层据此把压缩消息更新为 `cancelled`。

**Tech Stack:** Vue 3 `script setup`、TypeScript、AbortController、Vitest、Vue Test Utils

---

### Task 1: 扩展压缩状态模型为可取消

**Files:**
- Modify: `types/chat.d.ts`
- Modify: `src/components/BChatSidebar/components/MessageBubble/BubblePartCompression.vue`
- Test: `test/components/BChatSidebar/compression-message.model.test.ts`
- Test: `test/components/BChatSidebar/message-bubble.compression.test.ts`

- [ ] **Step 1: 为状态模型写失败测试**

```ts
test('supports cancelled compression messages without marking them as model boundaries', () => {
  const message = create.compressionMessage({
    summaryText: '',
    status: 'cancelled',
    errorMessage: '用户已取消'
  });

  expect(message.compression?.status).toBe('cancelled');
  expect(is.modelBoundaryCompressionMessage(message)).toBe(false);
});
```

- [ ] **Step 2: 运行模型测试确认失败**

Run: `pnpm test test/components/BChatSidebar/compression-message.model.test.ts`

Expected: FAIL，当前 `ChatCompressionStatus` 尚不支持 `cancelled`。

- [ ] **Step 3: 扩展类型定义**

```ts
export type ChatCompressionStatus = 'pending' | 'success' | 'failed' | 'cancelled';
```

- [ ] **Step 4: 为取消态补充展示测试**

```ts
test('renders cancelled compression message with stop guidance', () => {
  const wrapper = mount(MessageBubble, {
    props: {
      message: create.compressionMessage({
        summaryText: '',
        status: 'cancelled',
        errorMessage: '用户已取消'
      })
    },
    global: {
      stubs: {
        Icon: true,
        BButton: true,
        BImageViewer: true,
        BBubble: {
          template: '<div class="b-bubble"><slot /><slot name="header" /></div>',
          props: ['showContainer', 'placement', 'loading', 'size']
        }
      }
    }
  });

  expect(wrapper.text()).toContain('压缩已取消');
  expect(wrapper.text()).toContain('此次上下文整理已停止，后续可重新发起压缩');
});
```

- [ ] **Step 5: 在 `BubblePartCompression.vue` 中加入取消态文案分支**

```ts
if (props.message.compression?.status === 'cancelled') {
  return '压缩已取消';
}
```

```ts
if (props.message.compression?.status === 'cancelled') {
  return '此次上下文整理已停止，后续可重新发起压缩';
}
```

- [ ] **Step 6: 为取消态补充样式修饰类**

```less
.compression-node--cancelled {
  .compression-node__pill {
    color: #6b7280;
    border-color: rgba(107, 114, 128, 0.24);
    background: rgba(107, 114, 128, 0.08);
  }
}
```

- [ ] **Step 7: 运行模型与渲染测试**

Run: `pnpm test test/components/BChatSidebar/compression-message.model.test.ts test/components/BChatSidebar/message-bubble.compression.test.ts`

Expected: PASS，取消态可被创建、展示，且不形成模型边界。

- [ ] **Step 8: Commit**

```bash
git add types/chat.d.ts src/components/BChatSidebar/components/MessageBubble/BubblePartCompression.vue test/components/BChatSidebar/compression-message.model.test.ts test/components/BChatSidebar/message-bubble.compression.test.ts
git commit -m "feat: add cancelled compression status"
```

### Task 2: 为压缩协调器增加取消信号与受控取消错误

**Files:**
- Modify: `src/components/BChatSidebar/utils/compression/coordinator.ts`
- Modify: `src/components/BChatSidebar/utils/compression/error.ts`
- Modify: `src/components/BChatSidebar/utils/compression/types.ts`
- Test: `test/components/BChatSidebar/utils/compression/coordinator.test.ts`

- [ ] **Step 1: 为协调器取消路径写失败测试**

```ts
it('aborts manual compression when the abort signal is triggered', async () => {
  const { createCompressionCoordinator } = await import('@/components/BChatSidebar/utils/compression/coordinator');
  const controller = new AbortController();
  const mockStorage = createMockStorage();
  const coordinator = createCompressionCoordinator(mockStorage);
  const messages: Message[] = [
    makeMsg({ id: 'm1', role: 'user', content: 'Hello', parts: [{ type: 'text', text: 'Hello' } as never] }),
    makeMsg({ id: 'm2', role: 'assistant', content: 'World', parts: [{ type: 'text', text: 'World' } as never] })
  ];

  controller.abort();

  await expect(
    coordinator.compressSessionManually({
      sessionId: 'session-1',
      messages,
      signal: controller.signal
    })
  ).rejects.toMatchObject({ name: 'CompressionCancelledError' });
});
```

- [ ] **Step 2: 运行协调器测试确认失败**

Run: `pnpm test test/components/BChatSidebar/utils/compression/coordinator.test.ts`

Expected: FAIL，当前 `compressSessionManually` 不接受 `signal`。

- [ ] **Step 3: 在压缩类型中扩展输入参数**

```ts
export interface ManualCompressionInput {
  sessionId: string;
  messages: Message[];
  signal?: AbortSignal;
}
```

- [ ] **Step 4: 定义受控取消错误**

```ts
export class CompressionCancelledError extends Error {
  constructor() {
    super('Compression cancelled');
    this.name = 'CompressionCancelledError';
  }
}
```

- [ ] **Step 5: 添加取消检查辅助函数**

```ts
function throwIfCompressionCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CompressionCancelledError();
  }
}
```

- [ ] **Step 6: 在手动压缩与摘要构建关键阶段插入取消检查**

```ts
throwIfCompressionCancelled(signal);
const currentSummary = await storage.getValidSummary(sessionId);
throwIfCompressionCancelled(signal);
const fullRebuildTrim = ruleTrim(messages);
throwIfCompressionCancelled(signal);
```

说明：至少在以下阶段前后检查：
- 读取当前摘要前后
- `ruleTrim` 前后
- `generateStructuredSummary` 前后
- `storage.createSummary` 前

- [ ] **Step 7: 运行协调器测试**

Run: `pnpm test test/components/BChatSidebar/utils/compression/coordinator.test.ts`

Expected: PASS，取消路径抛出受控取消错误，其它既有压缩测试仍通过。

- [ ] **Step 8: Commit**

```bash
git add src/components/BChatSidebar/utils/compression/coordinator.ts src/components/BChatSidebar/utils/compression/error.ts src/components/BChatSidebar/utils/compression/types.ts test/components/BChatSidebar/utils/compression/coordinator.test.ts
git commit -m "feat: add abort signal support to compression coordinator"
```

### Task 3: 在 `useChatStream` 中引入压缩任务类型与统一 abort 分流

**Files:**
- Modify: `src/components/BChatSidebar/hooks/useChatStream.ts`
- Modify: `src/components/BChatSidebar/utils/types.ts`
- Test: `test/components/BChatSidebar/chat-slash-commands.test.ts`
- Test: `test/components/BChatSidebar/compression.integration.test.ts`

- [ ] **Step 1: 为任务分流写失败测试**

```ts
it('aborts the active compression task without calling agent.abort', async () => {
  // 该测试应断言：当 activeTaskType 为 compression 时，
  // abort 会触发压缩取消回调，而不是走普通聊天流中止。
});
```

说明：这步可以通过 mock `useChatStream` 内部依赖或对外暴露测试专用方法来完成，重点是锁定分流语义。

- [ ] **Step 2: 在 `useChatStream` 中增加任务状态**

```ts
const activeTaskType = ref<'chat' | 'compression' | null>(null);
const compressionAbortController = ref<AbortController | null>(null);
```

- [ ] **Step 3: 提供压缩任务生命周期方法**

```ts
function beginCompressionTask(): AbortSignal | undefined {
  loading.value = true;
  activeTaskType.value = 'compression';
  compressionAbortController.value = new AbortController();
  return compressionAbortController.value.signal;
}

function finishCompressionTask(): void {
  compressionAbortController.value = null;
  activeTaskType.value = null;
  loading.value = false;
}
```

- [ ] **Step 4: 普通聊天流开始时显式标记任务类型**

```ts
loading.value = true;
activeTaskType.value = 'chat';
```

并在 `handleStreamComplete` / `handleStreamError` / `abort` 的聊天路径中清理：

```ts
activeTaskType.value = null;
```

- [ ] **Step 5: 改写 `abort()` 分流逻辑**

```ts
function abort() {
  if (activeTaskType.value === 'compression') {
    compressionAbortController.value?.abort();
    finishCompressionTask();
    return;
  }

  aborting.value = true;
  loading.value = false;
  activeTaskType.value = null;
  const message = finalizeCurrentAssistantMessage();
  resetToolLoopState();
  agent.abort();
  message && onComplete?.(message);
}
```

- [ ] **Step 6: 在返回值中暴露压缩任务控制方法**

```ts
stream: {
  // ...
  beginCompressionTask,
  finishCompressionTask,
}
```

- [ ] **Step 7: 运行 hook 与 slash command 相关测试**

Run: `pnpm test test/components/BChatSidebar/compression.integration.test.ts test/components/BChatSidebar/chat-slash-commands.test.ts`

Expected: FAIL 或部分 FAIL，说明上层 `useCompression` / `index.vue` 还未接入新任务方法。

- [ ] **Step 8: Commit**

```bash
git add src/components/BChatSidebar/hooks/useChatStream.ts src/components/BChatSidebar/utils/types.ts test/components/BChatSidebar/compression.integration.test.ts test/components/BChatSidebar/chat-slash-commands.test.ts
git commit -m "feat: add compression task lifecycle to chat stream"
```

### Task 4: 让 `useCompression` 与 `/compact` 复用统一发送态并写回取消消息

**Files:**
- Modify: `src/components/BChatSidebar/hooks/useCompression.ts`
- Modify: `src/components/BChatSidebar/index.vue`
- Modify: `src/components/BChatSidebar/utils/messageHelper.ts`
- Test: `test/components/BChatSidebar/compression.integration.test.ts`
- Test: `test/components/BChatSidebar/chat-slash-commands.test.ts`

- [ ] **Step 1: 为 hook 集成写失败测试**

```ts
it('marks the pending compression message as cancelled when abort is triggered', async () => {
  // 断言：pending compression 消息在取消后变为 cancelled，
  // 且不会写入 success 边界字段。
});
```

- [ ] **Step 2: 扩展 `useCompression` 依赖项**

```ts
interface CompressionOptions {
  getSessionId: () => string | undefined;
  getMessages: () => Message[];
  beginCompressionTask: () => AbortSignal | undefined;
  finishCompressionTask: () => void;
}
```

- [ ] **Step 3: 在 `useCompression.compress()` 中接入统一任务生命周期**

```ts
const signal = beginCompressionTask();

try {
  const result = await coordinator.value.compressSessionManually({ sessionId, messages, signal });
  // success path
} catch (err) {
  if (err instanceof CompressionCancelledError) {
    error.value = undefined;
    return { success: false, errorMessage: undefined, cancelled: true };
  }
  setError(err);
  return { success: false, errorMessage: error.value };
} finally {
  finishCompressionTask();
}
```

- [ ] **Step 4: 扩展压缩执行结果**

```ts
export interface CompressionExecutionResult {
  success: boolean;
  summary?: ConversationSummaryRecord;
  errorMessage?: string;
  cancelled?: boolean;
}
```

- [ ] **Step 5: 在 `index.vue` 中把 `/compact` 的 pending 消息回填取消态**

```ts
if (result.cancelled) {
  compressionMessage.compression = {
    ...compressionMessage.compression,
    status: 'cancelled',
    errorMessage: undefined
  };
  compressionMessage.content = '';
  compressionMessage.loading = false;
  compressionMessage.finished = true;
  await chatStore.updateMessage(currentSessionId, compressionMessage);
  return;
}
```

- [ ] **Step 6: 运行 `/compact` 与 compression hook 相关测试**

Run: `pnpm test test/components/BChatSidebar/compression.integration.test.ts test/components/BChatSidebar/chat-slash-commands.test.ts`

Expected: PASS，取消态能通过共享 abort 入口写回消息。

- [ ] **Step 7: Commit**

```bash
git add src/components/BChatSidebar/hooks/useCompression.ts src/components/BChatSidebar/index.vue src/components/BChatSidebar/utils/messageHelper.ts test/components/BChatSidebar/compression.integration.test.ts test/components/BChatSidebar/chat-slash-commands.test.ts
git commit -m "feat: wire compact command into shared abort flow"
```

### Task 5: 验证取消态不推进边界并完善文档

**Files:**
- Modify: `test/components/BChatSidebar/compression-boundary.model-context.test.ts`
- Modify: `changelog/2026-05-08.md`
- Test: `test/components/BChatSidebar/compression-message.model.test.ts`
- Test: `test/components/BChatSidebar/compression-boundary.model-context.test.ts`
- Test: `test/components/BChatSidebar/message-bubble.compression.test.ts`
- Test: `test/components/BChatSidebar/chat-slash-commands.test.ts`
- Test: `test/components/BChatSidebar/compression.integration.test.ts`

- [ ] **Step 1: 增加边界回归测试**

```ts
test('ignores cancelled compression messages when slicing model context from the latest boundary', () => {
  const sourceMessages = [
    create.userMessage('old user'),
    create.compressionMessage({
      summaryText: 'success boundary',
      status: 'success',
      coveredUntilMessageId: 'old-user',
      sourceMessageIds: ['old-user']
    }),
    create.userMessage('after boundary'),
    create.compressionMessage({
      summaryText: '',
      status: 'cancelled',
      errorMessage: '用户已取消'
    }),
    create.userMessage('latest user')
  ];

  const slicedMessages = sliceMessagesFromCompressionBoundary(sourceMessages);
  expect(slicedMessages[0]?.role).toBe('compression');
  expect(slicedMessages[0]?.compression?.status).toBe('success');
});
```

- [ ] **Step 2: 在 changelog 中补充取消能力记录**

```md
## Changed
- `/compact` 手动压缩接入聊天发送态，支持通过现有停止按钮中止；中止后压缩消息会持久化标记为 `已取消`
```

- [ ] **Step 3: 跑最终回归**

Run: `pnpm test test/components/BChatSidebar/compression-message.model.test.ts test/components/BChatSidebar/compression-boundary.model-context.test.ts test/components/BChatSidebar/message-bubble.compression.test.ts test/components/BChatSidebar/chat-slash-commands.test.ts test/components/BChatSidebar/compression.integration.test.ts`

Expected: PASS，取消态展示、边界裁剪、slash command、hook 集成全部通过。

- [ ] **Step 4: 跑 ESLint**

Run: `pnpm exec eslint types/chat.d.ts src/components/BChatSidebar/hooks/useChatStream.ts src/components/BChatSidebar/hooks/useCompression.ts src/components/BChatSidebar/utils/compression/coordinator.ts src/components/BChatSidebar/utils/compression/error.ts src/components/BChatSidebar/components/MessageBubble/BubblePartCompression.vue src/components/BChatSidebar/index.vue test/components/BChatSidebar/compression-message.model.test.ts test/components/BChatSidebar/compression-boundary.model-context.test.ts test/components/BChatSidebar/message-bubble.compression.test.ts test/components/BChatSidebar/chat-slash-commands.test.ts test/components/BChatSidebar/compression.integration.test.ts --format unix`

Expected: 无告警输出。

- [ ] **Step 5: Commit**

```bash
git add changelog/2026-05-08.md types/chat.d.ts src/components/BChatSidebar/hooks/useChatStream.ts src/components/BChatSidebar/hooks/useCompression.ts src/components/BChatSidebar/utils/compression/coordinator.ts src/components/BChatSidebar/utils/compression/error.ts src/components/BChatSidebar/components/MessageBubble/BubblePartCompression.vue src/components/BChatSidebar/index.vue test/components/BChatSidebar/compression-message.model.test.ts test/components/BChatSidebar/compression-boundary.model-context.test.ts test/components/BChatSidebar/message-bubble.compression.test.ts test/components/BChatSidebar/chat-slash-commands.test.ts test/components/BChatSidebar/compression.integration.test.ts
git commit -m "feat: support cancelling compact tasks"
```

## Self-Review

- Spec coverage: 计划覆盖了取消状态模型、协调器取消检查点、统一发送态接入、UI 取消文案、边界不推进和最终回归。
- Placeholder scan: 每个任务都包含明确文件、测试命令、实现代码片段和期望结果，没有 `TODO` / `TBD`。
- Type consistency: 所有步骤统一使用 `cancelled` 作为状态值，统一使用 `CompressionCancelledError` 表示用户主动中止。
