# File Reopen Disk Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make welcome/recent/native-open reopen disk-backed files from disk unless the file already has an open tab, while keeping unsaved pathless drafts unchanged.

**Architecture:** Keep the behavior switch at the entry layer. `useOpenFile` decides whether to reuse an open tab or force-refresh a stored file from disk, and `filesStore` owns the disk refresh/writeback to recent-file storage. Existing editor session loading and tab switching stay unchanged.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vue Router, Vitest

---

### Task 1: Add store-level disk refresh coverage

**Files:**
- Modify: `src/stores/files.ts`
- Test: `test/stores/files.store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('refreshes an existing stored file from disk while preserving its id', async () => {
  const existing = createStoredFile({
    id: 'file_a',
    path: '/tmp/demo.md',
    content: 'draft',
    savedContent: 'draft'
  })

  recentFilesStorage.getAllRecentFiles = vi.fn().mockResolvedValue([existing])
  recentFilesStorage.updateRecentFile = vi.fn().mockImplementation(async (_id, updates) => ({ ...existing, ...updates }))
  native.readFile = vi.fn().mockResolvedValue({ name: 'demo', ext: 'md', content: 'disk latest', path: '/tmp/demo.md' })

  const store = useFilesStore()
  await store.ensureLoaded()

  const reopened = await store.openOrRefreshByPathFromDisk('/tmp/demo.md')

  expect(native.readFile).toHaveBeenCalledWith('/tmp/demo.md')
  expect(reopened?.id).toBe('file_a')
  expect(reopened?.content).toBe('disk latest')
  expect(reopened?.savedContent).toBe('disk latest')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest test/stores/files.store.test.ts -t "refreshes an existing stored file from disk while preserving its id"`
Expected: FAIL because `openOrRefreshByPathFromDisk` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
async openOrRefreshByPathFromDisk(path: string): Promise<StoredFile | null> {
  if (inflightPaths.has(path)) return null

  inflightPaths.add(path)

  try {
    await this.ensureLoaded()

    const diskFile = await native.readFile(path)
    const existingFile = await this.getFileByPath(path)
    const now = Date.now()

    if (existingFile) {
      const nextFile = await recentFilesStorage.updateRecentFile(existingFile.id, {
        path,
        name: diskFile.name,
        ext: diskFile.ext,
        content: diskFile.content,
        savedContent: diskFile.content,
        openedAt: now,
        savedAt: now
      })

      await this.refreshRecentFiles()
      await this.syncPlatformRecentFiles()
      return nextFile
    }

    const createdFile: StoredFile = {
      id: createFileId(),
      path,
      content: diskFile.content,
      savedContent: diskFile.content,
      name: diskFile.name,
      ext: diskFile.ext,
      createdAt: now,
      openedAt: now,
      savedAt: now
    }

    await enqueueWrite(async () => {
      await recentFilesStorage.addRecentFile(createdFile)
    })

    const files = await this.refreshRecentFiles()
    await this.syncPlatformRecentFiles()
    return files.find((item) => item.id === createdFile.id) ?? createdFile
  } finally {
    inflightPaths.delete(path)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest test/stores/files.store.test.ts -t "refreshes an existing stored file from disk while preserving its id"`
Expected: PASS

### Task 2: Route reopen requests through tab reuse first

**Files:**
- Modify: `src/hooks/useOpenFile.ts`
- Modify: `src/stores/tabs.ts`
- Test: `test/hooks/useOpenFile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('reuses an already-open tab for the same file path instead of reloading from disk', async () => {
  const filesStore = useFilesStore()
  const tabsStore = useTabsStore()

  vi.spyOn(filesStore, 'getFileById').mockResolvedValue(createStoredFile({
    id: 'stored_a',
    path: '/tmp/demo.md'
  }))
  vi.spyOn(filesStore, 'openOrRefreshByPathFromDisk').mockResolvedValue(null)
  tabsStore.addTab({ id: 'tab_a', path: '/editor/stored_a', title: 'demo' })

  const { openFileById } = useOpenFile()
  await openFileById('stored_a')

  expect(filesStore.openOrRefreshByPathFromDisk).not.toHaveBeenCalled()
  expect(mockRouterPush).toHaveBeenCalledWith('/editor/stored_a')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest test/hooks/useOpenFile.test.ts -t "reuses an already-open tab for the same file path instead of reloading from disk"`
Expected: FAIL because there is no path-based open-tab reuse.

- [ ] **Step 3: Write minimal implementation**

```ts
function findOpenTabPathByFilePath(filePath: string): string | null {
  const matchedTab = tabsStore.tabs.find((tab) => {
    const stored = filesStore.recentFiles?.find((file) => file.id === tab.id)
    return stored?.path === filePath
  })

  return matchedTab?.path ?? null
}

async function openFileByPath(path: string): Promise<StoredFile | null> {
  const openTabPath = findOpenTabPathByFilePath(path)
  if (openTabPath) {
    await router.push(openTabPath)
    return await filesStore.getFileByPath(path) ?? null
  }

  const openedFile = await filesStore.openOrRefreshByPathFromDisk(path)
  if (!openedFile) return null

  await router.push({ name: 'editor', params: { id: openedFile.id } })
  return openedFile
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest test/hooks/useOpenFile.test.ts -t "reuses an already-open tab for the same file path instead of reloading from disk"`
Expected: PASS

### Task 3: Preserve draft restore for pathless files

**Files:**
- Modify: `src/hooks/useOpenFile.ts`
- Test: `test/hooks/useOpenFile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('keeps restoring unsaved pathless drafts by id', async () => {
  const draft = createStoredFile({ id: 'draft_a', path: null, content: 'draft only', savedContent: 'draft only' })
  const filesStore = useFilesStore()

  vi.spyOn(filesStore, 'getFileById').mockResolvedValue(draft)
  vi.spyOn(filesStore, 'openExistingFile').mockResolvedValue(draft)

  const { openFileById } = useOpenFile()
  await openFileById('draft_a')

  expect(filesStore.openExistingFile).toHaveBeenCalledWith('draft_a')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest test/hooks/useOpenFile.test.ts -t "keeps restoring unsaved pathless drafts by id"`
Expected: FAIL after Task 2 if `openFileById()` treats all files uniformly.

- [ ] **Step 3: Write minimal implementation**

```ts
async function openFileById(id: string): Promise<StoredFile | null> {
  const file = await filesStore.getFileById(id)
  if (!file) return null

  if (!file.path) {
    return openFile(file)
  }

  return openFileByPath(file.path)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest test/hooks/useOpenFile.test.ts -t "keeps restoring unsaved pathless drafts by id"`
Expected: PASS

### Task 4: Verify affected entry points and update changelog wording if needed

**Files:**
- Modify: `changelog/2026-05-14.md`
- Test: manual verification via targeted vitest runs

- [ ] **Step 1: Update changelog text to reflect implementation**

```md
## Changed
- 欢迎页、最近文件和原生打开入口现在会优先复用已打开标签；若目标磁盘文件未打开，则重新从磁盘读取，不再恢复旧草稿。
```

- [ ] **Step 2: Run focused verification**

Run: `pnpm vitest test/stores/files.store.test.ts test/hooks/useOpenFile.test.ts`
Expected: PASS
