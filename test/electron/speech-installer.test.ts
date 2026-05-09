/**
 * @file speech-installer.test.ts
 * @description 验证语音运行时安装器会写入 V2 binary/model 仓库并改写状态指针。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chmodMock = vi.fn();
const mkdirMock = vi.fn();
const renameMock = vi.fn();
const rmMock = vi.fn();
const writeFileMock = vi.fn();
const readFileMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock,
  chmod: chmodMock,
  mkdir: mkdirMock,
  rename: renameMock,
  rm: rmMock,
  writeFile: writeFileMock
}));

describe('installSpeechRuntime', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    readFileMock.mockReset();
    chmodMock.mockReset();
    mkdirMock.mockReset();
    renameMock.mockReset();
    rmMock.mockReset();
    writeFileMock.mockReset();
  });

  it('writes manifest and stages current assets after successful install', async () => {
    chmodMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    renameMock.mockResolvedValue(undefined);
    rmMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);

    const extractZipAsset = vi.fn(async ({ outputFilePath }: { outputFilePath: string }) => {
      await mkdirMock(outputFilePath, { recursive: true });
    });

    const { installSpeechRuntime } = await import('../../electron/main/modules/speech/installer.mjs');
    await installSpeechRuntime({
      userDataPath: '/tmp/runtime-test',
      platform: 'darwin',
      arch: 'arm64',
      manifest: {
        platform: 'darwin',
        arch: 'arm64',
        version: '2026.05.04',
        modelName: 'ggml-base',
        assets: [
          {
            name: 'whisper',
            url: 'memory://whisper.zip',
            sha256: '',
            archiveType: 'zip',
            targetRelativePath: 'bin/whisper'
          },
          {
            name: 'model',
            url: 'memory://ggml-base.bin',
            sha256: '',
            archiveType: 'file',
            targetRelativePath: 'models/ggml-base.bin'
          }
        ]
      },
      downloadAsset: async (asset) => Buffer.from(asset.name),
      extractZipAsset
    });

    expect(extractZipAsset).toHaveBeenCalledWith({
      asset: expect.objectContaining({ name: 'whisper' }),
      bytes: Buffer.from('whisper'),
      outputFilePath: '/tmp/runtime-test/speech-runtime/tmp/1700000000000/bin/whisper'
    });
    expect(writeFileMock).toHaveBeenCalledWith('/tmp/runtime-test/speech-runtime/tmp/1700000000000/models/ggml-base.bin', Buffer.from('model'));
    expect(writeFileMock).toHaveBeenCalledWith(
      '/tmp/runtime-test/speech-runtime/manifest.json',
      JSON.stringify({
        version: '2026.05.04',
        modelName: 'ggml-base',
        platform: 'darwin',
        arch: 'arm64',
        currentDir: 'current'
      })
    );
  });

  it('resolves runtime manifest from manifest url when provided', async () => {
    vi.stubEnv('TIBIS_SPEECH_RUNTIME_MANIFEST_URL', 'https://download.example.com/speech-runtime/manifest.json');

    const { resolveSpeechRuntimeManifest } = await import('../../electron/main/modules/speech/installer.mjs');
    const manifest = await resolveSpeechRuntimeManifest('darwin', 'arm64', {
      downloadUrl: async () =>
        Buffer.from(
          JSON.stringify({
            schemaVersion: 2,
            binaries: {
              'darwin-arm64': {
                currentVersion: '2026.05.04',
                versions: [
                  {
                    version: '2026.05.04',
                    url: 'https://download.example.com/speech-runtime/2026.05.04/darwin-arm64/whisper',
                    sha256: 'sha-whisper',
                    archiveType: 'file'
                  }
                ]
              }
            },
            models: [
              {
                id: 'ggml-base',
                displayName: 'Base',
                version: '1',
                url: 'https://download.example.com/speech-runtime/2026.05.04/models/ggml-base.bin',
                sha256: 'sha-model',
                sizeBytes: 147000000
              }
            ]
          })
        )
    });

    expect(manifest).toEqual({
      platform: 'darwin',
      arch: 'arm64',
      version: '2026.05.04',
      modelName: 'ggml-base',
      assets: [
        {
          name: 'whisper',
          url: 'https://download.example.com/speech-runtime/2026.05.04/darwin-arm64/whisper',
          sha256: 'sha-whisper',
          archiveType: 'file',
          targetRelativePath: 'bin/whisper'
        },
        {
          name: 'model',
          url: 'https://download.example.com/speech-runtime/2026.05.04/models/ggml-base.bin',
          sha256: 'sha-model',
          archiveType: 'file',
          targetRelativePath: 'models/ggml-base.bin'
        }
      ]
    });

    vi.unstubAllEnvs();
  });

  it('still resolves legacy runtime manifest indexes for compatibility', async () => {
    vi.stubEnv('TIBIS_SPEECH_RUNTIME_MANIFEST_URL', 'https://download.example.com/speech-runtime/manifest.json');

    const { resolveSpeechRuntimeManifest } = await import('../../electron/main/modules/speech/installer.mjs');
    const manifest = await resolveSpeechRuntimeManifest('darwin', 'arm64', {
      downloadUrl: async () =>
        Buffer.from(
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
                    url: 'https://download.example.com/speech-runtime/2026.05.04/darwin-arm64/whisper',
                    sha256: 'sha-whisper',
                    archiveType: 'file',
                    targetRelativePath: 'bin/whisper'
                  },
                  {
                    name: 'model',
                    url: 'https://download.example.com/speech-runtime/2026.05.04/models/ggml-base.bin',
                    sha256: 'sha-model',
                    archiveType: 'file',
                    targetRelativePath: 'models/ggml-base.bin'
                  }
                ]
              }
            }
          })
        )
    });

    expect(manifest).toEqual({
      platform: 'darwin',
      arch: 'arm64',
      version: '2026.05.04',
      modelName: 'ggml-base',
      assets: [
        {
          name: 'whisper',
          url: 'https://download.example.com/speech-runtime/2026.05.04/darwin-arm64/whisper',
          sha256: 'sha-whisper',
          archiveType: 'file',
          targetRelativePath: 'bin/whisper'
        },
        {
          name: 'model',
          url: 'https://download.example.com/speech-runtime/2026.05.04/models/ggml-base.bin',
          sha256: 'sha-model',
          archiveType: 'file',
          targetRelativePath: 'models/ggml-base.bin'
        }
      ]
    });

    vi.unstubAllEnvs();
  });

  it('installs a binary into the versioned binary repository and updates state.json', async () => {
    readFileMock.mockRejectedValue(new Error('ENOENT'));
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    chmodMock.mockResolvedValue(undefined);

    const { installSpeechBinary } = await import('../../electron/main/modules/speech/installer.mjs');
    await installSpeechBinary({
      userDataPath: '/tmp/runtime-test',
      platform: 'darwin',
      arch: 'arm64',
      version: '2026.05.04',
      relativePath: 'binaries/darwin-arm64/2026.05.04/whisper',
      sha256: '',
      url: 'memory://whisper',
      archiveType: 'file',
      downloadUrl: async () => Buffer.from('whisper-binary')
    });

    expect(writeFileMock).toHaveBeenCalledWith('/tmp/runtime-test/speech-runtime/binaries/darwin-arm64/2026.05.04/whisper', Buffer.from('whisper-binary'));
    expect(writeFileMock).toHaveBeenCalledWith('/tmp/runtime-test/speech-runtime/state.json', expect.stringContaining('"currentVersion": "2026.05.04"'));
    expect(writeFileMock).toHaveBeenCalledWith(
      '/tmp/runtime-test/speech-runtime/state.json',
      expect.stringContaining('"relativePath": "binaries/darwin-arm64/2026.05.04/whisper"')
    );
  });

  it('installs a managed model into the versioned model repository with meta.json', async () => {
    readFileMock.mockRejectedValue(new Error('ENOENT'));
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);

    const { installManagedSpeechModel } = await import('../../electron/main/modules/speech/installer.mjs');
    await installManagedSpeechModel({
      userDataPath: '/tmp/runtime-test',
      platform: 'darwin',
      arch: 'arm64',
      modelId: 'ggml-base',
      displayName: 'Base',
      version: '1',
      relativePath: 'managed-models/ggml-base/1/model.bin',
      sha256: '',
      sizeBytes: 147000000,
      url: 'memory://ggml-base.bin',
      downloadUrl: async () => Buffer.from('managed-model')
    });

    expect(writeFileMock).toHaveBeenCalledWith('/tmp/runtime-test/speech-runtime/managed-models/ggml-base/1/model.bin', Buffer.from('managed-model'));
    expect(writeFileMock).toHaveBeenCalledWith(
      '/tmp/runtime-test/speech-runtime/managed-models/ggml-base/1/meta.json',
      expect.stringContaining('"displayName": "Base"')
    );
    expect(writeFileMock).toHaveBeenCalledWith('/tmp/runtime-test/speech-runtime/state.json', expect.stringContaining('"id": "ggml-base"'));
  });

  it('rejects removing a managed model that is currently selected', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({
        schemaVersion: 2,
        platform: 'darwin',
        arch: 'arm64',
        selectedModel: {
          sourceType: 'managed',
          modelId: 'ggml-base'
        },
        binaries: {
          currentVersion: '2026.05.04',
          installed: []
        },
        managedModels: [
          {
            id: 'ggml-base',
            displayName: 'Base',
            version: '1',
            relativePath: 'managed-models/ggml-base/1/model.bin',
            sha256: 'sha-model',
            sizeBytes: 147000000
          }
        ],
        externalModels: [],
        updates: {
          autoCheck: true,
          autoDownload: false,
          binaryUpdate: null,
          modelUpdates: []
        }
      })
    );

    const { removeManagedSpeechModel } = await import('../../electron/main/modules/speech/installer.mjs');

    await expect(
      removeManagedSpeechModel({
        userDataPath: '/tmp/runtime-test',
        modelId: 'ggml-base'
      })
    ).rejects.toThrow('currently selected');
  });

  it('applies a binary update by only rewriting the current version pointer', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({
        schemaVersion: 2,
        platform: 'darwin',
        arch: 'arm64',
        selectedModel: {
          sourceType: 'managed',
          modelId: 'ggml-base'
        },
        binaries: {
          currentVersion: '2026.05.04',
          installed: [
            {
              version: '2026.05.04',
              relativePath: 'binaries/darwin-arm64/2026.05.04/whisper',
              sha256: 'sha-old'
            },
            {
              version: '2026.06.01',
              relativePath: 'binaries/darwin-arm64/2026.06.01/whisper',
              sha256: 'sha-new'
            }
          ]
        },
        managedModels: [
          {
            id: 'ggml-base',
            displayName: 'Base',
            version: '1',
            relativePath: 'managed-models/ggml-base/1/model.bin',
            sha256: 'sha-model',
            sizeBytes: 147000000
          }
        ],
        externalModels: [],
        updates: {
          autoCheck: true,
          autoDownload: false,
          binaryUpdate: null,
          modelUpdates: []
        }
      })
    );
    writeFileMock.mockResolvedValue(undefined);

    const { applySpeechBinaryUpdate } = await import('../../electron/main/modules/speech/installer.mjs');
    await applySpeechBinaryUpdate({
      userDataPath: '/tmp/runtime-test',
      version: '2026.06.01'
    });

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock).toHaveBeenCalledWith('/tmp/runtime-test/speech-runtime/state.json', expect.stringContaining('"currentVersion": "2026.06.01"'));
    expect(renameMock).not.toHaveBeenCalled();
  });

  it('downloads a binary update without switching the current version', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({
        schemaVersion: 2,
        platform: 'darwin',
        arch: 'arm64',
        selectedModel: {
          sourceType: 'managed',
          modelId: 'ggml-base'
        },
        binaries: {
          currentVersion: '2026.05.04',
          installed: [
            {
              version: '2026.05.04',
              relativePath: 'binaries/darwin-arm64/2026.05.04/whisper',
              sha256: 'sha-old'
            }
          ]
        },
        managedModels: [],
        externalModels: [],
        updates: {
          autoCheck: true,
          autoDownload: false,
          binaryUpdate: null,
          modelUpdates: []
        }
      })
    );
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    chmodMock.mockResolvedValue(undefined);

    const { downloadSpeechBinaryUpdate } = await import('../../electron/main/modules/speech/installer.mjs');
    await downloadSpeechBinaryUpdate({
      userDataPath: '/tmp/runtime-test',
      platform: 'darwin',
      arch: 'arm64',
      version: '2026.06.01',
      relativePath: 'binaries/darwin-arm64/2026.06.01/whisper',
      sha256: '',
      url: 'memory://whisper-new',
      archiveType: 'file',
      downloadUrl: async () => Buffer.from('whisper-new')
    });

    expect(writeFileMock).toHaveBeenCalledWith('/tmp/runtime-test/speech-runtime/binaries/darwin-arm64/2026.06.01/whisper', Buffer.from('whisper-new'));
    expect(writeFileMock).toHaveBeenCalledWith('/tmp/runtime-test/speech-runtime/state.json', expect.stringContaining('"currentVersion": "2026.05.04"'));
    expect(writeFileMock).toHaveBeenCalledWith(
      '/tmp/runtime-test/speech-runtime/state.json',
      expect.stringContaining('"binaryUpdate": {\n      "version": "2026.06.01"')
    );
  });

  it('rolls back to the previous installed binary version and clears the pending update marker', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({
        schemaVersion: 2,
        platform: 'darwin',
        arch: 'arm64',
        selectedModel: {
          sourceType: 'managed',
          modelId: 'ggml-base'
        },
        binaries: {
          currentVersion: '2026.06.01',
          installed: [
            {
              version: '2026.05.04',
              relativePath: 'binaries/darwin-arm64/2026.05.04/whisper',
              sha256: 'sha-old'
            },
            {
              version: '2026.06.01',
              relativePath: 'binaries/darwin-arm64/2026.06.01/whisper',
              sha256: 'sha-new'
            }
          ]
        },
        managedModels: [],
        externalModels: [],
        updates: {
          autoCheck: true,
          autoDownload: false,
          binaryUpdate: {
            version: '2026.06.01'
          },
          modelUpdates: []
        }
      })
    );
    writeFileMock.mockResolvedValue(undefined);

    const { rollbackSpeechBinaryUpdate } = await import('../../electron/main/modules/speech/installer.mjs');
    await rollbackSpeechBinaryUpdate({
      userDataPath: '/tmp/runtime-test'
    });

    expect(writeFileMock).toHaveBeenCalledWith('/tmp/runtime-test/speech-runtime/state.json', expect.stringContaining('"currentVersion": "2026.05.04"'));
    expect(writeFileMock).toHaveBeenCalledWith('/tmp/runtime-test/speech-runtime/state.json', expect.stringContaining('"binaryUpdate": null'));
  });
});
