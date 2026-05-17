/**
 * @file server-editor.test.ts
 * @description 验证 MCP Server 编辑器 JSON 解析与序列化逻辑。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS } from '@/shared/storage/tool-settings';
import { parseMCPServerEditorDraft, serializeMCPServerEditorDraft } from '@/views/settings/tools/mcp/components/server-editor';

describe('server-editor helpers', () => {
  it('returns a validation error when command is missing', () => {
    const result = parseMCPServerEditorDraft(
      JSON.stringify({
        name: 'filesystem'
      })
    );

    expect(result.draft).toBeNull();
    expect(result.error).toContain('`command`');
  });

  it('normalizes optional fields and falls back to default timeout', () => {
    const result = parseMCPServerEditorDraft(
      JSON.stringify({
        command: 'npx',
        args: ['-y', 123],
        env: {
          ROOT: '/tmp',
          DEBUG: true
        },
        toolAllowlist: ['read_file', 42]
      })
    );

    expect(result.error).toBe('');
    expect(result.draft).toEqual({
      name: 'New MCP Server',
      command: 'npx',
      args: ['-y', '123'],
      env: {
        ROOT: '/tmp',
        DEBUG: 'true'
      },
      toolAllowlist: ['read_file', '42'],
      toolCallTimeoutMs: DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS
    });
  });

  it('serializes an existing server without server-level runtime fields', () => {
    const result = serializeMCPServerEditorDraft({
      id: 'server-1',
      name: 'Filesystem',
      enabled: true,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      env: { ROOT: '/tmp' },
      toolAllowlist: ['read_file'],
      connectTimeoutMs: 20000,
      toolCallTimeoutMs: 30000
    });

    expect(result).toContain('"name": "Filesystem"');
    expect(result).toContain('"toolCallTimeoutMs": 30000');
    expect(result).not.toContain('"enabled"');
    expect(result).not.toContain('"connectTimeoutMs"');
  });
});
