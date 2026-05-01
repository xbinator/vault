# File Reference Structured Resource Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将聊天中的文件引用从正文 token 预展开链路重构为正式 `file-reference` 消息片段，并新增 `read_reference` 工具按需读取发送时冻结的 snapshot。

**Architecture:** 输入框仍保留 `{{file-ref:...}}` 作为编辑态占位，但在发送时解析为 `text part + file-reference part` 的有序消息结构。模型上下文只接收结构化引用索引，不再注入正文内容；真正读取内容时统一通过 `read_reference(referenceId)` 命中 snapshot。

**Tech Stack:** Vue 3、TypeScript、Vitest、AI SDK tool transport、SQLite chat snapshot storage

---

## File Structure

- Modify: `types/chat.d.ts`
  定义新的 `ChatMessageFileReferencePart`，并扩展 `ChatMessagePart` 联合类型。
- Modify: `src/components/BChatSidebar/utils/types.ts`
  调整 `Message` 类型注释，淡化 `references` 主链路语义。
- Modify: `src/components/BChatSidebar/utils/messageHelper.ts`
  新增草稿 token 解析为 `parts` 的入口，调整 `create.userMessage()`、纯文本聚合和模型消息转换。
- Modify: `src/components/BChatSidebar/hooks/useFileReference.ts`
  让草稿引用数据更适合发送前结构化解析，同时保留编辑态 token 插入能力。
- Modify: `src/components/BChatSidebar/index.vue`
  在 `handleChatSubmit()` 中用结构化 `parts` 创建用户消息，不再把 `references` 当作主数据。
- Modify: `src/components/BChatSidebar/utils/referenceSnapshot.ts`
  改为从 `file-reference part` 收集引用并回填 `snapshotId`。
- Modify: `src/components/BChatSidebar/utils/fileReferenceContext.ts`
  删除正文预展开逻辑，改为生成模型用的“Available file references”索引块。
- Modify: `src/components/BChatSidebar/hooks/useChatStream.ts`
  发送前先冻结 snapshot，再基于 `file-reference part` 构造模型消息。
- Modify: `src/components/BChatSidebar/components/MessageBubble/BubblePartText.vue`
  从 `file-reference part` 渲染引用 chip，不再仅依赖正则扫描正文。
- Modify: `src/ai/tools/builtin/index.ts`
  注册新的 `read_reference` 工具。
- Modify: `src/ai/tools/builtin/catalog.ts`
  将 `read_reference` 纳入内置工具目录测试常量。
- Create: `src/ai/tools/builtin/read-reference.ts`
  实现基于 `referenceId` 的 snapshot 读取工具。
- Modify: `src/shared/storage/chats/sqlite.ts`
  若现有接口不足，补充按 snapshotId 读取快照的辅助方法。
- Test: `test/components/BChat/message.test.ts`
  覆盖 `file-reference part` 创建、纯文本聚合和模型消息转换。
- Test: `test/components/BChatSidebar/useChatInput.test.ts`
  覆盖草稿引用恢复与结构化发送前数据。
- Test: `test/useChatStream.test.ts`
  覆盖流发送前模型消息中出现引用索引而非正文展开。
- Test: `test/ai/tools/builtin-read-reference.test.ts`
  覆盖 `read_reference` 默认窗口、分页和未保存文档 snapshot 读取。
- Test: `test/ai/tools/builtin-index.test.ts`
  覆盖内置工具列表新增 `read_reference`。

### Task 1: 定义 `file-reference` 消息片段并改造消息工具

**Files:**
- Modify: `types/chat.d.ts`
- Modify: `src/components/BChatSidebar/utils/types.ts`
- Modify: `src/components/BChatSidebar/utils/messageHelper.ts`
- Test: `test/components/BChat/message.test.ts`

- [ ] **Step 1: 先写 `messageHelper` 的失败测试，锁定新消息结构**

```ts
it('creates user messages with ordered file-reference parts and plain-text content', () => {
  const message = create.userMessageFromParts([
    { type: 'text', text: '请看 ' },
    {
      type: 'file-reference',
      referenceId: 'ref-1',
      documentId: 'doc-1',
      snapshotId: '',
      fileName: 'useChatStream.ts',
      path: '/workspace/src/useChatStream.ts',
      startLine: 300,
      endLine: 360
    },
    { type: 'text', text: ' 这里' }
  ]);

  expect(message.content).toBe('请看  这里');
  expect(message.parts.map((part) => part.type)).toEqual(['text', 'file-reference', 'text']);
});

it('converts file-reference parts into model-visible reference markers instead of inline file content', () => {
  const message = create.userMessageFromParts([
    { type: 'text', text: '分析这个引用' },
    {
      type: 'file-reference',
      referenceId: 'ref-1',
      documentId: 'doc-1',
      snapshotId: 'snapshot-1',
      fileName: 'draft.ts',
      path: null,
      startLine: 10,
      endLine: 20
    }
  ]);

  expect(convert.toModelMessages([message])).toEqual([
    {
      role: 'user',
      content: '分析这个引用'
    }
  ]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test test/components/BChat/message.test.ts`
Expected: FAIL，提示 `create.userMessageFromParts` 未定义，且 `file-reference` 不是合法的 `ChatMessagePart.type`

- [ ] **Step 3: 添加 `ChatMessageFileReferencePart` 和新的消息创建入口**

```ts
/**
 * 聊天消息文件引用片段
 */
export interface ChatMessageFileReferencePart {
  /** 片段类型 */
  type: 'file-reference';
  /** 引用唯一标识 */
  referenceId: string;
  /** 引用对应的文档 ID */
  documentId: string;
  /** 引用快照 ID */
  snapshotId: string;
  /** 文件名 */
  fileName: string;
  /** 本地路径，不存在时为 null */
  path: string | null;
  /** 起始行号 */
  startLine: number;
  /** 结束行号 */
  endLine: number;
}

/**
 * 根据消息片段聚合纯文本内容。
 * @param parts - 消息片段列表
 * @returns 仅包含文本片段的纯文本内容
 */
function getMessagePlainText(parts: ChatMessagePart[]): string {
  return parts
    .filter((part): part is Extract<ChatMessagePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/**
 * 创建包含结构化片段的用户消息。
 * @param parts - 有序消息片段
 * @returns 用户消息
 */
function userMessageFromParts(parts: ChatMessagePart[]): Message {
  return createBase({
    role: 'user',
    content: getMessagePlainText(parts),
    parts,
    finished: true
  });
}
```

- [ ] **Step 4: 移除旧的 `expandFileReferencesForModel()` 断言，改成基于 `parts` 的行为断言**

```ts
expect(message.content).toBe('请看  这里');
expect(is.modelMessage(message)).toBe(true);
expect(
  message.parts.find((part): part is Extract<Message['parts'][number], { type: 'file-reference' }> => part.type === 'file-reference')
).toMatchObject({
  referenceId: 'ref-1',
  startLine: 300,
  endLine: 360
});
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test test/components/BChat/message.test.ts`
Expected: PASS，`message.test.ts` 中与 `file-reference part` 相关的用例通过

- [ ] **Step 6: 提交本任务**

```bash
git add types/chat.d.ts src/components/BChatSidebar/utils/types.ts src/components/BChatSidebar/utils/messageHelper.ts test/components/BChat/message.test.ts
git commit -m "feat(chat): add structured file reference parts"
```

### Task 2: 在发送链路中将草稿 token 解析为结构化 `parts`

**Files:**
- Modify: `src/components/BChatSidebar/hooks/useFileReference.ts`
- Modify: `src/components/BChatSidebar/index.vue`
- Test: `test/components/BChatSidebar/useChatInput.test.ts`
- Test: `test/components/BChat/message.test.ts`

- [ ] **Step 1: 先写失败测试，锁定“发送时按正文出现顺序产出 parts”**

```ts
it('builds ordered text and file-reference parts from active draft references', () => {
  const parts = buildMessagePartsFromDraft(
    'A {{file-ref:ref-1|foo.ts|3|5}} B',
    [
      {
        id: 'ref-1',
        token: '{{file-ref:ref-1|foo.ts|3|5}}',
        documentId: 'doc-1',
        fileName: 'foo.ts',
        line: '3-5',
        path: '/workspace/foo.ts',
        snapshotId: ''
      }
    ]
  );

  expect(parts).toEqual([
    { type: 'text', text: 'A ' },
    {
      type: 'file-reference',
      referenceId: 'ref-1',
      documentId: 'doc-1',
      snapshotId: '',
      fileName: 'foo.ts',
      path: '/workspace/foo.ts',
      startLine: 3,
      endLine: 5
    },
    { type: 'text', text: ' B' }
  ]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test test/components/BChat/message.test.ts test/components/BChatSidebar/useChatInput.test.ts`
Expected: FAIL，提示 `buildMessagePartsFromDraft` 未导出或 token 仍只返回 `references`

- [ ] **Step 3: 实现发送前 token 解析工具，并在 `handleChatSubmit()` 中使用它**

```ts
/**
 * 将草稿正文和活动引用解析为有序消息片段。
 * @param content - 草稿正文
 * @param references - 活动引用
 * @returns 有序消息片段
 */
export function buildMessagePartsFromDraft(content: string, references: ChatMessageFileReference[]): ChatMessagePart[] {
  const orderedReferences = references
    .map((reference) => ({ reference, index: content.indexOf(reference.token) }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index);

  const parts: ChatMessagePart[] = [];
  let cursor = 0;

  orderedReferences.forEach(({ reference, index }) => {
    if (index > cursor) {
      parts.push({ type: 'text', text: content.slice(cursor, index) });
    }

    const [startLine, endLine] = parseDraftReferenceLine(reference.line);
    parts.push({
      type: 'file-reference',
      referenceId: reference.id,
      documentId: reference.documentId,
      snapshotId: reference.snapshotId,
      fileName: reference.fileName,
      path: reference.path,
      startLine,
      endLine
    });

    cursor = index + reference.token.length;
  });

  if (cursor < content.length) {
    parts.push({ type: 'text', text: content.slice(cursor) });
  }

  return parts;
}
```

```ts
const references = inputEvents.getActiveReferences(content) ?? [];
const parts = buildMessagePartsFromDraft(content, references);
const nextMessage = create.userMessageFromParts(parts);
```

- [ ] **Step 4: 验证未保存文档仍能保留 `documentId` 和 `path: null`**

```ts
expect(parts[1]).toMatchObject({
  type: 'file-reference',
  documentId: 'doc-unsaved',
  path: null,
  startLine: 10,
  endLine: 20
});
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test test/components/BChat/message.test.ts test/components/BChatSidebar/useChatInput.test.ts`
Expected: PASS，发送前结构化解析测试通过

- [ ] **Step 6: 提交本任务**

```bash
git add src/components/BChatSidebar/hooks/useFileReference.ts src/components/BChatSidebar/index.vue src/components/BChatSidebar/utils/messageHelper.ts test/components/BChat/message.test.ts test/components/BChatSidebar/useChatInput.test.ts
git commit -m "feat(chat): build message parts from file reference drafts"
```

### Task 3: 从 `file-reference part` 生成 snapshot，并让消息气泡按 part 渲染引用

**Files:**
- Modify: `src/components/BChatSidebar/utils/referenceSnapshot.ts`
- Modify: `src/components/BChatSidebar/components/MessageBubble/BubblePartText.vue`
- Test: `test/electron/chat-storage-sqlite.test.ts`
- Test: `test/components/BChat/message-bubble.component.test.ts`

- [ ] **Step 1: 先写失败测试，锁定“同文档多引用只生成一个 snapshot”**

```ts
it('reuses one snapshot for multiple file-reference parts from the same document', async () => {
  const message: Message = {
    id: 'user-1',
    role: 'user',
    content: '请看',
    createdAt: '2026-05-02T00:00:00.000Z',
    parts: [
      { type: 'text', text: '请看 ' },
      {
        type: 'file-reference',
        referenceId: 'ref-1',
        documentId: 'doc-1',
        snapshotId: '',
        fileName: 'foo.ts',
        path: '/workspace/foo.ts',
        startLine: 3,
        endLine: 5
      },
      {
        type: 'file-reference',
        referenceId: 'ref-2',
        documentId: 'doc-1',
        snapshotId: '',
        fileName: 'foo.ts',
        path: '/workspace/foo.ts',
        startLine: 20,
        endLine: 24
      }
    ]
  };

  await persistReferenceSnapshots(message);

  const snapshotIds = message.parts
    .filter((part): part is Extract<Message['parts'][number], { type: 'file-reference' }> => part.type === 'file-reference')
    .map((part) => part.snapshotId);

  expect(new Set(snapshotIds).size).toBe(1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test test/electron/chat-storage-sqlite.test.ts test/components/BChat/message-bubble.component.test.ts`
Expected: FAIL，`persistReferenceSnapshots()` 仍只读取 `message.references`

- [ ] **Step 3: 改造 snapshot 生成逻辑，直接从 `parts` 提取引用**

```ts
/**
 * 收集消息中的文件引用片段。
 * @param message - 聊天消息
 * @returns 文件引用片段列表
 */
function collectFileReferenceParts(message: Message): ChatMessageFileReferencePart[] {
  return message.parts.filter((part): part is ChatMessageFileReferencePart => part.type === 'file-reference');
}

/**
 * 将同文档的 snapshotId 回填到消息片段。
 * @param parts - 文件引用片段
 * @param snapshotId - 快照 ID
 */
function assignSnapshotId(parts: ChatMessageFileReferencePart[], snapshotId: string): void {
  parts.forEach((part) => {
    part.snapshotId = snapshotId;
  });
}
```

- [ ] **Step 4: 让消息气泡优先基于 `file-reference part` 渲染 chip**

```ts
const normalizedParts = computed(() => {
  return props.part.type === 'text'
    ? splitTextPartWithReferenceLabels(props.part.text, props.message.parts)
    : props.message.parts.map((part) => {
        if (part.type === 'file-reference') {
          const lineLabel = part.startLine > 0 ? `${part.startLine}${part.endLine > part.startLine ? `-${part.endLine}` : ''}` : '';
          return { type: 'file-reference', label: lineLabel ? `${part.fileName}:${lineLabel}` : part.fileName };
        }
        return part;
      });
});
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test test/electron/chat-storage-sqlite.test.ts test/components/BChat/message-bubble.component.test.ts`
Expected: PASS，snapshot 复用和引用渲染用例通过

- [ ] **Step 6: 提交本任务**

```bash
git add src/components/BChatSidebar/utils/referenceSnapshot.ts src/components/BChatSidebar/components/MessageBubble/BubblePartText.vue test/electron/chat-storage-sqlite.test.ts test/components/BChat/message-bubble.component.test.ts
git commit -m "feat(chat): persist snapshots from file reference parts"
```

### Task 4: 新增 `read_reference` 工具并接入内置工具目录

**Files:**
- Create: `src/ai/tools/builtin/read-reference.ts`
- Modify: `src/ai/tools/builtin/index.ts`
- Modify: `src/ai/tools/builtin/catalog.ts`
- Modify: `src/shared/storage/chats/sqlite.ts`
- Test: `test/ai/tools/builtin-read-reference.test.ts`
- Test: `test/ai/tools/builtin-index.test.ts`

- [ ] **Step 1: 先写失败测试，锁定 `read_reference` 的默认窗口和分页行为**

```ts
it('reads a frozen snapshot by reference id using the default line window', async () => {
  const tool = createBuiltinReadReferenceTool({
    getReferenceSnapshot: async () => ({
      referenceId: 'ref-1',
      fileName: 'draft.ts',
      path: null,
      documentId: 'doc-1',
      snapshotId: 'snapshot-1',
      content: Array.from({ length: 200 }, (_, index) => `line ${index + 1}`).join('\n'),
      startLine: 50,
      endLine: 55
    })
  });

  const result = await tool.execute({ referenceId: 'ref-1' });

  expect(result.status).toBe('success');
  expect(result.data.offset).toBe(1);
  expect(result.data.readLines).toBe(120);
  expect(result.data.hasMore).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test test/ai/tools/builtin-read-reference.test.ts test/ai/tools/builtin-index.test.ts`
Expected: FAIL，`createBuiltinReadReferenceTool` 不存在，内置工具列表中也没有 `read_reference`

- [ ] **Step 3: 实现 `read_reference` 工具，并复用现有行裁剪语义**

```ts
export const READ_REFERENCE_TOOL_NAME = 'read_reference';
const DEFAULT_REFERENCE_WINDOW = 120;

/**
 * 创建聊天文件引用读取工具。
 * @param options - 工具选项
 * @returns 工具执行器
 */
export function createBuiltinReadReferenceTool(options: CreateBuiltinReadReferenceToolOptions): AIToolExecutor<ReadReferenceInput, ReadReferenceResult> {
  return {
    definition: {
      name: READ_REFERENCE_TOOL_NAME,
      description: '读取聊天消息中某个文件引用对应的冻结快照内容，适合在分析引用文件时按需小窗口读取。',
      source: 'builtin',
      riskLevel: 'read',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      parameters: {
        type: 'object',
        properties: {
          referenceId: { type: 'string', description: '聊天消息中文件引用的唯一标识。' },
          offset: { type: 'number', description: '起始行号；不传时使用默认窗口策略。' },
          limit: { type: 'number', description: '读取行数。' }
        },
        required: ['referenceId'],
        additionalProperties: false
      }
    },
    async execute(input) {
      const snapshot = await options.getReferenceSnapshot(input.referenceId);
      if (!snapshot) {
        return createToolFailureResult(READ_REFERENCE_TOOL_NAME, 'EXECUTION_FAILED', '未找到对应的文件引用快照');
      }

      return createToolSuccessResult(READ_REFERENCE_TOOL_NAME, sliceReferenceSnapshot(snapshot, input.offset, input.limit));
    }
  };
}
```

- [ ] **Step 4: 将工具加入内置目录，并把工具顺序写入测试**

```ts
expect(getToolNames()).toEqual([
  'read_current_document',
  'get_current_time',
  'search_current_document',
  'ask_user_choice',
  'read_file',
  'read_reference',
  READ_DIRECTORY_TOOL_NAME,
  GET_SETTINGS_TOOL_NAME,
  QUERY_LOGS_TOOL_NAME
]);
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test test/ai/tools/builtin-read-reference.test.ts test/ai/tools/builtin-index.test.ts`
Expected: PASS，`read_reference` 工具和目录注册测试通过

- [ ] **Step 6: 提交本任务**

```bash
git add src/ai/tools/builtin/read-reference.ts src/ai/tools/builtin/index.ts src/ai/tools/builtin/catalog.ts src/shared/storage/chats/sqlite.ts test/ai/tools/builtin-read-reference.test.ts test/ai/tools/builtin-index.test.ts
git commit -m "feat(ai): add read_reference tool for chat snapshots"
```

### Task 5: 移除正文预展开，改为模型引用索引注入

**Files:**
- Modify: `src/components/BChatSidebar/utils/fileReferenceContext.ts`
- Modify: `src/components/BChatSidebar/hooks/useChatStream.ts`
- Test: `test/useChatStream.test.ts`
- Test: `test/components/BChat/message.test.ts`

- [ ] **Step 1: 先写失败测试，锁定模型消息中出现引用索引而不是文件正文**

```ts
it('builds model-ready messages with reference index blocks instead of expanded file content', () => {
  const messages: Message[] = [
    {
      id: 'user-1',
      role: 'user',
      content: '请分析这个引用',
      createdAt: '2026-05-02T00:00:00.000Z',
      parts: [
        { type: 'text', text: '请分析这个引用' },
        {
          type: 'file-reference',
          referenceId: 'ref-1',
          documentId: 'doc-1',
          snapshotId: 'snapshot-1',
          fileName: 'draft.ts',
          path: null,
          startLine: 10,
          endLine: 20
        }
      ]
    }
  ];

  const modelMessages = buildModelReadyMessages(messages, new Map());

  expect(modelMessages[0].content).toContain('Available file references for this message:');
  expect(modelMessages[0].content).toContain('ref-1: draft.ts (lines 10-20)');
  expect(modelMessages[0].content).not.toContain('附近片段');
  expect(modelMessages[0].content).not.toContain('全文内容');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test test/useChatStream.test.ts test/components/BChat/message.test.ts`
Expected: FAIL，`buildModelReadyMessages()` 仍然返回正文预展开内容

- [ ] **Step 3: 用引用索引替换旧的 `buildReferenceContextBlock()` 逻辑**

```ts
/**
 * 为单条用户消息构建模型侧文件引用索引。
 * @param references - 文件引用片段
 * @returns 引用索引文本；无引用时返回空字符串
 */
function buildReferenceIndexBlock(references: ChatMessageFileReferencePart[]): string {
  if (!references.length) {
    return '';
  }

  const lines = references.map((reference) => {
    const lineLabel = reference.startLine > 0
      ? `lines ${reference.startLine}${reference.endLine > reference.startLine ? `-${reference.endLine}` : ''}`
      : 'no explicit line range';
    const unsavedLabel = reference.path ? '' : ' (unsaved document)';
    return `- ${reference.referenceId}: ${reference.fileName}${unsavedLabel} (${lineLabel})`;
  });

  return [
    'Available file references for this message:',
    ...lines,
    '',
    'File contents are not included yet.',
    'If needed, call read_reference with the referenceId.',
    'Prefer reading a small window first.'
  ].join('\n');
}
```

- [ ] **Step 4: 在 `useChatStream` 中维持 snapshot 预加载，但只把它用于引用可读性保障**

```ts
const snapshotsById = await loadReferenceSnapshotMap(sourceMessages);
const modelMessages = buildModelReadyMessages(sourceMessages, snapshotsById);
currentModelMessageCache = convert.toCachedModelMessages(modelMessages, currentModelMessageCache);
```

关键检查点：

- `loadReferenceSnapshotMap()` 仍然要在流开始前执行，确保 `read_reference` 有数据可读。
- `buildModelReadyMessages()` 不再把 snapshot 内容注入正文，只生成引用索引块。

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test test/useChatStream.test.ts test/components/BChat/message.test.ts`
Expected: PASS，模型消息中只出现引用索引，不再出现“全文内容 / 附近片段”

- [ ] **Step 6: 运行回归测试并完成最终提交**

Run: `pnpm test test/components/BChat/message.test.ts test/components/BChatSidebar/useChatInput.test.ts test/electron/chat-storage-sqlite.test.ts test/components/BChat/message-bubble.component.test.ts test/ai/tools/builtin-read-reference.test.ts test/ai/tools/builtin-index.test.ts test/useChatStream.test.ts`
Expected: PASS，文件引用新链路相关测试全部通过

```bash
git add src/components/BChatSidebar/utils/fileReferenceContext.ts src/components/BChatSidebar/hooks/useChatStream.ts test/useChatStream.test.ts test/components/BChat/message.test.ts
git commit -m "feat(chat): switch file references to structured model resources"
```

## Self-Review

- **Spec coverage:** 5 个任务分别覆盖了 `file-reference part`、发送前解析、snapshot 冻结、`read_reference` 工具、模型引用索引注入，没有遗漏 spec 中的已保存文件 / 未保存文档 / snapshot-only 读取要求。
- **Placeholder scan:** 计划中没有 `TBD`、`TODO`、`implement later`、`类似 Task N` 这类占位描述；每个代码步骤都给出了目标接口或核心实现片段。
- **Type consistency:** 计划统一使用 `ChatMessageFileReferencePart`、`referenceId`、`documentId`、`snapshotId`、`read_reference` 这组命名，没有混用旧的 `references` 主链路术语。
