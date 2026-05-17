/**
 * @file recentFile.ts
 * @description 统一处理最近文件列表的展示标题。
 */

import type { StoredFile } from '@/shared/storage/files/types';

/**
 * 生成最近文件展示名称，优先展示真实文件名与扩展名。
 * @param file - 最近文件记录
 * @returns 展示名称
 */
export function getRecentFileLabel(file: Pick<StoredFile, 'name' | 'ext'>): string {
  const normalizedName = file.name.trim();
  const normalizedExt = file.ext.trim();

  if (normalizedName && normalizedExt) {
    return `${normalizedName}.${normalizedExt}`;
  }

  if (normalizedName) {
    return normalizedName;
  }

  return normalizedExt ? `Untitled.${normalizedExt}` : 'Untitled';
}
