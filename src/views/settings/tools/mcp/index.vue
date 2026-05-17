<!--
  @file index.vue
  @description MCP 工具设置页，负责管理 MCP server 配置。
-->
<template>
  <BSettingsPage title="MCP">
    <BSettingsSection title="MCP Servers">
      <div class="mcp-tools-settings__toolbar">
        <div class="mcp-tools-settings__hint">配置会保存为全局设置，聊天侧只消费默认启用项。</div>
        <BButton type="primary" size="small" @click="handleAddServer">新增 Server</BButton>
      </div>

      <div v-if="store.mcp.servers.length === 0" class="mcp-tools-settings__empty">暂无 MCP server 配置。</div>

      <div v-for="server in store.mcp.servers" :key="server.id" class="mcp-tools-settings__server">
        <div class="mcp-tools-settings__server-head">
          <AInput :value="server.name" placeholder="Server 名称" @update:value="(value) => handleServerPatch(server.id, { name: value })" />
          <ASwitch :checked="server.enabled" @change="(value) => handleServerPatch(server.id, { enabled: Boolean(value) })" />
          <BButton type="text" size="small" :disabled="refreshingServerId === server.id" @click="handleRefreshDiscovery(server)">
            {{ refreshingServerId === server.id ? '刷新中' : '刷新工具' }}
          </BButton>
          <BButton type="text" size="small" @click="handleRemoveServer(server.id)">删除</BButton>
        </div>

        <div class="mcp-tools-settings__status">
          本地执行：{{ getServerStatus(server.id).sandboxStatus }} / Discovery：{{ getServerStatus(server.id).discoveryStatus }}
          <span v-if="getServerStatus(server.id).message"> - {{ getServerStatus(server.id).message }}</span>
        </div>

        <div class="mcp-tools-settings__grid">
          <label class="mcp-tools-settings__field">
            <span>启动命令</span>
            <AInput :value="server.command" placeholder="npx" @update:value="(value) => handleServerPatch(server.id, { command: value })" />
          </label>

          <label class="mcp-tools-settings__field">
            <span>启动参数</span>
            <AInput
              :value="server.args.join(' ')"
              placeholder="-y @modelcontextprotocol/server-filesystem"
              @update:value="(value) => handleArgsChange(server.id, value)"
            />
          </label>

          <label class="mcp-tools-settings__field">
            <span>允许工具</span>
            <AInput
              :value="server.toolAllowlist.join(', ')"
              placeholder="read_file, list_directory"
              @update:value="(value) => handleAllowlistChange(server.id, value)"
            />
          </label>

          <label class="mcp-tools-settings__field">
            <span>单次调用超时 ms</span>
            <AInputNumber :value="server.toolCallTimeoutMs" :min="1000" :max="120000" @update:value="(value) => handleToolTimeoutChange(server.id, value)" />
          </label>
        </div>
      </div>
    </BSettingsSection>
  </BSettingsPage>
</template>

<script setup lang="ts">
import type { MCPStatusResponse } from 'types/ai';
import { onMounted, ref } from 'vue';
import { nanoid } from 'nanoid';
import { getElectronAPI, hasElectronAPI } from '@/shared/platform/electron-api';
import type { MCPServerConfig } from '@/shared/storage/tool-settings';
import { DEFAULT_MCP_CONNECT_TIMEOUT_MS, DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS } from '@/shared/storage/tool-settings';
import { useToolSettingsStore } from '@/stores/toolSettings';

const store = useToolSettingsStore();
const refreshingServerId = ref<string | null>(null);
const statusByServerId = ref<Record<string, MCPStatusResponse>>({});

/**
 * 读取 server 状态，缺省时返回 idle。
 * @param serverId - MCP server ID
 * @returns MCP server 状态
 */
function getServerStatus(serverId: string): MCPStatusResponse {
  return (
    statusByServerId.value[serverId] ?? {
      serverId,
      sandboxStatus: 'idle',
      discoveryStatus: 'idle'
    }
  );
}

/**
 * 解析逗号分隔的字符串列表。
 * @param value - 输入框值
 * @returns 去空后的字符串数组
 */
function parseCommaList(value: string): string[] {
  return value
    .split(',')
    .map((item: string) => item.trim())
    .filter((item: string) => item.length > 0);
}

/**
 * 解析空格分隔的参数列表。
 * @param value - 输入框值
 * @returns 参数数组
 */
function parseArgs(value: string): string[] {
  return value
    .split(/\s+/)
    .map((item: string) => item.trim())
    .filter((item: string) => item.length > 0);
}

/**
 * 创建默认 MCP server 配置。
 * @returns MCP server 配置
 */
function createDefaultServer(): MCPServerConfig {
  return {
    id: nanoid(),
    name: 'New MCP Server',
    enabled: false,
    transport: 'stdio',
    command: '',
    args: [],
    env: {},
    toolAllowlist: [],
    connectTimeoutMs: DEFAULT_MCP_CONNECT_TIMEOUT_MS,
    toolCallTimeoutMs: DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS
  };
}

/**
 * 刷新当前页面展示的 MCP server 状态。
 */
async function refreshStatuses(): Promise<void> {
  if (!hasElectronAPI() || store.mcp.servers.length === 0) return;

  const statuses = await getElectronAPI().getMcpStatus(store.mcp.servers.map((server) => server.id));
  statusByServerId.value = Object.fromEntries(statuses.map((status) => [status.serverId, status]));
}

/**
 * 新增 MCP server。
 */
function handleAddServer(): void {
  store.addMcpServer(createDefaultServer());
  refreshStatuses();
}

/**
 * 更新 MCP server。
 * @param serverId - MCP server ID
 * @param patch - 更新字段
 */
function handleServerPatch(serverId: string, patch: Partial<MCPServerConfig>): void {
  store.updateMcpServer(serverId, patch);
}

/**
 * 删除 MCP server。
 * @param serverId - MCP server ID
 */
function handleRemoveServer(serverId: string): void {
  store.removeMcpServer(serverId);
  const nextStatuses = { ...statusByServerId.value };
  delete nextStatuses[serverId];
  statusByServerId.value = nextStatuses;
}

/**
 * 更新 server args。
 * @param serverId - MCP server ID
 * @param value - 输入框值
 */
function handleArgsChange(serverId: string, value: string): void {
  store.updateMcpServer(serverId, { args: parseArgs(value) });
}

/**
 * 更新 server 工具白名单。
 * @param serverId - MCP server ID
 * @param value - 输入框值
 */
function handleAllowlistChange(serverId: string, value: string): void {
  store.updateMcpServer(serverId, { toolAllowlist: parseCommaList(value) });
}

/**
 * 更新单次工具调用超时。
 * @param serverId - MCP server ID
 * @param value - 输入值
 */
function handleToolTimeoutChange(serverId: string, value: string | number | null): void {
  const nextValue = typeof value === 'number' ? value : Number(value ?? DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS);
  store.updateMcpServer(serverId, { toolCallTimeoutMs: nextValue });
}

/**
 * 触发指定 server 的 discovery 刷新。
 * @param server - MCP server 配置
 */
async function handleRefreshDiscovery(server: MCPServerConfig): Promise<void> {
  if (!hasElectronAPI()) {
    statusByServerId.value = {
      ...statusByServerId.value,
      [server.id]: {
        serverId: server.id,
        sandboxStatus: 'failed',
        discoveryStatus: 'failed',
        message: 'Electron API is not available'
      }
    };
    return;
  }

  refreshingServerId.value = server.id;
  try {
    await getElectronAPI().refreshMcpDiscovery(server);
    await refreshStatuses();
  } finally {
    refreshingServerId.value = null;
  }
}

onMounted(refreshStatuses);
</script>

<style scoped lang="less">
.mcp-tools-settings__toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
}

.mcp-tools-settings__hint,
.mcp-tools-settings__empty,
.mcp-tools-settings__description {
  font-size: 12px;
  color: var(--text-secondary);
}

.mcp-tools-settings__empty {
  padding: 16px;
}

.mcp-tools-settings__server {
  padding: 14px 16px;
  border-top: 1px solid var(--border-tertiary);
}

.mcp-tools-settings__server-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 12px;
  align-items: center;
}

.mcp-tools-settings__status {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.mcp-tools-settings__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.mcp-tools-settings__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  span {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
  }
}

.mcp-tools-settings__item {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  padding: 0 16px;

  & + & {
    border-top: 1px solid var(--border-tertiary);
  }
}

.mcp-tools-settings__item--stacked {
  flex-direction: column;
  align-items: stretch;
  padding-top: 12px;
  padding-bottom: 12px;
}

.mcp-tools-settings__meta {
  flex: 1;
  min-width: 0;
}

.mcp-tools-settings__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

@media (width <= 720px) {
  .mcp-tools-settings__server-head,
  .mcp-tools-settings__grid {
    grid-template-columns: 1fr;
  }

  .mcp-tools-settings__item {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
