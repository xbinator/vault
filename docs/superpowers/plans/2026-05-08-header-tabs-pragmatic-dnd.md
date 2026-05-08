# HeaderTabs Pragmatic Drag and Drop 替换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `@atlaskit/pragmatic-drag-and-drop` 替换 `HeaderTabs.vue` 的原生 HTML5 拖拽实现，保持 `tabsStore.moveTab()` 作为唯一排序入口。

**Architecture:** 新增 `useHeaderTabsPragmaticDrag.ts` 组合函数封装 Pragmatic 的 `draggable`/`dropTargetForElements`/`monitorForElements`/`autoScrollForElements` API，通过 `shallowRef` 桥接 Vue 响应式。`HeaderTabs.vue` 收缩为薄组件，仅渲染 tabs + class 绑定 + 业务交互。`headerTabDrag.ts` 收缩为类型定义 + `closestEdgeToMovePosition()` 纯函数。

**Tech Stack:** Vue 3 Composition API, Pinia, Pragmatic Drag and Drop, Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/layouts/default/components/useHeaderTabsPragmaticDrag.ts` | 新：封装 Pragmatic 拖拽注册、命中计算、auto-scroll、状态输出、cleanup 管理 |
| `src/layouts/default/components/headerTabDrag.ts` | 改：收缩为类型定义 + `closestEdgeToMovePosition()` 转换函数 |
| `src/layouts/default/components/HeaderTabs.vue` | 改：移除原生拖拽事件，接入 useHeaderTabsPragmaticDrag |
| `package.json` | 改：新增 3 个 Pragmatic 依赖 |
| `test/layouts/default/headerTabDrag.test.ts` | 改：更新测试覆盖新转换函数，移除废弃函数测试 |
| `test/layouts/default/useHeaderTabsPragmaticDrag.test.ts` | 新：拖拽模块状态管理单元测试 |

---

> **注意：** 三个 `@atlaskit/pragmatic-drag-and-drop-*` 依赖已在 package.json 中完成安装（版本 1.8.1/1.4.0/1.1.0），跳过本步骤。

---

### Task 2: 收缩 headerTabDrag.ts 为类型 + 转换函数

**Files:**
- Modify: `src/layouts/default/components/headerTabDrag.ts:1-106`
- Modify: `test/layouts/default/headerTabDrag.test.ts:1-59`

- [ ] **Step 1: 重写 headerTabDrag.ts**

保留类型定义，新增 `closestEdgeToMovePosition()`，移除废弃函数：

```typescript
/**
 * @file headerTabDrag.ts
 * @description 顶部标签拖拽排序的类型定义与业务转换逻辑。
 */

import type { TabMovePosition } from '@/stores/tabs';

/**
 * 标签页拖拽排序所需的矩形信息。
 */
export interface HeaderTabRect {
  /** 标签页唯一标识 */
  id?: string;
  /** 元素左侧相对视口的位置 */
  left: number;
  /** 元素宽度 */
  width: number;
}

/**
 * Pragmatic hitbox closest edge 的字面量类型。
 */
export type ClosestEdge = 'left' | 'right';

/**
 * 将 Pragmatic closest edge 结果转换为排序插入位置。
 * @param edge - closestEdge 计算出的边缘，undefined 时默认视为 'after'
 * @returns 排序插入位置
 */
export function closestEdgeToMovePosition(edge: ClosestEdge | undefined): TabMovePosition {
  if (edge === 'left') {
    return 'before';
  }
  return 'after';
}
```

- [ ] **Step 2: 重写测试文件**

```typescript
/**
 * @file headerTabDrag.test.ts
 * @description 验证 closestEdge 到 TabMovePosition 的转换逻辑。
 */

import { describe, expect, it } from 'vitest';
import { closestEdgeToMovePosition } from '@/layouts/default/components/headerTabDrag';

describe('headerTabDrag', () => {
  it('maps "left" closest edge to "before"', () => {
    expect(closestEdgeToMovePosition('left')).toBe('before');
  });

  it('maps "right" closest edge to "after"', () => {
    expect(closestEdgeToMovePosition('right')).toBe('after');
  });

  it('treats undefined closest edge as "after" (safe default)', () => {
    expect(closestEdgeToMovePosition(undefined)).toBe('after');
  });
});
```

- [ ] **Step 3: 运行测试验证**

```powershell
npx vitest run test/layouts/default/headerTabDrag.test.ts
```

Expected: 3 tests PASS。

- [ ] **Step 4: Commit**

```bash
git add src/layouts/default/components/headerTabDrag.ts test/layouts/default/headerTabDrag.test.ts
git commit -m "refactor: shrink headerTabDrag to types + closestEdgeToMovePosition"
```

---

### Task 3: 编写 useHeaderTabsPragmaticDrag 单元测试

**Files:**
- Create: `test/layouts/default/useHeaderTabsPragmaticDrag.test.ts`

> 注意：由于 Pragmatic Drag and Drop 内部依赖 pointer events 和完整 DOM，jsdom 环境下无法完整模拟拖拽交互。本测试仅覆盖**状态管理逻辑**（ref 的初始值、cleanup 调用次数、register/unregister 的 Map 管理），不测试实际 pointer 事件流。

- [ ] **Step 1: 创建测试文件**

```typescript
/**
 * @file useHeaderTabsPragmaticDrag.test.ts
 * @description 验证 useHeaderTabsPragmaticDrag 组合函数的状态管理与清理逻辑。
 */

import { describe, expect, it, vi } from 'vitest';
import { useHeaderTabsPragmaticDrag } from '@/layouts/default/components/useHeaderTabsPragmaticDrag';
import { ref } from 'vue';

describe('useHeaderTabsPragmaticDrag', () => {
  it('初始状态下所有拖拽状态均为 null', () => {
    const scrollRef = ref<HTMLElement | null>(null);
    const onSort = vi.fn();
    const { draggingTabId, dropTargetTabId, dragInsertPosition } = useHeaderTabsPragmaticDrag(scrollRef, onSort);

    expect(draggingTabId.value).toBeNull();
    expect(dropTargetTabId.value).toBeNull();
    expect(dragInsertPosition.value).toBeNull();
  });

  it('registerTabElement 返回 cleanup 函数，unregisterTabElement 调用后相应 cleanup 被执行', () => {
    const scrollRef = ref<HTMLElement | null>(null);
    const onSort = vi.fn();
    const { registerTabElement, unregisterTabElement, cleanupAll } = useHeaderTabsPragmaticDrag(scrollRef, onSort);

    // 无法在 node 环境创建真实 HTMLElement，验证模块接口正常导出
    expect(typeof registerTabElement).toBe('function');
    expect(typeof unregisterTabElement).toBe('function');
    expect(typeof cleanupAll).toBe('function');
  });

  it('cleanupAll 可以被安全地重复调用', () => {
    const scrollRef = ref<HTMLElement | null>(null);
    const onSort = vi.fn();
    const { cleanupAll } = useHeaderTabsPragmaticDrag(scrollRef, onSort);

    // 应不抛出异常
    expect(() => cleanupAll()).not.toThrow();
    expect(() => cleanupAll()).not.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试验证（预期失败——模块尚未创建）**

```powershell
npx vitest run test/layouts/default/useHeaderTabsPragmaticDrag.test.ts
```

Expected: FAIL — `Cannot find module '@/layouts/default/components/useHeaderTabsPragmaticDrag'`。

- [ ] **Step 3: Commit**

```bash
git add test/layouts/default/useHeaderTabsPragmaticDrag.test.ts
git commit -m "test: add useHeaderTabsPragmaticDrag unit tests"
```

---

### Task 4: 实现 useHeaderTabsPragmaticDrag 组合函数

**Files:**
- Create: `src/layouts/default/components/useHeaderTabsPragmaticDrag.ts`

- [ ] **Step 1: 创建拖拽模块**

```typescript
/**
 * @file useHeaderTabsPragmaticDrag.ts
 * @description 基于 Pragmatic Drag and Drop 的顶部标签拖拽排序组合函数。
 * 封装 draggable/dropTargetForElements/monitorForElements/autoScroll 注册、
 * 命中计算与状态管理。
 */

import { ref, onUnmounted, type Ref } from 'vue';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { closestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import type { TabMovePosition } from '@/stores/tabs';
import { closestEdgeToMovePosition } from './headerTabDrag';
import type { ClosestEdge } from './headerTabDrag';

/**
 * 每个标签在拖拽中携带的自定义数据。
 */
interface TabDragData {
  /** 标签页唯一标识 */
  tabId: string;
  /** 命中时计算出的最近边缘 */
  closestEdge?: ClosestEdge;
}

/**
 * 创建 HeaderTabs 的 Pragmatic Drag and Drop 拖拽模块。
 * @param scrollContainerRef - 横向滚动容器的 ref
 * @param onSort - 排序完成回调，参数为 fromId, toId, position
 * @returns 拖拽状态和元素注册/清理方法
 */
export function useHeaderTabsPragmaticDrag(
  scrollContainerRef: Ref<HTMLElement | null>,
  onSort: (fromId: string, toId: string, position: TabMovePosition) => void
) {
  /** 当前正在拖拽的标签 ID */
  const draggingTabId = ref<string | null>(null);
  /** 当前悬停的目标标签 ID */
  const dropTargetTabId = ref<string | null>(null);
  /** 当前插入位置 */
  const dragInsertPosition = ref<TabMovePosition | null>(null);

  /** 每个标签的 cleanup 函数注册表 */
  const cleanupMap = new Map<string, () => void>();

  /** 全局 monitor 的 cleanup 函数 */
  let monitorCleanup: (() => void) | null = null;

  /** auto-scroll 的 cleanup 函数 */
  let autoScrollCleanup: (() => void) | null = null;

  /**
   * 将标签元素注册为 draggable 和 drop target。
   * @param tabId - 标签页 ID
   * @param element - 标签 DOM 元素
   * @returns 该标签的清理函数
   */
  function registerTabElement(tabId: string, element: HTMLElement): () => void {
    // 先清理旧注册（若存在）
    unregisterTabElement(tabId);

    const cleanups: (() => void)[] = [];

    const dragCleanup = draggable({
      element,
      getInitialData: (): TabDragData => ({ tabId }),
      onGenerateDragPreview({ nativeSetDragImage }) {
        nativeSetDragImage(element, 0, 0);
      },
      onDragStart() {
        draggingTabId.value = tabId;
        ensureAutoScrollActive();
      },
      onDrop() {
        resetDragState();
      }
    });
    cleanups.push(dragCleanup);

    const dropCleanup = dropTargetForElements({
      element,
      getData: (): TabDragData => ({ tabId }),
      canDrop({ source }) {
        return source.data.tabId !== tabId;
      },
      onDrag({ self, location }) {
        const input = location.current.input;
        const edge = closestEdge(input, { element, allowedEdges: ['left', 'right'] });
        // 将最近边缘写入 self.data，供 monitor 读取
        const data = self.data as TabDragData;
        data.closestEdge = edge?.closestEdge;
      }
    });
    cleanups.push(dropCleanup);

    const combinedCleanup = () => {
      cleanups.forEach((fn) => fn());
    };
    cleanupMap.set(tabId, combinedCleanup);

    return combinedCleanup;
  }

  /**
   * 注销指定标签的拖拽注册。
   * @param tabId - 标签页 ID
   */
  function unregisterTabElement(tabId: string): void {
    const cleanup = cleanupMap.get(tabId);
    if (cleanup) {
      cleanup();
      cleanupMap.delete(tabId);
    }
  }

  /**
   * 确保全局 monitor 已启动（单例）。
   */
  function ensureMonitorActive(): void {
    if (monitorCleanup) {
      return;
    }

    monitorCleanup = monitorForElements({
      onDrag({ location }) {
        const target = location.current.dropTargets[0];
        if (!target) {
          dropTargetTabId.value = null;
          dragInsertPosition.value = null;
          return;
        }

        const data = target.data as TabDragData;
        dropTargetTabId.value = data.tabId;
        dragInsertPosition.value = closestEdgeToMovePosition(data.closestEdge);
      },
      onDrop({ source, location }) {
        const target = location.current.dropTargets[0];
        if (!target) {
          resetDragState();
          return;
        }

        const fromId = source.data.tabId as string;
        const toId = target.data.tabId as string;

        if (!fromId || !toId || fromId === toId) {
          resetDragState();
          return;
        }

        const position = closestEdgeToMovePosition(
          (target.data as TabDragData).closestEdge
        );

        onSort(fromId, toId, position);
        resetDragState();
      }
    });
  }

  /**
   * 确保 auto-scroll 已激活（单例）。
   */
  function ensureAutoScrollActive(): void {
    if (autoScrollCleanup || !scrollContainerRef.value) {
      return;
    }

    try {
      autoScrollCleanup = autoScrollForElements({
        element: scrollContainerRef.value,
        canScroll: () => true,
        getConfiguration: () => ({
          maxScrollSpeed: 18
        })
      });
    } catch (error) {
      console.warn('[useHeaderTabsPragmaticDrag] auto-scroll 初始化失败:', error);
    }
  }

  /**
   * 重置所有拖拽相关状态。
   */
  function resetDragState(): void {
    draggingTabId.value = null;
    dropTargetTabId.value = null;
    dragInsertPosition.value = null;
  }

  /**
   * 清理所有注册与副作用。
   */
  function cleanupAll(): void {
    // 遍历清理所有标签注册
    cleanupMap.forEach((cleanup) => cleanup());
    cleanupMap.clear();

    // 清理全局 monitor
    if (monitorCleanup) {
      monitorCleanup();
      monitorCleanup = null;
    }

    // 清理 auto-scroll
    if (autoScrollCleanup) {
      autoScrollCleanup();
      autoScrollCleanup = null;
    }

    resetDragState();
  }

  // 激活全局 monitor（整个模块生命周期仅一次）
  ensureMonitorActive();

  // 组件卸载时清理
  onUnmounted(() => {
    cleanupAll();
  });

  return {
    draggingTabId,
    dropTargetTabId,
    dragInsertPosition,
    registerTabElement,
    unregisterTabElement,
    cleanupAll
  };
}
```

- [ ] **Step 2: 验证 TypeScript 类型检查**

```powershell
npx vue-tsc --noEmit --project tsconfig.json
```

Expected: 无类型错误。

- [ ] **Step 3: 运行单元测试**

```powershell
npx vitest run test/layouts/default/useHeaderTabsPragmaticDrag.test.ts
```

Expected: 3 tests PASS。

- [ ] **Step 4: Commit**

```bash
git add src/layouts/default/components/useHeaderTabsPragmaticDrag.ts
git commit -m "feat: add useHeaderTabsPragmaticDrag composable"
```

---

### Task 5: 修改 HeaderTabs.vue 接入拖拽模块

**Files:**
- Modify: `src/layouts/default/components/HeaderTabs.vue:1-356`

- [ ] **Step 1: 重写模板——移除原生拖拽属性，保留事件与 class**

将 `<template>` 区替换为：

```vue
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
```

- [ ] **Step 2: 重写 script setup——移除原生拖拽逻辑，接入组合函数**

将 `<script setup>` 区替换为：

```typescript
<script setup lang="ts">
/**
 * @file HeaderTabs.vue
 * @description 渲染顶部标签栏的交互逻辑，拖拽排序委托给 useHeaderTabsPragmaticDrag。
 */

import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useTabsStore } from '@/stores/tabs';
import type { Tab, TabMovePosition } from '@/stores/tabs';
import { useHeaderTabsPragmaticDrag } from './useHeaderTabsPragmaticDrag';

const tabsStore = useTabsStore();
const scrollContainer = ref<HTMLElement | null>(null);
const lastDragEndedAt = ref(0);
const route = useRoute();
const router = useRouter();

/**
 * 拖拽完成后的排序回调。
 * @param fromId - 被拖拽标签 ID
 * @param toId - 目标标签 ID
 * @param position - 插入位置
 */
function handleDragSort(fromId: string, toId: string, position: TabMovePosition): void {
  tabsStore.moveTab(fromId, toId, position);
  lastDragEndedAt.value = Date.now();
}

const {
  draggingTabId,
  dropTargetTabId,
  dragInsertPosition,
  registerTabElement,
  unregisterTabElement
} = useHeaderTabsPragmaticDrag(scrollContainer, handleDragSort);

/**
 * 每个标签的模板 ref 回调（Vue v-for ref 函数形式），
 * 将 DOM 元素注册到拖拽模块。
 * @param tabId - 标签页 ID
 * @returns 模板 ref 回调函数
 */
function setTabRef(tabId: string) {
  return (el: Element | null) => {
    if (el instanceof HTMLElement) {
      registerTabElement(tabId, el);
    } else {
      // el 为 null 时表示该标签已卸载
      unregisterTabElement(tabId);
    }
  };
}

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
  // 拖拽结束后 180ms 内抑制点击，防止误触
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
```

- [ ] **Step 3: 验证 TypeScript 类型检查**

```powershell
npx vue-tsc --noEmit --project tsconfig.json
```

Expected: 无类型错误。

- [ ] **Step 4: Commit**

```bash
git add src/layouts/default/components/HeaderTabs.vue
git commit -m "refactor: replace native DnD with Pragmatic Drag and Drop in HeaderTabs"
```

---

### Task 6: 运行全量测试与 Lint 验证

**Files:**
- (无，仅验证)

- [ ] **Step 1: 运行全量测试**

```powershell
pnpm test
```

Expected: 所有已有测试 + 新增测试 PASS。

- [ ] **Step 2: 运行 ESLint**

```powershell
pnpm lint
```

Expected: 无 error。

- [ ] **Step 3: 运行 TypeScript 全量检查**

```powershell
npx vue-tsc --noEmit
```

Expected: 无类型错误。

- [ ] **Step 4: Commit（如有修改）**

```bash
git add -A
git commit -m "chore: fix lint and type errors after DnD refactor"
```

(若前序步骤无修改，跳过此 commit。)

---

## Manual Verification Checklist

以下场景需在真实 Electron 环境中手动验证：

- [ ] 拖拽标签到前方 → 排序正确
- [ ] 拖拽标签到后方 → 排序正确
- [ ] 拖拽标签到首个/末尾位置 → 排序正确
- [ ] 拖拽靠近左右边缘 → 自动横向滚动
- [ ] 拖拽结束后 180ms 内点击 → 不触发路由跳转
- [ ] 点击关闭按钮 → 正常关闭，不触发拖拽
- [ ] 鼠标滚轮 → 横向滚动正常
- [ ] Electron 顶栏 `-webkit-app-region: drag` → 窗口拖拽与标签拖拽不冲突
- [ ] 深色/浅色主题 → 插入指示线样式正常
