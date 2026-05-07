<!--
  @file CompressionButton.vue
  @description 压缩按钮组件，使用环形占比展示当前上下文预算，并在 hover 时显示详情信息。
-->
<template>
  <div class="compression-button" :class="{ disabled: props.disabled, compressing: props.compressing }">
    <!-- 环形加载动画 -->
    <div class="ring-loader">
      <svg viewBox="0 0 36 36" class="circular-chart">
        <!-- 背景圆环 -->
        <circle class="ring-bg" cx="18" cy="18" r="14" fill="none" stroke-width="3"></circle>
        <!-- 进度圆环 -->
        <circle
          class="ring-progress"
          cx="18"
          cy="18"
          r="14"
          fill="none"
          stroke-width="3"
          :stroke-dasharray="ringDasharray"
          :stroke-dashoffset="ringDashoffset"
        ></circle>
      </svg>
      <!-- 中心图标 -->
      <div class="center-icon">
        <Icon v-if="props.compressing" icon="lucide:loader-2" class="spin-icon" />
        <Icon v-else icon="lucide:chevrons-down" />
      </div>
    </div>

    <!-- 百分比显示 -->
    <div v-if="!props.compressing" class="percentage-text">
      {{ percentageText }}
    </div>

    <!-- Hover 详情弹窗 -->
    <div v-if="hovering" class="detail-popup">
      <div class="popup-content">
        <div class="popup-header">上下文预算</div>
        <div class="popup-body">
          <div class="info-row">
            <span class="label">当前使用:</span>
            <span class="value">{{ currentUsageText }}</span>
          </div>
          <div class="info-row">
            <span class="label">阈值:</span>
            <span class="value">{{ thresholdText }}</span>
          </div>
          <div v-if="props.currentSummary" class="info-row">
            <span class="label">上次摘要:</span>
            <span class="value">{{ formatTime(props.currentSummary.createdAt) }}</span>
          </div>
        </div>
        <div v-if="props.error" class="popup-error">{{ props.error }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CompressionBudgetInfo, ConversationSummaryRecord } from '../utils/compression/types';
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import dayjs from 'dayjs';

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
  /** 当前预算信息 */
  budget?: CompressionBudgetInfo;
  /** 错误信息 */
  error?: string;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  compressing: false,
  currentSummary: undefined,
  budget: undefined,
  error: undefined
});

const emit = defineEmits<{
  (e: 'compress'): void;
}>();

/** 摘要模态框可见性 */
const summaryModalVisible = ref(false);

/** hover 状态 */
const hovering = ref(false);

/**
 * 将数字格式化为千分位字符串。
 * @param value - 原始数值
 * @returns 格式化后的文本
 */
function formatCount(value: number | undefined): string {
  return new Intl.NumberFormat('zh-CN').format(value ?? 0);
}

/**
 * 环形进度百分比。
 */
const ringPercentage = computed<number>(() => {
  return Math.max(0, Math.min(100, props.budget?.percentage ?? 0));
});

/**
 * 当前预算单位标签。
 */
const budgetUnitLabel = computed<string>(() => {
  return props.budget?.unit === 'token' ? 'Token' : '字符';
});

/**
 * 当前使用量文案。
 */
const currentUsageText = computed<string>(() => {
  if (!props.budget) {
    return '暂无预算信息';
  }

  return `${formatCount(props.budget.currentValue)} / ${formatCount(props.budget.thresholdValue)}`;
});

/**
 * 阈值文案。
 */
const thresholdText = computed<string>(() => {
  if (!props.budget) {
    return '--';
  }

  return `${formatCount(props.budget.thresholdValue)} ${budgetUnitLabel.value}`;
});

/**
 * 当前占比文案。
 */
const percentageText = computed<string>(() => {
  return `${Math.round(ringPercentage.value)}%`;
});

/**
 * 圆环周长。
 */
const CIRCUMFERENCE = 2 * Math.PI * 14; // r=14

/**
 * 环形进度 stroke-dasharray。
 */
const ringDasharray = computed<string>(() => {
  return `${CIRCUMFERENCE}`;
});

/**
 * 环形进度 stroke-dashoffset。
 */
const ringDashoffset = computed<string>(() => {
  const offset = CIRCUMFERENCE - (ringPercentage.value / 100) * CIRCUMFERENCE;
  return `${offset}`;
});

/**
 * 格式化时间戳为相对时间或绝对时间。
 * @param timestamp - 时间戳（字符串或数字）
 * @returns 格式化后的时间文本
 */
function formatTime(timestamp: string | number | undefined): string {
  if (!timestamp) {
    return '--';
  }
  return dayjs(timestamp).format('MM-DD HH:mm');
}

/**
 * 摘要状态文案。
 */
const summaryStatusText = computed<string>(() => {
  return props.currentSummary ? '已存在摘要' : '尚未压缩';
});

/**
 * 最近压缩信息文案。
 */
const summaryMetaText = computed<string>(() => {
  if (!props.budget?.hasSummary || !props.currentSummary) {
    return '暂无';
  }

  const roundText = props.budget.summaryMessageCount ? `${props.budget.summaryMessageCount} 轮` : '已压缩';
  const timeText = props.budget.summaryUpdatedAt ? dayjs(props.budget.summaryUpdatedAt).format('MM-DD HH:mm') : '';
  return timeText ? `${roundText} · ${timeText}` : roundText;
});

/**
 * token 精度文案。
 */
const tokenAccuracyText = computed<string>(() => {
  if (props.budget?.tokenAccuracy === 'native_like') {
    return '接近原生 tokenizer';
  }
  if (props.budget?.tokenAccuracy === 'approximate') {
    return '近似估算';
  }
  if (props.budget?.tokenAccuracy === 'char_fallback') {
    return '字符级降级';
  }
  return '未知';
});

/**
 * 处理压缩操作。
 */
function handleCompress(): void {
  emit('compress');
}
</script>

<style scoped lang="less">
.compression-button {
  position: relative;
  display: inline-flex;
  align-items: center;

  &.is-disabled {
    opacity: 0.45;
  }
}

.compression-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 999px;
  transition: transform 0.2s ease, background-color 0.2s ease;

  &:hover:not(:disabled) {
    background: var(--hover-bg-color);
    transform: translateY(-1px);
  }

  &:disabled {
    cursor: not-allowed;
  }

  &__icon {
    position: absolute;
    color: var(--text-color-secondary);
  }
}

.compression-ring {
  width: 30px;
  height: 30px;
  transform: rotate(-90deg);

  &__track,
  &__progress {
    fill: none;
    stroke-width: 2.4;
    stroke-linecap: round;
  }

  &__track {
    opacity: 0.55;
    stroke: var(--border-color);
  }

  &__progress {
    stroke: var(--color-primary, #1677ff);
    transition: stroke-dasharray 0.2s ease, stroke 0.2s ease;

    &.is-warning {
      stroke: #faad14;
    }

    &.is-danger {
      stroke: #ff4d4f;
    }
  }
}

.compression-hover-card {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  z-index: 20;
  width: 240px;
  padding: 12px;
  color: var(--text-color);
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 10px 28px rgb(15 23 42 / 16%);
  transform: translateX(-50%);

  &__header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
  }

  &__badge {
    padding: 2px 6px;
    font-size: 11px;
    color: var(--text-color-secondary);
    background: var(--hover-bg-color);
    border-radius: 999px;
  }

  &__primary {
    padding: 10px;
    margin-bottom: 10px;
    background: var(--hover-bg-color);
    border-radius: 8px;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 12px;
  }

  &__item,
  &__primary {
    min-width: 0;
  }

  &__label {
    margin-bottom: 4px;
    font-size: 11px;
    color: var(--text-color-secondary);
  }

  &__value {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  &__footnote {
    margin-top: 10px;
    font-size: 11px;
    color: var(--text-color-secondary);
  }

  &__error {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    margin-top: 10px;
    font-size: 12px;
    color: var(--error-color);
  }
}

.compression-hover-fade-enter-active,
.compression-hover-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.compression-hover-fade-enter-from,
.compression-hover-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(4px);
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

/* 新环形加载器样式 */
.ring-loader {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

.circular-chart {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-bg {
  opacity: 0.4;
  stroke: var(--border-color, #e5e7eb);
}

.ring-progress {
  stroke: var(--color-primary, #1677ff);
  stroke-linecap: round;
  transition: stroke-dashoffset 0.3s ease, stroke 0.3s ease;

  &.is-warning {
    stroke: #faad14;
  }

  &.is-danger {
    stroke: #ff4d4f;
  }
}

.center-icon {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--text-color-secondary);
}

.spin-icon {
  animation: spin 1s linear infinite;
}

.percentage-text {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.detail-popup {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  z-index: 100;
  transform: translateX(-50%);
}

.popup-content {
  width: 220px;
  padding: 12px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 10px 28px rgb(15 23 42 / 16%);
}

.popup-header {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.popup-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;

  .label {
    color: var(--text-color-secondary);
  }

  .value {
    color: var(--text-color);
  }
}

.popup-error {
  padding: 6px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--error-color, #ff4d4f);
  background: rgb(255 77 79 / 8%);
  border-radius: 4px;
}
</style>
