/**
 * @file fileState.ts
 * @description 文件工具共享快照状态仓库。
 */
import type { FileReadSnapshot } from './fileTypes';

/**
 * 文件快照状态仓库接口。
 */
export interface FileStateStore {
  /** 读取指定路径的快照。 */
  getSnapshot(path: string): FileReadSnapshot | null;
  /** 写入指定路径的快照。 */
  setSnapshot(snapshot: FileReadSnapshot): void;
  /** 清除指定路径的快照。 */
  clearSnapshot(path: string): void;
}

/**
 * 创建文件快照状态仓库。
 * @returns 文件快照状态仓库
 */
export function createFileStateStore(): FileStateStore {
  const snapshots = new Map<string, FileReadSnapshot>();

  return {
    getSnapshot(path: string) {
      return snapshots.get(path) ?? null;
    },
    setSnapshot(snapshot: FileReadSnapshot) {
      snapshots.set(snapshot.path, snapshot);
    },
    clearSnapshot(path: string) {
      snapshots.delete(path);
    }
  };
}
