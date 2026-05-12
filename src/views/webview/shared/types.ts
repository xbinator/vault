/**
 * @file types.ts
 * @description WebView 页面共享类型定义。
 */
import type { Ref } from 'vue';

/**
 * WebView 页面状态。
 */
export interface WebviewPageState {
  /** 当前地址 */
  url: string;
  /** 页面标题 */
  title: string;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 是否可以后退 */
  canGoBack: boolean;
  /** 是否可以前进 */
  canGoForward: boolean;
  /** 近似加载进度 */
  loadProgress: number;
}

/**
 * 跨实现共享的最小控制接口。
 */
export interface WebviewController {
  /** 响应式页面状态 */
  state: Ref<WebviewPageState>;
  /** 初始化或创建 WebView */
  create(initialUrl: string): Promise<void> | void;
  /** 导航到目标地址 */
  navigate(url: string): Promise<void> | void;
  /** 后退 */
  goBack(): Promise<void> | void;
  /** 前进 */
  goForward(): Promise<void> | void;
  /** 刷新 */
  reload(): Promise<void> | void;
  /** 停止加载 */
  stop(): Promise<void> | void;
}

/**
 * WebView 标题同步参数。
 */
export interface WebviewTabTitleOptions {
  /** 当前页面完整路由 */
  routeFullPath: string;
  /** 当前页面标题 */
  title: Ref<string>;
}
