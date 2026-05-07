<!--
  @file 2026-05-07-chat-context-compression-phase2-phase3-design.md
  @description 聊天上下文压缩第二阶段（测试+裁剪+UI）和第三阶段（token估算+多段摘要）设计文档。
-->

# Chat Context Compression Phase 2 & Phase 3 Design

## 背景

`docs/superpowers/specs/2026-05-06-chat-context-compression-design.md` 定义了三阶段实施计划。第一阶段（核心压缩链路）已基本完成，包括六层模块架构、双阈值自动压缩、增量/全量摘要、存储层和基础 UI。现在推进第二阶段和第三阶段。

### 第一阶段已完成的清单

- 六层模块架构（policy / planner / summarizer / summaryGenerator / assembler / coordinator）
- 双阈值自动压缩 + 手动压缩入口
- 增量摘要窗口 + 全量重建降级
- 摘要存储层（SQLite + localStorage 降级）
- CompressionButton + SummaryModal 基础 UI
- `summarize` 服务模型配置入口
- Spec alignment（增量窗口、有效上下文体积、文件语义层、手动降级、摘要有效性校验、PREVIOUS_SUMMARY 提示词）

### 当前不足

1. **测试覆盖缺口**：summaryGenerator 只测了 2 个场景，降级路径几乎未测；coordinator.compressSessionManually 单元测试缺失；存储层核心方法未单独测试
2. **规则裁剪质量**：thinking 只保留前 100 字符过于粗暴；confirmation part 缺少状态信息；文件引用消息的 intent 提取依赖 message.content 截断而非结构化数据
3. **错误提示粗糙**：压缩失败只给"压缩失败"通用文案，不区分失败阶段；无自动压缩失败 toast
4. **UI 体验不足**：SummaryModal 缺少 fileContext 展示；CompressionButton 无压缩进度感知；无自动压缩触发提示
5. **字符级体积估算不精准**：不同模型的 token 编码差异大，字符数与 token 数比例可从 1:0.3 到 1:3 不等
6. **单段摘要上限**：超长会话的摘要信息密度下降，增量漂移累积，无法按主题检索

## 目标

### 第二阶段目标

- 补全所有压缩模块的单元测试和集成测试，覆盖降级路径和边界条件
- 优化规则裁剪质量：改进 thinking/confirmation/file-reference 的裁剪策略
- 改进错误提示：区分失败阶段，提供可操作的错误信息
- 增强 UI 体验：SummaryModal 展示 fileContext、CompressionButton 压缩状态感知、自动压缩 toast 提示

### 第三阶段目标

- 接入 provider-aware token 估算，替换字符级体积估算，让双阈值判断更精准（注意：不同模型 tokenizer 精度不一致，估算结果标注精度等级而非宣称"精确"）
- 实现多段摘要：超长会话拆分为多段摘要，支持按主题检索和联合召回

## 非目标

- 第二阶段不改变压缩模块的整体架构
- 第二阶段不实现多段摘要
- 第三阶段不开放用户编辑摘要正文
- 第三阶段不实现实时监听文件内容变化

---

## 第二阶段设计

### P2-1：测试覆盖补全

#### 需要补全的测试模块

**summaryGenerator.test.ts**（当前仅 2 个用例，需补全至 ~10 个）：

| 用例 | 覆盖场景 |
|------|---------|
| `generateSummaryText produces readable text from structured summary` | `generateSummaryText` 函数 |
| `generateSummaryText omits empty fields` | 空字段省略 |
| `generateFallbackSummary creates default from user messages` | 降级摘要生成 |
| `falls back when no model config available` | 无可用模型降级 |
| `falls back when provider not found` | 提供商未找到降级 |
| `falls back when AI invoke returns error` | AI 调用返回错误降级 |
| `falls back when structured output missing goal` | 结构化输出缺少 goal 降级 |
| `falls back when JSON parsing fails` | JSON 解析失败降级 |
| `buildSummaryUserPrompt includes PREVIOUS_SUMMARY in incremental mode` | 增量模式提示词 |
| `buildSummaryUserPrompt shows 无 when no previous summary` | 无上一条摘要时提示词 |

**coordinator.test.ts**（当前 8 个用例，需补全 ~6 个）：

| 用例 | 覆盖场景 |
|------|---------|
| `compressSessionManually creates full_rebuild summary` | 手动压缩正常路径 |
| `compressSessionManually returns undefined when no compressible messages` | 无可压缩内容 |
| `compressSessionManually marks old summary as superseded` | 旧摘要标记 superseded |
| `compressSessionManually degrades to incremental when input exceeds limit` | 手动压缩降级 |
| `buildSummaryRecord handles coveredEndMessageId not found in messages` | 边界消息不存在 |
| `acquireSessionLock releases lock after exception` | 异常后锁释放 |

**chat-summaries.test.ts**（当前 3 个用例，需补全 ~5 个）：

| 用例 | 覆盖场景 |
|------|---------|
| `createSummary persists and returns a summary record` | 创建摘要 |
| `updateSummaryStatus changes status and invalidReason` | 更新状态 |
| `getAllSummaries returns all summaries for a session` | 获取所有摘要 |
| `getValidSummary skips superseded and invalid summaries` | 跳过非 valid 摘要 |
| `createSummary generates unique ID and timestamps` | ID 和时间戳生成 |

**policy.test.ts**（当前 7 个用例，需补全 ~4 个）：

| 用例 | 覆盖场景 |
|------|---------|
| `evaluateCompression returns shouldCompress false when under threshold` | 阈值以下不触发 |
| `evaluateCompression returns message_count trigger when round threshold exceeded` | 轮数超限触发 |
| `evaluateCompression returns context_size trigger when char threshold exceeded` | 体积超限触发 |
| `countMessageRounds counts user+assistant pairs correctly` | 轮数计算 |

**summarizer.test.ts**（当前 9 个用例，需补全 ~4 个）：

| 用例 | 覆盖场景 |
|------|---------|
| `truncateSummaryText truncates and appends ellipsis` | 摘要文本截断 |
| `extractTrimmedText handles confirmation part with status` | confirmation part 处理 |
| `deduplication only removes consecutive duplicates` | 非连续重复不去重 |
| `extractTrimmedText handles empty references array` | 空 references 数组 |

**planner.test.ts**（当前 10 个用例，需补全 ~3 个）：

| 用例 | 覆盖场景 |
|------|---------|
| `preserveRounds 0 classifies all messages as older` | 保留轮数为 0 |
| `excludeMessageIds excludes additional IDs beyond currentUserMessageId` | 额外排除 ID |
| `user role messages are never classified as mustPreserve` | user 消息不进入 preserved |

**integration.test.ts**（当前 10 个用例，需补全 ~4 个）：

| 用例 | 覆盖场景 |
|------|---------|
| `useCompression.loadSummary loads valid summary` | 加载摘要成功 |
| `useCompression.loadSummary handles storage error` | 加载摘要失败 |
| `useCompression.compress calls loadSummary after success` | 压缩成功后刷新摘要 |
| `CompressionButton emits compress event` | 按钮事件触发 |

### P2-2：规则裁剪质量优化

#### thinking 内容裁剪改进

当前实现只保留前 100 字符：

```ts
if (part.type === 'thinking') {
  return part.thinking.length > 100
    ? `[thinking: ${part.thinking.slice(0, 100)}...]`
    : `[thinking: ${part.thinking}]`;
}
```

**改进策略**：提取结论性文本而非简单截断

```ts
if (part.type === 'thinking') {
  return '[thinking: 已省略模型推理过程]';
}
```

逻辑：不将 raw thinking 持久化进摘要。如果模型 reasoning/chain-of-thought 类内容被压缩后继续注入给模型，可能造成干扰。仅保留 provider 明确返回的 `reasoningSummary`（如果可用），否则直接省略。

#### confirmation part 裁剪改进

当前实现丢失状态信息：

```ts
if (part.type === 'confirmation') {
  return `[confirmation: ${part.title} (${part.confirmationStatus})]`;
}
```

**改进**：保留确认结果摘要

```ts
if (part.type === 'confirmation') {
  const status = part.confirmationStatus === 'confirmed' ? '已确认' : part.confirmationStatus === 'rejected' ? '已拒绝' : '待确认';
  return `[confirmation: ${part.title} - ${status}]`;
}
```

#### 文件引用消息裁剪改进

当前实现依赖 `message.content` 截断作为 intent：

```ts
const refInfo = message.references
  .map((ref) => {
    const lineInfo = ref.startLine ? ` (lines ${ref.startLine}-${ref.endLine})` : '';
    const fileName = ref.path.split('/').pop() || ref.path;
    return `[file: ${fileName}${lineInfo}, intent: ${message.content.slice(0, 100)}]`;
  })
  .join('; ');
```

**问题**：
- `message.content` 可能包含多个文件引用的混合描述，截断后语义不完整
- 多个 references 共享同一个 intent 截断，无法区分每个引用的意图

**改进**：每个引用独立提取 intent，优先使用引用自身的 selectedContent 摘要

```ts
if (message.references?.length) {
  return message.references
    .map((ref) => {
      const lineInfo = ref.startLine ? `:${ref.startLine}-${ref.endLine}` : '';
      const fileName = ref.path.split('/').pop() || ref.path;
      const snippet = ref.selectedContent
        ? ref.selectedContent.length > 80
          ? `${ref.selectedContent.slice(0, 40)}...${ref.selectedContent.slice(-30)}`
          : ref.selectedContent
        : '';
      return `[file: ${fileName}${lineInfo}, intent: ${message.content.slice(0, 60)}, snippet: ${snippet}]`;
    })
    .join('; ');
}
```

注意：这里是 message-level intent，不是 ref-level intent。文件路径使用 `fileName`（不含完整绝对路径），不直接注入 `ref.path` 完整路径。
```

#### tool-result 裁剪改进

当前只保留工具名：

```ts
if (part.type === 'tool-result') {
  return `[tool-result: ${part.toolName}]`;
}
```

**改进**：保留关键结果摘要

```ts
if (part.type === 'tool-result') {
  const summary = safeToolResultSummary(part);
  return summary
    ? `[tool-result: ${summary.toolName}, ${summary.status}, ${summary.message}]`
    : `[tool-result: ${part.toolName}]`;
}

/**
 * 安全摘要 tool-result，避免直接 JSON.stringify 原始 result
 * 防止循环引用、BigInt 报错、敏感字段泄漏和无意义截断
 */
function safeToolResultSummary(part: ToolResultPart) {
  const result = part.result;
  let message = '';
  if (typeof result === 'string') {
    message = normalizeWhitespace(result);
  } else if (isPlainObject(result)) {
    message = String(result.message ?? result.error ?? result.summary ?? result.status ?? '');
  }
  return {
    toolName: part.toolName,
    status: part.isError ? 'error' : 'success',
    message: truncateMiddle(message, 120),
  };
}
```

### P2-3：错误提示改进

#### 失败阶段区分

当前 `useCompression.ts` 的 catch 块只返回通用错误：

```ts
error.value = err instanceof Error ? err.message : '压缩失败';
```

**改进**：在 coordinator 中定义结构化错误类型

```ts
export class CompressionError extends Error {
  constructor(
    message: string,
    public readonly stage: 'policy' | 'planner' | 'rule_trim' | 'ai_summary' | 'storage' | 'lock',
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'CompressionError';
  }
}
```

各阶段失败时抛出 `CompressionError`，`useCompression` 根据阶段映射用户提示：

| stage | 用户提示 |
|-------|---------|
| `policy` | "上下文评估失败，已继续使用原始上下文" |
| `planner` | "消息分类失败，已继续使用原始上下文" |
| `rule_trim` | "消息裁剪失败，已继续使用原始上下文" |
| `ai_summary` | "AI 摘要生成失败，已继续使用原始上下文" |
| `storage` | "摘要保存失败，已继续使用原始上下文" |
| `lock` | "压缩任务冲突，请稍后重试" |

#### 自动压缩失败 toast

当前自动压缩失败时只在 console 中记录，用户无感知。设计文档要求"给出一次轻量提示（toast，不阻断操作）"。

在 `useChatStream.ts` 的压缩失败 catch 块中增加 toast 通知：

```ts
catch (error) {
  console.error('[useChatStream] Compression failed, using original messages:', error);
  if (error instanceof CompressionError) {
    toast.warning(getCompressionErrorMessage(error.stage));
  }
}
```

toast 使用项目现有的通知机制，3 秒自动消失，不阻断操作。

### P2-4：UI 体验优化

#### SummaryModal 增强

当前 SummaryModal 缺少 `fileContext` 和 `constraints` 的展示。需要补全：

1. **fileContext 展示**：以表格或列表形式展示文件路径、行号范围、用户意图和关键摘录
2. **constraints 展示**：在结构化信息区域增加约束条件列表
3. **摘要链信息**：当 `derivedFromSummaryId` 存在时，显示摘要链深度（通过 `derivedFromSummaryId` 追溯链长）

SummaryModal 新增 fileContext 区域模板：

```vue
<div v-if="summary.structuredSummary.fileContext?.length" class="structured-item">
  <div class="structured-label">文件上下文</div>
  <div class="file-context-list">
    <div v-for="(fc, index) in summary.structuredSummary.fileContext" :key="index" class="file-context-item">
      <div class="file-context-path">{{ fc.filePath }}<span v-if="fc.startLine">:{{ fc.startLine }}-{{ fc.endLine }}</span></div>
      <div class="file-context-intent">{{ fc.userIntent }}</div>
      <div v-if="fc.keySnippetSummary" class="file-context-snippet">{{ fc.keySnippetSummary }}</div>
    </div>
  </div>
</div>
```

#### CompressionButton 交互反馈增强

1. **压缩状态指示**：当会话已有摘要时，图标改为带标记状态（如小圆点），提示用户当前会话已压缩
2. **自动压缩触发提示**：自动压缩触发时，在按钮旁短暂显示"已自动压缩"文字，1.5 秒后消失
3. **重新压缩入口**：当会话已有摘要时，下拉菜单增加"重新压缩"选项（区别于首次"压缩上下文"）

CompressionButton 新增状态：

```ts
interface Props {
  disabled?: boolean;
  compressing?: boolean;
  currentSummary?: ConversationSummaryRecord;
  error?: string;
  autoCompressed?: boolean;
}
```

当 `autoCompressed` 为 true 时，按钮旁显示"已自动压缩"标签，1.5 秒后自动隐藏。

#### 自动压缩 toast 提示

在 `useChatStream.ts` 中，当 `compressionResult.compressed` 为 true 时，触发轻量 toast：

```ts
if (compressionResult.compressed) {
  toast.info('上下文已自动压缩');
}
```

---

## 第三阶段设计

### P3-1：provider-aware token 估算

#### 架构决策

**方案选择**：使用 `js-tiktoken` 在渲染进程中进行 token 估算，而非依赖模型 API 返回的 usage 数据。

理由：
- token 估算发生在发送前（`policy.evaluateCompression`），此时还没有 API 调用
- `js-tiktoken` 是纯 JS 实现，无需 native 依赖，兼容 Electron 渲染进程
- 不同模型使用不同 tokenizer（cl100k_base / o200k_base），需要根据模型选择

#### 新增模块

```
src/components/BChatSidebar/utils/compression/
  tokenEstimator.ts    — token 估算器
```

#### TokenEstimator 接口

```ts
/**
 * token 估算器，根据模型类型选择对应的 tokenizer 进行 token 计数。
 */
export interface TokenEstimator {
  estimate(messages: ModelMessage[]): number;
  estimateText(text: string): number;
}
```

#### 模型到 tokenizer 的映射

```ts
const MODEL_TOKENIZER_MAP: Record<string, string> = {
  'gpt-4o': 'o200k_base',
  'gpt-4-turbo': 'cl100k_base',
  'gpt-4': 'cl100k_base',
  'gpt-3.5-turbo': 'cl100k_base',
  'claude-3': 'cl100k_base',
  'deepseek': 'cl100k_base',
};

const DEFAULT_TOKENIZER = 'cl100k_base';
```

对于未知模型，降级使用 `cl100k_base`，并在 console 中输出一次警告。

#### 与现有模块的集成

#### 三层架构：Snapshot → Policy

不要让 `policy.evaluateCompression` 直接依赖 `TokenEstimator`。引入中间层 `ContextBudgetSnapshot`：

```ts
interface ContextBudgetSnapshot {
  charCount: number;
  tokenCount?: number;
  tokenAccuracy?: 'native_like' | 'approximate' | 'char_fallback';
  roundCount: number;
}

export function evaluateCompression(snapshot: ContextBudgetSnapshot): CompressionPolicyResult
```

coordinator 在 `prepareMessagesBeforeSend` 中负责：
1. 展开文件引用
2. 注入摘要
3. 拼接 system prompt + tools
4. 估算 token，产出 `ContextBudgetSnapshot`
5. 传给 policy 判断

policy 保持纯函数，测试更稳定。

**常量更新**：

```ts
/** 自动压缩触发——上下文体积阈值（token 数），优先按模型上下文窗口动态计算 */
export const COMPRESSION_TOKEN_THRESHOLD = 8_000;

/**
 * 按模型上下文窗口动态计算压缩阈值
 * @param contextWindow - 模型上下文窗口大小（token 数）
 * @param reservedOutputTokens - 预留输出 token 数
 * @returns 压缩触发阈值
 */
export function computeCompressionTokenThreshold(
  contextWindow: number,
  reservedOutputTokens: number = 4_096
): number {
  return Math.min(
    contextWindow * 0.65,
    contextWindow - reservedOutputTokens - 1_024 // 1_024 为安全边界
  );
}

/** 自动压缩触发——上下文体积阈值（字符数），作为 token 估算不可用时的降级 */
export const COMPRESSION_CHAR_THRESHOLD = 24_000;
```

**阈值策略补充**：

- 若当前模型能拿到上下文窗口元信息，则压缩阈值优先按窗口大小动态计算，建议取 `maxContextTokens * 0.6 ~ 0.7`
- 若拿不到模型窗口信息，再回退到固定默认值 `8_000`

这样可以避免在小窗口模型上触发过晚，也避免在大窗口模型上过早压缩。

**渐进式启用**：

- 第一版 tokenEstimator 为可选参数，不传入时继续使用字符级估算
- 在 `coordinator.prepareMessagesBeforeSend` 中根据当前模型配置决定是否创建 tokenEstimator
- 若 `js-tiktoken` 加载失败（如 CDN 不可达），自动降级到字符级估算
- tokenEstimator 只有在 encoder 已就绪时才使用；未就绪或加载失败时直接走字符级估算

**分阶段 plan**：

- **P3-1A**：expanded messages → tiktoken estimate → policy（不做 usage 回填）
- **P3-1B**：增加 per-message estimated cache（tokenCount、source、modelId、contentHash）
- **P3-1C**：仅记录 usage 观测到 request-level telemetry，不参与 tokenCount 持久化
- **P3-1D**：后续独立设计 usage 校准方案

#### 接口一致性补充

当前设计里 `TokenEstimator` 接口是同步的，但后文的 encoder 懒加载示例是异步的，这会影响 `policy.evaluateCompression` 的调用方式。这里需要明确：

- `evaluateCompression` 保持同步，不在 `policy` 内部触发异步加载
- tokenizer 的加载和缓存前移到 `coordinator.prepareMessagesBeforeSend`
- `TokenEstimator` 只有在 encoder 已就绪时才传给 `policy`；未就绪或加载失败时直接走字符级估算

同时，`CompressionPolicyResult` 需要增加 `tokenCount?: number` 字段，避免第三阶段上线后 UI、日志和测试仍只能看到字符级快照。

#### 消息级 Token 缓存策略

第三阶段第一版不采用 `usage.inputTokens` 增量回填单条消息的混合方案，只使用 `js-tiktoken`（或字符级 fallback）生成 message-level token estimate，并把 `usage` 保留为 request-level telemetry。原因是 `usage.inputTokens` 会同时受 system prompt、摘要注入、工具定义、文件引用展开、工具续轮与重试影响，无法稳定映射到单条消息。

**数据结构变更**：

```ts
type TokenCountSource = 'estimated' | 'usage_observed';

// src/components/BChatSidebar/utils/types.ts
export interface Message {
  // ... 现有字段
  tokenCount?: number;
  tokenCountSource?: TokenCountSource;
  tokenCountModelId?: string;
  tokenCountContentHash?: string;
}
```

P3 第一版只写入 `tokenCountSource = 'estimated'` 的消息级缓存；`usage_observed` 仅用于保留原始 usage 遥测，不参与自动压缩阈值判断。

**估算总 token 的逻辑**：

```ts
// src/components/BChatSidebar/utils/compression/tokenEstimator.ts
export function estimateTotalTokens(
  messages: Message[],
  currentUserMessage: Message,
  currentModelId: string,
  tokenEstimator: TokenEstimator
): number {
  let total = 0;

  for (const msg of messages) {
    const canReuseEstimate = msg.tokenCount !== undefined
      && msg.tokenCountSource === 'estimated'
      && msg.tokenCountModelId === currentModelId
      && msg.tokenCountContentHash === buildMessageContentHash(msg);

    total += canReuseEstimate
      ? msg.tokenCount
      : tokenEstimator.estimate(convert.toModelMessages([msg]));
  }

  total += tokenEstimator.estimate(convert.toModelMessages([currentUserMessage]));

  return total;
}
```

**兼容性处理**：

- 旧消息没有 `tokenCount` 字段时，降级为重新估算
- 模型切换时，旧的 `tokenCountModelId` 不匹配，自动失效
- 消息被编辑、重放或引用展开策略变化时，`tokenCountContentHash` 不匹配，自动失效

#### usage 遥测策略

- `message.usage` 保持原样记录 provider 返回值
- `usage` 只用于请求级日志、调试和后续观测
- `usage delta` 校准方案不纳入本次 Phase 3 范围，后续如需引入，必须单独出设计文档

同时需要把 token 维度补进摘要记录快照，否则第三阶段上线后只能回看字符数，无法解释“为什么按 token 阈值触发压缩”：

```ts
interface ConversationSummaryRecord {
  // ...现有字段
  charCountSnapshot: number;
  tokenCountSnapshot?: number;
}
```

#### 遗漏点补充

**1. assistant 消息的 tokenCount**

assistant 消息和 user 消息一样，统一基于 `convert.toModelMessages()` 后的内容做估算缓存，不直接复用 `outputTokens`。`outputTokens` 更接近“本轮生成成本”，不等于“下一轮作为历史输入时的 token 数”。

**2. system prompt 的 token**

每次发送都包含 system prompt，可以估算一次后缓存：

```ts
let cachedSystemPromptTokens: number | undefined;

function getSystemPromptTokens(tokenEstimator: TokenEstimator): number {
  if (cachedSystemPromptTokens === undefined) {
    cachedSystemPromptTokens = tokenEstimator.estimateText(SYSTEM_PROMPT);
  }
  return cachedSystemPromptTokens;
}
```

**3. 工具定义的 token**

如果有工具调用，工具定义（JSON Schema）也会占用 token：

```ts
function estimateToolsTokens(tokenEstimator: TokenEstimator, tools: ToolDefinition[]): number {
  if (!tools || tools.length === 0) return 0;
  return tokenEstimator.estimateText(JSON.stringify(tools));
}
```

**4. 文件引用展开后的 token**

文件引用在发送前会被展开为完整内容，实际 token 可能远大于原始消息。需要在展开后重新估算：

```ts
// 在 buildChatMessageReferences 后，展开的消息才是实际发送的内容
const expandedMessages = buildChatMessageReferences(sourceMessages);

// 对于含文件引用的消息，需要重新估算 token（不能用缓存的 tokenCount）
for (const msg of expandedMessages) {
  if (msg.references?.length) {
    msg.tokenCount = undefined;  // 标记需要重新估算
  }
}
```

**完整的估算逻辑**：

```ts
export function estimateTotalTokens(
  messages: Message[],
  currentUserMessage: Message,
  tokenEstimator: TokenEstimator,
  options?: {
    systemPrompt?: string;
    tools?: ToolDefinition[];
    summaryRecord?: ConversationSummaryRecord;
  }
): number {
  let total = 0;

  // 1. system prompt
  if (options?.systemPrompt) {
    total += tokenEstimator.estimateText(options.systemPrompt);
  }

  // 2. 摘要注入（若有）
  if (options?.summaryRecord) {
    const summaryContent = buildSummarySystemMessage(options.summaryRecord);
    total += tokenEstimator.estimateText(summaryContent);
  }

  // 3. 历史消息
  for (const msg of messages) {
    if (msg.tokenCount !== undefined && !msg.references?.length) {
      total += msg.tokenCount;
    } else {
      total += tokenEstimator.estimate(convert.toModelMessages([msg]));
    }
  }

  // 4. 当前用户消息
  total += tokenEstimator.estimate(convert.toModelMessages([currentUserMessage]));

  // 5. 工具定义（若有）
  if (options?.tools) {
    total += estimateToolsTokens(tokenEstimator, options.tools);
  }

  return total;
}
```

#### 边界情况处理

**1. 模型切换时的 tokenCount 失效**

不同模型使用不同的 tokenizer，切换模型后之前记录的 tokenCount 可能不准确：

```ts
// 在模型切换时，标记所有消息的 tokenCount 失效
function onModelChange(newModelId: string, previousModelId: string) {
  if (newModelId !== previousModelId) {
    // 方案 A：直接清空 tokenCount，下次发送时重新估算
    for (const msg of messages.value) {
      msg.tokenCount = undefined;
    }
    
    // 方案 B：保留 tokenCount，但在估算时加一个容差系数（如 ±10%）
    // 更省性能，但精度略低
  }
}
```

**2. tokenCount 的持久化**

`tokenCount` 应随消息一起持久化，避免每次加载会话都要重新估算。持久化时同时带上来源、模型和内容哈希：

```ts
interface PersistedMessage {
  // ... 现有字段
  tokenCount?: number;
  tokenCountSource?: TokenCountSource;
  tokenCountModelId?: string;
  tokenCountContentHash?: string;
}
```

**3. 多模态消息（图片）的 token**

图片的 token 计算因模型而异：

- GPT-4V：低分辨率 85 tokens，高分辨率 170 + 85*tiles
- Claude：约 258 tokens/张（固定）

```ts
function estimateImageTokens(imageInfo: ImageInfo, modelId: string): number {
  if (modelId.startsWith('gpt-4')) {
    return imageInfo.detail === 'low' ? 85 : 170 + Math.ceil(imageInfo.width / 512) * Math.ceil(imageInfo.height / 512) * 85;
  }
  if (modelId.startsWith('claude')) {
    return 258;
  }
  // 其他模型降级用字符估算
  return 100;
}
```

**4. 流式响应中无 usage 的情况**

部分模型在流式响应中不返回 usage，需要降级处理：

```ts
onFinish: async ({ usage }: AIStreamFinishChunk): Promise<void> => {
  if (usage) {
    // 正常记录 tokenCount
    // ...
  } else {
    // 降级：用 tiktoken 估算当前消息的 token
    const currentUserMessage = messages.value.findLast(m => m.role === 'user');
    if (currentUserMessage) {
      currentUserMessage.tokenCount = await tokenEstimator.estimateText(currentUserMessage.content);
    }
    if (message.role === 'assistant') {
      message.tokenCount = await tokenEstimator.estimateText(message.content);
    }
  }
}
```

#### 依赖引入

```bash
pnpm add js-tiktoken
```

`js-tiktoken` 是 tiktoken 的纯 JS 移植版，包体积约 500KB（含编码表），支持 tree-shaking 按需加载 tokenizer。

#### 懒加载策略

tokenizer 编码表较大，应按需加载。按 encoding 名称缓存，避免模型切换时使用错误的 encoder：

```ts
const encoderCache = new Map<string, Tiktoken>();

async function getEncoder(encodingName: string): Promise<Tiktoken> {
  const cached = encoderCache.get(encodingName);
  if (cached) return cached;
  const { getEncoding } = await import('js-tiktoken');
  const encoder = getEncoding(encodingName);
  encoderCache.set(encodingName, encoder);
  return encoder;
}
```

注意：`cl100k_base` / `o200k_base` 这种 encoding 名走 `getEncoding`；`gpt-4o` 这种 model 名走 `encodingForModel`。

### P3-2：多段摘要 + 按主题检索 + 联合召回

#### 设计原则

- 多段摘要不是简单地把单段摘要拆成多段，而是按话题边界自然分割
- 每段摘要独立维护 `coveredStartMessageId` / `coveredEndMessageId` / `coveredUntilMessageId`
- 上下文组装时可以按相关性选择召回哪些摘要段
- 同一会话同一时间可以有多条 `valid` 摘要（打破第一版"同一时间只允许一条 valid 摘要"的限制）

#### 数据结构变更

**ConversationSummaryRecord 新增字段**：

```ts
export interface ConversationSummaryRecord {
  // ... 现有字段不变

  /** 摘要集标识，同一次生成的多个 segment 共享同一个 summarySetId */
  summarySetId: string;

  /** 摘要分段索引，从 0 开始，同一摘要集内按时间顺序递增 */
  segmentIndex: number;

  /** 本次摘要集的总段数 */
  segmentCount: number;

  /** 摘要记录状态：draft（生成中）| valid（生效） | superseded（已替代） | invalid（无效） */
  status: 'draft' | 'valid' | 'superseded' | 'invalid';

  /** 摘要主题标签，由 AI 摘要模型生成 */
  topicTags: string[];

  /** 摘要相关性向量（预留，第三版不实现） */
  relevanceEmbedding?: number[];
}
```

**StructuredConversationSummary 新增字段**：

```ts
export interface StructuredConversationSummary {
  // ... 现有字段不变

  /** 本段摘要的主题标签，用于检索匹配 */
  topicTags: string[];
}
```

#### 话题边界检测

话题边界由 `planner` 在消息切分阶段检测，而非由 AI 模型判断。检测规则：

1. **时间间隔**：相邻两条用户消息间隔超过 30 分钟，视为话题边界
2. **显式切换**：用户消息中出现"换个话题"/"接下来"/"另外"等切换词
3. **文件引用跳变**：连续消息引用的文件路径完全不同，视为话题切换

为避免同一任务中“跨文件修改”被误拆成多个 segment，文件引用跳变不能单独作为强边界。需要补充约束：

- 若两轮消息都属于同一个任务目标，且只是从 `A.ts` 切到 `B.ts`，不应仅凭文件差异切段
- `file_context_change` 至少要与 `time_gap` 或 `explicit_switch` 其中之一共同出现，或连续两轮文件集合完全无交集时才成立
- `pendingActions` 未清空的连续执行链默认优先视为同一主题

```ts
interface TopicBoundary {
  messageId: string;
  reason: 'time_gap' | 'explicit_switch' | 'file_context_change';
}

function detectTopicBoundaries(messages: Message[]): TopicBoundary[] {
  const boundaries: TopicBoundary[] = [];
  // ... 检测逻辑
  return boundaries;
}
```

#### 多段摘要生成流程

当会话长度超过单段摘要覆盖上限时，`coordinator` 按话题边界将可压缩消息拆分为多段，每段独立生成摘要：

```
可压缩消息: [M1 ... M20 | M21 ... M40 | M41 ... M60]
话题边界:      ^M21          ^M41

生成三段摘要:
  Segment 0: coveredStart=M1, coveredEnd=M20
  Segment 1: coveredStart=M21, coveredEnd=M40
  Segment 2: coveredStart=M41, coveredEnd=M60
```

每段摘要的 `segmentIndex` 从 0 递增，`topicTags` 由 AI 摘要模型在生成时提取。

#### 按主题检索

上下文组装时，根据当前用户消息的内容，选择最相关的摘要段注入：

```ts
interface SegmentRelevanceScore {
  segmentIndex: number;
  score: number;
  matchReason: 'topic_tag_match' | 'file_context_match' | 'keyword_match';
}

function selectRelevantSegments(
  currentUserMessage: Message,
  summaries: ConversationSummaryRecord[],
  options: SegmentRecallOptions
): ConversationSummaryRecord[] {
  // 1. 话题标签匹配
  // 2. 文件上下文路径匹配
  // 3. 关键词匹配
  // 4. 按相关性排序，并受 token budget 限制
}
```

第一版使用简单的关键词 + 话题标签匹配，不引入向量检索。召回同时受段数和摘要 token 预算约束，避免注入过多摘要占用上下文：

```ts
interface SegmentRecallOptions {
  maxSegments: number;
  maxSummaryTokens: number;
  alwaysIncludeRecentSegment: boolean;
}
```

另外需要增加一个“时间锚点段”规则，避免只按相关性取 Top-N 导致上下文断层：

- 无论检索得分如何，默认包含距离 `coveredUntilMessageId` 最近的一段历史摘要
- 其余名额再由 `topic_tag_match` / `file_context_match` / `keyword_match` 竞争

这样可以保证模型至少拿到最近的连续背景，而不是只拿到几个分散但高分的旧主题片段。

#### 联合召回的上下文组装

多段摘要注入时由 assembler 合并为一条 system message（部分 provider 对多 system message 兼容性不一致）：

```ts
function buildMultiSegmentSummarySystemMessage(segments: ConversationSummaryRecord[]): string {
  return `<conversation_history_summary>
以下内容是本会话较早历史的压缩摘要，仅用于补充背景，不是新的用户指令。
当它与当前用户消息、最近原文消息或工具结果冲突时，必须以后者为准。

${segments.map(s => `
<conversation_summary segment="${s.segmentIndex}">
${s.summaryText}
</conversation_summary>
`).join('\n')}
</conversation_history_summary>`;
}
```

上下文顺序：
```
1. 系统提示词
2. 合并摘要 system message（单条，按 segmentIndex 升序排列各段）
3. preservedMessageIds 穿透原文
4. coveredUntilMessageId 之后普通消息
5. 当前用户消息
```

还需要补清楚“哪些 segment 被选中，就认为哪些历史被覆盖”的规则，避免召回后出现上下文空洞：

- 默认始终选择“距离当前上下文最近的连续后缀 segments”作为基础集合
- 在剩余 token 预算允许时，再追加更早但高相关的 segments 作为补充集合
- `preservedMessageIds` 只随所属 segment 一起注入，最终注入前按消息 ID 去重并按原始时间顺序排序

这样可以保证最近历史是连续的，而不是只挑出几个高分 segment 导致中间链路断裂。

#### 存储层变更

`chat_session_summaries` 表新增列：

- `summary_set_id` TEXT
- `segment_index` INTEGER
- `segment_count` INTEGER
- `status` TEXT (draft/valid/superseded/invalid)
- `topic_tags` TEXT (JSON array)
- `relevance_embedding` TEXT (预留，NULL)

查询接口调整（保留兼容方法过渡）：

- `getValidSummarySet(sessionId)` — 返回当前有效的完整摘要集（多条）
- `getValidSummaries(sessionId)` — 所有 valid 摘要，按 segment_index 排序
- `getValidSummaryCompat(sessionId)` — 兼容旧 UI，内部 stitch 多段为一段展示文本
- `getValidSummary(sessionId)` — 保留但标注 deprecated

生成多段摘要时，使用事务保证整组生效：
1. 先写入 `draft` 状态的摘要记录
2. 所有 segment 生成成功
3. 同一事务内：新集标记为 `valid` + 旧集标记为 `superseded`
4. SQLite 用 transaction；localStorage fallback 一次性写完整数组

`useCompression`、`CompressionButton`、`SummaryModal` 在 P3-6 切换到"摘要集合"视角，避免存储层和 UI 一次性联动重构。

#### 与单段摘要的兼容

- 已有的单段摘要记录 `segmentIndex = 0`、`segmentCount = 1`、`summarySetId = record.id`、`topicTags = []`
- 升级后首次压缩时，旧的单段摘要继续有效
- 下一次增量压缩时，如果检测到话题边界，生成多段摘要并将旧摘要集标记为 superseded

#### schema 版本升级与迁移

多段摘要引入后 `schemaVersion` 从 1 升级到 2。读取时对 v1 记录做 normalize，不因 `schemaVersion !== CURRENT_SCHEMA_VERSION` 直接标记 invalid：

```ts
function normalizeSummaryRecord(record: RawSummaryRecord): ConversationSummaryRecord {
  if (record.schemaVersion === 1) {
    return {
      ...record,
      segmentIndex: 0,
      segmentCount: 1,
      summarySetId: record.id,
      topicTags: [],
      status: 'valid',
    };
  }
  return record;
}
```

只有结构化 JSON 损坏、关键字段缺失、覆盖消息不存在时才标记 invalid。当会话下一次成功生成 v2 摘要后，再将旧 v1 摘要标记为 superseded。

#### 数据迁移补充

- **SQLite migration**：增加 `summary_set_id`、`segment_count`、`status`、`segment_index`、`topic_tags`、`relevance_embedding` 列，已有行回填默认值（status='valid'，segmentIndex=0 或保持不变）
- **localStorage fallback**：读取旧记录时做运行时补全，写回时统一落成 v2
- **测试**：覆盖"数据库已迁移 + local fallback 未迁移"两条路径

---

## 实施顺序

### 第二阶段

1. **P2-0**：先补 coordinator / storage / summaryGenerator 的失败路径测试
2. **P2-1**：规则裁剪优化（thinking、tool-result、file-reference）
3. **P2-2**：结构化 CompressionError + 自动压缩 toast 防抖
4. **P2-3**：SummaryModal fileContext + CompressionButton 状态反馈

### 第三阶段

5. **P3-0**：先做 token budget snapshot，不动多段摘要
6. **P3-1**：接入 tokenizer factory + per-message estimated cache
7. **P3-2**：只记录 usage telemetry，不做 usage delta 回填
8. **P3-3**：新增 summarySetId / segmentIndex / schema v2 migration
9. **P3-4**：实现多段摘要生成，先不做复杂召回
10. **P3-5**：实现最近段 + 文件路径 + topicTags 的联合召回
11. **P3-6**：旧 UI 从单摘要切到摘要集合视角

---

## 验证与测试

### 第二阶段验证

- 所有新增/修改的测试用例通过
- 规则裁剪输出对比测试：对同一组消息，新裁剪策略的输出应比旧策略信息密度更高
- 错误提示端到端测试：模拟各阶段失败，验证 toast 内容正确
- UI 组件测试：SummaryModal 渲染 fileContext，CompressionButton 交互反馈

### 第三阶段验证

- token 估算精度测试：对已知 token 数的文本，估算误差 < 10%
- token 估算降级测试：js-tiktoken 加载失败时自动降级到字符级估算
- 多段摘要生成测试：超长会话按话题边界正确拆分
- 多段摘要检索测试：给定用户消息，选择最相关的摘要段
- 多段摘要组装测试：多段摘要按 segmentIndex 升序注入
- 兼容性测试：旧的单段摘要记录在升级后仍可正确读取
- 回归测试：会话切换、消息重新生成、历史分页加载、工具调用循环

---

## 决策结论

- 第二阶段与第三阶段均不改变压缩模块的六层整体架构。
- 第二阶段先完成测试补齐、裁剪质量优化、错误提示与 UI 增强。
- 第三阶段采用 provider-aware token budget estimation，而不是宣称“精确 token 计数”。
- 第三阶段第一版不做 `usage delta` 回填单条消息，只做 message-level estimated cache 与 request-level usage telemetry。
- 多段摘要使用 `summarySetId + segmentIndex + segmentCount` 管理摘要集，召回时同时受相关性与 token 预算约束。
