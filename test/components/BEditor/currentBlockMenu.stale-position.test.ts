/* @vitest-environment jsdom */
/**
 * @file currentBlockMenu.stale-position.test.ts
 * @description 验证 CurrentBlockMenu 在文档更新后会丢弃越界的旧 block 位置。
 */

import type { VueWrapper } from '@vue/test-utils';
import type { ComponentPublicInstance } from 'vue';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, test, vi } from 'vitest';
import CurrentBlockMenu from '@/components/BEditor/components/CurrentBlockMenu.vue';

/**
 * CurrentBlockMenu 公开实例。
 */
interface CurrentBlockMenuVm extends ComponentPublicInstance {}

/**
 * 最小编辑器事件名。
 */
type EditorEventName = 'selectionUpdate' | 'transaction' | 'focus' | 'blur';

/**
 * 最小可测编辑器替身。
 */
interface TestEditor {
  isFocused: boolean;
  on: (event: EditorEventName, handler: () => void) => void;
  off: (event: EditorEventName, handler: () => void) => void;
  emit: (event: EditorEventName) => void;
  isActive: (name: string, attrs?: Record<string, unknown>) => boolean;
  view: {
    dom: HTMLElement;
    posAtDOM: (node: Node, offset: number) => number;
    nodeDOM: (pos: number) => HTMLElement | null;
  };
  state: {
    doc: {
      resolve: (pos: number) => {
        depth: number;
        node: (depth: number) => { attrs: Record<string, unknown>; isBlock: boolean; nodeSize: number; type: { name: string } };
        index: (depth: number) => number;
        before: (depth: number) => number;
        start: (depth: number) => number;
        firstChild: { attrs: Record<string, unknown>; nodeSize: number; type: { name: string } } | null;
      };
    };
  };
}

/**
 * 创建可触发事件的编辑器替身。
 * @returns 编辑器与关联 DOM
 */
function createEditorStub(): { editor: TestEditor; blockElement: HTMLElement } {
  const handlers = new Map<EditorEventName, Set<() => void>>();
  const editorRoot = document.createElement('div');
  const blockElement = document.createElement('p');
  blockElement.textContent = 'Hello';
  editorRoot.appendChild(blockElement);
  document.body.appendChild(editorRoot);

  Object.defineProperty(editorRoot, 'getBoundingClientRect', {
    configurable: true,
    value: (): DOMRect => new DOMRect(40, 40, 400, 300)
  });
  Object.defineProperty(blockElement, 'getBoundingClientRect', {
    configurable: true,
    value: (): DOMRect => new DOMRect(60, 80, 200, 24)
  });

  const resolve = vi.fn((pos: number) => {
    if (pos !== 324) {
      throw new RangeError(`Position ${pos} out of range`);
    }
    return {
      depth: 1,
      node: () => ({
        attrs: {},
        isBlock: true,
        nodeSize: 12,
        type: { name: 'paragraph' }
      }),
      index: () => 0,
      before: () => 0,
      start: () => 1,
      firstChild: null
    };
  });

  const editor: TestEditor = {
    isFocused: true,
    on(event, handler) {
      const set = handlers.get(event) ?? new Set<() => void>();
      set.add(handler);
      handlers.set(event, set);
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler);
    },
    emit(event) {
      handlers.get(event)?.forEach((handler) => handler());
    },
    isActive: () => false,
    view: {
      dom: editorRoot,
      posAtDOM: () => 324,
      nodeDOM: () => blockElement
    },
    state: {
      doc: {
        resolve,
        firstChild: null
      }
    }
  };

  return { editor, blockElement };
}

/**
 * 等待组件与文档事件稳定。
 */
async function flushUi(): Promise<void> {
  await nextTick();
  await Promise.resolve();
}

describe('CurrentBlockMenu stale position guard', () => {
  test('drops a stale hovered block position after document changes', async () => {
    const { editor, blockElement } = createEditorStub();
    const wrapper = mount(CurrentBlockMenu, {
      attachTo: document.body,
      props: {
        editor
      },
      global: {
        stubs: {
          BScrollbar: {
            template: '<div><slot /></div>'
          },
          Icon: {
            template: '<span />'
          }
        }
      }
    }) as VueWrapper<CurrentBlockMenuVm>;

    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 80, clientY: 90 }));
    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      value: blockElement
    });
    blockElement.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 80, clientY: 90 }));
    await flushUi();

    editor.state.doc.resolve = vi.fn(() => {
      throw new RangeError('Position 324 out of range');
    });

    expect(() => editor.emit('transaction')).not.toThrow();
    await flushUi();

    expect(wrapper.find('.current-block-menu').exists()).toBe(false);
    wrapper.unmount();
  });
});
