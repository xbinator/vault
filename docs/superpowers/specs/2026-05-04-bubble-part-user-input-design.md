# BubblePartUserInput 组件拆分设计

## 背景

当前 `BubblePartText.vue` 通过 `enableFileReferenceChips` prop 来区分用户消息和助手消息的渲染方式。这种设计存在以下问题：

1. 组件职责不清晰，一个组件处理两种不同的渲染逻辑
2. Props 类型不够精确，需要运行时判断
3. 修改用户输入渲染逻辑可能影响助手消息，反之亦然

## 目标

将 `BubblePartText.vue` 拆分为两个职责单一的组件，提高代码可维护性和类型安全性。

## 设计方案

### 组件拆分

| 组件 | 职责 | Props 类型 |
|------|------|------------|
| **BubblePartUserInput**（新建） | 渲染用户输入，处理文件引用标签 | `ChatMessageTextPart \| ChatMessageFileReferencePart` |
| **BubblePartText**（简化） | 渲染助手消息，Markdown 渲染 | `ChatMessageTextPart \| ChatMessageErrorPart` |

### BubblePartUserInput 组件

**文件路径**: `src/components/BChatSidebar/components/MessageBubble/BubblePartUserInput.vue`

**职责**:
- 解析文件引用标记 `{{@fileName:startLine-endLine}}`
- 渲染纯文本和文件引用标签芯片
- 处理 `ChatMessageFileReferencePart` 类型的直接渲染

**Props**:
```typescript
interface Props {
  part: ChatMessageTextPart | ChatMessageFileReferencePart;
}
```

**渲染逻辑**:
1. 如果 `part.type === 'file-reference'`，直接渲染文件引用标签
2. 如果 `part.type === 'text'`，解析文本中的文件引用标记，拆分为文本片段和标签片段

### BubblePartText 组件

**文件路径**: `src/components/BChatSidebar/components/MessageBubble/BubblePartText.vue`（现有文件简化）

**职责**:
- 使用 `BMessage` 组件渲染 Markdown 内容
- 处理错误消息样式

**Props**:
```typescript
interface Props {
  part: ChatMessageTextPart | ChatMessageErrorPart;
}
```

**变更**:
- 移除 `enableFileReferenceChips` prop
- 移除文件引用解析逻辑
- 移除 `ChatMessageFileReferencePart` 类型支持

### MessageBubble.vue 调用方式

```vue
<template v-for="(item, index) in message.parts" :key="`${item.type}-${index}`">
  <!-- 用户消息：文本和文件引用 -->
  <BubblePartUserInput
    v-if="isUserMessage && isTextOrFileReference(item)"
    :part="item"
  />

  <!-- 助手消息：文本和错误 -->
  <BubblePartText
    v-else-if="!isUserMessage && isTextOrError(item)"
    :part="item"
  />

  <!-- 其他片段类型保持不变 -->
  <BubblePartThinking v-else-if="item.type === 'thinking'" :part="item" />
  <!-- ... -->
</template>
```

**辅助函数**:
```typescript
function isTextOrFileReference(part: ChatMessagePart): part is ChatMessageTextPart | ChatMessageFileReferencePart {
  return part.type === 'text' || part.type === 'file-reference';
}

function isTextOrError(part: ChatMessagePart): part is ChatMessageTextPart | ChatMessageErrorPart {
  return part.type === 'text' || part.type === 'error';
}
```

## 实现步骤

1. 创建 `BubblePartUserInput.vue` 组件
   - 从 `BubblePartText.vue` 提取用户输入渲染逻辑
   - 定义精确的 Props 类型

2. 简化 `BubblePartText.vue`
   - 移除 `enableFileReferenceChips` prop
   - 移除文件引用解析逻辑
   - 更新 Props 类型

3. 更新 `MessageBubble.vue`
   - 添加类型守卫函数
   - 更新模板中的条件渲染逻辑
   - 导入新组件

## 影响范围

- `src/components/BChatSidebar/components/MessageBubble/BubblePartText.vue` - 简化
- `src/components/BChatSidebar/components/MessageBubble/BubblePartUserInput.vue` - 新建
- `src/components/BChatSidebar/components/MessageBubble.vue` - 更新调用方式

## 优势

1. **职责分离**: 每个组件只做一件事，代码更清晰
2. **类型安全**: Props 类型更精确，减少运行时判断
3. **可维护性**: 修改用户输入渲染逻辑不影响助手消息，反之亦然
