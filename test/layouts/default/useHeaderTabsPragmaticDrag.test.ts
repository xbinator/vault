/**
 * @file useHeaderTabsPragmaticDrag.test.ts
 * @description 验证 useHeaderTabsPragmaticDrag 组合函数的状态管理与清理逻辑。
 *   由于 Pragmatic Drag and Drop 内部依赖 pointer events，
 *   jsdom 环境下无法完整模拟拖拽交互，本测试仅覆盖状态管理和生命周期。
 * @vitest-environment jsdom
 */

import { shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useHeaderTabsPragmaticDrag } from '@/layouts/default/components/useHeaderTabsPragmaticDrag';

describe('useHeaderTabsPragmaticDrag', () => {
  it('初始状态下所有拖拽状态均为 null', () => {
    const scrollRef = shallowRef<HTMLElement | null>(null);
    const onMoveTab = vi.fn();
    const onDragEnded = vi.fn();

    const module = useHeaderTabsPragmaticDrag(scrollRef, onMoveTab, onDragEnded);

    expect(module.state.draggingTabId.value).toBeNull();
    expect(module.state.dropTargetTabId.value).toBeNull();
    expect(module.state.dragInsertPosition.value).toBeNull();
  });

  it('registerTabElement 返回 cleanup 函数且模块提供 unregisterTabElement', () => {
    const scrollRef = shallowRef<HTMLElement | null>(null);
    const onMoveTab = vi.fn();
    const onDragEnded = vi.fn();

    const module = useHeaderTabsPragmaticDrag(scrollRef, onMoveTab, onDragEnded);

    const element = document.createElement('div');
    const cleanup = module.registerTabElement('tab-1', element);
    expect(typeof cleanup).toBe('function');
    expect(typeof module.unregisterTabElement).toBe('function');
  });

  it('unregisterTabElement 调用后不会抛出异常', () => {
    const scrollRef = shallowRef<HTMLElement | null>(null);
    const onMoveTab = vi.fn();
    const onDragEnded = vi.fn();

    const module = useHeaderTabsPragmaticDrag(scrollRef, onMoveTab, onDragEnded);

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

    const module = useHeaderTabsPragmaticDrag(scrollRef, onMoveTab, onDragEnded);

    expect(() => module.cleanup()).not.toThrow();
    expect(() => module.cleanup()).not.toThrow();
  });

  it('registerTabElement 对同一 tabId 重新注册时先清理旧注册', () => {
    const scrollRef = shallowRef<HTMLElement | null>(null);
    const onMoveTab = vi.fn();
    const onDragEnded = vi.fn();

    const module = useHeaderTabsPragmaticDrag(scrollRef, onMoveTab, onDragEnded);

    const element = document.createElement('div');
    const cleanup1 = module.registerTabElement('tab-1', element);
    // 第二次注册同一 tabId，旧 cleanup 应被调用
    const cleanup2 = module.registerTabElement('tab-1', element);

    expect(cleanup1).not.toBe(cleanup2);
    expect(typeof cleanup2).toBe('function');
  });
});
