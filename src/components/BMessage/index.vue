<template>
  <div ref="rootRef" class="b-message" :class="`b-message--${loading ? 'streaming' : 'done'}`" :style="rootStyle">
    <div class="b-message__placeholder" aria-hidden="true"></div>

    <div class="b-message__container">
      <!-- Markdown 渲染 -->
      <div v-if="type === 'markdown'" class="b-message__markdown" v-html="renderedMarkdown"></div>

      <!-- 纯文本渲染 -->
      <div v-else class="b-message__text">{{ content }}<span v-if="loading" class="b-message__cursor" aria-hidden="true"></span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BMessageProps as Props } from './types';
import { computed } from 'vue';
import { marked } from 'marked';
import { addCssUnit } from '@/utils/css';

defineOptions({ name: 'BMessage' });

const props = withDefaults(defineProps<Props>(), {
  type: 'markdown',
  loading: false,
  content: '',
  height: undefined,
  maxHeight: undefined
});

const rootStyle = computed(() => {
  return {
    height: addCssUnit(props.height),
    maxHeight: addCssUnit(props.maxHeight)
  };
});

const renderedMarkdown = computed<string>(() => {
  if (!props.content && !props.loading) return '';
  // 如果没有内容但正在加载，直接显示光标
  if (!props.content && props.loading) return '<span class="b-message__cursor" aria-hidden="true"></span>';

  // 使用一个不可能出现在正常内容中的标记符
  const CURSOR_MARKER = '___B_MESSAGE_CURSOR_MARKER___';

  // 在内容末尾追加标记符，如果是流式加载状态
  const textToParse = props.loading ? props.content + CURSOR_MARKER : props.content;

  // 解析 Markdown
  let html = marked.parse(textToParse, { async: false }) as string;

  // 将解析后的标记符替换为光标的 HTML 标签
  // 这样光标就会完美跟随在最后一个渲染节点（如 p, pre, table 等）的内部末尾
  if (props.loading) {
    html = html.replace(CURSOR_MARKER, '<span class="b-message__cursor" aria-hidden="true"></span>');
  }

  return html;
});
</script>

<style lang="less">
// ── 根容器 ────────────────────────────────────────────────
.b-message {
  position: relative;
  display: flex;
  flex-direction: column-reverse;
  // 增加 overflow-y 使 maxHeight 能够生效并产生滚动
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  overflow-wrap: break-word;

  &::-webkit-scrollbar {
    display: block;
    width: 6px;
    height: 6px;
  }

  &::-webkit-scrollbar-thumb {
    display: block;
    background: var(--scrollbar-bg);
    border-radius: 3px;
    transition: background 0.2s;

    &:hover {
      background: var(--scrollbar-hover);
    }

    &:active {
      background: var(--scrollbar-active);
    }
  }
}

.b-message__placeholder {
  flex: 1 0 auto;
  pointer-events: none;
}

.b-message__container {
  width: 100%;
}

// ── 纯文本 ───────────────────────────────────────────────
.b-message__text {
  white-space: pre-wrap;
}

// ── Markdown 样式 ────────────────────────────────────────
.b-message__markdown {
  > :first-child {
    margin-top: 0;
  }

  > :last-child {
    margin-bottom: 0;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin: 0.8em 0 0.4em;
    font-weight: 600;
    line-height: 1.4;
    color: var(--text-primary);
  }

  h1 {
    font-size: 1.5em;
  }

  h2 {
    font-size: 1.25em;
  }

  h3 {
    font-size: 1.1em;
  }

  p {
    margin: 0.4em 0;
  }

  ul,
  ol {
    padding-left: 1.5em;
    margin: 0.4em 0;
    list-style: revert;
  }

  li {
    margin: 0.2em 0;
  }

  code {
    padding: 0.15em 0.4em;
    font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
    font-size: 0.875em;
    background: var(--bg-tertiary);
    border-radius: 4px;
  }

  pre {
    padding: 12px 16px;
    margin: 0.6em 0;
    overflow-x: auto;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-secondary);
    border-radius: 6px;

    code {
      padding: 0;
      background: transparent;
      border-radius: 0;
    }
  }

  blockquote {
    padding: 0.4em 1em;
    margin: 0.6em 0;
    color: var(--text-secondary);
    border-left: 3px solid var(--border-primary);
  }

  a {
    color: var(--color-primary);
    text-decoration: underline;
    text-underline-offset: 2px;

    &:hover {
      color: var(--color-primary-hover);
    }
  }

  table {
    width: 100%;
    margin: 0.6em 0;
    font-size: 0.9em;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 6px 12px;
    border: 1px solid var(--border-primary);
  }

  th {
    font-weight: 600;
    background: var(--bg-secondary);
  }

  tr:hover td {
    background: var(--bg-hover);
  }

  hr {
    margin: 0.8em 0;
    border: none;
    border-top: 1px solid var(--border-secondary);
  }

  img {
    max-width: 100%;
    border-radius: 4px;
  }
}

// ── 打字机光标 ────────────────────────────────────────────
.b-message__cursor {
  display: inline-block;
  width: 1px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--color-primary);
  border-radius: 1px;
  animation: b-stream-cursor-blink 0.8s steps(1) infinite;
}

@keyframes b-stream-cursor-blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}
</style>
