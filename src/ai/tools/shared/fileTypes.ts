/**
 * @file fileTypes.ts
 * @description 文件工具共享类型定义。
 */

/**
 * 文件读取快照。
 */
export interface FileReadSnapshot {
  /** 规范化后的文件路径。 */
  path: string;
  /** 最近一次读取到的文件内容。 */
  content: string;
  /** 是否为局部读取快照。 */
  isPartial: boolean;
  /** 读取完成时间戳。 */
  readAt: number;
}

/**
 * 文件预览片段。
 */
export interface FilePreviewPair {
  /** 修改前预览；新建文件时为空。 */
  beforePreview: string | null;
  /** 修改后预览。 */
  afterPreview: string;
}
