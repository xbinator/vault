/**
 * @file useJsonParse.test.ts
 * @description JSON 解析与位置映射测试。
 */

import { describe, expect, it } from 'vitest';
import { parseJsonDocument } from '@/components/BJsonGraph/hooks/useJsonParse';

describe('parseJsonDocument', () => {
  it('parses objects, arrays, and pointer paths', () => {
    const result = parseJsonDocument('{"author":{"name":"Tibis"},"tags":["a","b"]}');

    expect(result.error).toBeNull();
    expect(result.rootPath).toBe('');
    expect(result.nodeMap.get('')?.type).toBe('object');
    expect(result.nodeMap.get('/author')?.type).toBe('object');
    expect(result.nodeMap.get('/author/name')?.type).toBe('string');
    expect(result.nodeMap.get('/tags/0')?.type).toBe('string');
  });

  it('captures value and key offsets', () => {
    const text = '{"author":{"name":"Tibis"}}';
    const result = parseJsonDocument(text);
    const node = result.nodeMap.get('/author/name');

    expect(node?.keyStartOffset).toBeTypeOf('number');
    expect(node?.keyEndOffset).toBeTypeOf('number');
    expect(node?.valueStartOffset).toBeLessThan(node?.valueEndOffset ?? 0);
    expect(text.slice(node?.valueStartOffset ?? 0, node?.valueEndOffset ?? 0)).toBe('"Tibis"');
  });

  it('finds node by offset', () => {
    const text = '{"author":{"name":"Tibis"}}';
    const result = parseJsonDocument(text);
    const offset = text.indexOf('Tibis') + 1;

    expect(result.findNodeAtOffset(offset)?.path).toBe('/author/name');
  });

  it('returns values by pointer path', () => {
    const result = parseJsonDocument('{"author":{"name":"Tibis"},"tags":["a","b"]}');

    expect(result.getValueAtPath('/author/name')).toBe('Tibis');
    expect(result.getValueAtPath('/tags/1')).toBe('b');
    expect(result.getValueAtPath('/missing')).toBeUndefined();
  });

  it('builds a structure summary', () => {
    const result = parseJsonDocument('{"author":{"name":"Tibis"},"tags":["a","b"]}');

    expect(result.getStructureSummary()).toEqual({
      rootType: 'object',
      maxDepth: 3,
      totalNodes: 6,
      topLevelKeys: ['author', 'tags']
    });
  });

  it('reports invalid json errors without crashing', () => {
    const result = parseJsonDocument('{"author": }');

    expect(result.error).toBeInstanceOf(Error);
    expect(result.nodeMap.size).toBe(0);
    expect(result.findNodeAtOffset(1)).toBeNull();
  });
});
