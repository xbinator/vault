/**
 * @file runtime.mts
 * @description MCP server 本地执行状态与 discovery cache 管理。
 */
import type { MCPDiscoveredToolSnapshot, MCPDiscoveryRefreshResult, MCPServerConfig, MCPServerDiscoveryCache, MCPStatusResponse } from 'types/ai';
import { discoverMcpToolsLocally, executeMcpToolLocally, type MCPLocalSpawn } from './local-stdio.mjs';

/**
 * MCP discovery provider。
 */
export type MCPDiscoveryProvider = (server: MCPServerConfig) => Promise<MCPDiscoveredToolSnapshot[]>;

/**
 * MCP tool 执行 provider。
 */
export type MCPToolExecutionProvider = (server: MCPServerConfig, toolName: string, input: unknown) => Promise<unknown>;

/**
 * MCP discovery 刷新依赖。
 */
export interface MCPDiscoveryRefreshDependencies {
  /** 本地 spawn 注入点 */
  spawnProcess?: MCPLocalSpawn;
  /** discovery provider 注入点 */
  discoverTools?: MCPDiscoveryProvider;
  /** 当前时间注入点 */
  now?: () => number;
}

/**
 * MCP tool 执行依赖。
 */
export interface MCPToolExecutionDependencies {
  /** 本地 spawn 注入点 */
  spawnProcess?: MCPLocalSpawn;
  /** tool execute provider 注入点 */
  executeTool?: MCPToolExecutionProvider;
}

const statusByServerId = new Map<string, MCPStatusResponse>();
const discoveryCacheByServerId = new Map<string, MCPServerDiscoveryCache>();

/**
 * 获取 server 状态，没有状态时返回 idle。
 * @param serverId - server ID
 * @returns MCP 状态
 */
function getStatusOrIdle(serverId: string): MCPStatusResponse {
  return (
    statusByServerId.get(serverId) ?? {
      serverId,
      sandboxStatus: 'idle',
      discoveryStatus: 'idle'
    }
  );
}

/**
 * 更新 server 状态。
 * @param status - 新状态
 */
function setStatus(status: MCPStatusResponse): void {
  statusByServerId.set(status.serverId, status);
}

/**
 * 将未知本地执行错误归类为稳定错误码。
 * @param error - 原始错误
 * @returns 稳定错误码与消息
 */
function classifyMcpLocalError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes('timed out')) {
    return { code: 'LOCAL_EXEC_TIMEOUT', message };
  }
  return { code: 'LOCAL_EXEC_FAILED', message };
}

/**
 * 默认 discovery provider。
 * @param server - MCP server 配置
 * @param spawnProcess - 本地 spawn 注入点
 * @returns discovery 工具快照
 */
async function discoverMcpToolsWithLocalRunner(server: MCPServerConfig, spawnProcess?: MCPLocalSpawn): Promise<MCPDiscoveredToolSnapshot[]> {
  return discoverMcpToolsLocally(server, spawnProcess);
}

/**
 * 默认 tool execute provider。
 * @param server - MCP server 配置
 * @param toolName - MCP tool 名称
 * @param input - Tool 输入
 * @param spawnProcess - 本地 spawn 注入点
 * @returns MCP tool 调用结果
 */
async function executeMcpToolWithLocalRunner(server: MCPServerConfig, toolName: string, input: unknown, spawnProcess?: MCPLocalSpawn): Promise<unknown> {
  return executeMcpToolLocally(server, toolName, input, spawnProcess);
}

/**
 * 重置 MCP runtime 内存状态，主要用于测试和应用重新初始化。
 */
export function resetMcpRuntimeState(): void {
  statusByServerId.clear();
  discoveryCacheByServerId.clear();
}

/**
 * 查询一个或多个 MCP server 状态。
 * @param serverIds - server ID 列表
 * @returns 状态列表
 */
export function getMcpStatus(serverIds: string[]): MCPStatusResponse[] {
  return serverIds.map((serverId) => getStatusOrIdle(serverId));
}

/**
 * 读取 discovery cache。
 * @param serverId - 可选 server ID
 * @returns 单个 cache 或全部 cache
 */
export function getMcpDiscoveryCache(serverId?: string): MCPServerDiscoveryCache | MCPServerDiscoveryCache[] | undefined {
  if (serverId) {
    return discoveryCacheByServerId.get(serverId);
  }
  return [...discoveryCacheByServerId.values()];
}

/**
 * 刷新指定 MCP server 的 discovery cache。
 * @param server - MCP server 配置
 * @param dependencies - 可注入依赖
 * @returns discovery 刷新结果
 */
export async function refreshMcpDiscovery(server: MCPServerConfig, dependencies: MCPDiscoveryRefreshDependencies = {}): Promise<MCPDiscoveryRefreshResult> {
  setStatus({
    serverId: server.id,
    sandboxStatus: 'starting',
    discoveryStatus: 'refreshing'
  });

  try {
    const tools = dependencies.discoverTools
      ? await dependencies.discoverTools(server)
      : await discoverMcpToolsWithLocalRunner(server, dependencies.spawnProcess);
    const cache: MCPServerDiscoveryCache = {
      serverId: server.id,
      tools,
      discoveredAt: dependencies.now?.() ?? Date.now()
    };

    discoveryCacheByServerId.set(server.id, cache);
    setStatus({
      serverId: server.id,
      sandboxStatus: 'running',
      discoveryStatus: 'ready'
    });

    return { ok: true, serverId: server.id, cache };
  } catch (error) {
    const localError = classifyMcpLocalError(error);
    setStatus({
      serverId: server.id,
      sandboxStatus: 'failed',
      discoveryStatus: 'failed',
      message: localError.message
    });

    return {
      ok: false,
      serverId: server.id,
      errorCode: localError.code,
      message: localError.message
    };
  }
}

/**
 * 在本机执行指定 MCP tool。
 * @param server - MCP server 配置
 * @param toolName - MCP tool 名称
 * @param input - Tool 输入
 * @param dependencies - 可注入依赖
 * @returns MCP tool 调用结果
 */
export async function executeMcpTool(
  server: MCPServerConfig,
  toolName: string,
  input: unknown,
  dependencies: MCPToolExecutionDependencies = {}
): Promise<unknown> {
  return dependencies.executeTool
    ? dependencies.executeTool(server, toolName, input)
    : executeMcpToolWithLocalRunner(server, toolName, input, dependencies.spawnProcess);
}
