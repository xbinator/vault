/**
 * @file ipc.mts
 * @description 注册语音转写相关的 IPC handlers。
 */
import type {
  SpeechCatalogManagedModelRecord,
  SpeechExternalModelRecord,
  SpeechModelSelection,
  SpeechRuntimeSnapshot,
  SpeechRuntimeUpdatesState,
  SpeechRuntimeStatus,
  SpeechTranscribeRequest,
  SpeechTranscribeResult
} from './types.mjs';
import { BrowserWindow, ipcMain } from 'electron';
import { checkSpeechRuntimeUpdates, getAvailableManagedModels } from './catalog.mjs';
import {
  applySpeechBinaryUpdate,
  downloadSpeechBinaryUpdate,
  installSpeechBinary,
  installManagedSpeechModel,
  removeManagedSpeechModel,
  resolveSpeechRuntimeManifest,
  rollbackSpeechBinaryUpdate
} from './installer.mjs';
import {
  getSpeechRuntimeSnapshot,
  getSpeechRuntimeStatus,
  registerExternalSpeechModel,
  removeExternalSpeechModel,
  removeSpeechRuntime,
  renameExternalSpeechModel,
  revalidateExternalSpeechModel,
  setActiveSpeechModel
} from './runtime.mjs';
import { transcribeAudioSegment } from './service.mjs';

/**
 * 向所有窗口广播安装进度。
 * @param message - 当前进度文案
 */
function emitSpeechInstallProgress(message: string): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('speech:install-progress', {
      phase: 'downloading',
      current: 0,
      total: 1,
      message
    });
  });
}

/**
 * 为兼容旧接口选择推荐官方模型。
 * @param platform - 平台标识
 * @param arch - 架构标识
 * @param preferredModelId - 优先模型标识
 * @returns 推荐模型，未命中时返回首个 catalog 模型
 */
async function resolveRecommendedManagedModel(
  platform: 'darwin' | 'win32',
  arch: 'arm64' | 'x64',
  preferredModelId: string
): Promise<SpeechCatalogManagedModelRecord | null> {
  const catalogModels = await getAvailableManagedModels({ platform, arch });
  return catalogModels.find((item) => item.id === preferredModelId) ?? catalogModels[0] ?? null;
}

/**
 * 注册语音转写 IPC handlers。
 */
export function registerSpeechHandlers(): void {
  ipcMain.handle('speech:transcribe', async (_event, request: SpeechTranscribeRequest): Promise<SpeechTranscribeResult> => {
    return transcribeAudioSegment(request);
  });

  ipcMain.handle('speech:getRuntimeStatus', async (): Promise<SpeechRuntimeStatus> => {
    return getSpeechRuntimeStatus();
  });

  ipcMain.handle('speech:getRuntimeSnapshot', async (): Promise<SpeechRuntimeSnapshot> => {
    return getSpeechRuntimeSnapshot();
  });

  ipcMain.handle('speech:listCatalogModels', async (): Promise<SpeechCatalogManagedModelRecord[]> => {
    return getAvailableManagedModels({
      platform: process.platform as 'darwin' | 'win32',
      arch: process.arch as 'arm64' | 'x64'
    });
  });

  ipcMain.handle('speech:installManagedModel', async (_event, input: { modelId: string; setActive?: boolean }): Promise<SpeechRuntimeSnapshot> => {
    const platform = process.platform as 'darwin' | 'win32';
    const arch = process.arch as 'arm64' | 'x64';
    const catalogModels = await getAvailableManagedModels({ platform, arch });
    const catalogModel = catalogModels.find((item) => item.id === input.modelId);
    if (!catalogModel) {
      throw new Error(`Speech catalog model is not available: ${input.modelId}`);
    }

    await installManagedSpeechModel({
      platform,
      arch,
      modelId: catalogModel.id,
      displayName: catalogModel.displayName,
      version: catalogModel.version,
      relativePath: `managed-models/${catalogModel.id}/${catalogModel.version}/model.bin`,
      sha256: catalogModel.sha256,
      sizeBytes: catalogModel.sizeBytes,
      url: catalogModel.url
    });

    if (input.setActive) {
      await setActiveSpeechModel({}, {
        sourceType: 'managed',
        modelId: catalogModel.id
      });
    }

    return getSpeechRuntimeSnapshot();
  });

  ipcMain.handle('speech:removeManagedModel', async (_event, modelId: string): Promise<SpeechRuntimeSnapshot> => {
    await removeManagedSpeechModel({ modelId });
    return getSpeechRuntimeSnapshot();
  });

  ipcMain.handle('speech:checkRuntimeUpdates', async (): Promise<SpeechRuntimeUpdatesState> => {
    const snapshot = await getSpeechRuntimeSnapshot();
    return checkSpeechRuntimeUpdates({
      platform: snapshot.platform,
      arch: snapshot.arch,
      currentVersion: snapshot.binaryVersion ?? null,
      managedModels: snapshot.managedModels
    });
  });

  ipcMain.handle('speech:downloadRuntimeUpdates', async (): Promise<SpeechRuntimeSnapshot> => {
    const snapshot = await getSpeechRuntimeSnapshot();
    const updates = await checkSpeechRuntimeUpdates({
      platform: snapshot.platform,
      arch: snapshot.arch,
      currentVersion: snapshot.binaryVersion ?? null,
      managedModels: snapshot.managedModels
    });

    if (updates.binaryUpdate) {
      const manifest = await resolveSpeechRuntimeManifest(snapshot.platform, snapshot.arch);
      const binaryAsset = manifest.assets.find((asset) => asset.name === 'whisper');
      if (!binaryAsset) {
        throw new Error('Speech runtime manifest is missing the binary asset');
      }

      await downloadSpeechBinaryUpdate({
        userDataPath: undefined,
        platform: snapshot.platform,
        arch: snapshot.arch,
        version: updates.binaryUpdate.version,
        relativePath: `binaries/${snapshot.platform}-${snapshot.arch}/${updates.binaryUpdate.version}/${snapshot.platform === 'win32' ? 'whisper.exe' : 'whisper'}`,
        sha256: binaryAsset.sha256,
        url: binaryAsset.url,
        archiveType: binaryAsset.archiveType
      });
    }

    return getSpeechRuntimeSnapshot();
  });

  ipcMain.handle('speech:applyRuntimeUpdate', async (): Promise<SpeechRuntimeSnapshot> => {
    const snapshot = await getSpeechRuntimeSnapshot();
    const updates = await checkSpeechRuntimeUpdates({
      platform: snapshot.platform,
      arch: snapshot.arch,
      currentVersion: snapshot.binaryVersion ?? null,
      managedModels: snapshot.managedModels
    });

    if (updates.binaryUpdate) {
      await applySpeechBinaryUpdate({
        version: updates.binaryUpdate.version
      });
    }

    return getSpeechRuntimeSnapshot();
  });

  ipcMain.handle('speech:rollbackRuntimeUpdate', async (): Promise<SpeechRuntimeSnapshot> => {
    await rollbackSpeechBinaryUpdate({});
    return getSpeechRuntimeSnapshot();
  });

  ipcMain.handle('speech:installRuntime', async (): Promise<SpeechRuntimeStatus> => {
    const platform = process.platform as 'darwin' | 'win32';
    const arch = process.arch as 'arm64' | 'x64';
    const initialSnapshot = await getSpeechRuntimeSnapshot();
    if (initialSnapshot.binaryState !== 'ready') {
      const manifest = await resolveSpeechRuntimeManifest(platform, arch);
      const binaryAsset = manifest.assets.find((asset) => asset.name === 'whisper');
      if (!binaryAsset) {
        throw new Error('Speech runtime manifest is missing the binary asset');
      }

      emitSpeechInstallProgress('正在安装语音运行时 binary');
      await installSpeechBinary({
        platform,
        arch,
        version: manifest.version,
        relativePath: `binaries/${platform}-${arch}/${manifest.version}/${platform === 'win32' ? 'whisper.exe' : 'whisper'}`,
        sha256: binaryAsset.sha256,
        url: binaryAsset.url,
        archiveType: binaryAsset.archiveType
      });
    }

    const refreshedSnapshot = await getSpeechRuntimeSnapshot();
    const canAutoSelectInstalledManagedModel =
      !refreshedSnapshot.selectedModel && refreshedSnapshot.managedModels.length > 0;
    if (canAutoSelectInstalledManagedModel) {
      await setActiveSpeechModel({}, {
        sourceType: 'managed',
        modelId: refreshedSnapshot.managedModels[0].id
      });
      return getSpeechRuntimeStatus();
    }

    if (!refreshedSnapshot.hasUsableModel) {
      const manifest = await resolveSpeechRuntimeManifest(platform, arch);
      const recommendedModel = await resolveRecommendedManagedModel(platform, arch, manifest.modelName);
      if (recommendedModel) {
        emitSpeechInstallProgress(`正在安装推荐语音模型：${recommendedModel.displayName}`);
        await installManagedSpeechModel({
          platform,
          arch,
          modelId: recommendedModel.id,
          displayName: recommendedModel.displayName,
          version: recommendedModel.version,
          relativePath: `managed-models/${recommendedModel.id}/${recommendedModel.version}/model.bin`,
          sha256: recommendedModel.sha256,
          sizeBytes: recommendedModel.sizeBytes,
          url: recommendedModel.url
        });
        await setActiveSpeechModel({}, {
          sourceType: 'managed',
          modelId: recommendedModel.id
        });
      } else {
        emitSpeechInstallProgress(`正在安装默认语音模型：${manifest.modelName}`);
        await installManagedSpeechModel({
          platform,
          arch,
          modelId: manifest.modelName,
          displayName: manifest.modelName,
          version: '1',
          relativePath: `managed-models/${manifest.modelName}/1/model.bin`,
          sha256: manifest.assets.find((asset) => asset.name === 'model')?.sha256 ?? '',
          sizeBytes: 0,
          url: manifest.assets.find((asset) => asset.name === 'model')?.url ?? ''
        });
        await setActiveSpeechModel({}, {
          sourceType: 'managed',
          modelId: manifest.modelName
        });
      }
    }

    return getSpeechRuntimeStatus();
  });

  ipcMain.handle('speech:removeRuntime', async (): Promise<SpeechRuntimeStatus> => {
    await removeSpeechRuntime();
    return getSpeechRuntimeStatus();
  });

  ipcMain.handle('speech:listExternalModels', async (): Promise<SpeechExternalModelRecord[]> => {
    const snapshot = await getSpeechRuntimeSnapshot();
    return snapshot.externalModels;
  });

  ipcMain.handle('speech:registerExternalModel', async (_event, input: { filePath: string; displayName: string }): Promise<SpeechExternalModelRecord> => {
    return registerExternalSpeechModel({}, input);
  });

  ipcMain.handle('speech:renameExternalModel', async (_event, modelId: string, displayName: string): Promise<SpeechExternalModelRecord> => {
    return renameExternalSpeechModel({}, modelId, displayName);
  });

  ipcMain.handle('speech:revalidateExternalModel', async (_event, modelId: string): Promise<SpeechExternalModelRecord> => {
    return revalidateExternalSpeechModel({}, modelId);
  });

  ipcMain.handle('speech:removeExternalModel', async (_event, modelId: string): Promise<SpeechRuntimeSnapshot> => {
    await removeExternalSpeechModel({}, modelId);
    return getSpeechRuntimeSnapshot();
  });

  ipcMain.handle('speech:setActiveModel', async (_event, selection: SpeechModelSelection): Promise<SpeechRuntimeSnapshot> => {
    await setActiveSpeechModel({}, selection);
    return getSpeechRuntimeSnapshot();
  });
}
