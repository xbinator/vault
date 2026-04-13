import { onMounted, onUnmounted, watch } from 'vue';
import type { Ref } from 'vue';
import type { DropdownOption, DropdownOptionDivider, DropdownOptionItem } from '@/components/BDropdown/type';
import type { ToolbarOption, ToolbarOptions } from '@/components/BToolbar/types';
import { isMac } from '@/shared/platform/env';

interface UseNativeMenuOptions {
  toolbarFileOptions: Ref<ToolbarOptions>;
  toolbarEditOptions: Ref<ToolbarOptions>;
  toolbarViewOptions: Ref<ToolbarOptions>;
  toolbarHelpOptions: Ref<ToolbarOptions>;
  visible: { recentSearch: boolean };
}

type MenuOptionItem = ToolbarOption | DropdownOptionItem;
type MenuOptions = Array<MenuOptionItem | DropdownOptionDivider>;

function isDivider(option: MenuOptionItem | DropdownOptionDivider): option is DropdownOptionDivider {
  return option.type === 'divider';
}

function isDropdownItem(option: DropdownOption): option is DropdownOptionItem {
  return option.type !== 'divider';
}

function isToolbarItem(option: ToolbarOption | DropdownOptionDivider): option is ToolbarOption {
  return option.type !== 'divider';
}

function getSelected(option: DropdownOptionItem): boolean | undefined {
  return (option as unknown as { selected?: boolean }).selected;
}

export function useNativeMenu(options: UseNativeMenuOptions) {
  const { toolbarFileOptions, toolbarEditOptions, toolbarViewOptions, toolbarHelpOptions, visible } = options;

  let cleanupMenuListener: (() => void) | undefined;

  onMounted(() => {
    const { electronAPI } = window;
    if (isMac() && electronAPI?.onMenuAction) {
      cleanupMenuListener = electronAPI.onMenuAction((action: string) => {
        const extractOptions = (prefix: string, opts: MenuOptions): Record<string, () => void | Promise<void>> => {
          const result: Record<string, () => void | Promise<void>> = {};

          opts.forEach((opt) => {
            if (isDivider(opt)) return;

            if (typeof opt.onClick === 'function') {
              result[`${prefix}${opt.value}`] = opt.onClick;
            }

            if (opt.children) {
              opt.children.forEach((child) => {
                if (!isDropdownItem(child)) return;
                if (typeof child.onClick === 'function') {
                  result[`${prefix}${child.value}`] = child.onClick;
                }
              });
            }
          });

          return result;
        };

        const themeOption = toolbarViewOptions.value.find((v): v is ToolbarOption => isToolbarItem(v) && v.value === 'theme');

        const handlers = {
          ...extractOptions('file:', toolbarFileOptions.value),
          ...extractOptions('edit:', toolbarEditOptions.value),
          ...extractOptions('view:', toolbarViewOptions.value),
          ...extractOptions('theme:', themeOption?.children ?? []),
          ...extractOptions('help:', toolbarHelpOptions.value)
        };

        if (action === 'file:recent') {
          visible.recentSearch = true;
        } else if (handlers[action]) {
          handlers[action]();
        }
      });

      watch(
        () => toolbarViewOptions.value,
        (viewOptions) => {
          if (!electronAPI?.updateMenuItem) return;

          viewOptions.forEach((opt) => {
            if (isDivider(opt)) return;

            if (typeof opt.selected === 'boolean') {
              electronAPI.updateMenuItem(`view:${opt.value}`, { checked: opt.selected });
            }

            if (!opt.children) return;

            opt.children.forEach((child) => {
              if (!isDropdownItem(child)) return;

              const selected = getSelected(child);
              if (typeof selected !== 'boolean') return;

              const prefix = opt.value === 'theme' ? 'theme:' : 'view:';
              electronAPI.updateMenuItem(`${prefix}${child.value}`, { checked: selected });
            });
          });
        },
        { immediate: true, deep: true }
      );
    }
  });

  onUnmounted(() => {
    if (cleanupMenuListener) {
      cleanupMenuListener();
    }
  });
}
