/**
 * @file speech-ipc.test.ts
 * @description 验证语音 IPC 兼容安装入口会优先补齐 binary，并在缺少模型时安装推荐模型。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * IPC handle 注册桩。
 */
const ipcMainHandleMock = vi.fn();

/**
 * 窗口消息发送桩。
 */
const sendMock = vi.fn();

/**
 * 运行时快照桩。
 */
const getSpeechRuntimeSnapshotMock = vi.fn();

/**
 * 运行时状态桩。
 */
const getSpeechRuntimeStatusMock = vi.fn();

/**
 * 设置当前模型桩。
 */
const setActiveSpeechModelMock = vi.fn();

/**
 * binary 安装桩。
 */
const installSpeechBinaryMock = vi.fn();

/**
 * 官方模型安装桩。
 */
const installManagedSpeechModelMock = vi.fn();

/**
 * 兼容 manifest 解析桩。
 */
const resolveSpeechRuntimeManifestMock = vi.fn();

/**
 * catalog 官方模型列表桩。
 */
const getAvailableManagedModelsMock = vi.fn();

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [{
      webContents: {
        send: sendMock
      }
    }])
  },
  ipcMain: {
    handle: ipcMainHandleMock
  }
}));

vi.mock('../../electron/main/modules/speech/runtime.mjs', () => ({
  getSpeechRuntimeSnapshot: getSpeechRuntimeSnapshotMock,
  getSpeechRuntimeStatus: getSpeechRuntimeStatusMock,
  registerExternalSpeechModel: vi.fn(),
  removeExternalSpeechModel: vi.fn(),
  removeSpeechRuntime: vi.fn(),
  renameExternalSpeechModel: vi.fn(),
  revalidateExternalSpeechModel: vi.fn(),
  setActiveSpeechModel: setActiveSpeechModelMock
}));

vi.mock('../../electron/main/modules/speech/catalog.mjs', () => ({
  checkSpeechRuntimeUpdates: vi.fn(),
  getAvailableManagedModels: getAvailableManagedModelsMock
}));

vi.mock('../../electron/main/modules/speech/installer.mjs', () => ({
  applySpeechBinaryUpdate: vi.fn(),
  downloadSpeechBinaryUpdate: vi.fn(),
  installSpeechBinary: installSpeechBinaryMock,
  installSpeechRuntime: vi.fn(),
  installManagedSpeechModel: installManagedSpeechModelMock,
  removeManagedSpeechModel: vi.fn(),
  resolveSpeechRuntimeManifest: resolveSpeechRuntimeManifestMock,
  rollbackSpeechBinaryUpdate: vi.fn()
}));

vi.mock('../../electron/main/modules/speech/service.mjs', () => ({
  transcribeAudioSegment: vi.fn()
}));

describe('speech IPC compatibility install', () => {
  beforeEach(() => {
    ipcMainHandleMock.mockReset();
    sendMock.mockReset();
    getSpeechRuntimeSnapshotMock.mockReset();
    getSpeechRuntimeStatusMock.mockReset();
    setActiveSpeechModelMock.mockReset();
    installSpeechBinaryMock.mockReset();
    installManagedSpeechModelMock.mockReset();
    resolveSpeechRuntimeManifestMock.mockReset();
    getAvailableManagedModelsMock.mockReset();
  });

  it('installs binary and recommended managed model when runtime is missing', async () => {
    getSpeechRuntimeSnapshotMock
      .mockResolvedValueOnce({
        binaryState: 'missing',
        activeState: 'missing-model',
        hasUsableModel: false,
        managedModels: [],
        externalModels: [],
        platform: 'darwin',
        arch: 'arm64'
      })
      .mockResolvedValueOnce({
        binaryState: 'ready',
        activeState: 'missing-model',
        hasUsableModel: false,
        managedModels: [],
        externalModels: [],
        platform: 'darwin',
        arch: 'arm64'
      });
    getSpeechRuntimeStatusMock.mockResolvedValue({
      state: 'ready',
      platform: 'darwin',
      arch: 'arm64',
      modelName: 'ggml-base',
      version: '2026.05.04'
    });
    resolveSpeechRuntimeManifestMock.mockResolvedValue({
      platform: 'darwin',
      arch: 'arm64',
      version: '2026.05.04',
      modelName: 'ggml-base',
      assets: [
        {
          name: 'whisper',
          url: 'https://example.com/whisper',
          sha256: 'sha-binary',
          archiveType: 'file',
          targetRelativePath: 'bin/whisper'
        },
        {
          name: 'model',
          url: 'https://example.com/model.bin',
          sha256: 'sha-model',
          archiveType: 'file',
          targetRelativePath: 'models/ggml-base.bin'
        }
      ]
    });
    getAvailableManagedModelsMock.mockResolvedValue([
      {
        id: 'ggml-base',
        displayName: 'Base',
        version: '1',
        url: 'https://example.com/model.bin',
        sha256: 'sha-model',
        sizeBytes: 147000000
      }
    ]);

    const { registerSpeechHandlers } = await import('../../electron/main/modules/speech/ipc.mjs');
    registerSpeechHandlers();

    const installRuntimeCall = ipcMainHandleMock.mock.calls.find((call) => call[0] === 'speech:installRuntime');
    expect(installRuntimeCall).toBeDefined();

    const installRuntimeHandler = installRuntimeCall?.[1] as (() => Promise<unknown>) | undefined;
    const result = await installRuntimeHandler?.();

    expect(installSpeechBinaryMock).toHaveBeenCalledWith(expect.objectContaining({
      version: '2026.05.04'
    }));
    expect(installManagedSpeechModelMock).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'ggml-base',
      displayName: 'Base',
      version: '1'
    }));
    expect(setActiveSpeechModelMock).toHaveBeenCalledWith({}, {
      sourceType: 'managed',
      modelId: 'ggml-base'
    });
    expect(sendMock).toHaveBeenCalledWith('speech:install-progress', expect.objectContaining({
      message: '正在安装语音运行时 binary'
    }));
    expect(result).toEqual(expect.objectContaining({
      state: 'ready',
      modelName: 'ggml-base'
    }));
  });
});
