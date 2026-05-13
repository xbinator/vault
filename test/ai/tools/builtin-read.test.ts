import type { AIToolContext } from 'types/ai';
import { describe, expect, it } from 'vitest';
import { createBuiltinReadTools } from '@/ai/tools/builtin/DocumentTool';

function createContext(content = 'alpha beta\nbeta gamma'): AIToolContext {
  return {
    document: {
      id: 'doc-1',
      title: 'My Note',
      path: '/tmp/my-note.md',
      getContent: () => content
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

  it('only exposes current document reading', () => {
    const tools = createBuiltinReadTools();

    expect(Object.keys(tools)).toEqual(['readCurrentDocument']);
  });
});
