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
      <section class="editor-settings__section">
        <div class="editor-settings__section-title">视图</div>

        <div class="editor-settings__item">
          <div class="editor-settings__meta">
            <div class="editor-settings__label">默认视图模式</div>
          </div>
          <BSelect :value="store.viewMode" :options="viewModeOptions" @update:value="store.setViewMode" />
        </div>

        <div class="editor-settings__item">
          <div class="editor-settings__meta">
            <div class="editor-settings__label">页面宽度</div>
          </div>
          <BSelect :value="store.pageWidth" :options="pageWidthOptions" @update:value="store.setPageWidth" />
        </div>

        <div class="editor-settings__item">
          <div class="editor-settings__meta">
            <div class="editor-settings__label">显示大纲</div>
          </div>
          <ASwitch :checked="store.showOutline" @update:checked="store.setShowOutline" />
        </div>
      </section>

      <section class="editor-settings__section">
        <div class="editor-settings__section-title">保存</div>

        <div class="editor-settings__item">
          <div class="editor-settings__meta">
            <div class="editor-settings__label">保存策略</div>
            <div class="editor-settings__desc">
              未保存到磁盘的文档仍只会保存到应用草稿。自动保存策略仅对已有磁盘路径的文档生效。
            </div>
          </div>
          <BSelect :value="store.saveStrategy" :options="saveStrategyOptions" @update:value="store.setSaveStrategy" />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file index.vue
 * @description 编辑器设置页脚本，负责定义设置选项并将交互写回编辑器偏好 Store。
 */
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
</script>

<style scoped lang="less">
.editor-settings {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
  border-radius: 8px;
}

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

.editor-settings__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 820px;
  padding: 20px;
  margin: 0 auto;
  overflow: auto;
}

.editor-settings__section {
  display: flex;
  flex-direction: column;
  padding: 16px 18px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
}

.editor-settings__section-title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.editor-settings__item {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
}

.editor-settings__item + .editor-settings__item {
  border-top: 1px solid var(--border-secondary);
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
}

.editor-settings__desc {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

@media (width <= 720px) {
  .editor-settings__item {
    flex-direction: column;
    align-items: flex-start;
  }

  .editor-settings__item :deep(.b-select) {
    width: 100%;
  }
}
</style>
