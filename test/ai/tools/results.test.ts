import { describe, expect, it } from 'vitest';
import { createToolCancelledResult, createToolFailureResult, createToolSuccessResult } from '@/ai/tools/results';

describe('AI tool result helpers', () => {
  it('creates a successful result with data', () => {
    const result = createToolSuccessResult('read_current_document', { title: 'Note' });

    expect(result).toEqual({
      toolName: 'read_current_document',
      status: 'success',
      data: { title: 'Note' }
    });
  });

  it('creates a failed result with a stable error code', () => {
    const result = createToolFailureResult('replace_selection', 'NO_SELECTION', '当前没有选区');

    expect(result).toEqual({
      toolName: 'replace_selection',
      status: 'failure',
      error: {
        code: 'NO_SELECTION',
        message: '当前没有选区'
      }
    });
  });

  it('creates a cancelled result', () => {
    const result = createToolCancelledResult('insert_at_cursor');

    expect(result).toEqual({
      toolName: 'insert_at_cursor',
      status: 'cancelled',
      error: {
        code: 'USER_CANCELLED',
        message: '用户取消了工具调用'
      }
    });
  });
});
