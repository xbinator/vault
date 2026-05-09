/**
 * @file selectionToolbarRich.test.ts
 * @description SelectionToolbarRich 锚点定位回归测试。
 * @vitest-environment jsdom
 */

import type { Editor } from '@tiptap/vue-3';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import SelectionToolbarRich from '@/components/BEditor/components/SelectionToolbarRich.vue';

/**
 * 记录最近一次 BubbleMenu 接收到的 props，便于断言宿主传参。
 */
type BubbleMenuPropsSnapshot = {
  getReferencedVirtualElement?: (() => { getBoundingClientRect: () => DOMRect; getClientRects: () => DOMRect[] } | null) | undefined;
};

const { bubbleMenuPropsRef } = vi.hoisted(() => ({
  bubbleMenuPropsRef: {
    current: null as BubbleMenuPropsSnapshot | null
  }
}));

vi.mock('@tiptap/vue-3/menus', () => ({
  BubbleMenu: defineComponent({
    props: {
      editor: {
        type: Object,
        required: true
      },
      pluginKey: {
        type: [String, Object],
        default: undefined
      },
      shouldShow: {
        type: Function,
        default: undefined
      },
      getReferencedVirtualElement: {
        type: Function,
        default: undefined
      },
      options: {
        type: Object,
        default: undefined
      }
    },
    /**
     * 记录 BubbleMenu props，供测试读取。
     * @param props - 宿主传入的 BubbleMenu 参数
     * @returns 默认插槽
     */
    setup(props, { slots }) {
      bubbleMenuPropsRef.current = props as BubbleMenuPropsSnapshot;
      return () => slots.default?.();
    },
    template: '<div class="bubble-menu-stub"><slot /></div>'
  })
}));

/**
 * 构造最小可用的 Tiptap 编辑器桩对象。
 * @param selectionFrom - 选区起点
 * @param selectionTo - 选区终点
 * @returns 可供 SelectionToolbarRich 使用的编辑器实例
 */
function createEditorStub(selectionFrom = 1, selectionTo = 12): Editor {
  return {
    isEditable: true,
    isActive: vi.fn(() => false),
    on: vi.fn(),
    off: vi.fn(),
    state: {
      selection: {
        from: selectionFrom,
        to: selectionTo
      },
      doc: {
        textBetween: vi.fn(() => '标题\n第二行')
      }
    },
    view: {
      coordsAtPos: vi.fn((pos: number) => {
        if (pos === 1) {
          return { top: 10, left: 20, right: 80, bottom: 30 };
        }

        return { top: 40, left: 24, right: 100, bottom: 60 };
      }),
      dispatch: vi.fn()
    }
  } as unknown as Editor;
}

describe('SelectionToolbarRich', () => {
  beforeEach(() => {
    bubbleMenuPropsRef.current = null;
  });

  test('anchors BubbleMenu to the selection start line in rich mode', () => {
    mount(SelectionToolbarRich, {
      props: {
        editor: createEditorStub(),
        visible: true,
        formatButtons: []
      },
      global: {
        stubs: {
          SelectionToolbar: true
        }
      }
    });

    expect(bubbleMenuPropsRef.current?.getReferencedVirtualElement).toBeTypeOf('function');

    const virtualElement = bubbleMenuPropsRef.current?.getReferencedVirtualElement?.();

    expect(virtualElement?.getBoundingClientRect()).toEqual(new DOMRect(20, 10, 60, 20));
    expect(virtualElement?.getClientRects()).toEqual([new DOMRect(20, 10, 60, 20)]);
  });

  test('normalizes all-selection anchor to the first document position', () => {
    const editor = createEditorStub(0, 12);

    mount(SelectionToolbarRich, {
      props: {
        editor,
        visible: true,
        formatButtons: []
      },
      global: {
        stubs: {
          SelectionToolbar: true
        }
      }
    });

    bubbleMenuPropsRef.current?.getReferencedVirtualElement?.();

    expect(editor.view.coordsAtPos).toHaveBeenCalledWith(1);
    expect(editor.view.coordsAtPos).not.toHaveBeenCalledWith(0);
  });
});
