# Compression Message Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把聊天侧边栏中的压缩消息改造成时间线式上下文边界节点，移除 `summaryText` 对用户的直接展示。

**Architecture:** 保持压缩消息的数据模型和上下文边界逻辑不变，只调整展示层。`BubblePartCompression.vue` 负责新的节点式结构与状态文案，`MessageBubble.vue` 负责为压缩消息切换到更轻的宿主容器行为，渲染测试同步改成校验“状态节点而非摘要正文”。

**Tech Stack:** Vue 3 `script setup`、Less、Vitest、Vue Test Utils

---

### Task 1: 收敛压缩消息渲染预期

**Files:**
- Modify: `test/components/BChatSidebar/message-bubble.compression.test.ts`
- Test: `test/components/BChatSidebar/message-bubble.compression.test.ts`

- [ ] **Step 1: 写出新的失败测试**

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test test/components/BChatSidebar/message-bubble.compression.test.ts`

Expected: FAIL，当前实现仍会把 `summaryText` 渲染出来。

- [ ] **Step 3: 补充失败态断言**

```ts
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
```

- [ ] **Step 4: 再次运行测试，确认两条都失败**

Run: `pnpm test test/components/BChatSidebar/message-bubble.compression.test.ts`

Expected: FAIL，成功态与失败态都仍然暴露 `summaryText`。

- [ ] **Step 5: Commit**

```bash
git add test/components/BChatSidebar/message-bubble.compression.test.ts
git commit -m "test: redefine compression message rendering expectations"
```

### Task 2: 实现压缩消息时间线节点样式

**Files:**
- Modify: `src/components/BChatSidebar/components/MessageBubble/BubblePartCompression.vue`
- Test: `test/components/BChatSidebar/message-bubble.compression.test.ts`

- [ ] **Step 1: 重写压缩消息组件的计算属性**

```ts
const statusLabel = computed<string>(() => {
  if (props.message.compression?.status === 'pending') return '正在压缩上下文';
  if (props.message.compression?.status === 'failed') return '压缩失败';
  return '上下文已压缩';
});

const statusDescription = computed<string>(() => {
  if (props.message.compression?.status === 'pending') return '正在整理此前对话，请稍候';
  if (props.message.compression?.status === 'failed') return '未能完成上下文整理，可稍后重试';
  return '此前对话已整理，后续回复将从这里继续';
});

const statusClassName = computed<string>(() => {
  return props.message.compression?.status ?? 'success';
});

const errorText = computed<string | undefined>(() => {
  return props.message.compression?.status === 'failed' ? props.message.compression.errorMessage : undefined;
});
```

- [ ] **Step 2: 重写模板为时间线节点结构**

```vue
<template>
  <div class="compression-node" :class="`compression-node--${statusClassName}`">
    <div class="compression-node__rail">
      <span class="compression-node__line" />
      <span class="compression-node__pill">{{ statusLabel }}</span>
      <span class="compression-node__line" />
    </div>

    <div class="compression-node__meta">
      <div class="compression-node__description">{{ statusDescription }}</div>
      <div v-if="errorText" class="compression-node__error">{{ errorText }}</div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 实现新的 Less 样式**

```less
.compression-node {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 6px 0;
}

.compression-node__rail {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
}

.compression-node__line {
  flex: 1;
  height: 1px;
  background: var(--border-primary);
  opacity: 0.75;
}

.compression-node__pill {
  padding: 4px 10px;
  font-size: 11px;
  line-height: 1;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 999px;
}

.compression-node__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  max-width: 420px;
  text-align: center;
}

.compression-node__description {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.compression-node__error {
  font-size: 12px;
  line-height: 1.5;
  color: var(--error-color);
}
```

- [ ] **Step 4: 为三种状态补充修饰类**

```less
.compression-node--success {
  .compression-node__pill {
    color: #0f766e;
    border-color: rgba(15, 118, 110, 0.22);
    background: rgba(15, 118, 110, 0.08);
  }
}

.compression-node--pending {
  .compression-node__pill {
    color: var(--text-primary);
  }
}

.compression-node--failed {
  .compression-node__pill {
    color: #b45309;
    border-color: rgba(180, 83, 9, 0.24);
    background: rgba(180, 83, 9, 0.08);
  }
}
```

- [ ] **Step 5: 运行压缩消息渲染测试并确认通过**

Run: `pnpm test test/components/BChatSidebar/message-bubble.compression.test.ts`

Expected: PASS，且断言确认 `summaryText` 未出现在用户可见文本中。

- [ ] **Step 6: Commit**

```bash
git add src/components/BChatSidebar/components/MessageBubble/BubblePartCompression.vue test/components/BChatSidebar/message-bubble.compression.test.ts
git commit -m "feat: refresh compression message visuals"
```

### Task 3: 收敛宿主气泡行为，避免压缩节点看起来像普通对话

**Files:**
- Modify: `src/components/BChatSidebar/components/MessageBubble.vue`
- Test: `test/components/BChatSidebar/message-bubble.compression.test.ts`

- [ ] **Step 1: 为压缩消息宿主容器写出更准确的测试断言**

```ts
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
```

- [ ] **Step 2: 调整 `MessageBubble.vue` 中压缩消息的宿主计算**

```ts
const showContainer = computed(() => {
  if (isCompressionMessage.value) {
    return true;
  }

  return !!props.message.parts?.length;
});
```

```less
.message-bubble__parts {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
```

说明：本步主要做行为确认，不新增复杂分支，避免把普通消息渲染牵进来。

- [ ] **Step 3: 运行压缩气泡专项测试**

Run: `pnpm test test/components/BChatSidebar/message-bubble.compression.test.ts`

Expected: PASS，压缩消息仍走独立节点渲染，且没有 assistant 工具栏副作用。

- [ ] **Step 4: Commit**

```bash
git add src/components/BChatSidebar/components/MessageBubble.vue test/components/BChatSidebar/message-bubble.compression.test.ts
git commit -m "test: lock compression bubble container behavior"
```

### Task 4: 回归验证与文档收尾

**Files:**
- Modify: `changelog/2026-05-08.md`
- Test: `test/components/BChatSidebar/message-bubble.compression.test.ts`
- Test: `test/components/BChatSidebar/compression.integration.test.ts`

- [ ] **Step 1: 在 changelog 中补充视觉改造记录**

```md
## Changed
- 将聊天侧边栏压缩消息改为时间线式上下文边界节点，不再向用户展示 `summaryText`，只保留状态与简短说明
```

- [ ] **Step 2: 跑最终回归**

Run: `pnpm test test/components/BChatSidebar/message-bubble.compression.test.ts test/components/BChatSidebar/compression.integration.test.ts`

Expected: PASS，压缩消息渲染与压缩交互回归通过。

- [ ] **Step 3: 跑 ESLint**

Run: `pnpm exec eslint src/components/BChatSidebar/components/MessageBubble/BubblePartCompression.vue src/components/BChatSidebar/components/MessageBubble.vue test/components/BChatSidebar/message-bubble.compression.test.ts --format unix`

Expected: 无告警输出。

- [ ] **Step 4: Commit**

```bash
git add changelog/2026-05-08.md src/components/BChatSidebar/components/MessageBubble/BubblePartCompression.vue src/components/BChatSidebar/components/MessageBubble.vue test/components/BChatSidebar/message-bubble.compression.test.ts
git commit -m "chore: finalize compression message visual refresh"
```

## Self-Review

- Spec coverage: 计划覆盖了“不展示 `summaryText`”“三种状态可识别”“时间线式边界节点”“保持现有压缩逻辑不变”四项核心要求。
- Placeholder scan: 各任务均给出明确文件、测试命令、期望结果和最小实现代码，无 `TODO` / `TBD` 占位。
- Type consistency: 计划仅围绕现有 `Message` 与 `compression.status` 字段工作，没有引入新的运行时类型或接口命名。
