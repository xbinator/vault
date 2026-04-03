import { computed, ref } from 'vue';
import type { Props as ToolbarProps } from '@/components/Toolbar.vue';

export function useViewActive() {
  const viewMode = ref<'rich' | 'source'>('rich');
  const toolbarViewOptions = computed<ToolbarProps['options']>(() => [
    {
      value: 'rich',
      label: '富文本编辑',
      disabled: viewMode.value === 'rich',
      onClick: () => {
        viewMode.value = 'rich';
      }
    },
    {
      value: 'source',
      label: '源代码编辑',
      disabled: viewMode.value === 'source',
      onClick: () => {
        viewMode.value = 'source';
      }
    }
  ]);

  return { viewMode, toolbarViewOptions };
}
