/**
 * @file ipc.mts
 * @description AI 服务 IPC 处理器，负责处理渲染进程与主进程之间的 AI 相关通信
 */
import type { AICreateOptions, AIRequestOptions } from 'types/ai';
import { ipcMain } from 'electron';
import { getWindowFromWebContents } from '../../window.mjs';
import { aiService } from './service.mjs';

/**
 * 注册 AI 相关的 IPC 处理器
 * @description 注册 ai:stream:abort、ai:invoke、ai:stream 三个 IPC 通道
 */
export function registerAIHandlers(): void {
  /**
   * 中止流式请求
   * @param requestId - 请求 ID
   */
  ipcMain.handle('ai:stream:abort', (_event, requestId: string) => {
    aiService.abortStream(requestId);
  });

  /**
   * 同步调用 AI 服务（非流式）
   * @param createOptions - 创建选项（包含服务商配置）
   * @param request - 请求选项（包含模型 ID、消息等）
   * @returns AI 调用结果
   */
  ipcMain.handle('ai:invoke', async (_event, createOptions: AICreateOptions, request: AIRequestOptions) => {
    return aiService.generateText(createOptions, request);
  });

  /**
   * 流式调用 AI 服务
   * @param createOptions - 创建选项（包含服务商配置）
   * @param request - 请求选项（包含模型 ID、消息、请求 ID 等）
   * @description 通过 webContents.send 向渲染进程推送流式事件
   */
  ipcMain.handle('ai:stream', async (event, createOptions: AICreateOptions, request: AIRequestOptions) => {
    const win = getWindowFromWebContents(event.sender);
    if (!win) return;

    const { requestId } = request;

    try {
      const [error, result] = await aiService.streamText(createOptions, request);
      if (error) {
        win.webContents.send('ai:stream:error', error);
        return;
      }

      // 遍历流式响应，根据类型分发不同事件
      for await (const chunk of result.stream) {
        console.log('🚀 ~ forawait ~ chunk:', chunk);
        if (chunk.type === 'text-delta') {
          // 文本增量更新
          process.stdout.write(chunk.text);
          win.webContents.send('ai:stream:chunk', chunk.text);
        } else if (chunk.type === 'tool-call') {
          // 工具调用
          win.webContents.send('ai:stream:tool-call', { toolCallId: chunk.toolCallId, toolName: chunk.toolName, input: chunk.input });
        } else if (chunk.type === 'error') {
          // 流式错误
          win.webContents.send('ai:stream:error', chunk.error);
        } else if (chunk.type === 'finish') {
          // 流式完成，携带 token 使用量
          const { inputTokens, outputTokens, totalTokens } = chunk.totalUsage;
          win.webContents.send('ai:stream:finish', { usage: { inputTokens, outputTokens, totalTokens } });
        }
      }

      win.webContents.send('ai:stream:complete');
    } catch (error: unknown) {
      // 处理中止错误
      if (error instanceof Error && error.name === 'AbortError') {
        win.webContents.send('ai:stream:complete');
        return;
      }
      // 在 aiService.streamText 抛出的错误已经被 normalizeError 转换成了 AIServiceError 格式（包含 code 和 message）
      // 我们直接将这个错误对象发送给前端，以便前端可以根据 code 进行差异化处理
      win.webContents.send('ai:stream:error', error);
    } finally {
      // 清理 AbortController
      if (requestId) {
        aiService.removeController(requestId);
      }
    }
  });
}
