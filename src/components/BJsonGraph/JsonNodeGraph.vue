<template>
  <div class="b-json-node-graph">
    <div v-if="error" class="b-json-node-graph__error">
      <strong>JSON 解析失败</strong>
      <pre>{{ error.message }}</pre>
    </div>
    <VueFlow
      v-else
      class="b-json-node-graph__flow"
      :nodes="flowNodes"
      :edges="flowEdges"
      :node-types="nodeTypes"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="true"
      :fit-view-on-init="true"
    >
      <Background />
      <MiniMap />
      <Controls />
      <template #node-object="nodeProps">
        <ObjectNode v-bind="nodeProps" @node-click="emit('node-click', $event)" @toggle-collapse="emit('toggle-collapse', $event)" />
      </template>
      <template #node-array="nodeProps">
        <ArrayNode v-bind="nodeProps" @node-click="emit('node-click', $event)" @toggle-collapse="emit('toggle-collapse', $event)" />
      </template>
      <template #node-value="nodeProps">
        <ValueNode v-bind="nodeProps" @node-click="emit('node-click', $event)" />
      </template>
    </VueFlow>
    <div v-if="autoCollapsedCount > 0" class="b-json-node-graph__hint">已自动折叠 {{ autoCollapsedCount }} 个分支以降低图复杂度。</div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file JsonNodeGraph.vue
 * @description JSON 节点图渲染组件。
 */

import type { JsonFlowNodeData } from './hooks/useGraphLayout';
import type { Edge, Node, NodeTypesObject } from '@vue-flow/core';
import { computed, markRaw } from 'vue';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { VueFlow } from '@vue-flow/core';
import { MiniMap } from '@vue-flow/minimap';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import ArrayNode from './nodes/ArrayNode.vue';
import ObjectNode from './nodes/ObjectNode.vue';
import ValueNode from './nodes/ValueNode.vue';

interface Props {
  /** 节点列表。 */
  nodes: Node<JsonFlowNodeData>[];
  /** 边列表。 */
  edges: Edge[];
  /** 解析错误。 */
  error: Error | null;
  /** 当前选中路径。 */
  selectedPath: string | null;
  /** 自动折叠数量。 */
  autoCollapsedCount?: number;
}

const props = withDefaults(defineProps<Props>(), {
  autoCollapsedCount: 0
});

const emit = defineEmits<{
  /** 节点点击。 */
  (e: 'node-click', path: string): void;
  /** 折叠切换。 */
  (e: 'toggle-collapse', path: string): void;
}>();

/** 自定义节点注册表。 */
const nodeTypes = markRaw({
  object: markRaw(ObjectNode),
  array: markRaw(ArrayNode),
  value: markRaw(ValueNode)
}) as unknown as NodeTypesObject;

/**
 * 为 Vue Flow 适配根节点 id，并注入选中态。
 */
const flowNodes = computed<Node<JsonFlowNodeData>[]>(() =>
  props.nodes.map((node: Node<JsonFlowNodeData>) => ({
    ...node,
    id: node.id || '__json_root__',
    selected: props.selectedPath === node.data?.path
  }))
);

/**
 * 为 Vue Flow 适配根节点边 id。
 */
const flowEdges = computed<Edge[]>(() =>
  props.edges.map((edge: Edge) => ({
    ...edge,
    source: edge.source || '__json_root__',
    target: edge.target || '__json_root__'
  }))
);
</script>

<style scoped lang="less">
.b-json-node-graph {
  position: relative;
  height: 100%;
  overflow: hidden;
  background: radial-gradient(circle at top right, rgb(62 123 250 / 12%), transparent 30%),
    linear-gradient(180deg, rgb(248 250 252 / 92%), rgb(241 245 249 / 84%));
}

.b-json-node-graph__flow {
  height: 100%;
}

.b-json-node-graph__error {
  padding: 20px;
  color: #b42318;

  pre {
    white-space: pre-wrap;
  }
}

.b-json-node-graph__hint {
  position: absolute;
  right: 16px;
  bottom: 16px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--json-node-text);
  background: rgb(255 255 255 / 88%);
  border: 1px solid var(--json-node-border);
  border-radius: 999px;
  backdrop-filter: blur(10px);
}
</style>
