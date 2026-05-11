<!--
  @file index.vue
  @description 编辑器设置页，负责管理视图偏好与真实写盘保存策略。
-->
<template>
  <div class="editor-settings">
    <div class="editor-settings__header">
      <div class="editor-settings__title">编辑器</div>
    </div>

    <div class="editor-settings__body">
      <BSettingsSection title="视图">
        <div class="editor-settings__item">
          <div class="editor-settings__meta">
            <div class="editor-settings__label">默认视图模式</div>
          </div>
          <div>
            <BSelect :value="store.viewMode" :options="viewModeOptions" :width="200" @change="handleViewModeChange" />
          </div>
        </div>

        <div class="editor-settings__item">
          <div class="editor-settings__meta">
            <div class="editor-settings__label">页面宽度</div>
          </div>
          <div>
            <BSelect :value="store.pageWidth" :options="pageWidthOptions" :width="200" @change="handlePageWidthChange" />
          </div>
        </div>

        <div class="editor-settings__item">
          <div class="editor-settings__meta">
            <div class="editor-settings__label">显示大纲</div>
          </div>
          <div>
            <ASwitch :checked="store.showOutline" @change="handleShowOutlineChange" />
          </div>
        </div>
      </BSettingsSection>

      <BSettingsSection title="保存">
        <div class="editor-settings__item">
          <div class="editor-settings__meta">
            <div class="editor-settings__label">保存策略</div>
          </div>
          <div>
            <BSelect :value="store.saveStrategy" :options="saveStrategyOptions" :width="200" @change="handleSaveStrategyChange" />
          </div>
        </div>
      </BSettingsSection>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EditorViewMode, EditorPageWidth, EditorSaveStrategy } from '@/stores/editorPreferences';
import { useEditorPreferencesStore } from '@/stores/editorPreferences';

/**
 * 通用下拉选项。
 */
interface SelectOption {
  /** 选项值 */
  value: string;
  /** 选项标签 */
  label: string;
}

const store = useEditorPreferencesStore();

/**
 * 默认视图模式选项。
 */
const viewModeOptions: SelectOption[] = [
  { value: 'rich', label: '富文本' },
  { value: 'source', label: '源码' }
];

/**
 * 页宽模式选项。
 */
const pageWidthOptions: SelectOption[] = [
  { value: 'default', label: '默认' },
  { value: 'wide', label: '宽版' },
  { value: 'full', label: '全宽' }
];

/**
 * 保存策略选项。
 */
const saveStrategyOptions: SelectOption[] = [
  { value: 'manual', label: '主动保存' },
  { value: 'onBlur', label: '失去焦点保存' },
  { value: 'onChange', label: '更新即保存' }
];

function handleViewModeChange(value: string | number) {
  store.setViewMode(value as EditorViewMode);
}

function handlePageWidthChange(value: string | number) {
  store.setPageWidth(value as EditorPageWidth);
}

function handleShowOutlineChange(value: boolean | string | number) {
  store.setShowOutline(value as boolean);
}

function handleSaveStrategyChange(value: string | number) {
  store.setSaveStrategy(value as EditorSaveStrategy);
}
</script>

<style scoped lang="less">
// ─── Root container ───────────────────────────────────────────────────────────

.editor-settings {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
  border-radius: 8px;
}

// ─── Header ───────────────────────────────────────────────────────────────────

.editor-settings__header {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
  align-items: center;
  height: 52px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-primary);
}

.editor-settings__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

// ─── Body ─────────────────────────────────────────────────────────────────────

.editor-settings__body {
  padding: 20px;
  overflow: auto;
}

// ─── Item ─────────────────────────────────────────────────────────────────────
.editor-settings__item {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  padding: 0 16px;
  transition: background 0.2s ease;

  & + & {
    border-top: 1px solid var(--border-tertiary);
  }

  &:hover {
    background: var(--bg-hover);
  }

  &:focus-within {
    background: var(--bg-hover);
  }
}

.editor-settings__meta {
  flex: 1;
  min-width: 0;
  padding: 12px 0;
}

.editor-settings__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  user-select: none;
}

// ─── Responsive ───────────────────────────────────────────────────────────────

@media (width <= 720px) {
  .editor-settings__item {
    flex-direction: column;
    align-items: flex-start;

    :deep(.b-select) {
      width: 100%;
    }
  }
}

// ─── Accessibility ────────────────────────────────────────────────────────────

@media (prefers-reduced-motion: reduce) {
  .editor-settings__item {
    transition: none;
  }
}
</style>
