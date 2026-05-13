/**
 * @file toolSettings.ts
 * @description Tavily 工具设置 Store，负责持久化配置与可用性派生状态。
 */
import { defineStore } from 'pinia';
import { toolSettingsStorage } from '@/shared/storage';
import type { TavilyExtractDefaults, TavilySearchDefaults, TavilyToolSettings } from '@/shared/storage/tool-settings';

/**
 * 工具设置 Store 状态。
 */
interface ToolSettingsStoreState {
  /** Tavily 配置 */
  tavily: TavilyToolSettings;
}

/**
 * Tavily 工具设置 Store。
 */
export const useToolSettingsStore = defineStore('toolSettings', {
  state: (): ToolSettingsStoreState => ({
    tavily: toolSettingsStorage.getSettings().tavily
  }),

  getters: {
    /**
     * Tavily 当前是否可注册到聊天工具链。
     * @param state - Store 状态
     * @returns 是否可用
     */
    isTavilyAvailable: (state): boolean => state.tavily.enabled && state.tavily.apiKey.trim().length > 0
  },

  actions: {
    /**
     * 持久化当前 Tavily 状态。
     */
    saveSettings(): void {
      this.tavily = toolSettingsStorage.saveSettings({ tavily: this.tavily }).tavily;
    },

    /**
     * 设置 Tavily 启用状态。
     * @param enabled - 是否启用
     */
    setTavilyEnabled(enabled: boolean): void {
      this.tavily.enabled = enabled;
      this.saveSettings();
    },

    /**
     * 设置 Tavily API Key。
     * @param apiKey - API Key
     */
    setTavilyApiKey(apiKey: string): void {
      this.tavily.apiKey = apiKey;
      this.saveSettings();
    },

    /**
     * 更新 Search 默认参数。
     * @param patch - 需要合并的 Search 默认参数
     */
    updateTavilySearchDefaults(patch: Partial<TavilySearchDefaults>): void {
      this.tavily.searchDefaults = {
        ...this.tavily.searchDefaults,
        ...patch
      };
      this.saveSettings();
    },

    /**
     * 更新 Extract 默认参数。
     * @param patch - 需要合并的 Extract 默认参数
     */
    updateTavilyExtractDefaults(patch: Partial<TavilyExtractDefaults>): void {
      this.tavily.extractDefaults = {
        ...this.tavily.extractDefaults,
        ...patch
      };
      this.saveSettings();
    }
  }
});
