<template>
  <div v-if="editor && visible" ref="wrapperRef" class="ai-input-wrapper" :style="wrapperStyle">
    <!-- 预览确认区 -->
    <div v-if="previewText || loading" class="ai-preview">
      <div class="ai-preview-text">
        <BMessage :content="previewText" :max-height="200" type="text" status="streaming" :loading="loading" />
      </div>
      <div class="ai-preview-hint">
        <div v-if="loading" class="flex items-center gap-2">
          <Icon icon="svg-spinners:ring-resize" class="ai-loading-icon" />
          <span>正在编写中...</span>
        </div>
        <div v-else class="flex items-center">
          <div>内容由 AI 生成</div>
          <!-- <Icon icon="lucide:check" class="ai-apply-icon" />
          <span>点击应用</span> -->
        </div>
      </div>
    </div>

    <AInput
      v-else
      ref="inputRef"
      v-model:value="inputValue"
      size="large"
      placeholder="输入指令，按 Enter 发送..."
      :disabled="loading"
      @keydown="handleKeydown"
    />
  </div>
</template>

<script setup lang="ts">
import type { SelectionRange } from '../types';
import type { Editor } from '@tiptap/vue-3';
import type { CSSProperties } from 'vue';
import { computed, nextTick, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { TextSelection } from '@tiptap/pm/state';
import { onClickOutside, useEventListener } from '@vueuse/core';
import { message } from 'ant-design-vue';
import { useAgent } from '@/hooks/useAgent';
import type { ServiceModelUpdatedDetail } from '@/shared/storage/service-models/events';
import { SERVICE_MODEL_UPDATED_EVENT } from '@/shared/storage/service-models/events';
import type { AvailableServiceModelConfig } from '@/stores/service-model';
import { useServiceModelStore } from '@/stores/service-model';

interface Props {
  editor?: Editor | null;
  selectionRange?: SelectionRange;
}

const props = withDefaults(defineProps<Props>(), {
  editor: null,
  selectionRange: () => ({ from: 0, to: 0, text: '' })
});

const visible = defineModel<boolean>('visible', { default: false });

const inputValue = ref('');
const previewText = ref('');
const loading = ref(false);
const inputRef = ref<{ focus: (options?: FocusOptions) => void } | null>(null);
const wrapperRef = ref<HTMLElement | null>(null);
const wrapperStyle = ref<CSSProperties>({});
const modelConfig = ref<AvailableServiceModelConfig | null>(null);
const serviceModelStore = useServiceModelStore();

const providerId = computed(() => modelConfig.value?.providerId ?? '');

const { agent } = useAgent({
  providerId,
  onChunk(chunk) {
    previewText.value += chunk;
  },
  onComplete() {
    loading.value = false;
  },
  onError(error) {
    loading.value = false;
    message.error(error.message);
  }
});

// ---- Model Config ----

async function loadModelConfig(): Promise<void> {
  modelConfig.value = await serviceModelStore.getAvailableServiceConfig('polish');
}

function handleServiceModelUpdated(event: Event): void {
  const { detail } = event as CustomEvent<ServiceModelUpdatedDetail>;
  if (detail.serviceType !== 'polish') return;
  loadModelConfig();
}

useEventListener(window, SERVICE_MODEL_UPDATED_EVENT, handleServiceModelUpdated);

loadModelConfig();

// ---- Scroll ----

function scrollToCenterIfObscured(): void {
  if (!wrapperRef.value) return;

  const rect = wrapperRef.value.getBoundingClientRect();
  const viewportHeight = window.innerHeight;

  // 如果悬浮框在可视区域内，不需要滚动
  if (rect.bottom <= viewportHeight - 400) return;

  // 退化到 window 或原生 Element 的 scrollIntoView
  wrapperRef.value.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---- Position ----

function updatePosition(): void {
  if (!props.editor) return;

  const { from, to } = props.selectionRange!;
  if (from === to) return;

  const editorDom = props.editor.view.dom as HTMLElement;
  const editorRect = editorDom.getBoundingClientRect();
  const end = props.editor.view.coordsAtPos(to);
  const lineHeight = end.bottom - end.top;
  const top = end.top - editorRect.top + editorDom.offsetTop;

  wrapperStyle.value = { top: `${top + lineHeight + 6}px` };

  nextTick(scrollToCenterIfObscured);
}

// ---- Selection ----

function restoreSelection(): void {
  if (!props.editor) return;

  const { from, to } = props.selectionRange!;
  if (from === to) return;

  const { state, view } = props.editor;
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
}

// ---- AI Submit ----

function buildPrompt(selectedText: string, userInput: string): string {
  const template = modelConfig.value?.customPrompt ?? '';
  return template.replace(/\{\{SELECTED_TEXT\}\}/g, selectedText).replace(/\{\{USER_INPUT\}\}/g, userInput);
}

function reset(): void {
  inputValue.value = '';
  previewText.value = '';
  loading.value = false;
}

function close(): void {
  reset();
  visible.value = false;
  props.editor?.commands.focus();
}

async function handleSubmit(): Promise<void> {
  const value = inputValue.value.trim();
  if (!value || !props.editor || loading.value) return;

  const config = modelConfig.value;
  if (!config?.providerId || !config?.modelId) {
    message.warning('未找到可用的模型配置');
    return;
  }

  const { from, to, text } = props.selectionRange!;
  if (from === to) return;

  const selectedText = text || props.editor.state.doc.textBetween(from, to, '');

  const prompt = buildPrompt(selectedText, value);

  loading.value = true;
  agent.stream({ modelId: config.modelId, prompt });
}

function handleApply(): void {
  if (!props.editor || !previewText.value) return;

  const { from, to } = props.selectionRange!;
  restoreSelection();
  props.editor.chain().focus().insertContentAt({ from, to }, previewText.value).run();

  close();
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault();
    handleSubmit();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  }
}

// ---- Lifecycle ----

onClickOutside(wrapperRef, () => {
  if (!loading.value) close();
});

watch(visible, (newValue) => {
  if (newValue) {
    loadModelConfig();
    nextTick(updatePosition);
    nextTick(() => inputRef.value?.focus({ preventScroll: true }));
  } else {
    reset();
  }
});
</script>

<style lang="less" scoped>
.ai-input-wrapper {
  position: absolute;
  left: 50px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: calc(100% - 100px);
}

// ---- 预览确认区 ----
.ai-preview {
  cursor: pointer;
  background: var(--bg-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  transition: border-color 0.2s;

  &:hover {
    border-color: var(--border-primary);
  }
}

.ai-preview-text {
  padding: 9px 12px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.ai-preview-hint {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-tertiary);
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-tertiary);
  border-radius: 0 0 8px 8px;
}

.ai-loading-icon,
.ai-apply-icon {
  flex-shrink: 0;
  font-size: 12px;
}
</style>
