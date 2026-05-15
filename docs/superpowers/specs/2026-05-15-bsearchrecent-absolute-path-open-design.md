# 2026-05-15 BSearchRecent Absolute Path Open Design

## Background

当前 `src/components/BSearchRecent/index.vue` 只会在 `filesStore.recentFiles` 中做关键字筛选。

这意味着：

- 用户只能从“最近文件记录”里搜索结果
- 如果用户已经知道某个文件的绝对路径，但该文件不在最近文件列表中，当前弹窗无法直接帮助打开
- 项目实际上已经具备按绝对路径打开文件的基础能力：`useOpenFile().openFileByPath(path)`

因此，这次需求不需要重做文件打开体系，而是要把“绝对路径输入”接入 `BSearchRecent` 的现有搜索交互。

## Goal

在最近文件搜索弹窗中支持“输入绝对路径打开文件”，并满足以下行为：

1. 当用户输入有效绝对路径且目标是普通文件时，列表中出现一个显式的“按路径打开”候选项。
2. 当存在有效绝对路径候选项时，用户按回车可以直接打开该文件。
3. 点击该候选项时，复用现有统一打开链路，不新增旁路打开逻辑。
4. 非最近文件的绝对路径文件在成功打开后，仍按现有机制进入最近文件记录与编辑器标签体系。

## Non-Goals

- 不在本次改动中引入“扫描磁盘目录并模糊搜索路径”的能力
- 不支持相对路径输入
- 不修改欢迎页、原生打开文件入口或其它文件打开入口的交互
- 不重构最近文件数据模型
- 不在本次设计中新增复杂的键盘上下选择行为

## User-Facing Behavior

### Normal Keyword Search

当输入内容不是绝对路径时：

- 保持当前最近文件关键字搜索逻辑不变
- 继续按标题、文件名、路径、内容匹配最近文件记录

### Absolute Path Candidate

当输入内容看起来是绝对路径时：

- 组件会尝试把它识别为“按路径打开”候选项
- 若路径存在且是普通文件，则在结果列表顶部显示一个单独候选项
- 候选项文案应明确表达这是“按路径打开”，避免和最近文件项混淆

展示语义固定为：

- 主标题：目标文件名
- 副标题：完整绝对路径
- 辅助说明：`按路径打开`

### Enter Key Behavior

按回车时采用以下优先级：

1. 如果当前存在有效绝对路径候选项，直接打开该路径对应文件。
2. 否则，如果最近文件筛选结果非空，打开第一条最近文件结果。
3. 否则，不执行打开动作。

这样可以兼顾“显式结果项”与“熟练用户快速回车直开”。

### Existing Open Tabs

如果输入的绝对路径对应文件已经在标签栏中打开：

- 仍然通过 `openFileByPath(path)` 进入统一打开链路
- 由现有逻辑负责复用已打开标签，而不是创建重复会话

用户感知应为“切回已打开文件”。

### Unsupported or Invalid Paths

对于以下情况，不生成可打开候选项：

- 路径不存在
- 路径存在但不是普通文件，而是目录或其它不可直接打开实体

这类输入仍保留普通关键字搜索结果展示。

如果用户输入的是绝对路径但最终没有任何可打开结果：

- 列表继续展示“没有匹配的最近文件”，或调整为空状态文案使其同时覆盖“最近文件未命中 + 路径无效”
- 本次设计不强制新增错误提示弹窗或 message 提示

## Design

### Reuse `openFileByPath()` as the Only Open Entry

绝对路径候选项的打开行为统一复用 `useOpenFile().openFileByPath(path)`。

原因：

- 该方法已经封装了“已打开标签复用”和“按路径从磁盘打开”的既有逻辑
- 避免在 `BSearchRecent` 内重复拼接文件打开、存储写入和路由跳转行为
- 可以保证新能力自动遵守最近文件与标签页体系的既有约束

### Introduce a Mixed Result Model

当前组件的 `filteredFiles` 是纯 `StoredFile[]`。

为了同时承载“最近文件结果”和“绝对路径候选项”，需要把展示层结果抽象成统一列表项，例如：

- 最近文件项
- 绝对路径候选项

设计目标不是重构整个组件，而是只把“渲染列表所需的数据结构”从单一 `StoredFile[]` 扩展为小型 union。

结果项结构固定为：

```ts
type SearchResultItem =
  | { type: 'recent-file'; file: StoredFile }
  | { type: 'absolute-path'; path: string; fileName: string };
```

这样模板层可以清晰地区分点击行为、标题文案和辅助说明。

### Path Detection Rule

组件需要一个轻量的“是否像绝对路径”判断函数。

识别规则：

- POSIX 路径：以 `/` 开头
- Windows 路径：匹配 `^[a-zA-Z]:[\\/].+`

这里的目标只是识别用户意图，不负责做复杂路径归一化。

### Path Validation Strategy

当输入被识别为绝对路径后，还需要判断它是否对应“存在的普通文件”。

本次采用以下做法：

1. 新增一个轻量平台能力，用于判断给定路径是否存在且是否为普通文件。
2. `BSearchRecent` 基于该结果决定是否生成绝对路径候选项。

新增平台能力时，优先采用以下形态：

- `native.statPath(path)`，返回 `{ exists: boolean; isFile: boolean; isDirectory: boolean }`
- 或 `native.isFilePath(path)`，直接返回布尔值

优先选择带结构返回值的能力，原因是：

- 可读性更好
- 后续若其它功能也需要判断目录/文件，不必再次扩 IPC

### Keep Validation Out of Search Filtering

最近文件关键字过滤逻辑继续保留在 `filteredFiles` 中，绝对路径候选项单独计算。

计算来源固定拆分为两部分：

1. `filteredFiles`
   负责最近文件列表的关键字过滤
2. `absolutePathCandidate`
   负责从当前输入生成“按路径打开”候选项

最终由统一的 `searchResultItems` 合并为渲染列表。

这样可以保持现有最近文件搜索逻辑简单稳定，避免把路径校验逻辑强行塞进 `files.filter(...)`。

### Enter Handling

当前输入框只有 `@keydown.esc.prevent="handleClose"`。

本次需要补充回车行为：

- `@keydown.enter.prevent="handleEnter"`

`handleEnter()` 的职责应当很单一：

1. 若存在有效绝对路径候选项，调用 `handleOpenPath(path)`
2. 否则若 `filteredFiles[0]` 存在，调用 `handleSelect(file)`
3. 否则返回

同时新增：

```ts
async function handleOpenPath(path: string): Promise<void>
```

它只负责：

1. 关闭弹窗并清空关键字
2. 调用 `openFileByPath(path)`

绝对路径候选项不复用现有 `select` 事件，避免事件载荷和语义被迫扩张。

## Affected Modules

### `src/components/BSearchRecent/index.vue`

主要改动点：

- 增加绝对路径识别与候选项生成逻辑
- 把列表渲染从纯最近文件项扩展为混合项
- 为输入框增加回车打开逻辑
- 增加路径候选项的点击分支与展示样式
- 视情况调整空状态文案

### `src/hooks/useOpenFile.ts`

无需新增打开语义，只复用已有：

- `openFileByPath(path)`

如果后续实现时发现需要额外返回值或错误信息，应作为实现细节评估，而不是本设计的前提。

### `src/shared/platform/*`

若当前渲染层没有“判断路径是否为普通文件”的能力，则需要新增一个轻量 IPC 封装。

这部分能力应保持通用，不与 `BSearchRecent` 文案或组件语义耦合。

### `electron/main/modules/file/*`

如果新增路径校验 IPC，需要在主进程文件模块补一个只读 handler，基于 `fs.stat` 或等价能力返回文件类型信息。

## Error Handling

- 路径识别失败时，按普通关键字搜索处理
- 路径存在性校验失败时，不生成路径候选项
- 点击或回车打开路径时，如果 `openFileByPath(path)` 返回 `null`，保持当前弹窗关闭后的失败语义，不额外引入复杂恢复流程
- 若路径在候选生成后到真正打开前被删除，允许打开失败；这是正常竞争条件，由统一打开链路决定是否提示

## Testing

需要补充的验证重点：

1. 输入普通关键字时，最近文件搜索结果与现有行为一致。
2. 输入有效绝对路径且文件不在最近文件列表中时，列表顶部出现“按路径打开”候选项。
3. 输入有效绝对路径后点击候选项，可以成功打开文件并进入编辑器。
4. 输入有效绝对路径后按回车，可以直接打开文件。
5. 输入有效绝对路径且该文件已在标签栏打开时，应复用现有标签，而不是产生重复会话。
6. 输入不存在的绝对路径时，不应出现可打开候选项。
7. 输入目录路径时，不应出现可打开候选项。
8. 当既有最近文件结果又有绝对路径候选项时，回车优先打开绝对路径候选项。

## Open Question Resolution

本次需求明确采用以下结论：

- 绝对路径输入既要有显式结果项，也要支持回车直开
- 非 Markdown 文件不做额外限制，只要是存在的普通文件，就交给现有统一打开链路处理
