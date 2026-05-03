/**
 * @file ipc.mts
 * @description 注册语音转写相关的 IPC handlers。
 */
import type { SpeechTranscribeRequest, SpeechTranscribeResult } from './types.mjs';
import { ipcMain } from 'electron';
import { transcribeAudioSegment } from './service.mjs';

/**
 * 注册语音转写 IPC handlers。
 */
export function registerSpeechHandlers(): void {
  ipcMain.handle('speech:transcribe', async (_event, request: SpeechTranscribeRequest): Promise<SpeechTranscribeResult> => {
    return transcribeAudioSegment(request);
  });
}
