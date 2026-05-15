/**
 * @file types.test.ts
 * @description MCP 类型默认值的单元测试。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MCP_TOOL_SETTINGS,
  DEFAULT_MCP_CONNECT_TIMEOUT_MS,
  DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS,
  DEFAULT_MCP_SANDBOX_TIMEOUT_MS,
  VALID_SANDBOX_RUNTIMES,
  MIN_SANDBOX_TIMEOUT_MS,
  MAX_SANDBOX_TIMEOUT_MS,
  MIN_CONNECT_TIMEOUT_MS,
  MAX_CONNECT_TIMEOUT_MS,
  MIN_TOOL_CALL_TIMEOUT_MS,
  MAX_TOOL_CALL_TIMEOUT_MS
} from '@/shared/storage/tool-settings';

describe('MCP default constants', () => {
  it('DEFAULT_MCP_TOOL_SETTINGS has empty servers and defaults', () => {
    expect(DEFAULT_MCP_TOOL_SETTINGS.servers).toEqual([]);
    expect(DEFAULT_MCP_TOOL_SETTINGS.invocationDefaults.enabledServerIds).toEqual([]);
    expect(DEFAULT_MCP_TOOL_SETTINGS.invocationDefaults.enabledTools).toEqual([]);
    expect(DEFAULT_MCP_TOOL_SETTINGS.invocationDefaults.toolInstructions).toBe('');
  });

  it('timeout defaults are in valid ranges', () => {
    expect(DEFAULT_MCP_CONNECT_TIMEOUT_MS).toBeGreaterThanOrEqual(MIN_CONNECT_TIMEOUT_MS);
    expect(DEFAULT_MCP_CONNECT_TIMEOUT_MS).toBeLessThanOrEqual(MAX_CONNECT_TIMEOUT_MS);

    expect(DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS).toBeGreaterThanOrEqual(MIN_TOOL_CALL_TIMEOUT_MS);
    expect(DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS).toBeLessThanOrEqual(MAX_TOOL_CALL_TIMEOUT_MS);

    expect(DEFAULT_MCP_SANDBOX_TIMEOUT_MS).toBeGreaterThanOrEqual(MIN_SANDBOX_TIMEOUT_MS);
    expect(DEFAULT_MCP_SANDBOX_TIMEOUT_MS).toBeLessThanOrEqual(MAX_SANDBOX_TIMEOUT_MS);
  });

  it('VALID_SANDBOX_RUNTIMES only contains expected values', () => {
    expect(VALID_SANDBOX_RUNTIMES).toContain('node22');
    expect(VALID_SANDBOX_RUNTIMES).toContain('python3.13');
    expect(VALID_SANDBOX_RUNTIMES).toHaveLength(2);
  });

  it('min/max constraints are consistent', () => {
    expect(MIN_SANDBOX_TIMEOUT_MS).toBeLessThan(MAX_SANDBOX_TIMEOUT_MS);
    expect(MIN_CONNECT_TIMEOUT_MS).toBeLessThan(MAX_CONNECT_TIMEOUT_MS);
    expect(MIN_TOOL_CALL_TIMEOUT_MS).toBeLessThan(MAX_TOOL_CALL_TIMEOUT_MS);
  });
});
