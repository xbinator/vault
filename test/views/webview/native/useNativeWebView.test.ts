/**
 * @file useNativeWebView.test.ts
 * @description 验证 native WebView hook 的 IPC 状态收敛逻辑。
 */

import { effectScope, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const onStateChanged = vi.fn();
const onTitleUpdated = vi.fn();
const onNavigationStateChanged = vi.fn();

vi.stubGlobal('window', {
  electronAPI: {
    webview: {
      create: vi.fn(),
      destroy: vi.fn(),
      navigate: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      stop: vi.fn(),
      setBounds: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      onStateChanged,
      onTitleUpdated,
      onNavigationStateChanged
    }
  }
});

describe('useNativeWebView', () => {
  beforeEach(() => {
    vi.resetModules();
    onStateChanged.mockReturnValue(() => undefined);
    onTitleUpdated.mockReturnValue(() => undefined);
    onNavigationStateChanged.mockReturnValue(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps IPC state into shared page state', async () => {
    const scope = effectScope();

    await scope.run(async () => {
      const { useNativeWebView } = await import('@/views/webview/native/hooks/useNativeWebView');
      const hook = useNativeWebView(ref('native-tab'));

      const stateHandler = onStateChanged.mock.calls[0]?.[0] as (id: string, state: { isLoading: boolean; loadProgress: number; url?: string }) => void;
      const titleHandler = onTitleUpdated.mock.calls[0]?.[0] as (id: string, title: string) => void;
      const navHandler = onNavigationStateChanged.mock.calls[0]?.[0] as (id: string, canGoBack: boolean, canGoForward: boolean) => void;

      stateHandler('native-tab', { isLoading: true, loadProgress: 0.2, url: 'https://example.com' });
      titleHandler('native-tab', 'Example Domain');
      navHandler('native-tab', true, false);

      expect(hook.state.value.url).toBe('https://example.com');
      expect(hook.state.value.isLoading).toBe(true);
      expect(hook.state.value.loadProgress).toBe(0.2);
      expect(hook.state.value.title).toBe('Example Domain');
      expect(hook.state.value.canGoBack).toBe(true);
      expect(hook.state.value.canGoForward).toBe(false);
    });

    scope.stop();
  });
});
