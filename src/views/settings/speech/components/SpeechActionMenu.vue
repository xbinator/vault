<!--
  @file SpeechActionMenu.vue
  @description 智能语音操作组件，根据状态自动切换显示下载按钮或更多菜单
-->
<template>
  <div class="speech-action-menu">
    <!-- 未安装状态：显示下载按钮 -->
    <button
      v-if="status === 'missing'"
      class="speech-action-menu__btn speech-action-menu__btn--primary"
      :disabled="installing"
      title="下载语音组件"
      @click="handleDownload"
    >
      <Icon v-if="installing" icon="lucide:loader-2" class="speech-action-menu__icon--spin" />
      <Icon v-else icon="lucide:download" />
    </button>

    <!-- 安装失败状态：显示重试按钮 -->
    <button
      v-else-if="status === 'failed'"
      class="speech-action-menu__btn speech-action-menu__btn--danger"
      :disabled="installing"
      title="重试安装"
      @click="handleDownload"
    >
      <Icon v-if="installing" icon="lucide:loader-2" class="speech-action-menu__icon--spin" />
      <Icon v-else icon="lucide:refresh-cw" />
    </button>

    <!-- 安装中状态：显示加载按钮 -->
    <button v-else-if="status === 'installing' || installing" class="speech-action-menu__btn speech-action-menu__btn--loading" disabled title="安装中...">
      <Icon icon="lucide:loader-2" class="speech-action-menu__icon--spin" />
    </button>

    <!-- 已安装状态：显示更多菜单 -->
    <BDropdown v-else-if="status === 'ready'" placement="bottomRight">
      <button class="speech-action-menu__btn" title="更多操作">
        <Icon icon="lucide:more-vertical" />
      </button>

      <template #overlay>
        <BDropdownMenu :options="dropdownOptions" :width="140" />
      </template>
    </BDropdown>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import BDropdown from '@/components/BDropdown/index.vue';
import BDropdownMenu from '@/components/BDropdown/Menu.vue';
import type { DropdownOption } from '@/components/BDropdown/type';

// ─── Props & Emits ─────────────────────────────────────────────────────────────

interface Props {
  /** 当前状态 */
  status?: 'ready' | 'missing' | 'installing' | 'failed';
  /** 安装中状态 */
  installing?: boolean;
}

interface Emits {
  (e: 'install'): void;
  (e: 'refresh'): void;
  (e: 'remove'): void;
}

const props = withDefaults(defineProps<Props>(), {
  status: 'missing',
  installing: false
});

const emit = defineEmits<Emits>();

// ─── 操作处理 ──────────────────────────────────────────────────────────────────

/**
 * 处理下载按钮点击
 */
function handleDownload(): void {
  emit('install');
}

/**
 * 处理刷新菜单项点击
 */
function handleRefresh(): void {
  emit('refresh');
}

/**
 * 处理删除菜单项点击
 */
function handleRemove(): void {
  emit('remove');
}

// ─── 计算属性 ──────────────────────────────────────────────────────────────────

/**
 * 下拉菜单选项
 */
const dropdownOptions = computed<DropdownOption[]>(() => [
  {
    type: 'item',
    value: 'reinstall',
    label: '重新安装',
    icon: 'lucide:refresh-cw',
    disabled: props.installing,
    onClick: handleDownload
  },
  {
    type: 'divider'
  },
  {
    type: 'item',
    value: 'refresh',
    label: '刷新状态',
    icon: 'lucide:refresh-cw',
    disabled: props.installing,
    onClick: handleRefresh
  },
  {
    type: 'divider'
  },
  {
    type: 'item',
    value: 'remove',
    label: '删除',
    icon: 'lucide:trash-2',
    danger: true,
    disabled: props.installing,
    onClick: handleRemove
  }
]);
</script>

<style scoped lang="less">
.speech-action-menu {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}

.speech-action-menu__btn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: 999px;
  transition: all 0.2s ease;

  &:active:not(:disabled) {
    transform: scale(0.95);
  }

  &:disabled {
    color: var(--text-tertiary);
    cursor: not-allowed;
    opacity: 0.6;
  }

  &:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--bg-active);
    border-color: var(--border-secondary);
  }

  &--primary {
    color: var(--color-primary);
    background: var(--color-primary-bg);
    border-color: var(--color-primary-border);

    &:hover:not(:disabled) {
      color: var(--color-primary);
      background: var(--color-primary-bg);
      border-color: var(--color-primary);
    }
  }

  &--danger {
    color: var(--color-error);
    background: var(--color-error-bg);
    border-color: var(--color-error);

    &:hover:not(:disabled) {
      color: var(--color-error);
      background: var(--color-error-bg);
      border-color: var(--color-error);
    }
  }

  &--loading {
    color: var(--color-primary);
    background: var(--color-primary-bg);
    border-color: var(--color-primary-border);
  }
}

.speech-action-menu__icon--spin {
  animation: speech-action-menu-spin 1s linear infinite;
}

@keyframes speech-action-menu-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
