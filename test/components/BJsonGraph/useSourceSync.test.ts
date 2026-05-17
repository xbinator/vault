/**
 * @file useSourceSync.test.ts
 * @description JSON 源码与图联动状态测试。
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSourceSync } from '@/components/BJsonGraph/hooks/useSourceSync';

describe('createSourceSync', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sets graph origin while locating source and resets in requestAnimationFrame', () => {
    const dispatchSelection = vi.fn();
    const requestAnimationFrameMock = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    const sync = createSourceSync();

    sync.locateSourceFromGraph(dispatchSelection, 10, 20);

    expect(dispatchSelection).toHaveBeenCalledWith(10, 20);
    expect(sync.shouldSkipReverseSync()).toBe(false);
    expect(requestAnimationFrameMock).toHaveBeenCalled();
  });

  it('skips reverse sync only while graph-origin update is pending', () => {
    let callback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((nextCallback: FrameRequestCallback): number => {
      callback = nextCallback;
      return 1;
    });
    const sync = createSourceSync();

    sync.locateSourceFromGraph(() => undefined, 1, 2);

    expect(sync.shouldSkipReverseSync()).toBe(true);

    const pendingCallback = callback as FrameRequestCallback | null;
    if (pendingCallback) {
      pendingCallback(0);
    }

    expect(sync.shouldSkipReverseSync()).toBe(false);
  });

  it('does not mark editor-origin lookup as reverse-sync skip', () => {
    const sync = createSourceSync();

    sync.locateNodeFromEditor(12);

    expect(sync.getLastEditorOffset()).toBe(12);
    expect(sync.shouldSkipReverseSync()).toBe(false);
  });

  it('fits view on first call or when explicit/offscreen', () => {
    const sync = createSourceSync();

    expect(sync.shouldFitView(true, false)).toBe(true);
    expect(sync.shouldFitView(false, false)).toBe(true);
    expect(sync.shouldFitView(true, false)).toBe(false);
    expect(sync.shouldFitView(true, true)).toBe(true);
  });
});
