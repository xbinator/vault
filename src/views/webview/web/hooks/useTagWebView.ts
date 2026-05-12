/**
 * @file useTagWebView.ts
 * @description 封装 `<webview>` 标签页面状态与导航控制。
 */
import { ref, type Ref } from 'vue';
import type { WebviewController, WebviewPageState } from '@/views/webview/shared/types';

/**
 * 默认 WebView 页面状态。
 */
const DEFAULT_STATE: WebviewPageState = {
  url: '',
  title: '',
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  loadProgress: 0
};

/**
 * 创建 `<webview>` 标签控制器。
 * @param webviewRef - `<webview>` 实例引用
 * @returns `<webview>` 控制器与事件处理器
 */
export function useTagWebView(webviewRef: Ref<Electron.WebviewTag | null>) {
  const state = ref<WebviewPageState>({ ...DEFAULT_STATE });

  /**
   * 从当前 `<webview>` 实例同步导航状态。
   */
  function syncNavigationState(): void {
    const instance = webviewRef.value;
    if (!instance) {
      return;
    }

    state.value.canGoBack = instance.canGoBack();
    state.value.canGoForward = instance.canGoForward();
  }

  /**
   * 初始化 `<webview>` 地址。
   * @param initialUrl - 初始 URL
   */
  function create(initialUrl: string): void {
    state.value.url = initialUrl;
  }

  /**
   * 导航到新地址。
   * @param url - 目标 URL
   */
  function navigate(url: string): void {
    state.value.url = url;
    webviewRef.value?.loadURL(url);
  }

  /**
   * 后退。
   */
  function goBack(): void {
    webviewRef.value?.goBack();
    syncNavigationState();
  }

  /**
   * 前进。
   */
  function goForward(): void {
    webviewRef.value?.goForward();
    syncNavigationState();
  }

  /**
   * 刷新当前页面。
   */
  function reload(): void {
    webviewRef.value?.reload();
  }

  /**
   * 停止当前加载。
   */
  function stop(): void {
    webviewRef.value?.stop();
  }

  /**
   * 处理开始加载事件。
   */
  function handleDidStartLoading(): void {
    state.value.isLoading = true;
    state.value.loadProgress = 0.1;
  }

  /**
   * 处理 DOM 就绪事件。
   */
  function handleDomReady(): void {
    state.value.loadProgress = 0.7;
    syncNavigationState();
  }

  /**
   * 处理导航事件。
   * @param event - 导航事件
   */
  function handleDidNavigate(event: Electron.DidNavigateEvent): void {
    state.value.url = event.url;
    syncNavigationState();
  }

  /**
   * 处理标题更新事件。
   * @param event - 标题事件
   */
  function handleTitleUpdated(event: Electron.PageTitleUpdatedEvent): void {
    state.value.title = event.title;
  }

  /**
   * 处理停止加载事件。
   */
  function handleDidStopLoading(): void {
    state.value.isLoading = false;
    state.value.loadProgress = 1;
    syncNavigationState();
  }

  /**
   * 处理宿主拒绝附加 `<webview>` 的事件。
   * @param payload - 拒绝信息
   */
  function handleAttachRejected(payload: { src: string; reason: string }): void {
    state.value.isLoading = false;
    console.error(`Webview attach rejected for ${payload.src}: ${payload.reason}`);
  }

  const controller: WebviewController = {
    state,
    create,
    navigate,
    goBack,
    goForward,
    reload,
    stop
  };

  return {
    ...controller,
    handleDidStartLoading,
    handleDomReady,
    handleDidNavigate,
    handleTitleUpdated,
    handleDidStopLoading,
    handleAttachRejected
  };
}
