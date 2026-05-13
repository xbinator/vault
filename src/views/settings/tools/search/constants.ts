/**
 * @file constants.ts
 * @description 搜索工具设置页的静态选项与测试常量。
 */
import type { SelectOption } from '@/components/BSelect/types';

/**
 * Search 连通性测试示例 query。
 */
export const TAVILY_SEARCH_TEST_QUERY = '今日 AI 行业动态';

/**
 * Tavily Search 深度选项。
 */
export const tavilySearchDepthOptions: SelectOption[] = [
  { label: '基础', value: 'basic' },
  { label: '高级', value: 'advanced' }
];

/**
 * Tavily Search 主题选项。
 */
export const tavilyTopicOptions: SelectOption[] = [
  { label: '通用', value: 'general' },
  { label: '新闻', value: 'news' },
  { label: '金融', value: 'finance' }
];

/**
 * Tavily Search 时间范围选项。
 */
export const tavilyTimeRangeOptions: SelectOption[] = [
  { label: '未设置', value: null },
  { label: '一天内', value: 'day' },
  { label: '一周内', value: 'week' },
  { label: '一个月内', value: 'month' },
  { label: '一年内', value: 'year' }
];

/**
 * Tavily 国家选项。
 */
export const tavilyCountryOptions: SelectOption[] = [
  { label: '中国', value: 'china' },
  { label: '美国', value: 'united states' },
  { label: '日本', value: 'japan' },
  { label: '新加坡', value: 'singapore' }
];

/**
 * Tavily Extract 输出格式选项。
 */
export const tavilyExtractFormatOptions: SelectOption[] = [
  { label: 'Markdown', value: 'markdown' },
  { label: '纯文本', value: 'text' }
];
