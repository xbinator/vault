/**
 * @file results.test.ts
 * @description Tests for AI tool result factories.
 */
import { describe, expect, it } from 'vitest';
import {
  createAwaitingUserInputResult,
  createToolCancelledResult,
  createToolFailureResult,
  createToolSuccessResult
} from '@/ai/tools/results';

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
    const result = createToolFailureResult('replace_selection', 'NO_SELECTION', 'no selection available');

    expect(result).toEqual({
      toolName: 'replace_selection',
      status: 'failure',
      error: {
        code: 'NO_SELECTION',
        message: 'no selection available'
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

  it('creates an awaiting user input result with question data', () => {
    const result = createAwaitingUserInputResult('ask_user_question', {
      questionId: 'question-1',
      toolCallId: 'tool-call-1',
      mode: 'single',
      question: 'Choose a channel type',
      options: [
        { label: 'Official', value: 'official' },
        { label: 'Xiaohongshu', value: 'xiaohongshu' }
      ],
      allowOther: false
    });

    expect(result).toEqual({
      toolName: 'ask_user_question',
      status: 'awaiting_user_input',
      data: {
        questionId: 'question-1',
        toolCallId: 'tool-call-1',
        mode: 'single',
        question: 'Choose a channel type',
        options: [
          { label: 'Official', value: 'official' },
          { label: 'Xiaohongshu', value: 'xiaohongshu' }
        ],
        allowOther: false
      }
    });

    if (result.status === 'awaiting_user_input') {
      const questionId: string = result.data.questionId;

      expect(questionId).toBe('question-1');
      expect(result.data.toolCallId).toBe('tool-call-1');
    }
  });
});
