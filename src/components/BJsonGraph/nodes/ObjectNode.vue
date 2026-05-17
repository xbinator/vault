<template>
  <div :class="['json-graph-node', 'json-graph-node--object', { 'json-graph-node--selected': selected }]" @click.stop="emit('node-click', data.path)">
    <div class="json-graph-node__header">
      <strong class="json-graph-node__title">{{ data.node.key || 'root' }}</strong>
      <span class="json-graph-node__badge">{ }</span>
      <button class="json-graph-node__toggle" type="button" @click.stop="emit('toggle-collapse', data.path)">
        {{ data.collapsed ? '展开' : '折叠' }}
      </button>
    </div>
    <div class="json-graph-node__meta">{{ data.node.children.length }} keys</div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file ObjectNode.vue
 * @description JSON 对象节点。
 */

import type { JsonFlowNodeData } from '../hooks/useGraphLayout';

interface Props {
  /** Vue Flow 节点数据。 */
  data: JsonFlowNodeData;
  /** 当前是否选中。 */
  selected?: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  /** 节点点击。 */
  (e: 'node-click', path: string): void;
  /** 折叠切换。 */
  (e: 'toggle-collapse', path: string): void;
}>();
</script>

<style scoped lang="less">
.json-graph-node {
  min-width: 220px;
  padding: 14px;
  background: var(--json-node-bg);
  border: 1px solid var(--json-node-border);
  border-radius: 14px;
  box-shadow: 0 10px 30px rgb(15 23 42 / 8%);
  transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease;

  &:hover {
    background: var(--json-node-hover-bg);
    transform: translateY(-1px);
  }
}

.json-graph-node--object {
  border-color: var(--json-node-object);
}

.json-graph-node--selected {
  border-color: var(--json-node-selected-border);
  box-shadow: 0 0 0 2px rgb(29 78 216 / 12%);
}

.json-graph-node__header {
  display: flex;
  gap: 8px;
  align-items: center;
}

.json-graph-node__title {
  flex: 1;
  color: var(--json-node-text);
}

.json-graph-node__badge {
  color: var(--json-node-object);
}

.json-graph-node__meta {
  margin-top: 10px;
  font-size: 12px;
  color: var(--json-node-null);
}

.json-graph-node__toggle {
  padding: 2px 8px;
  font-size: 12px;
  color: var(--json-node-text);
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--json-node-border);
  border-radius: 999px;
}
</style>
