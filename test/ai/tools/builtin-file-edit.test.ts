/**
 * @file builtin-file-edit.test.ts
 * @description 内置 edit_file 工具测试。
 */
import { describe, expect, it, vi } from 'vitest';
import type { AIToolConfirmationRequest } from '@/ai/tools/confirmation';
import { createBuiltinEditFileTool } from '@/ai/tools/builtin/fileEdit';
import type { ReadWorkspaceFileOptions, ReadWorkspaceFileResult } from '@/shared/platform/native/types';

/**
 * 创建测试用文件快照。
 * @returns 共享快照存取函数
 */
function createSnapshotState(): {
  getReadSnapshot: (filePath: string) => { content: string; isPartial: boolean } | null;
  setReadSnapshot: (filePath: string, snapshot: { content: string; isPartial: boolean }) => void;
} {
  const snapshots = new Map<string, { content: string; isPartial: boolean }>();

  return {
    getReadSnapshot(filePath: string) {
      return snapshots.get(filePath) ?? null;
    },
    setReadSnapshot(filePath: string, snapshot: { content: string; isPartial: boolean }) {
      snapshots.set(filePath, snapshot);
    }
  };
}

describe('createBuiltinEditFileTool', () => {
  it('rejects edits when the file has not been read yet', async () => {
    const snapshotState = createSnapshotState();
    const tool = createBuiltinEditFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
      getReadSnapshot: snapshotState.getReadSnapshot,
      setReadSnapshot: snapshotState.setReadSnapshot,
      readWorkspaceFile: async () => ({
        path: '/workspace/src/example.ts',
        content: 'const value = 1;\n',
        totalLines: 1,
        readLines: 1,
        hasMore: false,
        nextOffset: null
      }),
      writeFile: async () => undefined
    });

    const result = await tool.execute({
      path: 'src/example.ts',
      oldString: 'value = 1',
      newString: 'value = 2'
    });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('rejects edits after a partial read snapshot', async () => {
    const snapshotState = createSnapshotState();
    snapshotState.setReadSnapshot('/workspace/src/example.ts', {
      content: 'const value = 1;\n',
      isPartial: true
    });
    const tool = createBuiltinEditFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
      getReadSnapshot: snapshotState.getReadSnapshot,
      setReadSnapshot: snapshotState.setReadSnapshot,
      readWorkspaceFile: async () => ({
        path: '/workspace/src/example.ts',
        content: 'const value = 1;\n',
        totalLines: 1,
        readLines: 1,
        hasMore: false,
        nextOffset: null
      }),
      writeFile: async () => undefined
    });

    const result = await tool.execute({
      path: 'src/example.ts',
      oldString: 'value = 1',
      newString: 'value = 2'
    });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('rejects edits when the file content changed since the last read', async () => {
    const snapshotState = createSnapshotState();
    snapshotState.setReadSnapshot('/workspace/src/example.ts', {
      content: 'const value = 1;\n',
      isPartial: false
    });
    const tool = createBuiltinEditFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
      getReadSnapshot: snapshotState.getReadSnapshot,
      setReadSnapshot: snapshotState.setReadSnapshot,
      readWorkspaceFile: async () => ({
        path: '/workspace/src/example.ts',
        content: 'const value = 3;\n',
        totalLines: 1,
        readLines: 1,
        hasMore: false,
        nextOffset: null
      }),
      writeFile: async () => undefined
    });

    const result = await tool.execute({
      path: 'src/example.ts',
      oldString: 'value = 1',
      newString: 'value = 2'
    });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('STALE_CONTEXT');
  });

  it('rejects edits when oldString is ambiguous without replaceAll', async () => {
    const snapshotState = createSnapshotState();
    snapshotState.setReadSnapshot('/workspace/src/example.ts', {
      content: 'value\nvalue\n',
      isPartial: false
    });
    const tool = createBuiltinEditFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
      getReadSnapshot: snapshotState.getReadSnapshot,
      setReadSnapshot: snapshotState.setReadSnapshot,
      readWorkspaceFile: async () => ({
        path: '/workspace/src/example.ts',
        content: 'value\nvalue\n',
        totalLines: 2,
        readLines: 2,
        hasMore: false,
        nextOffset: null
      }),
      writeFile: async () => undefined
    });

    const result = await tool.execute({
      path: 'src/example.ts',
      oldString: 'value',
      newString: 'next'
    });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('edits a file after confirmation and refreshes the read snapshot', async () => {
    const confirm = vi.fn(async (_request: AIToolConfirmationRequest) => true);
    const writeFile = vi.fn(async () => undefined);
    const snapshotState = createSnapshotState();
    snapshotState.setReadSnapshot('/workspace/src/example.ts', {
      content: 'const value = 1;\n',
      isPartial: false
    });
    const tool = createBuiltinEditFileTool({
      confirm: { confirm },
      getWorkspaceRoot: () => '/workspace',
      getReadSnapshot: snapshotState.getReadSnapshot,
      setReadSnapshot: snapshotState.setReadSnapshot,
      readWorkspaceFile: async (_options: ReadWorkspaceFileOptions): Promise<ReadWorkspaceFileResult> => ({
        path: '/workspace/src/example.ts',
        content: 'const value = 1;\n',
        totalLines: 1,
        readLines: 1,
        hasMore: false,
        nextOffset: null
      }),
      writeFile
    });

    const result = await tool.execute({
      path: 'src/example.ts',
      oldString: 'value = 1',
      newString: 'value = 2'
    });

    expect(result.status).toBe('success');
    expect(result.data).toEqual({
      path: '/workspace/src/example.ts',
      content: 'const value = 2;\n',
      replacedCount: 1
    });
    expect(writeFile).toHaveBeenCalledWith('/workspace/src/example.ts', 'const value = 2;\n');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(snapshotState.getReadSnapshot('/workspace/src/example.ts')).toEqual({
      content: 'const value = 2;\n',
      isPartial: false
    });
  });

  it('supports replaceAll for repeated matches', async () => {
    const snapshotState = createSnapshotState();
    snapshotState.setReadSnapshot('/workspace/src/example.ts', {
      content: 'value\nvalue\n',
      isPartial: false
    });
    const writeFile = vi.fn(async () => undefined);
    const tool = createBuiltinEditFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
      getReadSnapshot: snapshotState.getReadSnapshot,
      setReadSnapshot: snapshotState.setReadSnapshot,
      readWorkspaceFile: async () => ({
        path: '/workspace/src/example.ts',
        content: 'value\nvalue\n',
        totalLines: 2,
        readLines: 2,
        hasMore: false,
        nextOffset: null
      }),
      writeFile
    });

    const result = await tool.execute({
      path: 'src/example.ts',
      oldString: 'value',
      newString: 'next',
      replaceAll: true
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') {
      throw new Error('expected edit_file to succeed');
    }
    expect(result.data.replacedCount).toBe(2);
    expect(writeFile).toHaveBeenCalledWith('/workspace/src/example.ts', 'next\nnext\n');
  });
});
