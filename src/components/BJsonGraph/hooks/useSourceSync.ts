/**
 * @file useSourceSync.ts
 * @description 管理源码与节点图联动状态。
 */

/** 联动来源类型。 */
type SyncOrigin = 'graph' | 'editor' | null;

/**
 * 源码联动控制器。
 */
export interface SourceSyncController {
  /** 从节点图定位源码。 */
  locateSourceFromGraph: (dispatchSelection: (start: number, end: number) => void, start: number, end: number) => void;
  /** 从源码定位节点。 */
  locateNodeFromEditor: (offset: number) => void;
  /** 是否应跳过反向同步。 */
  shouldSkipReverseSync: () => boolean;
  /** 是否应该触发 fitView。 */
  shouldFitView: (targetInViewport: boolean, explicitRequest?: boolean) => boolean;
  /** 获取最近一次源码偏移量。 */
  getLastEditorOffset: () => number | null;
}

/**
 * 创建联动控制器。
 * @returns 联动控制器
 */
export function createSourceSync(): SourceSyncController {
  let syncOrigin: SyncOrigin = null;
  let isFirstLayout = true;
  let lastEditorOffset: number | null = null;

  return {
    locateSourceFromGraph(dispatchSelection: (start: number, end: number) => void, start: number, end: number): void {
      syncOrigin = 'graph';
      dispatchSelection(start, end);
      window.requestAnimationFrame((): void => {
        syncOrigin = null;
      });
    },
    locateNodeFromEditor(offset: number): void {
      syncOrigin = 'editor';
      lastEditorOffset = offset;
      syncOrigin = null;
    },
    shouldSkipReverseSync(): boolean {
      return syncOrigin === 'graph';
    },
    shouldFitView(targetInViewport: boolean, explicitRequest = false): boolean {
      if (explicitRequest) {
        return true;
      }

      if (isFirstLayout) {
        isFirstLayout = false;
        return true;
      }

      return !targetInViewport;
    },
    getLastEditorOffset(): number | null {
      return lastEditorOffset;
    }
  };
}
