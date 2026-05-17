/**
 * @file useJsonParse.ts
 * @description JSON 文本解析与源码位置映射。
 */

import type { JsonNodeInfo, JsonNodeType } from '../types';
import type { DocumentStructureSummary } from 'types/ai';
import { parse } from 'json-source-map';

/**
 * JSON 解析结果。
 */
export interface JsonParseResult {
  /** 根路径。 */
  rootPath: string;
  /** 解析后的根值。 */
  data: unknown;
  /** 节点映射。 */
  nodeMap: Map<string, JsonNodeInfo>;
  /** 解析错误。 */
  error: Error | null;
  /** 按偏移量查找节点。 */
  findNodeAtOffset: (offset: number) => JsonNodeInfo | null;
  /** 按 JSON Pointer 读取值。 */
  getValueAtPath: (path: string) => unknown;
  /** 获取结构摘要。 */
  getStructureSummary: () => DocumentStructureSummary;
}

/**
 * 推断 JSON 值类型。
 * @param value - JSON 值
 * @returns 节点类型
 */
function getJsonNodeType(value: unknown): JsonNodeType {
  if (Array.isArray(value)) {
    return 'array';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'object') {
    return 'object';
  }

  if (typeof value === 'string') {
    return 'string';
  }

  if (typeof value === 'number') {
    return 'number';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  return 'null';
}

/**
 * 对 JSON Pointer 片段做解码。
 * @param segment - Pointer 片段
 * @returns 解码结果
 */
function decodePointerSegment(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

/**
 * 读取指定 Pointer 对应的值。
 * @param rootValue - 根值
 * @param path - JSON Pointer
 * @returns 对应值
 */
function getPointerValue(rootValue: unknown, path: string): unknown {
  if (path === '') {
    return rootValue;
  }

  return path
    .split('/')
    .slice(1)
    .map(decodePointerSegment)
    .reduce<unknown>((currentValue: unknown, segment: string): unknown => {
      if (Array.isArray(currentValue)) {
        const index = Number(segment);
        return Number.isInteger(index) ? currentValue[index] : undefined;
      }

      if (currentValue && typeof currentValue === 'object') {
        return (currentValue as Record<string, unknown>)[segment];
      }

      return undefined;
    }, rootValue);
}

/**
 * 构造节点摘要。
 * @param rootValue - 根值
 * @param nodeMap - 节点映射
 * @returns 结构摘要
 */
function createStructureSummary(rootValue: unknown, nodeMap: Map<string, JsonNodeInfo>): DocumentStructureSummary {
  const maxDepth = Array.from(nodeMap.keys()).reduce((depth: number, path: string) => {
    const nextDepth = path === '' ? 1 : path.split('/').length - 1 + 1;
    return Math.max(depth, nextDepth);
  }, 0);
  const topLevelValue = rootValue && typeof rootValue === 'object' && !Array.isArray(rootValue) ? Object.keys(rootValue as Record<string, unknown>) : [];

  return {
    rootType: getJsonNodeType(rootValue),
    maxDepth,
    totalNodes: nodeMap.size,
    topLevelKeys: topLevelValue
  };
}

/**
 * 解析 JSON 文档。
 * @param text - JSON 文本
 * @returns 解析结果
 */
export function parseJsonDocument(text: string): JsonParseResult {
  try {
    const parseResult = parse(text);
    const nodeMap = new Map<string, JsonNodeInfo>();
    const pointerPaths = Object.keys(parseResult.pointers).sort((left: string, right: string) => left.length - right.length);

    pointerPaths.forEach((path: string): void => {
      const pointerInfo = parseResult.pointers[path];
      const nodeValue = getPointerValue(parseResult.data, path);
      const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const pathSegments = path === '' ? [] : path.split('/').slice(1).map(decodePointerSegment);
      const key = pathSegments.at(-1);
      const nodeInfo: JsonNodeInfo = {
        path,
        type: getJsonNodeType(nodeValue),
        startOffset: pointerInfo.key?.pos ?? pointerInfo.value.pos,
        endOffset: pointerInfo.valueEnd.pos,
        keyStartOffset: pointerInfo.key?.pos,
        keyEndOffset: pointerInfo.keyEnd?.pos,
        valueStartOffset: pointerInfo.value.pos,
        valueEndOffset: pointerInfo.valueEnd.pos,
        key,
        value: nodeValue,
        children: []
      };

      nodeMap.set(path, nodeInfo);

      if (path !== '') {
        const parentNode = nodeMap.get(parentPath);
        if (parentNode) {
          parentNode.children.push(path);
        }
      }
    });

    return {
      rootPath: '',
      data: parseResult.data,
      nodeMap,
      error: null,
      findNodeAtOffset(offset: number): JsonNodeInfo | null {
        const matchedNodes = Array.from(nodeMap.values()).filter((node: JsonNodeInfo) => offset >= node.startOffset && offset <= node.endOffset);

        if (!matchedNodes.length) {
          return null;
        }

        return matchedNodes.sort((left: JsonNodeInfo, right: JsonNodeInfo) => left.endOffset - left.startOffset - (right.endOffset - right.startOffset))[0];
      },
      getValueAtPath(path: string): unknown {
        return getPointerValue(parseResult.data, path);
      },
      getStructureSummary(): DocumentStructureSummary {
        return createStructureSummary(parseResult.data, nodeMap);
      }
    };
  } catch (error) {
    return {
      rootPath: '',
      data: null,
      nodeMap: new Map<string, JsonNodeInfo>(),
      error: error instanceof Error ? error : new Error('Failed to parse JSON document.'),
      findNodeAtOffset(): JsonNodeInfo | null {
        return null;
      },
      getValueAtPath(): unknown {
        return undefined;
      },
      getStructureSummary(): DocumentStructureSummary {
        return {
          rootType: 'null',
          maxDepth: 0,
          totalNodes: 0,
          topLevelKeys: []
        };
      }
    };
  }
}
