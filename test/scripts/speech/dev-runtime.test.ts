/**
 * @file dev-runtime.test.ts
 * @description 验证语音自动安装本地开发脚本的准备与静态服务配置行为。
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  prepareSpeechDevRuntimeDirectory,
  resolveCurrentSpeechPlatformKey,
  resolveSpeechDevPaths,
  resolveSpeechDevServerOptions
} from '../../../scripts/speech/dev-runtime.mjs';

/**
 * 当前测试过程中创建的临时目录列表。
 */
const temporaryDirectories: string[] = [];

/**
 * 创建一个可自动清理的临时目录。
 * @returns 临时目录绝对路径。
 */
async function createTemporaryDirectory(): Promise<string> {
  const directoryPath = await mkdtemp(join(tmpdir(), 'speech-dev-runtime-'));

  temporaryDirectories.push(directoryPath);

  return directoryPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directoryPath) => rm(directoryPath, { recursive: true, force: true })));
});

describe('speech dev runtime helper', () => {
  it('prepares a localized and hashed manifest in the target directory', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const runtimeDirectory = join(temporaryDirectory, '.dev-resources', 'speech');
    const templateManifestPath = join(temporaryDirectory, 'manifest.template.json');
    const resolvedPaths = resolveSpeechDevPaths({ cwd: temporaryDirectory });
    const currentPlatformKey = resolveCurrentSpeechPlatformKey({
      platform: 'darwin',
      arch: 'arm64'
    });

    await writeFile(
      templateManifestPath,
      JSON.stringify({
        currentVersion: '2026.05.04',
        platforms: {
          'darwin-arm64': {
            platform: 'darwin',
            arch: 'arm64',
            version: '2026.05.04',
            modelName: 'ggml-base',
            assets: [
              {
                name: 'whisper',
                url: 'https://github.com/xbinator/tibis/releases/download/speech-runtime-2026.05.04/whisper-darwin-arm64',
                sha256: 'REPLACE_WITH_DARWIN_ARM64_WHISPER_SHA256',
                archiveType: 'file',
                targetRelativePath: 'bin/whisper'
              },
              {
                name: 'model',
                url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
                sha256: 'REPLACE_WITH_GGML_BASE_SHA256',
                archiveType: 'file',
                targetRelativePath: 'models/ggml-base.bin'
              }
            ]
          },
          'darwin-x64': {
            platform: 'darwin',
            arch: 'x64',
            version: '2026.05.04',
            modelName: 'ggml-base',
            assets: [
              {
                name: 'whisper',
                url: 'https://github.com/xbinator/tibis/releases/download/speech-runtime-2026.05.04/whisper-darwin-x64',
                sha256: 'REPLACE_WITH_DARWIN_X64_WHISPER_SHA256',
                archiveType: 'file',
                targetRelativePath: 'bin/whisper'
              },
              {
                name: 'model',
                url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
                sha256: 'REPLACE_WITH_GGML_BASE_SHA256',
                archiveType: 'file',
                targetRelativePath: 'models/ggml-base.bin'
              }
            ]
          },
          'win32-x64': {
            platform: 'win32',
            arch: 'x64',
            version: '2026.05.04',
            modelName: 'ggml-base',
            assets: [
              {
                name: 'whisper',
                url: 'https://github.com/xbinator/tibis/releases/download/speech-runtime-2026.05.04/whisper-win32-x64.exe',
                sha256: 'REPLACE_WITH_WIN32_X64_WHISPER_SHA256',
                archiveType: 'file',
                targetRelativePath: 'bin/whisper.exe'
              },
              {
                name: 'model',
                url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
                sha256: 'REPLACE_WITH_GGML_BASE_SHA256',
                archiveType: 'file',
                targetRelativePath: 'models/ggml-base.bin'
              }
            ]
          }
        }
      }),
      'utf8'
    );
    await mkdir(resolvedPaths.sourceDirectory, { recursive: true });
    await writeFile(resolvedPaths.sourceWhisperPath, 'darwin-arm64-whisper', 'utf8');
    await writeFile(resolvedPaths.sourceModelPath, 'ggml-base-model', 'utf8');

    await expect(
      prepareSpeechDevRuntimeDirectory({
        templateManifestPath,
        cwd: temporaryDirectory,
        baseUrl: 'http://127.0.0.1:8787',
        platform: 'darwin',
        arch: 'arm64'
      })
    ).resolves.toEqual({
      manifestPath: join(runtimeDirectory, 'manifest.json'),
      outputDirectory: runtimeDirectory
    });

    const localizedManifest = JSON.parse(await readFile(join(runtimeDirectory, 'manifest.json'), 'utf8')) as {
      platforms: Record<string, { assets: Array<{ name: string; url: string; sha256: string }> }>;
    };

    expect(Object.keys(localizedManifest.platforms)).toEqual([currentPlatformKey]);
    expect(localizedManifest.platforms[currentPlatformKey].assets[0].url).toBe('http://127.0.0.1:8787/whisper-cli');
    expect(localizedManifest.platforms[currentPlatformKey].assets[1].url).toBe('http://127.0.0.1:8787/ggml-base.bin');
    expect(localizedManifest.platforms[currentPlatformKey].assets[0].sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('normalizes static server options', () => {
    const result = resolveSpeechDevServerOptions({
      cwd: '/tmp/workspace',
      port: '8787'
    });
    expect(result.directoryPath).toContain('.dev-resources');
    expect(result.directoryPath).toContain('speech');
    expect(result.port).toBe(8787);
  });
});
