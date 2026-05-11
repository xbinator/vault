# 编辑器设置重构设计

## 背景

当前编辑器相关配置分散在多处：

- `src/stores/setting.ts` 中持有 `showOutline`、`sourceMode`、`editorPageWidth`
- `src/views/editor/hooks/useAutoSave.ts` 负责最近文件草稿持久化
- `src/views/editor/hooks/useSession.ts` 负责真实磁盘写入、另存为、文件恢复和 watcher 协调

这套结构在功能增长后出现了两个问题：

- “编辑器视图偏好”和“全局应用设置”混在同一个 store 中，边界越来越模糊
- `useAutoSave` 的名字容易让人误解为“自动写盘”，但它实际只负责应用内部草稿持久化

现在需要新增一个正式的“编辑器设置”模块，并把现有零散配置归拢起来。同时，用户希望引入真正的保存策略设置：

- `manual`：主动保存
- `onBlur`：失去焦点保存
- `onChange`：内容更新后自动保存到磁盘

这里的“保存”明确指写回磁盘文件，而不是只写应用草稿。

## 目标

- 新增独立的编辑器设置存储，承载视图与保存策略配置。
- 将现有 `showOutline`、`sourceMode`、`editorPageWidth` 从 `settingStore` 中迁出。
- 在设置中心新增“编辑器”一级页面，统一展示编辑器相关设置。
- 将“草稿持久化”和“真实写盘策略”拆成两层明确职责。
- 保证未落盘文档不会因自动保存策略弹出保存对话框或被意外中断。

## 非目标

- 本次不支持快捷键自定义。
- 本次不支持回车行为配置。
- 本次不支持粘贴行为配置。
- 本次不支持按文档或按标签页覆盖全局编辑器设置。
- 本次不提供自动保存延迟的用户可配置项，先使用代码内固定默认值。

## 方案对比

### 方案一：继续扩展 `settingStore`

继续在 `src/stores/setting.ts` 中增加编辑器行为设置，并让编辑器页面直接消费。

优点：

- 改动面最小，接入路径最短。
- 现有迁移和持久化代码可以直接复用。

缺点：

- `settingStore` 会继续膨胀。
- 编辑器偏好与全局应用设置边界继续变差。
- 后续再加入更多编辑器能力时可维护性较差。

### 方案二：新建 `editorPreferences`，并在运行时增加保存策略执行层

新增独立 store，例如 `src/stores/editorPreferences.ts`，专门负责持久化编辑器偏好；编辑器运行时再通过组合式模块解释这些偏好并落成实际行为。

优点：

- 编辑器偏好与全局应用设置边界清晰。
- “用户配置”和“运行时保存执行”职责拆分明确。
- 后续新增更多编辑器设置时有稳定归属。

缺点：

- 需要做一次旧设置迁移。
- 需要梳理 `useSession` 与 `useAutoSave` 的命名和职责边界。

### 方案三：拆成多个局部 store

将视图设置、保存设置分别做成多份 store，由不同页面或 hook 自行组合。

优点：

- 理论上职责最细。

缺点：

- 对当前需求来说过度设计。
- 设置页消费路径会变复杂。
- 跨模块同步和迁移成本更高。

## 结论

采用方案二：

- 新建独立的 `editorPreferences` store
- 将视图偏好与保存策略统一放入该 store
- `useAutoSave` 继续只负责应用草稿持久化
- `useSession` 新增真实写盘策略执行层，负责 `manual / onBlur / onChange`

## 数据设计

### 新增类型

建议在 `src/stores/editorPreferences.ts` 中新增以下类型：

```ts
export type EditorViewMode = 'rich' | 'source';
export type EditorPageWidth = 'default' | 'wide' | 'full';
export type EditorSaveStrategy = 'manual' | 'onBlur' | 'onChange';
```

### 持久化结构

建议使用独立存储键，例如：

- `editor_preferences`

持久化结构建议如下：

```ts
interface PersistedEditorPreferences {
  viewMode: EditorViewMode;
  showOutline: boolean;
  pageWidth: EditorPageWidth;
  saveStrategy: EditorSaveStrategy;
}
```

默认值建议如下：

```ts
const DEFAULT_EDITOR_PREFERENCES: PersistedEditorPreferences = {
  viewMode: 'rich',
  showOutline: true,
  pageWidth: 'default',
  saveStrategy: 'manual'
};
```

### 迁移策略

首次加载 `editorPreferences` 时，按以下顺序读取：

1. 优先读取新的 `editor_preferences`
2. 若不存在，则回退读取 `src/stores/setting.ts` 的旧字段：
   - `sourceMode`
   - `showOutline`
   - `editorPageWidth`
3. 将旧值映射为新结构后写入 `editor_preferences`
4. 后续不再继续写回旧字段

字段映射规则：

- `sourceMode: true` -> `viewMode: 'source'`
- `sourceMode: false` -> `viewMode: 'rich'`
- `showOutline` -> `showOutline`
- `editorPageWidth` -> `pageWidth`
- `saveStrategy` 为新增字段，无旧值时默认 `manual`

### Store Action

`editorPreferences` 至少提供以下 action：

- `setViewMode(mode: EditorViewMode): void`
- `setShowOutline(show: boolean): void`
- `setPageWidth(width: EditorPageWidth): void`
- `setSaveStrategy(strategy: EditorSaveStrategy): void`
- `persistPreferences(): void`

如当前系统菜单仍依赖选中态同步，则保留：

- `syncNativeMenuState(): void`

它负责同步：

- 视图模式选中态
- 大纲显示选中态
- 页宽选中态

本次不为保存策略增加系统菜单入口。

## 运行时职责拆分

### 应用草稿持久化

`src/views/editor/hooks/useAutoSave.ts` 继续保留，但职责定义要明确为：

- 监听内容变化
- 将当前文档内容写入最近文件存储
- 维护应用内草稿恢复能力

它不负责：

- 真实磁盘写入
- 另存为
- 文件丢失恢复
- 保存策略解释

如果命名允许调整，建议后续将其重命名为更贴近语义的名称，例如 `useDraftPersistence`，但本次实现不强制改名。

### 真实写盘策略

建议在 `src/views/editor/hooks/` 下新增保存策略执行层，例如：

- `useSavePolicy.ts`

它不直接持久化设置，而是消费 `editorPreferences.saveStrategy` 并在运行时决定何时触发磁盘保存。

这个执行层应由 `useSession` 驱动，因为只有 `useSession` 同时掌握：

- 当前文件是否已有 `path`
- `saveWithDialog()`
- 文件丢失恢复逻辑
- watcher 同步
- dirty 状态收尾

## 保存策略设计

### 统一原则

- 三种策略都以真实磁盘写入为目标。
- 未落盘文档不会因自动策略弹出保存对话框。
- 未落盘文档始终继续写入应用草稿。
- 自动写盘只在“已有磁盘路径且内容已变脏”时生效。

### `manual`

行为定义：

- 仅在用户主动触发保存时写盘。
- 内容变化仍持续写入应用草稿。

### `onBlur`

行为定义：

- 当前文件已有磁盘路径。
- 用户编辑后文档进入 dirty 状态。
- 编辑器失去焦点时，触发一次真实写盘。

边界要求：

- 未发生实际修改时不写盘。
- 应监听编辑器可编辑区域的失焦，而不是整个页面容器的失焦。
- 如果正在保存中，后续 blur 事件不应重复触发并发写入。

### `onChange`

行为定义：

- 当前文件已有磁盘路径。
- 内容变化后按固定 debounce 自动写盘。

默认延迟建议：

- `600ms` 到 `1000ms`

本次建议先使用固定值 `800ms`，后续若需要再开放为设置项。

边界要求：

- 不应每个字符都立刻写盘。
- 正在保存时如果又有新变更，需合并为下一轮保存，而不是并发写盘。

## `useSession` 重构设计

### 抽取无交互写盘入口

当前 `onSave()` 同时承担了：

- 确保当前文件已入最近文件存储
- 处理缺失文件恢复
- 处理另存为
- 写回已有路径
- 更新 watcher 和 dirty 状态

这条路径适合手动保存，但不适合被自动保存策略直接复用。因为自动策略不应触发保存对话框，也不应在未落盘文档上打断用户。

建议在 `useSession` 内抽出一个无交互写盘入口，例如：

- `saveCurrentFileToDisk(): Promise<boolean>`

职责：

- 仅在当前文件已有 `path` 时执行 `native.writeFile(...)`
- 调用 `fileStateActions.markCurrentContentSaved()`
- 清理 missing / dirty 状态
- 返回是否真的完成了写盘

不负责：

- 弹 `saveWithDialog()`
- 恢复丢失文件的交互确认
- 创建新路径

### 保留手动保存完整流程

`onSave()` 继续保留现有交互式保存语义：

- 未落盘文件触发 `saveWithDialog()`
- 缺失文件走恢复或另存为分支
- 已落盘文件直接写回

这样可保证“自动保存策略”和“主动保存”共享底层写盘能力，但交互边界保持清楚。

### 自动策略挂载点

建议自动策略执行层从 `useSession` 获取：

- 当前文件状态
- dirty 状态
- 是否已有路径
- `saveCurrentFileToDisk()`

并向外暴露：

- `handleEditorBlur(): Promise<void>`
- `notifyContentChanged(): void`
- `dispose(): void`

其中：

- `handleEditorBlur()` 供编辑器组件失焦时调用
- `notifyContentChanged()` 供内容变化监听触发
- `dispose()` 负责清理 debounce 和监听资源

## 编辑器组件接入

### 视图偏好接入

`src/views/editor/index.vue` 当前通过 `settingStore.sourceMode` 和 `settingStore.showOutline` 驱动 `BEditor`。

本次改为消费 `editorPreferences`：

- `viewMode`
- `showOutline`

页宽也改为从 `editorPreferences.pageWidth` 读取。

### 失焦事件接入

为了支持 `onBlur`，需要在 `BEditor` 或其实际可编辑子组件上暴露失焦事件。

建议原则：

- 以编辑器主编辑区域为准
- 富文本与源码模式都统一对外抛出 `blur` 语义
- 页面层不依赖 DOM 细节，只消费统一事件

若 `BEditor` 当前没有统一失焦事件，建议新增例如：

- `@editor-blur`

由内部富文本与源码编辑器分别转发。

### 内容变化事件接入

`onChange` 保存策略不需要新增新的内容数据源，可以复用当前文档内容变化链路。

建议做法：

- 在 `useSession` 内继续观察 `fileState.value.content`
- 变化后先走草稿持久化
- 再由保存策略执行层决定是否触发真实写盘

这样可以避免重复在 `BEditor` 组件树中新增额外状态源。

## 设置页设计

### 菜单结构

在 `src/views/settings/constants.ts` 中新增一级菜单：

- `editor`

文案：

- `编辑器`

图标建议：

- `lucide:square-pen`

### 路由结构

在 `src/router/routes/modules/settings.ts` 中新增：

- `/settings/editor`

页面建议放在：

- `src/views/settings/editor/index.vue`

### 页面内容

页面分为两个 section：

#### 视图

- 默认视图模式：`富文本 / 源码`
- 页面宽度：`默认 / 宽版 / 全宽`
- 显示大纲：开关

#### 保存

- 保存策略：`主动保存 / 失去焦点保存 / 更新即保存`
- 说明文案：
  - 未保存到磁盘的文档仍只会保存到应用草稿
  - 自动保存策略仅对已有磁盘路径的文档生效

### 组件建议

第一版不必抽过度复杂的设置框架，可沿用当前 settings 页面风格，使用：

- section 标题
- 单行配置项
- `BSelect`、`ASwitch` 或现有通用控件

如后续设置项增多，再抽统一的 `SettingItem` 组件。

## 菜单与兼容性

### 系统菜单

若现有系统菜单仍提供：

- 源码模式切换
- 大纲显示切换
- 页宽切换

则这些入口需改为调用 `editorPreferences` 而不是 `settingStore`。

### 向后兼容

旧版本用户升级后：

- 原有的大纲显示偏好保留
- 原有的默认源码模式偏好保留
- 原有的页宽偏好保留
- 新增保存策略默认值为 `manual`

用户无需手动重新配置已有视图偏好。

## 风险

### watcher 自触发循环

`onChange` 自动写盘后，文件 watcher 可能感知到刚刚落盘的变化。如果现有 watcher 无法正确识别“这是当前会话自己写出的最新内容”，可能会出现：

- 重复回填
- dirty 状态闪烁
- 误判外部变更

实现时需要优先验证这一点。

### blur 触发点选择不当

如果失焦绑定在页面容器而不是实际编辑区，可能会导致：

- 打开下拉框也触发保存
- 点击无关 UI 频繁触发保存

因此 blur 事件必须由编辑器本身对外提供统一语义。

### 自动写盘重入

如果一次写盘尚未完成时又发生新的自动保存触发，可能造成并发写盘和状态错乱。需要在保存策略执行层增加：

- 保存中锁
- 待补写标记或下一轮调度

## 验证方案

### 迁移验证

- 旧用户首次启动后，原有 `showOutline`、`sourceMode`、`editorPageWidth` 被正确迁移
- 新 store 写入成功，旧字段不再继续作为主数据源

### 保存策略验证

- `manual` 下仅主动保存会写盘
- `onBlur` 下编辑后失焦会写盘
- `onChange` 下编辑后 debounce 写盘
- 无磁盘路径文档在三种策略下都不会自动弹保存框

### 状态一致性验证

- 自动写盘后 dirty 状态正确清除
- watcher 不会把本次自写入误判为外部变更
- 切换保存策略后，当前已打开编辑器实例即时生效

### 页面验证

- 设置页可正确读写所有编辑器偏好
- 编辑器页无需刷新即可响应视图设置变化

## 实施顺序建议

1. 新建 `editorPreferences` store，并完成旧字段迁移
2. 将编辑器视图设置从 `settingStore` 切换到 `editorPreferences`
3. 抽取 `useSession` 中的无交互写盘入口
4. 新增保存策略执行层，并完成 `manual / onBlur / onChange`
5. 在 `BEditor` 对外暴露统一的编辑器失焦事件
6. 新增 `/settings/editor` 页面并接入偏好读写
7. 补充迁移与保存策略验证
