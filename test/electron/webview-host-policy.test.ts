/**
 * @file webview-host-policy.test.ts
 * @description 验证 WebView 宿主安全策略。
 */

import { describe, expect, it } from 'vitest';
import { normalizeAttachedWebviewUrl, sanitizeAttachedWebPreferences, WEBVIEW_TAG_PARTITION } from '../../electron/main/modules/webview/ipc.mts';

describe('webview host policy', () => {
  it('allows only http and https urls', () => {
    expect(normalizeAttachedWebviewUrl('https://example.com')).toBe('https://example.com/');
    expect(() => normalizeAttachedWebviewUrl('file:///tmp/demo.html')).toThrowError('Unsupported webview URL protocol');
  });

  it('removes renderer-provided preload and forces partition', () => {
    const result = sanitizeAttachedWebPreferences({
      preload: '/tmp/evil-preload.js',
      nodeIntegration: true,
      contextIsolation: false
    });

    expect(result.preload).toBeUndefined();
    expect(result.nodeIntegration).toBe(false);
    expect(result.contextIsolation).toBe(true);
    expect(result.partition).toBe(WEBVIEW_TAG_PARTITION);
  });
});
