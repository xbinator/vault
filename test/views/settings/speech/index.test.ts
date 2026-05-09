/**
 * @file index.test.ts
 * @description 验证语音组件设置页已接入设置路由、菜单和核心动作。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 读取源码内容。
 * @param relativePath - 仓库相对路径
 * @returns 文件源码
 */
function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

describe('Speech settings wiring', () => {
  it('registers the speech settings menu item and route', () => {
    const constantsSource = readSource('src/views/settings/constants.ts');
    const routesSource = readSource('src/router/routes/modules/settings.ts');

    expect(constantsSource).toContain("export type SettingsMenuKey = 'provider' | 'service-model' | 'speech' | 'logger';");
    expect(constantsSource).toContain("{ key: 'speech', label: '语音组件', icon: 'lucide:mic', path: '/settings/speech' }");
    expect(routesSource).toContain("path: 'speech'");
    expect(routesSource).toContain("name: 'speech'");
    expect(routesSource).toContain("import('@/views/settings/speech/index.vue')");
  });

  it('renders speech settings actions and runtime controls in the page source', () => {
    const pageSource = readSource('src/views/settings/speech/index.vue');

    expect(pageSource).toContain('getSpeechRuntimeSnapshot');
    expect(pageSource).toContain('listSpeechCatalogModels');
    expect(pageSource).toContain('checkSpeechRuntimeUpdates');
    expect(pageSource).toContain('installSpeechRuntime');
    expect(pageSource).toContain('removeSpeechRuntime');
    expect(pageSource).toContain('speech-settings__section-title">官方模型');
    expect(pageSource).toContain('speech-settings__section-title">外部模型');
    expect(pageSource).toContain('speech-settings__section-title">当前生效配置');
    expect(pageSource).toContain('listExternalSpeechModels');
    expect(pageSource).toContain('检查更新');
    expect(pageSource).toContain('下载更新');
    expect(pageSource).toContain('应用更新');
    expect(pageSource).toContain('回滚更新');
    expect(pageSource).toContain('catalogModelSummary');
    expect(pageSource).toContain('updateSummary');
    expect(pageSource).toContain('downloadSpeechRuntimeUpdates');
    expect(pageSource).toContain('applySpeechRuntimeUpdate');
    expect(pageSource).toContain('rollbackSpeechRuntimeUpdate');
    expect(pageSource).toContain('installManagedSpeechModel');
    expect(pageSource).toContain('removeManagedSpeechModel');
    expect(pageSource).toContain('setActiveSpeechModel');
    expect(pageSource).toContain('handleInstallManagedModel');
    expect(pageSource).toContain('handleRemoveManagedModel');
    expect(pageSource).toContain('handleSetActiveManagedModel');
    expect(pageSource).toContain('registerExternalSpeechModel');
    expect(pageSource).toContain('renameExternalSpeechModel');
    expect(pageSource).toContain('revalidateExternalSpeechModel');
    expect(pageSource).toContain('removeExternalSpeechModel');
    expect(pageSource).toContain('handleAddExternalModel');
    expect(pageSource).toContain('handleRenameExternalModel');
    expect(pageSource).toContain('handleRevalidateExternalModel');
    expect(pageSource).toContain('handleRemoveExternalModel');
    expect(pageSource).toContain('handleSetActiveExternalModel');
    expect(pageSource).toContain('添加本地模型');
    expect(pageSource).toContain('重新校验');
    expect(pageSource).toContain('重命名');
  });
});
