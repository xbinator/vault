/**
 * @file service.mts
 * @description 提供主进程文件变化监听服务，并向所有窗口广播文件事件。
 */

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import chokidar from 'chokidar';
import { BrowserWindow } from 'electron';

/**
 * unlink → add 防抖窗口时长（毫秒）。
 * Git 回退等操作会快速触发 unlink + add，在此窗口内合并为 change 事件。
 */
const RECREATE_WINDOW_MS = 300;

/**
 * chokidar 文件监听器实例类型。
 */
type FileWatcher = ReturnType<typeof chokidar.watch>;

/**
 * 主进程文件监听服务，支持多个路径同时监听。
 */
class FileWatchService {
  /** 按文件路径保存已创建的 watcher。 */
  private readonly watchers = new Map<string, FileWatcher>();

  /** unlink 防抖定时器，用于合并 git 回退等场景的 unlink → add 序列。 */
  private readonly pendingUnlinks = new Map<string, NodeJS.Timeout>();

  /**
   * 向所有窗口广播文件变化事件。
   * @param type - 事件类型
   * @param filePath - 文件路径
   * @param content - 文件内容（仅 change 事件携带）
   */
  private notifyWindows(type: 'change' | 'unlink' | 'add', filePath: string, content?: string): void {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('file:changed', { type, filePath, content });
    });
  }

  /**
   * 注册指定路径的文件监听；重复注册同一路径时保持幂等。
   * @param filePath - 需要监听的文件路径
   */
  async watch(filePath: string): Promise<void> {
    if (this.watchers.has(filePath)) return;

    const watcher = chokidar.watch(filePath, {
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100
      }
    });

    watcher.on('change', async (changedPath: string) => {
      try {
        const content = await fsPromises.readFile(changedPath, 'utf-8');
        this.notifyWindows('change', changedPath, content);
      } catch (error: unknown) {
        console.error('FileWatchService read error:', error);
      }
    });

    watcher.on('unlink', (removedPath: string) => {
      const timer = setTimeout(() => {
        this.pendingUnlinks.delete(removedPath);

        if (!fs.existsSync(removedPath)) {
          this.notifyWindows('unlink', removedPath);
        }
      }, RECREATE_WINDOW_MS);

      this.pendingUnlinks.set(removedPath, timer);
    });

    watcher.on('add', async (addedPath: string) => {
      const timer = this.pendingUnlinks.get(addedPath);

      if (timer) {
        clearTimeout(timer);
        this.pendingUnlinks.delete(addedPath);

        try {
          const content = await fsPromises.readFile(addedPath, 'utf-8');
          this.notifyWindows('change', addedPath, content);
        } catch (error: unknown) {
          console.error('FileWatchService read error on add:', error);
        }
        return;
      }

      this.notifyWindows('add', addedPath);
    });

    this.watchers.set(filePath, watcher);
  }

  /**
   * 停止监听指定路径。
   * @param filePath - 需要停止监听的文件路径
   */
  async unwatch(filePath: string): Promise<void> {
    const watcher = this.watchers.get(filePath);
    if (!watcher) return;

    this.watchers.delete(filePath);
    await watcher.close();
  }

  /**
   * 停止所有文件监听，用于应用退出或 watcher store dispose。
   */
  async unwatchAll(): Promise<void> {
    const watchers = Array.from(this.watchers.values());
    this.watchers.clear();
    await Promise.all(watchers.map((watcher) => watcher.close()));
  }
}

export const fileWatchService = new FileWatchService();
