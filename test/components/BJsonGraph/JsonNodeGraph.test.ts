/**
 * @file JsonNodeGraph.test.ts
 * @description JsonNodeGraph 根节点映射测试。
 * @vitest-environment jsdom
 */

import type { Edge, Node } from '@vue-flow/core';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { JsonFlowNodeData } from '@/components/BJsonGraph/hooks/useGraphLayout';
import JsonNodeGraph from '@/components/BJsonGraph/JsonNodeGraph.vue';

const vueFlowPropsSpy = vi.hoisted(() => vi.fn());

describe('JsonNodeGraph', () => {
  it('remaps root node and root edges to the internal vue-flow id', () => {
    const nodes: Node<JsonFlowNodeData>[] = [
      {
        id: '',
        position: { x: 0, y: 0 },
        type: 'object',
        data: {
          path: '',
          collapsed: false,
          node: {
            path: '',
            type: 'object',
            startOffset: 0,
            endOffset: 10,
            valueStartOffset: 0,
            valueEndOffset: 10,
            children: ['/author']
          }
        }
      }
    ];
    const edges: Edge[] = [
      {
        id: 'root->/author',
        source: '',
        target: '/author'
      }
    ];

    mount(JsonNodeGraph, {
      props: {
        nodes,
        edges,
        error: null,
        selectedPath: null
      },
      global: {
        stubs: {
          VueFlow: defineComponent({
            name: 'VueFlowStub',
            props: {
              nodes: { type: Array, required: true },
              edges: { type: Array, required: true }
            },
            setup(props, { slots }) {
              vueFlowPropsSpy({
                nodes: props.nodes,
                edges: props.edges
              });
              return () => h('div', slots.default?.());
            }
          }),
          Background: true,
          Controls: true,
          MiniMap: true
        }
      }
    });

    const received = vueFlowPropsSpy.mock.calls.at(-1)?.[0] as { nodes: Node[]; edges: Edge[] };

    expect(received.nodes[0]?.id).toBe('__json_root__');
    expect(received.edges[0]?.source).toBe('__json_root__');
  });
});
