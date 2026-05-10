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

    it('相同 content 的 Toast 不应该重复添加', () => {
      const { toastQueue, api } = useInteractionState();

      api.showToast({ type: 'error', content: '错误1' });
      api.showToast({ type: 'error', content: '错误1' });

      expect(toastQueue.value).toHaveLength(1);
      expect(toastQueue.value[0].content).toBe('错误1');
    });

    it('相同 content 的 Toast 应该触发抖动动画', async () => {
      const { toastQueue, api } = useInteractionState();

      api.showToast({ type: 'error', content: '错误1' });
      expect(toastQueue.value[0].shake).toBeUndefined();

      api.showToast({ type: 'error', content: '错误1' });
      expect(toastQueue.value[0].shake).toBe(true);

      // 等待 300ms 后抖动标记应该被移除
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 350);
      });
      expect(toastQueue.value[0].shake).toBe(false);
    });

    it('不同 content 的 Toast 应该正常添加', () => {
      const { toastQueue, api } = useInteractionState();

      api.showToast({ type: 'error', content: '错误1' });
      api.showToast({ type: 'error', content: '错误2' });

      expect(toastQueue.value).toHaveLength(2);
      expect(toastQueue.value[0].content).toBe('错误1');
      expect(toastQueue.value[1].content).toBe('错误2');
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
