<template>
  <NodeViewWrapper class="b-editor-table">
    <div ref="viewportRef" class="b-editor-table__viewport" @mouseleave="handleViewportMouseLeave">
      <div ref="scrollerRef" class="b-editor-table__scroller" @mousemove="handleMouseMove" @mouseleave="handleScrollerMouseLeave" @scroll="handleScroll">
        <NodeViewContent as="table" class="b-editor-table__table" />
      </div>

      <!-- 分割线 + 新增按钮 -->
      <div v-show="showDividerOverlay" class="b-editor-table__line-overlay" contenteditable="false">
        <div class="b-editor-table__line-highlight" :style="lineHighlightStyle"></div>
        <button
          type="button"
          class="b-editor-table__add-button"
          :class="addButtonVariantClass"
          :style="addButtonStyle"
          :title="addButtonLabel"
          :aria-label="addButtonLabel"
          @mousedown.prevent
          @click="handleAdd"
        >
          <Icon class="b-editor-table__button-icon" :icon="ICONS.add" />
        </button>
      </div>

      <!-- 区段 + 删除按钮 -->
      <div v-show="showSegmentOverlay" class="b-editor-table__segment-overlay" contenteditable="false">
        <div v-show="showRemoveRowButton" class="b-editor-table__segment-button-group b-editor-table__segment-button-group--row" :style="removeRowButtonStyle">
          <button
            type="button"
            class="b-editor-table__remove-button b-editor-table__remove-button--row"
            title="删除行"
            aria-label="删除行"
            @mousedown.prevent
            @click="handleRemove(segmentHover?.row ?? null)"
          >
            <Icon class="b-editor-table__button-icon" :icon="ICONS.remove" />
          </button>
        </div>
        <div
          v-show="showRemoveColumnButton"
          class="b-editor-table__segment-button-group b-editor-table__segment-button-group--column"
          :style="removeColumnButtonStyle"
        >
          <button
            type="button"
            class="b-editor-table__remove-button b-editor-table__remove-button--column"
            title="删除列"
            aria-label="删除列"
            @mousedown.prevent
            @click="handleRemove(segmentHover?.column ?? null)"
          >
            <Icon class="b-editor-table__button-icon" :icon="ICONS.remove" />
          </button>
        </div>
      </div>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
/**
 * @file TableView.vue
 * @description TipTap 表格 NodeView，负责富文本表格的 hover 增删控件。
 */

import type { CSSProperties } from 'vue';
import { computed, onBeforeUnmount, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { findParentNodeClosestToPos } from '@tiptap/core';
import { CellSelection, TableMap } from '@tiptap/pm/tables';
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import { applyAddAction, applyRemoveAction } from '../extensions/tableControlsCommands';
import {
  findHoveredDivider,
  findHoveredSegments,
  getAddButtonPosition,
  getRemoveButtonPosition,
  type DividerHit,
  type DOMRectLike,
  type SegmentHover,
  type SegmentHit
} from '../extensions/tableControlsGeometry';

// ─── 常量 ────────────────────────────────────────────────────────────────────

const props = defineProps(nodeViewProps);

const UI = {
  DIVIDER_THRESHOLD: 6,
  LINE_THICKNESS: 2,
  OVERLAY_GUTTER: 0,
  SEGMENT_HIDE_DELAY: 90,
  OVERLAY_HIDE_DELAY: 90
} as const;

const ICONS = {
  add: 'mdi:plus',
  remove: 'mdi:minus'
} as const;

const FALLBACK = {
  COLUMN_WIDTH: 120,
  ROW_HEIGHT: 40,
  ROW_COUNT: 3,
  COLUMN_COUNT: 3
} as const;

// ─── hover 状态 ─────────────────────────────────────────────────────────────

/**
 * 当前命中的分割线；存在时显示新增控件。
 */
const dividerHover = ref<DividerHit | null>(null);
/**
 * 当前命中的区段；存在时显示删除控件。
 */
const segmentHover = ref<SegmentHover | null>(null);
/**
 * 当前实际显示的 overlay 类型。
 */
const activeOverlay = ref<'none' | 'divider' | 'segment'>('none');
const viewportRef = ref<HTMLElement | null>(null);
const scrollerRef = ref<HTMLElement | null>(null);
let segmentHideTimer = 0;
let overlayHideTimer = 0;

/**
 * 清理区段 overlay 的延时关闭定时器。
 */
function clearSegmentHideTimer(): void {
  if (segmentHideTimer !== 0) {
    window.clearTimeout(segmentHideTimer);
    segmentHideTimer = 0;
  }
}

/**
 * 清理整个 hover overlay 的延时关闭定时器。
 */
function clearOverlayHideTimer(): void {
  if (overlayHideTimer !== 0) {
    window.clearTimeout(overlayHideTimer);
    overlayHideTimer = 0;
  }
}

/**
 * 延迟关闭区段 overlay，让快速移动到分割线时不至于闪烁。
 */
function scheduleSegmentHide(): void {
  if (segmentHideTimer !== 0) {
    return;
  }

  segmentHideTimer = window.setTimeout(() => {
    segmentHideTimer = 0;
    activeOverlay.value = dividerHover.value ? 'divider' : 'none';
  }, UI.SEGMENT_HIDE_DELAY);
}

/**
 * 清空全部 hover 命中状态。
 */
function clearHoverState(): void {
  clearOverlayHideTimer();
  clearSegmentHideTimer();
  activeOverlay.value = 'none';
}

/**
 * 延迟关闭全部 overlay，给鼠标移向外层按钮留出缓冲时间。
 */
function scheduleOverlayHide(): void {
  if (overlayHideTimer !== 0) {
    return;
  }

  overlayHideTimer = window.setTimeout(() => {
    overlayHideTimer = 0;
    clearHoverState();
  }, UI.OVERLAY_HIDE_DELAY);
}

// ─── 几何计算 ────────────────────────────────────────────────────────────────

/**
 * 将视口矩形转换为相对 scroller 内容区域的局部坐标。
 */
function toLocalRect(rect: DOMRect, scrollerRect: DOMRect, scroller: HTMLElement): DOMRectLike {
  return {
    top: rect.top - scrollerRect.top + scroller.scrollTop,
    right: rect.right - scrollerRect.left + scroller.scrollLeft,
    bottom: rect.bottom - scrollerRect.top + scroller.scrollTop,
    left: rect.left - scrollerRect.left + scroller.scrollLeft,
    width: rect.width,
    height: rect.height
  };
}

/**
 * 测试/空内容场景下的回退几何。
 */
function createFallbackGeometry(): { columnRects: DOMRectLike[]; rowRects: DOMRectLike[] } {
  const { COLUMN_WIDTH, ROW_HEIGHT, ROW_COUNT, COLUMN_COUNT } = FALLBACK;

  const columnRects = Array.from({ length: COLUMN_COUNT }, (_, i) => ({
    top: 0,
    bottom: ROW_HEIGHT * ROW_COUNT,
    left: i * COLUMN_WIDTH,
    right: (i + 1) * COLUMN_WIDTH,
    width: COLUMN_WIDTH,
    height: ROW_HEIGHT * ROW_COUNT
  }));

  const rowRects = Array.from({ length: ROW_COUNT }, (_, i) => ({
    top: i * ROW_HEIGHT,
    bottom: (i + 1) * ROW_HEIGHT,
    left: 0,
    right: COLUMN_WIDTH * COLUMN_COUNT,
    width: COLUMN_WIDTH * COLUMN_COUNT,
    height: ROW_HEIGHT
  }));

  return { columnRects, rowRects };
}

/**
 * 读取首行各列的局部矩形，列高度拉伸到整个表格范围。
 */
function readColumnRects(rows: Element[], scroller: HTMLElement, scrollerRect: DOMRect): DOMRectLike[] {
  const firstRow = rows[0];
  if (!firstRow) return [];

  const toLocal = (el: Element) => toLocalRect(el.getBoundingClientRect(), scrollerRect, scroller);
  const rowRects = rows.map(toLocal);
  const tableTop = rowRects[0]?.top ?? 0;
  const tableBottom = rowRects[rowRects.length - 1]?.bottom ?? 0;

  return Array.from(firstRow.querySelectorAll('th,td')).map((cell) => {
    const cellRect = toLocal(cell);
    // 列高度拉伸到整个表格范围
    return { ...cellRect, top: tableTop, bottom: tableBottom, height: tableBottom - tableTop };
  });
}

/**
 * 读取当前表格的行列几何，DOM 读取失败时降级为 fallback。
 */
function readTableGeometry(): { columnRects: DOMRectLike[]; rowRects: DOMRectLike[] } {
  const scroller = scrollerRef.value;
  const tableElement = scroller?.querySelector('table');

  if (!scroller || !(tableElement instanceof HTMLTableElement)) {
    return createFallbackGeometry();
  }

  const scrollerRect = scroller.getBoundingClientRect();
  const toLocal = (el: Element) => toLocalRect(el.getBoundingClientRect(), scrollerRect, scroller);

  const rows = Array.from(tableElement.querySelectorAll('tr'));
  const rowRects = rows.map(toLocal);
  const columnRects = readColumnRects(rows, scroller, scrollerRect);

  if (rowRects.length === 0 || columnRects.length === 0) {
    return createFallbackGeometry();
  }

  return { columnRects, rowRects };
}

// ─── 指针 & 滚动处理 ─────────────────────────────────────────────────────────

const lastPointer = ref<{ clientX: number; clientY: number } | null>(null);
let scrollFrame = 0;

/**
 * 将视口坐标转为 scroller 局部坐标。
 */
function toLocalPointer(clientX: number, clientY: number, scroller: HTMLElement): { x: number; y: number } {
  const rect = scroller.getBoundingClientRect();
  return {
    x: clientX - rect.left + scroller.scrollLeft,
    y: clientY - rect.top + scroller.scrollTop
  };
}

/**
 * 根据当前指针坐标更新 hoverState。
 */
function updateHoverState(clientX: number, clientY: number): void {
  clearOverlayHideTimer();
  if (!props.editor.isEditable) {
    clearHoverState();
    return;
  }

  const scroller = scrollerRef.value;
  if (!scroller) {
    clearHoverState();
    return;
  }

  const { x, y } = toLocalPointer(clientX, clientY, scroller);
  const geometry = readTableGeometry();
  const params = { clientX: x, clientY: y, threshold: UI.DIVIDER_THRESHOLD, ...geometry };

  const divider = findHoveredDivider(params);
  if (divider) {
    dividerHover.value = divider;
    if (activeOverlay.value === 'segment' && segmentHover.value) {
      scheduleSegmentHide();
      return;
    }

    clearSegmentHideTimer();
    activeOverlay.value = 'divider';
    segmentHover.value = null;
    return;
  }

  const segment = findHoveredSegments(params);
  if (segment) {
    clearSegmentHideTimer();
    dividerHover.value = null;
    segmentHover.value = segment;
    activeOverlay.value = 'segment';
    return;
  }

  clearHoverState();
}

function handleMouseMove(event: MouseEvent): void {
  lastPointer.value = { clientX: event.clientX, clientY: event.clientY };
  updateHoverState(event.clientX, event.clientY);
}

/**
 * 判断 relatedTarget 是否仍在当前表格控件的可交互区域内。
 */
function isInsideViewport(target: EventTarget | null): boolean {
  return target instanceof Node && viewportRef.value?.contains(target) === true;
}

/**
 * 鼠标离开 scroller 但仍在当前表格控件内部时，不应立即隐藏控件。
 */
function handleScrollerMouseLeave(event: MouseEvent): void {
  if (isInsideViewport(event.relatedTarget)) return;
  scheduleOverlayHide();
}

/**
 * 只有真正离开整个表格控件时才清空 hover。
 */
function handleViewportMouseLeave(event: MouseEvent): void {
  if (isInsideViewport(event.relatedTarget)) return;
  scheduleOverlayHide();
}

function handleScroll(): void {
  cancelAnimationFrame(scrollFrame);
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    if (lastPointer.value) {
      updateHoverState(lastPointer.value.clientX, lastPointer.value.clientY);
    }
  });
}

/**
 * 将内容坐标投影到可见视口坐标，供外层 overlay 使用。
 */
function toViewportPosition(position: { top: number; left: number }): { top: number; left: number } {
  const scroller = scrollerRef.value;
  if (!scroller) return position;

  return {
    top: position.top - scroller.scrollTop + UI.OVERLAY_GUTTER,
    left: position.left - scroller.scrollLeft + UI.OVERLAY_GUTTER
  };
}

// ─── 编辑器操作 ──────────────────────────────────────────────────────────────

/**
 * 聚焦到目标表格单元格。
 */
function focusCellAt(position: { row: number; column: number }): boolean {
  const { selection, tr, doc } = props.editor.state;
  const tableInfo = findParentNodeClosestToPos(selection.$from, (node) => node.type.name === 'table');
  if (!tableInfo) return false;

  const map = TableMap.get(tableInfo.node);
  const row = Math.min(position.row, map.height - 1);
  const column = Math.min(position.column, map.width - 1);
  const cellPos = tableInfo.pos + 1 + map.map[row * map.width + column];

  props.editor.view.dispatch(tr.setSelection(CellSelection.create(doc, cellPos)));
  return true;
}

/**
 * 读取当前表格行列数。
 */
function getDimensions(): { rowCount: number; columnCount: number } {
  const tableInfo = findParentNodeClosestToPos(props.editor.state.selection.$from, (node) => node.type.name === 'table');

  if (!tableInfo) {
    return { rowCount: FALLBACK.ROW_COUNT, columnCount: FALLBACK.COLUMN_COUNT };
  }

  const map = TableMap.get(tableInfo.node);
  return { rowCount: map.height, columnCount: map.width };
}

const editorContext = { editor: props.editor, focusCellAt, getDimensions };

function handleAdd(): void {
  if (dividerHover.value) {
    applyAddAction(editorContext, dividerHover.value);
  }
}

/**
 * 执行删除动作；行列按钮各自传入自己的命中目标。
 */
function handleRemove(hit: SegmentHit | null): void {
  if (hit) {
    applyRemoveAction(editorContext, hit);
  }
}

// ─── 样式计算 ────────────────────────────────────────────────────────────────

/**
 * 将删除按钮命中结果转换为视口坐标样式。
 */
function getRemoveStyle(hit: SegmentHit | null): CSSProperties | null {
  if (!hit) return null;

  const position = getRemoveButtonPosition(hit);
  const viewportPosition = toViewportPosition(position);
  return { top: `${viewportPosition.top}px`, left: `${viewportPosition.left}px` };
}

/**
 * 当前是否显示分割线 overlay。
 */
const showDividerOverlay = computed<boolean>(() => activeOverlay.value === 'divider' && dividerHover.value !== null);
/**
 * 当前是否显示区段 overlay。
 */
const showSegmentOverlay = computed<boolean>(() => activeOverlay.value === 'segment' && segmentHover.value !== null);

const lineHighlightStyle = computed<CSSProperties>(() => {
  if (!dividerHover.value) return {};

  const { lineRect } = dividerHover.value;
  const t = UI.LINE_THICKNESS;
  const vp = toViewportPosition({ top: lineRect.top, left: lineRect.left });

  if (dividerHover.value.type === 'column') {
    return { left: `${vp.left - t / 2}px`, top: `${vp.top}px`, width: `${t}px`, height: `${lineRect.height}px` };
  }

  return { left: `${vp.left}px`, top: `${vp.top - t / 2}px`, width: `${lineRect.width}px`, height: `${t}px` };
});

const addButtonStyle = computed<CSSProperties>(() => {
  if (!dividerHover.value) return {};

  const position = getAddButtonPosition(dividerHover.value);
  const viewportPosition = toViewportPosition(position);
  return { top: `${viewportPosition.top}px`, left: `${viewportPosition.left}px` };
});

const addButtonVariantClass = computed(() => ({
  'b-editor-table__add-button--column': dividerHover.value?.type === 'column',
  'b-editor-table__add-button--row': dividerHover.value?.type === 'row'
}));

/**
 * 根据当前分割线方向生成新增按钮文案。
 */
const addButtonLabel = computed<string>(() => {
  return dividerHover.value?.type === 'row' ? '新增行' : '新增列';
});

const removeRowButtonStyle = computed<CSSProperties | null>(() => {
  return getRemoveStyle(segmentHover.value?.row ?? null);
});

const removeColumnButtonStyle = computed<CSSProperties | null>(() => {
  return getRemoveStyle(segmentHover.value?.column ?? null);
});

/**
 * 当前是否显示删除行按钮。
 */
const showRemoveRowButton = computed<boolean>(() => removeRowButtonStyle.value !== null);

/**
 * 当前是否显示删除列按钮。
 */
const showRemoveColumnButton = computed<boolean>(() => removeColumnButtonStyle.value !== null);

// ─── 生命周期 ────────────────────────────────────────────────────────────────

onBeforeUnmount(() => {
  cancelAnimationFrame(scrollFrame);
  clearOverlayHideTimer();
  clearSegmentHideTimer();
});
</script>

<style lang="less">
.b-editor-table {
  width: 100%;
  margin: 0.75em 0;
  overflow: visible;
}

.b-editor-table__viewport {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  overflow: visible;
}

.b-editor-table__scroller {
  width: 100%;
  overflow-x: auto;
}

.b-editor-table__table {
  width: 100%;
  margin: 0;
  border-spacing: 0;
  border-collapse: separate;
  border: 1px solid var(--editor-table-border);
  border-radius: 8px;
}

.b-editor-table__line-overlay,
.b-editor-table__segment-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.b-editor-table__line-highlight {
  position: absolute;
  z-index: 1;
  pointer-events: none;
  background-color: color-mix(in srgb, var(--editor-link) 78%, transparent);
  border-radius: 999px;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--editor-link) 22%, transparent);
}

.b-editor-table__add-button,
.b-editor-table__remove-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  color: var(--editor-link);
  cursor: pointer;
  background: color-mix(in srgb, var(--bg-primary) 92%, var(--editor-link) 8%);
  border: 1px solid color-mix(in srgb, var(--editor-table-border) 82%, var(--editor-link) 18%);
  border-radius: 999px;

  &:hover {
    color: color-mix(in srgb, var(--editor-link) 82%, var(--editor-text));
    background: color-mix(in srgb, var(--bg-primary) 84%, var(--editor-link) 16%);
    border-color: color-mix(in srgb, var(--editor-link) 40%, var(--editor-table-border));
    box-shadow: 0 4px 12px rgb(15 23 42 / 16%);
  }
}

.b-editor-table__add-button {
  position: absolute;
  z-index: 2;
  pointer-events: auto;
}

.b-editor-table__add-button--column {
  transform: translate(-50%, -100%);

  &:active {
    transform: translate(-50%, -100%) scale(0.96);
  }
}

.b-editor-table__add-button--row {
  transform: translate(-100%, -50%);

  &:active {
    transform: translate(-100%, -50%) scale(0.96);
  }
}

.b-editor-table__segment-button-group {
  position: absolute;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.b-editor-table__segment-button-group--column {
  transform: translate(-50%, -100%);
}

.b-editor-table__segment-button-group--row {
  transform: translate(-100%, -50%);
}

.b-editor-table__remove-button {
  pointer-events: auto;

  &:active {
    transform: scale(0.96);
  }
}

.b-editor-table__button-icon {
  width: 15px;
  height: 15px;
  pointer-events: none;
}
</style>
