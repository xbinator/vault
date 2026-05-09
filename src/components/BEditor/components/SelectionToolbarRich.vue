<template>
  <Teleport v-if="overlayRoot" :to="overlayRoot">
    <div v-if="visible" ref="toolbarRef" class="rich-selection-toolbar" :style="style">
      <SelectionToolbar :format-buttons="resolvedFormatButtons" @ai="$emit('ai')" @reference="$emit('reference')" @format="handleFormat" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @file SelectionToolbarRich.vue
 * @description Rich 模式选区工具栏宿主，使用绝对定位浮层承载内容组件。
 */
import type { SelectionAssistantPosition, SelectionToolbarAction, SelectionAssistantRect } from '../adapters/selectionAssistant';
import type { Editor } from '@tiptap/vue-3';
import type { CSSProperties } from 'vue';
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useEventListener, useResizeObserver } from '@vueuse/core';
import SelectionToolbar from './SelectionToolbar.vue';

/**
 * 格式按钮定义（从 host 外部注入，含当前编辑器激活态）。
 */
interface FormatButton {
  command: SelectionToolbarAction;
  icon: string;
  active?: boolean;
}

interface Props {
  /** Tiptap Editor 实例 */
  editor: Editor;
  /** 是否允许工具栏显示 */
  visible?: boolean;
  /** 工具栏定位信息 */
  position?: SelectionAssistantPosition | null;
  /** 浮层根容器 DOM 元素 */
  overlayRoot?: HTMLElement | null;
  /** 需要展示的格式按钮列表 */
  formatButtons?: FormatButton[];
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  position: null,
  overlayRoot: null,
  formatButtons: () => []
});

const emit = defineEmits<{
  (e: 'ai'): void;
  (e: 'reference'): void;
  (e: 'format', command: SelectionToolbarAction): void;
}>();

/**
 * 工具栏与锚点之间的最小间距。
 */
const TOOLBAR_GAP = 8;

/**
 * 工具栏相对容器的最小安全边距。
 */
const TOOLBAR_PADDING = 8;

/**
 * 工具栏层级。
 */
const TOOLBAR_Z_INDEX = 100;

/** 隐藏时复用同一个对象，避免重复创建 */
const HIDDEN_STYLE: CSSProperties = { display: 'none' };

/** DOM 未测量时占位，visibility:hidden 保证不可见但可测量尺寸 */
const MEASURING_STYLE: CSSProperties = {
  position: 'absolute',
  top: '0px',
  left: '0px',
  visibility: 'hidden',
  zIndex: TOOLBAR_Z_INDEX
};

const toolbarRef = ref<HTMLElement | null>(null);
const style = shallowRef<CSSProperties>(HIDDEN_STYLE);
const hasMeasuredPosition = ref(false);
const pointerPressActive = ref(false);
const suppressed = ref(false);
let cleanupOverlayPointerListeners: (() => void) | null = null;

/**
 * 判断是否应该隐藏工具栏。
 * @returns 是否应该隐藏
 */
function shouldHide(): boolean {
  return suppressed.value || pointerPressActive.value || !props.visible || !props.position;
}

/**
 * 隐藏工具栏。
 */
function hide(): void {
  hasMeasuredPosition.value = false;
  style.value = HIDDEN_STYLE;
}

/**
 * 计算工具栏定位约束所需的容器尺寸。
 * 优先使用 adapter 提供的 containerRect（视口坐标系），
 * 回退到基于 overlayRoot 实时计算的视口可见区域。
 * @param position - 当前选区定位信息
 * @returns 归一化后的容器矩形
 */
function resolveContainerRect(position: SelectionAssistantPosition): SelectionAssistantRect {
  if (position.containerRect) {
    return position.containerRect;
  }

  const overlayEl = props.overlayRoot;
  const overlayRect = overlayEl?.getBoundingClientRect() ?? new DOMRect();
  const top = Math.max(0, -overlayRect.top);
  const left = Math.max(0, -overlayRect.left);

  return { top, left, width: window.innerWidth - left, height: window.innerHeight - top };
}

/**
 * 基于当前锚点、工具栏尺寸和容器边界同步最终定位。
 * rich 模式下只做“上方 / selection 底部”二选一，不再把下方位置钉到视图底边。
 */
function syncStyle(): void {
  if (shouldHide()) {
    hide();
    return;
  }

  const { position } = props;
  const toolbarEl = toolbarRef.value;
  const toolbarRect = toolbarEl?.getBoundingClientRect();
  const toolbarWidth = toolbarRect?.width ?? toolbarEl?.offsetWidth ?? 0;
  const toolbarHeight = toolbarRect?.height ?? toolbarEl?.offsetHeight ?? 0;
  if (toolbarWidth <= 0 || toolbarHeight <= 0) {
    hasMeasuredPosition.value = false;
    style.value = MEASURING_STYLE;
    return;
  }

  const containerRect = resolveContainerRect(position!);
  const anchorCenterX = position!.anchorRect.left + position!.anchorRect.width / 2;
  const belowRect = position!.selectionRect ?? position!.anchorRect;
  const topBelow = belowRect.top + belowRect.height + TOOLBAR_GAP;
  const preferBelow = position!.anchorRect.top < containerRect.top;
  const minLeft = containerRect.left + TOOLBAR_PADDING;
  const maxLeft = containerRect.left + containerRect.width - toolbarWidth - TOOLBAR_PADDING;
  const left = maxLeft >= minLeft ? Math.min(Math.max(anchorCenterX - toolbarWidth / 2, minLeft), maxLeft) : minLeft;
  const topAbove = position!.anchorRect.top - toolbarHeight - TOOLBAR_GAP;
  const minTop = containerRect.top + TOOLBAR_PADDING;
  let top = topBelow;
  if (!preferBelow && topAbove >= minTop) {
    top = topAbove;
  }

  style.value = {
    position: 'absolute',
    top: `${top}px`,
    left: `${left}px`,
    visibility: 'visible',
    zIndex: TOOLBAR_Z_INDEX
  };
  hasMeasuredPosition.value = true;
}

/**
 * 等 DOM 更新后重新测量并同步定位。
 * 适用于显隐切换、锚点变化、内容尺寸变化后的重排。
 */
function syncStyleOnNextTick(): void {
  if (shouldHide()) {
    hide();
    return;
  }

  if (!hasMeasuredPosition.value) {
    style.value = MEASURING_STYLE;
  }

  nextTick(syncStyle);
}

/**
 * 绑定 overlayRoot 上的指针按下/抬起监听。
 * 按下编辑区时立即隐藏 toolbar，避免拖拽开始瞬间闪现。
 */
function bindOverlayPointerListeners(): void {
  cleanupOverlayPointerListeners?.();
  const { overlayRoot } = props;
  if (!overlayRoot) {
    return;
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (toolbarRef.value?.contains(event.target as Node)) {
      return;
    }
    pointerPressActive.value = true;
    hide();
  };

  const onPointerUp = (): void => {
    if (!pointerPressActive.value) {
      return;
    }
    pointerPressActive.value = false;
    syncStyleOnNextTick();
  };

  overlayRoot.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);

  cleanupOverlayPointerListeners = (): void => {
    overlayRoot.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointerup', onPointerUp, true);
  };
}

/** 合并格式按钮的 active 态（基于当前编辑器状态） */
const resolvedFormatButtons = computed(() =>
  props.formatButtons.map((btn) => ({
    ...btn,
    active: btn.active ?? props.editor?.isActive(btn.command) ?? false
  }))
);

/**
 * 处理格式按钮点击，直接操作编辑器。
 * 格式命令与 Tiptap 内核紧密耦合，仅存在于 rich host 层。
 */
function handleFormat(command: SelectionToolbarAction): void {
  const { editor } = props;
  switch (command) {
    case 'bold':
      editor.chain().focus().toggleBold().run();
      break;
    case 'italic':
      editor.chain().focus().toggleItalic().run();
      break;
    case 'underline':
      editor.chain().focus().toggleUnderline().run();
      break;
    case 'strike':
      editor.chain().focus().toggleStrike().run();
      break;
    case 'code':
      editor.chain().focus().toggleCode().run();
      break;
    default:
      break;
  }
  emit('format', command);
}

watch([() => props.visible, () => props.position, () => props.formatButtons], syncStyleOnNextTick, { deep: true, immediate: true });

watch(
  () => props.visible,
  (visible: boolean): void => {
    if (!visible) {
      suppressed.value = false;
    }
  }
);

watch(() => props.overlayRoot, bindOverlayPointerListeners, { immediate: true });

useResizeObserver(toolbarRef, syncStyle);
useEventListener(window, 'resize', syncStyle);

onBeforeUnmount((): void => {
  cleanupOverlayPointerListeners?.();
  cleanupOverlayPointerListeners = null;
  style.value = HIDDEN_STYLE;
});

/**
 * 主动隐藏工具栏（供外部调用，如点击 AI 助手后让位给面板）。
 */
function suppress(): void {
  suppressed.value = true;
  hide();
}

defineExpose({ suppress });
</script>
