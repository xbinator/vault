<template>
  <BMessage :content="part.text" type="markdown" :loading="loading" />
</template>

<script setup lang="ts">
/**
 * @file MessageBubblePartText.vue
 * @description 聊天文本片段组件，负责渲染 Markdown 文本内容。
 */
import type { ChatMessageTextPart } from 'types/chat';
import BMessage from '@/components/BMessage/index.vue';

defineOptions({ name: 'MessageBubblePartText' });

defineProps<{
  /** 文本片段 */
  part: ChatMessageTextPart;
  /** 是否展示加载态 */
  loading: boolean;
}>();
</script>
