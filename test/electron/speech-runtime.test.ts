/**
 * @file speech-runtime.test.ts
 * @description 验证语音运行时 V2 状态文件读写、当前选择解析与快照聚合行为。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 文件存在性检查桩。
 */
const accessMock = vi.fn();

/**
 * 创建目录桩。
 */
const mkdirMock = vi.fn();

/**
 * 读取文件桩。
 */
const readFileMock = vi.fn();

/**
 * 删除目录桩。
 */
const rmMock = vi.fn();

/**
 * 写入文件桩。
 */
const writeFileMock = vi.fn();

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/app/user-data')
  }
}));

vi.mock('node:fs/promises', () => ({
  access: accessMock,
  mkdir: mkdirMock,
  readFile: readFileMock,
  rm: rmMock,
  writeFile: writeFileMock
}));

describe('speech runtime v2', () => {
  beforeEach(() => {
    accessMock.mockReset();
    mkdirMock.mockReset();
    readFileMock.mockReset();
    rmMock.mockReset();
    writeFileMock.mockReset();
  });

  it('reports missing binary and no usable model when state.json is absent', async () => {
    readFileMock.mockRejectedValue(new Error('ENOENT'));

    const { getSpeechRuntimeSnapshot } = await import('../../electron/main/modules/speech/runtime.mjs');
    const snapshot = await getSpeechRuntimeSnapshot({
      userDataPath: '/tmp/runtime-test',
      platform: 'darwin',
      arch: 'arm64'
    });

    expect(snapshot.binaryState).toBe('missing');
    expect(snapshot.hasUsableModel).toBe(false);
    expect(snapshot.activeState).toBe('missing-model');
    expect(snapshot.managedModels).toEqual([]);
    expect(snapshot.externalModels).toEqual([]);
  });

  it('resolves a managed selected model into runtime config paths', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({
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
            sha256: 'sha-binary'
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
    }));
    accessMock.mockResolvedValue(undefined);

    const { resolveSpeechRuntimeConfig } = await import('../../electron/main/modules/speech/runtime.mjs');
    const config = await resolveSpeechRuntimeConfig({
      userDataPath: '/tmp/runtime-test',
      platform: 'darwin',
      arch: 'arm64'
    });

    expect(config.whisperBinaryPath).toBe('/tmp/runtime-test/speech-runtime/binaries/darwin-arm64/2026.05.04/whisper');
    expect(config.whisperModelPath).toBe('/tmp/runtime-test/speech-runtime/managed-models/ggml-base/1/model.bin');
  });

  it('resolves an external selected model into runtime config paths', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({
      schemaVersion: 2,
      platform: 'darwin',
      arch: 'arm64',
      selectedModel: {
        sourceType: 'external',
        modelId: 'external-1'
      },
      binaries: {
        currentVersion: '2026.05.04',
        installed: [
          {
            version: '2026.05.04',
            relativePath: 'binaries/darwin-arm64/2026.05.04/whisper',
            sha256: 'sha-binary'
          }
        ]
      },
      managedModels: [],
      externalModels: [
        {
          id: 'external-1',
          displayName: 'Meeting Model',
          filePath: '/models/meeting.bin',
          lastValidatedAt: 1746460800000,
          lastValidationState: 'ready'
        }
      ],
      updates: {
        autoCheck: true,
        autoDownload: false,
        binaryUpdate: null,
        modelUpdates: []
      }
    }));
    accessMock.mockResolvedValue(undefined);

    const { resolveSpeechRuntimeConfig } = await import('../../electron/main/modules/speech/runtime.mjs');
    const config = await resolveSpeechRuntimeConfig({
      userDataPath: '/tmp/runtime-test',
      platform: 'darwin',
      arch: 'arm64'
    });

    expect(config.whisperBinaryPath).toBe('/tmp/runtime-test/speech-runtime/binaries/darwin-arm64/2026.05.04/whisper');
    expect(config.whisperModelPath).toBe('/models/meeting.bin');
  });

  it('reports invalid selection when selected managed model is missing from records', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({
      schemaVersion: 2,
      platform: 'darwin',
      arch: 'arm64',
      selectedModel: {
        sourceType: 'managed',
        modelId: 'ggml-missing'
      },
      binaries: {
        currentVersion: '2026.05.04',
        installed: [
          {
            version: '2026.05.04',
            relativePath: 'binaries/darwin-arm64/2026.05.04/whisper',
            sha256: 'sha-binary'
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
    }));
    accessMock.mockResolvedValue(undefined);

    const { getSpeechRuntimeSnapshot } = await import('../../electron/main/modules/speech/runtime.mjs');
    const snapshot = await getSpeechRuntimeSnapshot({
      userDataPath: '/tmp/runtime-test',
      platform: 'darwin',
      arch: 'arm64'
    });

    expect(snapshot.binaryState).toBe('ready');
    expect(snapshot.activeState).toBe('invalid-selection');
    expect(snapshot.hasUsableModel).toBe(false);
  });

  it('marks external models as missing when their files no longer exist', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({
      schemaVersion: 2,
      platform: 'darwin',
      arch: 'arm64',
      selectedModel: undefined,
      binaries: {
        currentVersion: null,
        installed: []
      },
      managedModels: [],
      externalModels: [
        {
          id: 'external-1',
          displayName: 'Meeting Model',
          filePath: '/missing/model.bin',
          lastValidatedAt: 1746460800000,
          lastValidationState: 'ready'
        }
      ],
      updates: {
        autoCheck: true,
        autoDownload: false,
        binaryUpdate: null,
        modelUpdates: []
      }
    }));
    accessMock.mockRejectedValue(new Error('ENOENT'));

    const { getSpeechRuntimeSnapshot } = await import('../../electron/main/modules/speech/runtime.mjs');
    const snapshot = await getSpeechRuntimeSnapshot({
      userDataPath: '/tmp/runtime-test',
      platform: 'darwin',
      arch: 'arm64'
    });

    expect(snapshot.externalModels[0]?.lastValidationState).toBe('missing');
    expect(snapshot.externalModels[0]?.lastErrorMessage).toContain('/missing/model.bin');
  });

  it('registers an external model and persists it into state.json', async () => {
    readFileMock.mockRejectedValue(new Error('ENOENT'));
    accessMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);

    const { registerExternalSpeechModel } = await import('../../electron/main/modules/speech/runtime.mjs');
    const record = await registerExternalSpeechModel(
      {
        userDataPath: '/tmp/runtime-test',
        platform: 'darwin',
        arch: 'arm64'
      },
      {
        filePath: '/models/meeting.bin',
        displayName: 'Meeting Model'
      }
    );

    expect(record.displayName).toBe('Meeting Model');
    expect(record.filePath).toBe('/models/meeting.bin');
    expect(record.lastValidationState).toBe('ready');
    expect(writeFileMock).toHaveBeenCalledWith(
      '/tmp/runtime-test/speech-runtime/state.json',
      expect.stringContaining('"displayName": "Meeting Model"')
    );
  });

  it('switches the active model to an external record', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({
      schemaVersion: 2,
      platform: 'darwin',
      arch: 'arm64',
      selectedModel: undefined,
      binaries: {
        currentVersion: '2026.05.04',
        installed: []
      },
      managedModels: [],
      externalModels: [
        {
          id: 'external-1',
          displayName: 'Meeting Model',
          filePath: '/models/meeting.bin',
          lastValidatedAt: 1746460800000,
          lastValidationState: 'ready'
        }
      ],
      updates: {
        autoCheck: true,
        autoDownload: false,
        binaryUpdate: null,
        modelUpdates: []
      }
    }));
    writeFileMock.mockResolvedValue(undefined);

    const { setActiveSpeechModel } = await import('../../electron/main/modules/speech/runtime.mjs');
    await setActiveSpeechModel(
      {
        userDataPath: '/tmp/runtime-test',
        platform: 'darwin',
        arch: 'arm64'
      },
      {
        sourceType: 'external',
        modelId: 'external-1'
      }
    );

    expect(writeFileMock).toHaveBeenCalledWith(
      '/tmp/runtime-test/speech-runtime/state.json',
      expect.stringContaining('"sourceType": "external"')
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      '/tmp/runtime-test/speech-runtime/state.json',
      expect.stringContaining('"modelId": "external-1"')
    );
  });

  it('rejects removing the currently selected external model', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({
      schemaVersion: 2,
      platform: 'darwin',
      arch: 'arm64',
      selectedModel: {
        sourceType: 'external',
        modelId: 'external-1'
      },
      binaries: {
        currentVersion: null,
        installed: []
      },
      managedModels: [],
      externalModels: [
        {
          id: 'external-1',
          displayName: 'Meeting Model',
          filePath: '/models/meeting.bin',
          lastValidatedAt: 1746460800000,
          lastValidationState: 'ready'
        }
      ],
      updates: {
        autoCheck: true,
        autoDownload: false,
        binaryUpdate: null,
        modelUpdates: []
      }
    }));

    const { removeExternalSpeechModel } = await import('../../electron/main/modules/speech/runtime.mjs');

    await expect(
      removeExternalSpeechModel(
        {
          userDataPath: '/tmp/runtime-test',
          platform: 'darwin',
          arch: 'arm64'
        },
        'external-1'
      )
    ).rejects.toThrow('currently selected');
  });
});
