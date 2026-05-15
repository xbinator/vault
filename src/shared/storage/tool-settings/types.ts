/**
 * @file types.ts
 * @description Tavily 工具设置类型、默认值与归一化工具。
 */

/**
 * Tavily Search 深度。
 */
export type TavilySearchDepth = 'basic' | 'advanced';

/**
 * Tavily Search 主题。
 */
export type TavilySearchTopic = 'general' | 'news' | 'finance';

/**
 * Tavily Search 时间范围。
 */
export type TavilyTimeRange = 'day' | 'week' | 'month' | 'year' | null;

/**
 * Tavily Extract 深度。
 */
export type TavilyExtractDepth = 'basic' | 'advanced';

/**
 * Tavily Extract 输出格式。
 */
export type TavilyExtractFormat = 'markdown' | 'text';

/**
 * Tavily Search 默认参数。
 */
export interface TavilySearchDefaults {
  /** 搜索深度 */
  searchDepth: TavilySearchDepth;
  /** 搜索主题 */
  topic: TavilySearchTopic;
  /** 时间范围 */
  timeRange: TavilyTimeRange;
  /** 国家名称 */
  country: string | null;
  /** 最大结果数 */
  maxResults: number;
  /** 是否包含 AI 摘要 */
  includeAnswer: boolean;
  /** 是否包含图片 */
  includeImages: boolean;
  /** 限定域名 */
  includeDomains: string[];
  /** 排除域名 */
  excludeDomains: string[];
}

/**
 * Tavily Extract 默认参数。
 */
export interface TavilyExtractDefaults {
  /** 提取深度 */
  extractDepth: TavilyExtractDepth;
  /** 输出格式 */
  format: TavilyExtractFormat;
  /** 是否包含图片 */
  includeImages: boolean;
}

/**
 * Tavily 工具设置。
 */
export interface TavilyToolSettings {
  /** 是否启用 Tavily 工具 */
  enabled: boolean;
  /** Tavily API Key */
  apiKey: string;
  /** Search 默认参数 */
  searchDefaults: TavilySearchDefaults;
  /** Extract 默认参数 */
  extractDefaults: TavilyExtractDefaults;
}

// ─── MCP Transport ────────────────────────────────────────────────────────────

/**
 * MCP transport 类型。
 */
export type MCPTransportType = 'stdio';

// ─── MCP Sandbox 运行时 ───────────────────────────────────────────────────────

/**
 * @vercel/sandbox 支持的运行时标识。
 */
export type MCPSandboxRuntime = 'node22' | 'python3.13';

/**
 * Sandbox 网络策略字符串模式。
 */
export type MCPSandboxNetworkPolicyString = 'allow-all' | 'deny-all';

/**
 * Sandbox 网络策略对象模式。
 */
export interface MCPSandboxNetworkPolicyObject {
  allow: string[];
}

/**
 * Sandbox 网络策略联合。
 */
export type MCPSandboxNetworkPolicy = MCPSandboxNetworkPolicyString | MCPSandboxNetworkPolicyObject;

// ─── MCP Server Config ───────────────────────────────────────────────────────

/**
 * MCP server 配置。
 */
export interface MCPServerConfig {
  /** 稳定 ID */
  id: string;
  /** 展示名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** transport 类型 */
  transport: MCPTransportType;
  /** 启动命令 */
  command: string;
  /** 启动参数 */
  args: string[];
  /** 环境变量 */
  env: Record<string, string>;
  /** Vercel Sandbox 运行时字符串 */
  runtime: string;
  /** Sandbox 生命周期超时 */
  sandboxTimeoutMs: number;
  /** Sandbox 网络策略 */
  networkPolicy: MCPSandboxNetworkPolicy;
  /** 可选的基础快照 ID */
  baseSnapshotId?: string | null;
  /** 默认允许暴露的 tool 名称 */
  toolAllowlist: string[];
  /** 连接与握手超时 */
  connectTimeoutMs: number;
  /** 单次工具调用超时 */
  toolCallTimeoutMs: number;
}

// ─── MCP Tool Selector ──────────────────────────────────────────────────────

/**
 * MCP tool 的结构化选择器。
 */
export interface MCPToolSelector {
  /** 所属 server ID */
  serverId: string;
  /** 原始 tool 名称 */
  toolName: string;
}

// ─── MCP Invocation Defaults ─────────────────────────────────────────────────

/**
 * MCP 默认调用配置。
 */
export interface MCPInvocationDefaults {
  /** 默认启用的 server ID */
  enabledServerIds: string[];
  /** 默认允许的 tool 标识 */
  enabledTools: MCPToolSelector[];
  /** 默认附加说明词 */
  toolInstructions: string;
}

// ─── MCP Tool Settings ──────────────────────────────────────────────────────

/**
 * MCP 设置总结构。
 */
export interface MCPToolSettings {
  /** server 列表 */
  servers: MCPServerConfig[];
  /** 默认调用配置 */
  invocationDefaults: MCPInvocationDefaults;
}

// ─── MCP Discovery Snapshot ─────────────────────────────────────────────────

/**
 * Discovery cache 中的工具快照。
 */
export interface MCPDiscoveredToolSnapshot {
  serverId: string;
  toolName: string;
  description?: string;
}

/**
 * 单个 server 的 discovery cache。
 */
export interface MCPServerDiscoveryCache {
  serverId: string;
  tools: MCPDiscoveredToolSnapshot[];
  discoveredAt: number;
}

// ─── MCP Defaults ────────────────────────────────────────────────────────────

export const DEFAULT_MCP_CONNECT_TIMEOUT_MS = 20000;
export const DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS = 30000;
export const DEFAULT_MCP_SANDBOX_TIMEOUT_MS = 300000;
export const MIN_SANDBOX_TIMEOUT_MS = 60000;
export const MAX_SANDBOX_TIMEOUT_MS = 3600000;
export const MIN_CONNECT_TIMEOUT_MS = 1000;
export const MAX_CONNECT_TIMEOUT_MS = 120000;
export const MIN_TOOL_CALL_TIMEOUT_MS = 1000;
export const MAX_TOOL_CALL_TIMEOUT_MS = 120000;

export const VALID_SANDBOX_RUNTIMES: readonly MCPSandboxRuntime[] = ['node22', 'python3.13'] as const;

export const DEFAULT_MCP_TOOL_SETTINGS: MCPToolSettings = {
  servers: [],
  invocationDefaults: {
    enabledServerIds: [],
    enabledTools: [],
    toolInstructions: ''
  }
};

// ─── ToolSettingsState ───────────────────────────────────────────────────────

/**
 * 工具设置总结构。
 */
export interface ToolSettingsState {
  /** Tavily 配置 */
  tavily: TavilyToolSettings;
  /** MCP 配置 */
  mcp: MCPToolSettings;
}

/**
 * 工具设置持久化键。
 */
export const TOOL_SETTINGS_STORAGE_KEY = 'tool_settings';

/**
 * 默认配置。
 */
export const DEFAULT_TOOL_SETTINGS: ToolSettingsState = {
  tavily: {
    enabled: false,
    apiKey: '',
    searchDefaults: {
      searchDepth: 'basic',
      topic: 'general',
      timeRange: null,
      country: 'china',
      maxResults: 5,
      includeAnswer: true,
      includeImages: false,
      includeDomains: [],
      excludeDomains: []
    },
    extractDefaults: {
      extractDepth: 'basic',
      format: 'markdown',
      includeImages: false
    }
  },
  mcp: DEFAULT_MCP_TOOL_SETTINGS
};
