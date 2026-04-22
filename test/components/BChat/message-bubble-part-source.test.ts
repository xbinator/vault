/**
 * @file message-bubble-part-source.test.ts
 * @description MessageBubble 片段子组件拆分回归测试。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * 读取源码文件。
 * @param relativePath - 仓库相对路径
 * @returns 源码内容
 */
function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

describe('MessageBubble part extraction', () => {
  test('renders thinking and tool parts through dedicated child components', () => {
    const source = readSource('src/components/BChat/components/MessageBubble.vue');

    expect(source).toContain("import MessageBubblePartThinking from './MessageBubblePartThinking.vue';");
    expect(source).toContain("import MessageBubblePartToolCall from './MessageBubblePartToolCall.vue';");
    expect(source).toContain("import MessageBubblePartToolResult from './MessageBubblePartToolResult.vue';");
    expect(source).toContain('<MessageBubblePartThinking');
    expect(source).toContain('<MessageBubblePartToolCall');
    expect(source).toContain('<MessageBubblePartToolResult');
  });

  test('renders text parts through a dedicated child component while keeping attachments in MessageBubble', () => {
    const source = readSource('src/components/BChat/components/MessageBubble.vue');

    expect(source).toContain("import MessageBubblePartText from './MessageBubblePartText.vue';");
    expect(source).toContain('<MessageBubblePartText');
    expect(source).not.toContain("import MessageBubbleHeaderAttachments from './MessageBubbleHeaderAttachments.vue';");
  });
});
