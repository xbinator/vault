/**
 * @file index.test.ts
 * @description BJsonGraph 组件级联动测试。
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BJsonGraph from '@/components/BJsonGraph/index.vue';

describe('BJsonGraph', () => {
  it('locates source selection when node graph emits node-click', async () => {
    const dispatchSelection = vi.fn();
    const wrapper = mount(BJsonGraph, {
      props: {
        value: {
          id: 'json-1',
          name: 'demo',
          path: null,
          ext: 'json',
          content: '{"author":{"name":"Tibis"}}'
        }
      },
      global: {
        stubs: {
          JsonSourceEditor: {
            template: '<div></div>',
            methods: {
              dispatchSelection,
              undo: vi.fn(),
              redo: vi.fn(),
              canUndo: () => false,
              canRedo: () => false,
              focusEditor: vi.fn(),
              focusEditorAtStart: vi.fn(),
              setSearchTerm: vi.fn(),
              findNext: vi.fn(),
              findPrevious: vi.fn(),
              clearSearch: vi.fn(),
              getSelection: () => null,
              insertAtCursor: async () => undefined,
              replaceSelection: async () => undefined,
              replaceDocument: async () => undefined,
              selectLineRange: () => true,
              getSearchState: () => ({ currentIndex: 0, matchCount: 0, term: '' })
            }
          },
          JsonNodeGraph: {
            template: '<button class="node" @click="$emit(\'node-click\', \'/author/name\')">node</button>'
          },
          BPanelSplitter: {
            template: '<div class="splitter"></div>'
          }
        }
      }
    });

    await wrapper.get('.node').trigger('click');

    expect(dispatchSelection).toHaveBeenCalledWith(expect.any(Number), expect.any(Number));
    expect((wrapper.vm as InstanceType<typeof BJsonGraph>).getCurrentPath()).toBe('/author/name');
  });

  it('updates structured selection state from source selection-change', async () => {
    const wrapper = mount(BJsonGraph, {
      props: {
        value: {
          id: 'json-2',
          name: 'demo',
          path: null,
          ext: 'json',
          content: '{"author":{"name":"Tibis"}}'
        }
      },
      global: {
        stubs: {
          JsonSourceEditor: {
            template: '<button class="source" @click="$emit(\'selection-change\', { from: 20, to: 27 })">source</button>',
            methods: {
              dispatchSelection: vi.fn(),
              undo: vi.fn(),
              redo: vi.fn(),
              canUndo: () => false,
              canRedo: () => false,
              focusEditor: vi.fn(),
              focusEditorAtStart: vi.fn(),
              setSearchTerm: vi.fn(),
              findNext: vi.fn(),
              findPrevious: vi.fn(),
              clearSearch: vi.fn(),
              getSelection: () => null,
              insertAtCursor: async () => undefined,
              replaceSelection: async () => undefined,
              replaceDocument: async () => undefined,
              selectLineRange: () => true,
              getSearchState: () => ({ currentIndex: 0, matchCount: 0, term: '' })
            }
          },
          JsonNodeGraph: {
            template: '<div></div>'
          },
          BPanelSplitter: {
            template: '<div class="splitter"></div>'
          }
        }
      }
    });

    await wrapper.get('.source').trigger('click');

    expect((wrapper.vm as InstanceType<typeof BJsonGraph>).getCurrentPath()).toBe('/author/name');
    expect((wrapper.vm as InstanceType<typeof BJsonGraph>).getCurrentNodeType()).toBe('string');
    expect((wrapper.vm as InstanceType<typeof BJsonGraph>).getValueAtPath('/author/name')).toBe('Tibis');
  });

  it('resets structured selection state when switching to another json file', async () => {
    const wrapper = mount(BJsonGraph, {
      props: {
        value: {
          id: 'json-2',
          name: 'demo',
          path: null,
          ext: 'json',
          content: '{"author":{"name":"Tibis"}}'
        }
      },
      global: {
        stubs: {
          JsonSourceEditor: {
            template: '<button class="source" @click="$emit(\'selection-change\', { from: 20, to: 27 })">source</button>',
            methods: {
              dispatchSelection: vi.fn(),
              undo: vi.fn(),
              redo: vi.fn(),
              canUndo: () => false,
              canRedo: () => false,
              focusEditor: vi.fn(),
              focusEditorAtStart: vi.fn(),
              setSearchTerm: vi.fn(),
              findNext: vi.fn(),
              findPrevious: vi.fn(),
              clearSearch: vi.fn(),
              getSelection: () => null,
              insertAtCursor: async () => undefined,
              replaceSelection: async () => undefined,
              replaceDocument: async () => undefined,
              selectLineRange: () => true,
              getSearchState: () => ({ currentIndex: 0, matchCount: 0, term: '' })
            }
          },
          JsonNodeGraph: {
            template: '<div></div>'
          },
          BPanelSplitter: {
            template: '<div class="splitter"></div>'
          }
        }
      }
    });

    await wrapper.get('.source').trigger('click');
    expect((wrapper.vm as InstanceType<typeof BJsonGraph>).getCurrentPath()).toBe('/author/name');

    await wrapper.setProps({
      value: {
        id: 'json-3',
        name: 'next',
        path: null,
        ext: 'json',
        content: '{"meta":{"version":1}}'
      }
    });

    expect((wrapper.vm as InstanceType<typeof BJsonGraph>).getCurrentPath()).toBeNull();
    expect((wrapper.vm as InstanceType<typeof BJsonGraph>).getCurrentNodeType()).toBeNull();
  });
});
