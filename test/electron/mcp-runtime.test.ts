/**
 * @file mcp-runtime.test.ts
 * @description 验证 MCP runtime 状态与 discovery cache 管理。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MCPDiscoveredToolSnapshot, MCPServerConfig } from '@/shared/storage/tool-settings';

/**
 * 创建 MCP server 配置。
 * @param patch - 覆盖字段
 * @returns MCP server 配置
 */
function createServer(patch: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    id: 'server-1',
    name: 'Filesystem',
    enabled: true,
    transport: 'stdio',
    command: 'npx',
    args: [],
    env: {},
    toolAllowlist: [],
    connectTimeoutMs: 20000,
    toolCallTimeoutMs: 30000,
    ...patch
  };
}

describe('mcp runtime', () => {
  beforeEach(async () => {
    const { resetMcpRuntimeState } = await import('../../electron/main/modules/ai/mcp-runtime.mjs');
    resetMcpRuntimeState();
  });

  it('returns idle status before a server is refreshed', async () => {
    const { getMcpStatus } = await import('../../electron/main/modules/ai/mcp-runtime.mjs');

    expect(getMcpStatus(['server-1'])).toEqual([
      {
        serverId: 'server-1',
        sandboxStatus: 'idle',
        discoveryStatus: 'idle'
      }
    ]);
  });

  it('refreshes discovery and stores a cache when provider succeeds', async () => {
    const { getMcpDiscoveryCache, getMcpStatus, refreshMcpDiscovery } = await import('../../electron/main/modules/ai/mcp-runtime.mjs');
    const tools: MCPDiscoveredToolSnapshot[] = [{ serverId: 'server-1', toolName: 'read_file', description: 'Read file' }];
    const discoverTools = vi.fn(async () => tools);

    const result = await refreshMcpDiscovery(createServer(), { discoverTools, now: () => 1710000000000 });

    expect(result).toEqual({
      ok: true,
      serverId: 'server-1',
      cache: {
        serverId: 'server-1',
        tools,
        discoveredAt: 1710000000000
      }
    });
    expect(getMcpDiscoveryCache('server-1')).toEqual(result.cache);
    expect(getMcpStatus(['server-1'])[0]).toMatchObject({
      sandboxStatus: 'running',
      discoveryStatus: 'ready'
    });
  });

  it('marks status as failed when local discovery fails', async () => {
    const { getMcpStatus, refreshMcpDiscovery } = await import('../../electron/main/modules/ai/mcp-runtime.mjs');

    const result = await refreshMcpDiscovery(createServer(), {
      discoverTools: vi.fn(async () => {
        throw new Error('local spawn failed');
      })
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('LOCAL_EXEC_FAILED');
    expect(getMcpStatus(['server-1'])[0]).toMatchObject({
      sandboxStatus: 'failed',
      discoveryStatus: 'failed',
      message: 'local spawn failed'
    });
  });

  it('executes MCP tools with the matching local server config', async () => {
    const { executeMcpTool } = await import('../../electron/main/modules/ai/mcp-runtime.mjs');
    const executeTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }));

    const result = await executeMcpTool(createServer(), 'read_file', { path: 'README.md' }, { executeTool });

    expect(executeTool).toHaveBeenCalledWith(createServer(), 'read_file', { path: 'README.md' });
    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });
});
