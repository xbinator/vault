/**
 * @file types.ts
 * @description fileWrite 工具模块内类型定义。
 */
import type { ToolRequiredConfirmationOptions, ToolWorkspaceOptions, OpenDraftInput, OpenDraftResult } from '../../shared/types';
import type { ReadWorkspaceFileOptions, ReadWorkspaceFileResult } from '@/shared/platform/native/types';
import type { StoredFile } from '@/shared/storage/files/types';

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
export interface CreateBuiltinWriteFileToolOptions extends ToolRequiredConfirmationOptions, ToolWorkspaceOptions {
  /** 读取本地文件，测试时可注入替身。 */
  readWorkspaceFile?: (options: ReadWorkspaceFileOptions) => Promise<ReadWorkspaceFileResult>;
  /** 写入本地文件，测试时可注入替身。 */
  writeFile?: (path: string, content: string) => Promise<void>;
  /** 按草稿 ID 读取未保存文件，测试时可注入替身。 */
  getUnsavedDraft?: (fileId: string) => Promise<StoredFile | null>;
  /** 更新未保存文件内容，测试时可注入替身。 */
  updateUnsavedDraft?: (fileId: string, updates: Partial<StoredFile>) => Promise<StoredFile>;
  /** 打开草稿，无工作区 + 相对路径时降级调用。 */
  openDraft?: (input: OpenDraftInput) => Promise<OpenDraftResult>;
}
