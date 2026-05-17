/**
 * @file useGraphLayout.test.ts
 * @description JSON 图布局测试。
 */

import { describe, expect, it } from 'vitest';
import { buildJsonGraphLayout, createJsonGraphState, isJsonPathCollapsed } from '@/components/BJsonGraph/hooks/useGraphLayout';
import type { JsonGraphState, JsonNodeInfo } from '@/components/BJsonGraph/types';

/**
 * 创建测试节点映射。
 * @returns 节点映射
 */
function createNodeMap(): Map<string, JsonNodeInfo> {
  return new Map<string, JsonNodeInfo>([
    ['', { path: '', type: 'object', startOffset: 0, endOffset: 60, valueStartOffset: 0, valueEndOffset: 60, children: ['/author', '/tags'] }],
    [
      '/author',
      { path: '/author', type: 'object', startOffset: 1, endOffset: 30, valueStartOffset: 10, valueEndOffset: 30, key: 'author', children: ['/author/name'] }
    ],
    [
      '/author/name',
      {
        path: '/author/name',
        type: 'string',
        startOffset: 11,
        endOffset: 28,
        valueStartOffset: 20,
        valueEndOffset: 27,
        key: 'name',
        value: 'Tibis',
        children: []
      }
    ],
    ['/tags', { path: '/tags', type: 'array', startOffset: 31, endOffset: 59, valueStartOffset: 38, valueEndOffset: 59, key: 'tags', children: ['/tags/0'] }],
    ['/tags/0', { path: '/tags/0', type: 'string', startOffset: 40, endOffset: 43, valueStartOffset: 40, valueEndOffset: 43, value: 'a', children: [] }]
  ]);
}

describe('buildJsonGraphLayout', () => {
  it('builds nodes and edges for a visible tree', () => {
    const result = buildJsonGraphLayout({
      nodeMap: createNodeMap(),
      graphState: createJsonGraphState()
    });

    expect(result.nodes).toHaveLength(5);
    expect(result.edges).toHaveLength(4);
    expect(result.nodes.find((node) => node.id === '/author/name')?.position.x).toBeGreaterThan(
      result.nodes.find((node) => node.id === '/author')?.position.x ?? 0
    );
  });

  it('skips collapsed subtrees', () => {
    const state: JsonGraphState = {
      autoCollapsedPaths: new Set<string>(),
      userCollapsedPaths: new Set<string>(['/author']),
      userExpandedPaths: new Set<string>()
    };
    const result = buildJsonGraphLayout({
      nodeMap: createNodeMap(),
      graphState: state
    });

    expect(isJsonPathCollapsed(state, '/author')).toBe(true);
    expect(result.nodes.map((node) => node.id)).not.toContain('/author/name');
  });

  it('auto-collapses large trees without overriding user expansions', () => {
    const nodeMap = createNodeMap();
    nodeMap.set('/author/extra', {
      path: '/author/extra',
      type: 'string',
      startOffset: 29,
      endOffset: 35,
      valueStartOffset: 29,
      valueEndOffset: 35,
      value: 'x',
      children: []
    });
    nodeMap.get('/author')!.children.push('/author/extra');

    const state = createJsonGraphState();
    state.userExpandedPaths.add('/author');

    const result = buildJsonGraphLayout({
      nodeMap,
      graphState: state,
      autoCollapseThreshold: 3
    });

    expect(result.graphState.autoCollapsedPaths.has('/tags')).toBe(true);
    expect(result.graphState.autoCollapsedPaths.has('/author')).toBe(false);
  });

  it('returns empty layout for empty maps', () => {
    const result = buildJsonGraphLayout({
      nodeMap: new Map<string, JsonNodeInfo>(),
      graphState: createJsonGraphState()
    });

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
