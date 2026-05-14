# read_file 内存优先读取设计

## 背景

`read_file` 工具当前始终从文件系统读取文件内容。当文件已在编辑器 Tab 中打开且存在未保存修改时，AI 读取到的是磁盘上的旧版本，而非用户在编辑器中正在编辑的最新内容。

## 目标

`read_file` 工具在执行文件读取时，优先尝试从编辑器内存中获取已打开文件的最新内容（含未保存修改）。仅当文件未在编辑器中打开时，回退到文件系统读取。

## 核心流程

```
execute(input):
  校验 path 非空
  ├─ unsaved 虚拟路径
  │     → 从 recentFilesStorage 读取草稿内容
  │     → buildReadFileResult 切片返回
  │
  ├─【新增】内存优先读取（findFileByPath + getEditorContext 均已注入）
  │   ├─ 路径解析
  │   │   ├─ 绝对路径 → 直接使用
  │   │   ├─ 相对路径 + workspaceRoot（非空字符串）→ 拼接为绝对路径
  │   │   └─ 相对路径 + 无 workspaceRoot（null/undefined/空字符串）→ 跳过内存读取（无法解析）
  │   ├─ findFileByPath(resolvedPath) → 获取 { id }
  │   │   ├─ 调用异常 → 捕获异常，跳过内存读取
  │   │   └─ 返回 null → 跳过内存读取
  │   ├─ getEditorContext(fileId) → 获取 AIToolContext
  │   │   ├─ 调用异常 → 捕获异常，跳过内存读取
  │   │   └─ 返回 undefined（文件未打开）→ 跳过内存读取
  │   └─ context.document.getContent()
  │       ├─ 抛异常 → 捕获异常，回退文件系统读取
  │       ├─ 返回空字符串 → 正常返回空内容，不回退文件系统
  │       └─ 正常返回 → buildReadFileResult 切片返回
  │           （跳过用户确认，文件已在 Tab 中打开即视为已授权）
  │
  └─【回退】现有文件系统读取逻辑
        ├─ 无 workspaceRoot + 绝对路径 + 有 confirm adapter
        │     → 弹用户确认
        ├─ native.readWorkspaceFile({ filePath, offset, limit })
        └─ 错误码映射
```

## 错误处理原则

内存优先读取路径中的任何异常都不应中断整体流程，必须"静默降级"回退到文件系统读取。只在控制台输出 debug 日志，不向 AI 或用户暴露内部错误。

## 边界情况处理

| 场景 | 处理方式 |
|------|----------|
| 文件在 Tab 中打开，但编辑器内容为空字符串 | 正常返回空内容（`content: ""`），不回退文件系统 |
| 文件在 Tab 中打开，但 `document.getContent()` 抛异常 | 捕获异常，回退文件系统读取 |
| 同一文件在多个 Tab 中打开 | `editorToolContextRegistry` 以 documentId 为 key，每个文件只有一个 Map entry，不存在多实例问题 |
| 内存读取成功，但返回内容与磁盘版本一致 | 正常返回，无需特殊处理 |
| `workspaceRoot` 为空字符串（而非 null/undefined） | 视为无效，跳过内存读取 |
| `findFileByPath` 返回 null | 跳过内存读取，回退文件系统 |
| `getEditorContext` 返回 undefined | 跳过内存读取，回退文件系统 |
| `findFileByPath` 或 `getEditorContext` 未注入 | 跳过内存读取，行为与现有完全一致 |

## 性能考虑

- 内存读取比文件系统读取快一个数量级，无需额外优化
- 对于超大文件（>10MB），编辑器内存已承担持有成本，工具层仅是获取引用，不产生额外拷贝
- 无需引入缓存机制——`editorToolContextRegistry` 维护的 Map 本身就是对编辑器内存的轻量引用封装

## 类型定义

```typescript
/**
 * 创建 read_file 工具的选项
 */
interface CreateBuiltinReadFileToolOptions {
  /** 读取工作区外绝对路径时使用的用户确认适配器 */
  confirm?: AIToolConfirmationAdapter;
  /** 获取工作区根目录，无工作区时返回 null */
  getWorkspaceRoot?: () => string | null;
  /** 判断文件路径是否在最近文件列表中，命中时跳过绝对路径确认 */
  isFileInRecent?: (filePath: string) => boolean;
  /**
   * 通过文件路径查询文件记录，用于获取文件 ID。
   * 内部封装 filesStore.getFileByPath。
   * @param filePath - 文件绝对路径
   * @returns 文件记录（含 id），未找到时返回 null
   */
  findFileByPath?: (filePath: string) => Promise<{ id: string } | null>;
  /**
   * 通过文件 ID 获取编辑器上下文，用于读取内存中的最新内容。
   * 内部封装 editorToolContextRegistry.getContext。
   * @param documentId - 文件 ID
   * @returns 编辑器上下文，文件未打开时返回 undefined
   */
  getEditorContext?: (documentId: string) => AIToolContext | undefined;
  /** 读取本地文件，测试时可注入替身 */
  readWorkspaceFile?: (options: ReadWorkspaceFileOptions) => Promise<ReadWorkspaceFileResult>;
  /** 读取本地目录，测试时可注入替身 */
  readWorkspaceDirectory?: (options: ReadWorkspaceDirectoryOptions) => Promise<ReadWorkspaceDirectoryResult>;
}
```

## 注入依赖

在 `CreateBuiltinReadFileToolOptions` 新增两个可选函数注入：

```typescript
/**
 * 通过文件路径查询文件记录，用于获取文件 ID。
 * 内部封装 filesStore.getFileByPath。
 */
findFileByPath?: (filePath: string) => Promise<{ id: string } | null>;

/**
 * 通过文件 ID 获取编辑器上下文，用于读取内存中的最新内容。
 * 内部封装 editorToolContextRegistry.getContext。
 */
getEditorContext?: (documentId: string) => AIToolContext | undefined;
```

### 设计理由

- 路径解析（相对→绝对）在工具内部完成，利用已有的 `getWorkspaceRoot` 选项和 `isAbsoluteFilePath` 工具函数
- `findFileByPath` 和 `getEditorContext` 提供最小化的依赖注入接口，不暴露 UI 层实现细节（filesStore、editorToolContextRegistry）
- 两个注入均为可选，未注入时行为完全回退到现有逻辑，保持向后兼容

## 设计决策

| 决策 | 结论 |
|------|------|
| 内存读取是否跳过用户确认 | 跳过。文件已在 Tab 中打开，用户已隐式授予访问权限 |
| 路径解析位置 | 工具内部。利用已有 `getWorkspaceRoot` 做相对→绝对路径转换 |
| 注入方式 | 两个独立函数（`findFileByPath` + `getEditorContext`），而非单一回调。保持接口最小化且职责清晰 |
| `read_directory` 是否同步修改 | 本次不修改，仅限 `read_file` |
| 异常策略 | 静默降级。内存路径中任何异常均回退文件系统，不中断流程 |

## 公共函数提取

将 unsaved 分支中的内联切片逻辑提取为 `buildReadFileResult` 公共函数，内存读取路径复用同一函数：

```typescript
function buildReadFileResult(
  filePath: string,
  fullContent: string,
  offset: number,
  limit?: number
): ReadFileResult
```

## 实施风险

| 风险 | 缓解措施 |
|------|----------|
| 注入函数实现错误导致内存读取无法命中 | 充分的单元测试 + 任何异常均静默降级到文件系统读取 |
| `workspaceRoot` 路径格式不一致 | workspaceRoot 末尾是否带 `/` 在拼接时统一处理 |
| 路径大小写敏感问题（macOS 默认大小写不敏感，但路径比较可能敏感） | `findFileByPath` 内部由 `filesStore` 实现匹配，不做路径标准化假设 |
| 编辑器内存占用 | 无额外开销，仅获取对已有内容的引用 |

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/ai/tools/builtin/FileReadTool/index.ts` | 新增 `findFileByPath`、`getEditorContext` 选项；`execute` 中加入内存优先读取逻辑（含异常捕获）；提取 `buildReadFileResult` 公共函数 |
| `src/ai/tools/builtin/index.ts` | 在 `CreateBuiltinToolsOptions` 和 `createBuiltinTools` 中透传两个新选项 |
| `src/components/BChatSidebar/index.vue` | 在工具创建时注入 `findFileByPath`（封装 `filesStore.getFileByPath`）和 `getEditorContext`（封装 `editorToolContextRegistry.getContext`） |

## 测试要点

### 核心功能

- 文件在 Tab 中打开且有未保存修改 → 读取到最新内容（非磁盘旧版本）
- 文件在 Tab 中打开但无修改 → 读取到与磁盘一致的内容
- 文件未在 Tab 中打开 → 回退文件系统读取，行为不变
- 相对路径 + workspaceRoot → 正确解析并命中
- 绝对路径 → 直接命中
- 未注入 `findFileByPath` / `getEditorContext` → 行为不变（向后兼容）
- unsaved 虚拟路径 → 不受影响

### 边界与异常

- 文件在 Tab 中打开但编辑器内容为空字符串 → 返回空内容，不回退
- `document.getContent()` 抛异常 → 静默降级，回退文件系统读取
- `findFileByPath` 返回 null → 回退文件系统读取
- `getEditorContext` 返回 undefined → 回退文件系统读取
- `findFileByPath` 或 `getEditorContext` 调用异常 → 静默降级，回退文件系统读取
- `workspaceRoot` 为 null / undefined / 空字符串 → 跳过内存读取
- 内存读取成功且内容与磁盘版本一致 → 正常返回
