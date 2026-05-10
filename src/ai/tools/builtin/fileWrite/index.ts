/**
 * @file fileWrite/index.ts
 * @description 内置本地文件整文件写入工具实现。
 */
import type { AIToolConfirmationAdapter, AIToolConfirmationRequest } from '../../confirmation';
import type { BuiltinFileReadSnapshot } from '../fileEdit';
import type { AIToolExecutionError, AIToolExecutor } from 'types/ai';
import { native } from '@/shared/platform';
import type { ReadWorkspaceFileOptions, ReadWorkspaceFileResult } from '@/shared/platform/native/types';
import { createToolCancelledResult, createToolFailureResult, createToolSuccessResult } from '../../results';

/** write_file 工具名称。 */
export const WRITE_FILE_TOOL_NAME = 'write_file';

/**
 * write_file 工具输入参数。
 */
export interface WriteFileInput {
  /** 文件路径，支持相对工作区路径或绝对路径。 */
  path: string;
  /** 新的完整文件内容。 */
  content: string;
}

/**
 * write_file 工具返回结果。
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
  getReadSnapshot: (filePath: string) => BuiltinFileReadSnapshot | null;
  /** 写入指定文件的最新读取快照。 */
  setReadSnapshot: (filePath: string, snapshot: BuiltinFileReadSnapshot) => void;
}

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
 * 判断路径是否为绝对路径。
 * @param filePath - 文件路径
 * @returns 是否为绝对路径
 */
function isAbsoluteFilePath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith('/') || filePath.startsWith('\\\\');
}

/**
 * 解析路径前缀与片段。
 * @param filePath - 原始路径
 * @returns 路径前缀与片段
 */
function parsePathParts(filePath: string): { prefix: string; segments: string[] } {
  const normalized = filePath.replace(/\\/g, '/');

  if (/^[a-zA-Z]:\//.test(normalized)) {
    const prefix = normalized.slice(0, 2);
    const segments = normalized.slice(3).split('/').filter(Boolean);
    return { prefix, segments };
  }

  if (normalized.startsWith('/')) {
    return {
      prefix: '/',
      segments: normalized.slice(1).split('/').filter(Boolean)
    };
  }

  return {
    prefix: '',
    segments: normalized.split('/').filter(Boolean)
  };
}

/**
 * 将路径片段重新拼装为指定分隔符风格。
 * @param prefix - 路径前缀
 * @param segments - 路径片段
 * @param separator - 目标分隔符
 * @returns 重新拼装后的路径
 */
function buildPath(prefix: string, segments: string[], separator: '/' | '\\'): string {
  const joined = segments.join(separator);

  if (!prefix) {
    return joined;
  }

  if (prefix === '/') {
    return joined ? `${separator}${joined}` : separator;
  }

  return joined ? `${prefix}${separator}${joined}` : `${prefix}${separator}`;
}

/**
 * 判断目标路径是否位于工作区内。
 * @param targetPath - 目标路径
 * @param workspaceRoot - 工作区根目录
 * @returns 是否位于工作区内
 */
function isPathInsideWorkspace(targetPath: string, workspaceRoot: string): boolean {
  const target = parsePathParts(targetPath);
  const root = parsePathParts(workspaceRoot);

  if (target.prefix.toLowerCase() !== root.prefix.toLowerCase()) {
    return false;
  }

  if (target.segments.length < root.segments.length) {
    return false;
  }

  return root.segments.every((segment, index) => target.segments[index] === segment);
}

/**
 * 将工作区相对路径解析为绝对路径。
 * @param filePath - 用户输入路径
 * @param workspaceRoot - 工作区根目录
 * @returns 解析结果
 */
function resolvePathAgainstWorkspace(filePath: string, workspaceRoot: string): string | null {
  const root = parsePathParts(workspaceRoot);
  if (!root.prefix) {
    return null;
  }

  const separator: '/' | '\\' = workspaceRoot.includes('\\') ? '\\' : '/';
  const resolvedSegments = [...root.segments];
  const relativeSegments = filePath.replace(/\\/g, '/').split('/').filter(Boolean);

  for (const segment of relativeSegments) {
    if (segment === '.') {
      continue;
    }

    if (segment === '..') {
      if (resolvedSegments.length <= root.segments.length) {
        return null;
      }
      resolvedSegments.pop();
      continue;
    }

    resolvedSegments.push(segment);
  }

  return buildPath(root.prefix, resolvedSegments, separator);
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
          return createToolFailureResult(WRITE_FILE_TOOL_NAME, 'PERMISSION_DENIED', '请先使用 read_file 完整读取目标文件，再执行 write_file');
        }

        if (snapshot.isPartial) {
          return createToolFailureResult(WRITE_FILE_TOOL_NAME, 'PERMISSION_DENIED', '当前文件仅被部分读取，请先完整读取整个文件，再执行 write_file');
        }

        if (snapshot.content !== currentFile.content) {
          return createToolFailureResult(WRITE_FILE_TOOL_NAME, 'STALE_CONTEXT', '文件自上次读取后已发生变化，请重新读取后再尝试覆盖写入');
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
        options.setReadSnapshot(targetPath, {
          content,
          isPartial: false
        });

        return {
          path: targetPath,
          content,
          created: currentFile === null
        };
      });
    }
  };
}
