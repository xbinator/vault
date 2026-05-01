# 2026-05-02 File Reference Structured Resource Design

## 背景

当前聊天文件引用的核心链路仍然建立在 `{{file-ref:...}}` 文本令牌之上：

- 输入阶段由 `useFileReference` 向草稿正文插入 `file-ref` token。
- 发送阶段由 `buildModelReadyMessages` 将 token 直接替换为全文、概览或局部片段。
- 模型虽然具备 `read_file` 工具，但“是否读取文件内容”的决策已经在前端预展开阶段被提前做掉。

这会带来几个长期问题：

1. **消息建模不稳定**：文件引用语义依赖正文中的特殊字符串，而不是正式消息结构。
2. **上下文成本偏高**：引用内容在发送前被直接膨胀到 prompt 中，长对话下 token 成本不可控。
3. **工具链职责重叠**：既有 `read_file` 工具，又在前端预读正文，导致读取策略分散。
4. **未保存文档支持不完整**：只有 `documentId` 没有 `path` 的文档无法自然走“按需读取”模型。
5. **未来扩展阻力大**：如果后续要支持目录引用、符号引用、摘要缓存或更细粒度资源句柄，继续基于 token 补丁会越来越重。

本次设计目标是把“文件引用”升级为消息系统中的一等结构，并让模型通过专用工具按需读取发送当刻冻结的文档快照。

## 目标

- 让 `file-reference` 成为正式的 `ChatMessagePart` 类型，而不是依赖正文 token 承载语义。
- 保留输入框中的 `{{file-ref:...}}` 仅作为编辑态占位格式，不再作为模型侧主数据源。
- 移除发送前正文预展开逻辑，改为向模型注入结构化引用索引。
- 新增专用工具 `read_reference(referenceId)`，隐藏 `path`、`documentId` 和 `snapshotId` 的内部复杂性。
- 统一支持已保存文件与未保存文档，且模型始终读取发送时冻结的 snapshot。
- 让新消息链路只依赖 `parts` 表达引用顺序与语义，减少 `content` 与旁路 metadata 双写。

## 非目标

- 本阶段不兼容旧消息迁移；项目仍处于早期阶段，可直接切换到新结构。
- 本阶段不实现跨消息复用的摘要缓存。
- 本阶段不改变 `read_file` 的通用文件系统工具定位，只新增聊天引用专用读取工具。
- 本阶段不设计非文本资源的引用读取协议，例如图片区域、数据库记录或网页片段。
- 本阶段不引入可配置的引用读取策略面板，默认窗口大小先写死在实现中。

## 核心设计

### 1. 编辑态与消息态分离

输入框继续使用 `{{file-ref:...}}` token 作为编辑器中的占位表示，这样可以复用现有 chip 插入与光标恢复逻辑。但从“用户点击发送”开始，token 不再是系统真相来源：

- 发送前解析正文，生成有序 `parts`。
- 普通文本生成 `text part`。
- 文件引用生成 `file-reference part`。
- `message.content` 只保留纯文本聚合结果，不再承载文件引用语义。

换句话说：

- 编辑态关注“用户如何方便地插入和修改引用”。
- 消息态关注“系统如何稳定持久化引用语义并供模型消费”。

### 2. 文件引用成为正式消息片段

新增 `ChatMessageFileReferencePart`，让文件引用与 `text`、`tool-call`、`tool-result` 处于同一层级。消息中的引用顺序不再需要从 `content + references` 反推，而是由 `parts` 直接表达。

### 3. 模型看到的是“可读取资源”，不是预展开正文

发送给模型时，不再把文件正文拼进用户消息，而是为当前消息生成一份结构化引用索引。索引只说明：

- 有哪些引用可以读取
- 每个引用的 `referenceId`
- 文件名
- 引用行范围
- 这是冻结快照，不是实时文件

真正读取内容时，模型需要调用 `read_reference(referenceId)`。

### 4. `referenceId` 作为模型读取主入口

模型侧不直接感知 `path` 或 `documentId`。这两个字段仍然会保存在 part 中，但它们是内部实现细节：

- `referenceId`：模型读取和链路追踪的唯一稳定入口
- `documentId`：用于在发送前关联编辑器文档与生成 snapshot
- `snapshotId`：用于读取冻结内容
- `path`：仅用于 UI 展示或调试，不作为主读取协议

### 5. 所有引用读取都指向 snapshot

无论文件是否已保存，`read_reference` 都只读取消息发送时冻结的 snapshot，不读取实时编辑器内容，也不直接读取磁盘实时内容。这样可以保证：

- 历史可复现
- 同轮对话稳定
- 用户后续继续编辑文档不会污染本轮模型看到的事实

## 数据模型

### ChatMessageFileReferencePart

```ts
/**
 * 聊天消息文件引用片段
 */
export interface ChatMessageFileReferencePart {
  /** 片段类型 */
  type: 'file-reference';
  /** 引用唯一标识 */
  referenceId: string;
  /** 引用对应的文档 ID */
  documentId: string;
  /** 引用快照 ID */
  snapshotId: string;
  /** 文件名 */
  fileName: string;
  /** 本地路径，不存在时为 null */
  path: string | null;
  /** 起始行号，0 表示未指定 */
  startLine: number;
  /** 结束行号，0 表示未指定 */
  endLine: number;
}
```

字段约束：

- `referenceId` 在单条消息内必须唯一。
- `documentId` 必须稳定指向编辑器文档，即便文档尚未保存也必须存在。
- `snapshotId` 在发送前为空字符串，发送时回填为真实快照 ID。
- `startLine/endLine` 使用 1-based；当用户未选区时二者都为 `0`。
- `path` 仅作为辅助信息，不影响读取主流程。

### ChatMessagePart 扩展

```ts
export type ChatMessagePart =
  | ChatMessageTextPart
  | ChatMessageFileReferencePart
  | ChatMessageErrorPart
  | ChatMessageThinkingPart
  | ChatMessageToolCallPart
  | ChatMessageToolResultPart
  | ChatMessageConfirmationPart;
```

### ChatReferenceSnapshot

保留现有结构：

```ts
export interface ChatReferenceSnapshot {
  id: string;
  documentId: string;
  title: string;
  content: string;
  createdAt: string;
}
```

本次设计不改变 snapshot 存储形态，但改变它的职责：从“预展开上下文材料”转为“专用引用读取工具的数据源”。

## 输入与发送流程

### 插入阶段

用户从编辑器插入文件引用时：

1. 生成稳定 `referenceId`。
2. 生成编辑态 token：`{{file-ref:referenceId|fileName|startLine|endLine}}`。
3. 在草稿态维护一份引用草稿清单，用于发送前解析。
4. 对于未保存文档，必须同时记录稳定的 `documentId`，即便 `path` 为 `null`。

### 发送前解析阶段

用户点击发送时：

1. 遍历草稿正文。
2. 按 token 切分内容。
3. 将普通文本片段转换为 `text part`。
4. 将命中的引用转换为 `file-reference part`。
5. 忽略草稿引用清单中未实际出现在正文中的引用。
6. 不再生成 `message.references` 作为主链路数据源。

### snapshot 生成阶段

在模型请求真正发出前：

1. 收集消息中的全部 `file-reference part`。
2. 按 `documentId` 分组生成 snapshot，同文档多引用共享一份 snapshot。
3. 对活动编辑器文档，从内存内容生成 snapshot。
4. 对已保存但当前未激活的文件，可从磁盘读取生成 snapshot。
5. 对未保存文档，不依赖磁盘，必须从编辑器上下文生成 snapshot。
6. 将生成的 `snapshotId` 回填到对应 `file-reference part`。

### 持久化阶段

消息持久化时：

- `parts` 是正式消息结构。
- `content` 只保存纯文本聚合结果。
- `snapshot` 单独持久化到现有快照表。

本次不再要求 `content` 中保留可供模型消费的文件引用文本。

## 模型上下文设计

### 结构化引用索引

在用户消息发给模型前，为当前用户消息附加一段简短引用索引，建议格式如下：

```text
Available file references for this message:
- ref_1: useChatStream.ts (lines 300-360)
- ref_2: useFileReference.ts (lines 1-120)
- ref_3: draft.ts (unsaved document, lines 10-20)

File contents are not included yet.
If needed, call read_reference with the referenceId.
Prefer reading a small window first.
```

设计要点：

- 暴露 `referenceId`、`fileName`、`lineRange`
- 不暴露 `snapshotId`
- 不向模型强调 `path/documentId` 的内部协议
- 不默认注入正文内容

### 为什么不用更强的 prompt 替代工具抽象

单纯强化 system prompt 仍然要求模型自己处理这些映射问题：

- 当前引用对应哪个文件
- 未保存文档如何读取
- 应该传 `path` 还是 `documentId`
- 读取的是实时文件还是冻结版本

这会增加模型决策成本。相比之下，`read_reference(referenceId)` 将复杂性隐藏在工具内部，更符合“模型只做最少必要决策”的原则。

## 工具设计

### `read_reference`

新增聊天专用工具：

```ts
export interface ReadReferenceInput {
  /** 引用唯一标识 */
  referenceId: string;
  /** 起始行号，不传时使用默认窗口策略 */
  offset?: number;
  /** 读取行数 */
  limit?: number;
}
```

返回值：

```ts
export interface ReadReferenceResult {
  /** 引用唯一标识 */
  referenceId: string;
  /** 文件名 */
  fileName: string;
  /** 本地路径，不存在时为 null */
  path: string | null;
  /** 文档 ID */
  documentId: string;
  /** 快照 ID */
  snapshotId: string;
  /** 实际读取起始行 */
  offset: number;
  /** 实际读取行数 */
  readLines: number;
  /** 文件总行数 */
  totalLines: number;
  /** 是否还有后续内容 */
  hasMore: boolean;
  /** 下一次推荐起始行 */
  nextOffset: number | null;
  /** 读取内容 */
  content: string;
}
```

### 默认读取窗口

当模型只传 `referenceId` 时，工具应自动给出一个“小而够用”的默认窗口：

- 如果引用有明确行范围，则以该范围为中心读取一段固定窗口。
- 如果引用没有明确行范围，则从文件开头读取固定窗口。
- 默认窗口大小建议为 `120` 行。

这样可以提高模型首次读取的命中率，又避免一次性返回整份大文件。

### 与 `read_file` 的关系

- `read_file` 保留为通用本地文件读取工具。
- `read_reference` 是聊天文件引用专用工具。
- 聊天引用场景的模型提示只推荐使用 `read_reference`。
- 内部实现可以复用 `read_file` 的行范围裁剪逻辑，但不能把 `read_file` 暴露为主协议。

## 渲染与展示

本次设计不改变聊天 UI 想表达的效果，但会改变数据来源：

- 输入框仍通过 token 渲染 chip。
- 聊天气泡改为优先根据 `file-reference part` 渲染引用，而不是从纯文本 `content` 中做正则反推。
- 复制、搜索、标题生成等依赖 `content` 的逻辑，只处理纯文本内容，不再把引用标记混入正文。

如确有需要，可以在渲染层为 `file-reference part` 提供统一的展示文本，例如 `useChatStream.ts:300-360`，但这只是视图层逻辑，不回写到 `content`。

## 模块改造范围

### 1. `types/chat.d.ts`

- 新增 `ChatMessageFileReferencePart`
- 扩展 `ChatMessagePart`
- 逐步让新链路不再依赖 `ChatMessageFileReference[]`

### 2. `useFileReference.ts`

- 保留 token 插入能力
- 保证草稿态始终能产出 `documentId/fileName/startLine/endLine/path`
- 为发送前结构化解析提供稳定引用源

### 3. `messageHelper.ts`

- 新增“编辑态 token + 草稿引用 -> 有序 parts”解析能力
- 调整 `getMessagePlainText()`，只聚合 `text part`
- 调整 `create.userMessage()`，支持创建包含 `file-reference part` 的用户消息
- 调整模型消息转换逻辑，识别 `file-reference part`

### 4. `referenceSnapshot.ts`

- 从消息 `parts` 中提取引用
- 生成并回填 `snapshotId`
- 保持未保存文档可快照

### 5. `fileReferenceContext.ts`

- 移除“正文预展开”职责
- 改为“根据 file-reference parts 生成模型引用索引”

### 6. `useChatStream.ts`

- 发送前先生成 snapshot
- 构造模型引用索引
- 不再将 token 替换为正文片段

### 7. `src/ai/tools/builtin/`

- 新增 `read-reference.ts`
- 注册到工具系统
- 让模型在聊天上下文中默认可见该工具

## 测试要点

- 已保存文件引用发送后，模型能看到 `referenceId` 并通过 `read_reference` 读取内容。
- 未保存文档引用发送后，模型仍能通过 `read_reference` 读取冻结内容。
- 同一消息多处引用同一文档时，只生成一份 snapshot。
- 删除正文中的某个引用 token 后，发送消息时不会残留无效 `file-reference part`。
- 大文件默认不会在发送前被正文预展开。
- `read_reference` 默认读取窗口、分页续读和 `hasMore/nextOffset` 行为正确。

## 风险与取舍

### 风险 1：改动面横跨消息、渲染、模型、工具

这是一次结构性重构，改动面比“只改发送前展开”大得多。但它换来的是更清晰的分层：

- 编辑态 token
- 消息态 parts
- 模型态资源索引
- 工具态引用读取

长期维护成本会显著下降。

### 风险 2：`content` 变成纯文本后，下游逻辑可能默认还认为引用存在于正文

需要在实现阶段逐一核对：

- 聊天气泡渲染
- 复制消息
- 搜索消息
- 历史展示
- 标题生成

这些逻辑是否依赖正文里的 token；若依赖，需要改为消费 `parts`。

## 决策摘要

- 采用正式 `file-reference part`，不再让 token 承担消息语义。
- 采用 `read_reference(referenceId)`，不让模型感知内部读取协议。
- 模型读取的永远是发送时冻结的 snapshot。
- 不再在发送前把引用正文预展开到 prompt 中。
- 旧消息迁移不是本阶段目标，新链路直接切换。
