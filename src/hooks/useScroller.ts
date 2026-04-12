import type { MaybeRef } from 'vue';
import { computed, unref } from 'vue';
import { getScroller } from '@/utils/scroll';

export function useScroller(element: MaybeRef<HTMLElement | null | undefined>) {
  const scroller = computed(() => {
    const el = unref(element);
    if (!el) return null;

    return getScroller(el);
  });

  return { scroller };
}
