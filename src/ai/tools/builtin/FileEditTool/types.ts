/**
 * @file types.ts
 * @description fileEdit 工具模块内类型定义。
 */
import type { ToolRequiredConfirmationOptions, ToolWorkspaceOptions } from '../../shared/types';
import type { ReadWorkspaceFileOptions, ReadWorkspaceFileResult } from '@/shared/platform/native/types';
import type { StoredFile } from '@/shared/storage/files/types';

/**
 * edit_file 输入参数。
 */
export interface EditFileInput {
  /** 文件路径，支持相对工作区路径、绝对路径或未保存草稿虚拟路径。 */
  path: string;
  /** 待替换的原始文本。 */
  oldString: string;
  /** 替换后的文本。 */
  newString: string;
  /** 是否替换全部匹配项。 */
  replaceAll?: boolean;
}

/**
 * edit_file 返回结果。
 */
export interface EditFileResult {
  /** 规范化后的真实文件路径。 */
  path: string;
  /** 修改后的完整文件内容。 */
  content: string;
  /** 实际替换次数。 */
  replacedCount: number;
}

/**
 * 创建 edit_file 工具的选项。
 */
export interface CreateBuiltinEditFileToolOptions extends ToolRequiredConfirmationOptions, ToolWorkspaceOptions {
  /** 读取本地文件，测试时可注入替身。 */
  readWorkspaceFile?: (options: ReadWorkspaceFileOptions) => Promise<ReadWorkspaceFileResult>;
  /** 写入本地文件，测试时可注入替身。 */
  writeFile?: (path: string, content: string) => Promise<void>;
  /** 按草稿 ID 读取未保存文件，测试时可注入替身。 */
  getUnsavedDraft?: (fileId: string) => Promise<StoredFile | null>;
  /** 更新未保存文件内容，测试时可注入替身。 */
  updateUnsavedDraft?: (fileId: string, updates: Partial<StoredFile>) => Promise<StoredFile>;
}
