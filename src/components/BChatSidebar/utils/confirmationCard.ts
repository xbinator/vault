/**
 * @file confirmationCard.ts
 * @description 确认卡片展示逻辑辅助函数。
 */
import type { ChatMessageConfirmationPart } from 'types/chat';

/** 需要限制预览长度的文件工具名称集合。 */
const FILE_PREVIEW_TOOL_NAMES = new Set(['edit_file', 'write_file']);
/** 需要使用文件态状态文案的工具名称集合。 */
const FILE_STATUS_TOOL_NAMES = new Set(['edit_file', 'write_file']);

/**
 * 判断确认卡片是否已折叠。
 * @param part - 确认卡片片段
 * @param isManuallyCollapsed - 是否被用户手动折叠
 * @param isManuallyExpanded - 是否被用户手动展开
 * @returns 是否折叠
 */
export function isConfirmationCollapsed(part: ChatMessageConfirmationPart, isManuallyCollapsed: boolean, isManuallyExpanded: boolean): boolean {
  if (isManuallyCollapsed) {
    return true;
  }

  if (isManuallyExpanded) {
    return false;
  }

  return part.confirmationStatus !== 'pending';
}

/**
 * 将确认预览文本格式化为有限长度，避免整篇文档占满卡片。
 * @param text - 原始文本
 * @param toolName - 工具名称
 * @returns 可展示文本
 */
export function formatConfirmationPreviewText(text: string, toolName: string): string {
  if (!FILE_PREVIEW_TOOL_NAMES.has(toolName)) {
    return text;
  }

  const previewLimit = 800;
  return text.length > previewLimit ? `${text.slice(0, previewLimit)}\n...` : text;
}

/**
 * 获取确认卡片状态文案。
 * @param part - 确认卡片片段
 * @returns 状态说明
 */
export function getConfirmationStatusText(part: ChatMessageConfirmationPart): string {
  const isFileTool = FILE_STATUS_TOOL_NAMES.has(part.toolName);
  const pendingTextByRisk = {
    dangerous: isFileTool ? '此操作会覆盖文件内容，请确认是否继续。' : '此操作会影响当前全部内容，请确认是否继续。',
    normal: isFileTool ? '等待你确认是否应用这次文件修改。' : '等待你确认是否应用这次修改。'
  };

  if (part.confirmationStatus === 'pending') {
    return part.riskLevel === 'dangerous' ? pendingTextByRisk.dangerous : pendingTextByRisk.normal;
  }

  if (part.confirmationStatus === 'cancelled') {
    return '已取消本次修改。';
  }

  if (part.confirmationStatus === 'expired') {
    return '该确认已过期，无法继续应用。';
  }

  if (part.executionStatus === 'running') {
    return isFileTool ? '已确认，正在应用到文件。' : '已确认，正在应用到文档。';
  }

  if (part.executionStatus === 'success') {
    return isFileTool ? '已应用到文件。' : '已应用到文档。';
  }

  if (part.executionStatus === 'failure') {
    return `已确认，但应用失败：${part.executionError ?? '未知错误'}`;
  }

  return '已确认，等待执行。';
}
