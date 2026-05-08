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

## 推荐方案

### 总体思路

保留现有标签页组件的模板结构、样式类名和 store 排序接口，仅替换底层拖拽实现。新的拖拽实现基于 Pragmatic Drag and Drop 负责：

- 为每个标签注册 draggable 能力
- 为每个标签注册 drop target 能力
- 根据命中区域判断插入到目标标签前方或后方
- 在拖拽期间维护视觉状态所需的响应式数据
- 在 drop 成功后调用 `tabsStore.moveTab(...)`
- 在拖拽靠近边缘时触发官方 auto-scroll

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

新增拖拽模块，例如 `src/layouts/default/components/useHeaderTabsPragmaticDrag.ts`，负责：

- 接收滚动容器、标签列表和排序回调
- 为容器与标签元素建立 Pragmatic Drag and Drop 注册
- 输出 `draggingTabId`、`dropTargetTabId`、`dragInsertPosition`
- 在组件卸载时统一清理注册和副作用

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

如果 Pragmatic Drag and Drop 的默认 hitbox 结果不能完整表达该体验，则在拖拽模块中增加一层轻量适配，将库提供的目标信息转换成当前业务所需的 `before | after` 语义。

### 自动滚动策略

本次替换同步接入 Pragmatic Drag and Drop 官方 auto-scroll 能力，目标是替换 `scrollHeaderTabsByPointer()` 这一套手写逻辑。

自动滚动的行为要求如下：

- 仅在拖拽进行中启用
- 仅作用于标签栏横向滚动容器
- 当指针靠近左右边缘时触发横向滚动
- 不影响当前已有的滚轮横向滚动交互

如果官方 auto-scroll 的默认滚动强度与当前体验差异较大，允许通过参数调优实现接近现有手感，但不保留并行的手写滚动实现。

## 模块结构建议

### 保留并收缩 `headerTabDrag.ts`

`src/layouts/default/components/headerTabDrag.ts` 当前承担了：

- 几何矩形类型定义
- 插入位置计算
- drop slot 计算
- 边缘自动滚动距离计算

迁移后建议做如下收缩：

- 保留仍然有价值的纯类型或纯业务转换逻辑
- 移除已经被 Pragmatic Drag and Drop 与官方 auto-scroll 接管的几何计算和滚动函数
- 避免留下两套同时可用的拖拽命中模型

### 新增拖拽组合模块

建议新增 `src/layouts/default/components/useHeaderTabsPragmaticDrag.ts`，对外暴露：

- `registerTabElement(tabId, element)` 或等价的元素注册接口
- `draggingTabId`
- `dropTargetTabId`
- `dragInsertPosition`
- `handleDragInteractionEnd()` 或等价的拖拽完成回调

该模块内部负责封装 Pragmatic Drag and Drop 的库调用，避免业务组件直接依赖大量底层细节。

## 数据流

1. `HeaderTabs.vue` 渲染 tabs 列表并注册每个标签元素
2. 拖拽模块将标签元素注册为 draggable 和 drop target
3. 用户开始拖拽后，模块更新 `draggingTabId`
4. 用户悬停目标标签时，模块计算目标标签与 `before | after` 插入位置
5. 组件根据响应式状态渲染插入指示线与拖拽态样式
6. 用户释放拖拽后，模块调用 `tabsStore.moveTab(fromId, toId, position)`
7. 模块清理拖拽态，并通知组件记录拖拽结束时间，用于抑制误点击

## 错误处理

- 若拖拽源或目标标签 ID 缺失，则忽略本次 drop 并清理状态
- 若拖拽目标与源标签相同，则不触发排序
- 若拖拽过程中目标元素已卸载或无法解析，则不执行排序
- 若 auto-scroll 初始化失败，不应影响基础拖拽排序功能，但需要保留清晰的实现边界，便于后续排查

## 测试策略

### 单元测试

- 为插入位置转换逻辑补充测试，覆盖 `before` 与 `after`
- 为 drop 结果到 `moveTab` 参数的映射补充测试
- 为拖拽结束后的状态清理逻辑补充测试

### 组件测试

- 拖拽某个标签到目标标签前方时，触发正确排序
- 拖拽某个标签到目标标签后方时，触发正确排序
- 首个和末尾位置插入结果正确
- 拖拽结束后短时间内点击标签，不应误触发路由切换
- 关闭按钮点击行为不受拖拽注册影响

### 手动验证

- 横向滚动容器在拖拽靠近左右边缘时可以自动滚动
- 深色和浅色主题下插入指示线与拖拽态样式表现正常
- Electron 顶栏场景下，`-webkit-app-region: drag` 不会破坏标签拖拽和点击
- 鼠标滚轮横向滚动仍然可用

## 风险与缓解

### Electron 顶栏拖拽区域冲突

标签栏容器使用了 `-webkit-app-region: drag`，标签本身使用 `-webkit-app-region: no-drag`。新的拖拽注册需要在真实 Electron 环境中验证，不应只依赖浏览器环境判断行为正确。

缓解方式是保留标签元素的 `no-drag` 边界，并将验收重点放在真实桌面端交互回归。

### 关闭按钮与拖拽竞争

关闭按钮位于 draggable 元素内部，若事件绑定或命中处理不当，可能出现点击关闭时意外触发拖拽。

缓解方式是保留按钮层的独立点击交互，并在组件测试与手动验证中覆盖该场景。

### 自动滚动体验变化

官方 auto-scroll 接入后，滚动速度、触发边界和惯性感受可能与当前手写逻辑不同。

缓解方式是在第一版中优先保证“功能正确”，并预留参数调优空间，不为了完全复刻旧手感而同时保留双实现。

## 实施边界

本次实施仅覆盖 `HeaderTabs` 单列表横向排序替换，不扩展到其他拖拽场景。验收通过后，再评估是否将相同模式推广到其他交互区域。

## 待实现文件

- `src/layouts/default/components/HeaderTabs.vue`
- `src/layouts/default/components/headerTabDrag.ts`
- `src/layouts/default/components/useHeaderTabsPragmaticDrag.ts`
- `src/stores/tabs.ts`
- `package.json`
- `pnpm-lock.yaml`
- 相关测试文件
