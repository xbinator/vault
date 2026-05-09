<!--
  @file ToastItem.vue
  @description 单个 Toast 提示组件，支持多种类型和自动关闭
-->
<template>
  <div :class="['toast-item', `toast-item--${type}`]" @click="handleClose">
    <div class="toast-item__icon">
      <Icon :icon="iconName" width="16" height="16" />
    </div>
    <div class="toast-item__content">{{ content }}</div>
    <button class="toast-item__close" @click.stop="handleClose">
      <Icon icon="lucide:x" width="14" height="14" />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ToastType } from './types';
import { computed, onMounted, onUnmounted } from 'vue';
import { Icon } from '@iconify/vue';

/**
 * ToastItem 属性
 */
interface Props {
  /** Toast 唯一标识 */
  id: string;
  /** Toast 类型 */
  type: ToastType;
  /** Toast 内容 */
  content: string;
  /** 持续时间（毫秒） */
  duration: number;
}

const props = withDefaults(defineProps<Props>(), {
  duration: 3000
});

const emit = defineEmits<{
  (e: 'close', id: string): void;
}>();

/** 自动关闭定时器 */
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * 清除自动关闭定时器
 */
function clearTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/**
 * 处理关闭事件
 */
function handleClose(): void {
  clearTimer();
  emit('close', props.id);
}

/**
 * 启动自动关闭定时器
 */
function startTimer(): void {
  if (props.duration > 0) {
    timer = setTimeout(() => {
      handleClose();
    }, props.duration);
  }
}

/**
 * 根据类型返回对应的图标名称
 */
const iconName = computed<string>(() => {
  const iconMap: Record<ToastType, string> = {
    error: 'lucide:circle-x',
    warning: 'lucide:alert-triangle',
    info: 'lucide:info',
    success: 'lucide:circle-check'
  };
  return iconMap[props.type];
});

onMounted(() => {
  startTimer();
});

onUnmounted(() => {
  clearTimer();
});
</script>

<style scoped lang="less">
.toast-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 4px 12px rgb(0 0 0 / 20%);
  }

  &--error {
    background-color: #fee2e2;
    border-left: 3px solid #ef4444;
  }

  &--warning {
    background-color: #fef3c7;
    border-left: 3px solid #f59e0b;
  }

  &--info {
    background-color: #dbeafe;
    border-left: 3px solid #3b82f6;
  }

  &--success {
    background-color: #d1fae5;
    border-left: 3px solid #10b981;
  }
}

.toast-item__icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.toast-item__content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toast-item__close {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: var(--text-secondary);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  opacity: 0.6;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
  }
}
</style>
