import { describe, expect, it } from 'vitest';
import { QUERY_LOGS_TOOL_NAME, READ_DIRECTORY_TOOL_NAME, GET_SETTINGS_TOOL_NAME, UPDATE_SETTINGS_TOOL_NAME, createBuiltinTools } from '@/ai/tools/builtin';

/**
 * 提取工具名称列表。
 * @param includeWriteTools - 是否包含写工具
 * @returns 工具名称列表
 */
function getToolNames(includeWriteTools = false): string[] {
  return createBuiltinTools(
    includeWriteTools
      ? {
          confirm: {
            confirm: async () => true
          }
        }
      : undefined
  ).map((tool) => tool.definition.name);
}

describe('createBuiltinTools', () => {
  it('returns read tools by default', () => {
    expect(getToolNames()).toEqual([
      'read_current_document',
      'get_current_time',
      'ask_user_question',
      'read_file',
      'read_directory',
      'get_settings',
      'query_logs'
    ]);
  });

  it('includes write tools when confirmation adapter is provided', () => {
    const names = getToolNames(true);
    expect(names).toContain('edit_file');
    expect(names).toContain('write_file');
    expect(names).toContain('update_settings');
  });
});

describe('builtin tool exports', () => {
  it('exports read tool names', () => {
    expect(READ_DIRECTORY_TOOL_NAME).toBe('read_directory');
    expect(QUERY_LOGS_TOOL_NAME).toBe('query_logs');
    expect(GET_SETTINGS_TOOL_NAME).toBe('get_settings');
  });

  it('exports write tool names', () => {
    expect(UPDATE_SETTINGS_TOOL_NAME).toBe('update_settings');
  });
});
