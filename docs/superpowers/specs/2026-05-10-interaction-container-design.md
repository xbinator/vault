# BChatSidebar 交互容器设计文档

**日期**: 2026-05-10  
**状态**: 待实现

## 1. 概述

为 BChatSidebar 创建统一的交互容器，用于处理错误提示和确认对话框。该容器仅在 BChatSidebar 内部使用，不涉及全局交互系统。

## 2. 需求

### 2.1 功能需求

- 支持错误提示（Toast）堆叠显示
- 支持确认对话框（Modal）模态显示
- 错误提示支持多种类型：error、warning、info、success
- 确认对话框支持自定义标题、内容、按钮文本
- 确认对话框支持 danger 模式

### 2.2 非功能需求

- 使用 provide/inject 模式，避免 props 逐层传递
- 完全自定义实现，不依赖 ant-design-vue 的交互组件
- 支持进入/退出动画
- 类型安全

## 3. 架构设计

### 3.1 整体架构

```
BChatSidebar (provide: interaction API)
  └─ InteractionContainer
      ├─ ToastStack (错误提示堆叠)
      │   └─ ToastItem (单个提示)
      └─ ConfirmModal (确认对话框)
```

### 3.2 数据流

#### Toast 流程

```
VoiceInput (inject)
    ↓ 调用 showToast({ type: 'error', content: '...' })
InteractionContainer (provide)
    ↓ 添加到 toastQueue
ToastStack
    ↓ 渲染 ToastItem 列表
ToastItem
    ↓ 显示错误提示
```

#### Confirm 流程

```
VoiceInput (inject)
    ↓ 调用 showConfirm({ title: '...', content: '...' })
InteractionContainer (provide)
    ↓ 设置 confirmState，返回 Promise
ConfirmModal
    ↓ 显示对话框，等待用户操作
用户点击确认/取消
    ↓ resolve Promise
VoiceInput
    ↓ 获取结果 (true/false)
```

## 4. 组件设计

### 4.1 InteractionContainer.vue

**职责**：
- 管理错误提示队列
- 管理确认对话框状态
- 提供 `showToast` 和 `showConfirm` 方法

**Props**：
```typescript
interface Props {
  maxToastCount?: number; // 最大显示数量，默认 3
  defaultDuration?: number; // 默认持续时间，默认 3000ms
}
```

**Provide API**：
```typescript
interface InteractionAPI {
  showToast: (options: ToastOptions) => void;
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
}

interface ToastOptions {
  type: 'error' | 'warning' | 'info' | 'success';
  content: string;
  duration?: number;
}

interface ConfirmOptions {
  title?: string;
  content: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}
```

**内部状态**：
```typescript
// Toast 队列
const toastQueue = ref<ToastItem[]>([]);

// Confirm 状态
const confirmState = ref<{
  visible: boolean;
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
} | null>(null);
```

### 4.2 ToastStack.vue

**职责**：
- 显示和管理多个 Toast 提示
- 支持堆叠显示（从下往上）
- 自动移除超时的提示

**样式**：
- 固定在输入框上方
- 最大显示 3 条，超出时移除最早的
- 每条提示高度约 40px，间距 8px
- 支持进入/退出动画

### 4.3 ToastItem.vue

**职责**：
- 显示单个提示
- 支持手动关闭按钮
- 显示不同类型的图标和颜色

**样式**：
```css
- error: 红色背景，错误图标
- warning: 橙色背景，警告图标
- info: 蓝色背景，信息图标
- success: 绿色背景，成功图标
```

**Props**：
```typescript
interface Props {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success';
  content: string;
  duration: number;
}
```

**Events**：
```typescript
interface Emits {
  (e: 'close', id: string): void;
}
```

### 4.4 ConfirmModal.vue

**职责**：
- 显示模态确认对话框
- 支持 title、content、confirmText、cancelText
- 支持 danger 模式（红色确认按钮）
- 返回 Promise<boolean>（true 表示确认，false 表示取消）

**Props**：
```typescript
interface Props {
  visible: boolean;
  title?: string;
  content: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}
```

**Events**：
```typescript
interface Emits {
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}
```

**样式**：
- 居中显示，带遮罩层
- 使用项目现有的 BModal 组件样式
- 确认按钮：默认蓝色，danger 模式为红色
- 取消按钮：灰色

**交互**：
- 点击遮罩层关闭（可选配置）
- ESC 键关闭
- 点击确认/取消按钮关闭

## 5. Hook 设计

### 5.1 useInteraction.ts

**职责**：
- 封装 inject 逻辑
- 提供类型安全的 API
- 处理未注入的情况

```typescript
export function useInteraction(): InteractionAPI {
  const api = inject<InteractionAPI>('interaction');
  if (!api) {
    throw new Error('useInteraction must be used within InteractionContainer');
  }
  return api;
}
```

## 6. 文件结构

```
src/components/BChatSidebar/
├── components/
│   ├── InteractionContainer/
│   │   ├── index.vue              # 主容器组件
│   │   ├── ToastStack.vue         # Toast 堆叠组件
│   │   ├── ToastItem.vue          # 单个 Toast 组件
│   │   └── ConfirmModal.vue       # 确认对话框组件
│   ├── InputToolbar/
│   │   └── VoiceInput.vue         # 修改：使用 inject 获取 API
│   └── ...
├── hooks/
│   └── useInteraction.ts          # inject hook，方便子组件使用
└── index.vue                      # 修改：集成 InteractionContainer
```

## 7. 集成方案

### 7.1 BChatSidebar/index.vue 修改

在 ConversationView 和 input 之间添加 InteractionContainer：

```vue
<template>
  <div class="b-chat-sidebar">
    <!-- header -->
    <div class="b-chat-sidebar__container">
      <ConversationView />
      <UsagePanel />
      
      <!-- 新增：交互容器 -->
      <InteractionContainer />
      
      <div class="b-chat-sidebar__input">
        <!-- input -->
      </div>
    </div>
  </div>
</template>
```

### 7.2 VoiceInput.vue 修改

**修改前**：
```typescript
import { message } from 'ant-design-vue';
import { Modal } from '@/utils/modal';

message.error('麦克风权限未开启');
const [cancelled] = await Modal.confirm('语音组件未安装', '...');
```

**修改后**：
```typescript
import { useInteraction } from '../../hooks/useInteraction';

const { showToast, showConfirm } = useInteraction();

showToast({ type: 'error', content: '麦克风权限未开启' });
const confirmed = await showConfirm({ 
  title: '语音组件未安装', 
  content: '...' 
});
```

### 7.3 需要修改的文件

1. `src/components/BChatSidebar/index.vue` - 集成 InteractionContainer
2. `src/components/BChatSidebar/components/InputToolbar/VoiceInput.vue` - 使用 useInteraction
3. 新增 `src/components/BChatSidebar/components/InteractionContainer/` 目录及组件
4. 新增 `src/components/BChatSidebar/hooks/useInteraction.ts`

## 8. 实现优先级

1. **P0 - 核心功能**
   - InteractionContainer 组件
   - ToastStack 和 ToastItem 组件
   - ConfirmModal 组件
   - useInteraction hook

2. **P1 - 集成**
   - BChatSidebar 集成
   - VoiceInput 迁移

3. **P2 - 优化**
   - 动画效果
   - 样式细节
   - 错误处理

## 9. 测试要点

- Toast 提示正确显示和消失
- Toast 堆叠数量限制（最多 3 条）
- Confirm 对话框正确返回 Promise 结果
- ESC 键和遮罩层关闭 Confirm 对话框
- useInteraction 在未注入时抛出错误
- 所有类型（error/warning/info/success）正确显示

## 10. 注意事项

- 所有代码必须添加注释，遵循项目注释规范
- 禁止使用 `any` 类型
- 组件 Ref 类型使用 `InstanceType<typeof ComponentName>`
- 遵循项目现有的代码风格和命名规范
- 每次改动需要记录到 changelog
