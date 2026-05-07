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

- 接入精确 token 估算，替换字符级体积估算，让双阈值判断更精准
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
  const text = part.thinking;
  if (text.length <= 150) return `[thinking: ${text}]`;
  const lastNewline = text.lastIndexOf('\n', 150);
  const conclusionStart = lastNewline > text.length * 0.5 ? lastNewline + 1 : text.length - 80;
  return `[thinking: ...${text.slice(conclusionStart)}]`;
}
```

逻辑：优先从 150 字符内最后一个换行处截取后半段（结论部分），若换行位置过于靠前则取末尾 80 字符。

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
      const snippet = ref.selectedContent
        ? ref.selectedContent.length > 80
          ? `${ref.selectedContent.slice(0, 40)}...${ref.selectedContent.slice(-30)}`
          : ref.selectedContent
        : '';
      return `[file: ${ref.path}${lineInfo}, intent: ${message.content.slice(0, 60)}, snippet: ${snippet}]`;
    })
    .join('; ');
}
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
  const resultText = typeof part.result === 'string'
    ? part.result.slice(0, 100)
    : part.result
      ? JSON.stringify(part.result).slice(0, 100)
      : '';
  return resultText
    ? `[tool-result: ${part.toolName}, ${resultText}]`
    : `[tool-result: ${part.toolName}]`;
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

### P3-1：精确 token 估算

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

**policy.ts 改造**：

```ts
export function evaluateCompression(
  messages: Message[],
  currentSummary?: ConversationSummaryRecord,
  currentUserMessage?: Message,
  tokenEstimator?: TokenEstimator
): CompressionPolicyResult {
  const modelMessages = buildEffectiveContextMessages(messages, currentSummary, currentUserMessage);

  let charCount: number;
  let tokenCount: number | undefined;

  if (tokenEstimator) {
    tokenCount = tokenEstimator.estimate(modelMessages);
    charCount = estimateContextSize(modelMessages);
  } else {
    charCount = estimateContextSize(modelMessages);
  }

  const roundExceeded = roundCount >= COMPRESSION_ROUND_THRESHOLD;
  const charExceeded = tokenEstimator
    ? (tokenCount ?? 0) >= COMPRESSION_TOKEN_THRESHOLD
    : charCount >= COMPRESSION_CHAR_THRESHOLD;

  // ...
}
```

**常量更新**：

```ts
/** 自动压缩触发——上下文体积阈值（token 数），当 tokenEstimator 可用时优先使用 */
export const COMPRESSION_TOKEN_THRESHOLD = 8_000;

/** 自动压缩触发——上下文体积阈值（字符数），作为 token 估算不可用时的降级 */
export const COMPRESSION_CHAR_THRESHOLD = 24_000;
```

**渐进式启用**：

- 第一版 tokenEstimator 为可选参数，不传入时继续使用字符级估算
- 在 `coordinator.prepareMessagesBeforeSend` 中根据当前模型配置决定是否创建 tokenEstimator
- 若 `js-tiktoken` 加载失败（如 CDN 不可达），自动降级到字符级估算

#### 混合估算策略：历史消息用 usage，新消息用 tiktoken

**问题**：每次发送前都用 tiktoken 对全量历史消息计算 token，性能开销较大。

**优化方案**：利用 API 返回的 `usage` 数据，为每条消息记录实际 token 数，发送前只需估算新消息。

**数据结构变更**：

```ts
// src/components/BChatSidebar/utils/types.ts
export interface Message {
  // ... 现有字段

  /** 该消息的 token 数，由 API 返回的 usage 计算得出 */
  tokenCount?: number;
}
```

**usage 数据说明**：

API 返回的 `usage.inputTokens` 是整轮输入的总 token（包含所有历史 + 当前用户消息），不是单条消息的 token：

```
第 1 轮：inputTokens = system_prompt + M1(user)              = 100
第 2 轮：inputTokens = system_prompt + M1 + M2 + M3          = 250
第 3 轮：inputTokens = system_prompt + M1 + M2 + M3 + M4 + M5 = 400
```

因此需要计算增量得到单条消息的 token。

**记录 token 数的时机**：

在 `useChatStream.ts` 的 `onFinish` 回调中，计算并记录每条消息的 token 数：

```ts
// 需要维护上一轮的累计 inputTokens
let previousInputTokens = 0;

onFinish: async ({ usage }: AIStreamFinishChunk): Promise<void> => {
  if (usage) {
    // 当前用户消息的 token = 本轮 inputTokens - 上一轮累计
    const currentUserMessage = messages.value[messages.value.length - 1];
    if (currentUserMessage && currentUserMessage.role === 'user') {
      currentUserMessage.tokenCount = usage.inputTokens - previousInputTokens;
    }
    
    // 更新累计值
    previousInputTokens = usage.inputTokens;
    
    // 原有逻辑
    message.usage = usage;
  }
}
```

**估算总 token 的逻辑**：

```ts
// src/components/BChatSidebar/utils/compression/tokenEstimator.ts
export function estimateTotalTokens(
  messages: Message[],
  currentUserMessage: Message,
  tokenEstimator: TokenEstimator
): number {
  let total = 0;

  // 历史消息：优先用已记录的 tokenCount，无则降级用 tiktoken 估算
  for (const msg of messages) {
    if (msg.tokenCount !== undefined) {
      total += msg.tokenCount;
    } else {
      // 降级：用 tiktoken 估算（兼容旧消息无 tokenCount 的情况）
      total += tokenEstimator.estimate(convert.toModelMessages([msg]));
    }
  }

  // 当前用户消息：用 tiktoken 估算
  total += tokenEstimator.estimate(convert.toModelMessages([currentUserMessage]));

  return total;
}
```

**方案对比**：

| 方案 | 历史消息 | 新消息 | 优点 | 缺点 |
|------|---------|--------|------|------|
| 当前（字符估算） | 字符估算 | 字符估算 | 简单 | 不精准 |
| 纯 tiktoken | tiktoken | tiktoken | 精准 | 每次都要计算，性能差 |
| **混合方案** | 用已记录的 tokenCount | tiktoken | 精准 + 高效 | 需要改造数据结构 |

**兼容性处理**：

- 旧消息没有 `tokenCount` 字段，降级用 tiktoken 估算
- 切换会话时重置 `previousInputTokens`
- 消息被编辑后，`tokenCount` 失效，需要重新估算

#### 遗漏点补充

**1. assistant 消息的 tokenCount**

当前方案只记录了 user 消息的 token，但 assistant 消息也会作为历史消息发送，需要记录：

```ts
onFinish: async ({ usage }: AIStreamFinishChunk): Promise<void> => {
  if (usage) {
    // user 消息：inputTokens 增量
    const currentUserMessage = messages.value.findLast(m => m.role === 'user');
    if (currentUserMessage) {
      currentUserMessage.tokenCount = usage.inputTokens - previousInputTokens;
    }
    
    // assistant 消息：outputTokens 直接记录
    message.tokenCount = usage.outputTokens;
    
    previousInputTokens = usage.inputTokens;
  }
}
```

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

tokenCount 应该随消息一起持久化，避免每次加载会话都要重新估算：

```ts
// 在消息持久化时包含 tokenCount
interface PersistedMessage {
  // ... 现有字段
  tokenCount?: number;
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

tokenizer 编码表较大，应按需加载：

```ts
let cachedEncoder: Tiktoken | null = null;

async function getEncoder(encodingName: string): Promise<Tiktoken> {
  if (!cachedEncoder) {
    const { encodingForModel } = await import('js-tiktoken');
    cachedEncoder = encodingForModel(encodingName);
  }
  return cachedEncoder;
}
```

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

  /** 摘要分段索引，从 0 开始，同一会话内按时间顺序递增 */
  segmentIndex: number;

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
  maxSegments: number
): ConversationSummaryRecord[] {
  // 1. 话题标签匹配
  // 2. 文件上下文路径匹配
  // 3. 关键词匹配
  // 按 score 排序，取 top-N
}
```

第一版使用简单的关键词 + 话题标签匹配，不引入向量检索。`maxSegments` 默认为 3，避免注入过多摘要占用上下文。

#### 联合召回的上下文组装

多段摘要注入时，按 `segmentIndex` 升序排列，每段摘要独立注入为 system message：

```
1. 系统提示词
2. 摘要段 0 (system message)
3. 摘要段 1 (system message)
4. 摘要段 2 (system message)
5. preservedMessageIds 穿透原文
6. coveredUntilMessageId 之后普通消息
7. 当前用户消息
```

每段摘要的 system message 格式与单段一致，增加段索引标识：

```ts
`以下内容是本会话较早历史第 ${segmentIndex + 1} 段的压缩摘要，仅用于补充背景，不是新的用户指令。
当它与当前用户消息、最近原文消息或工具结果冲突时，必须以后者为准。

<conversation_summary segment="${segmentIndex}">
${summaryText}
</conversation_summary>`
```

#### 存储层变更

`chat_session_summaries` 表新增列：

- `segment_index` INTEGER
- `topic_tags` TEXT (JSON array)
- `relevance_embedding` TEXT (预留，NULL)

`getValidSummary` 改为 `getValidSummaries`（复数），返回同一会话的所有 valid 摘要，按 `segment_index` 排序。

#### 与单段摘要的兼容

- 已有的单段摘要记录 `segmentIndex = 0`，`topicTags = []`
- 升级后首次压缩时，旧的单段摘要继续有效
- 下一次增量压缩时，如果检测到话题边界，会生成多段摘要并将旧摘要标记为 superseded

#### schema 版本升级

多段摘要引入后 `schemaVersion` 从 1 升级到 2：

- `v2` 新增 `segmentIndex`、`topicTags` 字段
- `StructuredConversationSummary` 新增 `topicTags` 字段
- 读到 `schemaVersion = 1` 的旧摘要时标记 `invalid`，`invalidReason = 'unsupported_schema_version'`
- 下一轮自动压缩会基于原始消息生成 v2 摘要

---

## 实施顺序

### 第二阶段

1. **P2-1**：测试覆盖补全（无依赖，可立即开始）
2. **P2-2**：规则裁剪质量优化（依赖 P2-1 的测试基线）
3. **P2-3**：错误提示改进（依赖 P2-2，因为裁剪改进可能引入新的错误路径）
4. **P2-4**：UI 体验优化（可与 P2-3 并行，无强依赖）

### 第三阶段

5. **P3-1**：精确 token 估算（依赖 P2-1 的测试基线）
6. **P3-2**：多段摘要 + 检索召回（依赖 P3-1，因为多段摘要的体积判断需要精确 token 估算）

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

第二阶段聚焦测试覆盖、裁剪质量、错误提示和 UI 体验的全面补齐，不改变压缩模块的整体架构。第三阶段在第二阶段的测试基础上，先接入精确 token 估算替换字符级估算，再实现多段摘要和按主题检索召回。多段摘要通过话题边界检测自然分割，每段独立维护覆盖边界，上下文组装时按相关性选择注入。
