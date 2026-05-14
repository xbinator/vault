# read_file 内存优先读取 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `read_file` 工具在执行时优先从编辑器内存读取已打开文件的最新内容（含未保存修改），文件未打开时回退到文件系统读取。

**Architecture:** 在 `createBuiltinReadFileTool` 中新增 `findFileByPath` 和 `getEditorContext` 两个可选注入函数，工具内部完成路径解析→文件ID查找→编辑器上下文获取→内存内容读取的流程。任何异常均静默降级到文件系统读取。

**Tech Stack:** TypeScript, Vitest, Vue 3 Pinia stores

---

### Task 1: 提取 buildReadFileResult 公共函数（重构，无行为变更）

**Files:**
- Modify: `src/ai/tools/builtin/FileReadTool/index.ts`

**Purpose:** 将 unsaved 分支中的内联切片逻辑提取为公共函数，供新增的内存读取路径复用。

- [ ] **Step 1: 在 `createBuiltinReadFileTool` 函数上方添加 `buildReadFileResult` 函数**

在文件第 193 行 `/** 创建内置 read_file 工具。 */` 之前插入：

```typescript
/**
 * 将原始文件内容按 offset/limit 切片并构造 ReadFileResult。
 * @param filePath - 文件路径
 * @param fullContent - 完整文件内容
 * @param offset - 起始行号（1-based）
 * @param limit - 读取行数，不传时读到末尾
 * @returns 切片后的读取结果
 */
function buildReadFileResult(filePath: string, fullContent: string, offset: number, limit?: number): ReadFileResult {
  const lines = fullContent.split('\n');
  const totalLines = lines.length;
  const startLine = Math.max(0, offset - 1);
  const endLine = limit === undefined ? totalLines : Math.min(startLine + limit, totalLines);
  const content = lines.slice(startLine, endLine).join('\n');
  const readLines = endLine - startLine;
  const hasMore = endLine < totalLines;

  return {
    path: filePath,
    content,
    totalLines,
    readLines,
    hasMore,
    nextOffset: hasMore ? endLine + 1 : null
  };
}
```

Note: 当前 `index.ts` 第 188-211 行已存在此函数（之前已添加），如已存在则跳过。

- [ ] **Step 2: 替换 unsaved 分支中的内联切片逻辑**

定位到 `execute` 方法中 unsaved 路径的处理代码块（第 232-248 行附近）。将：

```typescript
const range = normalizeReadRange(input);
const lines = storedFile.content.split('\n');
const totalLines = lines.length;
const startLine = Math.max(1, range.offset) - 1;
const endLine = range.limit === undefined ? totalLines : Math.min(startLine + range.limit, totalLines);
const content = lines.slice(startLine, endLine).join('\n');
const readLines = endLine - startLine;
const hasMore = endLine < totalLines;
const result: ReadFileResult = {
  path: filePath,
  content,
  totalLines,
  readLines,
  hasMore,
  nextOffset: hasMore ? endLine + 1 : null
};
return createToolSuccessResult<ReadFileResult>(READ_FILE_TOOL_NAME, result);
```

替换为：

```typescript
const range = normalizeReadRange(input);
const result = buildReadFileResult(filePath, storedFile.content, range.offset, range.limit);
return createToolSuccessResult<ReadFileResult>(READ_FILE_TOOL_NAME, result);
```

- [ ] **Step 3: 运行现有测试确认无回归**

```bash
pnpm vitest run test/ai/tools/builtin-read-file.test.ts
```

Expected: 所有 8 个测试通过。

- [ ] **Step 4: Commit**

```bash
git add src/ai/tools/builtin/FileReadTool/index.ts
git commit -m "refactor: extract buildReadFileResult helper from read_file unsaved path"
```

---

### Task 2: 添加内存优先读取的测试用例

**Files:**
- Modify: `test/ai/tools/builtin-read-file.test.ts`

**Purpose:** 先写测试，后写实现（TDD）。

- [ ] **Step 1: 在文件末尾（第 165 行之后，`});` 之前）添加测试用例**

```typescript
  describe('memory-first read', () => {
    /**
     * 创建编辑器上下文的 mock 对象。
     * @param content - 文件内容
     * @returns 模拟的编辑器上下文
     */
    function createMockEditorContext(content: string) {
      return {
        document: {
          id: 'file-1',
          title: 'test.md',
          path: '/workspace/test.md',
          getContent: () => content
        }
      };
    }

    it('reads from memory when file is open in editor tab', async () => {
      let filesystemCalled = false;
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        findFileByPath: async () => ({ id: 'file-1' }),
        getEditorContext: () => createMockEditorContext('line1\nline2\nline3\nline4\nline5'),
        readWorkspaceFile: async () => {
          filesystemCalled = true;
          return { path: '', content: '', totalLines: 0, readLines: 0, hasMore: false, nextOffset: null };
        }
      });

      const result = await tool.execute({ path: 'test.md' });

      expect(result.status).toBe('success');
      expect(filesystemCalled).toBe(false);
      if (result.status === 'success') {
        expect(result.data.content).toBe('line1\nline2\nline3\nline4\nline5');
        expect(result.data.totalLines).toBe(5);
        expect(result.data.readLines).toBe(5);
        expect(result.data.hasMore).toBe(false);
        expect(result.data.nextOffset).toBeNull();
      }
    });

    it('supports offset and limit slicing on memory content', async () => {
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        findFileByPath: async () => ({ id: 'file-1' }),
        getEditorContext: () => createMockEditorContext('line1\nline2\nline3\nline4\nline5'),
        readWorkspaceFile: async () => ({ path: '', content: '', totalLines: 0, readLines: 0, hasMore: false, nextOffset: null })
      });

      const result = await tool.execute({ path: 'test.md', offset: 2, limit: 2 });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.content).toBe('line2\nline3');
        expect(result.data.totalLines).toBe(5);
        expect(result.data.readLines).toBe(2);
        expect(result.data.hasMore).toBe(true);
        expect(result.data.nextOffset).toBe(4);
      }
    });

    it('falls back to filesystem when file is NOT open in editor', async () => {
      const expectedResult = { path: '/workspace/test.md', content: 'disk content', totalLines: 1, readLines: 1, hasMore: false, nextOffset: null };
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        findFileByPath: async () => ({ id: 'file-2' }),
        getEditorContext: () => undefined, // 文件未在编辑器中打开
        readWorkspaceFile: async () => expectedResult
      });

      const result = await tool.execute({ path: 'test.md' });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.content).toBe('disk content');
      }
    });

    it('falls back to filesystem when findFileByPath returns null', async () => {
      const expectedResult = { path: '/workspace/unknown.md', content: 'disk', totalLines: 1, readLines: 1, hasMore: false, nextOffset: null };
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        findFileByPath: async () => null,
        getEditorContext: () => createMockEditorContext('memory'),
        readWorkspaceFile: async () => expectedResult
      });

      const result = await tool.execute({ path: 'unknown.md' });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.content).toBe('disk');
      }
    });

    it('falls back to filesystem when getContent throws', async () => {
      const expectedResult = { path: '/workspace/broken.md', content: 'disk fallback', totalLines: 1, readLines: 1, hasMore: false, nextOffset: null };
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        findFileByPath: async () => ({ id: 'file-3' }),
        getEditorContext: () => ({
          document: {
            id: 'file-3',
            title: 'broken.md',
            path: '/workspace/broken.md',
            getContent: () => { throw new Error('getContent failed'); }
          }
        }),
        readWorkspaceFile: async () => expectedResult
      });

      const result = await tool.execute({ path: 'broken.md' });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.content).toBe('disk fallback');
      }
    });

    it('returns empty content when editor content is empty string', async () => {
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        findFileByPath: async () => ({ id: 'file-4' }),
        getEditorContext: () => createMockEditorContext(''),
        readWorkspaceFile: async () => ({ path: '', content: '', totalLines: 0, readLines: 0, hasMore: false, nextOffset: null })
      });

      const result = await tool.execute({ path: 'empty.md' });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.content).toBe('');
        expect(result.data.totalLines).toBe(1);
        expect(result.data.readLines).toBe(1);
      }
    });

    it('falls back to filesystem when findFileByPath throws', async () => {
      const expectedResult = { path: '/workspace/error.md', content: 'disk', totalLines: 1, readLines: 1, hasMore: false, nextOffset: null };
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        findFileByPath: async () => { throw new Error('findFileByPath error'); },
        getEditorContext: () => createMockEditorContext('memory'),
        readWorkspaceFile: async () => expectedResult
      });

      const result = await tool.execute({ path: 'error.md' });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.content).toBe('disk');
      }
    });

    it('skips memory read when workspaceRoot is null and path is relative', async () => {
      let filesystemCalled = false;
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => null,
        findFileByPath: async () => ({ id: 'file-5' }),
        getEditorContext: () => createMockEditorContext('memory'),
        confirm: {
          confirm: async () => true
        },
        readWorkspaceFile: async () => {
          filesystemCalled = true;
          return { path: '/abs/readme.md', content: 'disk', totalLines: 1, readLines: 1, hasMore: false, nextOffset: null };
        }
      });

      const result = await tool.execute({ path: 'src/readme.md' });

      expect(filesystemCalled).toBe(true);
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.content).toBe('disk');
      }
    });

    it('reads from memory for absolute path without workspaceRoot', async () => {
      let filesystemCalled = false;
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => null,
        findFileByPath: async () => ({ id: 'file-6' }),
        getEditorContext: () => createMockEditorContext('memory content'),
        confirm: {
          confirm: async () => true
        },
        readWorkspaceFile: async () => {
          filesystemCalled = true;
          return { path: '', content: '', totalLines: 0, readLines: 0, hasMore: false, nextOffset: null };
        }
      });

      const result = await tool.execute({ path: '/abs/readme.md' });

      expect(result.status).toBe('success');
      expect(filesystemCalled).toBe(false);
      if (result.status === 'success') {
        expect(result.data.content).toBe('memory content');
      }
    });

    it('behavior unchanged when findFileByPath is not injected', async () => {
      let filesystemCalled = false;
      const tool = createBuiltinReadFileTool({
        getWorkspaceRoot: () => '/workspace',
        readWorkspaceFile: async () => {
          filesystemCalled = true;
          return { path: '/workspace/test.md', content: 'disk', totalLines: 1, readLines: 1, hasMore: false, nextOffset: null };
        }
      });

      const result = await tool.execute({ path: 'test.md' });

      expect(filesystemCalled).toBe(true);
      expect(result.status).toBe('success');
    });
  });
```

- [ ] **Step 2: 运行测试，确认全部失败（功能尚未实现）**

```bash
pnpm vitest run test/ai/tools/builtin-read-file.test.ts
```

Expected: 新增的 10 个 'memory-first read' 测试全部 FAIL，现有 8 个测试 PASS。

- [ ] **Step 3: Commit**

```bash
git add test/ai/tools/builtin-read-file.test.ts
git commit -m "test: add memory-first read test cases for read_file tool"
```

---

### Task 3: 实现 findFileByPath / getEditorContext 注入和内存优先读取逻辑

**Files:**
- Modify: `src/ai/tools/builtin/FileReadTool/index.ts`

**Purpose:** 在 `execute` 方法中加入内存优先读取路径，文件在编辑器打开时跳过确认和文件系统读取。

- [ ] **Step 1: 在 `CreateBuiltinReadFileToolOptions` 接口中添加新选项**

定位到 `CreateBuiltinReadFileToolOptions` 接口定义（当前约在第 62-73 行，在 `isFileInRecent` 之后添加）：

```typescript
  /**
   * 通过文件路径查询文件记录，用于获取文件 ID。
   * 内部封装 filesStore.getFileByPath。
   * @param filePath - 文件绝对路径
   * @returns 文件记录（含 id），未找到时返回 null
   */
  findFileByPath?: (filePath: string) => Promise<{ id: string } | null>;
  /**
   * 通过文件 ID 获取编辑器上下文，用于读取内存中的最新内容。
   * 内部封装 editorToolContextRegistry.getContext。
   * @param documentId - 文件 ID
   * @returns 编辑器上下文，文件未打开时返回 undefined
   */
  getEditorContext?: (documentId: string) => AIToolContext | undefined;
```

注意：`AIToolContext` 类型已在 `types/ai.d.ts` 中全局定义，无需额外 import（但文件顶部已有 `import type { AIToolExecutionError, AIToolExecutor } from 'types/ai'`，需确认 `AIToolContext` 是否包含在其中。如不在，需补充 import）。

- [ ] **Step 2: 在 `execute` 方法中插入内存优先读取逻辑**

定位到 `execute` 方法中 unsaved 路径处理代码块之后、workspaceRoot 检查之前。在 `if (!filePath) { return ... }` 之后的 unsaved 检查结束以后，添加内存优先读取代码块：

```typescript
      // 尝试从编辑器内存中获取已打开文件的最新内容（含未保存修改）。
      if (options.findFileByPath && options.getEditorContext) {
        try {
          // 解析路径：相对路径需拼接 workspaceRoot
          let resolvedPath = filePath;
          if (!isAbsoluteFilePath(filePath)) {
            const workspaceRoot = options.getWorkspaceRoot?.();
            if (workspaceRoot) {
              resolvedPath = `${workspaceRoot.replace(/\/$/, '')}/${filePath.replace(/^\//, '')}`;
            } else {
              // 无 workspaceRoot 时无法解析相对路径，跳过内存读取
              resolvedPath = '';
            }
          }

          if (resolvedPath) {
            const file = await options.findFileByPath(resolvedPath);
            if (file) {
              const context = options.getEditorContext(file.id);
              if (context) {
                try {
                  const content = context.document.getContent();
                  const range = normalizeReadRange(input);
                  const result = buildReadFileResult(filePath, content, range.offset, range.limit);
                  return createToolSuccessResult(READ_FILE_TOOL_NAME, result);
                } catch {
                  // getContent() 异常，静默降级到文件系统读取
                }
              }
            }
          }
        } catch {
          // 注入函数异常，静默降级到文件系统读取
        }
      }
```

注意：此代码块插入位置——在 unsaved 路径处理代码块关闭 `}` 之后、`const workspaceRoot = options.getWorkspaceRoot?.() ?? null;` 之前。

- [ ] **Step 3: 确认 `AIToolContext` 类型导入**

在 `FileReadTool/index.ts` 顶部的 import 区域检查是否已导入 `AIToolContext`。查看文件顶部：

```typescript
import type { AIToolConfirmationAdapter, AIToolConfirmationRequest } from '../../confirmation';
import type { AIToolExecutionError, AIToolExecutor } from 'types/ai';
```

`AIToolContext` 在 `types/ai.d.ts` 中定义。需确认是单独导出还是通过 `AIToolExecutor` 间接可用。如未导入，添加：

```typescript
import type { AIToolContext, AIToolExecutionError, AIToolExecutor } from 'types/ai';
```

- [ ] **Step 4: 运行测试**

```bash
pnpm vitest run test/ai/tools/builtin-read-file.test.ts
```

Expected: 全部 18 个测试 PASS（8 个原有 + 10 个新增）。

- [ ] **Step 5: Commit**

```bash
git add src/ai/tools/builtin/FileReadTool/index.ts
git commit -m "feat: add memory-first read to read_file tool via findFileByPath/getEditorContext injection"
```

---

### Task 4: 更新 builtin/index.ts 透传新选项

**Files:**
- Modify: `src/ai/tools/builtin/index.ts`

**Purpose:** 在 `CreateBuiltinToolsOptions` 和 `createBuiltinTools` 中透传 `findFileByPath` 和 `getEditorContext`。

- [ ] **Step 1: 在 `CreateBuiltinToolsOptions` 接口中添加两个可选字段**

定位到 `CreateBuiltinToolsOptions` 接口（第 89-100 行），在 `isFileInRecent` 之后添加：

```typescript
  /**
   * 通过文件路径查询文件记录，用于获取文件 ID。
   * 内部封装 filesStore.getFileByPath。
   */
  findFileByPath?: (filePath: string) => Promise<{ id: string } | null>;
  /**
   * 通过文件 ID 获取编辑器上下文，用于读取内存中的最新内容。
   * 内部封装 editorToolContextRegistry.getContext。
   */
  getEditorContext?: (documentId: string) => AIToolContext | undefined;
```

注意：需确认 `AIToolContext` 类型在 builtin/index.ts 中是否可用。查看第 6 行 import：`import type { AIToolExecutor } from 'types/ai';`，需添加 `AIToolContext`：

```typescript
import type { AIToolContext, AIToolExecutor } from 'types/ai';
```

- [ ] **Step 2: 在 `createBuiltinTools` 中透传选项到 `createBuiltinReadFileTool`**

定位到 `createBuiltinReadFileTool` 调用处（第 122-126 行）：

```typescript
    createBuiltinReadFileTool({
      confirm: options.confirm,
      getWorkspaceRoot: options.getWorkspaceRoot,
      isFileInRecent: options.isFileInRecent
    }),
```

修改为：

```typescript
    createBuiltinReadFileTool({
      confirm: options.confirm,
      getWorkspaceRoot: options.getWorkspaceRoot,
      isFileInRecent: options.isFileInRecent,
      findFileByPath: options.findFileByPath,
      getEditorContext: options.getEditorContext
    }),
```

- [ ] **Step 3: 运行 builtin-index 测试确认无回归**

```bash
pnpm vitest run test/ai/tools/builtin-index.test.ts
```

Expected: 全部 4 个测试 PASS。

- [ ] **Step 4: Commit**

```bash
git add src/ai/tools/builtin/index.ts
git commit -m "feat: pass findFileByPath/getEditorContext through createBuiltinTools"
```

---

### Task 5: 在 BChatSidebar 中注入依赖

**Files:**
- Modify: `src/components/BChatSidebar/index.vue`

**Purpose:** 在工具创建时注入 `findFileByPath` 和 `getEditorContext` 的实际实现。

- [ ] **Step 1: 在 `createBuiltinTools` 调用中添加 `findFileByPath` 和 `getEditorContext`**

定位到第 302-319 行的 `createBuiltinTools` 调用：

```typescript
const tools = createBuiltinTools({
  confirm: confirmationController.createAdapter(),
  isFileInRecent: (filePath: string) => {
    return Boolean(filesStore.recentFiles?.some((file) => file.path === filePath));
  },
  getPendingQuestion: () => {
    const pendingQuestion = userChoice.findPending(messages.value);
    if (!pendingQuestion) return null;

    return {
      questionId: pendingQuestion.questionId,
      toolCallId: pendingQuestion.toolCallId
    };
  }
}).filter((tool) => {
  return getDefaultChatToolNames().includes(tool.definition.name);
});
```

修改为：

```typescript
const tools = createBuiltinTools({
  confirm: confirmationController.createAdapter(),
  isFileInRecent: (filePath: string) => {
    return Boolean(filesStore.recentFiles?.some((file) => file.path === filePath));
  },
  /**
   * 通过文件绝对路径查找文件 ID。
   * 封装 filesStore.getFileByPath。
   */
  findFileByPath: async (filePath: string) => {
    const file = await filesStore.getFileByPath(filePath);
    return file ? { id: file.id } : null;
  },
  /**
   * 通过文件 ID 获取编辑器上下文。
   * 封装 editorToolContextRegistry.getContext。
   */
  getEditorContext: (documentId: string) => {
    return editorToolContextRegistry.getContext(documentId);
  },
  getPendingQuestion: () => {
    const pendingQuestion = userChoice.findPending(messages.value);
    if (!pendingQuestion) return null;

    return {
      questionId: pendingQuestion.questionId,
      toolCallId: pendingQuestion.toolCallId
    };
  }
}).filter((tool) => {
  return getDefaultChatToolNames().includes(tool.definition.name);
});
```

- [ ] **Step 2: 运行 TypeScript 类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 无类型错误。

- [ ] **Step 3: 运行 ESLint**

```bash
pnpm lint
```

Expected: 无 lint 错误。

- [ ] **Step 4: Commit**

```bash
git add src/components/BChatSidebar/index.vue
git commit -m "feat: inject findFileByPath/getEditorContext into read_file tool"
```

---

### 验证清单

- [ ] `pnpm vitest run test/ai/tools/builtin-read-file.test.ts` — 18 tests PASS
- [ ] `pnpm vitest run test/ai/tools/builtin-index.test.ts` — 4 tests PASS
- [ ] `pnpm tsc --noEmit` — 无类型错误
- [ ] `pnpm lint` — 无 lint 错误
- [ ] 手动验证：打开文件 → 在编辑器中修改但不保存 → 让 AI 调用 `read_file` 读取该文件 → 确认返回的是最新内存内容而非磁盘旧版本
