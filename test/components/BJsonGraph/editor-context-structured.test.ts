/**
 * @file editor-context-structured.test.ts
 * @description 结构化编辑器上下文注册测试。
 */

import type { AIToolContext } from 'types/ai';
import { describe, expect, it } from 'vitest';
import { createEditorToolContextRegistry } from '@/ai/tools/editor-context';

describe('editor structured context', () => {
  it('stores and reads structured context fields', () => {
    const registry = createEditorToolContextRegistry();
    const context: AIToolContext = {
      document: {
        id: 'doc-1',
        title: 'demo.json',
        path: '/tmp/demo.json',
        getContent: () => '{"author":{"name":"Tibis"}}'
      },
      editor: {
        getSelection: () => null,
        insertAtCursor: async () => undefined,
        replaceSelection: async () => undefined,
        replaceDocument: async () => undefined
      },
      structured: {
        documentType: 'json',
        getCurrentPath: () => '/author/name',
        getCurrentNodeType: () => 'string',
        getValueAtPath: (path: string) => (path === '/author/name' ? 'Tibis' : undefined),
        getStructureSummary: () => ({
          rootType: 'object',
          maxDepth: 2,
          totalNodes: 2,
          topLevelKeys: ['author']
        })
      }
    };

    registry.register('doc-1', context);

    const currentContext = registry.getCurrentContext();

    expect(currentContext?.structured?.getCurrentPath()).toBe('/author/name');
    expect(currentContext?.structured?.getCurrentNodeType()).toBe('string');
    expect(currentContext?.structured?.getValueAtPath('/author/name')).toBe('Tibis');
    expect(currentContext?.structured?.getStructureSummary().topLevelKeys).toEqual(['author']);
  });

  it('unregister clears structured context and plain context still works', () => {
    const registry = createEditorToolContextRegistry();
    const plainContext: AIToolContext = {
      document: {
        id: 'doc-2',
        title: 'plain.md',
        path: null,
        getContent: () => '# demo'
      },
      editor: {
        getSelection: () => null,
        insertAtCursor: async () => undefined,
        replaceSelection: async () => undefined,
        replaceDocument: async () => undefined
      }
    };

    registry.register('doc-2', plainContext);
    expect(registry.getCurrentContext()?.document.title).toBe('plain.md');

    registry.unregister('doc-2');

    expect(registry.getCurrentContext()).toBeUndefined();
  });
});
