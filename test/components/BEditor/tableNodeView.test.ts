/* @vitest-environment jsdom */

import type { DecorationSource } from '@tiptap/pm/view';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TableView from '@/components/BEditor/components/TableView.vue';

const chainRecorder = {
  focus: vi.fn(),
  addColumnBefore: vi.fn(),
  addColumnAfter: vi.fn(),
  addRowBefore: vi.fn(),
  addRowAfter: vi.fn(),
  deleteColumn: vi.fn(),
  deleteRow: vi.fn(),
  run: vi.fn()
};

chainRecorder.focus.mockReturnValue(chainRecorder);
chainRecorder.addColumnBefore.mockReturnValue(chainRecorder);
chainRecorder.addColumnAfter.mockReturnValue(chainRecorder);
chainRecorder.addRowBefore.mockReturnValue(chainRecorder);
chainRecorder.addRowAfter.mockReturnValue(chainRecorder);
chainRecorder.deleteColumn.mockReturnValue(chainRecorder);
chainRecorder.deleteRow.mockReturnValue(chainRecorder);
chainRecorder.run.mockReturnValue(true);

/**
 * 构造最小 NodeView props。
 * @param editable - 是否可编辑
 * @returns NodeView props
 */
function createNodeViewProps(editable = true) {
  return {
    editor: {
      isEditable: editable,
      chain: () => chainRecorder
    },
    extension: {},
    getPos: () => 0,
    deleteNode: vi.fn(),
    updateAttributes: vi.fn(),
    view: {} as never,
    innerDecorations: {} as DecorationSource,
    HTMLAttributes: {},
    node: {
      attrs: {},
      type: { name: 'table' }
    },
    decorations: [],
    selected: false
  };
}

/**
 * 统计匹配节点中当前可见的数量。
 * @param wrapper - 组件挂载结果
 * @param selector - 查询选择器
 * @returns 可见节点数量
 */
function countVisible(wrapper: ReturnType<typeof mount>, selector: string): number {
  return wrapper.findAll(selector).filter((node) => node.isVisible()).length;
}

describe('TableView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows add controls when hovering a divider', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    Object.defineProperty(scroller.element, 'scrollLeft', { value: 0, configurable: true });

    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(wrapper.get('.b-editor-table__add-button').isVisible()).toBe(true);
    expect(wrapper.get('.b-editor-table__line-highlight').isVisible()).toBe(true);
    expect(wrapper.get('.b-editor-table__add-button--column').isVisible()).toBe(true);
    expect(wrapper.get('.b-editor-table__button-icon').isVisible()).toBe(true);
    expect(wrapper.get('.b-editor-table__line-highlight').attributes('style')).toContain('left: 119px');
    expect(wrapper.get('.b-editor-table__add-button').attributes('title')).toBe('新增列');
    expect(wrapper.get('.b-editor-table__add-button').attributes('aria-label')).toBe('新增列');
  });

  it('renders divider overlays outside the scroller to avoid overflow clipping', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(wrapper.get('.b-editor-table__line-overlay').isVisible()).toBe(true);
    expect(scroller.find('.b-editor-table__line-overlay').exists()).toBe(false);
  });

  it('shows both row and column remove controls when hovering a cell segment away from dividers', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    await scroller.trigger('mousemove', { clientX: 180, clientY: 60 });

    expect(countVisible(wrapper, '.b-editor-table__segment-button-group')).toBe(2);
    expect(countVisible(wrapper, '.b-editor-table__remove-button')).toBe(2);
    expect(wrapper.get('.b-editor-table__remove-button--row').isVisible()).toBe(true);
    expect(wrapper.get('.b-editor-table__remove-button--column').isVisible()).toBe(true);
    expect(wrapper.get('.b-editor-table__segment-button-group--row').attributes('style')).toContain('left: 0px');
    expect(wrapper.get('.b-editor-table__segment-button-group--row').attributes('style')).toContain('top: 60px');
    expect(wrapper.get('.b-editor-table__segment-button-group--column').attributes('style')).toContain('left: 180px');
    expect(wrapper.get('.b-editor-table__segment-button-group--column').attributes('style')).toContain('top: 0px');
  });

  it('delays switching from segment remove controls to divider add controls', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    await scroller.trigger('mousemove', { clientX: 180, clientY: 60 });
    expect(countVisible(wrapper, '.b-editor-table__segment-button-group')).toBe(2);

    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(wrapper.get('.b-editor-table__segment-overlay').attributes('style')).not.toContain('display: none;');
    expect(wrapper.get('.b-editor-table__line-overlay').attributes('style')).toContain('display: none;');
    expect(wrapper.get('.b-editor-table__add-button').isVisible()).toBe(false);

    vi.runAllTimers();
    await nextTick();
    await nextTick();

    expect(wrapper.get('.b-editor-table__segment-overlay').attributes('style')).toContain('display: none;');
    expect(wrapper.get('.b-editor-table__line-overlay').attributes('style')).not.toContain('display: none;');
    expect(wrapper.get('.b-editor-table__add-button').attributes('style')).not.toContain('display: none;');
  });

  it('uses the row add-button variant when hovering a horizontal divider', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    await scroller.trigger('mousemove', { clientX: 80, clientY: 119 });

    expect(wrapper.get('.b-editor-table__add-button--row').isVisible()).toBe(true);
    expect(wrapper.get('.b-editor-table__line-highlight').attributes('style')).toContain('top: 119px');
    expect(wrapper.get('.b-editor-table__add-button').attributes('style')).toContain('left: 0px');
    expect(wrapper.get('.b-editor-table__add-button').attributes('style')).toContain('top: 120px');
    expect(wrapper.get('.b-editor-table__add-button').attributes('title')).toBe('新增行');
    expect(wrapper.get('.b-editor-table__add-button').attributes('aria-label')).toBe('新增行');
  });

  it('keeps leading-edge add controls inside the reserved viewport gutter', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    await scroller.trigger('mousemove', { clientX: 1, clientY: 20 });

    const style = wrapper.get('.b-editor-table__add-button').attributes('style');
    expect(style).toContain('top: 0px');
    expect(style).toContain('left: 0px');
  });

  it('keeps controls visible when the pointer leaves the scroller toward an overlay button', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    const addButton = wrapper.get('.b-editor-table__add-button');
    await scroller.trigger('mouseleave', { relatedTarget: addButton.element });

    expect(wrapper.get('.b-editor-table__add-button').isVisible()).toBe(true);
  });

  it('does not immediately hide controls when scroller mouseleave fires before the next viewport move', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    const viewport = wrapper.get('.b-editor-table__viewport');
    vi.spyOn(viewport.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(scroller.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);

    await scroller.trigger('mousemove', { clientX: 321, clientY: 120 });
    await scroller.trigger('mouseleave');

    expect(wrapper.get('.b-editor-table__add-button').isVisible()).toBe(true);

    await viewport.trigger('mousemove', { clientX: 321, clientY: 92 });
    expect(wrapper.get('.b-editor-table__add-button').isVisible()).toBe(true);
  });

  it('does not immediately hide controls when viewport mouseleave fires before button enter', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    const viewport = wrapper.get('.b-editor-table__viewport');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });
    await viewport.trigger('mouseleave');

    expect(wrapper.get('.b-editor-table__add-button').isVisible()).toBe(true);

    const addButton = wrapper.get('.b-editor-table__add-button');
    await addButton.trigger('mouseenter');
    vi.runAllTimers();
    await nextTick();

    expect(wrapper.get('.b-editor-table__add-button').isVisible()).toBe(true);
  });

  it('keeps controls visible when global mousemove continues toward the button after leaving the viewport', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    const viewport = wrapper.get('.b-editor-table__viewport');
    vi.spyOn(viewport.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(scroller.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);

    await scroller.trigger('mousemove', { clientX: 321, clientY: 120 });
    await viewport.trigger('mouseleave');
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 321, clientY: 92 }));
    await nextTick();

    expect(wrapper.get('.b-editor-table__add-button').isVisible()).toBe(true);
  });

  it('keeps add controls visible while the pointer moves toward the add button outside the table', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    const viewport = wrapper.get('.b-editor-table__viewport');
    vi.spyOn(viewport.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(scroller.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    await scroller.trigger('mousemove', { clientX: 321, clientY: 120 });
    await viewport.trigger('mousemove', { clientX: 321, clientY: 92 });

    expect(wrapper.get('.b-editor-table__add-button').isVisible()).toBe(true);

    const addButton = wrapper.get('.b-editor-table__add-button');
    await addButton.trigger('mouseenter');
    vi.runAllTimers();
    await nextTick();

    expect(wrapper.find('.b-editor-table__add-button').exists()).toBe(true);
  });

  it('keeps remove controls visible while the pointer moves toward the remove button outside the table', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    const viewport = wrapper.get('.b-editor-table__viewport');
    vi.spyOn(viewport.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(scroller.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    await scroller.trigger('mousemove', { clientX: 380, clientY: 160 });
    await viewport.trigger('mousemove', { clientX: 192, clientY: 160 });

    expect(wrapper.get('.b-editor-table__remove-button--row').isVisible()).toBe(true);

    const removeButton = wrapper.get('.b-editor-table__remove-button--row');
    await removeButton.trigger('mouseenter');
    vi.runAllTimers();
    await nextTick();

    expect(wrapper.get('.b-editor-table__remove-button--row').isVisible()).toBe(true);
  });

  it('hides controls after mouseleave', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    const viewport = wrapper.get('.b-editor-table__viewport');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });
    await scroller.trigger('mouseleave');
    await viewport.trigger('mouseleave');
    vi.runAllTimers();
    await nextTick();

    expect(wrapper.get('.b-editor-table__add-button').isVisible()).toBe(false);
    expect(wrapper.get('.b-editor-table__remove-button').isVisible()).toBe(false);
  });

  it('keeps the last add-control position styles after the overlay is hidden', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    const viewport = wrapper.get('.b-editor-table__viewport');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    const visibleAddButtonStyle = wrapper.get('.b-editor-table__add-button').attributes('style');
    const visibleLineStyle = wrapper.get('.b-editor-table__line-highlight').attributes('style');

    await scroller.trigger('mouseleave');
    await viewport.trigger('mouseleave');
    vi.runAllTimers();
    await nextTick();

    expect(wrapper.get('.b-editor-table__add-button').isVisible()).toBe(false);
    expect(wrapper.get('.b-editor-table__line-highlight').isVisible()).toBe(false);
    expect(wrapper.get('.b-editor-table__add-button').attributes('style')).toBe(visibleAddButtonStyle);
    expect(wrapper.get('.b-editor-table__line-highlight').attributes('style')).toBe(visibleLineStyle);
  });

  it('keeps the last remove-control position styles after the overlay is hidden', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    const viewport = wrapper.get('.b-editor-table__viewport');
    await scroller.trigger('mousemove', { clientX: 180, clientY: 60 });

    const visibleRowStyle = wrapper.get('.b-editor-table__segment-button-group--row').attributes('style');
    const visibleColumnStyle = wrapper.get('.b-editor-table__segment-button-group--column').attributes('style');

    await scroller.trigger('mouseleave');
    await viewport.trigger('mouseleave');
    vi.runAllTimers();
    await nextTick();

    expect(wrapper.get('.b-editor-table__remove-button--row').isVisible()).toBe(false);
    expect(wrapper.get('.b-editor-table__remove-button--column').isVisible()).toBe(false);
    expect(wrapper.get('.b-editor-table__segment-button-group--row').attributes('style')).toBe(visibleRowStyle);
    expect(wrapper.get('.b-editor-table__segment-button-group--column').attributes('style')).toBe(visibleColumnStyle);
  });

  it('does not show controls when the editor is not editable', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps(false)
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(wrapper.get('.b-editor-table__add-button').isVisible()).toBe(false);
    expect(wrapper.get('.b-editor-table__remove-button').isVisible()).toBe(false);
  });

  it('recomputes hover state after horizontal scrolling', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-editor-table__scroller');
    Object.defineProperty(scroller.element, 'scrollLeft', { value: 120, configurable: true });

    await scroller.trigger('scroll');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(wrapper.get('.b-editor-table__add-button').isVisible()).toBe(true);
  });
});
