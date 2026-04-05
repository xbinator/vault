import { isMac } from './is';

export function formatShortcut(shortcut: string, isMacOS: boolean): string {
  if (isMacOS) {
    return shortcut.replace(/Ctrl/g, '⌘').replace(/Shift/g, '⇧').replace(/Alt/g, '⌥');
  }
  return shortcut;
}

export function getShortcutParts(shortcut: string): string[] {
  const isMacOS = isMac();
  const parts = shortcut
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (!isMacOS) return parts;

  const macParts: string[] = [];
  const isFunctionKey = /^f\d+$/i.test(parts[parts.length - 1] || '');

  if (isFunctionKey) {
    macParts.push('fn');
  }

  parts.forEach((part) => {
    if (/^ctrl$/i.test(part)) {
      macParts.push('⌘');
    } else if (/^meta$/i.test(part)) {
      macParts.push('⌘');
    } else if (/^shift$/i.test(part)) {
      macParts.push('⇧');
    } else if (/^alt$/i.test(part)) {
      macParts.push('⌥');
    } else {
      macParts.push(formatShortcut(part, isMacOS));
    }
  });

  return macParts;
}
