import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import localforage from 'localforage';
import { getElectronAPI, hasElectronAPI } from '@/shared/platform/electron-api';
import type { EditorFile } from '@/views/editor/types';

export interface TabItem extends EditorFile {
  isDirty?: boolean;
}

const OPENED_TABS_KEY = 'opened_tabs_v1';
const ACTIVE_TAB_ID_KEY = 'active_tab_id_v1';

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<TabItem[]>([]);
  const activeId = ref<string>('');

  const activeTab = computed(() => tabs.value.find((t) => t.id === activeId.value));

  const isReady = ref(false);

  // 初始化加载
  async function init() {
    let savedTabs: TabItem[] | null = null;
    let savedActiveId: string | null = null;

    if (hasElectronAPI()) {
      savedTabs = (await getElectronAPI().storeGet(OPENED_TABS_KEY)) as TabItem[] | null;
      savedActiveId = (await getElectronAPI().storeGet(ACTIVE_TAB_ID_KEY)) as string | null;
    } else {
      savedTabs = await localforage.getItem<TabItem[]>(OPENED_TABS_KEY);
      savedActiveId = await localforage.getItem<string>(ACTIVE_TAB_ID_KEY);
    }

    if (savedTabs && savedTabs.length > 0) {
      tabs.value = savedTabs;
      activeId.value = savedActiveId && savedTabs.some((t) => t.id === savedActiveId) ? savedActiveId : savedTabs[0].id;
    }
    isReady.value = true;
  }

  // 持久化状态
  async function persist() {
    if (!isReady.value) return;

    // 移除不必要的响应式追踪进行序列化
    const tabsToSave = tabs.value.map((t) => ({ ...t }));

    if (hasElectronAPI()) {
      await getElectronAPI().storeSet(OPENED_TABS_KEY, tabsToSave);
      await getElectronAPI().storeSet(ACTIVE_TAB_ID_KEY, activeId.value);
    } else {
      await localforage.setItem(OPENED_TABS_KEY, tabsToSave);
      await localforage.setItem(ACTIVE_TAB_ID_KEY, activeId.value);
    }
  }

  watch(tabs, () => persist(), { deep: true });
  watch(activeId, () => persist());

  function addTab(file: EditorFile) {
    const existing = tabs.value.find((t) => t.id === file.id);
    if (existing) {
      activeId.value = file.id;
      // 也可以更新 content
      existing.content = file.content;
      existing.name = file.name;
      existing.ext = file.ext;
      existing.path = file.path;
    } else {
      tabs.value.push({ ...file, isDirty: false });
      activeId.value = file.id;
    }
  }

  function closeTab(id: string) {
    const idx = tabs.value.findIndex((t) => t.id === id);
    if (idx !== -1) {
      tabs.value.splice(idx, 1);

      if (tabs.value.length === 0) {
        activeId.value = '';
      } else if (activeId.value === id) {
        // 如果关闭的是当前激活的标签，激活前一个或后一个
        const nextIdx = Math.min(idx, tabs.value.length - 1);
        activeId.value = tabs.value[nextIdx].id;
      }
    }
  }

  function updateTab(id: string, updates: Partial<TabItem>) {
    const tab = tabs.value.find((t) => t.id === id);
    if (tab) {
      Object.assign(tab, updates);
    }
  }

  function markDirty(id: string, dirty: boolean) {
    const tab = tabs.value.find((t) => t.id === id);
    if (tab && tab.isDirty !== dirty) {
      tab.isDirty = dirty;
    }
  }

  return {
    tabs,
    activeId,
    activeTab,
    isReady,
    init,
    addTab,
    closeTab,
    updateTab,
    markDirty
  };
});
