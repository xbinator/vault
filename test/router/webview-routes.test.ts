/**
 * @file webview-routes.test.ts
 * @description 验证 WebView 双实现路由定义。
 */

import { describe, expect, it } from 'vitest';
import routes from '@/router/routes/modules/webview';

describe('webview routes', () => {
  it('registers explicit native and web routes', () => {
    const paths = routes.map((route) => route.path);

    expect(paths).toContain('/webview/native');
    expect(paths).toContain('/webview/web');
  });
});
