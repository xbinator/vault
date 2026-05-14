/**
 * @file types.ts
 * @description AI 工具共享类型定义
 */
import type { AIToolConfirmationAdapter } from '../confirmation';
import type { AIToolContext } from 'types/ai';

/**
 * 工具基础选项 - 工作区相关能力
 */
export interface ToolWorkspaceOptions {
  /** 获取工作区根目录，无工作区时返回 null */
  getWorkspaceRoot?: () => string | null;
  /** 判断文件路径是否在最近文件列表中，命中时跳过绝对路径确认 */
  isFileInRecent?: (filePath: string) => boolean;
}

/**
 * 工具基础选项 - 文件查找能力
 */
export interface ToolFileLookupOptions {
  /**
   * 通过文件路径查询文件记录，用于获取文件 ID。
   * @param filePath - 文件绝对路径
   * @returns 文件记录（含 id），未找到时返回 null
   */
  findFileByPath?: (filePath: string) => Promise<{ id: string } | null>;
  /**
   * 通过文件 ID 获取编辑器上下文，用于读取内存中的最新内容。
   * @param documentId - 文件 ID
   * @returns 编辑器上下文，文件未打开时返回 undefined
   */
  getEditorContext?: (documentId: string) => AIToolContext | undefined;
}

/**
 * 工具基础选项 - 确认能力（可选）
 */
export interface ToolConfirmationOptions {
  /** 用户确认适配器 */
  confirm?: AIToolConfirmationAdapter;
}

/**
 * 工具基础选项 - 确认能力（必需）
 * 用于写工具，必须提供确认适配器
 */
export interface ToolRequiredConfirmationOptions {
  /** 用户确认适配器 */
  confirm: AIToolConfirmationAdapter;
}

/**
 * 内置工具共享基础选项
 */
export interface BuiltinToolBaseOptions extends ToolConfirmationOptions, ToolWorkspaceOptions, ToolFileLookupOptions {}
