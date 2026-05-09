/**
 * @file types.ts
 * @description 交互容器的类型定义
 */

/**
 * Toast 提示类型
 */
export type ToastType = 'error' | 'warning' | 'info' | 'success';

/**
 * Toast 提示选项
 */
export interface ToastOptions {
  /** 提示类型 */
  type: ToastType;
  /** 提示内容 */
  content: string;
  /** 持续时间（毫秒），默认 3000ms */
  duration?: number;
  /** 业务唯一标识（可选），相同 key 的 toast 不会重复显示，而是抖动提示 */
  key?: string;
}

/**
 * Toast 提示项
 */
export interface ToastItem {
  /** 唯一标识 */
  id: string;
  /** 提示类型 */
  type: ToastType;
  /** 提示内容 */
  content: string;
  /** 持续时间（毫秒） */
  duration: number;
  /** 创建时间戳 */
  createdAt: number;
  /** 业务唯一标识（可选） */
  key?: string;
  /** 是否需要抖动动画 */
  shake?: boolean;
}

/**
 * 确认对话框选项
 */
export interface ConfirmOptions {
  /** 对话框标题 */
  title?: string;
  /** 对话框内容 */
  content: string;
  /** 确认按钮文本 */
  confirmText?: string;
  /** 取消按钮文本 */
  cancelText?: string;
  /** 是否为危险操作（红色确认按钮） */
  danger?: boolean;
}

/**
 * 确认对话框状态
 */
export interface ConfirmState {
  /** 是否显示 */
  visible: boolean;
  /** 对话框选项 */
  options: ConfirmOptions;
  /** Promise resolve 函数 */
  resolve: (value: boolean) => void;
}

/**
 * 交互 API
 */
export interface InteractionAPI {
  /** 显示 Toast 提示 */
  showToast: (options: ToastOptions) => void;
  /** 显示确认对话框 */
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
}
