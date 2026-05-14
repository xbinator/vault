import type { AIToolContext } from 'types/ai';
import { describe, expect, it } from 'vitest';
import { createBuiltinReadTools } from '@/ai/tools/builtin/DocumentTool';

/**
 * 创建测试用的工具上下文。
 * @param overrides - 允许覆盖默认文档字段
 * @param content - 文档内容
 * @returns 工具上下文
 */
function createContext(overrides: Partial<AIToolContext['document']> = {}, content = 'alpha beta\nbeta gamma'): AIToolContext {
  return {
    document: {
      id: 'doc-1',
      title: 'My Note',
      path: '/tmp/my-note.md',
      getContent: () => content,
      ...overrides
    },
    editor: {
      getSelection: () => ({ from: 1, to: 5, text: 'lpha' }),
      insertAtCursor: async () => undefined,
      replaceSelection: async () => undefined,
      replaceDocument: async () => undefined
    }
  };
}

describe('built-in read tools', () => {
  it('reads the current document', async () => {
    const tools = createBuiltinReadTools();
    const result = await tools.readCurrentDocument.execute({}, createContext());

    expect(result.status).toBe('success');
    expect(result.data).toEqual({
      id: 'doc-1',
      title: 'My Note',
      path: '/tmp/my-note.md',
      content: 'alpha beta\nbeta gamma'
    });
  });

  it('builds an unsaved path when the current document has no filesystem path', async () => {
    const tools = createBuiltinReadTools();
    const result = await tools.readCurrentDocument.execute(
      {},
      createContext({
        id: 'doc-1',
        title: 'My Note',
        path: null
      })
    );

    expect(result.status).toBe('success');
    expect(result.data).toEqual({
      id: 'doc-1',
      title: 'My Note',
      path: 'unsaved://doc-1/My Note.md',
      content: 'alpha beta\nbeta gamma'
    });
  });

  it('prefers the document locator when one is provided', async () => {
    const tools = createBuiltinReadTools();
    const result = await tools.readCurrentDocument.execute(
      {},
      createContext({
        id: 'doc-1',
        title: 'My Note',
        path: null,
        locator: 'unsaved://doc-1/My Note.md'
      })
    );

    expect(result.status).toBe('success');
    expect(result.data).toEqual({
      id: 'doc-1',
      title: 'My Note',
      path: 'unsaved://doc-1/My Note.md',
      content: 'alpha beta\nbeta gamma'
    });
  });

  it('only exposes current document reading', () => {
    const tools = createBuiltinReadTools();

    expect(Object.keys(tools)).toEqual(['readCurrentDocument']);
  });
});
