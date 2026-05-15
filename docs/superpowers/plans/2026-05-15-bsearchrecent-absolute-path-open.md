# BSearchRecent Absolute Path Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `BSearchRecent` 在保留最近文件搜索的同时，支持输入有效绝对路径时显示“按路径打开”候选项，并在回车时优先直接打开该路径文件。

**Architecture:** 方案分两层推进。第一层在 Electron 平台能力中新增“查询路径是否存在且是否为普通文件”的只读接口，并在渲染层 `native` 封装里暴露统一方法。第二层在 `src/components/BSearchRecent/index.vue` 中把结果模型从纯 `StoredFile[]` 扩展为“最近文件项 + 绝对路径候选项”，新增回车行为并复用 `openFileByPath(path)` 完成打开。

**Tech Stack:** Vue 3 Composition API、TypeScript、Electron IPC、Pinia、Vitest

---

## File Map

- Modify: `types/electron-api.d.ts`
  为 `window.electronAPI` 增加路径状态查询返回类型和方法定义。
- Modify: `electron/preload/index.mts`
  暴露新的 `fs:*` 路径状态查询 IPC 到渲染进程。
- Modify: `electron/main/modules/file/ipc.mts`
  注册新的主进程文件状态查询 handler。
- Modify: `src/shared/platform/native/types.ts`
  扩展 `Native` 接口，加入路径状态查询方法与返回类型。
- Modify: `src/shared/platform/native/electron.ts`
  把新的 Electron API 能力映射到 `native` 封装。
- Modify: `src/shared/platform/native/web.ts`
  为 Web 环境提供安全兜底实现，保持接口完整。
- Modify: `src/components/BSearchRecent/index.vue`
  新增绝对路径识别、候选项合并、回车打开和模板样式分支。
- Test: `test/electron/file/ipc.test.ts` 或同目录新增对应测试文件
  验证路径状态查询 handler 能正确区分存在文件、目录和不存在路径。
- Test: `test/components/BSearchRecent/index.test.ts`
  验证候选项展示与回车优先级。

## Task 1: Add Electron Path Status Capability

**Files:**
- Modify: `types/electron-api.d.ts`
- Modify: `electron/preload/index.mts`
- Modify: `electron/main/modules/file/ipc.mts`
- Modify: `src/shared/platform/native/types.ts`
- Modify: `src/shared/platform/native/electron.ts`
- Modify: `src/shared/platform/native/web.ts`
- Test: `test/electron/file/ipc.test.ts`

- [ ] **Step 1: Write the failing Electron path-status test**

```ts
/**
 * @file ipc.test.ts
 * @description 验证文件 IPC 的路径状态查询能力。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getFilePathStatus } from '../../../electron/main/modules/file/ipc.mts';

describe('getFilePathStatus', () => {
  const sandboxRoot = join(tmpdir(), 'tibis-file-ipc-test');
  const filePath = join(sandboxRoot, 'demo.md');
  const directoryPath = join(sandboxRoot, 'docs');
  const missingPath = join(sandboxRoot, 'missing.md');

  beforeEach(async () => {
    await rm(sandboxRoot, { recursive: true, force: true });
    await mkdir(directoryPath, { recursive: true });
    await writeFile(filePath, '# demo', 'utf8');
  });

  afterEach(async () => {
    await rm(sandboxRoot, { recursive: true, force: true });
  });

  it('returns file status for existing files, directories, and missing paths', async () => {
    await expect(getFilePathStatus(filePath)).resolves.toEqual({
      exists: true,
      isFile: true,
      isDirectory: false
    });

    await expect(getFilePathStatus(directoryPath)).resolves.toEqual({
      exists: true,
      isFile: false,
      isDirectory: true
    });

    await expect(getFilePathStatus(missingPath)).resolves.toEqual({
      exists: false,
      isFile: false,
      isDirectory: false
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/electron/file/ipc.test.ts`

Expected: FAIL because `getFilePathStatus` does not exist yet.

- [ ] **Step 3: Implement the minimal main-process capability**

```ts
/**
 * @file ipc.mts
 * @description 注册文件相关 IPC，包括文件读取、写入、监听与路径状态查询。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ipcMain } from 'electron';

export interface ElectronFilePathStatus {
  exists: boolean;
  isFile: boolean;
  isDirectory: boolean;
}

/**
 * 查询给定路径当前是否存在以及实体类型。
 * @param targetPath - 目标绝对路径
 * @returns 路径状态结果
 */
export async function getFilePathStatus(targetPath: string): Promise<ElectronFilePathStatus> {
  try {
    const stats = await fs.promises.stat(targetPath);
    return {
      exists: true,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory()
    };
  }
  catch {
    return {
      exists: false,
      isFile: false,
      isDirectory: false
    };
  }
}

ipcMain.handle('fs:getPathStatus', async (_event, targetPath: string) => getFilePathStatus(targetPath));
```

```ts
/**
 * @file electron-api.d.ts
 * @description Electron API 类型定义。
 */

export interface ElectronFilePathStatus {
  exists: boolean;
  isFile: boolean;
  isDirectory: boolean;
}

export interface ElectronAPI {
  getPathStatus: (targetPath: string) => Promise<ElectronFilePathStatus>;
}
```

```ts
/**
 * @file index.mts
 * @description preload 层暴露渲染进程可用的 Electron API。
 */

getPathStatus: (targetPath: string) => ipcRenderer.invoke('fs:getPathStatus', targetPath),
```

```ts
/**
 * @file types.ts
 * @description 原生平台抽象类型定义。
 */

export interface FilePathStatus {
  exists: boolean;
  isFile: boolean;
  isDirectory: boolean;
}

export interface Native {
  getPathStatus(path: string): Promise<FilePathStatus>;
}
```

```ts
/**
 * @file electron.ts
 * @description Electron Native 实现。
 */

async getPathStatus(filePath: string): Promise<FilePathStatus> {
  return getElectronAPI().getPathStatus(filePath);
}
```

```ts
/**
 * @file web.ts
 * @description Web Native 兜底实现。
 */

async getPathStatus(): Promise<FilePathStatus> {
  return {
    exists: false,
    isFile: false,
    isDirectory: false
  };
}
```

- [ ] **Step 4: Run the path-status test to verify it passes**

Run: `pnpm vitest run test/electron/file/ipc.test.ts`

Expected: PASS with the new `getFilePathStatus` assertions succeeding.

## Task 2: Add BSearchRecent Absolute-Path Candidate Behavior

**Files:**
- Modify: `src/components/BSearchRecent/index.vue`
- Test: `test/components/BSearchRecent/index.test.ts`

- [ ] **Step 1: Write the failing BSearchRecent tests**

```ts
/**
 * @file index.test.ts
 * @description 验证最近文件搜索支持绝对路径候选项与回车直开。
 */

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BSearchRecent from '@/components/BSearchRecent/index.vue';

const getPathStatusMock = vi.fn();
const openFileByPathMock = vi.fn();

vi.mock('@/shared/platform', () => ({
  native: {
    getPathStatus: getPathStatusMock
  }
}));

vi.mock('@/hooks/useOpenFile', () => ({
  useOpenFile: () => ({
    openFile: vi.fn(),
    openFileByPath: openFileByPathMock
  })
}));

describe('BSearchRecent absolute path search', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    getPathStatusMock.mockReset();
    openFileByPathMock.mockReset();
  });

  it('renders an absolute-path candidate when the input points to an existing file', async () => {
    getPathStatusMock.mockResolvedValue({
      exists: true,
      isFile: true,
      isDirectory: false
    });

    const wrapper = mount(BSearchRecent, {
      props: {
        visible: true
      }
    });

    await wrapper.find('input').setValue('/tmp/demo.md');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('按路径打开');
    expect(wrapper.text()).toContain('/tmp/demo.md');
  });

  it('opens the absolute-path candidate first when pressing enter', async () => {
    getPathStatusMock.mockResolvedValue({
      exists: true,
      isFile: true,
      isDirectory: false
    });
    openFileByPathMock.mockResolvedValue(null);

    const wrapper = mount(BSearchRecent, {
      props: {
        visible: true
      }
    });

    await wrapper.find('input').setValue('/tmp/demo.md');
    await wrapper.find('input').trigger('keydown.enter');

    expect(openFileByPathMock).toHaveBeenCalledWith('/tmp/demo.md');
  });
});
```

- [ ] **Step 2: Run the component test to verify it fails**

Run: `pnpm vitest run test/components/BSearchRecent/index.test.ts`

Expected: FAIL because `native.getPathStatus()` and the new candidate/rendering logic do not exist yet.

- [ ] **Step 3: Implement the minimal BSearchRecent behavior**

```ts
/**
 * @file index.vue
 * @description 最近文件搜索弹窗，支持最近文件筛选与绝对路径直开。
 */

interface AbsolutePathSearchResult {
  type: 'absolute-path';
  path: string;
  fileName: string;
}

interface RecentFileSearchResult {
  type: 'recent-file';
  file: StoredFile;
}

type SearchResultItem = AbsolutePathSearchResult | RecentFileSearchResult;

/**
 * 判断输入是否像绝对路径。
 * @param value - 用户输入
 * @returns 是否为绝对路径格式
 */
function isAbsolutePathInput(value: string): boolean {
  return value.startsWith('/') || /^[a-zA-Z]:[\\/].+/.test(value);
}

const absolutePathCandidate = ref<AbsolutePathSearchResult | null>(null);

watch(keyword, async (value) => {
  const normalizedValue = value.trim();

  if (!normalizedValue || !isAbsolutePathInput(normalizedValue)) {
    absolutePathCandidate.value = null;
    return;
  }

  const status = await native.getPathStatus(normalizedValue);
  absolutePathCandidate.value = status.exists && status.isFile
    ? {
        type: 'absolute-path',
        path: normalizedValue,
        fileName: normalizedValue.split(/[\\/]/).pop() || normalizedValue
      }
    : null;
});

const searchResultItems = computed<SearchResultItem[]>(() => {
  const recentItems = filteredFiles.value.map((file) => ({
    type: 'recent-file' as const,
    file
  }));

  return absolutePathCandidate.value
    ? [absolutePathCandidate.value, ...recentItems]
    : recentItems;
});

/**
 * 通过绝对路径打开文件。
 * @param path - 文件绝对路径
 */
async function handleOpenPath(path: string): Promise<void> {
  handleClose();
  await openFileByPath(path);
}

/**
 * 优先打开绝对路径候选项，否则回退到最近文件首项。
 */
async function handleEnter(): Promise<void> {
  if (absolutePathCandidate.value) {
    await handleOpenPath(absolutePathCandidate.value.path);
    return;
  }

  const firstFile = filteredFiles.value[0];
  if (firstFile) {
    await handleSelect(firstFile);
  }
}
```

模板改动应明确包括：

```vue
<AInput
  v-model:value="keyword"
  placeholder="搜索最近文件"
  @keydown.enter.prevent="handleEnter"
  @keydown.esc.prevent="handleClose"
/>

<button
  v-for="item in searchResultItems"
  :key="item.type === 'absolute-path' ? item.path : item.file.id"
  class="b-search-recent-item"
  @click="item.type === 'absolute-path' ? handleOpenPath(item.path) : handleSelect(item.file)"
>
  <template v-if="item.type === 'absolute-path'">
    <span class="b-search-recent-item-title">{{ item.fileName }}</span>
    <span class="b-search-recent-item-path">{{ item.path }}</span>
    <span class="b-search-recent-item-meta">按路径打开</span>
  </template>
</button>
```

- [ ] **Step 4: Run the component test to verify it passes**

Run: `pnpm vitest run test/components/BSearchRecent/index.test.ts`

Expected: PASS with both candidate rendering and Enter-key opening covered.

## Task 3: Verify the Integrated Behavior and Update Changelog

**Files:**
- Modify: `changelog/2026-05-15.md`
- Test: `test/electron/file/ipc.test.ts`
- Test: `test/components/BSearchRecent/index.test.ts`
- Test: `test/hooks/useOpenFile.test.ts`

- [ ] **Step 1: Add the changelog entry**

```md
# 2026-05-15

## Changed
- 扩展 `BSearchRecent`，支持输入有效绝对路径时显示“按路径打开”候选项，并支持回车优先打开。
- 新增原生路径状态查询能力，用于判断绝对路径是否指向可打开的普通文件。
```

- [ ] **Step 2: Run the focused verification suite**

Run: `pnpm vitest run test/electron/file/ipc.test.ts test/components/BSearchRecent/index.test.ts test/hooks/useOpenFile.test.ts`

Expected: PASS for all three test files.

- [ ] **Step 3: Run typecheck or the closest existing static check**

Run: `pnpm exec vue-tsc --noEmit`

Expected: PASS with no new type errors from the platform interface or `BSearchRecent` result union.

## Self-Review

- Spec coverage
  `显式路径候选项` 由 Task 2 实现。
  `回车优先直开` 由 Task 2 实现。
  `统一复用 openFileByPath(path)` 由 Task 2 实现。
  `普通文件校验能力` 由 Task 1 实现。
  `验证与 changelog` 由 Task 3 收口。

- Placeholder scan
  计划中未保留 `TBD`、`TODO` 或“后续处理”类占位措辞。

- Type consistency
  计划统一使用 `getPathStatus()`、`FilePathStatus`、`SearchResultItem`、`handleOpenPath()` 等命名，避免后续执行时发生接口漂移。
