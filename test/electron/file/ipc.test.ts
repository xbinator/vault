/**
 * @file ipc.test.ts
 * @description 验证文件 IPC 的路径状态查询能力。
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}));

import { getFilePathStatus } from '../../../electron/main/modules/file/ipc.mts';

describe('getFilePathStatus', () => {
  const sandboxRoot = join(tmpdir(), 'tibis-file-ipc-test');
  const filePath = join(sandboxRoot, 'demo.md');
  const directoryPath = join(sandboxRoot, 'docs');
  const missingPath = join(sandboxRoot, 'missing.md');

  beforeEach(async () => {
    await rm(sandboxRoot, { recursive: true, force: true });
    await mkdir(directoryPath, { recursive: true });
    await writeFile(filePath, '# demo', 'utf8');
  });

  afterEach(async () => {
    await rm(sandboxRoot, { recursive: true, force: true });
  });

  it('returns file status for existing files, directories, and missing paths', async () => {
    await expect(getFilePathStatus(filePath)).resolves.toEqual({
      exists: true,
      isFile: true,
      isDirectory: false
    });

    await expect(getFilePathStatus(directoryPath)).resolves.toEqual({
      exists: true,
      isFile: false,
      isDirectory: true
    });

    await expect(getFilePathStatus(missingPath)).resolves.toEqual({
      exists: false,
      isFile: false,
      isDirectory: false
    });
  });
});
