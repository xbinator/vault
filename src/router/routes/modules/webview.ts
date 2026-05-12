import type { AppRouteRecordRaw } from '../../type';

const routes: AppRouteRecordRaw[] = [
  {
    path: '/webview/native',
    name: 'webview-native',
    component: () => import('@/views/webview/native/index.vue'),
    meta: { title: '网页浏览' }
  },
  {
    path: '/webview/web',
    name: 'webview-web',
    component: () => import('@/views/webview/web/index.vue'),
    meta: { title: '网页浏览' }
  }
];

export default routes;
