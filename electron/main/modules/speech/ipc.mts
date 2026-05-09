/**
 * @file ipc.mts
 * @description 注册语音转写相关的 IPC handlers。
 */
import type {
  SpeechExternalModelRecord,
  SpeechModelSelection,
  SpeechRuntimeSnapshot,
  SpeechRuntimeStatus,
  SpeechTranscribeRequest,
  SpeechTranscribeResult
} from './types.mjs';
import { BrowserWindow, ipcMain } from 'electron';
import { installSpeechRuntime, resolveSpeechRuntimeManifest } from './installer.mjs';
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

  ipcMain.handle('speech:installRuntime', async (): Promise<SpeechRuntimeStatus> => {
    const platform = process.platform as 'darwin' | 'win32';
    const arch = process.arch as 'arm64' | 'x64';
    const manifest = await resolveSpeechRuntimeManifest(platform, arch);

    await installSpeechRuntime({
      platform,
      arch,
      manifest,
      onProgress: (progress) => {
        BrowserWindow.getAllWindows().forEach((window) => {
          window.webContents.send('speech:install-progress', progress);
        });
      }
    });

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
