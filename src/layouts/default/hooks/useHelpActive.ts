import { computed, onUnmounted } from 'vue';
import { useToolbarShortcuts } from '@/components/BToolbar/hooks/useToolbarShortcuts';
import type { ToolbarOptions } from '@/components/BToolbar/types';
import { emitter } from '@/utils/emitter';

interface UseHelpOptions {
  searchRecent: boolean;
  shortcutsHelp: boolean;
}

export function useHelpActive(options: UseHelpOptions) {
  const { register: registerShortcuts } = useToolbarShortcuts();

  const toolbarHelpOptions = computed<ToolbarOptions>(() => [
    {
      value: 'shortcuts',
      label: '快捷键',
      shortcut: 'Ctrl+/',
      onClick: () => {
        options.shortcutsHelp = true;
      }
    }
  ]);

  const cleanup = registerShortcuts(toolbarHelpOptions.value);
  const unregisterShortcuts = emitter.on('help:shortcuts', () => {
    options.shortcutsHelp = true;
  });

  onUnmounted(() => {
    cleanup();
    unregisterShortcuts();
  });

  return {
    toolbarHelpOptions
  };
}
