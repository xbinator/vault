/**
 * @file chipResolver.ts
 * @description 聊天输入框 Chip 解析器，将 file-ref token 解析为渲染 Widget。
 */
import { WidgetType } from '@codemirror/view';
import type { ChipResolver } from '@/components/BPromptEditor/extensions/variableChip';
import { parseFileReferenceToken } from '@/utils/fileReference/parseToken';
import type { FileReferenceNavigationTarget, ParsedFileReference } from '@/utils/fileReference/types';

/**
 * 将解析结果转换为文件导航目标。
 * @param parsed - 已解析的文件引用
 * @returns 文件导航目标
 */
function toNavigationTarget(parsed: ParsedFileReference): FileReferenceNavigationTarget {
  return {
    rawPath: parsed.rawPath,
    filePath: parsed.filePath,
    fileId: parsed.fileId,
    fileName: parsed.fileName,
    startLine: parsed.startLine,
    endLine: parsed.endLine
  };
}

/**
 * 文件引用 Chip Widget，由 chipResolver 返回。
 * 当前统一显示 `fileName:renderStart-renderEnd`，缺失渲染行号时回退到源码行号。
 */
class FileRefWidget extends WidgetType {
  constructor(private readonly location: ParsedFileReference, private readonly onOpenFile: (target: FileReferenceNavigationTarget) => void) {
    super();
  }

  eq(other: FileRefWidget): boolean {
    return (
      this.location.fileName === other.location.fileName &&
      this.location.startLine === other.location.startLine &&
      this.location.endLine === other.location.endLine &&
      this.location.renderStartLine === other.location.renderStartLine &&
      this.location.renderEndLine === other.location.renderEndLine
    );
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'b-prompt-chip b-prompt-chip--file';
    span.tabIndex = 0;
    span.setAttribute('role', 'button');

    const { fileName, renderStartLine, renderEndLine } = this.location;

    const lineText = renderStartLine === renderEndLine ? `${renderStartLine}` : `${renderStartLine}-${renderEndLine}`;

    span.textContent = `${fileName}:${lineText}`;
    span.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    span.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onOpenFile(toNavigationTarget(this.location));
    });
    span.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.onOpenFile(toNavigationTarget(this.location));
      }
    });

    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * 创建文件引用 chip 解析器。
 * @param onOpenFile - 文件打开回调
 * @returns PromptEditor 可用的 chipResolver
 */
export function createFileRefChipResolver(onOpenFile: (target: FileReferenceNavigationTarget) => void): ChipResolver {
  return (content) => {
    if (!content.startsWith('#')) return null;

    const parsed = parseFileReferenceToken(content);
    if (!parsed) {
      return null;
    }

    return { widget: new FileRefWidget(parsed, onOpenFile) };
  };
}
