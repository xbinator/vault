/**
 * @file builtin/index.ts
 * @description 内置工具工厂函数
 */
import type { AIToolConfirmationAdapter } from '../confirmation';
import type { AIToolExecutor } from 'types/ai';
import { nanoid } from 'nanoid';
import { isDefaultBuiltinReadonlyToolName, isDefaultBuiltinWritableToolName } from '../builtinCatalog';
import { createAskUserChoiceTool, type PendingQuestionSnapshot } from './askUserChoice';
import { createBuiltinEditFileTool } from './fileEdit';
import { createBuiltinEnvironmentTools } from './environment';
import { createBuiltinLogTools } from './logs';
import { createBuiltinReadTools } from './read';
import { createBuiltinReadDirectoryTool, createBuiltinReadFileTool } from './fileRead';
import { createBuiltinSettingsTools } from './settings';
import { createBuiltinWriteFileTool } from './fileWrite';

/**
 * 创建内置工具的选项
 */
interface CreateBuiltinToolsOptions {
  /** 确认适配器，用于写操作的用户确认 */
  confirm?: AIToolConfirmationAdapter;
  /** 获取当前待回答问题，用于避免重复发起用户选择 */
  getPendingQuestion?: () => PendingQuestionSnapshot | null;
  /** 创建用户选择问题 ID */
  createQuestionId?: () => string;
  /** 获取工作区根目录，无工作区时返回 null */
  getWorkspaceRoot?: () => string | null;
  /** 判断文件路径是否在最近文件列表中，命中时跳过绝对路径确认 */
  isFileInRecent?: (filePath: string) => boolean;
}

/**
 * 创建内置工具列表
 * @param options - 创建选项
 * @returns 工具执行器列表
 */
export function createBuiltinTools(options: CreateBuiltinToolsOptions = {}): AIToolExecutor[] {
  /** 最近一次读取到的文件快照，用于约束文件级写入必须基于最新读结果。 */
  const fileReadSnapshots = new Map<string, { content: string; isPartial: boolean }>();
  // 创建文档只读工具
  const readTools = createBuiltinReadTools();
  // 创建环境只读工具
  const environmentTools = createBuiltinEnvironmentTools();
  // 创建日志只读工具
  const logTools = createBuiltinLogTools();
  // 先汇总全部只读工具，再通过共享清单筛选默认暴露项。
  const allReadonlyTools: AIToolExecutor[] = [
    readTools.readCurrentDocument,
    environmentTools.getCurrentTime,
    createAskUserChoiceTool({
      getPendingQuestion: options.getPendingQuestion ?? (() => null),
      createQuestionId: options.createQuestionId ?? (() => nanoid())
    }),
    createBuiltinReadFileTool({
      confirm: options.confirm,
      getWorkspaceRoot: options.getWorkspaceRoot,
      isFileInRecent: options.isFileInRecent,
      trackReadResult: (result, range) => {
        if (result.path.startsWith('unsaved://')) {
          return;
        }

        fileReadSnapshots.set(result.path, {
          content: result.content,
          isPartial: range.offset !== 1 || result.hasMore
        });
      }
    }),

    createBuiltinReadDirectoryTool({
      confirm: options.confirm,
      getWorkspaceRoot: options.getWorkspaceRoot,
      isFileInRecent: options.isFileInRecent
    }),
    createBuiltinSettingsTools(options.confirm ?? { confirm: async () => false }).getSettings,
    logTools.queryLogs
  ];
  const readonlyTools = allReadonlyTools.filter((tool) => isDefaultBuiltinReadonlyToolName(tool.definition.name));

  // 没有确认适配器时只返回只读工具
  if (!options.confirm) {
    return readonlyTools;
  }

  // 创建文件级写入工具
  const editFileTool = createBuiltinEditFileTool({
    confirm: options.confirm,
    getWorkspaceRoot: options.getWorkspaceRoot,
    getReadSnapshot: (filePath: string) => fileReadSnapshots.get(filePath) ?? null,
    setReadSnapshot: (filePath: string, snapshot: { content: string; isPartial: boolean }) => {
      fileReadSnapshots.set(filePath, snapshot);
    }
  });
  const writeFileTool = createBuiltinWriteFileTool({
    confirm: options.confirm,
    getWorkspaceRoot: options.getWorkspaceRoot,
    getReadSnapshot: (filePath: string) => fileReadSnapshots.get(filePath) ?? null,
    setReadSnapshot: (filePath: string, snapshot: { content: string; isPartial: boolean }) => {
      fileReadSnapshots.set(filePath, snapshot);
    }
  });
  // 创建设置修改工具
  const settingsTools = createBuiltinSettingsTools(options.confirm);
  // 先汇总默认文件写工具，再通过共享清单筛选默认暴露项。
  const allDefaultWritableTools: AIToolExecutor[] = [editFileTool, writeFileTool, settingsTools.updateSettings];
  const writableTools = allDefaultWritableTools.filter((tool) => isDefaultBuiltinWritableToolName(tool.definition.name));

  return [...readonlyTools, ...writableTools];
}
