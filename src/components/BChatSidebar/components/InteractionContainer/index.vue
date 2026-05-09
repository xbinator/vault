<!--
  @file index.vue
  @description 交互容器主组件，管理 Toast 和 Confirm 的显示
-->
<template>
  <template v-if="toastQueue.length">
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
  </template>

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

<style scoped lang="less"></style>
