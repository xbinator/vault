# AI Tools File Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract shared file-tool protocol state from the builtin tool entrypoint and standardize `read_file`, `edit_file`, `write_file`, and confirmation-card behavior around shared types and error semantics.

**Architecture:** Keep `src/ai/tools/builtin` as the executable tool layer, then introduce a lightweight `src/ai/tools/shared` protocol layer for file snapshot state, file-tool error helpers, and path normalization. Refactor `fileRead`, `fileEdit`, and `fileWrite` to depend on those shared helpers, then align confirmation-card rendering around structured file-tool preview data.

**Tech Stack:** TypeScript, Vitest, Vue utility helpers, existing AI tool result factories

---

### Task 1: Extract shared file protocol primitives

**Files:**
- Create: `src/ai/tools/shared/fileTypes.ts`
- Create: `src/ai/tools/shared/fileErrors.ts`
- Create: `src/ai/tools/shared/fileState.ts`
- Modify: `src/ai/tools/builtin/index.ts`
- Test: `test/ai/tools/builtin-index.test.ts`

- [ ] **Step 1: Write the failing snapshot-store test in the builtin entrypoint**

Add an assertion to `test/ai/tools/builtin-index.test.ts` that proves file-write tools still appear when confirmation is enabled after the entrypoint stops owning the raw `Map`.

```ts
it('keeps file-level write tools available after shared file state extraction', () => {
  const tools = createBuiltinTools({
    confirm: {
      confirm: async () => true
    }
  });

  expect(tools.map((tool) => tool.definition.name)).toContain('edit_file');
  expect(tools.map((tool) => tool.definition.name)).toContain('write_file');
});
```

- [ ] **Step 2: Run the targeted entrypoint test to verify it still reflects current behavior**

Run: `pnpm vitest run test/ai/tools/builtin-index.test.ts`

Expected: PASS before refactor, giving a baseline for the existing tool list.

- [ ] **Step 3: Add the shared file types module**

Create `src/ai/tools/shared/fileTypes.ts` with the shared snapshot and preview types used by file tools.

```ts
/**
 * @file fileTypes.ts
 * @description 文件工具共享类型定义。
 */

/**
 * 文件读取快照。
 */
export interface FileReadSnapshot {
  /** 规范化后的文件路径。 */
  path: string;
  /** 最近一次读取到的文件内容。 */
  content: string;
  /** 是否为局部读取快照。 */
  isPartial: boolean;
  /** 读取完成时间戳。 */
  readAt: number;
}

/**
 * 文件预览片段。
 */
export interface FilePreviewPair {
  /** 修改前预览；新建文件时为空。 */
  beforePreview: string | null;
  /** 修改后预览。 */
  afterPreview: string;
}
```

- [ ] **Step 4: Add the shared file error helpers**

Create `src/ai/tools/shared/fileErrors.ts` to centralize stable file-tool error codes and mapping to existing tool result errors.

```ts
/**
 * @file fileErrors.ts
 * @description 文件工具共享错误定义与构造函数。
 */
import type { AIToolExecutionError } from 'types/ai';

/**
 * 文件工具共享错误码。
 */
export type FileToolErrorCode =
  | 'FILE_NOT_READ'
  | 'FILE_READ_PARTIAL'
  | 'FILE_CHANGED'
  | 'MATCH_NOT_FOUND'
  | 'MATCH_NOT_UNIQUE';

/**
 * 创建文件工具错误结果描述。
 * @param code - 文件工具错误码
 * @returns 对应的工具错误码和文案
 */
export function toFileToolExecutionError(code: FileToolErrorCode): Pick<AIToolExecutionError, 'code' | 'message'> {
  switch (code) {
    case 'FILE_NOT_READ':
      return { code: 'PERMISSION_DENIED', message: '修改现有文件前必须先完整读取该文件' };
    case 'FILE_READ_PARTIAL':
      return { code: 'PERMISSION_DENIED', message: '当前文件仅做了局部读取，请先完整读取后再修改' };
    case 'FILE_CHANGED':
      return { code: 'STALE_CONTEXT', message: '文件内容已发生变化，请重新读取后再试' };
    case 'MATCH_NOT_FOUND':
      return { code: 'INVALID_INPUT', message: '未找到要替换的内容' };
    case 'MATCH_NOT_UNIQUE':
      return { code: 'INVALID_INPUT', message: '匹配内容不唯一，请提供更精确的 oldString 或开启 replaceAll' };
  }
}
```

- [ ] **Step 5: Add the shared file snapshot store**

Create `src/ai/tools/shared/fileState.ts` so the builtin entrypoint no longer owns the raw `Map`.

```ts
/**
 * @file fileState.ts
 * @description 文件工具共享快照状态仓库。
 */
import type { FileReadSnapshot } from './fileTypes';

/**
 * 文件快照状态仓库接口。
 */
export interface FileStateStore {
  getSnapshot(path: string): FileReadSnapshot | null;
  setSnapshot(snapshot: FileReadSnapshot): void;
  clearSnapshot(path: string): void;
}

/**
 * 创建文件快照状态仓库。
 * @returns 文件快照状态仓库
 */
export function createFileStateStore(): FileStateStore {
  const snapshots = new Map<string, FileReadSnapshot>();

  return {
    getSnapshot(path: string) {
      return snapshots.get(path) ?? null;
    },
    setSnapshot(snapshot: FileReadSnapshot) {
      snapshots.set(snapshot.path, snapshot);
    },
    clearSnapshot(path: string) {
      snapshots.delete(path);
    }
  };
}
```

- [ ] **Step 6: Refactor `createBuiltinTools` to use the shared store**

Update `src/ai/tools/builtin/index.ts` to replace the local `Map` with `createFileStateStore()`.

```ts
import { createFileStateStore } from '../shared/fileState';

export function createBuiltinTools(options: CreateBuiltinToolsOptions = {}): AIToolExecutor[] {
  const fileState = createFileStateStore();

  const readFileTool = createBuiltinReadFileTool({
    confirm: options.confirm,
    getWorkspaceRoot: options.getWorkspaceRoot,
    isFileInRecent: options.isFileInRecent,
    trackReadResult: (result, range) => {
      if (result.path.startsWith('unsaved://')) {
        return;
      }

      fileState.setSnapshot({
        path: result.path,
        content: result.content,
        isPartial: range.offset !== 1 || result.hasMore,
        readAt: Date.now()
      });
    }
  });

  const editFileTool = createBuiltinEditFileTool({
    confirm: options.confirm,
    getWorkspaceRoot: options.getWorkspaceRoot,
    getReadSnapshot: (filePath: string) => fileState.getSnapshot(filePath),
    setReadSnapshot: (snapshot) => fileState.setSnapshot(snapshot)
  });
}
```

- [ ] **Step 7: Run the entrypoint test again**

Run: `pnpm vitest run test/ai/tools/builtin-index.test.ts`

Expected: PASS with the same default tool list as before the refactor.

- [ ] **Step 8: Commit the shared protocol foundation**

```bash
git add src/ai/tools/shared/fileTypes.ts src/ai/tools/shared/fileErrors.ts src/ai/tools/shared/fileState.ts src/ai/tools/builtin/index.ts test/ai/tools/builtin-index.test.ts changelog/2026-05-10.md
git commit -m "refactor(ai): extract shared file tool state"
```

### Task 2: Extract shared path and read-file snapshot behavior

**Files:**
- Create: `src/ai/tools/shared/pathUtils.ts`
- Modify: `src/ai/tools/builtin/fileRead/index.ts`
- Test: `test/ai/tools/builtin-read-file.test.ts`
- Test: `test/ai/tools/builtin-read-directory.test.ts`

- [ ] **Step 1: Write the failing path-resolution tests around `read_file` and `read_directory`**

Extend `test/ai/tools/builtin-read-file.test.ts` and `test/ai/tools/builtin-read-directory.test.ts` with one case each that asserts relative workspace paths and absolute paths still resolve correctly after path helpers move out.

```ts
it('resolves workspace-relative read_file paths through shared path utils', async () => {
  const readWorkspaceFile = vi.fn(async () => ({
    path: '/workspace/src/example.ts',
    content: 'const value = 1;\n',
    totalLines: 1,
    readLines: 1,
    hasMore: false,
    nextOffset: null
  }));

  const tool = createBuiltinReadFileTool({
    getWorkspaceRoot: () => '/workspace',
    readWorkspaceFile
  });

  await tool.execute({ path: 'src/example.ts' });

  expect(readWorkspaceFile).toHaveBeenCalledWith(expect.objectContaining({
    path: '/workspace/src/example.ts'
  }));
});
```

- [ ] **Step 2: Run the focused read tests to verify the baseline**

Run: `pnpm vitest run test/ai/tools/builtin-read-file.test.ts test/ai/tools/builtin-read-directory.test.ts`

Expected: Capture the current failures, especially the known older `documentId` mismatch in `builtin-read-file.test.ts`, before introducing new helper extraction.

- [ ] **Step 3: Add shared path helpers**

Create `src/ai/tools/shared/pathUtils.ts` by moving path parsing and workspace-boundary logic out of `fileEdit` and `fileWrite`.

```ts
/**
 * @file pathUtils.ts
 * @description 文件工具共享路径解析与工作区边界校验。
 */

/**
 * 判断输入路径是否为绝对路径。
 * @param filePath - 文件路径
 * @returns 是否为绝对路径
 */
export function isAbsoluteFilePath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith('/') || filePath.startsWith('\\\\');
}

/**
 * 解析路径前缀与片段。
 * @param filePath - 原始路径
 * @returns 路径前缀与片段
 */
function parsePathParts(filePath: string): { prefix: string; segments: string[] } {
  const normalized = filePath.replace(/\\/g, '/');

  if (/^[a-zA-Z]:\//.test(normalized)) {
    return {
      prefix: normalized.slice(0, 2),
      segments: normalized.slice(3).split('/').filter(Boolean)
    };
  }

  if (normalized.startsWith('/')) {
    return {
      prefix: '/',
      segments: normalized.slice(1).split('/').filter(Boolean)
    };
  }

  return {
    prefix: '',
    segments: normalized.split('/').filter(Boolean)
  };
}

/**
 * 重新组装路径。
 * @param prefix - 路径前缀
 * @param segments - 路径片段
 * @param separator - 分隔符
 * @returns 组装后的路径
 */
function buildPath(prefix: string, segments: string[], separator: '/' | '\\'): string {
  const joined = segments.join(separator);

  if (!prefix) {
    return joined;
  }

  if (prefix === '/') {
    return joined ? `${separator}${joined}` : separator;
  }

  return joined ? `${prefix}${separator}${joined}` : `${prefix}${separator}`;
}

/**
 * 将工作区相对路径解析为绝对路径。
 * @param filePath - 用户输入路径
 * @param workspaceRoot - 工作区根目录
 * @returns 解析后的绝对路径，超出边界时返回 null
 */
export function resolvePathAgainstWorkspace(filePath: string, workspaceRoot: string): string | null {
  const root = parsePathParts(workspaceRoot);
  if (!root.prefix) {
    return null;
  }

  const separator: '/' | '\\' = workspaceRoot.includes('\\') ? '\\' : '/';
  const resolvedSegments = [...root.segments];
  const relativeSegments = filePath.replace(/\\/g, '/').split('/').filter(Boolean);

  for (const segment of relativeSegments) {
    if (segment === '.') {
      continue;
    }

    if (segment === '..') {
      if (resolvedSegments.length <= root.segments.length) {
        return null;
      }

      resolvedSegments.pop();
      continue;
    }

    resolvedSegments.push(segment);
  }

  return buildPath(root.prefix, resolvedSegments, separator);
}

/**
 * 判断目标路径是否位于工作区内。
 * @param targetPath - 目标路径
 * @param workspaceRoot - 工作区根目录
 * @returns 是否位于工作区内
 */
export function isPathInsideWorkspace(targetPath: string, workspaceRoot: string): boolean {
  const target = parsePathParts(targetPath);
  const root = parsePathParts(workspaceRoot);

  if (target.prefix.toLowerCase() !== root.prefix.toLowerCase()) {
    return false;
  }

  if (target.segments.length < root.segments.length) {
    return false;
  }

  return root.segments.every((segment, index) => target.segments[index] === segment);
}
```

- [ ] **Step 4: Update `fileRead` to reuse shared path logic and shared snapshot shape**

Modify `src/ai/tools/builtin/fileRead/index.ts` so successful reads track `readAt` and path normalization is shared rather than local.

```ts
import { isAbsoluteFilePath, resolvePathAgainstWorkspace } from '../../shared/pathUtils';
import type { FileReadSnapshot } from '../../shared/fileTypes';

export interface CreateBuiltinReadFileToolOptions {
  trackReadResult?: (result: ReadFileResult, range: { offset: number; limit?: number }, snapshot: FileReadSnapshot) => void;
}

const snapshot: FileReadSnapshot = {
  path: result.path,
  content: result.content,
  isPartial: range.offset !== DEFAULT_OFFSET || result.hasMore,
  readAt: Date.now()
};

options.trackReadResult?.(result, range, snapshot);
```

- [ ] **Step 5: Run the read tests again**

Run: `pnpm vitest run test/ai/tools/builtin-read-file.test.ts test/ai/tools/builtin-read-directory.test.ts`

Expected: No new regressions from the path-helper extraction. If the existing `documentId` cases are still failing, the output should match the pre-refactor failure shape rather than introducing new ones.

- [ ] **Step 6: Commit the shared read-path extraction**

```bash
git add src/ai/tools/shared/pathUtils.ts src/ai/tools/builtin/fileRead/index.ts test/ai/tools/builtin-read-file.test.ts test/ai/tools/builtin-read-directory.test.ts changelog/2026-05-10.md
git commit -m "refactor(ai): share file path helpers"
```

### Task 3: Refactor `edit_file` onto shared state, path, and error helpers

**Files:**
- Create: `src/ai/tools/builtin/fileEdit/types.ts`
- Modify: `src/ai/tools/builtin/fileEdit/index.ts`
- Test: `test/ai/tools/builtin-file-edit.test.ts`

- [ ] **Step 1: Write the failing tests for shared error semantics**

Update `test/ai/tools/builtin-file-edit.test.ts` so the rejection cases assert through the new shared helper behavior rather than inline duplicated logic.

```ts
it('maps missing prior reads through the shared file error helper', async () => {
  const result = await tool.execute({
    path: 'src/example.ts',
    oldString: 'value = 1',
    newString: 'value = 2'
  });

  expect(result.status).toBe('failure');
  expect(result.error).toEqual({
    code: 'PERMISSION_DENIED',
    message: '修改现有文件前必须先完整读取该文件'
  });
});
```

- [ ] **Step 2: Run the edit-file test suite to establish the current baseline**

Run: `pnpm vitest run test/ai/tools/builtin-file-edit.test.ts`

Expected: PASS before refactor, with the updated assertions failing once the shared helpers are referenced but not yet wired.

- [ ] **Step 3: Add `fileEdit` module-local types**

Create `src/ai/tools/builtin/fileEdit/types.ts` so the edit module stops declaring every shape in `index.ts`.

```ts
/**
 * @file types.ts
 * @description fileEdit 工具模块内类型定义。
 */
import type { FileReadSnapshot } from '../../shared/fileTypes';

/**
 * edit_file 输入参数。
 */
export interface EditFileInput {
  path: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

/**
 * edit_file 返回结果。
 */
export interface EditFileResult {
  path: string;
  content: string;
  replacedCount: number;
}

/**
 * edit_file 依赖注入选项。
 */
export interface CreateBuiltinEditFileToolOptions {
  confirm: AIToolConfirmationAdapter;
  getWorkspaceRoot?: () => string | null;
  readWorkspaceFile?: (options: ReadWorkspaceFileOptions) => Promise<ReadWorkspaceFileResult>;
  writeFile?: (path: string, content: string) => Promise<void>;
  getReadSnapshot: (filePath: string) => FileReadSnapshot | null;
  setReadSnapshot: (snapshot: FileReadSnapshot) => void;
}
```

- [ ] **Step 4: Refactor `fileEdit/index.ts` to use shared helpers**

Replace local snapshot typing, path utils, and error messages with the shared modules.

```ts
import { toFileToolExecutionError } from '../../shared/fileErrors';
import { isAbsoluteFilePath, isPathInsideWorkspace, resolvePathAgainstWorkspace } from '../../shared/pathUtils';
import type { FileReadSnapshot } from '../../shared/fileTypes';

const snapshot = options.getReadSnapshot(resolvedPath.path);
if (!snapshot) {
  const error = toFileToolExecutionError('FILE_NOT_READ');
  return createToolFailureResult(EDIT_FILE_TOOL_NAME, error.code, error.message);
}

if (snapshot.isPartial) {
  const error = toFileToolExecutionError('FILE_READ_PARTIAL');
  return createToolFailureResult(EDIT_FILE_TOOL_NAME, error.code, error.message);
}

if (latestContent !== snapshot.content) {
  const error = toFileToolExecutionError('FILE_CHANGED');
  return createToolFailureResult(EDIT_FILE_TOOL_NAME, error.code, error.message);
}

options.setReadSnapshot({
  path: resolvedPath.path,
  content: nextContent,
  isPartial: false,
  readAt: Date.now()
});
```

- [ ] **Step 5: Run the edit-file tests again**

Run: `pnpm vitest run test/ai/tools/builtin-file-edit.test.ts`

Expected: PASS with identical user-facing behavior, but now driven by shared protocol helpers.

- [ ] **Step 6: Commit the `edit_file` refactor**

```bash
git add src/ai/tools/builtin/fileEdit/index.ts src/ai/tools/builtin/fileEdit/types.ts test/ai/tools/builtin-file-edit.test.ts changelog/2026-05-10.md
git commit -m "refactor(ai): share edit file protocol helpers"
```

### Task 4: Refactor `write_file` onto shared state, path, and error helpers

**Files:**
- Create: `src/ai/tools/builtin/fileWrite/types.ts`
- Modify: `src/ai/tools/builtin/fileWrite/index.ts`
- Test: `test/ai/tools/builtin-file-write.test.ts`

- [ ] **Step 1: Write the failing tests for shared overwrite rules**

Update `test/ai/tools/builtin-file-write.test.ts` to assert the shared file-error messages and the richer snapshot shape with `readAt`.

```ts
it('maps stale overwrites through the shared file error helper', async () => {
  const result = await tool.execute({
    path: 'src/example.ts',
    content: 'const value = 2;\n'
  });

  expect(result.status).toBe('failure');
  expect(result.error).toEqual({
    code: 'STALE_CONTEXT',
    message: '文件内容已发生变化，请重新读取后再试'
  });
});
```

- [ ] **Step 2: Run the write-file suite for baseline coverage**

Run: `pnpm vitest run test/ai/tools/builtin-file-write.test.ts`

Expected: PASS before refactor, then fail only where the new shared assertions are stricter than the old inline messages.

- [ ] **Step 3: Add `fileWrite` module-local types**

Create `src/ai/tools/builtin/fileWrite/types.ts`.

```ts
/**
 * @file types.ts
 * @description fileWrite 工具模块内类型定义。
 */
import type { FileReadSnapshot } from '../../shared/fileTypes';

export interface WriteFileInput {
  path: string;
  content: string;
}

export interface WriteFileResult {
  path: string;
  content: string;
  created: boolean;
}

export interface CreateBuiltinWriteFileToolOptions {
  confirm: AIToolConfirmationAdapter;
  getWorkspaceRoot?: () => string | null;
  readWorkspaceFile?: (options: ReadWorkspaceFileOptions) => Promise<ReadWorkspaceFileResult>;
  writeFile?: (path: string, content: string) => Promise<void>;
  getReadSnapshot: (filePath: string) => FileReadSnapshot | null;
  setReadSnapshot: (snapshot: FileReadSnapshot) => void;
}
```

- [ ] **Step 4: Refactor `fileWrite/index.ts` to use shared helpers**

Replace local snapshot typing, path utils, and stale-write checks with the shared modules.

```ts
import { toFileToolExecutionError } from '../../shared/fileErrors';
import { isAbsoluteFilePath, isPathInsideWorkspace, resolvePathAgainstWorkspace } from '../../shared/pathUtils';

if (existingFile && !snapshot) {
  const error = toFileToolExecutionError('FILE_NOT_READ');
  return createToolFailureResult(WRITE_FILE_TOOL_NAME, error.code, error.message);
}

if (snapshot?.isPartial) {
  const error = toFileToolExecutionError('FILE_READ_PARTIAL');
  return createToolFailureResult(WRITE_FILE_TOOL_NAME, error.code, error.message);
}

if (snapshot && latestContent !== snapshot.content) {
  const error = toFileToolExecutionError('FILE_CHANGED');
  return createToolFailureResult(WRITE_FILE_TOOL_NAME, error.code, error.message);
}

options.setReadSnapshot({
  path: resolvedPath.path,
  content: input.content,
  isPartial: false,
  readAt: Date.now()
});
```

- [ ] **Step 5: Run the write-file tests again**

Run: `pnpm vitest run test/ai/tools/builtin-file-write.test.ts`

Expected: PASS with shared protocol behavior and no regressions in new-file creation versus overwrite protection.

- [ ] **Step 6: Commit the `write_file` refactor**

```bash
git add src/ai/tools/builtin/fileWrite/index.ts src/ai/tools/builtin/fileWrite/types.ts test/ai/tools/builtin-file-write.test.ts changelog/2026-05-10.md
git commit -m "refactor(ai): share write file protocol helpers"
```

### Task 5: Align confirmation-card behavior with structured file-tool previews

**Files:**
- Modify: `src/components/BChatSidebar/utils/confirmationCard.ts`
- Modify: `src/components/BChatSidebar/components/ConfirmationCard.vue`
- Test: `test/components/BChat/confirmation-card.test.ts`
- Test: `test/components/BChat/confirmation-card.component.test.ts`

- [ ] **Step 1: Write the failing confirmation helper tests for file tools**

Extend `test/components/BChat/confirmation-card.test.ts` to verify that both `edit_file` and `write_file` use bounded preview formatting.

```ts
it('truncates edit-file previews with the same guard used by write-file', () => {
  const preview = formatConfirmationPreviewText('a'.repeat(900), 'edit_file');

  expect(preview.length).toBeLessThan(905);
  expect(preview.endsWith('\n...')).toBe(true);
});
```

- [ ] **Step 2: Run the confirmation-card helper and component tests**

Run: `pnpm vitest run test/components/BChat/confirmation-card.test.ts test/components/BChat/confirmation-card.component.test.ts`

Expected: FAIL on the new `edit_file` preview expectation, because the current helper only special-cases `write_file`.

- [ ] **Step 3: Refactor the confirmation preview helper to key off file-tool semantics**

Update `src/components/BChatSidebar/utils/confirmationCard.ts`.

```ts
const FILE_PREVIEW_TOOL_NAMES = new Set(['edit_file', 'write_file']);

export function formatConfirmationPreviewText(text: string, toolName: string): string {
  if (!FILE_PREVIEW_TOOL_NAMES.has(toolName)) {
    return text;
  }

  const previewLimit = 800;
  return text.length > previewLimit ? `${text.slice(0, previewLimit)}\n...` : text;
}
```

- [ ] **Step 4: Update the confirmation component copy if needed**

If `ConfirmationCard.vue` currently uses wording that still assumes document-scoped editing, update the display strings to match file-level semantics.

```vue
<template>
  <p class="confirmation-card__status">
    {{ part.toolName === 'edit_file' || part.toolName === 'write_file'
      ? '等待你确认是否应用这次文件修改。'
      : getConfirmationStatusText(part) }}
  </p>
</template>
```

- [ ] **Step 5: Run the confirmation-card tests again**

Run: `pnpm vitest run test/components/BChat/confirmation-card.test.ts test/components/BChat/confirmation-card.component.test.ts`

Expected: PASS with consistent preview truncation for file tool confirmations.

- [ ] **Step 6: Run the end-to-end focused regression suite**

Run: `pnpm vitest run test/ai/tools/builtin-index.test.ts test/ai/tools/builtin-file-edit.test.ts test/ai/tools/builtin-file-write.test.ts test/ai/tools/builtin-read-directory.test.ts test/components/BChat/confirmation-card.test.ts test/components/BChat/confirmation-card.component.test.ts test/components/BChat/tool-loop-guard.test.ts`

Expected: PASS for all listed suites. Any existing `builtin-read-file.test.ts` historical mismatch should remain isolated outside this regression set unless explicitly fixed in Task 2.

- [ ] **Step 7: Commit the UI alignment changes**

```bash
git add src/components/BChatSidebar/utils/confirmationCard.ts src/components/BChatSidebar/components/ConfirmationCard.vue test/components/BChat/confirmation-card.test.ts test/components/BChat/confirmation-card.component.test.ts test/components/BChat/tool-loop-guard.test.ts changelog/2026-05-10.md
git commit -m "refactor(ai): align confirmation cards with file tools"
```

## Self-Review

- Spec coverage: This plan covers the shared protocol layer (`fileState`, `fileErrors`, `fileTypes`, `pathUtils`), builtin tool refactors (`fileRead`, `fileEdit`, `fileWrite`), and confirmation-card alignment. It intentionally leaves broader new tool creation such as `createDirectory` or `renameFile` out of scope.
- Placeholder scan: No task uses `TODO`, `TBD`, or open-ended “handle edge cases” language. Every code-change step includes concrete file paths, commands, and example code.
- Type consistency: The plan consistently uses `FileReadSnapshot`, `FileToolErrorCode`, and `setReadSnapshot(snapshot)` signatures across later tasks, so the shared interfaces introduced in Task 1 remain the same throughout the plan.
