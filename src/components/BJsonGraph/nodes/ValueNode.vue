<template>
  <div :class="['json-graph-node', 'json-graph-node--value', { 'json-graph-node--selected': selected }]" @click.stop="emit('node-click', data.path)">
    <div class="json-graph-node__key">{{ data.node.key || data.path || 'value' }}</div>
    <div class="json-graph-node__value" :style="{ color: colorVar }">{{ formattedValue }}</div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file ValueNode.vue
 * @description JSON 叶子值节点。
 */

import type { JsonFlowNodeData } from '../hooks/useGraphLayout';
import { computed } from 'vue';

interface Props {
  /** Vue Flow 节点数据。 */
  data: JsonFlowNodeData;
  /** 当前是否选中。 */
  selected?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** 节点点击。 */
  (e: 'node-click', path: string): void;
}>();

/**
 * 根据值类型选择变量色。
 */
const colorVar = computed<string>(() => `var(--json-node-${props.data.node.type})`);

/**
 * 格式化节点值。
 */
const formattedValue = computed<string>(() => JSON.stringify(props.data.node.value));
</script>

<style scoped lang="less">
.json-graph-node {
  min-width: 220px;
  padding: 14px;
  background: var(--json-node-bg);
  border: 1px solid var(--json-node-border);
  border-radius: 14px;
  box-shadow: 0 10px 30px rgb(15 23 42 / 8%);
}

.json-graph-node--selected {
  border-color: var(--json-node-selected-border);
  box-shadow: 0 0 0 2px rgb(29 78 216 / 12%);
}

.json-graph-node__key {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--json-node-null);
}

.json-graph-node__value {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-all;
}
</style>
