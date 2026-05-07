<!--
  @file CompressionButton.vue
  @description 压缩按钮组件，提供手动压缩和查看摘要功能。
-->
<template>
  <BDropdown v-model:open="open" :align="{ offset: [-45, 0] }">
    <span class="compression-trigger" :class="{ 'is-disabled': disabled || compressing, 'has-summary': !!currentSummary }">
      <Icon v-if="compressing" icon="lucide:loader-2" width="16" height="16" class="is-spinning" />
      <Icon v-else icon="lucide:layers" width="16" height="16" />
      <span v-if="autoCompressedVisible" class="auto-compressed-label">已自动压缩</span>
    </span>

    <template #overlay>
      <div class="compression-menu" @click.stop>
        <div v-if="currentSummary" class="compression-menu__item" @click="handleRecompress">
          <Icon icon="lucide:refresh-cw" width="14" height="14" />
          <span>{{ compressing ? '压缩中...' : '重新压缩' }}</span>
        </div>
        <div v-else class="compression-menu__item" @click="handleCompress">
          <Icon icon="lucide:compress" width="14" height="14" />
          <span>{{ compressing ? '压缩中...' : '压缩上下文' }}</span>
        </div>

        <div v-if="currentSummary" class="compression-menu__item" @click="handleViewSummary">
          <Icon icon="lucide:file-text" width="14" height="14" />
          <span>查看摘要</span>
        </div>

        <div v-if="error" class="compression-menu__error">
          <Icon icon="lucide:alert-circle" width="14" height="14" />
          <span>{{ error }}</span>
        </div>

        <div v-if="currentSummary" class="compression-menu__info">
          <div class="compression-menu__info-label">已压缩</div>
          <div class="compression-menu__info-value">{{ currentSummary.messageCountSnapshot }} 轮对话</div>
        </div>
      </div>
    </template>
  </BDropdown>

  <SummaryModal v-model:open="summaryModalVisible" :summary="currentSummary" />
</template>

<script setup lang="ts">
import type { ConversationSummaryRecord } from '../utils/compression/types';
import { onUnmounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import BDropdown from '@/components/BDropdown/index.vue';
import { onCompressionEvent } from '../utils/compression/error';
import SummaryModal from './SummaryModal.vue';

/**
 * 组件 Props 定义
 */
interface Props {
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否正在压缩 */
  compressing?: boolean;
  /** 当前摘要 */
  currentSummary?: ConversationSummaryRecord;
  /** 错误信息 */
  error?: string;
}

withDefaults(defineProps<Props>(), {
  disabled: false,
  compressing: false,
  currentSummary: undefined,
  error: undefined
});

const emit = defineEmits<{
  (e: 'compress'): void;
}>();

const open = ref(false);

/** 摘要模态框可见性 */
const summaryModalVisible = ref(false);

/** 自动压缩标签可见性 */
const autoCompressedVisible = ref(false);
let autoCompressedTimer: ReturnType<typeof setTimeout> | null = null;

// 监听自动压缩事件
const unsubscribe = onCompressionEvent((event) => {
  if (event.type === 'auto_compressed') {
    autoCompressedVisible.value = true;
    if (autoCompressedTimer) clearTimeout(autoCompressedTimer);
    autoCompressedTimer = setTimeout(() => {
      autoCompressedVisible.value = false;
    }, 1500);
  }
});

onUnmounted(() => {
  unsubscribe();
  if (autoCompressedTimer) clearTimeout(autoCompressedTimer);
});

/**
 * 处理压缩操作
 */
function handleCompress(): void {
  open.value = false;
  emit('compress');
}

/**
 * 处理重新压缩操作
 */
function handleRecompress(): void {
  open.value = false;
  emit('compress');
}

/**
 * 处理查看摘要操作
 */
function handleViewSummary(): void {
  open.value = false;
  summaryModalVisible.value = true;
}
</script>

<style scoped lang="less">
.compression-trigger {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
  width: auto;
  min-width: 28px;
  height: 28px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;

  &:hover {
    background: var(--hover-bg-color);
  }

  &.is-disabled {
    pointer-events: none;
    cursor: not-allowed;
    opacity: 0.4;
  }

  &.has-summary {
    position: relative;

    &::after {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 6px;
      height: 6px;
      content: '';
      background: var(--success-color, #52c41a);
      border-radius: 50%;
    }
  }
}

.auto-compressed-label {
  font-size: 11px;
  color: var(--text-color-secondary);
  white-space: nowrap;
  animation: fade-in-out 1.5s ease-in-out;
}

@keyframes fade-in-out {
  0% {
    opacity: 0;
  }

  20% {
    opacity: 1;
  }

  80% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

.compression-menu {
  min-width: 180px;
  padding: 4px 0;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgb(0 0 0 / 15%);

  &__item {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 12px;
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
      background: var(--hover-bg-color);
    }

    span {
      font-size: 13px;
    }
  }

  &__error {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 12px;
    font-size: 12px;
    color: var(--error-color);

    span {
      flex: 1;
    }
  }

  &__info {
    padding: 8px 12px;
    margin-top: 4px;
    border-top: 1px solid var(--border-color);

    &-label {
      margin-bottom: 2px;
      font-size: 11px;
      color: var(--text-color-secondary);
    }

    &-value {
      font-size: 12px;
      color: var(--text-color);
    }
  }
}

.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
