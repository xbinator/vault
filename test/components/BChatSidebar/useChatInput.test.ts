/**
 * @file useChatInput.test.ts
 * @description useChatInput 图片草稿状态测试
 */
import type { ChatMessageFile } from 'types/chat';
import { describe, expect, it, vi } from 'vitest';
import { useChatInput } from '@/components/BChatSidebar/hooks/useChatInput';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * 创建测试图片附件。
 * @returns 测试图片附件
 */
function createImageFile(): ChatMessageFile {
  return {
    id: 'image-1',
    name: 'diagram.png',
    type: 'image',
    mimeType: 'image/png',
    size: 1024,
    extension: 'png',
    url: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
    contentHash: 'hash-1'
  };
}

describe('useChatInput', () => {
  it('tracks image drafts independently from text emptiness', () => {
    const focusInput = vi.fn();
    const chatInput = useChatInput({ focusInput });

    expect(chatInput.isEmpty()).toBe(true);
    expect(chatInput.hasImages()).toBe(false);

    chatInput.addImages([createImageFile()]);

    expect(chatInput.isEmpty()).toBe(true);
    expect(chatInput.hasImages()).toBe(true);

    chatInput.removeImage('image-1');

    expect(chatInput.hasImages()).toBe(false);
  });

  it('restores image drafts and clears them together', () => {
    const focusInput = vi.fn();
    const chatInput = useChatInput({ focusInput });
    const message: Message = {
      id: 'message-1',
      role: 'user',
      content: '请看这张图',
      parts: [{ type: 'text', text: '请看这张图' }],
      files: [createImageFile()],
      createdAt: '2026-05-01T00:00:00.000Z',
      finished: true
    };

    chatInput.restoreFromMessage(message);

    expect(chatInput.inputContent.value).toBe('请看这张图');
    expect(chatInput.inputImages.value).toEqual([createImageFile()]);

    chatInput.clear();

    expect(chatInput.inputContent.value).toBe('');
    expect(chatInput.inputImages.value).toEqual([]);
    expect(focusInput).toHaveBeenCalledTimes(1);
  });
});
