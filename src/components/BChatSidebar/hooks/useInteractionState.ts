/**
 * @file useInteractionState.ts
 * @description 交互容器状态管理 hook，提供 Toast 和 Confirm 的显示逻辑
 */
import type { ToastOptions, ToastItem, ConfirmOptions, ConfirmState, InteractionAPI } from '../components/InteractionContainer/types';
import { ref } from 'vue';

/**
 * 交互容器状态管理
 * @param options - 配置选项
 * @returns 交互 API 和状态
 */
export function useInteractionState(options?: { maxToastCount?: number; defaultDuration?: number }) {
  const maxToastCount = options?.maxToastCount ?? 3;
  const defaultDuration = options?.defaultDuration ?? 3000;

  /** Toast 队列 */
  const toastQueue = ref<ToastItem[]>([]);

  /** Confirm 对话框状态 */
  const confirmState = ref<ConfirmState | null>(null);

  /**
   * 显示 Toast 提示
   * @param toastOptions - Toast 选项
   */
  function showToast(toastOptions: ToastOptions): void {
    const toast: ToastItem = {
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: toastOptions.type,
      content: toastOptions.content,
      duration: toastOptions.duration ?? defaultDuration,
      createdAt: Date.now()
    };

    toastQueue.value.push(toast);

    // 超出最大数量时，移除最早的
    if (toastQueue.value.length > maxToastCount) {
      toastQueue.value.shift();
    }
  }

  /**
   * 显示确认对话框
   * @param confirmOptions - 确认对话框选项
   * @returns Promise<boolean> - 用户确认返回 true，取消返回 false
   */
  function showConfirm(confirmOptions: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      confirmState.value = {
        visible: true,
        options: confirmOptions,
        resolve
      };
    });
  }

  /**
   * 移除 Toast
   * @param id - Toast ID
   */
  function removeToast(id: string): void {
    const index = toastQueue.value.findIndex((t) => t.id === id);
    if (index > -1) {
      toastQueue.value.splice(index, 1);
    }
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

  /** 交互 API */
  const api: InteractionAPI = {
    showToast,
    showConfirm
  };

  return {
    api,
    toastQueue,
    confirmState,
    removeToast,
    handleConfirm,
    handleCancel
  };
}
