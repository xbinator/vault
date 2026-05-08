/**
 * @file chat-runtime.test.ts
 * @description 统一聊天任务运行时测试。
 */
import { describe, expect, it, vi } from 'vitest';
import { useChatTaskRuntime } from '@/components/BChatSidebar/hooks/useChatTaskRuntime';

describe('chat task runtime', () => {
  it('blocks starting a second task while one task is active', () => {
    const runtime = useChatTaskRuntime({
      abortChatTask: vi.fn()
    });

    const firstTask = runtime.beginTask('chat');
    const secondTask = runtime.beginTask('compact');

    expect(firstTask.ok).toBe(true);
    expect(runtime.loading.value).toBe(true);
    expect(secondTask).toEqual({
      ok: false,
      reason: 'busy'
    });
  });

  it('resets to idle when beginTask detects inconsistent internal state', () => {
    const runtime = useChatTaskRuntime({
      abortChatTask: vi.fn()
    });

    runtime.beginTask('compact');
    runtime.resetToIdle();

    const nextTask = runtime.beginTask('chat');

    expect(nextTask.ok).toBe(true);
    expect(runtime.activeTask.value).toBe('chat');
  });

  it('disposes an active compact task and triggers registered abort cleanup', () => {
    const onAbort = vi.fn();
    const runtime = useChatTaskRuntime({
      abortChatTask: vi.fn()
    });

    runtime.beginTask('compact', onAbort);
    runtime.dispose();

    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(runtime.activeTask.value).toBe('idle');
    expect(runtime.loading.value).toBe(false);
  });

  it('aborts an active chat task through the provided abort callback', () => {
    const abortChatTask = vi.fn();
    const runtime = useChatTaskRuntime({
      abortChatTask
    });

    runtime.beginTask('chat');
    runtime.abortActiveTask();

    expect(abortChatTask).toHaveBeenCalledTimes(1);
    expect(runtime.activeTask.value).toBe('idle');
    expect(runtime.loading.value).toBe(false);
  });
});
