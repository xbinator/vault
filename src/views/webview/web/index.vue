<template>
  <div class="webview-shell">
    <AddressBar
      :url="webview.state.value.url"
      :can-go-back="webview.state.value.canGoBack"
      :can-go-forward="webview.state.value.canGoForward"
      :is-loading="webview.state.value.isLoading"
      @go-back="webview.goBack"
      @go-forward="webview.goForward"
      @reload="webview.reload"
      @stop="webview.stop"
      @submit-url="handleSubmitUrl"
      @open-in-browser="openInBrowser"
    />

    <!-- eslint-disable-next-line vue/component-name-in-template-casing -->
    <webview
      ref="webviewElementRef"
      class="webview-content"
      :src="webview.state.value.url"
      allowpopups="false"
      @did-start-loading="webview.handleDidStartLoading"
      @dom-ready="webview.handleDomReady"
      @did-navigate="webview.handleDidNavigate"
      @did-navigate-in-page="webview.handleDidNavigate"
      @page-title-updated="webview.handleTitleUpdated"
      @did-stop-loading="webview.handleDidStopLoading"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @file index.vue
 * @description `<webview>` 标签页面入口。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { native } from '@/shared/platform';
import AddressBar from '@/views/webview/shared/components/AddressBar.vue';
import { useWebviewTabTitle } from '@/views/webview/shared/hooks/useWebviewTabTitle';
import { normalizeWebviewUrl } from '@/views/webview/shared/utils/url';
import { useTagWebView } from './hooks/useTagWebView';

const route = useRoute();
const webviewElementRef = ref<Electron.WebviewTag | null>(null);
const initialUrl = computed(() => normalizeWebviewUrl(decodeURIComponent((route.query.url as string) || '')));
const webview = useTagWebView(webviewElementRef);

const offAttachRejected = window.electronAPI?.webview.onAttachRejected((payload) => {
  if (payload.src !== webview.state.value.url) {
    return;
  }

  webview.handleAttachRejected(payload);
});

/**
 * 在系统浏览器中打开当前 URL。
 */
async function openInBrowser(): Promise<void> {
  if (!webview.state.value.url) {
    return;
  }

  await native.openExternal(webview.state.value.url);
}

/**
 * 处理地址栏提交的 URL。
 * @param value - 用户输入的 URL
 */
function handleSubmitUrl(value: string): void {
  webview.navigate(normalizeWebviewUrl(value));
}

useWebviewTabTitle({
  routeFullPath: route.fullPath,
  title: computed(() => webview.state.value.title)
});

onMounted(() => {
  webview.create(initialUrl.value);
});

onBeforeUnmount(() => {
  offAttachRejected?.();
});
</script>

<style scoped>
.webview-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
  border-radius: 8px;
}

.webview-content {
  flex: 1;
  width: 100%;
  border: 0;
}
</style>
