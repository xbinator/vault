/**
 * @file useOpenDraft.test.ts
 * @description 创建并打开未保存草稿用例测试。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredFile } from '@/shared/storage/files/types';

const pushMock = vi.hoisted(() => vi.fn(async () => undefined));
const createAndOpenMock = vi.hoisted(() => vi.fn(async (file: StoredFile) => file));
const openFileMock = vi.hoisted(() => vi.fn(async (file: StoredFile) => file));

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushMock
  })
}));

vi.mock('@/stores/files', () => ({
  useFilesStore: () => ({
    createAndOpen: createAndOpenMock
  })
}));

vi.mock('@/hooks/useOpenFile', () => ({
  useOpenFile: () => ({
    openFile: openFileMock
  })
}));

function createStoredFile(overrides: Partial<StoredFile> = {}): StoredFile {
  return {
    id: overrides.id ?? 'draft_1',
    path: overrides.path ?? null,
    name: overrides.name ?? 'Untitled',
    ext: overrides.ext ?? 'md',
    content: overrides.content ?? '',
    savedContent: overrides.savedContent ?? '',
    createdAt: overrides.createdAt ?? 1,
    openedAt: overrides.openedAt ?? 1,
    modifiedAt: overrides.modifiedAt ?? 1
  };
}

async function importOpenDraftModule() {
  return import('@/hooks/useOpenDraft');
}

describe('useOpenDraft', () => {
  beforeEach(() => {
    vi.resetModules();
    setActivePinia(createPinia());
    pushMock.mockReset();
    createAndOpenMock.mockReset();
    openFileMock.mockReset();
    createAndOpenMock.mockImplementation(async (file: StoredFile) => ({
      ...file,
      id: 'draft_1'
    }));
    openFileMock.mockImplementation(async (file: StoredFile) => file);
  });

  it('creates a draft and opens it through the unified open-file entry', async () => {
    const { useOpenDraft } = await import('@/hooks/useOpenDraft');
    const { openDraft } = useOpenDraft();

    const result = await openDraft({
      originalPath: 'notes/idea',
      content: '# draft\n'
    });

    expect(createAndOpenMock).toHaveBeenCalledTimes(1);
    expect(openFileMock).toHaveBeenCalledTimes(1);
    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: null,
        name: 'idea',
        ext: 'md',
        content: '# draft\n'
      })
    );
    expect(pushMock).not.toHaveBeenCalled();
    expect(result.unsavedPath).toBe('unsaved://draft_1/idea.md');
  });

  it('rethrows storage errors from draft creation', async () => {
    createAndOpenMock.mockRejectedValueOnce(new Error('disk full'));

    const { useOpenDraft } = await import('@/hooks/useOpenDraft');
    const { openDraft } = useOpenDraft();

    await expect(
      openDraft({
        originalPath: 'notes/idea',
        content: '# draft\n'
      })
    ).rejects.toThrow('disk full');
  });

  it('rethrows unified open-file errors after draft creation', async () => {
    openFileMock.mockRejectedValueOnce(new Error('open failed'));

    const { useOpenDraft } = await import('@/hooks/useOpenDraft');
    const { openDraft } = useOpenDraft();

    await expect(
      openDraft({
        originalPath: 'notes/idea',
        content: '# draft\n'
      })
    ).rejects.toThrow('open failed');
  });
});

describe('extractNameAndExt', () => {
  it('extracts name and default ext from path without extension', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('notes/idea')).toEqual({ name: 'idea', ext: 'md' });
    });
  });

  it('extracts name and ext from path with extension', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('drafts/plan.md')).toEqual({ name: 'plan', ext: 'md' });
    });
  });

  it('extracts name and non-md extension', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('data/config.json')).toEqual({ name: 'config', ext: 'json' });
    });
  });

  it('handles single filename without path', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('readme')).toEqual({ name: 'readme', ext: 'md' });
    });
  });

  it('handles dotfiles without valid extension', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('.gitignore')).toEqual({ name: '.gitignore', ext: 'md' });
    });
  });

  it('handles dotfiles with valid extension', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('.env.local')).toEqual({ name: '.env', ext: 'local' });
    });
  });

  it('handles backslash separators', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('notes\\idea')).toEqual({ name: 'idea', ext: 'md' });
    });
  });

  it('handles mixed separators', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('folder\\sub/file.txt')).toEqual({ name: 'file', ext: 'txt' });
    });
  });

  it('defaults to md when extension is too long', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('file.verylongextensionthatexceedslimit')).toEqual({ name: 'file.verylongextensionthatexceedslimit', ext: 'md' });
    });
  });

  it('defaults to md when extension contains special characters', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('file.t-s')).toEqual({ name: 'file.t-s', ext: 'md' });
    });
  });

  it('handles empty path', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('')).toEqual({ name: 'Untitled', ext: 'md' });
    });
  });

  it('handles path ending with slash', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('folder/')).toEqual({ name: 'folder', ext: 'md' });
    });
  });

  it('handles underscore in extension', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('file.d_ts')).toEqual({ name: 'file', ext: 'd_ts' });
    });
  });

  it('handles numeric extension', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('file.123')).toEqual({ name: 'file', ext: '123' });
    });
  });
});
