<!--
  @file ConfirmModal.vue
  @description 确认对话框组件，支持自定义标题、内容和按钮
-->
<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="confirm-modal-overlay" @click="handleOverlayClick">
        <div class="confirm-modal" @click.stop>
          <div v-if="title" class="confirm-modal__header">
            <div class="confirm-modal__title">{{ title }}</div>
          </div>

          <div class="confirm-modal__body">{{ content }}</div>

          <div class="confirm-modal__footer">
            <BButton type="secondary" @click="handleCancel">{{ cancelText }}</BButton>
            <BButton type="primary" :danger="danger" @click="handleConfirm">{{ confirmText }}</BButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import BButton from '@/components/BButton/index.vue';

/**
 * ConfirmModal 属性
 */
interface Props {
  /** 是否显示 */
  visible: boolean;
  /** 对话框标题 */
  title?: string;
  /** 对话框内容 */
  content: string;
  /** 确认按钮文本 */
  confirmText?: string;
  /** 取消按钮文本 */
  cancelText?: string;
  /** 是否为危险操作 */
  danger?: boolean;
  /** 是否允许点击遮罩层关闭 */
  maskClosable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
  maskClosable: true
});

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

/**
 * 处理确认按钮点击
 */
function handleConfirm(): void {
  emit('confirm');
}

/**
 * 处理取消按钮点击
 */
function handleCancel(): void {
  emit('cancel');
}

/**
 * 处理遮罩层点击
 */
function handleOverlayClick(): void {
  if (props.maskClosable) {
    handleCancel();
  }
}

/**
 * 处理 ESC 键按下
 * @param event - 键盘事件
 */
function handleEscKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.visible) {
    handleCancel();
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleEscKey);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscKey);
});
</script>

<style scoped lang="less">
.confirm-modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgb(0 0 0 / 45%);
}

.confirm-modal {
  min-width: 320px;
  max-width: 480px;
  background: var(--bg-primary);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
}

.confirm-modal__header {
  padding: 16px 16px 0;
}

.confirm-modal__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.confirm-modal__body {
  padding: 16px;
  font-size: 14px;
  color: var(--text-secondary);
}

.confirm-modal__footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--border-primary);
}

/* Modal 进入动画 */
.modal-enter-active {
  animation: modal-in 0.3s ease;
}

/* Modal 离开动画 */
.modal-leave-active {
  animation: modal-out 0.3s ease;
}

@keyframes modal-in {
  0% {
    opacity: 0;
    transform: scale(0.9);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes modal-out {
  0% {
    opacity: 1;
    transform: scale(1);
  }

  100% {
    opacity: 0;
    transform: scale(0.9);
  }
}
</style>
