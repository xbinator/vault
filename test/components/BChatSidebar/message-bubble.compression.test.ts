/* @vitest-environment jsdom */
/**
 * @file message-bubble.compression.test.ts
 * @description 压缩消息渲染测试。
 */
import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import MessageBubble from '@/components/BChatSidebar/components/MessageBubble.vue';
import { create } from '@/components/BChatSidebar/utils/messageHelper';

describe('MessageBubble compression rendering', () => {
  test('renders compression message as a status node without exposing summary text', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: create.compressionMessage({
          summaryText: '内部摘要正文不应该展示给用户',
          status: 'success',
          summaryId: 'summary-1',
          coveredUntilMessageId: 'message-24',
          sourceMessageIds: ['message-1', 'message-24']
        })
      },
      global: {
        stubs: {
          Icon: true,
          BButton: true,
          BImageViewer: true,
          BBubble: {
            template: '<div class="b-bubble"><slot /><slot name="header" /></div>',
            props: ['showContainer', 'placement', 'loading', 'size']
          }
        }
      }
    });

    expect(wrapper.text()).toContain('上下文已压缩');
    expect(wrapper.text()).toContain('此前对话已整理，后续回复将从这里继续');
    expect(wrapper.text()).not.toContain('内部摘要正文不应该展示给用户');
  });

  test('renders failed compression message with retry guidance instead of summary text', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: create.compressionMessage({
          summaryText: '失败时也不应该展示这段文本',
          status: 'failed',
          errorMessage: '摘要保存失败'
        })
      },
      global: {
        stubs: {
          Icon: true,
          BButton: true,
          BImageViewer: true,
          BBubble: {
            template: '<div class="b-bubble"><slot /><slot name="header" /></div>',
            props: ['showContainer', 'placement', 'loading', 'size']
          }
        }
      }
    });

    expect(wrapper.text()).toContain('压缩失败');
    expect(wrapper.text()).toContain('未能完成上下文整理，可稍后重试');
    expect(wrapper.text()).toContain('摘要保存失败');
    expect(wrapper.text()).not.toContain('失败时也不应该展示这段文本');
  });

  test('keeps compression messages visually separate from assistant toolbars', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: create.compressionMessage({
          summaryText: '不会展示',
          status: 'success',
          summaryId: 'summary-1',
          coveredUntilMessageId: 'message-24',
          sourceMessageIds: ['message-1', 'message-24']
        })
      },
      global: {
        stubs: {
          Icon: true,
          BButton: true,
          BImageViewer: true,
          BBubble: {
            template: '<div class="b-bubble"><slot /><slot name="header" /></div>',
            props: ['showContainer', 'placement', 'loading', 'size']
          }
        }
      }
    });

    expect(wrapper.find('.message-bubble__toolbar').exists()).toBe(false);
  });

  test('renders cancelled compression message with stop guidance', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: create.compressionMessage({
          summaryText: '',
          status: 'cancelled',
          errorMessage: '用户已取消'
        })
      },
      global: {
        stubs: {
          Icon: true,
          BButton: true,
          BImageViewer: true,
          BBubble: {
            template: '<div class="b-bubble"><slot /><slot name="header" /></div>',
            props: ['showContainer', 'placement', 'loading', 'size']
          }
        }
      }
    });

    expect(wrapper.text()).toContain('压缩已取消');
    expect(wrapper.text()).toContain('此次上下文整理已停止，后续可重新发起压缩');
  });
});
