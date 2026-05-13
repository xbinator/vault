/**
 * @file settings-tools-routes.test.ts
 * @description 验证设置中心新增工具搜索路由与导航匹配。
 */
import { describe, expect, it } from 'vitest';
import settingsRoutes from '@/router/routes/modules/settings';

describe('settings tools routes', () => {
  it('registers /settings/tools/search route', () => {
    const settingsRoute = settingsRoutes.find((route) => route.path === 'settings');
    const toolsRoute = settingsRoute?.children?.find((route) => route.path === 'tools');
    const searchRoute = toolsRoute?.children?.find((route) => route.path === 'search');

    expect(toolsRoute?.meta?.title).toBe('工具');
    expect(searchRoute?.meta?.title).toBe('搜索');
  });
});
