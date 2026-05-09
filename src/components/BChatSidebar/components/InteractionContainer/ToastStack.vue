<!--
  @file ToastStack.vue
  @description Toast 提示堆叠组件，管理多个 Toast 的显示和移除
-->
<template>
  <TransitionGroup name="toast" tag="div" class="toast-stack">
    <ToastItem
      v-for="toast in toasts"
      :id="toast.id"
      :key="toast.id"
      :content="toast.content"
      :duration="toast.duration"
      :type="toast.type"
      @close="handleClose"
    />
  </TransitionGroup>
</template>

<script setup lang="ts">
import type { ToastItem as ToastItemType } from './types';
import { ref } from 'vue';
import ToastItem from './ToastItem.vue';

/**
 * ToastStack 属性
 */
interface Props {
  /** 最大显示数量 */
  maxCount?: number;
}

const props = withDefaults(defineProps<Props>(), {
  maxCount: 3
});

const emit = defineEmits<{
  (e: 'remove', id: string): void;
}>();

/** Toast 队列 */
const toasts = ref<ToastItemType[]>([]);

/**
 * 添加 Toast
 * @param toast - Toast 项
 */
function addToast(toast: ToastItemType): void {
  toasts.value.push(toast);

  // 超出最大数量时，移除最早的
  if (toasts.value.length > props.maxCount) {
    const removed = toasts.value.shift();
    if (removed) {
      emit('remove', removed.id);
    }
  }
}

/**
 * 移除 Toast
 * @param id - Toast ID
 */
function removeToast(id: string): void {
  const index = toasts.value.findIndex((t) => t.id === id);
  if (index > -1) {
    toasts.value.splice(index, 1);
    emit('remove', id);
  }
}

/**
 * 处理 Toast 关闭事件
 * @param id - Toast ID
 */
function handleClose(id: string): void {
  removeToast(id);
}

/**
 * 清空所有 Toast
 */
function clearAll(): void {
  toasts.value = [];
}

defineExpose({
  addToast,
  removeToast,
  clearAll
});
</script>

<style scoped lang="less">
.toast-stack {
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  width: 100%;
}

/* Toast 进入动画 */
.toast-enter-active {
  animation: toast-in 0.3s ease;
}

/* Toast 离开动画 */
.toast-leave-active {
  animation: toast-out 0.3s ease;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes toast-out {
  from {
    opacity: 1;
    transform: translateY(0);
  }

  to {
    opacity: 0;
    transform: translateY(-10px);
  }
}
</style>
