# Chat Compression Message Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/compact` 手动压缩改造成“持久化压缩消息 + 新上下文边界”，让旧消息不再直传给模型，而由压缩消息作为后续对话的上下文起点。

**Architecture:** 现有摘要存储继续负责生成和保存结构化摘要，但不再直接决定后续发送边界。新的持久化压缩消息会进入会话消息流，承载压缩状态、摘要文本与覆盖边界；模型上下文组装改为从最后一条成功压缩消息开始，压缩消息之前的普通消息只通过该压缩消息及其关联摘要参与后续请求。

**Tech Stack:** Vue 3、TypeScript、Pinia、Vitest、SQLite fallback storage、现有 BChatSidebar compression coordinator

---

### Task 1: 定义压缩消息数据模型

**Files:**
- Modify: `types/chat.d.ts`
- Modify: `src/components/BChatSidebar/utils/types.ts`
- Modify: `src/components/BChatSidebar/utils/messageHelper.ts`
- Test: `test/components/BChatSidebar/compression-message.model.test.ts`

- [ ] **Step 1: 写失败测试，锁定压缩消息的角色、状态与持久化资格**

```ts
import { describe, expect, test } from 'vitest';
import { create, is } from '@/components/BChatSidebar/utils/messageHelper';

describe('compression message model', () => {
  test('creates a persistable compression message with pending status', () => {
    const message = create.compressionMessage({
      summaryText: '准备压缩上下文…',
      status: 'pending',
      coveredUntilMessageId: undefined
    });

    expect(message.role).toBe('compression');
    expect(message.compression?.status).toBe('pending');
    expect(is.persistableMessage(message)).toBe(true);
    expect(is.modelBoundaryCompressionMessage(message)).toBe(false);
  });

  test('marks a successful compression message as a model boundary', () => {
    const message = create.compressionMessage({
      summaryText: '历史对话已压缩',
      status: 'success',
      summaryId: 'summary-1',
      coveredUntilMessageId: 'message-42',
      sourceMessageIds: ['message-1', 'message-42']
    });

    expect(is.modelBoundaryCompressionMessage(message)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试，确认当前实现缺少压缩消息能力**

Run: `pnpm test test/components/BChatSidebar/compression-message.model.test.ts`

Expected: FAIL，提示 `create.compressionMessage` 或 `role: 'compression'` 尚未定义。

- [ ] **Step 3: 最小实现压缩消息类型与辅助判断**

```ts
// types/chat.d.ts
export type ChatMessageRole = 'user' | 'system' | 'assistant' | 'error' | 'compression';

export interface ChatCompressionMeta {
  status: 'pending' | 'success' | 'failed';
  summaryText: string;
  summaryId?: string;
  coveredUntilMessageId?: string;
  sourceMessageIds?: string[];
  errorMessage?: string;
}

export interface ChatMessageRecord {
  // 保留现有字段
  compression?: ChatCompressionMeta;
}
```

```ts
// src/components/BChatSidebar/utils/types.ts
export interface Message {
  // 保留现有字段
  compression?: ChatCompressionMeta;
}
```

```ts
// src/components/BChatSidebar/utils/messageHelper.ts
function createBase(overrides: Partial<Message>): Message {
  return { id: nanoid(), parts: [], loading: false, createdAt: dayjs().toISOString(), ...overrides } as Message;
}

export const create = {
  compressionMessage(input: {
    summaryText: string;
    status: 'pending' | 'success' | 'failed';
    summaryId?: string;
    coveredUntilMessageId?: string;
    sourceMessageIds?: string[];
    errorMessage?: string;
  }): Message {
    return createBase({
      role: 'compression',
      content: input.summaryText,
      parts: [{ type: 'text', text: input.summaryText }],
      compression: { ...input },
      finished: input.status !== 'pending',
      loading: input.status === 'pending'
    });
  }
};

export const is = {
  persistableMessage(message: Message): message is PersistableMessage {
    return message.role === 'user' || message.role === 'assistant' || message.role === 'error' || message.role === 'compression';
  },
  modelBoundaryCompressionMessage(message: Message): boolean {
    return message.role === 'compression' && message.compression?.status === 'success' && Boolean(message.compression.coveredUntilMessageId);
  }
} as const;
```

- [ ] **Step 4: 运行测试，确认模型定义通过**

Run: `pnpm test test/components/BChatSidebar/compression-message.model.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add types/chat.d.ts src/components/BChatSidebar/utils/types.ts src/components/BChatSidebar/utils/messageHelper.ts test/components/BChatSidebar/compression-message.model.test.ts
git commit -m "feat: add compression message model"
```

### Task 2: 让聊天存储层持久化压缩消息

**Files:**
- Modify: `src/stores/chat.ts`
- Modify: `src/shared/storage/chats/sqlite.ts`
- Test: `test/stores/chat.compression-message.test.ts`

- [ ] **Step 1: 写失败测试，验证压缩消息会被存取并保留 compression 元数据**

```ts
import { describe, expect, test } from 'vitest';
import { useChatStore } from '@/stores/chat';
import { create } from '@/components/BChatSidebar/utils/messageHelper';

describe('chat store compression persistence', () => {
  test('persists and restores compression messages with compression metadata', async () => {
    const store = useChatStore();
    const session = await store.createSession('assistant');
    const message = create.compressionMessage({
      summaryText: '已压缩 32 条历史消息',
      status: 'success',
      summaryId: 'summary-1',
      coveredUntilMessageId: 'message-32',
      sourceMessageIds: ['message-1', 'message-32']
    });

    await store.addSessionMessage(session.id, message);
    const messages = await store.getSessionMessages(session.id);

    expect(messages[0].role).toBe('compression');
    expect(messages[0].compression?.summaryId).toBe('summary-1');
  });
});
```

- [ ] **Step 2: 运行测试，确认当前 record mapper 丢失 compression 字段**

Run: `pnpm test test/stores/chat.compression-message.test.ts`

Expected: FAIL，提示 `compression` 未持久化或角色不被识别。

- [ ] **Step 3: 最小实现 store / sqlite 的 compression 字段读写**

```ts
// src/stores/chat.ts
function toRecordMessage(sessionId: string, message: PersistableMessage): ChatMessageRecord {
  const { id, role, content, parts, thinking, files, usage, createdAt, compression } = message;
  return { sessionId, id, role, content, parts, thinking, files, usage, createdAt, compression };
}
```

```ts
// src/shared/storage/chats/sqlite.ts
const SELECT_MESSAGES_BY_SESSION_SQL = `
  SELECT id, session_id, role, content, parts_json, thinking, files_json, usage_json, compression_json, created_at
  FROM chat_messages
  WHERE session_id = ?
  ORDER BY created_at DESC, id DESC
  LIMIT ?
`;

interface ChatMessageRow {
  compression_json: string | null;
}

function isChatMessageRole(value: string): value is ChatMessageRole {
  return value === 'user' || value === 'assistant' || value === 'error' || value === 'compression';
}

function mapMessageRow(row: ChatMessageRow): ChatMessageRecord {
  return {
    // 保留原字段
    compression: parseJson<ChatCompressionMeta>(row.compression_json) ?? undefined
  };
}

await dbExecute(UPSERT_MESSAGE_SQL, [
  message.id,
  message.sessionId,
  message.role,
  message.content,
  stringifyJson(message.parts),
  message.thinking ?? null,
  stringifyJson(message.files),
  stringifyJson(message.usage),
  stringifyJson(message.compression),
  message.createdAt
]);
```

- [ ] **Step 4: 运行测试，确认压缩消息可持久化**

Run: `pnpm test test/stores/chat.compression-message.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/chat.ts src/shared/storage/chats/sqlite.ts test/stores/chat.compression-message.test.ts
git commit -m "feat: persist compression chat messages"
```

### Task 3: 用压缩消息驱动 `/compact` 生命周期

**Files:**
- Modify: `src/components/BChatSidebar/hooks/useCompression.ts`
- Modify: `src/components/BChatSidebar/index.vue`
- Test: `test/components/BChatSidebar/chat-slash-commands.test.ts`
- Test: `test/components/BChatSidebar/useCompression.message-lifecycle.test.ts`

- [ ] **Step 1: 写失败测试，验证 `/compact` 会先插入 pending 消息，再回填 success**

```ts
test('creates a persistent pending compression message and updates it on success', async () => {
  const wrapper = mountChatSidebar();
  const compactCommand = chatSlashCommands.find((item) => item.id === 'compact');

  wrapper.getComponent({ name: 'BPromptEditor' }).vm.$emit('slash-command', compactCommand);
  await nextTick();

  expect(chatHistoryState.messages.at(-1)?.role).toBe('compression');
  expect(chatHistoryState.messages.at(-1)?.compression?.status).toBe('pending');

  await flushPromises();

  expect(chatHistoryState.messages.at(-1)?.compression?.status).toBe('success');
  expect(chatHistoryState.messages.at(-1)?.content).toContain('压缩');
});
```

- [ ] **Step 2: 运行测试，确认当前 `/compact` 只 toast 不产生日志消息**

Run: `pnpm test test/components/BChatSidebar/chat-slash-commands.test.ts test/components/BChatSidebar/useCompression.message-lifecycle.test.ts`

Expected: FAIL，提示最后一条消息不是 `compression`。

- [ ] **Step 3: 最小实现 compression hook 的消息生命周期返回值**

```ts
// src/components/BChatSidebar/hooks/useCompression.ts
interface CompressionLifecycleResult {
  success: boolean;
  summary?: ConversationSummaryRecord;
  errorMessage?: string;
}

async function compress(): Promise<CompressionLifecycleResult> {
  // 保留现有校验
  const result = await coordinator.value.compressSessionManually({ sessionId, messages });
  if (!result) {
    return { success: false, errorMessage: '没有可压缩的消息' };
  }
  await loadAndRefresh();
  return { success: true, summary: result };
}
```

```ts
// src/components/BChatSidebar/index.vue
async function handleCompactContext(): Promise<void> {
  const pendingMessage = create.compressionMessage({
    summaryText: '正在压缩上下文…',
    status: 'pending'
  });
  messages.value.push(pendingMessage);
  await chatStore.addSessionMessage(settingStore.chatSidebarActiveSessionId, pendingMessage);

  const result = await compression.compress();
  const target = messages.value.find((item) => item.id === pendingMessage.id);
  if (!target) return;

  if (result.success && result.summary) {
    Object.assign(target, create.compressionMessage({
      summaryText: result.summary.summaryText,
      status: 'success',
      summaryId: result.summary.id,
      coveredUntilMessageId: result.summary.coveredUntilMessageId,
      sourceMessageIds: result.summary.sourceMessageIds
    }), { id: pendingMessage.id, createdAt: pendingMessage.createdAt });
  } else {
    Object.assign(target, create.compressionMessage({
      summaryText: result.errorMessage ?? '压缩失败',
      status: 'failed',
      errorMessage: result.errorMessage ?? '压缩失败'
    }), { id: pendingMessage.id, createdAt: pendingMessage.createdAt });
  }

  await chatStore.setSessionMessages(settingStore.chatSidebarActiveSessionId, messages.value);
}
```

- [ ] **Step 4: 运行测试，确认 `/compact` 生命周期成立**

Run: `pnpm test test/components/BChatSidebar/chat-slash-commands.test.ts test/components/BChatSidebar/useCompression.message-lifecycle.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BChatSidebar/hooks/useCompression.ts src/components/BChatSidebar/index.vue test/components/BChatSidebar/chat-slash-commands.test.ts test/components/BChatSidebar/useCompression.message-lifecycle.test.ts
git commit -m "feat: persist compression message lifecycle"
```

### Task 4: 在消息列表中渲染独立压缩消息形态

**Files:**
- Modify: `src/components/BChatSidebar/components/MessageBubble.vue`
- Create: `src/components/BChatSidebar/components/MessageBubble/BubblePartCompression.vue`
- Test: `test/components/BChatSidebar/message-bubble.compression.test.ts`

- [ ] **Step 1: 写失败测试，验证 pending / success / failed 三种压缩消息展示**

```ts
import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import MessageBubble from '@/components/BChatSidebar/components/MessageBubble.vue';
import { create } from '@/components/BChatSidebar/utils/messageHelper';

describe('MessageBubble compression rendering', () => {
  test('renders compression status and summary text', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: create.compressionMessage({
          summaryText: '已压缩 12 轮历史对话',
          status: 'success',
          summaryId: 'summary-1',
          coveredUntilMessageId: 'message-24',
          sourceMessageIds: ['message-1', 'message-24']
        })
      }
    });

    expect(wrapper.text()).toContain('上下文已压缩');
    expect(wrapper.text()).toContain('已压缩 12 轮历史对话');
  });
});
```

- [ ] **Step 2: 运行测试，确认当前气泡不认识 compression role**

Run: `pnpm test test/components/BChatSidebar/message-bubble.compression.test.ts`

Expected: FAIL，提示压缩文案未出现。

- [ ] **Step 3: 最小实现压缩消息专用渲染组件**

```vue
<!-- src/components/BChatSidebar/components/MessageBubble/BubblePartCompression.vue -->
<template>
  <div class="bubble-part-compression">
    <div class="bubble-part-compression__badge">{{ statusLabel }}</div>
    <div class="bubble-part-compression__text">{{ message.compression?.summaryText }}</div>
    <div v-if="message.compression?.status === 'failed' && message.compression?.errorMessage" class="bubble-part-compression__error">
      {{ message.compression.errorMessage }}
    </div>
  </div>
</template>
```

```ts
// src/components/BChatSidebar/components/MessageBubble.vue
const isCompressionMessage = computed(() => props.message.role === 'compression');
const bubblePlacement = computed(() => (isUserMessage.value ? 'right' : 'left'));
const showContainer = computed(() => isCompressionMessage.value || !!props.message.parts?.length);
```

```vue
<BubblePartCompression v-if="isCompressionMessage" :message="message" />
```

- [ ] **Step 4: 运行测试，确认压缩消息展示可用**

Run: `pnpm test test/components/BChatSidebar/message-bubble.compression.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BChatSidebar/components/MessageBubble.vue src/components/BChatSidebar/components/MessageBubble/BubblePartCompression.vue test/components/BChatSidebar/message-bubble.compression.test.ts
git commit -m "feat: render compression chat messages"
```

### Task 5: 让模型上下文从最后一条成功压缩消息开始

**Files:**
- Modify: `src/components/BChatSidebar/utils/messageHelper.ts`
- Modify: `src/components/BChatSidebar/hooks/useChatStream.ts`
- Modify: `src/components/BChatSidebar/utils/compression/policy.ts`
- Test: `test/components/BChatSidebar/compression-boundary.model-context.test.ts`

- [ ] **Step 1: 写失败测试，验证压缩消息之前的普通消息不会继续直传**

```ts
import { describe, expect, test } from 'vitest';
import { convert, create } from '@/components/BChatSidebar/utils/messageHelper';

describe('compression boundary model context', () => {
  test('uses the latest successful compression message as the new context start', () => {
    const sourceMessages = [
      create.userMessage('old user'),
      create.userMessage('old assistant') as never,
      create.compressionMessage({
        summaryText: '历史对话摘要',
        status: 'success',
        summaryId: 'summary-1',
        coveredUntilMessageId: 'old-assistant',
        sourceMessageIds: ['old-user', 'old-assistant']
      }),
      create.userMessage('new question')
    ];

    const modelMessages = convert.toModelMessagesFromCompressionBoundary(sourceMessages);

    expect(modelMessages).toEqual([
      { role: 'assistant', content: '历史对话摘要' },
      { role: 'user', content: 'new question' }
    ]);
  });
});
```

- [ ] **Step 2: 运行测试，确认当前全量转换会把旧消息继续带上**

Run: `pnpm test test/components/BChatSidebar/compression-boundary.model-context.test.ts`

Expected: FAIL，提示旧消息仍在模型上下文中。

- [ ] **Step 3: 最小实现“从最后一条成功压缩消息开始”的消息裁剪**

```ts
// src/components/BChatSidebar/utils/messageHelper.ts
function sliceMessagesFromCompressionBoundary(sourceMessages: Message[]): Message[] {
  for (let index = sourceMessages.length - 1; index >= 0; index -= 1) {
    if (is.modelBoundaryCompressionMessage(sourceMessages[index])) {
      return sourceMessages.slice(index);
    }
  }
  return sourceMessages;
}

function toModelMessagesForMessage(message: Message): ModelMessage[] {
  if (message.role === 'compression') {
    if (message.compression?.status !== 'success') return [];
    return [{ role: 'assistant', content: message.compression.summaryText }];
  }
  // 保留现有 user / assistant 逻辑
}

export const convert = {
  toModelMessagesFromCompressionBoundary(sourceMessages: Message[]): ModelMessage[] {
    return convert.toModelMessages(sliceMessagesFromCompressionBoundary(sourceMessages));
  }
};
```

```ts
// src/components/BChatSidebar/hooks/useChatStream.ts
currentModelMessageCache = convert.toCachedModelMessages(sliceMessagesFromCompressionBoundary(sourceMessages), currentModelMessageCache);
```

```ts
// src/components/BChatSidebar/utils/compression/policy.ts
const userAndAssistant = sliceMessagesFromCompressionBoundary(messages).filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'compression');
```

- [ ] **Step 4: 运行测试，确认边界切换生效**

Run: `pnpm test test/components/BChatSidebar/compression-boundary.model-context.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BChatSidebar/utils/messageHelper.ts src/components/BChatSidebar/hooks/useChatStream.ts src/components/BChatSidebar/utils/compression/policy.ts test/components/BChatSidebar/compression-boundary.model-context.test.ts
git commit -m "feat: use compression messages as model boundaries"
```

### Task 6: 全链路回归与文档收口

**Files:**
- Modify: `changelog/2026-05-07.md`
- Test: `test/components/BChatSidebar/chat-slash-commands.test.ts`
- Test: `test/components/BChatSidebar/compression.integration.test.ts`
- Test: `test/components/BChatSidebar/message-bubble.compression.test.ts`
- Test: `test/components/BChatSidebar/compression-boundary.model-context.test.ts`

- [ ] **Step 1: 补失败 / 成功 / 边界切换的 changelog 记录**

```md
## Changed
- `/compact` 现在会写入持久化压缩消息，并以该消息作为后续模型上下文边界。

## Tests
- 新增压缩消息模型、持久化、渲染和模型边界测试。
```

- [ ] **Step 2: 运行本次改动的最小回归集**

Run: `pnpm test test/components/BChatSidebar/chat-slash-commands.test.ts test/components/BChatSidebar/compression.integration.test.ts test/components/BChatSidebar/message-bubble.compression.test.ts test/components/BChatSidebar/compression-boundary.model-context.test.ts test/stores/chat.compression-message.test.ts`

Expected: PASS

- [ ] **Step 3: 运行类型与关键 UI 相关回归**

Run: `pnpm test test/components/BPromptEditor/SlashCommandSelect.test.ts test/components/BPromptEditor/BPromptEditorSlashCommands.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add changelog/2026-05-07.md test/components/BChatSidebar/chat-slash-commands.test.ts test/components/BChatSidebar/compression.integration.test.ts test/components/BChatSidebar/message-bubble.compression.test.ts test/components/BChatSidebar/compression-boundary.model-context.test.ts test/stores/chat.compression-message.test.ts
git commit -m "test: cover compression boundary message flow"
```
