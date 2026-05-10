/**
 * @file fileWrite/index.ts
 * @description 内置本地文件整文件写入工具实现。
 */
import type { CreateBuiltinWriteFileToolOptions, WriteFileInput, WriteFileResult } from './types';
import type { AIToolConfirmationAdapter, AIToolConfirmationRequest } from '../../confirmation';
import type { FileReadSnapshot } from '../../shared/fileTypes';
import type { AIToolExecutionError, AIToolExecutor } from 'types/ai';
import { native } from '@/shared/platform';
import type { ReadWorkspaceFileResult } from '@/shared/platform/native/types';
import { createToolCancelledResult, createToolFailureResult, createToolSuccessResult } from '../../results';
import { toFileToolExecutionError } from '../../shared/fileErrors';
import { isAbsoluteFilePath, isPathInsideWorkspace, resolvePathAgainstWorkspace } from '../../shared/pathUtils';

/** write_file 工具名称。 */
export const WRITE_FILE_TOOL_NAME = 'write_file';

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
        error: createToolFailureResult(WRITE_FILE_TOOL_NAME, 'PERMISSION_DENIED', '未配置工作区根目录时只能写入绝对路径文件')
      };
    }

    return { path: filePath };
  }

  if (isAbsoluteFilePath(filePath)) {
    if (!isPathInsideWorkspace(filePath, workspaceRoot)) {
      return {
        error: createToolFailureResult(WRITE_FILE_TOOL_NAME, 'PERMISSION_DENIED', '目标文件不在当前工作区内')
      };
    }

    return { path: filePath };
  }

  const resolvedPath = resolvePathAgainstWorkspace(filePath, workspaceRoot);
  if (!resolvedPath) {
    return {
      error: createToolFailureResult(WRITE_FILE_TOOL_NAME, 'PERMISSION_DENIED', '相对路径超出了当前工作区范围')
    };
  }

  return { path: resolvedPath };
}

/**
 * 确认写入操作是否通过。
 * @param adapter - 确认适配器
 * @param request - 确认请求
 * @returns 取消结果或 null
 */
async function confirmOrCancel(
  adapter: AIToolConfirmationAdapter,
  request: AIToolConfirmationRequest
): Promise<ReturnType<typeof createToolCancelledResult> | null> {
  const decision = await adapter.confirm(request);
  const confirmed = typeof decision === 'boolean' ? decision : decision.approved;

  return confirmed ? null : createToolCancelledResult(WRITE_FILE_TOOL_NAME);
}

/**
 * 执行带确认的写入操作。
 * @param adapter - 确认适配器
 * @param request - 确认请求
 * @param operation - 实际写操作
 * @returns 工具执行结果
 */
async function executeConfirmedWrite(
  adapter: AIToolConfirmationAdapter,
  request: AIToolConfirmationRequest,
  operation: () => Promise<WriteFileResult>
): Promise<ReturnType<typeof createToolSuccessResult<WriteFileResult>> | ReturnType<typeof createToolFailureResult>> {
  await adapter.onExecutionStart?.(request);

  try {
    const result = await operation();
    await adapter.onExecutionComplete?.(request, { status: 'success' });
    return createToolSuccessResult(WRITE_FILE_TOOL_NAME, result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '写入文件失败';
    await adapter.onExecutionComplete?.(request, { status: 'failure', errorMessage });
    return createToolFailureResult(WRITE_FILE_TOOL_NAME, 'EXECUTION_FAILED', errorMessage);
  }
}

/**
 * 创建内置 write_file 工具。
 * @param options - 工具创建选项
 * @returns write_file 工具执行器
 */
export function createBuiltinWriteFileTool(options: CreateBuiltinWriteFileToolOptions): AIToolExecutor<WriteFileInput, WriteFileResult> {
  const readWorkspaceFile = options.readWorkspaceFile ?? native.readWorkspaceFile.bind(native);
  const writeFile = options.writeFile ?? native.writeFile.bind(native);

  return {
    definition: {
      name: WRITE_FILE_TOOL_NAME,
      description: '创建新文件或使用完整内容覆盖本地文本文件。覆盖已有文件前必须先通过 read_file 完整读取目标文件。',
      source: 'builtin',
      riskLevel: 'dangerous',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，支持相对工作区路径或绝对路径。' },
          content: { type: 'string', description: '新的完整文件内容。' }
        },
        required: ['path', 'content'],
        additionalProperties: false
      }
    },
    async execute(input: WriteFileInput) {
      const filePath = typeof input.path === 'string' ? input.path.trim() : '';
      const content = typeof input.content === 'string' ? input.content : '';

      if (!filePath) {
        return createToolFailureResult(WRITE_FILE_TOOL_NAME, 'INVALID_INPUT', '文件路径不能为空');
      }

      const workspaceRoot = options.getWorkspaceRoot?.() ?? null;
      const resolvedTargetPath = resolveTargetPath(filePath, workspaceRoot);
      if ('error' in resolvedTargetPath) {
        return resolvedTargetPath.error;
      }

      let currentFile: ReadWorkspaceFileResult | null = null;
      try {
        currentFile = await readWorkspaceFile({
          filePath,
          ...(workspaceRoot ? { workspaceRoot } : {}),
          offset: 1
        });
      } catch (error) {
        const code = readErrorCode(error);
        if (code !== 'FILE_NOT_FOUND') {
          const mappedCode: AIToolExecutionError['code'] = code === null ? 'EXECUTION_FAILED' : 'PERMISSION_DENIED';
          return createToolFailureResult(WRITE_FILE_TOOL_NAME, mappedCode, readErrorMessage(error));
        }
      }

      if (currentFile) {
        const snapshot = options.getReadSnapshot(currentFile.path);
        if (!snapshot) {
          const error = toFileToolExecutionError('FILE_NOT_READ');
          return createToolFailureResult(WRITE_FILE_TOOL_NAME, error.code, error.message);
        }

        if (snapshot.isPartial) {
          const error = toFileToolExecutionError('FILE_READ_PARTIAL');
          return createToolFailureResult(WRITE_FILE_TOOL_NAME, error.code, error.message);
        }

        if (snapshot.content !== currentFile.content) {
          const error = toFileToolExecutionError('FILE_CHANGED');
          return createToolFailureResult(WRITE_FILE_TOOL_NAME, error.code, error.message);
        }
      }

      const targetPath = currentFile?.path ?? resolvedTargetPath.path;
      const request: AIToolConfirmationRequest = {
        toolName: WRITE_FILE_TOOL_NAME,
        title: currentFile ? 'AI 想要覆盖本地文件' : 'AI 想要创建本地文件',
        description: currentFile ? `AI 请求使用新的完整内容覆盖本地文件：${targetPath}` : `AI 请求创建本地文件：${targetPath}`,
        riskLevel: currentFile ? 'dangerous' : 'write',
        ...(currentFile ? { beforeText: currentFile.content } : {}),
        afterText: content
      };
      const cancelled = await confirmOrCancel(options.confirm, request);
      if (cancelled) {
        return cancelled;
      }

      return executeConfirmedWrite(options.confirm, request, async () => {
        await writeFile(targetPath, content);
        const nextSnapshot: FileReadSnapshot = {
          path: targetPath,
          content,
          isPartial: false,
          readAt: Date.now()
        };
        options.setReadSnapshot(nextSnapshot);

        return {
          path: targetPath,
          content,
          created: currentFile === null
        };
      });
    }
  };
}

export type { CreateBuiltinWriteFileToolOptions, WriteFileInput, WriteFileResult } from './types';
