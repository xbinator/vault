/**
 * @file types.test.ts
 * @description MCP 类型默认值的单元测试。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MCP_TOOL_SETTINGS,
  DEFAULT_MCP_CONNECT_TIMEOUT_MS,
  DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS,
  MIN_CONNECT_TIMEOUT_MS,
  MAX_CONNECT_TIMEOUT_MS,
  MIN_TOOL_CALL_TIMEOUT_MS,
  MAX_TOOL_CALL_TIMEOUT_MS
} from '@/shared/storage/tool-settings';

describe('MCP default constants', () => {
  it('DEFAULT_MCP_TOOL_SETTINGS has empty servers and defaults', () => {
    expect(DEFAULT_MCP_TOOL_SETTINGS.servers).toEqual([]);
  });

  it('timeout defaults are in valid ranges', () => {
    expect(DEFAULT_MCP_CONNECT_TIMEOUT_MS).toBeGreaterThanOrEqual(MIN_CONNECT_TIMEOUT_MS);
    expect(DEFAULT_MCP_CONNECT_TIMEOUT_MS).toBeLessThanOrEqual(MAX_CONNECT_TIMEOUT_MS);

    expect(DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS).toBeGreaterThanOrEqual(MIN_TOOL_CALL_TIMEOUT_MS);
    expect(DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS).toBeLessThanOrEqual(MAX_TOOL_CALL_TIMEOUT_MS);
  });

  it('min/max constraints are consistent', () => {
    expect(MIN_CONNECT_TIMEOUT_MS).toBeLessThan(MAX_CONNECT_TIMEOUT_MS);
    expect(MIN_TOOL_CALL_TIMEOUT_MS).toBeLessThan(MAX_TOOL_CALL_TIMEOUT_MS);
  });
});
