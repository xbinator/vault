/**
 * @file 对话框工具函数
 * @description 封装 Electron 打开/保存文件对话框的通用逻辑
 */
import { dialog } from 'electron';
import { getWindow } from '../../window.mjs';

/**
 * 显示对话框，优先使用父窗口作为模态
 * @param withWindow - 有父窗口时的对话框调用函数
 * @param withoutWindow - 无父窗口时的对话框调用函数
 * @returns 对话框结果
 */
async function showDialog<T>(withWindow: (win: Electron.BrowserWindow) => Promise<T>, withoutWindow: () => Promise<T>): Promise<T> {
  const mainWindow = getWindow();
  return mainWindow ? withWindow(mainWindow) : withoutWindow();
}

/**
 * 显示打开文件对话框
 * @param options - Electron OpenDialog 选项
 * @returns 打开文件对话框结果
 */
export function showOpenDialog(options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> {
  return showDialog(
    (win) => dialog.showOpenDialog(win, options),
    () => dialog.showOpenDialog(options)
  );
}

/**
 * 显示保存文件对话框
 * @param options - Electron SaveDialog 选项
 * @returns 保存文件对话框结果
 */
export function showSaveDialog(options: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> {
  return showDialog(
    (win) => dialog.showSaveDialog(win, options),
    () => dialog.showSaveDialog(options)
  );
}
