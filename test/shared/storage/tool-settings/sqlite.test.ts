/**
 * @file sqlite.test.ts
 * @description MCP 归一化逻辑的单元测试。
 */
import { describe, expect, it } from 'vitest';
import { normalizeToolSettings } from '@/shared/storage/tool-settings';

describe('MCP normalization', () => {
  describe('normalizeMCPSettings (via normalizeToolSettings)', () => {
    it('returns default MCP settings when mcp field is missing', () => {
      const result = normalizeToolSettings({ tavily: {} });
      expect(result.mcp.servers).toEqual([]);
      expect(result.mcp.invocationDefaults.enabledServerIds).toEqual([]);
      expect(result.mcp.invocationDefaults.enabledTools).toEqual([]);
      expect(result.mcp.invocationDefaults.toolInstructions).toBe('');
    });

    it('returns default MCP settings when mcp is null', () => {
      const result = normalizeToolSettings({ tavily: {}, mcp: null });
      expect(result.mcp.servers).toEqual([]);
    });

    it('returns default MCP settings when mcp is not an object', () => {
      const result = normalizeToolSettings({ tavily: {}, mcp: 'invalid' });
      expect(result.mcp.servers).toEqual([]);
    });

    it('returns default MCP settings when mcp is an array', () => {
      const result = normalizeToolSettings({ tavily: {}, mcp: [] });
      expect(result.mcp.servers).toEqual([]);
    });

    it('drops servers with empty id', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: {
          servers: [
            { id: '', name: 'no-id', command: 'npx' },
            { id: 'valid-id', name: 'valid', command: 'npx' }
          ]
        }
      });
      expect(result.mcp.servers).toHaveLength(1);
      expect(result.mcp.servers[0].id).toBe('valid-id');
    });

    it('drops servers with missing id', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: {
          servers: [
            { name: 'no-id', command: 'npx' }
          ]
        }
      });
      expect(result.mcp.servers).toHaveLength(0);
    });

    it('uses command as fallback name when name is empty', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: {
          servers: [
            { id: 's1', name: '', command: 'npx' }
          ]
        }
      });
      expect(result.mcp.servers[0].name).toBe('npx');
    });

    it('uses placeholder name when both name and command are empty', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: {
          servers: [
            { id: 's1', name: '', command: '' }
          ]
        }
      });
      expect(result.mcp.servers[0].name).toBe('Unnamed MCP Server');
    });

    it('sets enabled to false by default', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: {
          servers: [
            { id: 's1', command: 'npx' }
          ]
        }
      });
      expect(result.mcp.servers[0].enabled).toBe(false);
    });

    it('sets transport to stdio always', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: {
          servers: [
            { id: 's1', command: 'npx', transport: 'http' }
          ]
        }
      });
      expect(result.mcp.servers[0].transport).toBe('stdio');
    });

    it('normalizes args to string array', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: {
          servers: [
            { id: 's1', command: 'npx', args: ['-y', 123, null, '@scope/pkg'] }
          ]
        }
      });
      expect(result.mcp.servers[0].args).toEqual(['-y', '@scope/pkg']);
    });

    it('normalizes env to string dict, filtering empty keys', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: {
          servers: [
            { id: 's1', command: 'npx', env: { API_KEY: 'secret', '': 'empty-key', 'VALID': 'yes' } }
          ]
        }
      });
      expect(result.mcp.servers[0].env).toEqual({ API_KEY: 'secret', VALID: 'yes' });
    });

    it('normalizes env when value is not a string', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: {
          servers: [
            { id: 's1', command: 'npx', env: { KEY: 'val', NUM: 123, BOOL: true } }
          ]
        }
      });
      expect(result.mcp.servers[0].env).toEqual({ KEY: 'val' });
    });

    it('defaults runtime to node22 when invalid', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: {
          servers: [
            { id: 's1', command: 'npx', runtime: 'deno' }
          ]
        }
      });
      expect(result.mcp.servers[0].runtime).toBe('node22');
    });

    it('clamps sandboxTimeoutMs to valid range', () => {
      const tooLow = normalizeToolSettings({
        tavily: {},
        mcp: { servers: [{ id: 's1', command: 'npx', sandboxTimeoutMs: 1000 }] }
      });
      expect(tooLow.mcp.servers[0].sandboxTimeoutMs).toBe(60000);

      const tooHigh = normalizeToolSettings({
        tavily: {},
        mcp: { servers: [{ id: 's1', command: 'npx', sandboxTimeoutMs: 9999999 }] }
      });
      expect(tooHigh.mcp.servers[0].sandboxTimeoutMs).toBe(3600000);
    });

    it('clamps connectTimeoutMs to valid range', () => {
      const tooLow = normalizeToolSettings({
        tavily: {},
        mcp: { servers: [{ id: 's1', command: 'npx', connectTimeoutMs: 10 }] }
      });
      expect(tooLow.mcp.servers[0].connectTimeoutMs).toBe(1000);
    });

    it('clamps toolCallTimeoutMs to valid range', () => {
      const tooHigh = normalizeToolSettings({
        tavily: {},
        mcp: { servers: [{ id: 's1', command: 'npx', toolCallTimeoutMs: 999999 }] }
      });
      expect(tooHigh.mcp.servers[0].toolCallTimeoutMs).toBe(120000);
    });

    it('normalizes networkPolicy string mode', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: { servers: [{ id: 's1', command: 'npx', networkPolicy: 'allow-all' }] }
      });
      expect(result.mcp.servers[0].networkPolicy).toBe('allow-all');
    });

    it('normalizes networkPolicy object mode', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: { servers: [{ id: 's1', command: 'npx', networkPolicy: { allow: ['api.example.com'] } }] }
      });
      expect(result.mcp.servers[0].networkPolicy).toEqual({ allow: ['api.example.com'] });
    });

    it('defaults networkPolicy to deny-all when invalid', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: { servers: [{ id: 's1', command: 'npx', networkPolicy: 'invalid' }] }
      });
      expect(result.mcp.servers[0].networkPolicy).toBe('deny-all');
    });

    it('normalizes baseSnapshotId to string or null', () => {
      const withId = normalizeToolSettings({
        tavily: {},
        mcp: { servers: [{ id: 's1', command: 'npx', baseSnapshotId: 'snap_123' }] }
      });
      expect(withId.mcp.servers[0].baseSnapshotId).toBe('snap_123');

      const withNull = normalizeToolSettings({
        tavily: {},
        mcp: { servers: [{ id: 's1', command: 'npx', baseSnapshotId: null }] }
      });
      expect(withNull.mcp.servers[0].baseSnapshotId).toBeNull();
    });

    it('deduplicates toolAllowlist', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: { servers: [{ id: 's1', command: 'npx', toolAllowlist: ['a', 'b', 'a', 'c', 'b'] }] }
      });
      expect(result.mcp.servers[0].toolAllowlist).toEqual(['a', 'b', 'c']);
    });

    it('filters empty strings from toolAllowlist', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: { servers: [{ id: 's1', command: 'npx', toolAllowlist: ['a', '', 'b', '  '] }] }
      });
      expect(result.mcp.servers[0].toolAllowlist).toEqual(['a', 'b']);
    });

    it('normalizes invocationDefaults when missing', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: { servers: [] }
      });
      expect(result.mcp.invocationDefaults.enabledServerIds).toEqual([]);
      expect(result.mcp.invocationDefaults.enabledTools).toEqual([]);
      expect(result.mcp.invocationDefaults.toolInstructions).toBe('');
    });

    it('normalizes enabledTools selectors', () => {
      const result = normalizeToolSettings({
        tavily: {},
        mcp: {
          invocationDefaults: {
            enabledTools: [
              { serverId: 's1', toolName: 'tool_a' },
              { serverId: '', toolName: 'tool_b' },
              { serverId: 's2' },
              null
            ]
          }
        }
      });
      expect(result.mcp.invocationDefaults.enabledTools).toEqual([
        { serverId: 's1', toolName: 'tool_a' }
      ]);
    });
  });
});
