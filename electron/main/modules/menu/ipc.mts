import { ipcMain, Menu } from 'electron';

export function registerMenuHandlers(): void {
  ipcMain.on('menu:update-item', (_event, id: string, properties: { checked?: boolean }) => {
    const menu = Menu.getApplicationMenu();
    if (!menu) return;

    const item = menu.getMenuItemById(id);
    if (item && typeof properties.checked === 'boolean') {
      item.checked = properties.checked;
    }
  });
}
