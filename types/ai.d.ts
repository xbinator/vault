/**
 * @file ai.d.ts
 * @description AI 相关全局类型声明。
 */
import type { ModelMessage } from 'ai';
import type { JSONSchema7 } from 'json-schema';

/**
 * 服务商请求格式类型。
 */
export type AIProviderType = 'openai' | 'anthropic' | 'google' | 'deepseek';

/** AI 工具来源类型。 */
export type AIToolSource = 'builtin' | 'custom' | 'mcp';

/** AI 工具风险等级。 */
export type AIToolRiskLevel = 'read' | 'write' | 'dangerous';

/** AI 工具权限模式（用户配置）。 */
export type AIToolPermissionMode = 'ask' | 'readonly' | 'autoSafe';

/** AI 工具授权范围（用户选择）。 */
export type AIToolGrantScope = 'session' | 'always';

/** AI 工具执行状态。 */
export type AIToolExecutionStatus = 'success' | 'failure' | 'cancelled' | 'awaiting_user_input';

/**
 * AI 选项。
 * @description 等待用户输入问题时使用的单个选项条目。
 */
export interface AIChoiceOption {
  /** 可见标签。 */
  label: string;
  /** 提交的值。 */
  value: string;
  /** 可选描述。 */
  description?: string;
}

/**
 * AI 等待用户选择问题。
 * @description 工具暂停等待用户输入时使用的载荷。
 */
export interface AIAwaitingUserChoiceQuestion {
  /** 生成的问题标识符。 */
  questionId: string;
  /** 相关的工具调用标识符。 */
  toolCallId: string;
  /** 选择模式。 */
  mode: 'single' | 'multiple';
  /** 提示文本。 */
  question: string;
  /** 可用选项。 */
  options: AIChoiceOption[];
  /** 是否允许其他文本输入。 */
  allowOther: boolean;
  /** 多选时的最大选择数。 */
  maxSelections?: number;
}

/**
 * AI 工具参数模式。
 * @description 用于工具参数验证的 JSON Schema 包装器。
 */
export interface AIToolParameterSchema {
  /** 模式类型，固定为 object。 */
  type: 'object';
  /** 属性定义。 */
  properties: Record<string, unknown>;
  /** 必需的属性名称。 */
  required?: string[];
  /** 是否允许额外属性。 */
  additionalProperties?: boolean;
}

/**
 * AI 工具定义。
 * @description 描述 AI 工具的元数据。
 */
export interface AIToolDefinition {
  /** 工具名称。 */
  name: string;
  /** 工具描述。 */
  description: string;
  /** 工具来源。 */
  source: AIToolSource;
  /** 风险等级。 */
  riskLevel: AIToolRiskLevel;
  /** 参数模式。 */
  parameters: AIToolParameterSchema;
  /** 此工具是否需要当前编辑器文档上下文。默认为 true。 */
  requiresActiveDocument?: boolean;
  /** UI 和策略决策使用的权限类别。 */
  permissionCategory?: 'document' | 'settings' | 'system';
  /** 此写入工具是否可以在首次权限模型中自动批准并记住。 */
  safeAutoApprove?: boolean;
}

/**
 * 编辑器选区。
 */
export interface EditorSelection {
  /** 选区起始位置。 */
  from: number;
  /** 选区结束位置。 */
  to: number;
  /** 选中的文本。 */
  text: string;
}

/**
 * AI 工具执行上下文。
 * @description 工具所需的文档和编辑器信息。
 */
export interface AIToolContext {
  /** 当前文档信息。 */
  document: {
    /** 文档标识符。 */
    id: string;
    /** 文档标题。 */
    title: string;
    /** 文件路径，未保存文档为 null。 */
    path: string | null;
    /** 读取文档内容。 */
    getContent: () => string;
  };
  /** 编辑器操作。 */
  editor: {
    /** 读取当前选区。 */
    getSelection: () => EditorSelection | null;
    /** 在光标处插入内容。 */
    insertAtCursor: (content: string) => Promise<void>;
    /** 替换当前选区。 */
    replaceSelection: (content: string) => Promise<void>;
    /** 替换整个文档内容。 */
    replaceDocument: (content: string) => Promise<void>;
  };
}

/**
 * AI 工具执行错误。
 * @description 描述工具执行失败的原因。
 */
export interface AIToolExecutionError {
  /** 错误代码。 */
  code:
    | 'TOOL_NOT_FOUND'
    | 'INVALID_INPUT'
    | 'NO_ACTIVE_DOCUMENT'
    | 'NO_SELECTION'
    | 'NO_CURSOR'
    | 'PERMISSION_DENIED'
    | 'USER_CANCELLED'
    | 'EDITOR_UNAVAILABLE'
    | 'STALE_CONTEXT'
    | 'TOOL_TIMEOUT'
    | 'UNSUPPORTED_PROVIDER'
    | 'CONFIRMATION_DISMISSED'
    | 'EXECUTION_FAILED';
  /** 错误消息。 */
  message: string;
}

/**
 * AI 工具执行成功结果。
 * @description status = success。
 */
export interface AIToolExecutionSuccessResult<TResult = unknown> {
  /** 工具名称。 */
  toolName: string;
  /** 执行状态。 */
  status: 'success';
  /** 成功载荷。 */
  data: TResult;
  /** 成功结果不携带错误。 */
  error?: never;
}

/**
 * AI 工具执行失败结果。
 * @description status = failure。
 */
export interface AIToolExecutionFailureResult {
  /** 工具名称。 */
  toolName: string;
  /** 执行状态。 */
  status: 'failure';
  /** 失败详情。 */
  error: AIToolExecutionError;
  /** 失败结果不携带数据。 */
  data?: never;
}

/**
 * AI 工具执行取消结果。
 * @description status = cancelled。
 */
export interface AIToolExecutionCancelledResult {
  /** 工具名称。 */
  toolName: string;
  /** 执行状态。 */
  status: 'cancelled';
  /** 取消详情。 */
  error: AIToolExecutionError;
  /** 取消结果不携带数据。 */
  data?: never;
}

/**
 * AI 工具执行等待用户输入结果。
 * @description status = awaiting_user_input。
 */
export interface AIToolExecutionAwaitingUserInputResult {
  /** 工具名称。 */
  toolName: string;
  /** 执行状态。 */
  status: 'awaiting_user_input';
  /** 问题载荷。 */
  data: AIAwaitingUserChoiceQuestion;
  /** 等待结果不携带错误。 */
  error?: never;
}

/**
 * AI 工具执行结果。
 * @description 所有终止工具状态的判别联合。
 */
export type AIToolExecutionResult<TResult = unknown> =
  | AIToolExecutionSuccessResult<TResult>
  | AIToolExecutionFailureResult
  | AIToolExecutionCancelledResult
  | AIToolExecutionAwaitingUserInputResult;

/**
 * AI 工具执行器接口。
 * @description 定义工具执行能力。
 */
export interface AIToolExecutor<TInput = unknown, TResult = unknown> {
  /** 工具定义。 */
  definition: AIToolDefinition;
  /**
   * 执行工具。
   * @param input - 工具输入。
   * @param context - 执行上下文，不需要活动文档的工具可省略。
   * @returns 工具执行结果。
   */
  execute(input: TInput, context?: AIToolContext): Promise<AIToolExecutionResult<TResult>>;
}

export interface AICreateOptions {
  /** 服务商类型。 */
  providerType: AIProviderType;
  /** 服务商标识符。 */
  providerId: string;
  /** 服务商名称。 */
  providerName: string;
  /** API 密钥。 */
  apiKey?: string;
  /** 可选的基础 URL。 */
  baseUrl?: string;
}

/**
 * AI 传输工具结果。
 * @description 用于将工具结果发送回模型。
 */
export interface AITransportToolResult {
  /** 工具调用标识符。 */
  toolCallId: string;
  /** 工具名称。 */
  toolName: string;
  /** 工具结果载荷。 */
  result: unknown;
}

export interface AITransportTool {
  /** 工具名称。 */
  name: string;
  /** 工具描述。 */
  description: string;
  /** 工具参数模式。 */
  parameters: JSONSchema7;
}

/**
 * AI 输出配置。
 * @description 使用 AI SDK 的 output/object schema 能力约束返回结果。
 */
export interface AIOutputOptions {
  /** JSON Schema 定义。 */
  schema: JSONSchema7;
  /** 可选的结构化输出名称。 */
  name?: string;
  /** 可选的结构化输出描述。 */
  description?: string;
}

export interface AIRequestOptions {
  /** 请求标识符。 */
  requestId?: string;
  /** 服务商标识符。 */
  providerId?: string;
  /** 模型标识符。 */
  modelId: string;
  /** 提示文本。 */
  prompt?: string;
  /** 系统指令。 */
  system?: string;
  /** 温度参数。 */
  temperature?: number;
  /** 最大输出 token 数量。 */
  maxOutputTokens?: number;
  /** 对话消息列表。 */
  messages?: ModelMessage[];
  /** 可用工具列表。 */
  tools?: AITransportTool[];
  /** 上一次工具调用结果。 */
  toolResults?: AITransportToolResult[];
  /** 输出配置。 */
  output?: AIOutputOptions;
}

export interface AIStreamToolCallChunk {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

/**
 * 服务商模型元数据。
 */
export interface AIProviderModel {
  /** 唯一标识符。 */
  id: string;
  /** 显示名称。 */
  name: string;
  /** 模型类型。 */
  type: string;
  /** 此模型是否启用。 */
  isEnabled: boolean;
  /** 上下文窗口大小。 */
  contextWindow?: number;
  /** 是否支持工具使用。 */
  supportsTools?: boolean;
  /** 是否支持视觉。 */
  supportsVision?: boolean;
  /** 是否支持深度思考。 */
  supportsDeepThought?: boolean;
  /** 是否支持网络搜索。 */
  supportsWebSearch?: boolean;
  /** 是否支持图像生成。 */
  supportsImageGeneration?: boolean;
  /** 是否支持视频识别。 */
  supportsVideoRecognition?: boolean;
}

/**
 * AI 服务错误。
 * @description 扩展基础错误结构，添加代码字段。
 */
export interface AIServiceError {
  /** 错误代码。 */
  code: AIErrorCode;
  /** 错误消息。 */
  message: string;
}

/**
 * AI 服务商配置。
 */
export interface AIProvider {
  /** 唯一服务商标识符。 */
  id: string;
  /** 服务商显示名称。 */
  name: string;
  /** 服务商描述。 */
  description: string;
  /** 服务商请求格式类型。 */
  type: AIProviderType;
  /** 服务商是否启用。 */
  isEnabled: boolean;
  /** API 密钥。 */
  apiKey?: string;
  /** 可选的基础 URL。 */
  baseUrl?: string;
  /** 服务商图标。 */
  logo?: string;
  /** 是否为用户定义的服务商。 */
  isCustom?: boolean;
  /** 服务商是否只读。 */
  readonly?: boolean;
  /** 支持的模型。 */
  models?: AIProviderModel[];
}

/**
 * AI 自定义服务商载荷。
 * @description 创建或更新服务商时使用的数据。
 */
export interface AICustomProvider {
  /** 唯一标识符。 */
  id: string;
  /** 服务商显示名称。 */
  name: string;
  /** 服务商描述。 */
  description?: string;
  /** 服务商请求格式类型。 */
  type: AIProviderType;
  /** 服务商图标。 */
  logo?: string;
  /** 服务商是否启用。 */
  isEnabled?: boolean;
  /** API 密钥。 */
  apiKey?: string;
  /** 可选的基础 URL。 */
  baseUrl?: string;
}

export interface AIUsage {
  /** 输入 token 数量。 */
  inputTokens: number;
  /** 输出 token 数量。 */
  outputTokens: number;
  /** 总 token 数量。 */
  totalTokens: number;
}

export interface AIInvokeResult {
  text: string;
  output?: unknown;
  usage?: AIUsage;
}

export interface AIStreamResult {
  stream: StreamTextResult['textStream'];
}

export interface AIStreamFinishChunk {
  usage: AIUsage;
}
