/**
 * @file builtin-file-write.test.ts
 * @description 内置 write_file 工具测试。
 */
import type { AIToolContext } from 'types/ai';
import { describe, expect, it, vi } from 'vitest';
import { createBuiltinWriteFileTool } from '@/ai/tools/builtin/fileWrite';
import type { FileReadSnapshot } from '@/ai/tools/shared/fileTypes';

/**
 * 创建测试用文件快照。
 * @returns 共享快照存取函数
 */
function createSnapshotState(): {
  getReadSnapshot: (filePath: string) => FileReadSnapshot | null;
  setReadSnapshot: (snapshot: FileReadSnapshot) => void;
} {
  const snapshots = new Map<string, FileReadSnapshot>();

  return {
    getReadSnapshot(filePath: string) {
      return snapshots.get(filePath) ?? null;
    },
    setReadSnapshot(snapshot: FileReadSnapshot) {
      snapshots.set(snapshot.path, snapshot);
    }
  };
}

/**
 * 创建测试用工具上下文。
 * @param path - 当前激活文档路径
 * @returns 工具执行上下文
 */
function createToolContext(path: string | null): AIToolContext {
  return {
    document: {
      id: 'doc-1',
      title: 'Example',
      path,
      getContent: () => 'const value = 1;\n'
    },
    editor: {
      getSelection: () => null,
      insertAtCursor: async () => undefined,
      replaceSelection: async () => undefined,
      replaceDocument: async () => undefined
    }
  };
}

describe('createBuiltinWriteFileTool', () => {
  it('allows creating a new file without a prior read', async () => {
    const snapshotState = createSnapshotState();
    const writeFile = vi.fn(async () => undefined);
    const tool = createBuiltinWriteFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
      getReadSnapshot: snapshotState.getReadSnapshot,
      setReadSnapshot: snapshotState.setReadSnapshot,
      readWorkspaceFile: async () => {
        const error = new Error('missing') as Error & { code: string };
        error.code = 'FILE_NOT_FOUND';
        throw error;
      },
      writeFile
    });

    const result = await tool.execute({
      path: 'src/new-file.ts',
      content: 'export const value = 1;\n'
    });

    expect(result.status).toBe('success');
    expect(result.data).toEqual({
      path: '/workspace/src/new-file.ts',
      content: 'export const value = 1;\n',
      created: true
    });
    expect(writeFile).toHaveBeenCalledWith('/workspace/src/new-file.ts', 'export const value = 1;\n');
  });

  it('rejects overwriting an existing file that was never read', async () => {
    const snapshotState = createSnapshotState();
    const tool = createBuiltinWriteFileTool({
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
      content: 'const value = 2;\n'
    });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('rejects overwriting an existing file after a partial read', async () => {
    const snapshotState = createSnapshotState();
    snapshotState.setReadSnapshot({
      path: '/workspace/src/example.ts',
      content: 'const value = 1;\n',
      isPartial: true,
      readAt: 1
    });
    const tool = createBuiltinWriteFileTool({
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
      content: 'const value = 2;\n'
    });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('rejects overwriting when the file changed since the last read', async () => {
    const snapshotState = createSnapshotState();
    snapshotState.setReadSnapshot({
      path: '/workspace/src/example.ts',
      content: 'const value = 1;\n',
      isPartial: false,
      readAt: 1
    });
    const tool = createBuiltinWriteFileTool({
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
      content: 'const value = 2;\n'
    });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('STALE_CONTEXT');
  });

  it('writes an existing file after confirmation and refreshes the read snapshot', async () => {
    const snapshotState = createSnapshotState();
    snapshotState.setReadSnapshot({
      path: '/workspace/src/example.ts',
      content: 'const value = 1;\n',
      isPartial: false,
      readAt: 1
    });
    const writeFile = vi.fn(async () => undefined);
    const tool = createBuiltinWriteFileTool({
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
      writeFile
    });

    const result = await tool.execute({
      path: 'src/example.ts',
      content: 'const value = 2;\n'
    });

    expect(result.status).toBe('success');
    expect(result.data).toEqual({
      path: '/workspace/src/example.ts',
      content: 'const value = 2;\n',
      created: false
    });
    expect(writeFile).toHaveBeenCalledWith('/workspace/src/example.ts', 'const value = 2;\n');
    expect(snapshotState.getReadSnapshot('/workspace/src/example.ts')).toEqual({
      path: '/workspace/src/example.ts',
      content: 'const value = 2;\n',
      isPartial: false,
      readAt: expect.any(Number)
    });
  });

  it('writes to the active editor document when the target path matches it', async () => {
    const snapshotState = createSnapshotState();
    snapshotState.setReadSnapshot({
      path: '/workspace/src/example.ts',
      content: 'const value = 1;\n',
      isPartial: false,
      readAt: 1
    });
    const writeFile = vi.fn(async () => undefined);
    const replaceDocument = vi.fn(async () => undefined);
    const tool = createBuiltinWriteFileTool({
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
      writeFile
    });
    const context = createToolContext('/workspace/src/example.ts');
    context.editor.replaceDocument = replaceDocument;

    const result = await tool.execute({
      path: 'src/example.ts',
      content: 'const value = 2;\n'
    }, context);

    expect(result.status).toBe('success');
    expect(replaceDocument).toHaveBeenCalledWith('const value = 2;\n');
    expect(writeFile).not.toHaveBeenCalled();
  });
});
