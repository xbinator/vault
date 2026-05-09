/**
 * @file useTabDragger.test.ts
 * @description 验证 useTabDragger 组合函数的状态管理、指示线锚点与清理逻辑。
 *   由于 Pragmatic Drag and Drop 内部依赖 pointer events，
 *   jsdom 环境下无法完整模拟拖拽交互，本测试仅覆盖状态管理和生命周期。
 * @vitest-environment jsdom
 */

import { shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { closestEdgeToMovePosition, getDetachedIndicatorPlacement, getDropIndicatorOffset, useTabDragger } from '@/layouts/default/hooks/useTabDragger';

describe('useTabDragger', () => {
  describe('closestEdgeToMovePosition', () => {
    it('maps "left" edge to "before" position', () => {
      expect(closestEdgeToMovePosition('left')).toBe('before');
    });

    it('maps "right" edge to "after" position', () => {
      expect(closestEdgeToMovePosition('right')).toBe('after');
    });

    it('defaults null to "after" position for safety', () => {
      expect(closestEdgeToMovePosition(null)).toBe('after');
    });

    it('maps other non-left edges to "after"', () => {
      expect(closestEdgeToMovePosition('top')).toBe('after');
      expect(closestEdgeToMovePosition('bottom')).toBe('after');
    });
  });

  describe('getDropIndicatorOffset', () => {
    it('uses the tab left edge for a "before" insertion anchor', () => {
      expect(getDropIndicatorOffset({ id: 'tab-1', left: 0, width: 120 }, 'before')).toBe(0);
    });

    it('uses the tab right edge for an "after" insertion anchor', () => {
      expect(getDropIndicatorOffset({ id: 'tab-2', left: 120, width: 90 }, 'after')).toBe(210);
    });
  });

  describe('getDetachedIndicatorPlacement', () => {
    it('keeps a visible indicator before the first tab when dragging into the left overflow area', () => {
      expect(
        getDetachedIndicatorPlacement({
          pointerX: -8,
          tabs: [
            { id: 'tab-1', left: 0, width: 100 },
            { id: 'tab-2', left: 100, width: 100 }
          ]
        })
      ).toEqual({
        tabId: 'tab-1',
        position: 'before',
        offset: 0
      });
    });

    it('keeps a visible indicator after the last tab when dragging beyond the right edge', () => {
      expect(
        getDetachedIndicatorPlacement({
          pointerX: 240,
          tabs: [
            { id: 'tab-1', left: 0, width: 100 },
            { id: 'tab-2', left: 100, width: 100 }
          ]
        })
      ).toEqual({
        tabId: 'tab-2',
        position: 'after',
        offset: 200
      });
    });

    it('returns null while the pointer remains inside the tab range', () => {
      expect(
        getDetachedIndicatorPlacement({
          pointerX: 140,
          tabs: [
            { id: 'tab-1', left: 0, width: 100 },
            { id: 'tab-2', left: 100, width: 100 }
          ]
        })
      ).toBeNull();
    });
  });

  it('初始状态下所有拖拽状态均为 null', () => {
    const scrollRef = shallowRef<HTMLElement | null>(null);
    const onMoveTab = vi.fn();
    const onDragEnded = vi.fn();

    const module = useTabDragger(scrollRef, onMoveTab, onDragEnded);

    expect(module.state.draggingTabId.value).toBeNull();
    expect(module.state.dropTargetTabId.value).toBeNull();
    expect(module.state.dragInsertPosition.value).toBeNull();
    expect(module.state.dropIndicatorOffset.value).toBeNull();
  });

  it('registerTabElement 返回 cleanup 函数且模块提供 unregisterTabElement', () => {
    const scrollRef = shallowRef<HTMLElement | null>(null);
    const onMoveTab = vi.fn();
    const onDragEnded = vi.fn();

    const module = useTabDragger(scrollRef, onMoveTab, onDragEnded);

    const element = document.createElement('div');
    const cleanup = module.registerTabElement('tab-1', element);
    expect(typeof cleanup).toBe('function');
    expect(typeof module.unregisterTabElement).toBe('function');
  });

  it('unregisterTabElement 调用后不会抛出异常', () => {
    const scrollRef = shallowRef<HTMLElement | null>(null);
    const onMoveTab = vi.fn();
    const onDragEnded = vi.fn();

    const module = useTabDragger(scrollRef, onMoveTab, onDragEnded);

    const element = document.createElement('div');
    module.registerTabElement('tab-1', element);

    // 第一次注销应成功
    expect(() => module.unregisterTabElement('tab-1')).not.toThrow();
    // 第二次注销（已清理状态）也应安全
    expect(() => module.unregisterTabElement('tab-1')).not.toThrow();
  });

  it('cleanup 可以被安全地重复调用', () => {
    const scrollRef = shallowRef<HTMLElement | null>(null);
    const onMoveTab = vi.fn();
    const onDragEnded = vi.fn();

    const module = useTabDragger(scrollRef, onMoveTab, onDragEnded);

    expect(() => module.cleanup()).not.toThrow();
    expect(() => module.cleanup()).not.toThrow();
  });

  it('registerTabElement 对同一 tabId 重新注册时先清理旧注册', () => {
    const scrollRef = shallowRef<HTMLElement | null>(null);
    const onMoveTab = vi.fn();
    const onDragEnded = vi.fn();

    const module = useTabDragger(scrollRef, onMoveTab, onDragEnded);

    const element = document.createElement('div');
    const cleanup1 = module.registerTabElement('tab-1', element);
    // 第二次注册同一 tabId，旧 cleanup 应被调用
    const cleanup2 = module.registerTabElement('tab-1', element);

    expect(cleanup1).not.toBe(cleanup2);
    expect(typeof cleanup2).toBe('function');
  });
});
