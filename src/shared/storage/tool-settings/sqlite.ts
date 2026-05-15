/**
 * @file sqlite.ts
 * @description Tavily 工具设置的本地持久化与归一化实现。
 */
import { local } from '@/shared/storage/base';
import type {
  TavilyExtractDefaults,
  TavilyExtractDepth,
  TavilyExtractFormat,
  TavilySearchDefaults,
  TavilySearchDepth,
  TavilySearchTopic,
  TavilyTimeRange,
  TavilyToolSettings,
  ToolSettingsState,
  MCPToolSettings
} from './types';
import { DEFAULT_TOOL_SETTINGS, DEFAULT_MCP_TOOL_SETTINGS, TOOL_SETTINGS_STORAGE_KEY } from './types';

/**
 * 判断值是否为 Search 深度。
 * @param value - 待判断值
 * @returns 是否为合法 Search 深度
 */
function isSearchDepth(value: unknown): value is TavilySearchDepth {
  return value === 'basic' || value === 'advanced';
}

/**
 * 判断值是否为 Search 主题。
 * @param value - 待判断值
 * @returns 是否为合法 Search 主题
 */
function isSearchTopic(value: unknown): value is TavilySearchTopic {
  return value === 'general' || value === 'news' || value === 'finance';
}

/**
 * 判断值是否为合法时间范围。
 * @param value - 待判断值
 * @returns 是否为合法时间范围
 */
function isTimeRange(value: unknown): value is Exclude<TavilyTimeRange, null> {
  return value === 'day' || value === 'week' || value === 'month' || value === 'year';
}

/**
 * 判断值是否为 Extract 深度。
 * @param value - 待判断值
 * @returns 是否为合法 Extract 深度
 */
function isExtractDepth(value: unknown): value is TavilyExtractDepth {
  return value === 'basic' || value === 'advanced';
}

/**
 * 判断值是否为 Extract 输出格式。
 * @param value - 待判断值
 * @returns 是否为合法 Extract 输出格式
 */
function isExtractFormat(value: unknown): value is TavilyExtractFormat {
  return value === 'markdown' || value === 'text';
}

/**
 * 约束最大结果数。
 * @param value - 原始值
 * @returns 归一化后的最大结果数
 */
function normalizeMaxResults(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_TOOL_SETTINGS.tavily.searchDefaults.maxResults;
  }

  return Math.min(20, Math.max(1, Math.floor(value)));
}

/**
 * 归一化国家名称。
 * @param value - 原始值
 * @returns 归一化后的国家名称
 */
function normalizeCountry(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return DEFAULT_TOOL_SETTINGS.tavily.searchDefaults.country;
  }

  const normalized = value.trim().toLowerCase();

  return normalized === 'china' ? normalized : DEFAULT_TOOL_SETTINGS.tavily.searchDefaults.country;
}

/**
 * 归一化单个域名。
 * @param value - 原始域名值
 * @returns 合法裸域名，不合法时返回 null
 */
function normalizeDomain(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().toLowerCase();

  if (!trimmed || trimmed.includes('://') || trimmed.includes('/')) {
    return null;
  }

  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed) ? trimmed : null;
}

/**
 * 归一化域名列表。
 * @param value - 原始列表
 * @returns 归一化后的域名数组
 */
function normalizeDomains(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item: unknown) => normalizeDomain(item))
    .filter((item: string | null): item is string => item !== null);
}

/**
 * 归一化 Search 默认参数。
 * @param value - 原始参数
 * @returns 合法 Search 默认参数
 */
function normalizeSearchDefaults(value: unknown): TavilySearchDefaults {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<TavilySearchDefaults>) : {};
  const includeDomains = normalizeDomains(source.includeDomains);
  const excludeDomains = normalizeDomains(source.excludeDomains);

  return {
    searchDepth: isSearchDepth(source.searchDepth) ? source.searchDepth : DEFAULT_TOOL_SETTINGS.tavily.searchDefaults.searchDepth,
    topic: isSearchTopic(source.topic) ? source.topic : DEFAULT_TOOL_SETTINGS.tavily.searchDefaults.topic,
    timeRange: source.timeRange === null ? null : isTimeRange(source.timeRange) ? source.timeRange : DEFAULT_TOOL_SETTINGS.tavily.searchDefaults.timeRange,
    country: normalizeCountry(source.country),
    maxResults: normalizeMaxResults(source.maxResults),
    includeAnswer: typeof source.includeAnswer === 'boolean' ? source.includeAnswer : DEFAULT_TOOL_SETTINGS.tavily.searchDefaults.includeAnswer,
    includeImages: typeof source.includeImages === 'boolean' ? source.includeImages : DEFAULT_TOOL_SETTINGS.tavily.searchDefaults.includeImages,
    // Preserve a valid normalized list when present; otherwise keep the documented empty-array default.
    includeDomains,
    excludeDomains
  };
}

/**
 * 归一化 Extract 默认参数。
 * @param value - 原始参数
 * @returns 合法 Extract 默认参数
 */
function normalizeExtractDefaults(value: unknown): TavilyExtractDefaults {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<TavilyExtractDefaults>) : {};

  return {
    extractDepth: isExtractDepth(source.extractDepth) ? source.extractDepth : DEFAULT_TOOL_SETTINGS.tavily.extractDefaults.extractDepth,
    format: isExtractFormat(source.format) ? source.format : DEFAULT_TOOL_SETTINGS.tavily.extractDefaults.format,
    includeImages: typeof source.includeImages === 'boolean' ? source.includeImages : DEFAULT_TOOL_SETTINGS.tavily.extractDefaults.includeImages
  };
}

/**
 * 归一化 Tavily 设置。
 * @param value - 原始设置
 * @returns 合法 Tavily 设置
 */
function normalizeTavilySettings(value: unknown): TavilyToolSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<TavilyToolSettings>) : {};

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_TOOL_SETTINGS.tavily.enabled,
    apiKey: typeof source.apiKey === 'string' ? source.apiKey : DEFAULT_TOOL_SETTINGS.tavily.apiKey,
    searchDefaults: normalizeSearchDefaults(source.searchDefaults),
    extractDefaults: normalizeExtractDefaults(source.extractDefaults)
  };
}

/**
 * 归一化 MCP 工具设置（最小实现，完整归一化在 Task 3）。
 */
function normalizeMCPSettings(value: unknown): MCPToolSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_MCP_TOOL_SETTINGS;
  }
  const source = value as Partial<MCPToolSettings>;
  return {
    servers: Array.isArray(source.servers) ? source.servers : [],
    invocationDefaults: source.invocationDefaults && typeof source.invocationDefaults === 'object' && !Array.isArray(source.invocationDefaults)
      ? {
          enabledServerIds: Array.isArray((source.invocationDefaults as Record<string, unknown>).enabledServerIds)
            ? (source.invocationDefaults as Record<string, unknown>).enabledServerIds as string[]
            : [],
          enabledTools: Array.isArray((source.invocationDefaults as Record<string, unknown>).enabledTools)
            ? (source.invocationDefaults as Record<string, unknown>).enabledTools as MCPToolSettings['invocationDefaults']['enabledTools']
            : [],
          toolInstructions: typeof (source.invocationDefaults as Record<string, unknown>).toolInstructions === 'string'
            ? (source.invocationDefaults as Record<string, unknown>).toolInstructions as string
            : ''
        }
      : { enabledServerIds: [], enabledTools: [], toolInstructions: '' }
  };
}

/**
 * 归一化全部工具设置。
 * @param value - 原始持久化值
 * @returns 合法工具设置
 */
export function normalizeToolSettings(value: unknown): ToolSettingsState {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<ToolSettingsState>) : {};

  return {
    tavily: normalizeTavilySettings(source.tavily),
    mcp: normalizeMCPSettings(source.mcp)
  };
}

/**
 * Tavily 工具设置存储。
 */
export const toolSettingsStorage = {
  /**
   * 读取设置。
   * @returns 归一化后的工具设置
   */
  getSettings(): ToolSettingsState {
    const saved = local.getItem<ToolSettingsState>(TOOL_SETTINGS_STORAGE_KEY);
    const normalized = normalizeToolSettings(saved);
    local.setItem(TOOL_SETTINGS_STORAGE_KEY, normalized);
    return normalized;
  },

  /**
   * 保存设置。
   * @param settings - 待保存设置
   * @returns 归一化后的工具设置
   */
  saveSettings(settings: ToolSettingsState): ToolSettingsState {
    const normalized = normalizeToolSettings(settings);
    local.setItem(TOOL_SETTINGS_STORAGE_KEY, normalized);
    return normalized;
  }
};
