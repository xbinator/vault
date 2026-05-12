# WebView Dual Implementation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the existing `WebContentsView`-based WebView working while adding a separate `<webview>`-tag implementation with shared UI/state and explicit `native` / `web` routes.

**Architecture:** Split `src/views/webview` into `shared`, `native`, and `web`. Keep `native` on the existing Electron IPC bridge, add host-level `webviewTag` security controls in the main process, and let the new `web` page map DOM events from `<webview>` into the same shared state model and toolbar behavior.

**Tech Stack:** Vue 3, Vue Router, Pinia, TypeScript, Electron, preload IPC bridge, Vitest, Vue Test Utils.

---

### Task 1: Extract shared WebView state, toolbar, and title-sync helpers

**Files:**
- Create: `src/views/webview/shared/types.ts`
- Create: `src/views/webview/shared/utils/url.ts`
- Create: `src/views/webview/shared/hooks/useWebviewTabTitle.ts`
- Create: `src/views/webview/shared/components/AddressBar.vue`
- Test: `test/views/webview/shared/url.test.ts`
- Test: `test/views/webview/shared/useWebviewTabTitle.test.ts`
- Reference: `src/views/webview/components/AddressBar.vue`
- Reference: `src/views/webview/index.vue`

- [ ] **Step 1: Write the failing shared helper tests**

Create `test/views/webview/shared/url.test.ts`:

```ts
/**
 * @file url.test.ts
 * @description 验证 WebView URL 标准化逻辑。
 */
import { describe, expect, it } from 'vitest';
import { normalizeWebviewUrl } from '@/views/webview/shared/utils/url';

describe('normalizeWebviewUrl', () => {
  it('keeps valid https urls unchanged', () => {
    expect(normalizeWebviewUrl('https://example.com')).toBe('https://example.com');
  });

  it('adds https protocol when protocol is missing', () => {
    expect(normalizeWebviewUrl('example.com/docs')).toBe('https://example.com/docs');
  });

  it('rejects unsupported protocols', () => {
    expect(() => normalizeWebviewUrl('file:///tmp/demo.html')).toThrowError('Unsupported webview URL protocol');
  });
});
```

Create `test/views/webview/shared/useWebviewTabTitle.test.ts`:

```ts
/**
 * @file useWebviewTabTitle.test.ts
 * @description 验证 WebView 标签页标题同步逻辑。
 */
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTabsStore } from '@/stores/tabs';
import { useWebviewTabTitle } from '@/views/webview/shared/hooks/useWebviewTabTitle';

describe('useWebviewTabTitle', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('updates the matching tab title when title changes', () => {
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: '/webview/native?url=https%3A%2F%2Fexample.com', path: '/webview/native?url=https%3A%2F%2Fexample.com', title: 'WebView' });
    const title = ref('');

    useWebviewTabTitle({
      routeFullPath: '/webview/native?url=https%3A%2F%2Fexample.com',
      title
    });

    title.value = 'Example Domain';

    expect(tabsStore.tabs[0]?.title).toBe('Example Domain');
  });

  it('ignores empty titles', () => {
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: '/webview/web?url=https%3A%2F%2Fexample.com', path: '/webview/web?url=https%3A%2F%2Fexample.com', title: 'WebView' });
    const title = ref('');

    useWebviewTabTitle({
      routeFullPath: '/webview/web?url=https%3A%2F%2Fexample.com',
      title
    });

    title.value = '';

    expect(tabsStore.tabs[0]?.title).toBe('WebView');
  });
});
```

- [ ] **Step 2: Run the new shared tests and confirm failure**

Run:

```bash
pnpm test -- test/views/webview/shared/url.test.ts test/views/webview/shared/useWebviewTabTitle.test.ts
```

Expected: `FAIL` because the shared files do not exist yet.

- [ ] **Step 3: Implement the shared state, URL helper, title hook, and toolbar**

Create `src/views/webview/shared/types.ts`:

```ts
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
```

Create `src/views/webview/shared/utils/url.ts`:

```ts
/**
 * @file url.ts
 * @description WebView URL 标准化工具。
 */

/**
 * 标准化 WebView URL，只允许 http/https。
 * @param rawUrl - 原始输入地址
 * @returns 标准化后的 URL 字符串
 */
export function normalizeWebviewUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return '';
  }

  const normalizedCandidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(normalizedCandidate);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Unsupported webview URL protocol');
  }

  return parsed.toString();
}
```

Create `src/views/webview/shared/hooks/useWebviewTabTitle.ts`:

```ts
/**
 * @file useWebviewTabTitle.ts
 * @description 同步 WebView 页面标题到 tabsStore。
 */
import { watch } from 'vue';
import { useTabsStore } from '@/stores/tabs';
import type { WebviewTabTitleOptions } from '../types';

/**
 * 监听 WebView 标题并更新当前标签页名称。
 * @param options - 标题同步参数
 */
export function useWebviewTabTitle(options: WebviewTabTitleOptions): void {
  const tabsStore = useTabsStore();

  watch(
    options.title,
    (title: string) => {
      if (!title) {
        return;
      }

      tabsStore.updateTabTitle({
        id: options.routeFullPath,
        title
      });
    },
    {
      immediate: true
    }
  );
}
```

Create `src/views/webview/shared/components/AddressBar.vue`:

```vue
<template>
  <div class="address-bar">
    <div class="nav-buttons">
      <BButton type="text" size="small" square :disabled="!canGoBack" title="后退" icon="lucide:arrow-left" @click="emit('goBack')" />
      <BButton type="text" size="small" square :disabled="!canGoForward" title="前进" icon="lucide:arrow-right" @click="emit('goForward')" />
      <BButton type="text" size="small" square :title="isLoading ? '停止' : '刷新'" :icon="isLoading ? 'lucide:x' : 'lucide:refresh-cw'" @click="isLoading ? emit('stop') : emit('reload')" />
    </div>

    <div class="address-input">
      <input :value="url" class="address-input__control" type="text" spellcheck="false" @keydown.enter="emit('submitUrl', ($event.target as HTMLInputElement).value)" />
    </div>

    <div class="action-buttons">
      <BButton type="text" size="small" square title="在浏览器打开" icon="lucide:external-link" @click="emit('openInBrowser')" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file AddressBar.vue
 * @description WebView 共享地址栏组件。
 */
interface Props {
  /** 当前地址 */
  url: string;
  /** 是否允许后退 */
  canGoBack?: boolean;
  /** 是否允许前进 */
  canGoForward?: boolean;
  /** 是否正在加载 */
  isLoading?: boolean;
}

withDefaults(defineProps<Props>(), {
  canGoBack: false,
  canGoForward: false,
  isLoading: false
});

const emit = defineEmits<{
  goBack: [];
  goForward: [];
  reload: [];
  stop: [];
  openInBrowser: [];
  submitUrl: [value: string];
}>();
</script>
```

- [ ] **Step 4: Re-run the shared tests**

Run:

```bash
pnpm test -- test/views/webview/shared/url.test.ts test/views/webview/shared/useWebviewTabTitle.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Commit the shared extraction**

Run:

```bash
git add src/views/webview/shared test/views/webview/shared
git commit -m "refactor(webview): extract shared state and toolbar"
```

### Task 2: Move the existing `WebContentsView` implementation into `native`

**Files:**
- Create: `src/views/webview/native/index.vue`
- Create: `src/views/webview/native/hooks/useNativeWebView.ts`
- Delete: `src/views/webview/index.vue`
- Delete: `src/views/webview/hooks/useWebView.ts`
- Delete: `src/views/webview/components/AddressBar.vue`
- Modify: `src/views/webview/types.ts`
- Test: `test/views/webview/native/useNativeWebView.test.ts`
- Reference: `electron/preload/webview.mts`

- [ ] **Step 1: Write the failing native hook test**

Create `test/views/webview/native/useNativeWebView.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the native hook test and confirm failure**

Run:

```bash
pnpm test -- test/views/webview/native/useNativeWebView.test.ts
```

Expected: `FAIL` because the `native` hook file does not exist yet.

- [ ] **Step 3: Move the current implementation into `native` and wire shared helpers**

Create `src/views/webview/native/hooks/useNativeWebView.ts` by adapting the current hook:

```ts
/**
 * @file useNativeWebView.ts
 * @description 封装 native WebContentsView 的 IPC 控制逻辑。
 */
import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import type { WebViewBounds } from 'types/webview';
import type { WebviewPageState } from '@/views/webview/shared/types';

const DEFAULT_STATE: WebviewPageState = {
  url: '',
  title: '',
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  loadProgress: 0
};

/**
 * 创建 native WebView 控制器。
 * @param tabId - 当前页面对应的主进程视图 ID
 * @returns native WebView 状态与控制方法
 */
export function useNativeWebView(tabId: Ref<string> | string) {
  const resolvedTabId = typeof tabId === 'string' ? tabId : tabId.value;
  const state = ref<WebviewPageState>({ ...DEFAULT_STATE });

  let unsubState: (() => void) | null = null;
  let unsubTitle: (() => void) | null = null;
  let unsubNav: (() => void) | null = null;

  const create = (url: string): void => {
    state.value.url = url;
    window.electronAPI!.webview.create(resolvedTabId, url);
  };

  const destroy = (): Promise<unknown> => window.electronAPI!.webview.destroy(resolvedTabId);
  const navigate = (url: string): Promise<unknown> => {
    state.value.url = url;
    return window.electronAPI!.webview.navigate(resolvedTabId, url);
  };
  const goBack = (): Promise<unknown> => window.electronAPI!.webview.goBack(resolvedTabId);
  const goForward = (): Promise<unknown> => window.electronAPI!.webview.goForward(resolvedTabId);
  const reload = (): Promise<unknown> => window.electronAPI!.webview.reload(resolvedTabId);
  const stop = (): Promise<unknown> => window.electronAPI!.webview.stop(resolvedTabId);
  const setBounds = (bounds: WebViewBounds): Promise<unknown> => window.electronAPI!.webview.setBounds(resolvedTabId, bounds);
  const show = (): Promise<unknown> => window.electronAPI!.webview.show(resolvedTabId);
  const hide = (): Promise<unknown> => window.electronAPI!.webview.hide(resolvedTabId);

  onMounted(() => {
    unsubState = window.electronAPI!.webview.onStateChanged((id, nextState) => {
      if (id !== resolvedTabId) {
        return;
      }

      state.value = {
        ...state.value,
        isLoading: nextState.isLoading,
        loadProgress: nextState.loadProgress,
        url: nextState.url || state.value.url
      };
    });

    unsubTitle = window.electronAPI!.webview.onTitleUpdated((id, title) => {
      if (id !== resolvedTabId) {
        return;
      }

      state.value.title = title;
    });

    unsubNav = window.electronAPI!.webview.onNavigationStateChanged((id, canGoBack, canGoForward) => {
      if (id !== resolvedTabId) {
        return;
      }

      state.value.canGoBack = canGoBack;
      state.value.canGoForward = canGoForward;
    });
  });

  onUnmounted(() => {
    unsubState?.();
    unsubTitle?.();
    unsubNav?.();
  });

  return {
    state,
    create,
    destroy,
    navigate,
    goBack,
    goForward,
    reload,
    stop,
    setBounds,
    show,
    hide
  };
}
```

Create `src/views/webview/native/index.vue` by moving the current shell and switching imports to `shared`:

```vue
<script setup lang="ts">
/**
 * @file index.vue
 * @description native WebContentsView 页面入口。
 */
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import { useRoute } from 'vue-router';
import { native } from '@/shared/platform';
import { hashString } from '@/shared/utils/hash';
import { useWebviewTabTitle } from '@/views/webview/shared/hooks/useWebviewTabTitle';
import { normalizeWebviewUrl } from '@/views/webview/shared/utils/url';
import AddressBar from '@/views/webview/shared/components/AddressBar.vue';
import { useNativeWebView } from './hooks/useNativeWebView';

const route = useRoute();
const tabId = computed(() => hashString(route.fullPath));
const initialUrl = computed(() => normalizeWebviewUrl(decodeURIComponent((route.query.url as string) || '')));
const webviewContainerRef = ref<HTMLElement | null>(null);
const webviewShellRef = ref<HTMLElement | null>(null);
const webview = useNativeWebView(tabId);

/**
 * 更新 native WebContentsView bounds。
 */
function updateBounds(): void {
  if (!webviewContainerRef.value) {
    return;
  }

  const rect = webviewContainerRef.value.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  webview.setBounds({
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  });
}

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
 * 导航到地址栏输入的新地址。
 * @param value - 地址栏输入值
 */
async function handleSubmitUrl(value: string): Promise<void> {
  webview.navigate(normalizeWebviewUrl(value));
}

useResizeObserver(webviewShellRef, updateBounds);
useWebviewTabTitle({
  routeFullPath: route.fullPath,
  title: computed(() => webview.state.value.title)
});

onMounted(async () => {
  await webview.create(initialUrl.value);
  updateBounds();
  await webview.show();
});

onActivated(async () => {
  updateBounds();
  await webview.show();
});

onDeactivated(async () => {
  await webview.hide();
});

onBeforeUnmount(async () => {
  await webview.destroy();
});
</script>
```

- [ ] **Step 4: Run the native hook test**

Run:

```bash
pnpm test -- test/views/webview/native/useNativeWebView.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Commit the native migration**

Run:

```bash
git add src/views/webview/native src/views/webview/shared src/views/webview/types.ts test/views/webview/native
git commit -m "refactor(webview): move native implementation into dedicated module"
```

### Task 3: Enable `webviewTag` and add host-level security controls

**Files:**
- Modify: `electron/main/window.mts`
- Modify: `electron/main/modules/webview/ipc.mts`
- Modify: `electron/preload/webview.mts`
- Test: `test/electron/webview-host-policy.test.ts`

- [ ] **Step 1: Write the failing host policy test**

Create `test/electron/webview-host-policy.test.ts`:

```ts
/**
 * @file webview-host-policy.test.ts
 * @description 验证 WebView 宿主安全策略。
 */
import { describe, expect, it } from 'vitest';
import { normalizeAttachedWebviewUrl, sanitizeAttachedWebPreferences } from '../../electron/main/modules/webview/ipc.mts';

describe('webview host policy', () => {
  it('allows only http and https urls', () => {
    expect(normalizeAttachedWebviewUrl('https://example.com')).toBe('https://example.com/');
    expect(() => normalizeAttachedWebviewUrl('file:///tmp/demo.html')).toThrowError('Unsupported webview URL protocol');
  });

  it('removes renderer-provided preload and forces partition', () => {
    const result = sanitizeAttachedWebPreferences({
      preload: '/tmp/evil-preload.js',
      nodeIntegration: true,
      contextIsolation: false
    });

    expect(result.preload).toBeUndefined();
    expect(result.nodeIntegration).toBe(false);
    expect(result.contextIsolation).toBe(true);
    expect(result.partition).toBe('persist:tibis-webview');
  });
});
```

- [ ] **Step 2: Run the host policy test and confirm failure**

Run:

```bash
pnpm test -- test/electron/webview-host-policy.test.ts
```

Expected: `FAIL` because the exported policy helpers do not exist yet.

- [ ] **Step 3: Add `webviewTag` and export host-policy helpers from the main process**

Update `electron/main/window.mts` so the BrowserWindow web preferences include:

```ts
webPreferences: {
  preload: path.join(__dirname, '../preload/index.mjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false,
  webviewTag: true
}
```

Add these helpers to `electron/main/modules/webview/ipc.mts`:

```ts
/**
 * 标准化待附加的 `<webview>` 地址。
 * @param rawUrl - 原始地址
 * @returns 标准化 URL
 */
export function normalizeAttachedWebviewUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Unsupported webview URL protocol');
  }
  return parsed.toString();
}

/**
 * 清理 `<webview>` 附加时的宿主配置。
 * @param preferences - 原始 webPreferences
 * @returns 受控 webPreferences
 */
export function sanitizeAttachedWebPreferences(preferences: Record<string, unknown>): Record<string, unknown> {
  return {
    ...preferences,
    preload: undefined,
    nodeIntegration: false,
    contextIsolation: true,
    partition: 'persist:tibis-webview',
    webSecurity: true
  };
}
```

Register the attach guard near window creation:

```ts
mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
  try {
    params.src = normalizeAttachedWebviewUrl(params.src);
    delete webPreferences.preload;
    Object.assign(webPreferences, sanitizeAttachedWebPreferences(webPreferences as Record<string, unknown>));
  } catch (error) {
    event.preventDefault();
    mainWindow.webContents.send('webview:attach-rejected', {
      src: String(params.src || ''),
      reason: error instanceof Error ? error.message : 'Unknown webview attach error'
    });
  }
});
```

Also add a preload listener helper in `electron/preload/webview.mts`:

```ts
onAttachRejected: (callback) => {
  const handler = (_event: Electron.IpcRendererEvent, payload: { src: string; reason: string }) => {
    callback(payload);
  };
  ipcRenderer.on('webview:attach-rejected', handler);
  return () => ipcRenderer.removeListener('webview:attach-rejected', handler);
}
```

- [ ] **Step 4: Re-run the host policy test**

Run:

```bash
pnpm test -- test/electron/webview-host-policy.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Commit the host policy changes**

Run:

```bash
git add electron/main/window.mts electron/main/modules/webview/ipc.mts electron/preload/webview.mts test/electron/webview-host-policy.test.ts
git commit -m "feat(webview): add host policy for webview tag mode"
```

### Task 4: Build the `<webview>`-tag implementation and rejection handling

**Files:**
- Create: `src/views/webview/web/hooks/useTagWebView.ts`
- Create: `src/views/webview/web/index.vue`
- Test: `test/views/webview/web/useTagWebView.test.ts`
- Reference: `src/shared/platform/index.ts`

- [ ] **Step 1: Write the failing tag hook test**

Create `test/views/webview/web/useTagWebView.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tag hook test and confirm failure**

Run:

```bash
pnpm test -- test/views/webview/web/useTagWebView.test.ts
```

Expected: `FAIL` because the `web` hook file does not exist yet.

- [ ] **Step 3: Implement the `web` hook and page**

Create `src/views/webview/web/hooks/useTagWebView.ts`:

```ts
/**
 * @file useTagWebView.ts
 * @description 封装 `<webview>` 标签页面状态与导航控制。
 */
import { computed, ref, type Ref } from 'vue';
import type { WebviewController, WebviewPageState } from '@/views/webview/shared/types';

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

  function goBack(): void {
    webviewRef.value?.goBack();
    syncNavigationState();
  }

  function goForward(): void {
    webviewRef.value?.goForward();
    syncNavigationState();
  }

  function reload(): void {
    webviewRef.value?.reload();
  }

  function stop(): void {
    webviewRef.value?.stop();
  }

  function handleDidStartLoading(): void {
    state.value.isLoading = true;
    state.value.loadProgress = 0.1;
  }

  function handleDomReady(): void {
    state.value.loadProgress = 0.7;
    syncNavigationState();
  }

  function handleDidNavigate(event: Electron.DidNavigateEvent): void {
    state.value.url = event.url;
    syncNavigationState();
  }

  function handleTitleUpdated(event: Electron.PageTitleUpdatedEvent): void {
    state.value.title = event.title;
  }

  function handleDidStopLoading(): void {
    state.value.isLoading = false;
    state.value.loadProgress = 1;
    syncNavigationState();
  }

  function handleAttachRejected(payload: { src: string; reason: string }): void {
    state.value.isLoading = false;
    console.error(`Webview attach rejected for ${payload.src}: ${payload.reason}`);
  }

  const controller: WebviewController = {
    state: computed(() => state.value) as unknown as Ref<WebviewPageState>,
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
```

Create `src/views/webview/web/index.vue`:

```vue
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

    <webview
      ref="webviewElementRef"
      class="webview-content"
      :src="webview.state.value.url"
      partition="persist:tibis-webview"
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
```

- [ ] **Step 4: Run the tag hook test**

Run:

```bash
pnpm test -- test/views/webview/web/useTagWebView.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Commit the `<webview>` implementation**

Run:

```bash
git add src/views/webview/web test/views/webview/web
git commit -m "feat(webview): add webview tag implementation"
```

### Task 5: Add explicit routes and final verification

**Files:**
- Modify: `src/router/routes/modules/webview.ts`
- Modify: `src/router/index.ts`
- Modify: `changelog/2026-05-12.md`
- Test: `test/router/webview-routes.test.ts`

- [ ] **Step 1: Write the failing route test**

Create `test/router/webview-routes.test.ts`:

```ts
/**
 * @file webview-routes.test.ts
 * @description 验证 WebView 双实现路由定义。
 */
import webviewRoutes from '@/router/routes/modules/webview';
import { describe, expect, it } from 'vitest';

describe('webview routes', () => {
  it('registers explicit native and web child routes', () => {
    const paths = webviewRoutes.children?.map((route) => route.path) ?? [];

    expect(paths).toContain('native');
    expect(paths).toContain('web');
  });
});
```

- [ ] **Step 2: Run the route test and confirm failure**

Run:

```bash
pnpm test -- test/router/webview-routes.test.ts
```

Expected: `FAIL` because the current route module exposes only one `/webview` page.

- [ ] **Step 3: Update the route module and changelog**

Update `src/router/routes/modules/webview.ts`:

```ts
/**
 * @file webview.ts
 * @description WebView 双实现路由定义。
 */
import type { RouteRecordRaw } from 'vue-router';

const webviewRoute: RouteRecordRaw = {
  path: '/webview',
  component: () => import('@/layouts/default/index.vue'),
  children: [
    {
      path: 'native',
      name: 'webview-native',
      component: () => import('@/views/webview/native/index.vue'),
      meta: {
        title: 'WebView'
      }
    },
    {
      path: 'web',
      name: 'webview-web',
      component: () => import('@/views/webview/web/index.vue'),
      meta: {
        title: 'WebView'
      }
    }
  ]
};

export default webviewRoute;
```

Update `changelog/2026-05-12.md` with implementation records under `## Changed`.

- [ ] **Step 4: Run route and focused WebView tests**

Run:

```bash
pnpm test -- test/router/webview-routes.test.ts test/views/webview/shared/url.test.ts test/views/webview/shared/useWebviewTabTitle.test.ts test/views/webview/native/useNativeWebView.test.ts test/views/webview/web/useTagWebView.test.ts test/electron/webview-host-policy.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Run typecheck and targeted lint if available**

Run:

```bash
pnpm test -- --runInBand
pnpm exec tsc --noEmit
```

Expected: all targeted tests pass and TypeScript completes without errors.

- [ ] **Step 6: Commit the route integration**

Run:

```bash
git add src/router/routes/modules/webview.ts changelog/2026-05-12.md test/router/webview-routes.test.ts
git commit -m "feat(webview): add explicit native and web routes"
```
