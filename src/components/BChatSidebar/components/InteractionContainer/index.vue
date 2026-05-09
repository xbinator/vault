<!--
  @file index.vue
  @description 交互容器主组件，管理 Toast 和 Confirm 的显示
-->
<template>
  <div class="interaction-container">
    <TransitionGroup name="toast" tag="div" class="toast-stack">
      <ToastItem
        v-for="toast in toastQueue"
        :key="toast.id"
        :id="toast.id"
        :type="toast.type"
        :content="toast.content"
        :duration="toast.duration"
        @close="removeToast"
      />
    </TransitionGroup>

    <ConfirmModal
      :visible="confirmState?.visible ?? false"
      :title="confirmState?.options.title"
      :content="confirmState?.options.content ?? ''"
      :confirm-text="confirmState?.options.confirmText"
      :cancel-text="confirmState?.options.cancelText"
      :danger="confirmState?.options.danger"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />
  </div>
</template>

<script setup lang="ts">
import type { ToastItem, ConfirmState } from './types';
import ConfirmModal from './ConfirmModal.vue';
import ToastItem from './ToastItem.vue';

/**
 * InteractionContainer 属性
 */
interface Props {
  /** Toast 队列 */
  toastQueue: ToastItem[];
  /** Confirm 对话框状态 */
  confirmState: ConfirmState | null;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: 'removeToast', id: string): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

/**
 * 移除 Toast
 * @param id - Toast ID
 */
function removeToast(id: string): void {
  emit('removeToast', id);
}

/**
 * 处理确认按钮点击
 */
function handleConfirm(): void {
  emit('confirm');
}

/**
 * 处理取消按钮点击
 */
function handleCancel(): void {
  emit('cancel');
}
</script>

<style scoped lang="less">
.interaction-container {
  position: relative;
  width: 100%;
  padding: 0 12px 12px;
}

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
