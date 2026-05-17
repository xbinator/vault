/**
 * @file useGraphLayout.ts
 * @description 将 JSON 树结构转换为 Vue Flow 布局。
 */

import type { JsonGraphState, JsonNodeInfo } from '../types';
import type { Edge, Node } from '@vue-flow/core';
import dagre from '@dagrejs/dagre';

/** 自动折叠的默认阈值。 */
const DEFAULT_AUTO_COLLAPSE_THRESHOLD = 500;
/** 根节点的内部 dagre 标识。 */
const DAGRE_ROOT_ID = '__json_root__';

/**
 * 图节点数据。
 */
export interface JsonFlowNodeData {
  /** JSON Pointer 路径。 */
  path: string;
  /** 节点信息。 */
  node: JsonNodeInfo;
  /** 是否折叠。 */
  collapsed: boolean;
}

/**
 * 图布局结果。
 */
export interface JsonGraphLayoutResult {
  /** Vue Flow 节点。 */
  nodes: Node<JsonFlowNodeData>[];
  /** Vue Flow 边。 */
  edges: Edge[];
  /** 更新后的折叠状态。 */
  graphState: JsonGraphState;
}

/**
 * 创建默认折叠状态。
 * @returns 默认状态
 */
export function createJsonGraphState(): JsonGraphState {
  return {
    autoCollapsedPaths: new Set<string>(),
    userCollapsedPaths: new Set<string>(),
    userExpandedPaths: new Set<string>()
  };
}

/**
 * 判断路径是否折叠。
 * @param graphState - 折叠状态
 * @param path - 节点路径
 * @returns 是否折叠
 */
export function isJsonPathCollapsed(graphState: JsonGraphState, path: string): boolean {
  return (graphState.autoCollapsedPaths.has(path) || graphState.userCollapsedPaths.has(path)) && !graphState.userExpandedPaths.has(path);
}

/**
 * 根据节点路径深度排序，优先自动折叠较深节点。
 * @param path - 节点路径
 * @returns 深度
 */
function getPathDepth(path: string): number {
  return path === '' ? 0 : path.split('/').length - 1;
}

/**
 * 将业务路径转成 dagre 可接受的内部 id。
 * @param path - JSON Pointer 路径
 * @returns 内部 id
 */
function toDagreNodeId(path: string): string {
  return path === '' ? DAGRE_ROOT_ID : path;
}

/**
 * 生成自动折叠集合。
 * @param nodeMap - 节点映射
 * @param graphState - 折叠状态
 * @param autoCollapseThreshold - 阈值
 * @returns 自动折叠集合
 */
function createAutoCollapsedPaths(nodeMap: Map<string, JsonNodeInfo>, graphState: JsonGraphState, autoCollapseThreshold: number): Set<string> {
  if (nodeMap.size <= autoCollapseThreshold) {
    return new Set<string>();
  }

  const autoCollapsedPaths = new Set<string>();
  const collapsibleNodes = Array.from(nodeMap.values())
    .filter((node: JsonNodeInfo) => node.children.length > 0 && node.path !== '')
    .sort((left: JsonNodeInfo, right: JsonNodeInfo) => getPathDepth(right.path) - getPathDepth(left.path));
  let visibleNodeCount = nodeMap.size;

  collapsibleNodes.forEach((node: JsonNodeInfo): void => {
    if (visibleNodeCount <= autoCollapseThreshold) {
      return;
    }

    if (graphState.userExpandedPaths.has(node.path)) {
      return;
    }

    autoCollapsedPaths.add(node.path);
    visibleNodeCount -= node.children.length;
  });

  return autoCollapsedPaths;
}

/**
 * 构造图布局。
 * @param input - 输入参数
 * @returns 图布局
 */
export function buildJsonGraphLayout(input: {
  nodeMap: Map<string, JsonNodeInfo>;
  graphState: JsonGraphState;
  autoCollapseThreshold?: number;
}): JsonGraphLayoutResult {
  const { nodeMap, graphState, autoCollapseThreshold = DEFAULT_AUTO_COLLAPSE_THRESHOLD } = input;

  if (!nodeMap.size) {
    return {
      nodes: [],
      edges: [],
      graphState
    };
  }

  graphState.autoCollapsedPaths = createAutoCollapsedPaths(nodeMap, graphState, autoCollapseThreshold);

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80 });

  const nodes: Node<JsonFlowNodeData>[] = [];
  const edges: Edge[] = [];
  const queue: string[] = [''];
  const visited = new Set<string>();

  while (queue.length) {
    const path = queue.shift() ?? '';
    if (visited.has(path)) {
      continue;
    }

    const node = nodeMap.get(path);
    if (!node) {
      continue;
    }

    visited.add(path);

    const collapsed = isJsonPathCollapsed(graphState, path);
    let flowNodeType: Node<JsonFlowNodeData>['type'] = 'value';

    if (node.type === 'object') {
      flowNodeType = 'object';
    } else if (node.type === 'array') {
      flowNodeType = 'array';
    }

    graph.setNode(toDagreNodeId(path), { width: 220, height: 92 });
    nodes.push({
      id: path,
      type: flowNodeType,
      position: { x: 0, y: 0 },
      data: {
        path,
        node,
        collapsed
      }
    });

    if (collapsed) {
      continue;
    }

    node.children.forEach((childPath: string): void => {
      edges.push({
        id: `${path || 'root'}->${childPath}`,
        source: path,
        target: childPath
      });
      queue.push(childPath);
      graph.setEdge(toDagreNodeId(path), toDagreNodeId(childPath), { weight: 1 });
    });
  }

  dagre.layout(graph);

  return {
    nodes: nodes.map((node: Node<JsonFlowNodeData>) => {
      const layoutNode = graph.node(toDagreNodeId(node.id));

      return {
        ...node,
        position: {
          x: layoutNode.x,
          y: layoutNode.y
        }
      };
    }),
    edges,
    graphState
  };
}
