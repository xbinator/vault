<!--
  @file HeaderTabs.vue
  @description 渲染应用顶部标签栏，并处理切换、关闭、横向滚动与拖拽排序交互。
-->
<template>
  <div ref="scrollContainer" class="header-tabs" @wheel.prevent="handleWheel">
    <div
      v-for="tab in tabsStore.tabs"
      :key="tab.id"
      :ref="setTabRef(tab.id)"
      :data-tab-id="tab.id"
      class="header-tab"
      :class="getTabClassName(tab)"
      @click="handleClickTab(tab.path)"
    >
      <div class="header-tab__title">
        <span v-if="tabsStore.isDirty(tab.id)" class="header-tab__dirty-mark">*</span>
        <span class="header-tab__title-text">{{ tab.title }}</span>
      </div>

      <button class="header-tab__close" @click.stop="handleCloseTab(tab)">
        <Icon icon="ic:round-close" width="12" height="12" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file HeaderTabs.vue
 * @description 渲染顶部标签栏的交互逻辑，拖拽排序委托给 useTabDragger 模块。
 */

import { shallowRef, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useTabsStore } from '@/stores/tabs';
import type { Tab, TabMovePosition } from '@/stores/tabs';
import { useTabDragger } from '../hooks/useTabDragger';

const tabsStore = useTabsStore();
const route = useRoute();
const router = useRouter();

/** 横向滚动容器 ref，供拖拽模块初始化 auto-scroll */
const scrollContainer = shallowRef<HTMLElement | null>(null);

/** 拖拽结束后最近一次的时间戳，用于抑制拖后误点击 */
const lastDragEndedAt = shallowRef(0);

/**
 * 拖拽排序回调：将拖拽结果传递给 store。
 * @param fromId - 被拖拽标签 ID
 * @param toId - 目标标签 ID
 * @param position - 插入位置
 */
function handleMoveTab(fromId: string, toId: string, position: TabMovePosition): void {
  tabsStore.moveTab(fromId, toId, position);
}

/**
 * 拖拽结束回调：记录时间戳以抑制误点击。
 */
function handleDragEnded(): void {
  lastDragEndedAt.value = Date.now();
}

/**
 * 拖拽模块：封装 draggable/dropTarget 注册、命中计算和 auto-scroll。
 */
const dragModule = useTabDragger(scrollContainer, handleMoveTab, handleDragEnded);

const { draggingTabId, dropTargetTabId, dragInsertPosition } = dragModule.state;

/**
 * Vue 模板 ref 函数：将 v-for 中的 DOM 元素传给拖拽模块注册。
 * @param tabId - 标签 ID
 * @returns ref 回调函数
 */
function setTabRef(tabId: string): (el: unknown) => void {
  return (el: unknown) => {
    if (el instanceof HTMLElement) {
      dragModule.registerTabElement(tabId, el);
    } else {
      // el 为 null 时表示该标签元素已卸载，执行清理
      dragModule.unregisterTabElement(tabId);
    }
  };
}

/** 组件卸载时清理所有拖拽注册 */
onUnmounted(() => {
  dragModule.cleanup();
});

/**
 * 判断标签页是否为当前激活状态。
 * @param tab - 待判断的标签页
 * @returns 是否与当前路由匹配
 */
function isActiveTab(tab: Pick<Tab, 'path'>): boolean {
  return tab.path === route.fullPath;
}

/**
 * 生成标签页样式状态。
 * @param tab - 当前渲染的标签页
 * @returns 标签页样式映射
 */
function getTabClassName(tab: Tab): Record<string, boolean> {
  const isDragTarget = dropTargetTabId.value === tab.id && draggingTabId.value !== tab.id;

  return {
    'is-active': isActiveTab(tab),
    'is-missing': tabsStore.isMissing(tab.id),
    'is-dragging': draggingTabId.value === tab.id,
    'is-drop-before': isDragTarget && dragInsertPosition.value === 'before',
    'is-drop-after': isDragTarget && dragInsertPosition.value === 'after'
  };
}

/**
 * 点击标签页时切换路由。
 * @param path - 目标路由路径
 */
async function handleClickTab(path: string): Promise<void> {
  // 拖拽结束后 180ms 内抑制点击，防止拖后误触
  if (Date.now() - lastDragEndedAt.value < 180) {
    return;
  }

  if (path && route.fullPath !== path) {
    await router.push(path);
  }
}

/**
 * 关闭标签页，并在必要时跳转到相邻标签。
 * @param tab - 待关闭的标签页
 */
async function handleCloseTab(tab: Tab): Promise<void> {
  const isActive = isActiveTab(tab);
  const closingIndex = tabsStore.tabs.findIndex((item) => item.id === tab.id);
  const nextTab = closingIndex === -1 ? null : tabsStore.tabs[closingIndex + 1] ?? tabsStore.tabs[closingIndex - 1] ?? null;

  tabsStore.removeTab(tab.id);

  if (isActive && nextTab) {
    await router.push(nextTab.path);
  } else if (tabsStore.tabs.length === 0) {
    // 最后一个标签页被关闭时，跳转到欢迎页
    await router.push('/welcome');
  }
}

/**
 * 将纵向滚轮滚动映射为横向标签栏滚动。
 * @param event - 鼠标滚轮事件
 */
function handleWheel(event: WheelEvent): void {
  if (!scrollContainer.value) {
    return;
  }

  scrollContainer.value.scrollLeft += event.deltaY !== 0 ? event.deltaY : event.deltaX;
}
</script>

<style lang="less" scoped>
.header-tabs {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  padding-left: 4px;
  overflow: auto hidden;

  /* Hide scrollbar for Chrome, Safari and Opera */
  &::-webkit-scrollbar {
    display: none;
  }

  /* Hide scrollbar for IE, Edge and Firefox */
  -ms-overflow-style: none;
  scrollbar-width: none;

  /* Make the empty space draggable */
  -webkit-app-region: drag;
}

.header-tab {
  position: relative;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 28px;
  padding: 0 4px 0 10px;
  margin-right: 4px;
  cursor: pointer;
  background-color: transparent;
  border-radius: 6px;
  transition: background-color 0.2s, opacity 0.2s;

  /* Ensure tabs themselves are clickable (not draggable) */
  -webkit-app-region: no-drag;

  &:hover {
    background-color: var(--bg-hover);
  }

  &.is-active {
    font-weight: 500;
    background-color: var(--bg-active, var(--bg-hover));
  }

  &.is-dragging {
    opacity: 0.55;
  }

  &.is-drop-before::before,
  &.is-drop-after::after {
    position: absolute;
    top: 4px;
    bottom: 4px;
    width: 2px;
    content: '';
    background-color: var(--color-primary);
    border-radius: 999px;
  }

  &.is-drop-before::before {
    left: -2px;
  }

  &.is-drop-after::after {
    right: -2px;
  }

  &.is-missing .header-tab__title {
    color: var(--error-color, #ff4d4f);
  }

  &.is-missing .header-tab__title-text {
    text-decoration-line: line-through;
    text-decoration-thickness: 1px;
  }
}

.header-tab__title {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  user-select: none;
}

.header-tab__dirty-mark {
  margin-right: 2px;
  font-weight: 700;
}

.header-tab__close {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.2s;

  &:hover {
    color: var(--text-primary);
    background-color: var(--bg-hover-secondary, rgb(0 0 0 / 10%));
  }
}

.header-tab:hover .header-tab__close,
.header-tab.is-active .header-tab__close {
  opacity: 1;
}

:deep(.dark) .header-tab__close:hover {
  background-color: rgb(255 255 255 / 10%);
}
</style>
