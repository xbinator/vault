/**
 * @file drivers-json.test.ts
 * @description JSON driver 测试。
 */

import { describe, expect, it } from 'vitest';
import { jsonDriver } from '@/views/editor/drivers/json';

describe('jsonDriver', () => {
  it('matches json files and exposes structured toolbar flags', () => {
    expect(
      jsonDriver.match({
        id: '1',
        name: 'data',
        ext: 'json',
        content: '{}',
        path: null
      })
    ).toBe(true);
    expect(
      jsonDriver.match({
        id: '2',
        name: 'doc',
        ext: 'md',
        content: '# demo',
        path: null
      })
    ).toBe(false);
    expect(jsonDriver.toolbar).toEqual({
      showViewModeToggle: false,
      showOutlineToggle: false,
      showStructuredViewToggle: true,
      showSearch: true
    });
  });

  it('creates structured editor context from BJsonGraph public methods', () => {
    const context = jsonDriver.createToolContext({
      fileState: {
        id: '1',
        name: 'data',
        ext: 'json',
        content: '{"author":{"name":"Tibis"}}',
        path: null
      },
      isActive: true,
      editorInstance: {
        getSelection: () => null,
        insertAtCursor: async () => undefined,
        replaceSelection: async () => undefined,
        replaceDocument: async () => undefined,
        getCurrentPath: () => '/author/name',
        getCurrentNodeType: () => 'string',
        getValueAtPath: () => 'Tibis',
        getStructureSummary: () => ({
          rootType: 'object',
          maxDepth: 2,
          totalNodes: 2,
          topLevelKeys: ['author']
        })
      }
    });

    expect(context.structured?.documentType).toBe('json');
    expect(context.structured?.getCurrentPath()).toBe('/author/name');
    expect(context.structured?.getCurrentNodeType()).toBe('string');
  });
});
