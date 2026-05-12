/**
 * @file useTagWebView.test.ts
 * @description 验证 `<webview>` 页面状态收敛逻辑。
 */

import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useTagWebView } from '@/views/webview/web/hooks/useTagWebView';

describe('useTagWebView', () => {
  it('maps webview DOM events into shared state', () => {
    const instance = {
      canGoBack: () => true,
      canGoForward: () => false
    } as unknown as Electron.WebviewTag;

    const hook = useTagWebView(ref(instance));

    hook.handleDidStartLoading();
    hook.handleDomReady();
    hook.handleDidNavigate({ url: 'https://example.com' } as Electron.DidNavigateEvent);
    hook.handleTitleUpdated({ title: 'Example Domain' } as Electron.PageTitleUpdatedEvent);
    hook.handleDidStopLoading();

    expect(hook.state.value.isLoading).toBe(false);
    expect(hook.state.value.loadProgress).toBe(1);
    expect(hook.state.value.url).toBe('https://example.com');
    expect(hook.state.value.title).toBe('Example Domain');
    expect(hook.state.value.canGoBack).toBe(true);
    expect(hook.state.value.canGoForward).toBe(false);
  });
});
