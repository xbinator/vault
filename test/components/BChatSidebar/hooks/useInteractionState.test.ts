/**
 * @file useInteractionState.test.ts
 * @description useInteractionState hook 单元测试
 */
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import { useInteractionState } from '@/components/BChatSidebar/hooks/useInteractionState';

describe('useInteractionState', () => {
  describe('showToast', () => {
    it('应该添加 Toast 到队列', () => {
      const { toastQueue, api } = useInteractionState();

      api.showToast({ type: 'error', content: '测试错误' });

      expect(toastQueue.value).toHaveLength(1);
      expect(toastQueue.value[0].type).toBe('error');
      expect(toastQueue.value[0].content).toBe('测试错误');
    });

    it('应该使用默认持续时间', () => {
      const { toastQueue, api } = useInteractionState();

      api.showToast({ type: 'info', content: '测试信息' });

      expect(toastQueue.value[0].duration).toBe(3000);
    });

    it('应该使用自定义持续时间', () => {
      const { toastQueue, api } = useInteractionState();

      api.showToast({ type: 'success', content: '测试成功', duration: 5000 });

      expect(toastQueue.value[0].duration).toBe(5000);
    });

    it('应该在超出最大数量时移除最早的 Toast', () => {
      const { toastQueue, api } = useInteractionState({ maxToastCount: 2 });

      api.showToast({ type: 'error', content: '错误1' });
      api.showToast({ type: 'error', content: '错误2' });
      api.showToast({ type: 'error', content: '错误3' });

      expect(toastQueue.value).toHaveLength(2);
      expect(toastQueue.value[0].content).toBe('错误2');
      expect(toastQueue.value[1].content).toBe('错误3');
    });
  });

  describe('showConfirm', () => {
    it('应该显示确认对话框', async () => {
      const { confirmState, api } = useInteractionState();

      const promise = api.showConfirm({ content: '确认删除？' });

      expect(confirmState.value).not.toBeNull();
      expect(confirmState.value?.visible).toBe(true);
      expect(confirmState.value?.options.content).toBe('确认删除？');

      // Promise 应该还在等待
      let resolved = false;
      promise.then(() => {
        resolved = true;
      });

      await nextTick();
      expect(resolved).toBe(false);
    });

    it('应该支持自定义标题和按钮文本', () => {
      const { confirmState, api } = useInteractionState();

      api.showConfirm({
        title: '删除确认',
        content: '确认删除此项目？',
        confirmText: '删除',
        cancelText: '取消',
        danger: true
      });

      expect(confirmState.value?.options.title).toBe('删除确认');
      expect(confirmState.value?.options.confirmText).toBe('删除');
      expect(confirmState.value?.options.cancelText).toBe('取消');
      expect(confirmState.value?.options.danger).toBe(true);
    });
  });

  describe('handleConfirm', () => {
    it('应该 resolve 为 true', async () => {
      const { confirmState, api, handleConfirm } = useInteractionState();

      const promise = api.showConfirm({ content: '确认？' });
      handleConfirm();

      const result = await promise;
      expect(result).toBe(true);
      expect(confirmState.value?.visible).toBe(false);
    });
  });

  describe('handleCancel', () => {
    it('应该 resolve 为 false', async () => {
      const { confirmState, api, handleCancel } = useInteractionState();

      const promise = api.showConfirm({ content: '确认？' });
      handleCancel();

      const result = await promise;
      expect(result).toBe(false);
      expect(confirmState.value?.visible).toBe(false);
    });
  });

  describe('removeToast', () => {
    it('应该从队列中移除指定的 Toast', () => {
      const { toastQueue, api, removeToast } = useInteractionState();

      api.showToast({ type: 'error', content: '错误1' });
      api.showToast({ type: 'error', content: '错误2' });

      const toastId = toastQueue.value[0].id;
      removeToast(toastId);

      expect(toastQueue.value).toHaveLength(1);
      expect(toastQueue.value[0].content).toBe('错误2');
    });

    it('移除不存在的 Toast 不应该报错', () => {
      const { toastQueue, removeToast } = useInteractionState();

      removeToast('non-existent-id');

      expect(toastQueue.value).toHaveLength(0);
    });
  });
});
