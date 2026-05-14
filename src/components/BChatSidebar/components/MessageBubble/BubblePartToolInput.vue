<template>
  <BubblePart type="tool-input" :has-content="hasContent" :default-collapsed="false">
    <template #title>
      <Icon icon="lucide:loader-circle" width="14" height="14" :class="bem('icon')" />
      <span :class="bem('title')">{{ title }}</span>
    </template>

    <BubblePartToolCode v-if="hasContent" :value="previewValue" />
  </BubblePart>
</template>

<script setup lang="ts">
/**
 * @file BubblePartToolInput.vue
 * @description 聊天工具输入预览片段组件，在最终 tool-call 到达前展示路径和内容流式预览。
 */
import type { ChatMessageToolInputPart } from 'types/chat';
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { createNamespace } from '@/utils/namespace';
import { hasStructuredValueContent } from '../../utils/messagePart';
import BubblePart from './BubblePart.vue';
import BubblePartToolCode from './BubblePartToolCode.vue';

defineOptions({ name: 'BubblePartToolInput' });

interface Props {
  /** 工具输入预览片段 */
  part: ChatMessageToolInputPart;
}

const props = withDefaults(defineProps<Props>(), {});
const [, bem] = createNamespace('', 'message-bubble-tool-input');

/**
 * 判断值是否为普通对象。
 * @param value - 待判断值
 * @returns 是否为普通对象
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 已解析的目标路径 */
const pathPreview = computed(() => {
  if (!isPlainRecord(props.part.input)) {
    return null;
  }

  return typeof props.part.input.path === 'string' && props.part.input.path.trim() ? props.part.input.path : null;
});

/** 已解析的内容预览 */
const contentPreview = computed(() => {
  if (!isPlainRecord(props.part.input)) {
    return null;
  }

  return typeof props.part.input.content === 'string' ? props.part.input.content : null;
});

/** 标题文案 */
const title = computed(() => {
  if (props.part.toolName === 'write_file') {
    return pathPreview.value ? `准备写入文件：${pathPreview.value}` : '正在准备写入文件';
  }

  return `正在准备调用工具：${props.part.toolName}`;
});

/** 预览展示内容 */
const previewValue = computed(() => {
  if (props.part.toolName === 'write_file' && contentPreview.value !== null) {
    return contentPreview.value;
  }

  if (props.part.input !== undefined) {
    return props.part.input;
  }

  return props.part.inputText;
});

/** 是否有可展示内容 */
const hasContent = computed(() => hasStructuredValueContent(previewValue.value));
</script>

<style scoped lang="less">
.message-bubble-tool-input__icon {
  animation: message-bubble-tool-input-spin 1.2s linear infinite;
}

.message-bubble-tool-input__title {
  flex: 1;
}

@keyframes message-bubble-tool-input-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
