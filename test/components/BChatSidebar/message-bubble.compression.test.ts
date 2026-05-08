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
  test('renders compression status and summary text', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: create.compressionMessage({
          summaryText: '已压缩 12 轮历史对话',
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
    expect(wrapper.text()).toContain('已压缩 12 轮历史对话');
  });
});
