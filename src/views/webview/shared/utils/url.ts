/**
 * @file url.ts
 * @description WebView URL 标准化工具。
 */

/**
 * 标准化 WebView URL，只允许 http/https。
 * @param rawUrl - 原始输入地址
 * @returns 标准化后的 URL 字符串
 */
export function normalizeWebviewUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return '';
  }

  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Unsupported webview URL protocol');
  }

  return parsed.toString();
}
