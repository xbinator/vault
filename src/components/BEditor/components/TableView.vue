<template>
  <NodeViewWrapper class="b-editor-table">
    <div class="b-editor-table__viewport">
      <div ref="scrollerRef" class="b-editor-table__scroller" @mousemove="handleMouseMove" @mouseleave="clearHoverState" @scroll="handleScroll">
        <NodeViewContent as="table" class="b-editor-table__table" />
      </div>

      <!-- 分割线 + 新增按钮 -->
      <template v-if="hoverState.type === 'divider'">
        <div class="b-editor-table__line-overlay" contenteditable="false">
          <div class="b-editor-table__line-highlight" :style="lineHighlightStyle"></div>
          <button type="button" class="b-editor-table__add-button" :class="addButtonVariantClass" :style="addButtonStyle" @mousedown.prevent @click="handleAdd">
            +
          </button>
        </div>
      </template>

      <!-- 区段 + 删除按钮 -->
      <template v-else-if="hoverState.type === 'segment'">
        <div class="b-editor-table__segment-overlay" contenteditable="false">
          <div v-if="removeRowButtonStyle" class="b-editor-table__segment-button-group b-editor-table__segment-button-group--row" :style="removeRowButtonStyle">
            <button
              type="button"
              class="b-editor-table__remove-button b-editor-table__remove-button--row"
              @mousedown.prevent
              @click="handleRemove(hoverState.hits.row)"
            >
              −
            </button>
          </div>
          <div
            v-if="removeColumnButtonStyle"
            class="b-editor-table__segment-button-group b-editor-table__segment-button-group--column"
            :style="removeColumnButtonStyle"
          >
            <button
              type="button"
              class="b-editor-table__remove-button b-editor-table__remove-button--column"
              @mousedown.prevent
              @click="handleRemove(hoverState.hits.column)"
            >
              −
            </button>
          </div>
        </div>
      </template>
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
  BUTTON_SIZE: 18,
  DIVIDER_THRESHOLD: 6,
  LINE_THICKNESS: 2,
  OVERLAY_GUTTER: 0
} as const;

const FALLBACK = {
  COLUMN_WIDTH: 120,
  ROW_HEIGHT: 40,
  ROW_COUNT: 3,
  COLUMN_COUNT: 3
} as const;

// ─── hover 状态（互斥联合类型）──────────────────────────────────────────────

type HoverState = { type: 'divider'; hit: DividerHit } | { type: 'segment'; hits: SegmentHover } | { type: 'none' };

const HOVER_NONE: HoverState = { type: 'none' };

const hoverState = ref<HoverState>(HOVER_NONE);
const scrollerRef = ref<HTMLElement | null>(null);

function clearHoverState(): void {
  hoverState.value = HOVER_NONE;
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
  const columnRects = rows[0]
    ? Array.from(rows[0].querySelectorAll('th,td')).map((cell) => {
        const cellRect = toLocal(cell);
        const top = rowRects[0]?.top ?? cellRect.top;
        const bottom = rowRects[rowRects.length - 1]?.bottom ?? cellRect.bottom;

        return {
          ...cellRect,
          top,
          bottom,
          height: bottom - top
        };
      })
    : [];

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
    hoverState.value = { type: 'divider', hit: divider };
    return;
  }

  const segment = findHoveredSegments(params);
  hoverState.value = segment ? { type: 'segment', hits: segment } : HOVER_NONE;
}

function handleMouseMove(event: MouseEvent): void {
  lastPointer.value = { clientX: event.clientX, clientY: event.clientY };
  updateHoverState(event.clientX, event.clientY);
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
  if (!scroller) {
    return position;
  }

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

/** 编辑器操作上下文，避免每次操作时重新构建对象。 */
const editorContext = { editor: props.editor, focusCellAt, getDimensions };

function handleAdd(): void {
  if (hoverState.value.type === 'divider') {
    applyAddAction(editorContext, hoverState.value.hit);
  }
}

/**
 * 执行删除动作；行列按钮各自传入自己的命中目标。
 * @param hit - 当前点击的删除目标
 */
function handleRemove(hit: SegmentHit | null): void {
  if (hit) {
    applyRemoveAction(editorContext, hit);
  }
}

// ─── 样式计算 ────────────────────────────────────────────────────────────────

const lineHighlightStyle = computed<CSSProperties>(() => {
  if (hoverState.value.type !== 'divider') return {};

  const { hit } = hoverState.value;
  const { lineRect } = hit;
  const t = UI.LINE_THICKNESS;
  const viewportPosition = toViewportPosition({ top: lineRect.top, left: lineRect.left });

  if (hit.type === 'column') {
    return { left: `${viewportPosition.left - t / 2}px`, top: `${viewportPosition.top}px`, width: `${t}px`, height: `${lineRect.height}px` };
  }
  return { left: `${viewportPosition.left}px`, top: `${viewportPosition.top - t / 2}px`, width: `${lineRect.width}px`, height: `${t}px` };
});

const addButtonStyle = computed<CSSProperties>(() => {
  if (hoverState.value.type !== 'divider') return {};
  const position = getAddButtonPosition(hoverState.value.hit, UI.BUTTON_SIZE);
  const viewportPosition = toViewportPosition(position);
  return { top: `${viewportPosition.top}px`, left: `${viewportPosition.left}px` };
});

/**
 * 将删除按钮命中结果转换为视口坐标样式。
 * @param hit - 删除目标
 * @returns 视口样式；无命中时返回 null
 */
function getRemoveStyle(hit: SegmentHit | null): CSSProperties | null {
  if (!hit) {
    return null;
  }

  const position = getRemoveButtonPosition(hit, UI.BUTTON_SIZE);
  const viewportPosition = toViewportPosition(position);
  return { top: `${viewportPosition.top}px`, left: `${viewportPosition.left}px` };
}

const addButtonVariantClass = computed(() => ({
  'b-editor-table__add-button--column': hoverState.value.type === 'divider' && hoverState.value.hit.type === 'column',
  'b-editor-table__add-button--row': hoverState.value.type === 'divider' && hoverState.value.hit.type === 'row'
}));

const removeRowButtonStyle = computed<CSSProperties | null>(() => (hoverState.value.type === 'segment' ? getRemoveStyle(hoverState.value.hits.row) : null));
const removeColumnButtonStyle = computed<CSSProperties | null>(() =>
  hoverState.value.type === 'segment' ? getRemoveStyle(hoverState.value.hits.column) : null
);

// ─── 生命周期 ────────────────────────────────────────────────────────────────

onBeforeUnmount(() => {
  cancelAnimationFrame(scrollFrame);
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
  background-color: color-mix(in srgb, var(--editor-link) 72%, transparent);
  border-radius: 999px;
}

.b-editor-table__add-button,
.b-editor-table__remove-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  color: var(--editor-text);
  cursor: pointer;
  background: color-mix(in srgb, var(--bg-primary) 94%, white);
  border: 1px solid color-mix(in srgb, var(--editor-table-border) 72%, white);
  border-radius: 999px;
  box-shadow: 0 4px 14px rgb(15 23 42 / 14%), 0 1px 3px rgb(15 23 42 / 12%);
}

.b-editor-table__add-button {
  position: absolute;
  z-index: 2;
  color: color-mix(in srgb, var(--editor-text) 72%, white);
  pointer-events: auto;
}

.b-editor-table__add-button--column {
  width: 42px;
  height: 32px;
  padding: 0;
  font-size: 28px;
  line-height: 1;
  transform: translate(-50%, -50%);
}

.b-editor-table__add-button--row {
  width: 32px;
  height: 42px;
  padding: 0;
  font-size: 28px;
  line-height: 1;
  transform: translate(-50%, -50%);
}

.b-editor-table__segment-button-group {
  position: absolute;
  z-index: 3;
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 6px;
  pointer-events: auto;
  background: var(--bg-primary);
  border: 1px solid var(--editor-table-border);
  border-radius: 10px;
  box-shadow: 0 8px 20px rgb(15 23 42 / 14%), 0 2px 5px rgb(15 23 42 / 10%);
  transform: translate(-50%, -50%);
}

.b-editor-table__remove-button {
  width: 30px;
  height: 30px;
  padding: 0;
  font-size: 20px;
  line-height: 1;
  color: var(--ant-color-error);
}

.b-editor-table__remove-button--row,
.b-editor-table__remove-button--column {
  min-width: 28px;
}
</style>
