/**
 * @file parseToken.ts
 * @description 解析聊天与输入框共用的文件引用 token。
 */

import type { ParsedFileReference } from './types';

/** 文件引用 token 正则表达式。 */
const FILE_REFERENCE_TOKEN_PATTERN = /^#(\S+)\s+(\d+)-(\d+)(?:\|(\d+)-(\d+))?$/;

/**
 * 从路径字符串中提取展示用文件名。
 * @param rawPath - 原始路径字符串
 * @returns 文件名
 */
function extractFileName(rawPath: string): string {
  return rawPath.split(/[\\/]/).filter(Boolean).at(-1) ?? rawPath;
}

/**
 * 解析 `unsaved://id/fileName` 格式的草稿引用。
 * @param rawPath - 原始路径字符串
 * @returns 草稿 ID 与文件名，非草稿格式时返回 null
 */
function parseUnsavedReference(rawPath: string): { fileId: string; fileName: string } | null {
  const matched = rawPath.match(/^unsaved:\/\/([^/]+)\/(.+)$/);
  if (!matched) {
    return null;
  }

  const [, fileId, fileName] = matched;
  return {
    fileId,
    fileName
  };
}

/**
 * 解析文件引用 token。
 * @param tokenContent - token 内容，包含 `#`
 * @returns 结构化解析结果；非法格式返回 null
 */
export function parseFileReferenceToken(tokenContent: string): ParsedFileReference | null {
  const matched = tokenContent.match(FILE_REFERENCE_TOKEN_PATTERN);
  if (!matched) {
    return null;
  }

  const [, rawPathText, startLineText, endLineText, renderStartLineText, renderEndLineText] = matched;
  const rawPath = rawPathText.trim();
  const unsavedReference = parseUnsavedReference(rawPath);
  const startLine = Number(startLineText);
  const endLine = Number(endLineText);

  return {
    rawPath,
    filePath: unsavedReference ? null : rawPath,
    fileId: unsavedReference?.fileId ?? null,
    fileName: unsavedReference?.fileName ?? extractFileName(rawPath),
    startLine,
    endLine,
    renderStartLine: renderStartLineText ? Number(renderStartLineText) : startLine,
    renderEndLine: renderEndLineText ? Number(renderEndLineText) : endLine,
    lineText: `${startLine}-${endLine}`,
    isUnsaved: Boolean(unsavedReference)
  };
}
