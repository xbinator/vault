/**
 * @file fileEdit/index.ts
 * @description 内置本地文件局部编辑工具实现。
 */
import type { CreateBuiltinEditFileToolOptions, EditFileInput, EditFileResult } from './types';
import type { AIToolConfirmationAdapter, AIToolConfirmationRequest } from '../../confirmation';
import type { FileReadSnapshot } from '../../shared/fileTypes';
import type { AIToolContext, AIToolExecutionError, AIToolExecutor } from 'types/ai';
import { native } from '@/shared/platform';
import type { ReadWorkspaceFileResult } from '@/shared/platform/native/types';
import { createToolCancelledResult, createToolFailureResult, createToolSuccessResult } from '../../results';
import { toFileToolExecutionError } from '../../shared/fileErrors';
import { isAbsoluteFilePath, isPathInsideWorkspace, resolvePathAgainstWorkspace } from '../../shared/pathUtils';

/** edit_file 工具名称。 */
export const EDIT_FILE_TOOL_NAME = 'edit_file';

/**
 * 从未知错误中提取业务错误码。
 * @param error - 未知错误
 * @returns 业务错误码或 null
 */
function readErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const { code } = error as { code: unknown };
  return typeof code === 'string' ? code : null;
}

/**
 * 读取错误消息。
 * @param error - 未知错误
 * @returns 可展示错误消息
 */
function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '读取文件失败';
}

/**
 * 解析输入路径并执行工作区边界校验。
 * @param filePath - 用户输入路径
 * @param workspaceRoot - 工作区根目录
 * @returns 规范化后的目标路径或失败结果
 */
function resolveTargetPath(filePath: string, workspaceRoot: string | null): { path: string } | { error: ReturnType<typeof createToolFailureResult> } {
  if (!workspaceRoot) {
    if (!isAbsoluteFilePath(filePath)) {
      return {
        error: createToolFailureResult(EDIT_FILE_TOOL_NAME, 'PERMISSION_DENIED', '未配置工作区根目录时只能修改绝对路径文件')
      };
    }

    return { path: filePath };
  }

  if (isAbsoluteFilePath(filePath)) {
    if (!isPathInsideWorkspace(filePath, workspaceRoot)) {
      return {
        error: createToolFailureResult(EDIT_FILE_TOOL_NAME, 'PERMISSION_DENIED', '目标文件不在当前工作区内')
      };
    }

    return { path: filePath };
  }

  const resolvedPath = resolvePathAgainstWorkspace(filePath, workspaceRoot);
  if (!resolvedPath) {
    return {
      error: createToolFailureResult(EDIT_FILE_TOOL_NAME, 'PERMISSION_DENIED', '相对路径超出了当前工作区范围')
    };
  }

  return { path: resolvedPath };
}

/**
 * 判断目标路径是否对应当前激活文档。
 * @param context - 工具执行上下文
 * @param targetPath - 规范化后的目标路径
 * @returns 是否命中当前激活文档
 */
function isActiveDocumentTarget(context: AIToolContext | undefined, targetPath: string): boolean {
  return context?.document.path === targetPath;
}

/**
 * 统计字符串出现次数。
 * @param content - 文件内容
 * @param search - 待查找字符串
 * @returns 出现次数
 */
function countOccurrences(content: string, search: string): number {
  if (!search) {
    return 0;
  }

  let count = 0;
  let startIndex = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const matchIndex = content.indexOf(search, startIndex);
    if (matchIndex === -1) {
      return count;
    }

    count += 1;
    startIndex = matchIndex + search.length;
  }
}

/**
 * 执行单次或批量字符串替换。
 * @param content - 原始内容
 * @param oldString - 待替换内容
 * @param newString - 新内容
 * @param replaceAll - 是否替换全部
 * @returns 替换后的文本与替换次数
 */
function applyStringReplacement(content: string, oldString: string, newString: string, replaceAll: boolean): { content: string; replacedCount: number } {
  const matchCount = countOccurrences(content, oldString);
  if (matchCount === 0) {
    return { content, replacedCount: 0 };
  }

  if (replaceAll) {
    return {
      content: content.split(oldString).join(newString),
      replacedCount: matchCount
    };
  }

  const matchIndex = content.indexOf(oldString);
  return {
    content: `${content.slice(0, matchIndex)}${newString}${content.slice(matchIndex + oldString.length)}`,
    replacedCount: 1
  };
}

/**
 * 确认写入操作是否通过。
 * @param adapter - 确认适配器
 * @param request - 确认请求
 * @param toolName - 工具名称
 * @returns 取消结果或 null
 */
async function confirmOrCancel(
  adapter: AIToolConfirmationAdapter,
  request: AIToolConfirmationRequest,
  toolName: string
): Promise<ReturnType<typeof createToolCancelledResult> | null> {
  const decision = await adapter.confirm(request);
  const confirmed = typeof decision === 'boolean' ? decision : decision.approved;

  return confirmed ? null : createToolCancelledResult(toolName);
}

/**
 * 执行带确认的写入操作。
 * @param adapter - 确认适配器
 * @param request - 确认请求
 * @param operation - 实际写操作
 * @returns 工具执行结果
 */
async function executeConfirmedEdit(
  adapter: AIToolConfirmationAdapter,
  request: AIToolConfirmationRequest,
  operation: () => Promise<EditFileResult>
): Promise<ReturnType<typeof createToolSuccessResult<EditFileResult>> | ReturnType<typeof createToolFailureResult>> {
  await adapter.onExecutionStart?.(request);

  try {
    const result = await operation();
    await adapter.onExecutionComplete?.(request, { status: 'success' });
    return createToolSuccessResult(EDIT_FILE_TOOL_NAME, result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '修改文件失败';
    await adapter.onExecutionComplete?.(request, { status: 'failure', errorMessage });
    return createToolFailureResult(EDIT_FILE_TOOL_NAME, 'EXECUTION_FAILED', errorMessage);
  }
}

/**
 * 创建内置 edit_file 工具。
 * @param options - 工具创建选项
 * @returns edit_file 工具执行器
 */
export function createBuiltinEditFileTool(options: CreateBuiltinEditFileToolOptions): AIToolExecutor<EditFileInput, EditFileResult> {
  const readWorkspaceFile = options.readWorkspaceFile ?? native.readWorkspaceFile.bind(native);
  const writeFile = options.writeFile ?? native.writeFile.bind(native);

  return {
    definition: {
      name: EDIT_FILE_TOOL_NAME,
      description: '按精确字符串匹配修改本地文本文件。必须先通过 read_file 完整读取目标文件，若文件内容已变化则会拒绝执行。',
      source: 'builtin',
      riskLevel: 'write',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，支持相对工作区路径或绝对路径。' },
          oldString: { type: 'string', description: '待替换的原始文本。' },
          newString: { type: 'string', description: '替换后的文本。' },
          replaceAll: { type: 'boolean', description: '是否替换全部匹配项，默认 false。' }
        },
        required: ['path', 'oldString', 'newString'],
        additionalProperties: false
      }
    },
    async execute(input: EditFileInput, context?: AIToolContext) {
      const filePath = typeof input.path === 'string' ? input.path.trim() : '';
      const oldString = typeof input.oldString === 'string' ? input.oldString : '';
      const newString = typeof input.newString === 'string' ? input.newString : '';
      const replaceAll = input.replaceAll === true;

      if (!filePath) {
        return createToolFailureResult(EDIT_FILE_TOOL_NAME, 'INVALID_INPUT', '文件路径不能为空');
      }

      if (!oldString) {
        return createToolFailureResult(EDIT_FILE_TOOL_NAME, 'INVALID_INPUT', 'oldString 不能为空');
      }

      if (oldString === newString) {
        return createToolFailureResult(EDIT_FILE_TOOL_NAME, 'INVALID_INPUT', 'oldString 与 newString 不能完全相同');
      }

      const workspaceRoot = options.getWorkspaceRoot?.() ?? null;
      const resolvedTargetPath = resolveTargetPath(filePath, workspaceRoot);
      if ('error' in resolvedTargetPath) {
        return resolvedTargetPath.error;
      }

      let currentFile: ReadWorkspaceFileResult;
      try {
        currentFile = await readWorkspaceFile({
          filePath,
          ...(workspaceRoot ? { workspaceRoot } : {}),
          offset: 1
        });
      } catch (error) {
        const code = readErrorCode(error);
        const mappedCode: AIToolExecutionError['code'] = code === 'FILE_NOT_FOUND' ? 'EXECUTION_FAILED' : 'PERMISSION_DENIED';
        return createToolFailureResult(EDIT_FILE_TOOL_NAME, mappedCode, readErrorMessage(error));
      }

      const snapshot = options.getReadSnapshot(currentFile.path);
      if (!snapshot) {
        const error = toFileToolExecutionError('FILE_NOT_READ');
        return createToolFailureResult(EDIT_FILE_TOOL_NAME, error.code, error.message);
      }

      if (snapshot.isPartial) {
        const error = toFileToolExecutionError('FILE_READ_PARTIAL');
        return createToolFailureResult(EDIT_FILE_TOOL_NAME, error.code, error.message);
      }

      if (snapshot.content !== currentFile.content) {
        const error = toFileToolExecutionError('FILE_CHANGED');
        return createToolFailureResult(EDIT_FILE_TOOL_NAME, error.code, error.message);
      }

      const matchCount = countOccurrences(currentFile.content, oldString);
      if (matchCount === 0) {
        const error = toFileToolExecutionError('MATCH_NOT_FOUND');
        return createToolFailureResult(EDIT_FILE_TOOL_NAME, error.code, error.message);
      }

      if (matchCount > 1 && !replaceAll) {
        const error = toFileToolExecutionError('MATCH_NOT_UNIQUE');
        return createToolFailureResult(EDIT_FILE_TOOL_NAME, error.code, error.message);
      }

      const nextFile = applyStringReplacement(currentFile.content, oldString, newString, replaceAll);
      const request: AIToolConfirmationRequest = {
        toolName: EDIT_FILE_TOOL_NAME,
        title: 'AI 想要修改本地文件',
        description: `AI 请求修改本地文件：${currentFile.path}\n将 ${nextFile.replacedCount} 处匹配内容替换为新文本。`,
        riskLevel: 'write',
        beforeText: oldString,
        afterText: newString
      };
      const cancelled = await confirmOrCancel(options.confirm, request, EDIT_FILE_TOOL_NAME);
      if (cancelled) {
        return cancelled;
      }

      return executeConfirmedEdit(options.confirm, request, async () => {
        if (isActiveDocumentTarget(context, currentFile.path)) {
          await context?.editor.replaceDocument(nextFile.content);
        } else {
          await writeFile(currentFile.path, nextFile.content);
        }
        const nextSnapshot: FileReadSnapshot = {
          path: currentFile.path,
          content: nextFile.content,
          isPartial: false,
          readAt: Date.now()
        };
        options.setReadSnapshot(nextSnapshot);

        return {
          path: currentFile.path,
          content: nextFile.content,
          replacedCount: nextFile.replacedCount
        };
      });
    }
  };
}

export type { CreateBuiltinEditFileToolOptions, EditFileInput, EditFileResult } from './types';
