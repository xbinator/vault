/**
 * @file confirmation-card.test.ts
 * @description 确认卡片展示逻辑测试。
 */
import type { ChatMessageConfirmationPart } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { formatConfirmationPreviewText, getConfirmationStatusText, isConfirmationCollapsed } from '@/components/BChatSidebar/utils/confirmationCard';

/**
 * 创建确认卡片片段。
 * @param overrides - 覆盖字段
 * @returns 确认卡片片段
 */
function createConfirmationPart(overrides: Partial<ChatMessageConfirmationPart> = {}): ChatMessageConfirmationPart {
  return {
    type: 'confirmation',
    confirmationId: 'confirmation-1',
    toolName: 'insert_at_cursor',
    title: 'AI 想要插入内容',
    description: 'AI 请求在当前光标位置插入新内容。',
    riskLevel: 'write',
    afterText: 'hello',
    confirmationStatus: 'pending',
    executionStatus: 'idle',
    ...overrides
  };
}

describe('confirmation card helpers', () => {
  it('keeps pending confirmations expanded by default', () => {
    expect(isConfirmationCollapsed(createConfirmationPart(), false, false)).toBe(false);
  });

  it('collapses approved confirmations by default but lets manual expand win', () => {
    const part = createConfirmationPart({ confirmationStatus: 'approved', executionStatus: 'running' });

    expect(isConfirmationCollapsed(part, false, false)).toBe(true);
    expect(isConfirmationCollapsed(part, false, true)).toBe(false);
  });

  it('returns a running status message after approval', () => {
    const text = getConfirmationStatusText(createConfirmationPart({ confirmationStatus: 'approved', executionStatus: 'running' }));

    expect(text).toContain('正在应用');
  });

  it('returns a failure status message after approval when execution fails', () => {
    const text = getConfirmationStatusText(
      createConfirmationPart({
        confirmationStatus: 'approved',
        executionStatus: 'failure',
        executionError: '写入失败'
      })
    );

    expect(text).toContain('已确认');
    expect(text).toContain('写入失败');
  });

  it('lets manual collapse win while a confirmation is still pending', () => {
    expect(isConfirmationCollapsed(createConfirmationPart(), true, false)).toBe(true);
  });

  it('truncates write-file previews', () => {
    const preview = formatConfirmationPreviewText('a'.repeat(900), 'write_file');

    expect(preview.length).toBeLessThan(905);
    expect(preview.endsWith('\n...')).toBe(true);
  });

  it('truncates edit-file previews', () => {
    const preview = formatConfirmationPreviewText('a'.repeat(900), 'edit_file');

    expect(preview.length).toBeLessThan(905);
    expect(preview.endsWith('\n...')).toBe(true);
  });

  it('uses file-specific status copy for pending dangerous confirmations', () => {
    const text = getConfirmationStatusText(
      createConfirmationPart({
        toolName: 'write_file',
        riskLevel: 'dangerous'
      })
    );

    expect(text).toContain('覆盖文件内容');
  });

  it('uses file-specific success copy after approval', () => {
    const text = getConfirmationStatusText(
      createConfirmationPart({
        toolName: 'edit_file',
        confirmationStatus: 'approved',
        executionStatus: 'success'
      })
    );

    expect(text).toContain('已应用到文件');
  });
});
