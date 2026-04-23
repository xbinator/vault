import { inspect } from 'util';
import { ipcMain } from 'electron';
import log from 'electron-log/main.js';

function formatArgs(args: unknown[]): unknown[] {
  return args.map((arg) => (typeof arg === 'object' && arg !== null ? inspect(arg, { depth: null, breakLength: Infinity }) : arg));
}

export function registerLoggerHandlers(): void {
  ipcMain.on('logger:debug', (_event, ...args: unknown[]) => {
    log.debug(...formatArgs(args));
  });

  ipcMain.on('logger:info', (_event, ...args: unknown[]) => {
    log.info(...formatArgs(args));
  });

  ipcMain.on('logger:warn', (_event, ...args: unknown[]) => {
    log.warn(...formatArgs(args));
  });

  ipcMain.on('logger:error', (_event, ...args: unknown[]) => {
    log.error(...formatArgs(args));
  });
}
