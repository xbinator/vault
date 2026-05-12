/* @vitest-environment jsdom */

import type { DecorationSource } from '@tiptap/pm/view';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('TableView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows add controls when hovering a divider', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-table-node-view__scroller');
    Object.defineProperty(scroller.element, 'scrollLeft', { value: 0, configurable: true });

    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(wrapper.find('.b-table-node-view__add-button').exists()).toBe(true);
    expect(wrapper.find('.b-table-node-view__line-highlight').exists()).toBe(true);
    expect(wrapper.find('.b-table-node-view__add-button--column').exists()).toBe(true);
    expect(wrapper.get('.b-table-node-view__line-highlight').attributes('style')).toContain('left: 151px');
  });

  it('renders divider overlays outside the scroller to avoid overflow clipping', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-table-node-view__scroller');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(wrapper.find('.b-table-node-view__line-overlay').exists()).toBe(true);
    expect(scroller.find('.b-table-node-view__line-overlay').exists()).toBe(false);
  });

  it('shows both row and column remove controls when hovering a cell segment away from dividers', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-table-node-view__scroller');
    await scroller.trigger('mousemove', { clientX: 180, clientY: 60 });

    expect(wrapper.findAll('.b-table-node-view__segment-button-group')).toHaveLength(2);
    expect(wrapper.findAll('.b-table-node-view__remove-button')).toHaveLength(2);
    expect(wrapper.find('.b-table-node-view__remove-button--row').exists()).toBe(true);
    expect(wrapper.find('.b-table-node-view__remove-button--column').exists()).toBe(true);
    expect(wrapper.get('.b-table-node-view__segment-button-group--row').attributes('style')).toContain('left: 23px');
    expect(wrapper.get('.b-table-node-view__segment-button-group--column').attributes('style')).toContain('top: 23px');
  });

  it('uses the row add-button variant when hovering a horizontal divider', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-table-node-view__scroller');
    await scroller.trigger('mousemove', { clientX: 80, clientY: 119 });

    expect(wrapper.find('.b-table-node-view__add-button--row').exists()).toBe(true);
    expect(wrapper.get('.b-table-node-view__line-highlight').attributes('style')).toContain('top: 151px');
    expect(wrapper.get('.b-table-node-view__add-button').attributes('style')).toContain('left: 23px');
  });

  it('keeps leading-edge add controls inside the reserved viewport gutter', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-table-node-view__scroller');
    await scroller.trigger('mousemove', { clientX: 1, clientY: 20 });

    const style = wrapper.get('.b-table-node-view__add-button').attributes('style');
    expect(style).toContain('top: 32px');
    expect(style).toContain('left: 23px');
  });

  it('hides controls after mouseleave', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-table-node-view__scroller');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });
    await scroller.trigger('mouseleave');

    expect(wrapper.find('.b-table-node-view__add-button').exists()).toBe(false);
    expect(wrapper.find('.b-table-node-view__remove-button').exists()).toBe(false);
  });

  it('does not show controls when the editor is not editable', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps(false)
    });

    const scroller = wrapper.get('.b-table-node-view__scroller');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(wrapper.find('.b-table-node-view__add-button').exists()).toBe(false);
    expect(wrapper.find('.b-table-node-view__remove-button').exists()).toBe(false);
  });

  it('recomputes hover state after horizontal scrolling', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-table-node-view__scroller');
    Object.defineProperty(scroller.element, 'scrollLeft', { value: 120, configurable: true });

    await scroller.trigger('scroll');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(wrapper.find('.b-table-node-view__add-button').exists()).toBe(true);
  });
});
