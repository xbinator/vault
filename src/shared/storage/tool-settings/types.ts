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

/**
 * 工具设置总结构。
 */
export interface ToolSettingsState {
  /** Tavily 配置 */
  tavily: TavilyToolSettings;
}

/**
 * 工具设置持久化键。
 */
export const TOOL_SETTINGS_STORAGE_KEY = 'tool_settings';

/**
 * Tavily 默认配置。
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
  }
};
