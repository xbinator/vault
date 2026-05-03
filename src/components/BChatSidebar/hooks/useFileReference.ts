/**
 * @file useFileReference.ts
 * @description 文件引用管理 hook
 */
import type { FileReferenceChip } from '../types';
import type { ChatMessageFileReference } from 'types/chat';
import { nextTick, onMounted, onUnmounted } from 'vue';
import { nanoid } from 'nanoid';
import { editorToolContextRegistry } from '@/ai/tools/editor-context';
import type { ChatFileReferenceInsertPayload } from '@/shared/chat/fileReference';
import { onChatFileReferenceInsert } from '@/shared/chat/fileReference';
import { useSettingStore } from '@/stores/setting';

/**
 * 文件引用 Hook 的依赖项
 */
interface FileReferenceOptions {
  /** 插入文本到光标位置 */
  insertTextAtCursor: (text: string) => void;
  /** 保存光标位置 */
  saveCursorPosition: () => void;
  /** 聚焦输入框 */
  focusInput: () => void;
  /** 添加文件引用到草稿 */
  addReference: (reference: ChatMessageFileReference) => void;
}

/**
 * 文件引用管理 hook
 * @param options - 依赖项配置
 * @returns 文件引用状态和操作方法
 */
export function useFileReference(options: FileReferenceOptions) {
  const settingStore = useSettingStore();

  /** 文件引用插入事件取消注册函数 */
  let unregisterFileReferenceInsert: (() => void) | null = null;

  /**
   * 文件粘贴/拖拽回调，将文件列表转换为 file-ref token
   * 无选区时 startLine/endLine 均为 0
   * @param files - 粘贴或拖拽的文件列表
   * @returns 生成的 token 字符串
   */
  function onPasteFiles(files: File[]): string {
    return Array.from(files)
      .map((file) => `{{@${file.name}}} `)
      .join('');
  }

  /**
   * 处理聊天中插入文件引用
   * 将文件引用添加到草稿列表并插入 token 到输入框
   * @param reference - 文件引用信息
   */
  function insertReference(reference: FileReferenceChip): void {
    let lineSuffix = '';
    if (reference.startLine > 0) {
      lineSuffix = reference.startLine === reference.endLine ? `:${reference.startLine}` : `:${reference.startLine}-${reference.endLine}`;
    }
    const token = `{{@${reference.fileName}${lineSuffix}}} `;

    // 构建文件引用元数据
    let lineLabel = '';
    if (reference.startLine > 0) {
      lineLabel = reference.startLine === reference.endLine ? `${reference.startLine}` : `${reference.startLine}-${reference.endLine}`;
    }

    const fileReference: ChatMessageFileReference = {
      id: nanoid(),
      token: `{{@${reference.fileName}${lineSuffix}}}`,
      documentId: reference.documentId,
      fileName: reference.fileName,
      line: lineLabel,
      path: reference.filePath,
      snapshotId: ''
    };

    options.addReference(fileReference);
    options.insertTextAtCursor(token);
  }

  /**
   * 处理文件引用插入事件
   * 从编辑器上下文获取文档信息，构建完整的文件引用并插入
   * @param reference - 文件引用插入载荷
   */
  async function handleFileReferenceInsert(reference: ChatFileReferenceInsertPayload): Promise<void> {
    const toolContext = editorToolContextRegistry.getCurrentContext();
    const { document } = toolContext || {};

    const documentId = document?.id || reference.filePath || reference.fileName;
    const filePath = document?.path || reference.filePath || null;

    const { startLine, endLine } = reference;

    const enrichedReference = { documentId, filePath, fileName: reference.fileName, startLine, endLine };

    // 先锁定聊天输入框最近一次有效插入位置，再处理侧边栏聚焦与引用插入
    options.saveCursorPosition();
    settingStore.setSidebarVisible(true);

    await nextTick();
    insertReference(enrichedReference);
    options.focusInput();
  }

  /** 注册文件引用插入事件监听 */
  onMounted(() => {
    unregisterFileReferenceInsert = onChatFileReferenceInsert((reference) => {
      handleFileReferenceInsert(reference);
    });
  });

  /** 取消注册文件引用插入事件监听 */
  onUnmounted(() => {
    unregisterFileReferenceInsert?.();
    unregisterFileReferenceInsert = null;
  });

  return {
    onPasteFiles,
    insertReference
  };
}
