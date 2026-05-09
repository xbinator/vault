/**
 * @file HeaderTabs.test.ts
 * @description 验证 HeaderTabs 使用独立 overlay 渲染拖拽插入指示线。
 * @vitest-environment jsdom
 */

import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTabsStore } from '@/stores/tabs';

const dragModuleMock = vi.hoisted(() => ({
  cleanup: vi.fn(),
  registerTabElement: vi.fn(() => () => undefined),
  unregisterTabElement: vi.fn(),
  draggingTabId: { value: null as string | null },
  dropTargetTabId: { value: null as string | null },
  dragInsertPosition: { value: null as 'before' | 'after' | null },
  dropIndicatorOffset: { value: null as number | null }
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({
    fullPath: '/a'
  }),
  useRouter: () => ({
    push: vi.fn(async () => undefined)
  })
}));

vi.mock('@/layouts/default/hooks/useTabDragger', () => ({
  useTabDragger: () => ({
    cleanup: dragModuleMock.cleanup,
    registerTabElement: dragModuleMock.registerTabElement,
    unregisterTabElement: dragModuleMock.unregisterTabElement,
    state: {
      draggingTabId: dragModuleMock.draggingTabId,
      dropTargetTabId: dragModuleMock.dropTargetTabId,
      dragInsertPosition: dragModuleMock.dragInsertPosition,
      dropIndicatorOffset: dragModuleMock.dropIndicatorOffset
    }
  })
}));

/**
 * 挂载 HeaderTabs，并提供最小 store 状态。
 * @returns HeaderTabs 组件包装器
 */
async function mountHeaderTabs() {
  const { default: HeaderTabs } = await import('@/layouts/default/components/HeaderTabs.vue');
  const pinia = createPinia();
  setActivePinia(pinia);
  const tabsStore = useTabsStore();
  tabsStore.tabs = [
    { id: 'tab-1', path: '/a', title: 'A' },
    { id: 'tab-2', path: '/b', title: 'B' }
  ];
  const wrapper = mount(HeaderTabs, {
    attachTo: document.body,
    global: {
      plugins: [pinia]
    }
  });
  await wrapper.vm.$nextTick();
  return wrapper;
}

describe('HeaderTabs', () => {
  beforeEach(() => {
    vi.resetModules();
    setActivePinia(createPinia());
    dragModuleMock.cleanup.mockReset();
    dragModuleMock.registerTabElement.mockClear();
    dragModuleMock.unregisterTabElement.mockClear();
    dragModuleMock.draggingTabId.value = null;
    dragModuleMock.dropTargetTabId.value = null;
    dragModuleMock.dragInsertPosition.value = null;
    dragModuleMock.dropIndicatorOffset.value = null;
  });

  it('renders a drop indicator overlay at the first insertion position', async () => {
    dragModuleMock.dropIndicatorOffset.value = 0;
    const wrapper = await mountHeaderTabs();

    const indicator = wrapper.find('.header-tabs__drop-indicator');
    expect(indicator.exists()).toBe(true);
    expect(indicator.attributes('style')).toContain('left: 0px;');
    wrapper.unmount();
  });

  it('renders a drop indicator overlay after the last tab when dragging in the right overflow area', async () => {
    dragModuleMock.dropIndicatorOffset.value = 200;
    const wrapper = await mountHeaderTabs();

    const indicator = wrapper.find('.header-tabs__drop-indicator');
    expect(indicator.exists()).toBe(true);
    expect(indicator.attributes('style')).toContain('left: 199px;');
    wrapper.unmount();
  });
});
