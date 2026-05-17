/**
 * @file json.ts
 * @description JSON 编辑器驱动。
 */

import type { EditorDriver } from './types';
import type { StructuredDocumentContext } from 'types/ai';
import BJsonGraph from '@/components/BJsonGraph/index.vue';
import { createBaseToolContext } from './markdown';

/**
 * 结构化上下文候选实例。
 */
interface StructuredContextLike {
  /** 获取当前路径。 */
  getCurrentPath: () => string | null;
  /** 获取当前节点类型。 */
  getCurrentNodeType: () => string | null;
  /** 按路径读取值。 */
  getValueAtPath: (path: string) => unknown;
  /** 获取结构摘要。 */
  getStructureSummary: StructuredDocumentContext['getStructureSummary'];
}

/**
 * 判断实例是否具备结构化上下文能力。
 * @param editorInstance - 编辑器实例
 * @returns 是否支持结构化上下文
 */
function hasStructuredContext(editorInstance: unknown): editorInstance is StructuredContextLike {
  return Boolean(
    editorInstance &&
      typeof (editorInstance as StructuredContextLike).getCurrentPath === 'function' &&
      typeof (editorInstance as StructuredContextLike).getCurrentNodeType === 'function' &&
      typeof (editorInstance as StructuredContextLike).getValueAtPath === 'function' &&
      typeof (editorInstance as StructuredContextLike).getStructureSummary === 'function'
  );
}

/**
 * JSON 驱动。
 */
export const jsonDriver: EditorDriver = {
  id: 'json',
  match(file): boolean {
    return file.ext === 'json';
  },
  component: BJsonGraph,
  createToolContext({ fileState, editorInstance }) {
    const context = createBaseToolContext(fileState, editorInstance);

    if (hasStructuredContext(editorInstance)) {
      const structuredContext: StructuredDocumentContext = {
        documentType: 'json',
        getCurrentPath: () => editorInstance.getCurrentPath(),
        getCurrentNodeType: () => editorInstance.getCurrentNodeType(),
        getValueAtPath: (path: string) => editorInstance.getValueAtPath(path),
        getStructureSummary: () => editorInstance.getStructureSummary()
      };

      context.structured = structuredContext;
    }

    return context;
  },
  toolbar: {
    showViewModeToggle: false,
    showOutlineToggle: false,
    showStructuredViewToggle: true,
    showSearch: true
  },
  supportsOutline: false
};
