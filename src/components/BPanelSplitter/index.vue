<template>
  <div :class="name">
    <div :class="[bem('section'), sectionClass]" :style="sectionStyle">
      <slot></slot>
    </div>

    <div :class="bem('line', { dragging: isDragging })" :style="splitterStyle" @mousedown="handleMouseDown">
      <div :class="bem('resizer')"></div>
      <div :class="bem('bar')"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BPanelSplitterProps as Props } from './types';
import { computed, reactive, ref } from 'vue';
import { clamp } from 'lodash-es';
import { createNamespace } from '@/utils/namespace';

defineOptions({ name: 'BPanelSplitter' });

const [name, bem] = createNamespace('panel-splitter');

const props = withDefaults(defineProps<Props>(), {
  position: 'left',
  minWidth: 200,
  maxWidth: 600,
  sectionClass: '',
  closeThreshold: 60
});

const size = defineModel<number>('size', { default: 300 });

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const isDragging = ref(false);

const state = reactive({
  startX: 0,
  startSize: 0
});

const isLeft = computed(() => props.position === 'left');

const sectionStyle = computed(() => ({
  width: `${size.value}px`
}));

const splitterStyle = computed(() => {
  if (isLeft.value) {
    return { left: 0, transform: 'translateX(-100%)' };
  }

  return { right: 0, transform: 'translateX(100%)' };
});

function getRawSize(e: MouseEvent) {
  const deltaX = e.clientX - state.startX;

  return state.startSize + (isLeft.value ? -deltaX : deltaX);
}

/**
 * 处理鼠标移动：
 *
 * rawSize 表示本次拖拽中的“理论宽度”。
 *
 * - rawSize > minWidth：正常调整宽度
 * - minWidth >= rawSize > minWidth - closeThreshold：宽度保持 minWidth
 * - rawSize <= minWidth - closeThreshold：关闭，size 设置为 0
 *
 * 关闭后，如果鼠标仍然按住并往打开方向拖动，
 * 只要 rawSize 再次大于 minWidth - closeThreshold，
 * 面板就会恢复到 minWidth。
 */
function handleMouseMove(e: MouseEvent) {
  const rawSize = getRawSize(e);
  const closeLine = props.minWidth - props.closeThreshold;

  if (rawSize <= closeLine) {
    size.value = 0;
    return;
  }

  size.value = clamp(rawSize, props.minWidth, props.maxWidth);
}

/**
 * 处理鼠标松开：清理拖拽状态。
 */
function handleMouseUp() {
  isDragging.value = false;

  document.body.classList.remove('cursor-col-resize');
  document.body.style.userSelect = '';

  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);

  if (size.value === 0) {
    emit('close');
  }
}

function handleMouseDown(e: MouseEvent) {
  e.preventDefault();

  isDragging.value = true;
  state.startX = e.clientX;
  state.startSize = size.value;

  document.body.classList.add('cursor-col-resize');
  document.body.style.userSelect = 'none';

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
}
</script>

<style lang="less">
.b-panel-splitter {
  position: relative;
  height: 100%;
}

.b-panel-splitter__section {
  height: 100%;
  transition: background 0.2s ease;
}

.b-panel-splitter__line {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 10;
  width: 6px;
  padding: 0 2px;
  cursor: col-resize;
}

.b-panel-splitter__line:hover,
.b-panel-splitter__line--dragging {
  .b-panel-splitter__resizer {
    background: var(--scrollbar-bg);
  }

  .b-panel-splitter__bar {
    display: none;
  }
}

.b-panel-splitter__resizer {
  height: 100%;
  transition: all 0.2s ease;
}

.b-panel-splitter__bar {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2px;
  height: 40px;
  background-color: var(--border-secondary);
  border-radius: 2px;
  transform: translate(-50%, -50%);
}
</style>
