<template>
  <div class="editor-layout editor-content">
    <div class="editor-main-container">
      <div class="editor-content-wrapper">
        <BEditor
          ref="editorRef"
          :key="fileState.id"
          v-model:value="fileState"
          :view-mode="editorPreferencesStore.viewMode"
          :show-outline="editorPreferencesStore.showOutline"
          @editor-blur="actions.onEditorBlur"
          @rename-file="actions.onRename"
          @save="actions.onSave"
          @save-as="actions.onSaveAs"
          @copy-path="actions.onCopyPath"
          @copy-relative-path="actions.onCopyRelativePath"
          @show-in-folder="actions.onShowInFolder"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { editorToolContextRegistry } from '@/ai/tools/editor-context';
import BEditor from '@/components/BEditor/index.vue';
import type { BEditorPublicInstance } from '@/components/BEditor/types';
import { useEditorPreferencesStore } from '@/stores/editorPreferences';
import { buildUnsavedPath } from '@/utils/fileReference/unsavedPath';
import { useBindings } from './hooks/useBindings';
import { useFileSelection } from './hooks/useFileSelection';
import { useSession } from './hooks/useSession';

const route = useRoute();
const editorPreferencesStore = useEditorPreferencesStore();

const fileId = ref(String(route.params.id || ''));

const { fileState, actions } = useSession(fileId);

const editorRef = ref<BEditorPublicInstance | null>(null);
const isActive = ref(true);
const isEditorReady = computed<boolean>(() => editorRef.value !== null);

useBindings(fileId, { fileState, actions, editorInstance: editorRef });
useFileSelection({
  fileState,
  isEditorReady,
  editorInstance: editorRef
});

/**
 * 注销当前编辑器工具上下文。
 */
function unregisterEditorContext(): void {
  const documentId = fileState.value.id;
  if (documentId) {
    editorToolContextRegistry.unregister(documentId);
  }
}

/**
 * 注册当前激活编辑器的工具上下文。
 */
function registerEditorContext(): void {
  const editorInstance = editorRef.value;
  const documentId = fileState.value.id;

  if (!isActive.value || !editorInstance || !documentId) {
    return;
  }

  editorToolContextRegistry.register(documentId, {
    document: {
      id: documentId,
      title: fileState.value.name,
      path: fileState.value.path,
      locator: fileState.value.path ?? buildUnsavedPath({ id: documentId, fileName: `${fileState.value.name}.${fileState.value.ext}` }),
      getContent: () => fileState.value.content
    },
    editor: {
      getSelection: () => editorInstance.getSelection(),
      insertAtCursor: (content: string) => editorInstance.insertAtCursor(content),
      replaceSelection: (content: string) => editorInstance.replaceSelection(content),
      replaceDocument: (content: string) => editorInstance.replaceDocument(content)
    }
  });
}

watch([editorRef, () => fileState.value.id], registerEditorContext);

onActivated(() => {
  isActive.value = true;
  registerEditorContext();
});

onDeactivated(() => {
  isActive.value = false;
  unregisterEditorContext();
});

onBeforeUnmount(() => {
  unregisterEditorContext();
});
</script>

<style lang="less" scoped>
.editor-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor-main-container {
  position: relative;
  display: flex;
  flex: 1;
  gap: 6px;
  height: 100%;
  overflow: hidden;
}

.editor-content-wrapper {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
}
</style>
