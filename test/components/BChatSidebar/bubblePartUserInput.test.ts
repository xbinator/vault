/**
 * @file bubblePartUserInput.test.ts
 * @description BubblePartUserInput 组件文件引用解析渲染测试。
 * @vitest-environment jsdom
 */

import type { ChatMessageTextPart } from 'types/chat';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import BubblePartUserInput from '@/components/BChatSidebar/components/MessageBubble/BubblePartUserInput.vue';

/** 模拟通用文件打开能力。 */
const openFileMock = vi.fn();

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: () => ({
    openFile: openFileMock
  })
}));

/**
 * 创建用户输入文本片段。
 * @param text - 片段文本
 * @returns 文本片段
 */
function createTextPart(text: string): ChatMessageTextPart {
  return {
    type: 'text',
    text
  };
}

describe('BubblePartUserInput', () => {
  beforeEach(() => {
    openFileMock.mockReset();
  });

  test('renders saved file reference segments', () => {
    const wrapper = mount(BubblePartUserInput, {
      props: {
        part: createTextPart('See {{#src/demo.ts 12-14|20-24}} now')
      }
    });

    expect(wrapper.text()).toContain('See');
    expect(wrapper.text()).toContain('demo.ts');
    expect(wrapper.text()).toContain('12-14');
    expect(wrapper.text()).toContain('now');
    expect(wrapper.get('.b-file-ref-chip').attributes('title')).toBe('src/demo.ts');
    expect(wrapper.get('.b-file-ref-chip__filename').text()).toBe('demo.ts');
    expect(wrapper.get('.b-file-ref-chip__lines').text()).toBe('12-14');
  });

  test('renders unsaved file reference segments', () => {
    const wrapper = mount(BubblePartUserInput, {
      props: {
        part: createTextPart('See {{#unsaved://draft123/draft.md 3-5|3-5}} now')
      }
    });

    expect(wrapper.text()).toContain('draft.md');
    expect(wrapper.text()).toContain('3-5');
    expect(wrapper.get('.b-file-ref-chip').attributes('title')).toBe('draft.md');
  });

  test('keeps plain text when no file reference exists', () => {
    const wrapper = mount(BubblePartUserInput, {
      props: {
        part: createTextPart('plain text only')
      }
    });

    expect(wrapper.text()).toBe('plain text only');
  });

  test('clicks saved file chips through openFile', async () => {
    const wrapper = mount(BubblePartUserInput, {
      props: {
        part: createTextPart('See {{#src/demo.ts 12-14|20-24}} now')
      }
    });

    await wrapper.get('[role="button"]').trigger('click');

    expect(openFileMock).toHaveBeenCalledWith({
      filePath: 'src/demo.ts',
      fileId: null,
      fileName: 'demo.ts',
      range: {
        startLine: 12,
        endLine: 14
      }
    });
  });

  test('keyboard opens unsaved file chips through openFile', async () => {
    const wrapper = mount(BubblePartUserInput, {
      props: {
        part: createTextPart('See {{#unsaved://draft123/draft.md 3-5|3-5}} now')
      }
    });

    await wrapper.get('[role="button"]').trigger('keydown.enter');

    expect(openFileMock).toHaveBeenCalledWith({
      filePath: null,
      fileId: 'draft123',
      fileName: 'draft.md',
      range: {
        startLine: 3,
        endLine: 5
      }
    });
  });
});
