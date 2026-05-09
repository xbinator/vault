<!--
  @file index.vue
  @description 交互容器主组件，管理 Toast 和 Confirm 的显示
-->
<template>
  <div class="interaction-container">
    <div v-if="toastQueue.length > 0" class="toast-stack">
      <ToastItem
        v-for="toast in toastQueue"
        :id="toast.id"
        :key="toast.id"
        :type="toast.type"
        :content="toast.content"
        :duration="toast.duration"
        :shake="toast.shake"
        @close="removeToast"
      />
    </div>

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
import type { ToastItem as ToastItemType, ConfirmState } from './types';
import ConfirmModal from './ConfirmModal.vue';
import ToastItem from './ToastItem.vue';

/**
 * InteractionContainer 属性
 */
interface Props {
  /** Toast 队列 */
  toastQueue: ToastItemType[];
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
}

.toast-stack {
  position: absolute;
  inset: auto 16px 16px;
  z-index: 1000;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}
</style>
