# write_file 工具：无工作区相对路径降级为应用内草稿

## 背景

当前 `write_file` 在“无工作区根目录 + 相对路径”场景下会直接失败，并返回：

`未配置工作区根目录时只能写入绝对路径文件`

这导致模型在无工作区上下文里即使只想生成一份临时草稿，也无法通过 `write_file` 完成内容落地，用户只能重新手动复制结果。

## 目标

仅修改以下场景的行为：

- 无工作区根目录
- 模型传入相对路径

在该场景下，`write_file` 不再尝试写入磁盘文件，也不再直接报错，而是降级为：

1. 创建一份应用内未保存草稿
2. 打开对应编辑器 Tab
3. 向模型返回可再次读取的 `unsaved://` 路径

## 非目标

- 不改变“有工作区 + 相对路径”的现有行为
- 不改变“无工作区 + 绝对路径”的现有行为
- 不改造 `read_file` 的 `unsaved://` 读取逻辑
- 不在本次设计中支持草稿去重、草稿目录树或批量创建

## 设计原则

### 1. 严格成功语义

本次采用严格模式：

- 只有“草稿已创建且编辑器已成功打开”时，`write_file` 才返回 `success`
- 如果草稿创建成功但编辑器未打开，整体仍视为 `failure`

理由：

- 用户可感知结果是“AI 已经把内容放到可编辑位置”
- 避免出现“工具说成功，但界面上什么也没发生”的伪成功状态

### 2. 抽成通用能力

不在 `FileWriteTool` 内部直接组合 `filesStore`、`router` 和 ID 生成逻辑，而是抽成统一的“创建并打开未保存草稿”能力。

理由：

- `write_file` 只负责工具协议、确认流程和结果包装
- 草稿创建与打开逻辑可以被后续其他 AI 工具或入口复用
- 后续如果草稿打开流程变化，不需要改动 `FileWriteTool`

### 3. 打开行为走统一链路

不把 `router.push({ name: 'editor', params: { id } })` 直接当作完整的“打开文件”能力，而是复用现有统一文件打开链路，保持最近文件状态、编辑器恢复逻辑和后续扩展点一致。

## 总体方案

新增一条应用层通用能力：

`createAndOpenUnsavedDraft(input)`

由它负责：

1. 从模型传入的原始相对路径提取 `name/ext`
2. 生成新的 `fileId`
3. 创建 `StoredFile`
4. 写入最近文件存储
5. 通过统一打开文件链路打开编辑器
6. 返回草稿记录与 `unsaved://` 路径

`write_file` 在命中“无工作区 + 相对路径”时，不再返回权限错误，而是：

1. 弹出确认框
2. 调用 `createAndOpenUnsavedDraft`
3. 将结果包装为 `WriteFileResult`

## 模块改动

### 1. `src/ai/tools/builtin/FileWriteTool/index.ts`

#### `resolveTargetPath()` 返回类型扩展

```ts
type ResolveResult =
  | { path: string }
  | { draft: true; originalPath: string }
  | { error: ReturnType<typeof createToolFailureResult> };
```

逻辑调整：

- `isUnsavedPath(filePath)`：保持原逻辑
- `!workspaceRoot && !isAbsoluteFilePath(filePath)`：返回 `{ draft: true, originalPath: filePath }`
- 其他分支保持原行为

#### 新增 draft 分支

在 `execute()` 中增加：

```ts
if ('draft' in resolved) {
  return handleDraftWrite(options, resolved.originalPath, content);
}
```

#### 新增 `handleDraftWrite()`

职责：

- 组装确认请求
- 处理用户取消
- 调用通用草稿能力
- 将结果包装为 `createToolSuccessResult` 或 `createToolFailureResult`

建议确认文案：

- 标题：`AI 想要创建未保存草稿`
- 描述：`当前没有可写入的工作区路径。AI 请求将内容创建为应用内草稿：{originalPath}`
- 风险级别：`write`

成功返回：

```ts
{
  path: unsavedPath,
  content,
  created: true
}
```

失败规则：

- 未注入草稿能力：`failure`
- 草稿创建失败：`failure`
- 草稿打开失败：`failure`
- 用户取消：`cancelled`

### 2. `src/ai/tools/builtin/FileWriteTool/types.ts`

`CreateBuiltinWriteFileToolOptions` 新增单一能力注入，而不是多个零散回调：

```ts
interface CreateAndOpenUnsavedDraftInput {
  originalPath: string;
  content: string;
}

interface CreateAndOpenUnsavedDraftResult {
  file: StoredFile;
  unsavedPath: string;
}

createAndOpenUnsavedDraft?: (
  input: CreateAndOpenUnsavedDraftInput
) => Promise<CreateAndOpenUnsavedDraftResult>;
```

这样 `FileWriteTool` 只依赖一个完整 use case，不负责自己编排创建、打开和 ID 生成。

### 3. `src/ai/tools/shared/types.ts`

为共享工具工厂能力新增 draft 选项，例如：

```ts
export interface ToolDraftOptions {
  createAndOpenUnsavedDraft?: (
    input: CreateAndOpenUnsavedDraftInput
  ) => Promise<CreateAndOpenUnsavedDraftResult>;
}
```

并让：

```ts
BuiltinToolBaseOptions extends
  ToolConfirmationOptions,
  ToolWorkspaceOptions,
  ToolFileLookupOptions,
  ToolDraftOptions
```

目的：

- 让 `createBuiltinTools()` 能正式接收该能力
- 避免只在聊天侧局部传参但工厂不转发的断链问题

### 4. `src/ai/tools/builtin/index.ts`

`createBuiltinTools()` 需要把 draft 能力透传给 `createBuiltinWriteFileTool()`：

```ts
const writeFileTool = createBuiltinWriteFileTool({
  confirm: options.confirm!,
  getWorkspaceRoot: options.getWorkspaceRoot,
  createAndOpenUnsavedDraft: options.createAndOpenUnsavedDraft
});
```

这是本设计中的关键链路，不能遗漏。

### 5. 通用草稿用例

新增通用 use case，名字可以是以下任一形式：

- `createAndOpenUnsavedDraft`
- `useCreateAndOpenUnsavedDraft`
- `createUnsavedDraftAndOpen`

本设计不强制具体文件位置，但建议放在应用层可复用位置，不放回 `FileWriteTool` 内部。

职责定义：

1. 解析原始路径为 `name/ext`
2. 生成 `fileId`
3. 构造 `StoredFile`
4. 持久化到最近文件存储
5. 走统一文件打开能力
6. 构造并返回 `unsaved://` 路径

推荐输入输出：

```ts
interface CreateAndOpenUnsavedDraftInput {
  originalPath: string;
  content: string;
}

interface CreateAndOpenUnsavedDraftResult {
  file: StoredFile;
  unsavedPath: string;
}
```

### 6. `src/components/BChatSidebar/index.vue`

在 `createBuiltinTools()` 调用处注入 `createAndOpenUnsavedDraft`。

聊天侧职责仅为接线，不承载业务规则。

具体实现应复用：

- `filesStore.addFile()` 或等价存储入口
- 统一打开文件能力，而不是手写一段专用路由跳转逻辑

## 文件名提取规则

仅从 `originalPath` 最后一段提取 `name` 和 `ext`。

要求：

- 同时兼容 `/` 和 `\` 作为分隔符
- 只把最后一个 `.` 之后的片段视为候选扩展名
- 扩展名仅在满足以下条件时有效：
  - 长度 1-20
  - 只包含字母、数字、下划线
- 否则整段视为 `name`，扩展名默认 `md`

示例：

| originalPath | name | ext |
|---|---|---|
| `notes/idea` | `idea` | `md` |
| `drafts/plan.md` | `plan` | `md` |
| `data/config.json` | `config` | `json` |
| `readme` | `readme` | `md` |
| `.gitignore` | `.gitignore` | `md` |
| `.env.local` | `.env` | `local` |

## 数据流

```text
AI 返回 write_file { path: "notes/idea", content: "..." }
  -> resolveTargetPath()
  -> workspaceRoot === null && path 为相对路径
  -> { draft: true, originalPath: "notes/idea" }
  -> handleDraftWrite()
  -> 用户确认
  -> createAndOpenUnsavedDraft({ originalPath: "notes/idea", content: "..." })
     1. 提取 name/ext
     2. 生成 fileId
     3. 写入 StoredFile
     4. 打开编辑器
     5. 返回 unsaved://{fileId}/idea.md
  -> write_file 返回 success
```

## 错误处理

### 工具层

- 空路径：`INVALID_INPUT`
- 草稿能力未注入：`EXECUTION_FAILED`
- 草稿用例抛错：`EXECUTION_FAILED`
- 用户取消：`cancelled`

### 通用草稿用例层

- 存储失败：抛出异常，由工具层映射为 `failure`
- 打开失败：抛出异常，由工具层映射为 `failure`

说明：

- 本设计不接受“草稿已创建但未打开仍算成功”

## 测试设计

测试分为两层。

### 1. `test/ai/tools/builtin-file-write.test.ts`

新增以下场景：

- 无工作区 + 相对路径时进入 draft 分支
- draft 分支会请求用户确认
- 用户取消时返回 `status: 'cancelled'`
- 未注入 `createAndOpenUnsavedDraft` 时返回 `status: 'failure'`
- `createAndOpenUnsavedDraft` 成功时返回：
  - `status: 'success'`
  - `created: true`
  - `path` 为 `unsaved://...`
- `createAndOpenUnsavedDraft` 抛错时返回 `status: 'failure'`
- 无工作区 + 绝对路径保持原行为
- 有工作区 + 相对路径保持原行为

### 2. 通用草稿用例测试

新增以下场景：

- 正确从 `notes/idea` 提取 `idea.md`
- 正确从 `data/config.json` 提取 `config.json`
- 正确处理 `.gitignore`
- 正确处理 `.env.local`
- 成功写入 `StoredFile`
- 成功打开编辑器后才返回成功
- 打开失败时整体失败
- 同名路径重复创建时生成不同 `fileId`

## 兼容性

本设计对现有能力的影响如下：

- `read_file` 的 `unsaved://` 支持保持不变
- 现有未保存草稿覆写逻辑保持不变
- 已保存文件和工作区文件写入逻辑保持不变

因此本次改动仅影响“无工作区 + 相对路径”的单一分支。

## 风险与取舍

### 风险 1：工具层和应用层边界变模糊

通过引入单一 use case 注入来规避：

- `FileWriteTool` 不直接依赖 `router`
- `FileWriteTool` 不直接生成文件 ID
- `FileWriteTool` 不直接操作 `filesStore`

### 风险 2：链路漏传导致运行时无效

通过补全共享 options 类型和 `createBuiltinTools()` 转发来规避。

### 风险 3：出现“成功但用户无感知”的伪成功

通过严格成功语义规避：

- 未打开编辑器即失败

## 实施顺序

1. 扩展共享类型与 `createBuiltinTools()` 转发链路
2. 新增通用草稿用例
3. 修改 `FileWriteTool` 的 draft 分支
4. 在聊天侧接入通用能力
5. 补齐工具层与用例层测试
