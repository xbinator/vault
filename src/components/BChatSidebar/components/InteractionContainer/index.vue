<!--
  @file index.vue
  @description 交互容器主组件，管理 Toast 和 Confirm 的显示
-->
<template>
  <div class="interaction-container">
    <ToastStack ref="toastStackRef" :max-count="maxToastCount" />
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
import type { ToastOptions, ToastItem, ConfirmOptions, ConfirmState, InteractionAPI } from './types';
import { provide, ref } from 'vue';
import ConfirmModal from './ConfirmModal.vue';
import ToastStack from './ToastStack.vue';

/**
 * InteractionContainer 属性
 */
interface Props {
  /** 最大 Toast 显示数量 */
  maxToastCount?: number;
  /** 默认 Toast 持续时间（毫秒） */
  defaultDuration?: number;
}

const props = withDefaults(defineProps<Props>(), {
  maxToastCount: 3,
  defaultDuration: 3000
});

/** ToastStack 组件引用 */
const toastStackRef = ref<InstanceType<typeof ToastStack>>();

/** Confirm 对话框状态 */
const confirmState = ref<ConfirmState | null>(null);

/**
 * 显示 Toast 提示
 * @param options - Toast 选项
 */
function showToast(options: ToastOptions): void {
  const toast: ToastItem = {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: options.type,
    content: options.content,
    duration: options.duration ?? props.defaultDuration,
    createdAt: Date.now()
  };

  toastStackRef.value?.addToast(toast);
}

/**
 * 显示确认对话框
 * @param options - 确认对话框选项
 * @returns Promise<boolean> - 用户确认返回 true，取消返回 false
 */
function showConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState.value = {
      visible: true,
      options,
      resolve
    };
  });
}

/**
 * 处理确认按钮点击
 */
function handleConfirm(): void {
  if (confirmState.value) {
    confirmState.value.resolve(true);
    confirmState.value.visible = false;

    // 延迟清除状态，等待动画完成
    setTimeout(() => {
      confirmState.value = null;
    }, 300);
  }
}

/**
 * 处理取消按钮点击
 */
function handleCancel(): void {
  if (confirmState.value) {
    confirmState.value.resolve(false);
    confirmState.value.visible = false;

    // 延迟清除状态，等待动画完成
    setTimeout(() => {
      confirmState.value = null;
    }, 300);
  }
}

/** 提供交互 API */
provide<InteractionAPI>('interaction', {
  showToast,
  showConfirm
});
</script>

<style scoped lang="less">
.interaction-container {
  position: relative;
  width: 100%;
  padding: 0 12px 12px;
}
</style>
