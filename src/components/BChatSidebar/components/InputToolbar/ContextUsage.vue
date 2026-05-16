<!--
  @file ContextUsageIndicator.vue
  @description 上下文用量指示器，以环形图展示当前上下文 Token 使用比例，鼠标悬停显示详情。
-->
<template>
  <div class="context-usage">
    <BDropdown v-model:open="open" placement="topLeft">
      <div class="context-usage__trigger">
        <div class="context-usage__ring" :style="ringStyle">
          <span class="context-usage__percent">{{ usagePercent }}%</span>
        </div>
      </div>

      <template #overlay>
        <div class="context-usage__panel">
          <div class="context-usage__header">
            <span class="context-usage__title">上下文用量</span>
          </div>

          <div class="context-usage__body">
            <div class="context-usage__summary">
              <div class="context-usage__total">
                <div class="context-usage__total-value">{{ formatTokens(usedTokens) }}</div>
                <div class="context-usage__total-label">已使用</div>
              </div>

              <div class="context-usage__stats">
                <div class="context-usage__stat">
                  <span class="context-usage__label">窗口上限</span>
                  <span class="context-usage__value">{{ formatTokens(contextWindow) }}</span>
                </div>
                <div class="context-usage__stat">
                  <span class="context-usage__label">剩余可用</span>
                  <span class="context-usage__value">{{ formatTokens(remainingTokens) }}</span>
                </div>
              </div>
            </div>

            <div class="context-usage__progress">
              <div class="context-usage__progress-bar" :style="{ width: usagePercent + '%' }"></div>
            </div>
          </div>
        </div>
      </template>
    </BDropdown>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
/**
 * 上下文用量指示器属性。
 */
interface Props {
  /** 当前上下文已使用的 Token 数。 */
  usedTokens: number;
  /** 模型最大上下文窗口 Token 数。 */
  contextWindow: number;
}

const props = withDefaults(defineProps<Props>(), {
  usedTokens: 0,
  contextWindow: 200000
});

/** 下拉面板是否展开。 */
const open = ref(false);

/** 已使用百分比，最大 100。 */
const usagePercent = computed<number>(() => {
  console.log(props.usedTokens, props.contextWindow);
  if (props.contextWindow <= 0) return 0;

  return Math.min(100, Math.round((props.usedTokens / props.contextWindow) * 100));
});

/** 剩余可用 Token 数。 */
const remainingTokens = computed<number>(() => {
  return Math.max(0, props.contextWindow - props.usedTokens);
});

/** 环形图 CSS 变量样式，根据百分比动态设置渐变角度。 */
const ringStyle = computed(() => {
  const pct = usagePercent.value;
  const degrees = (pct / 100) * 360;
  return {
    '--ring-degrees': `${degrees}deg`
  };
});

/**
 * 格式化 Token 数量用于显示。
 * @param value - Token 数量。
 * @returns 格式化后的字符串。
 */
function formatTokens(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return `${value}`;
}
</script>

<style scoped>
.context-usage {
  position: relative;
}

.context-usage__trigger {
  padding: 0;
}

.context-usage__ring {
  position: relative;
  width: 24px;
  height: 24px;
  background: conic-gradient(
    var(--usage-context, #10b981) 0deg,
    var(--usage-context, #10b981) var(--ring-degrees, 0deg),
    var(--bg-disabled, #e5e7eb) var(--ring-degrees, 0deg),
    var(--bg-disabled, #e5e7eb) 360deg
  );
  border-radius: 50%;
}

.context-usage__ring::after {
  position: absolute;
  top: 3px;
  left: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  content: '';
  background: var(--bg-primary);
  border-radius: 50%;
}

.context-usage__percent {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  font-size: 7px;
  font-weight: 600;
  color: var(--text-secondary);
  transform: translate(-50%, -50%);
}

.context-usage__panel {
  min-width: 180px;
  padding: 8px 12px;
  background: var(--dropdown-bg);
  border: 1px solid var(--dropdown-border);
  border-radius: 6px;
  box-shadow: var(--shadow-md);
}

.context-usage__header {
  padding-bottom: 6px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-secondary);
}

.context-usage__title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
}

.context-usage__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.context-usage__summary {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.context-usage__total {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.context-usage__total-value {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.1;
  color: var(--text-primary);
}

.context-usage__total-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.context-usage__stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.context-usage__stat {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
}

.context-usage__label {
  font-size: 11px;
  color: var(--text-tertiary);
}

.context-usage__value {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

.context-usage__progress {
  height: 4px;
  overflow: hidden;
  background: var(--bg-disabled);
  border-radius: 2px;
}

.context-usage__progress-bar {
  height: 100%;
  background: var(--usage-context, #10b981);
  border-radius: 2px;
  transition: width 0.3s ease;
}
</style>
