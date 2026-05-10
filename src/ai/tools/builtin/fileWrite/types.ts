/**
 * @file types.ts
 * @description fileWrite 工具模块内类型定义。
 */
import type { AIToolConfirmationAdapter } from '../../confirmation';
import type { FileReadSnapshot } from '../../shared/fileTypes';
import type { ReadWorkspaceFileOptions, ReadWorkspaceFileResult } from '@/shared/platform/native/types';

/**
 * write_file 输入参数。
 */
export interface WriteFileInput {
  /** 文件路径，支持相对工作区路径或绝对路径。 */
  path: string;
  /** 新的完整文件内容。 */
  content: string;
}

/**
 * write_file 返回结果。
 */
export interface WriteFileResult {
  /** 规范化后的真实文件路径。 */
  path: string;
  /** 最新写入的完整内容。 */
  content: string;
  /** 是否为新创建文件。 */
  created: boolean;
}

/**
 * 创建 write_file 工具的选项。
 */
export interface CreateBuiltinWriteFileToolOptions {
  /** 写操作确认适配器。 */
  confirm: AIToolConfirmationAdapter;
  /** 获取工作区根目录，无工作区时返回 null。 */
  getWorkspaceRoot?: () => string | null;
  /** 读取本地文件，测试时可注入替身。 */
  readWorkspaceFile?: (options: ReadWorkspaceFileOptions) => Promise<ReadWorkspaceFileResult>;
  /** 写入本地文件，测试时可注入替身。 */
  writeFile?: (path: string, content: string) => Promise<void>;
  /** 获取指定文件的最近读取快照。 */
  getReadSnapshot: (filePath: string) => FileReadSnapshot | null;
  /** 写入指定文件的最新读取快照。 */
  setReadSnapshot: (snapshot: FileReadSnapshot) => void;
}
