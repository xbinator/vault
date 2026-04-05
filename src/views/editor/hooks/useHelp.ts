import { computed } from 'vue';
import type { Props as ToolbarProps } from '@/components/Toolbar.vue';

interface UseHelpOptions {
  onShowShortcuts: () => void;
}

export function useHelp(options: UseHelpOptions) {
  const { onShowShortcuts } = options;

  const toolbarHelpOptions = computed<ToolbarProps['options']>(() => [
    {
      value: 'shortcuts',
      label: '快捷键',
      shortcut: 'Ctrl+/',
      onClick: onShowShortcuts
    }
  ]);

  return {
    toolbarHelpOptions
  };
}
