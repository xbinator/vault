/**
 * @file chipResolver.ts
 * @description 聊天输入框 Chip 解析器，将 file-ref token 解析为渲染 Widget。
 */
import { WidgetType } from '@codemirror/view';
import type { ChipResolver } from '@/components/BPromptEditor/extensions/variableChip';

/**
 * 文件引用 Chip Widget，由 chipResolver 返回。
 * 有行号 → 显示 `fileName:startLine-endLine` 或 `fileName:startLine`
 * 无行号 → 仅显示 `fileName`
 */
class FileRefWidget extends WidgetType {
  constructor(private fileName: string, private startLine: number, private endLine: number) {
    super();
  }

  eq(other: FileRefWidget): boolean {
    return this.fileName === other.fileName && this.startLine === other.startLine && this.endLine === other.endLine;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'b-prompt-chip b-prompt-chip--file';
    if (this.startLine > 0) {
      span.textContent = this.startLine === this.endLine ? `${this.fileName}:${this.startLine}` : `${this.fileName}:${this.startLine}-${this.endLine}`;
    } else {
      span.textContent = this.fileName;
    }
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Chip 解析器，将 {{...}} 内部的 body 解析为渲染指令。
 * 格式: @fileName 或 @fileName:startLine 或 @fileName:startLine-endLine
 * 其他 → null（不渲染为 chip）。
 */
export const chipResolver: ChipResolver = (body) => {
  if (!body.startsWith('@')) {
    return null;
  }

  const content = body.slice(1);
  const match = /^([^\s:]+)(?::(\d+)(?:-(\d+))?)?$/.exec(content);
  if (match) {
    const fileName = match[1];
    const rawStart = match[2];
    const rawEnd = match[3];
    const startLine = rawStart ? Number(rawStart) : 0;
    const endLine = rawEnd ? Number(rawEnd) : startLine;
    return { widget: new FileRefWidget(fileName, startLine, endLine) };
  }

  if (import.meta.env.DEV) {
    console.warn('[chipResolver] 无法解析文件引用 token body:', body);
  }
  return { widget: new FileRefWidget(content, 0, 0) };
};
