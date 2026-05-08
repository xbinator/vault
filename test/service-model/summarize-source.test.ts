/**
 * @file summarize-source.test.ts
 * @description 验证摘要模型服务类型与设置页入口已移除。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 读取仓库内源码文件。
 * @param relativePath - 相对项目根目录的文件路径。
 * @returns UTF-8 源码文本。
 */
function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('summarize service removal source', () => {
  it('does not keep summarize in model service types', () => {
    const source = readSource('types/model.d.ts');

    expect(source).not.toContain('summarize');
  });

  it('does not render a summarize service config card in settings', () => {
    const settingsSource = readSource('src/views/settings/service-model/index.vue');

    expect(settingsSource).not.toContain('service-type="summarize"');
    expect(settingsSource).not.toContain('title="会话历史压缩助理"');
    expect(settingsSource).not.toContain('description="指定用于压缩和摘要会话历史的模型"');
  });
});
