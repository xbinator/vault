/**
 * @file url.test.ts
 * @description 验证 WebView URL 标准化逻辑。
 */

import { describe, expect, it } from 'vitest';
import { normalizeWebviewUrl } from '@/views/webview/shared/utils/url';

describe('normalizeWebviewUrl', () => {
  it('keeps valid https urls unchanged', () => {
    expect(normalizeWebviewUrl('https://example.com')).toBe('https://example.com/');
  });

  it('adds https protocol when protocol is missing', () => {
    expect(normalizeWebviewUrl('example.com/docs')).toBe('https://example.com/docs');
  });

  it('rejects unsupported protocols', () => {
    expect(() => normalizeWebviewUrl('file:///tmp/demo.html')).toThrowError('Unsupported webview URL protocol');
  });
});
