/**
 * @file useSlashCommands.test.ts
 * @description 聊天侧边栏斜杠命令派发测试。
 */
import { describe, expect, it, vi } from 'vitest';
import { chatSlashCommands, useSlashCommands } from '@/components/BChatSidebar/hooks/useSlashCommands';

/**
 * 创建斜杠命令测试所需的默认 handler。
 * @returns 可被单测覆盖的命令 handler 集合。
 */
function createHandlers(overrides: Partial<Parameters<typeof useSlashCommands>[0]> = {}): Parameters<typeof useSlashCommands>[0] {
  return {
    openModelSelector: vi.fn(),
    openUsagePanel: vi.fn(),
    createNewSession: vi.fn(),
    clearInput: vi.fn(),
    compactContext: vi.fn(),
    isBusy: () => false,
    ...overrides
  };
}

describe('useSlashCommands', () => {
  it('waits for async compact command handlers before resolving', async () => {
    let resolveCompact: (() => void) | undefined;
    const compactCommand = chatSlashCommands.find((command) => command.id === 'compact');
    const compactContext = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCompact = resolve;
        })
    );
    const { handleSlashCommand } = useSlashCommands(createHandlers({ compactContext }));

    const pending = handleSlashCommand(compactCommand!);
    let settled = false;
    pending.then(() => {
      settled = true;
    });

    await Promise.resolve();

    expect(settled).toBe(false);
    resolveCompact?.();
    await pending;
    expect(settled).toBe(true);
  });
});
