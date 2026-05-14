/**
 * @file fileWrite/index.ts
 * @description 内置本地文件整文件写入工具实现。
 */
import type { CreateBuiltinWriteFileToolOptions, WriteFileInput, WriteFileResult } from './types';
import type { AIToolConfirmationAdapter, AIToolConfirmationRequest } from '../../confirmation';
import type { AIToolContext, AIToolExecutionError, AIToolExecutor } from 'types/ai';
import { native } from '@/shared/platform';
import type { ReadWorkspaceFileResult } from '@/shared/platform/native/types';
import { recentFilesStorage } from '@/shared/storage';
import type { StoredFile } from '@/shared/storage/files/types';
import { isUnsavedPath, parseUnsavedPath } from '@/utils/fileReference/unsavedPath';
import { createToolCancelledResult, createToolFailureResult, createToolSuccessResult } from '../../results';
import { isAbsoluteFilePath, isPathInsideWorkspace, resolvePathAgainstWorkspace } from '../../shared/pathUtils';

export const WRITE_FILE_TOOL_NAME = 'write_file';

// ─── 快捷工厂 ────────────────────────────────────────────────────────────────

/** 快速构建失败结果，减少重复传参。 */
const fail = (code: AIToolExecutionError['code'], message: string) => createToolFailureResult(WRITE_FILE_TOOL_NAME, code, message);

// ─── 错误工具函数 ─────────────────────────────────────────────────────────────

/**
 * 将 native 抛出的未知错误映射为工具失败结果。
 * 整合了原先分散的 readErrorCode + extractErrorMessage 逻辑。
 */
function mapNativeError(error: unknown): { code: AIToolExecutionError['code']; message: string } {
  let rawCode: string | null = null;
  if (typeof error === 'object' && error !== null && 'code' in error && typeof (error as any).code === 'string') {
    rawCode = (error as any).code;
  }

  let message = '操作失败';
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string' && error.trim()) {
    message = error;
  }

  let code: AIToolExecutionError['code'];
  if (rawCode === null) {
    code = 'EXECUTION_FAILED';
  } else {
    code = 'PERMISSION_DENIED';
  }
  return { code, message };
}

// ─── 路径解析 ─────────────────────────────────────────────────────────────────

type ResolveResult = { path: string } | { error: ReturnType<typeof createToolFailureResult> };

/**
 * 解析输入路径并执行工作区边界校验。
 */
function resolveTargetPath(filePath: string, workspaceRoot: string | null): ResolveResult {
  if (isUnsavedPath(filePath)) {
    return { path: filePath };
  }

  if (!workspaceRoot) {
    if (!isAbsoluteFilePath(filePath)) {
      return { error: fail('PERMISSION_DENIED', '未配置工作区根目录时只能写入绝对路径文件') };
    }
    return { path: filePath };
  }

  if (isAbsoluteFilePath(filePath)) {
    if (!isPathInsideWorkspace(filePath, workspaceRoot)) {
      return { error: fail('PERMISSION_DENIED', '目标文件不在当前工作区内') };
    }
    return { path: filePath };
  }

  const resolvedPath = resolvePathAgainstWorkspace(filePath, workspaceRoot);
  if (!resolvedPath) {
    return { error: fail('PERMISSION_DENIED', '相对路径超出了当前工作区范围') };
  }

  return { path: resolvedPath };
}

// ─── 文档上下文工具函数 ────────────────────────────────────────────────────────

/**
 * 判断目标路径是否命中激活文档（包含 saved/unsaved 两种情况）。
 */
function isActiveDocumentTarget(context: AIToolContext | undefined, targetPath: string): boolean {
  return context?.document.path === targetPath || context?.document.locator === targetPath;
}

// ─── 未保存草稿 I/O ───────────────────────────────────────────────────────────

async function readUnsavedDraft(options: CreateBuiltinWriteFileToolOptions, fileId: string): Promise<StoredFile | null> {
  if (!fileId.trim()) return null;
  const getter = options.getUnsavedDraft ?? ((id: string) => recentFilesStorage.getRecentFile(id));
  return getter(fileId);
}

async function writeUnsavedDraft(options: CreateBuiltinWriteFileToolOptions, fileId: string, updates: Partial<StoredFile>): Promise<StoredFile> {
  if (!fileId.trim()) throw new Error('未保存文档 ID 不能为空');
  const updater = options.updateUnsavedDraft ?? ((id: string, u: Partial<StoredFile>) => recentFilesStorage.updateRecentFile(id, u));
  return updater(fileId, updates);
}

// ─── 确认流程 ─────────────────────────────────────────────────────────────────

/**
 * 向用户请求确认，若拒绝则返回取消结果，否则返回 null。
 */
async function confirmOrCancel(
  adapter: AIToolConfirmationAdapter,
  request: AIToolConfirmationRequest
): Promise<ReturnType<typeof createToolCancelledResult> | null> {
  const decision = await adapter.confirm(request);
  let confirmed: boolean;
  if (typeof decision === 'boolean') {
    confirmed = decision;
  } else {
    confirmed = decision.approved;
  }
  if (!confirmed) {
    return createToolCancelledResult(WRITE_FILE_TOOL_NAME);
  }
  return null;
}

/**
 * 执行带生命周期回调的写入操作，统一处理成功/失败结果。
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
    let errorMessage = '写入文件失败';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    await adapter.onExecutionComplete?.(request, { status: 'failure', errorMessage });
    return fail('EXECUTION_FAILED', errorMessage);
  }
}

// ─── 写入路径：未保存草稿 ──────────────────────────────────────────────────────

/**
 * 处理目标为未保存草稿的写入流程。
 */
async function handleUnsavedWrite(options: CreateBuiltinWriteFileToolOptions, context: AIToolContext | undefined, targetPath: string, content: string) {
  const unsavedReference = parseUnsavedPath(targetPath);
  if (!unsavedReference) {
    return fail('INVALID_INPUT', `未识别的未保存文档路径：${targetPath}`);
  }

  const isActive = isActiveDocumentTarget(context, targetPath);
  let currentContent: string | null;
  if (isActive) {
    currentContent = context?.document.getContent() ?? null;
  } else {
    const draft = await readUnsavedDraft(options, unsavedReference.fileId);
    currentContent = draft?.content ?? null;
  }

  if (currentContent === null) {
    return fail('EXECUTION_FAILED', `未找到未保存文件：${targetPath}`);
  }

  const request: AIToolConfirmationRequest = {
    toolName: WRITE_FILE_TOOL_NAME,
    title: 'AI 想要覆盖未保存草稿',
    description: `AI 请求使用新的完整内容覆盖未保存草稿：${targetPath}`,
    riskLevel: 'write',
    beforeText: currentContent,
    afterText: content
  };

  const cancelled = await confirmOrCancel(options.confirm, request);
  if (cancelled) return cancelled;

  return executeConfirmedWrite(options.confirm, request, async () => {
    if (isActive) {
      await context?.editor.replaceDocument(content);
    } else {
      await writeUnsavedDraft(options, unsavedReference.fileId, { content, modifiedAt: Date.now() });
    }
    return { path: targetPath, content, created: false };
  });
}

// ─── 写入路径：工作区文件 ─────────────────────────────────────────────────────

/**
 * 读取工作区文件；若文件不存在返回 null，其他错误直接返回失败结果。
 */
async function tryReadWorkspaceFile(
  readWorkspaceFile: typeof native.readWorkspaceFile,
  filePath: string,
  workspaceRoot: string | null
): Promise<ReadWorkspaceFileResult | null | ReturnType<typeof createToolFailureResult>> {
  try {
    const readOptions: { filePath: string; workspaceRoot?: string; offset: number } = { filePath, offset: 1 };
    if (workspaceRoot) {
      readOptions.workspaceRoot = workspaceRoot;
    }
    return await readWorkspaceFile(readOptions);
  } catch (error) {
    let rawCode: string | null = null;
    if (typeof error === 'object' && error !== null && 'code' in error && typeof (error as any).code === 'string') {
      rawCode = (error as any).code;
    }

    if (rawCode === 'FILE_NOT_FOUND') return null;

    const { code, message } = mapNativeError(error);
    return fail(code, message);
  }
}

/**
 * 处理目标为工作区文件的写入流程。
 */
async function handleWorkspaceWrite(
  options: CreateBuiltinWriteFileToolOptions,
  writeFile: typeof native.writeFile,
  context: AIToolContext | undefined,
  filePath: string,
  resolvedPath: string,
  content: string
): Promise<
  ReturnType<typeof createToolSuccessResult<WriteFileResult>> | ReturnType<typeof createToolFailureResult> | ReturnType<typeof createToolCancelledResult>
> {
  const workspaceRoot = options.getWorkspaceRoot?.() ?? null;
  const fileOrError = await tryReadWorkspaceFile(options.readWorkspaceFile ?? native.readWorkspaceFile.bind(native), filePath, workspaceRoot);

  // tryReadWorkspaceFile 返回失败结果时直接透传
  if (fileOrError !== null && 'type' in (fileOrError as object) && (fileOrError as any).type === 'failure') {
    return fileOrError as ReturnType<typeof createToolFailureResult>;
  }

  const currentFile = fileOrError as ReadWorkspaceFileResult | null;

  let targetPath: string;
  if (currentFile) {
    targetPath = currentFile.path;
  } else {
    targetPath = resolvedPath;
  }

  let request: AIToolConfirmationRequest;
  if (currentFile) {
    request = {
      toolName: WRITE_FILE_TOOL_NAME,
      title: 'AI 想要覆盖本地文件',
      description: `AI 请求使用新的完整内容覆盖本地文件：${targetPath}`,
      riskLevel: 'dangerous',
      beforeText: currentFile.content,
      afterText: content
    };
  } else {
    request = {
      toolName: WRITE_FILE_TOOL_NAME,
      title: 'AI 想要创建本地文件',
      description: `AI 请求创建本地文件：${targetPath}`,
      riskLevel: 'write',
      afterText: content
    };
  }

  const cancelled = await confirmOrCancel(options.confirm, request);
  if (cancelled) return cancelled;

  return executeConfirmedWrite(options.confirm, request, async () => {
    if (isActiveDocumentTarget(context, targetPath)) {
      await context?.editor.replaceDocument(content);
    } else {
      await writeFile(targetPath, content);
    }
    return { path: targetPath, content, created: currentFile === null };
  });
}

// ─── 工具入口 ─────────────────────────────────────────────────────────────────

/**
 * 创建内置 write_file 工具。
 */
export function createBuiltinWriteFileTool(options: CreateBuiltinWriteFileToolOptions): AIToolExecutor<WriteFileInput, WriteFileResult> {
  const writeFile = options.writeFile ?? native.writeFile.bind(native);

  return {
    definition: {
      name: WRITE_FILE_TOOL_NAME,
      description: '创建新文件或使用完整内容覆盖本地文本文件。执行前会向用户展示确认信息。',
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

    async execute(input: WriteFileInput, context?: AIToolContext) {
      let filePath = '';
      if (typeof input.path === 'string') {
        filePath = input.path.trim();
      }

      let content = '';
      if (typeof input.content === 'string') {
        content = input.content;
      }

      if (!filePath) {
        return fail('INVALID_INPUT', '文件路径不能为空');
      }

      const workspaceRoot = options.getWorkspaceRoot?.() ?? null;
      const resolved = resolveTargetPath(filePath, workspaceRoot);
      if ('error' in resolved) return resolved.error;

      if (isUnsavedPath(resolved.path)) {
        return handleUnsavedWrite(options, context, resolved.path, content);
      }

      return handleWorkspaceWrite(options, writeFile, context, filePath, resolved.path, content);
    }
  };
}

export type { CreateBuiltinWriteFileToolOptions, WriteFileInput, WriteFileResult } from './types';
