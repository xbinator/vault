/**
 * @file useSavePolicy.test.ts
 * @description 验证编辑器真实写盘保存策略。
 */
import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSavePolicy } from '@/views/editor/hooks/useSavePolicy';

describe('useSavePolicy', () => {
  const saveCurrentFileToDisk = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    saveCurrentFileToDisk.mockReset();
    saveCurrentFileToDisk.mockResolvedValue({ status: 'saved' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not autosave pathless files in onChange mode', async () => {
    const policy = useSavePolicy({
      saveStrategy: ref('onChange'),
      hasFilePath: ref(false),
      isDirty: () => true,
      saveCurrentFileToDisk
    });

    policy.notifyContentChanged();
    vi.advanceTimersByTime(800);
    await Promise.resolve();

    expect(saveCurrentFileToDisk).not.toHaveBeenCalled();
  });

  it('saves dirty files after debounce in onChange mode', async () => {
    const policy = useSavePolicy({
      saveStrategy: ref('onChange'),
      hasFilePath: ref(true),
      isDirty: () => true,
      saveCurrentFileToDisk
    });

    policy.notifyContentChanged();
    vi.advanceTimersByTime(800);
    await Promise.resolve();

    expect(saveCurrentFileToDisk).toHaveBeenCalledTimes(1);
  });

  it('saves dirty files on blur in onBlur mode', async () => {
    const policy = useSavePolicy({
      saveStrategy: ref('onBlur'),
      hasFilePath: ref(true),
      isDirty: () => true,
      saveCurrentFileToDisk
    });

    await policy.handleEditorBlur();

    expect(saveCurrentFileToDisk).toHaveBeenCalledTimes(1);
  });

  it('queues one more save when a change happens while saving', async () => {
    let resolveFirstSave: ((value: { status: 'saved' }) => void) | null = null;
    saveCurrentFileToDisk.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstSave = resolve;
        })
    );

    const policy = useSavePolicy({
      saveStrategy: ref('onChange'),
      hasFilePath: ref(true),
      isDirty: () => true,
      saveCurrentFileToDisk
    });

    policy.notifyContentChanged();
    vi.advanceTimersByTime(800);
    await Promise.resolve();

    policy.notifyContentChanged();
    vi.advanceTimersByTime(800);
    await Promise.resolve();

    expect(saveCurrentFileToDisk).toHaveBeenCalledTimes(1);

    resolveFirstSave?.({ status: 'saved' });
    await Promise.resolve();
    await Promise.resolve();

    expect(saveCurrentFileToDisk).toHaveBeenCalledTimes(2);
  });
});
