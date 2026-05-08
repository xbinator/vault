<!--
  @file BubblePartCompression.vue
  @description 压缩消息片段，展示压缩状态与摘要内容。
-->
<template>
  <div class="bubble-part-compression">
    <div class="bubble-part-compression__header">
      <span class="bubble-part-compression__badge">{{ statusLabel }}</span>
    </div>
    <div class="bubble-part-compression__text">{{ summaryText }}</div>
    <div v-if="errorText" class="bubble-part-compression__error">{{ errorText }}</div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file BubblePartCompression.vue
 * @description 压缩消息片段，展示压缩状态与摘要内容。
 */
import type { Message } from '../../utils/types';
import { computed } from 'vue';

/**
 * 组件属性。
 */
interface Props {
  /** 压缩消息 */
  message: Message;
}

const props = defineProps<Props>();

/**
 * 压缩状态文案。
 */
const statusLabel = computed<string>(() => {
  if (props.message.compression?.status === 'pending') {
    return '正在压缩';
  }

  if (props.message.compression?.status === 'failed') {
    return '压缩失败';
  }

  return '上下文已压缩';
});

/**
 * 压缩摘要文本。
 */
const summaryText = computed<string>(() => {
  return props.message.compression?.summaryText || props.message.content || '压缩结果不可用';
});

/**
 * 压缩失败错误信息。
 */
const errorText = computed<string | undefined>(() => {
  return props.message.compression?.status === 'failed' ? props.message.compression.errorMessage : undefined;
});
</script>

<style scoped lang="less">
.bubble-part-compression {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bubble-part-compression__header {
  display: flex;
  align-items: center;
}

.bubble-part-compression__badge {
  padding: 2px 8px;
  font-size: 11px;
  color: var(--color-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 999px;
}

.bubble-part-compression__text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.bubble-part-compression__error {
  font-size: 12px;
  color: var(--error-color);
}
</style>
