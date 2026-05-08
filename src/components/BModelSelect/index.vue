<!--
  @file index.vue
  @description 模型选择器组件，以模态对话框形式展示可用模型列表。
-->
<template>
  <BModal v-model:open="open" title="选择模型" width="480px">
    <!-- 搜索框 -->
    <div class="model-search">
      <input v-model="searchQuery" placeholder="搜索模型..." class="model-search__input" />
    </div>

    <!-- 模型列表 -->
    <BScrollbar max-height="400px">
      <div class="model-list">
        <div v-for="group in filteredGroups" :key="group.providerId" class="model-group">
          <div class="model-group__header">{{ group.providerName }}</div>
          <div
            v-for="item in group.models"
            :key="item.value"
            class="model-item"
            :class="{ 'is-active': item.value === internalModel }"
            @click="handleModelSelect(item)"
          >
            <BModelIcon :model="item.modelId" :size="20" />
            <div class="model-item__info">
              <div class="model-item__name">{{ item.modelName }}</div>
            </div>
            <Icon v-if="item.value === internalModel" icon="lucide:check" width="16" height="16" />
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!filteredGroups.length" class="model-empty">暂无可用模型</div>
    </BScrollbar>
  </BModal>
</template>

<script setup lang="ts">
import type { BModelSelectExpose, BModelSelectProps, ModelGroup, ModelItem, ParsedModel, SelectedModel } from './types';
import { computed, onMounted, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import BModal from '@/components/BModal/index.vue';
import BModelIcon from '@/components/BModelIcon/index.vue';
import BScrollbar from '@/components/BScrollbar/index.vue';
import { useProviderStore } from '@/stores/provider';

/** 模型值解析正则表达式。 */
const MODEL_VALUE_RE = /^([^:]+):(.+)$/;

/**
 * 解析模型值字符串。
 * @param value - 模型值（格式：providerId:modelId）
 * @returns 解析后的模型标识，格式错误时返回 null
 */
function parseModelValue(value: string): ParsedModel | null {
  const match = value.match(MODEL_VALUE_RE);
  if (!match) return null;
  return { providerId: match[1], modelId: match[2] };
}

/** 组件属性。 */
const props = withDefaults(defineProps<BModelSelectProps>(), {
  disabled: false
});

/** 控制对话框显示隐藏。 */
const open = defineModel<boolean>('open', { default: false });

/** 当前选中的模型。 */
const selectedModel = defineModel<SelectedModel | undefined>('model', {
  default: undefined
});

/** 搜索关键词。 */
const searchQuery = ref<string>('');

/** 内部选中的模型值（格式：providerId:modelId）。 */
const internalModel = ref<string>();

/** 提供商数据源。 */
const providerStore = useProviderStore();
const providers = computed(() => providerStore.providers);

/**
 * 按提供商分组的模型列表。
 */
const groupedModels = computed<ModelGroup[]>(() => {
  const result: ModelGroup[] = [];

  for (const provider of providers.value) {
    if (!provider.isEnabled || !provider.models?.length) continue;

    const models = provider.models
      .filter((m) => m.isEnabled)
      .map((m) => ({
        value: `${provider.id}:${m.id}`,
        modelId: m.id,
        modelName: m.name
      }));

    if (!models.length) continue;

    result.push({
      providerId: provider.id,
      providerName: provider.name,
      models
    });
  }

  return result;
});

/**
 * 根据搜索关键词过滤后的模型分组。
 */
const filteredGroups = computed<ModelGroup[]>(() => {
  if (!searchQuery.value.trim()) {
    return groupedModels.value;
  }

  const query = searchQuery.value.toLowerCase();

  return groupedModels.value
    .map((group) => ({
      ...group,
      models: group.models.filter((model) => model.modelName.toLowerCase().includes(query))
    }))
    .filter((group) => group.models.length > 0);
});

/**
 * 处理模型选择。
 * @param item - 选中的模型项
 */
function handleModelSelect(item: ModelItem): void {
  const parsed = parseModelValue(item.value);
  if (parsed) {
    selectedModel.value = parsed;
  }
  open.value = false;
}

/**
 * 同步外部传入的 model 值到内部状态。
 */
watch(
  () => selectedModel.value,
  (value) => {
    internalModel.value = value ? `${value.providerId}:${value.modelId}` : undefined;
  },
  { immediate: true }
);

/**
 * 组件挂载时加载提供商数据。
 */
onMounted(async () => {
  await providerStore.loadProviders();
});

/**
 * 暴露给父组件的程序化打开入口。
 */
defineExpose<BModelSelectExpose>({
  open: (): void => {
    open.value = true;
  }
});
</script>

<style scoped lang="less">
.model-search {
  margin-bottom: 16px;
}

.model-search__input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  font-size: 13px;
  outline: none;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: border-color 0.2s;
}

.model-search__input:focus {
  border-color: var(--primary-color);
}

.model-search__input::placeholder {
  color: var(--text-placeholder);
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.model-group__header {
  padding: 8px 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.model-item {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  cursor: pointer;
  border-radius: 8px;
  transition: background-color 0.2s;
}

.model-item:hover {
  background: var(--bg-hover);
}

.model-item.is-active {
  background: var(--bg-active);
}

.model-item__info {
  flex: 1;
  min-width: 0;
}

.model-item__name {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}

.model-empty {
  padding: 40px 0;
  font-size: 14px;
  color: var(--text-secondary);
  text-align: center;
}
</style>
