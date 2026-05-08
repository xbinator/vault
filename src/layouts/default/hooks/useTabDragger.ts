/**
 * @file useTabDragger.ts
 * @description 基于 Pragmatic Drag and Drop 的标签页横向拖拽排序组合函数。
 *   封装 draggable/dropTarget 注册、命中判定、auto-scroll 和状态生命周期。
 */

import { shallowRef, type ShallowRef } from 'vue';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import type { TabMovePosition } from '@/stores/tabs';

/**
 * Pragmatic Drag and Drop hitbox 计算出的最近边缘。
 * 与 `@atlaskit/pragmatic-drag-and-drop-hitbox` 的 `Edge` 类型一致。
 * 本模块仅使用 `left` 和 `right`，因为标签栏为横向排列。
 */
export type ClosestEdge = 'top' | 'right' | 'bottom' | 'left';

/**
 * 将 Pragmatic hitbox 的 ClosestEdge 枚举映射为标签排序插入位置。
 * @param edge - 命中区域判定的最近边，null 时默认视为 'after'
 * @returns 排序插入位置
 */
export function closestEdgeToMovePosition(edge: ClosestEdge | null): TabMovePosition {
  return edge === 'left' ? 'before' : 'after';
}

/**
 * 拖拽模块对外暴露的状态接口。
 */
export interface TabDraggerState {
  /** 当前拖拽中的标签 ID，无拖拽时为 null */
  draggingTabId: ShallowRef<string | null>;
  /** 当前悬停的目标标签 ID，无悬停时为 null */
  dropTargetTabId: ShallowRef<string | null>;
  /** 插入位置，无有效目标时为 null */
  dragInsertPosition: ShallowRef<TabMovePosition | null>;
}

/**
 * 拖拽模块对外暴露的操作接口。
 */
export interface TabDraggerAPI {
  /** 为标签元素注册 draggable + dropTarget 能力，返回 cleanup 函数 */
  registerTabElement: (tabId: string, element: HTMLElement) => () => void;
  /** 注销标签元素的拖拽能力 */
  unregisterTabElement: (tabId: string) => void;
  /** 全局清理，组件 onUnmounted 时调用 */
  cleanup: () => void;
  /** 拖拽响应式状态 */
  state: TabDraggerState;
}

/**
 * 创建 HeaderTabs 的 Pragmatic Drag and Drop 拖拽模块。
 * @param scrollContainerRef - 横向滚动容器元素引用
 * @param onMoveTab - 排序回调，参数与 tabsStore.moveTab 一致
 * @param onDragEnded - 拖拽结束时回调（用于设置时间戳以抑制误点击）
 * @returns 拖拽操作与状态接口
 */
export function useTabDragger(
  scrollContainerRef: ShallowRef<HTMLElement | null>,
  onMoveTab: (fromId: string, toId: string, position: TabMovePosition) => void,
  onDragEnded: () => void
): TabDraggerAPI {
  const draggingTabId = shallowRef<string | null>(null);
  const dropTargetTabId = shallowRef<string | null>(null);
  const dragInsertPosition = shallowRef<TabMovePosition | null>(null);

  /** 标签 ID → cleanup 函数映射 */
  const cleanups = new Map<string, () => void>();

  /** auto-scroll 清理函数 */
  let autoScrollCleanup: (() => void) | null = null;

  /** 全局 monitor 清理函数 */
  let monitorCleanup: (() => void) | null = null;

  /**
   * 重置所有拖拽相关状态并通知拖拽结束。
   */
  function resetDragState(): void {
    draggingTabId.value = null;
    dropTargetTabId.value = null;
    dragInsertPosition.value = null;
    onDragEnded();
  }

  /**
   * 注销指定标签的拖拽注册。
   * @param tabId - 标签 ID
   */
  function unregisterTabElement(tabId: string): void {
    const fn = cleanups.get(tabId);
    if (fn) {
      fn();
      cleanups.delete(tabId);
    }
  }

  /**
   * 将标签元素注册为 draggable 和 drop target。
   * 每次调用先清理该标签已有的注册，避免重复注册导致事件堆积。
   * @param tabId - 标签 ID
   * @param element - 标签 DOM 元素
   * @returns 该标签的清理函数
   */
  function registerTabElement(tabId: string, element: HTMLElement): () => void {
    // 如果已注册则先清理旧注册
    unregisterTabElement(tabId);

    const localCleanups: (() => void)[] = [];

    // 注册 draggable
    const dragCleanup = draggable({
      element,
      getInitialData: (): Record<string, unknown> => ({ tabId }),
      onGenerateDragPreview({ nativeSetDragImage }) {
        // 使用原生拖拽预览，保持与旧实现一致的 ghost 视觉
        nativeSetDragImage?.(element, 0, 0);
      },
      onDragStart() {
        draggingTabId.value = tabId;
        dropTargetTabId.value = null;
        dragInsertPosition.value = null;
      },
      onDrop() {
        resetDragState();
      }
    });
    localCleanups.push(dragCleanup);

    // 注册 drop target
    // Pragmatic 的 dropTargetForElements 使用 userData + attachClosestEdge 模式记录命中边
    const dropCleanup = dropTargetForElements({
      element,
      getData: (): Record<string | symbol, unknown> => ({ tabId }),
      getIsSticky: () => true,
      canDrop({ source }) {
        // 不允许拖到自己身上
        return source.data.tabId !== tabId;
      },
      onDrag({ self, location }) {
        // 在每次指针移动时附着最近边信息到 self.data
        attachClosestEdge(self.data, {
          element,
          input: location.current.input,
          allowedEdges: ['left', 'right']
        });
      },
      onDragEnter({ source }) {
        if (source.data.tabId === tabId) return;
        dropTargetTabId.value = tabId;
      },
      onDragLeave() {
        if (dropTargetTabId.value === tabId) {
          dropTargetTabId.value = null;
          dragInsertPosition.value = null;
        }
      }
    });
    localCleanups.push(dropCleanup);

    const combinedCleanup = () => {
      localCleanups.forEach((fn) => fn());
    };
    cleanups.set(tabId, combinedCleanup);

    return combinedCleanup;
  }

  // 激活全局 monitor（单例，整个模块生命周期仅一次）
  monitorCleanup = monitorForElements({
    onDragStart({ source }) {
      draggingTabId.value = source.data.tabId as string;
    },
    onDrag({ location, source }) {
      const target = location.current.dropTargets[0];
      if (!target) {
        dropTargetTabId.value = null;
        dragInsertPosition.value = null;
        return;
      }

      const targetTabId = target.data.tabId as string;
      if (targetTabId === source.data.tabId) {
        dropTargetTabId.value = null;
        dragInsertPosition.value = null;
        return;
      }

      dropTargetTabId.value = targetTabId;

      // 从目标元素的 userData 中提取最近边
      const edge = extractClosestEdge(target.data);
      dragInsertPosition.value = closestEdgeToMovePosition(edge);
    },
    onDrop({ source, location }) {
      const target = location.current.dropTargets[0];
      const fromId = source.data.tabId as string;

      if (!target || target.data.tabId === fromId) {
        resetDragState();
        return;
      }

      const toId = target.data.tabId as string;
      if (!toId || fromId === toId) {
        resetDragState();
        return;
      }

      const edge = extractClosestEdge(target.data);
      const position = closestEdgeToMovePosition(edge);
      onMoveTab(fromId, toId, position);
      resetDragState();
    }
  });

  /**
   * 初始化 auto-scroll（延迟初始化，等待滚动容器就绪）。
   */
  function initAutoScroll(): void {
    const container = scrollContainerRef.value;
    if (!container || autoScrollCleanup) return;

    try {
      autoScrollCleanup = autoScrollForElements({
        element: container,
        canScroll: () => draggingTabId.value !== null,
        getConfiguration: () => ({
          maxScrollSpeed: 'fast'
        })
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[useTabDragger] auto-scroll 初始化失败: ${message}`);
      autoScrollCleanup = null;
    }
  }

  // 延迟初始化 auto-scroll，确保 DOM 已挂载
  setTimeout(() => initAutoScroll(), 0);

  /**
   * 全局清理：遍历所有标签清理 + 清理 monitor + 清理 auto-scroll。
   */
  function cleanup(): void {
    cleanups.forEach((fn) => fn());
    cleanups.clear();

    if (monitorCleanup) {
      monitorCleanup();
      monitorCleanup = null;
    }

    if (autoScrollCleanup) {
      autoScrollCleanup();
      autoScrollCleanup = null;
    }

    resetDragState();
  }

  return {
    registerTabElement,
    unregisterTabElement,
    cleanup,
    state: {
      draggingTabId,
      dropTargetTabId,
      dragInsertPosition
    }
  };
}
