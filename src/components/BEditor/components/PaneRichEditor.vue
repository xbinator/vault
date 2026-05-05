<template>
  <RichEditorContent
    v-model:front-matter-data="frontMatterModel"
    :editor="editorInstance"
    :editor-state="editorState"
    :should-show-front-matter-card="shouldShowFrontMatterCard"
  />
</template>

<script setup lang="ts">
import type { EditorController, EditorSearchState, EditorSelection as EditorSelectionRange } from '../adapters/types';
import type { SearchScrollContext } from '../extensions/Search';
import type { FrontMatterData } from '../hooks/useFrontMatter';
import type { EditorState } from '../types';
import { computed, toRef, watch } from 'vue';
import { getSearchSnapshot } from '../extensions/Search';
import { useFrontMatter } from '../hooks/useFrontMatter';
import { useRichEditor } from '../hooks/useRichEditor';
import RichEditorContent from './RichEditorContent.vue';

interface Props {
  editable?: boolean;
  // 编辑器状态
  editorState?: EditorState;
  onSearchMatchElementFocus?: (targetElement: HTMLElement) => void;
}

const props = withDefaults(defineProps<Props>(), {
  editable: true,
  editorState: () => ({ content: '', name: '', path: '', id: '', ext: '' }),
  onSearchMatchElementFocus: undefined
});

const editorContent = defineModel<string>('value', { default: '' });
const outlineContent = defineModel<string>('outlineContent', { default: '' });

const editorInstanceId = computed<string>(() => props.editorState?.id || '');

const { bodyContent, frontMatterData, hasFrontMatter, updateFrontMatter, reconstructContent } = useFrontMatter(editorContent);

const shouldShowFrontMatterCard = computed<boolean>(() => Boolean(hasFrontMatter.value));

function syncToExternal(): void {
  const nextContent = reconstructContent();
  if (editorContent.value !== nextContent) {
    editorContent.value = nextContent;
  }
}

function handleSearchMatchFocus({ targetElement }: SearchScrollContext): void {
  if (targetElement instanceof HTMLElement) {
    props.onSearchMatchElementFocus?.(targetElement);
  }
}

const { editorInstance } = useRichEditor({
  bodyContent,
  editable: toRef(props, 'editable'),
  editorInstanceId,
  onContentChange: syncToExternal,
  onSearchMatchFocus: handleSearchMatchFocus
});

const frontMatterModel = computed<FrontMatterData>({
  get(): FrontMatterData {
    return frontMatterData.value;
  },
  set(data: FrontMatterData): void {
    updateFrontMatter(data);
    syncToExternal();
  }
});

watch(
  bodyContent,
  (content: string): void => {
    outlineContent.value = content;
  },
  { immediate: true }
);

function setContent(text: string): void {
  editorContent.value = text;
}

function undo(): void {
  editorInstance.value?.commands.undo();
}

function redo(): void {
  editorInstance.value?.commands.redo();
}

function canUndo(): boolean {
  return Boolean(editorInstance.value?.can().undo());
}

function canRedo(): boolean {
  return Boolean(editorInstance.value?.can().redo());
}

function focusEditor(): void {
  editorInstance.value?.commands.focus();
}

function focusEditorAtStart(): void {
  editorInstance.value?.commands.focus('start');
}

function setSearchTerm(term: string): void {
  editorInstance.value?.commands.setSearchTerm(term);
}

function findNext(): void {
  editorInstance.value?.commands.findNext();
}

function findPrevious(): void {
  editorInstance.value?.commands.findPrevious();
}

function clearSearch(): void {
  editorInstance.value?.commands.clearSearch();
}

function getSelection(): EditorSelectionRange | null {
  const selection = editorInstance.value?.state.selection;
  const document = editorInstance.value?.state.doc;
  if (!selection || !document || selection.from === selection.to) {
    return null;
  }

  return {
    from: selection.from,
    to: selection.to,
    text: document.textBetween(selection.from, selection.to, '')
  };
}

/**
 * 在光标位置插入 Markdown 内容
 * @param content - 要插入的 Markdown 文本
 */
async function insertAtCursor(content: string): Promise<void> {
  const instance = editorInstance.value;
  if (!instance) {
    return;
  }

  const { selection } = instance.state;
  instance.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, content, { contentType: 'markdown' }).run();
}

/**
 * 替换当前选中的内容
 * @param content - 用于替换的 Markdown 文本
 * @throws {Error} 当没有选中内容时抛出 NO_SELECTION 错误
 */
async function replaceSelection(content: string): Promise<void> {
  const instance = editorInstance.value;
  if (!instance) {
    return;
  }

  const { selection } = instance.state;
  if (selection.from === selection.to) {
    throw new Error('NO_SELECTION');
  }

  instance.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, content, { contentType: 'markdown' }).run();
}

/**
 * 替换整个文档内容
 * @param content - 新的 Markdown 文档内容
 */
async function replaceDocument(content: string): Promise<void> {
  const instance = editorInstance.value;
  if (!instance) {
    return;
  }

  instance.commands.setContent(content, { contentType: 'markdown' });
}

function getSearchState(): EditorSearchState {
  return getSearchSnapshot(editorInstance.value);
}

function scrollToAnchor(): boolean {
  return false;
}

function getActiveAnchorId(): string {
  return '';
}

const controller: EditorController & { setContent: (text: string) => void } = {
  undo,
  redo,
  canUndo,
  canRedo,
  focusEditor,
  focusEditorAtStart,
  setSearchTerm,
  findNext,
  findPrevious,
  clearSearch,
  getSelection,
  insertAtCursor,
  replaceSelection,
  replaceDocument,
  getSearchState,
  scrollToAnchor,
  getActiveAnchorId,
  setContent
};

defineExpose(controller);
</script>
