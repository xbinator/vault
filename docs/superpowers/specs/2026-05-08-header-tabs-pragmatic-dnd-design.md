/**
 * @file 2026-05-08-header-tabs-pragmatic-dnd-design.md
 * @description HeaderTabs 使用 Pragmatic Drag and Drop 替换原生拖拽实现的设计说明。
 */

# HeaderTabs Pragmatic Drag and Drop 替换设计

## 背景

当前 `src/layouts/default/components/HeaderTabs.vue` 使用原生 HTML Drag and Drop 事件配合 `src/layouts/default/components/headerTabDrag.ts` 完成标签页排序、插入位置计算和边缘自动滚动。

这套实现已经具备可用性，且通过 `tabsStore.moveTab(fromId, toId, position)` 将排序结果收敛到稳定的 store 接口，业务边界比较清晰。但拖拽层本身仍然需要组件手动处理以下职责：

- 原生 `dragstart`、`dragover`、`drop`、`dragend` 的事件时序
- 基于几何信息的命中计算与插入位置判断
- 指针靠近容器边缘时的横向自动滚动
- 拖拽态视觉状态和拖后误点击抑制

随着拖拽体验复杂度提升，这些逻辑会继续堆积在组件侧，增加维护成本和交互回归风险。

本次设计目标是在不改变现有标签页业务行为的前提下，引入 Pragmatic Drag and Drop 作为新的拖拽基础设施，并同时接入官方 auto-scroll 能力，替换当前手写拖拽实现。

## 目标

- 使用 Pragmatic Drag and Drop 替换 `HeaderTabs.vue` 的原生拖拽事件实现
- 保持 `tabsStore.moveTab(fromId, toId, position)` 作为唯一排序入口
- 将拖拽注册、命中计算、自动滚动和状态清理从组件中抽离
- 保留当前标签栏的核心交互与视觉反馈
- 为后续更复杂的拖拽体验预留结构化扩展空间

## 非目标

- 不修改 `tabsStore` 的排序、持久化和标签数据结构
- 不新增跨区域拖拽、多窗口拖出、标签分组等新能力
- 不重做标签栏的视觉样式和布局结构
- 不在本次替换中顺带调整关闭、切换、滚轮滚动等非拖拽交互策略

## 依赖

新增以下 npm 包：

| 包名 | 用途 |
|------|------|
| `@atlaskit/pragmatic-drag-and-drop` | 核心拖拽引擎：`draggable()`、`dropTargetForElements()`、`monitorForElements()` |
| `@atlaskit/pragmatic-drag-and-drop-auto-scroll` | 官方自动滚动插件，替换手写的 `getHeaderTabAutoScrollDelta()` + `scrollHeaderTabsByPointer()` |
| `@atlaskit/pragmatic-drag-and-drop-hitbox` | 命中区域工具集，提供 `closestEdge()` 等辅助函数，简化 `before \| after` 判断 |

三个包需要同时安装，版本锁定为同一主版本号以避免内部 API 不兼容。

## 推荐方案

### 总体思路

保留现有标签页组件的模板结构、样式类名和 store 排序接口，仅替换底层拖拽实现。新的拖拽实现基于 Pragmatic Drag and Drop 负责：

- 为每个标签注册 draggable 能力
- 为每个标签注册 drop target 能力
- 根据命中区域判断插入到目标标签前方或后方
- 在拖拽期间维护视觉状态所需的响应式数据
- 在 drop 成功后调用 `tabsStore.moveTab(...)`
- 在拖拽靠近边缘时触发官方 auto-scroll
- 提供拖拽预览 (drag preview)，替代浏览器默认 ghost 图像

组件本身继续负责：

- 渲染 tabs 列表
- 根据状态生成 class
- 点击标签切换路由
- 点击关闭按钮关闭标签
- 拖拽结束后的误点击抑制

### 组件与拖拽层职责划分

`src/layouts/default/components/HeaderTabs.vue` 调整为薄组件，仅保留 UI 与业务交互：

- `tabsStore.tabs` 渲染
- `handleClickTab`
- `handleCloseTab`
- 基于拖拽状态的 class 绑定
- 维护滚动容器 `ref`
- 提供每个标签的 DOM 元素引用（通过 Vue 模板 ref 函数形式）

新增拖拽模块 `src/layouts/default/components/useHeaderTabsPragmaticDrag.ts`，负责：

- 接收滚动容器、标签列表和排序回调
- 为容器与标签元素建立 Pragmatic Drag and Drop 注册
- 输出响应式状态：`draggingTabId`、`dropTargetTabId`、`dragInsertPosition`
- 在组件卸载时统一清理注册和副作用

#### Vue 响应式桥接

Pragmatic Drag and Drop 的命令式回调（`onDragStart`、`onDropTargetChange`、`onDrop` 等）在 Vue 响应式系统外部执行。拖拽模块内部通过以下方式桥接：

1. 在 composition API 中创建 `shallowRef` 保存拖拽状态
2. 在 Pragmatic 回调中通过 `ref.value = newValue` 写入（该操作已被 Vue 代理为响应式更新）
3. 回调中避免对 `reactive()` 对象做整体替换，改为逐字段更新
4. 对于高频回调（如 `onDrag` 中的位置更新），使用 `requestAnimationFrame` 节流以减少不必要的渲染

#### 元素注册与生命周期

Vue `v-for` 中的 DOM 元素通过模板 ref 函数形式获取：

```typescript
// 在 setup 中维护 Map<tabId, HTMLElement>
const tabElements = new Map<string, HTMLElement>()

const setTabElement = (tabId: string) => (el: HTMLElement | null) => {
  if (el) {
    tabElements.set(tabId, el)
    dragModule.registerTabElement(tabId, el)
  } else {
    // el 为 null 时表示该元素已卸载，执行清理
    dragModule.unregisterTabElement(tabId)
    tabElements.delete(tabId)
  }
}
```

拖拽模块内部维护注册表：每个 `registerTabElement` 调用内部执行 `draggable({ element })` 和 `dropTargetForElements({ element })`，返回的 `cleanup` 函数存入 `Map<tabId, () => void>`。`unregisterTabElement` 时调用对应 cleanup 并移除记录。`onUnmounted` 时遍历清理所有剩余注册。

### 命中与排序模型

排序结果继续沿用现有 store 接口：

- `fromId`: 被拖拽标签 ID
- `toId`: 目标标签 ID
- `position`: `'before' | 'after'`

视觉表现继续沿用现有 class：

- `is-dragging`
- `is-drop-before`
- `is-drop-after`

命中判断的目标是保留当前用户体验，即以目标标签的横向中点作为分界：

- 指针落在目标标签中点左侧，视为插入到该标签前方
- 指针落在目标标签中点右侧，视为插入到该标签后方

#### 命中判断数据流

Pragmatic 的 `dropTargetForElements` 告知"拖到了哪个元素上"，但不直接输出 `before | after`。在 `monitorForElements` 的 `onDrag` 回调中，按以下步骤计算插入位置：

1. 从 `location.current.dropTarget` 获取当前悬停的目标标签 ID
2. 从 `location.current.input.clientX` 获取鼠标指针 X 坐标
3. 使用 `@atlaskit/pragmatic-drag-and-drop-hitbox` 的 `closestEdge()` 判定指针在目标元素的左侧或右侧
4. 将 `closestEdge` 结果映射为 `'before' | 'after'`（left edge → before, right edge → after）

`getHeaderTabDropSlot()` 的现有排序逻辑（遍历所有 tab rect 找到第一个中心点在指针右侧的标签）可废弃，因为 Pragmatic 的 `dropTargetForElements` 已经内置了元素碰撞检测。

### 拖拽预览 (Drag Preview)

浏览器原生拖拽会生成默认 ghost 图像（标签的半透明副本跟随指针）。Pragmatic Drag and Drop 不会生成该效果，需要自行实现：

- 不实现复杂自定义 preview：保留浏览器原生 ghost 行为——在 `onGenerateDragPreview` 回调中调用 `setNativeDragPreview`，将当前拖拽元素作为原生预览源
- 通过 `nativeSetDragImage` 控制 ghost 外观（偏移量、透明度等），保证与现有体验一致
- 拖拽期内对源标签应用 `opacity: 0.4` 样式（`is-dragging` class），替代原生 ghost 的占位感

### 自动滚动策略

本次替换同步接入 Pragmatic Drag and Drop 官方 auto-scroll 能力，目标是替换 `scrollHeaderTabsByPointer()` 这一套手写逻辑。

使用 `@atlaskit/pragmatic-drag-and-drop-auto-scroll` 的 `autoScrollForElements`，传入以下配置：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `element` | 滚动容器 ref | 横向滚动容器 DOM |
| `canScroll()` | `({ source }) => location.current.dropTarget !== null` | 仅在拖拽进行中启用 |
| `getConfiguration()` | 按边缘距离计算加速度 | 细节见下方 |

`getConfiguration` 内部行为：

- 当指针靠近容器左右边缘 48px 时触发
- 滚动速度与指针距边缘的距离成反比，最大 18px/帧
- 仅横向滚动（`axis: 'horizontal'`）

这些参数与当前手写 `getHeaderTabAutoScrollDelta()` 的行为一致，通过调整 auto-scroll 内置参数（如 `maxScrollSpeed`、`timeDampeningDuration`、`ease` 函数）微调手感。

如果官方 auto-scroll 初始化失败（如 DOM 不可用），捕获异常并打印 warning，但不阻断基础拖拽排序功能。

## 模块结构建议

### 保留并收缩 `headerTabDrag.ts`

`src/layouts/default/components/headerTabDrag.ts` 当前承担了：

- 几何矩形类型定义
- 插入位置计算
- drop slot 计算
- 边缘自动滚动距离计算

迁移后收缩为：

- **保留**：`TabMovePosition` 类型（`'before' | 'after'`）、`HeaderTabRect` 等与业务语义绑定的类型定义
- **新增**：`closestEdgeToMovePosition()` 转换函数——将 `ClosestEdge` 枚举映射到 `TabMovePosition`
- **移除**：`getHeaderTabMovePosition()`、`getHeaderTabDropSlot()`、`getHeaderTabAutoScrollDelta()` 等已被库替代的纯计算函数

### 新增拖拽组合模块

新增 `src/layouts/default/components/useHeaderTabsPragmaticDrag.ts`，对外暴露：

- `registerTabElement(tabId, element)` — 注册拖拽/放置能力，返回 cleanup 函数
- `unregisterTabElement(tabId)` — 注销并清理
- `draggingTabId` — `Ref<string | null>`，当前拖拽中的标签 ID
- `dropTargetTabId` — `Ref<string | null>`，当前悬停的目标标签 ID
- `dragInsertPosition` — `Ref<'before' | 'after' | null>`，插入位置
- `cleanup()` — 全局清理，组件 `onUnmounted` 时调用

该模块内部负责封装 Pragmatic Drag and Drop 的库调用，避免业务组件直接依赖大量底层细节。

## 数据流

1. `HeaderTabs.vue` 渲染 tabs 列表，通过模板 ref 函数将每个标签的 DOM 元素传给拖拽模块
2. 拖拽模块将标签元素注册为 draggable 和 drop target，并注册全局 monitor
3. 用户开始拖拽后，monitor 的 `onDragStart` 回调写入 `draggingTabId`（Vue ref）
4. 用户悬停目标标签时，`onDrag` 回调通过 `closestEdge()` 计算 `dragInsertPosition` 和 `dropTargetTabId`，写入响应式 ref
5. 组件根据响应式状态渲染插入指示线与拖拽态样式（`is-dragging`、`is-drop-before`、`is-drop-after`）
6. 用户释放拖拽后，`onDrop` 回调读取当前 `fromId`、`toId`、`position`，调用 `tabsStore.moveTab(fromId, toId, position)`
7. 模块清理拖拽态（重置所有 ref 为 null），并通知组件记录拖拽结束时间，用于抑制误点击

### `-webkit-app-region` 共存方案

Electron 顶栏使用 `-webkit-app-region: drag`  + `no-drag` 组合。Pragmatic Drag and Drop 基于 pointer events 实现，与 Electron 的 OS 级窗口拖拽在以下维度共存：

1. **标签元素**保持 `-webkit-app-region: no-drag`，使 pointer events 优先传递给标签的 draggable 注册
2. **关闭按钮**保持 `no-drag`，其 `@click` 事件不受影响
3. **标签间隙**（容器 padding/margin 区域）保持 `drag` 属性，保留窗口拖拽能力
4. 由于 Pragmatic 使用 `pointerdown` → `pointermove` 管线，而 Electron 的 `drag` 区域依赖 `mousedown` 开始窗口拖拽，两者事件管线天然隔离

## 错误处理

- 若拖拽源或目标标签 ID 缺失，则忽略本次 drop 并清理状态
- 若拖拽目标与源标签相同，则不触发排序
- 若拖拽过程中目标元素已卸载或无法解析，则不执行排序
- 若 auto-scroll 初始化失败，不应影响基础拖拽排序功能，但需要 `console.warn` 输出便于排查
- 若 `closestEdge()` 无法确定位置（指针恰在中点或元素尺寸为 0），默认视为 `'after'`

## 测试策略

### 单元测试

- 为 `closestEdgeToMovePosition()` 转换函数补充测试，覆盖 `left` → `'before'`、`right` → `'after'` 映射
- 为 drop 结果到 `moveTab` 参数的映射补充测试
- 为拖拽结束后的状态清理逻辑补充测试
- 验证 `unregisterTabElement` 调用后对应的 cleanup 函数被正确执行

### 组件测试

- 拖拽某个标签到目标标签前方时，触发正确排序
- 拖拽某个标签到目标标签后方时，触发正确排序
- 首个和末尾位置插入结果正确
- 拖拽结束后短时间内点击标签，不应误触发路由切换
- 关闭按钮点击行为不受拖拽注册影响
- 标签关闭后对应的 draggable/drop target 回调已清理（无内存泄漏）

### 手动验证

- 横向滚动容器在拖拽靠近左右边缘时可以自动滚动
- 深色和浅色主题下插入指示线与拖拽态样式表现正常
- Electron 顶栏场景下，`-webkit-app-region: drag` 不会破坏标签拖拽和点击
- 鼠标滚轮横向滚动仍然可用
- 拖拽标签时浏览器默认 ghost 图像不出现（被 `setNativeDragPreview` 替代）

## 风险与缓解

### Electron 顶栏拖拽区域冲突

标签栏容器使用了 `-webkit-app-region: drag`，标签本身使用 `-webkit-app-region: no-drag`。Pragmatic 基于 pointer events，与 Electron 的 OS 窗口拖拽使用不同的底层机制，理论上不冲突。但必须在真实 Electron 环境中验证，不应只依赖浏览器环境判断行为正确。

缓解方式：
- 保留标签元素的 `no-drag` 边界
- 标签间隙保持 `drag` 属性，保证窗口拖拽可用
- 将验收重点放在真实桌面端交互回归

### 关闭按钮与拖拽竞争

关闭按钮位于 draggable 元素内部。Pragmatic 的 `draggable()` 默认在 `pointerdown` 后等待一定距离/时间才触发拖拽（sensor 机制），短促的点击不会进入拖拽流程，天然避免了与关闭按钮的竞争。

缓解方式：在组件测试与手动验证中覆盖该场景，确认关闭按钮的 `@click.stop` 在 Pragmatic 注册下仍然正常触发。

### 自动滚动体验变化

官方 auto-scroll 接入后，滚动速度、触发边界和惯性感受可能与当前手写逻辑不同。

缓解方式：
- 通过 `getConfiguration()` 参数（`maxScrollSpeed`、`timeDampeningDuration`、触发边距）调优，对标现有 48px 边缘 / 18px/帧 手感
- 第一版优先保证"功能正确"，预留参数调优空间
- 不为了完全复刻旧手感而同时保留双实现

### 拖拽预览与原生 ghost 差异

Pragmatic 不生成原生 ghost，需要自行处理。通过 `setNativeDragPreview` 桥接原生预览，避免视觉上出现"拖了一个空白"的异常表现。

缓解方式：实现阶段验证 `setNativeDragPreview` 在 Electron 环境下的兼容性，如果不可用则降级为纯 CSS 方案（`is-dragging` opacity + 自定义 follow-cursor 元素）。

## 实施边界

本次实施仅覆盖 `HeaderTabs` 单列表横向排序替换，不扩展到其他拖拽场景。验收通过后，再评估是否将相同模式推广到其他交互区域。

## 待实现文件

- `src/layouts/default/components/HeaderTabs.vue` — 移除原生拖拽事件，接入拖拽模块
- `src/layouts/default/components/headerTabDrag.ts` — 收缩为类型定义 + 转换函数
- `src/layouts/default/components/useHeaderTabsPragmaticDrag.ts` — 新增拖拽模块
- `src/stores/tabs.ts` — 不变，仅作为排序目标
- `package.json` — 新增 3 个依赖
- `pnpm-lock.yaml` — 由 `pnpm install` 自动更新
- `test/layouts/default/headerTabDrag.test.ts` — 更新测试以覆盖新转换逻辑
- `test/layouts/default/useHeaderTabsPragmaticDrag.test.ts` — 新增拖拽模块单元测试
