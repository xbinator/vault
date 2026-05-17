/**
 * @file SourceEditor.test.ts
 * @description SourceEditor 事件行为测试。
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SourceEditor from '@/components/BJsonGraph/components/SourceEditor.vue';

describe('SourceEditor', () => {
  beforeEach(() => {
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      writable: true,
      value: vi.fn(
        () =>
          ({
            length: 0,
            item: () => null,
            [Symbol.iterator]: function* iterator() {
              yield* [];
            }
          } as DOMRectList)
      )
    });
  });

  it('emits update:value once for a document replacement', async () => {
    const wrapper = mount(SourceEditor, {
      props: {
        value: '{"a":1}'
      }
    });

    await Promise.resolve();
    await wrapper.vm.replaceDocument('{"a":2}');
    await Promise.resolve();

    const updateEvents = wrapper.emitted('update:value') ?? [];

    expect(updateEvents).toHaveLength(1);
    expect(updateEvents[0]?.[0]).toBe('{"a":2}');
    wrapper.unmount();
  });
});
