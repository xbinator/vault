/**
 * @file builtin-file-edit.test.ts
 * @description 内置 edit_file 工具测试。
 */
import type { AIToolContext } from 'types/ai';
import { describe, expect, it, vi } from 'vitest';
import { createBuiltinEditFileTool } from '@/ai/tools/builtin/FileEditTool';
import type { ReadWorkspaceFileResult } from '@/shared/platform/native/types';

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

describe('createBuiltinEditFileTool', () => {
  it('allows edits when the file has not been read yet', async () => {
    const writeFile = vi.fn(async () => undefined);
    const tool = createBuiltinEditFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
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
      oldString: 'value = 1',
      newString: 'value = 2'
    });

    expect(result.status).toBe('success');
    expect(writeFile).toHaveBeenCalledWith('/workspace/src/example.ts', 'const value = 2;\n');
  });

  it('allows edits when the file content changed since the last read', async () => {
    const writeFile = vi.fn(async () => undefined);
    const tool = createBuiltinEditFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
      readWorkspaceFile: async () => ({
        path: '/workspace/src/example.ts',
        content: 'const value = 3;\n',
        totalLines: 1,
        readLines: 1,
        hasMore: false,
        nextOffset: null
      }),
      writeFile
    });

    const result = await tool.execute({
      path: 'src/example.ts',
      oldString: 'value = 3',
      newString: 'value = 4'
    });

    expect(result.status).toBe('success');
    expect(writeFile).toHaveBeenCalledWith('/workspace/src/example.ts', 'const value = 4;\n');
  });

  it('rejects edits when oldString is ambiguous without replaceAll', async () => {
    const tool = createBuiltinEditFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
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

  it('edits a file after confirmation', async () => {
    const confirm = vi.fn(async () => true);
    const writeFile = vi.fn(async () => undefined);
    const tool = createBuiltinEditFileTool({
      confirm: { confirm },
      getWorkspaceRoot: () => '/workspace',
      readWorkspaceFile: async (): Promise<ReadWorkspaceFileResult> => ({
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
  });

  it('supports replaceAll for repeated matches', async () => {
    const writeFile = vi.fn(async () => undefined);
    const tool = createBuiltinEditFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
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

  it('writes to the active editor document when the target path matches it', async () => {
    const writeFile = vi.fn(async () => undefined);
    const replaceDocument = vi.fn(async () => undefined);
    const tool = createBuiltinEditFileTool({
      confirm: { confirm: async () => true },
      getWorkspaceRoot: () => '/workspace',
      readWorkspaceFile: async (): Promise<ReadWorkspaceFileResult> => ({
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

    const result = await tool.execute(
      {
        path: 'src/example.ts',
        oldString: 'value = 1',
        newString: 'value = 2'
      },
      context
    );

    expect(result.status).toBe('success');
    expect(replaceDocument).toHaveBeenCalledWith('const value = 2;\n');
    expect(writeFile).not.toHaveBeenCalled();
  });
});
