/* @vitest-environment jsdom */
/**
 * @file database-utils.test.ts
 * @description 存储数据库工具测试，覆盖数据库初始化竞态时的重试与降级行为。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 测试结束后清理挂载到 window 上的 Electron API。
 */
afterEach(() => {
  delete (window as Window & { electronAPI?: unknown }).electronAPI;
});

describe('database utils', () => {
  it('retries dbSelect until the database becomes available', async () => {
    (window as Window & { electronAPI?: unknown }).electronAPI = {
      dbSelect: vi
        .fn()
        .mockRejectedValueOnce(new Error("Error invoking remote method 'db:select': Error: Database not initialized"))
        .mockResolvedValueOnce([{ id: 1 }]),
      dbExecute: vi.fn()
    };

    const { dbSelect } = await import('@/shared/storage/utils/database');

    await expect(dbSelect<{ id: number }>('select 1')).resolves.toEqual([{ id: 1 }]);
  });

  it('keeps retrying dbSelect across longer database startup races', async () => {
    (window as Window & { electronAPI?: unknown }).electronAPI = {
      dbSelect: vi
        .fn()
        .mockRejectedValueOnce(new Error("Error invoking remote method 'db:select': Error: Database not initialized"))
        .mockRejectedValueOnce(new Error("Error invoking remote method 'db:select': Error: Database not initialized"))
        .mockRejectedValueOnce(new Error("Error invoking remote method 'db:select': Error: Database not initialized"))
        .mockRejectedValueOnce(new Error("Error invoking remote method 'db:select': Error: Database not initialized"))
        .mockRejectedValueOnce(new Error("Error invoking remote method 'db:select': Error: Database not initialized"))
        .mockResolvedValueOnce([{ id: 2 }]),
      dbExecute: vi.fn()
    };

    const { dbSelect } = await import('@/shared/storage/utils/database');

    await expect(dbSelect<{ id: number }>('select 2')).resolves.toEqual([{ id: 2 }]);
  });

  it('returns empty rows when dbSelect races with database initialization', async () => {
    (window as Window & { electronAPI?: unknown }).electronAPI = {
      dbSelect: vi.fn().mockRejectedValue(new Error("Error invoking remote method 'db:select': Error: Database not initialized")),
      dbExecute: vi.fn()
    };

    const { dbSelect } = await import('@/shared/storage/utils/database');

    await expect(dbSelect('select 1')).resolves.toEqual([]);
  });

  it('retries dbExecute until the database becomes available', async () => {
    (window as Window & { electronAPI?: unknown }).electronAPI = {
      dbSelect: vi.fn(),
      dbExecute: vi
        .fn()
        .mockRejectedValueOnce(new Error("Error invoking remote method 'db:execute': Error: Database not initialized"))
        .mockResolvedValueOnce({
          changes: 1,
          lastInsertRowid: 42
        })
    };

    const { dbExecute } = await import('@/shared/storage/utils/database');

    await expect(dbExecute('insert into test values (?)', [1])).resolves.toEqual({
      changes: 1,
      lastInsertRowid: 42
    });
  });

  it('keeps retrying dbExecute across longer database startup races', async () => {
    (window as Window & { electronAPI?: unknown }).electronAPI = {
      dbSelect: vi.fn(),
      dbExecute: vi
        .fn()
        .mockRejectedValueOnce(new Error("Error invoking remote method 'db:execute': Error: Database not initialized"))
        .mockRejectedValueOnce(new Error("Error invoking remote method 'db:execute': Error: Database not initialized"))
        .mockRejectedValueOnce(new Error("Error invoking remote method 'db:execute': Error: Database not initialized"))
        .mockRejectedValueOnce(new Error("Error invoking remote method 'db:execute': Error: Database not initialized"))
        .mockRejectedValueOnce(new Error("Error invoking remote method 'db:execute': Error: Database not initialized"))
        .mockResolvedValueOnce({
          changes: 1,
          lastInsertRowid: 7
        })
    };

    const { dbExecute } = await import('@/shared/storage/utils/database');

    await expect(dbExecute('update test set value = ?', [1])).resolves.toEqual({
      changes: 1,
      lastInsertRowid: 7
    });
  });

  it('keeps throwing when dbExecute races with database initialization', async () => {
    (window as Window & { electronAPI?: unknown }).electronAPI = {
      dbSelect: vi.fn(),
      dbExecute: vi.fn().mockRejectedValue(new Error("Error invoking remote method 'db:execute': Error: Database not initialized"))
    };

    const { dbExecute } = await import('@/shared/storage/utils/database');

    await expect(dbExecute('delete from test')).rejects.toThrow('Database not initialized');
  });
});
