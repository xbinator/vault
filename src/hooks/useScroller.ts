import type { MaybeRef } from 'vue';
import { computed, unref } from 'vue';
import { getScroller } from '@/utils/scroll';

export function useScroller(element: MaybeRef<HTMLElement | null | undefined>) {
  function makeDOMRect(width: number, height: number) {
    return { top: 0, left: 0, right: width, bottom: height, width, height } as DOMRect;
  }

  const container = computed(() => {
    const el = unref(element);
    if (!el) return null;

    return getScroller(el);
  });

  const getBoundingClientRect = () => {
    if ((container.value as HTMLElement)?.getBoundingClientRect) {
      return (container.value as HTMLElement).getBoundingClientRect();
    }

    return makeDOMRect(0, 0);
  };

  return {
    get container() {
      return container.value;
    },
    getBoundingClientRect
  };
}
