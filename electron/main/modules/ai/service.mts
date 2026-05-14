/**
 * @file service.mts
 * @description AI 服务核心类，封装文本生成和流式文本生成能力
 */
import type { ToolSet } from 'ai';
import type { AICreateOptions, AIRequestOptions, AIInvokeResult, AIStreamResult, AIServiceError } from 'types/ai';
import { tavilyExtract, tavilySearch } from '@tavily/ai-sdk';
import { generateText, jsonSchema, Output, stepCountIs, streamText, tool } from 'ai';
import { log } from '../logger/service.mjs';
import { AI_ERROR_CODE } from './errors/codes.mjs';
import { AIProviderRegistry } from './providers/_index.mjs';

// ─── 纯工具函数 ──────────────────────────────────────────────────────────────

/**
 * 根据 Tavily 配置创建 SDK 工具集。
 * 配置缺失或未启用时返回空对象。
 */
function createTavilySdkTools(tavily: AIRequestOptions['tavily']): ToolSet {
  if (!tavily?.enabled || !tavily.apiKey.trim()) return {};

  return {
    tavily_search: tavilySearch({
      apiKey: tavily.apiKey,
      topic: tavily.searchDefaults.topic,
      country: tavily.searchDefaults.country ?? undefined,
      maxResults: tavily.searchDefaults.maxResults,
      includeAnswer: tavily.searchDefaults.includeAnswer,
      includeImages: tavily.searchDefaults.includeImages,
      includeDomains: tavily.searchDefaults.includeDomains,
      excludeDomains: tavily.searchDefaults.excludeDomains,
      searchDepth: tavily.searchDefaults.searchDepth,
      timeRange: tavily.searchDefaults.timeRange ?? undefined
    }),
    tavily_extract: tavilyExtract({
      apiKey: tavily.apiKey,
      includeImages: tavily.extractDefaults.includeImages,
      extractDepth: tavily.extractDefaults.extractDepth,
      format: tavily.extractDefaults.format
    })
  };
}

/**
 * 判断当前请求是否启用了主进程可直接执行的 Tavily SDK 工具。
 * @param tavily - Tavily 配置
 * @returns 是否需要开启 SDK 多步工具循环
 */
function hasTavilySdkTools(tavily: AIRequestOptions['tavily']): boolean {
  return Boolean(tavily?.enabled && tavily.apiKey.trim());
}

/**
 * 将前端工具定义与 Tavily 工具合并为 AI SDK 兼容的工具集。
 * 合并结果为空时返回 undefined，避免向 SDK 传入空对象。
 */
function toSdkTools(tools: AIRequestOptions['tools'], tavily: AIRequestOptions['tavily']): ToolSet | undefined {
  const rendererTools: ToolSet = tools?.length
    ? Object.fromEntries(tools.map((item) => [item.name, tool({ description: item.description, inputSchema: jsonSchema(item.parameters) })]))
    : {};

  const merged: ToolSet = { ...rendererTools, ...createTavilySdkTools(tavily) };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * 将结构化输出配置转换为 AI SDK Output 格式。
 */
function toOutput(output: AIRequestOptions['output']) {
  if (!output) return undefined;
  return Output.object({ schema: jsonSchema(output.schema), name: output.name, description: output.description });
}

/**
 * 判断是否为可预期的临时服务错误（限流 / 服务不可用）。
 */
function isExpectedTransientError(error: AIServiceError): boolean {
  return error.code === AI_ERROR_CODE.RATE_LIMITED || error.code === AI_ERROR_CODE.SERVICE_UNAVAILABLE;
}

// ─── AIService ───────────────────────────────────────────────────────────────

/**
 * AI 服务类
 * 封装模型调用能力，支持同步文本生成与流式文本生成两种模式。
 */
class AIService {
  public aiProvider: AIProviderRegistry = new AIProviderRegistry();

  private abortControllers = new Map<string, AbortController>();

  // ── AbortController 管理 ──────────────────────────────────────────────────

  abortStream(requestId: string): void {
    const controller = this.abortControllers.get(requestId);
    if (!controller) return;

    controller.abort();
    this.abortControllers.delete(requestId);
    log.info(`[AIService] Stream aborted manually for requestId: ${requestId}`);
  }

  removeController(requestId: string): void {
    this.abortControllers.delete(requestId);
  }

  /**
   * 为指定请求创建 AbortSignal，并注册到内部映射表。
   * requestId 缺失时返回 undefined。
   */
  private registerAbortSignal(requestId?: string): AbortSignal | undefined {
    if (!requestId) return undefined;

    const controller = new AbortController();
    this.abortControllers.set(requestId, controller);
    return controller.signal;
  }

  // ── 内部辅助 ──────────────────────────────────────────────────────────────

  private createModel(createOptions: AICreateOptions, modelId: string) {
    return this.aiProvider.create(createOptions, modelId);
  }

  /**
   * 构建 generateText / streamText 共用的基础选项。
   */
  private buildBaseOptions(createOptions: AICreateOptions, request: AIRequestOptions) {
    return {
      model: this.createModel(createOptions, request.modelId),
      system: request.system,
      temperature: request.temperature,
      maxOutputTokens: request.maxOutputTokens,
      tools: toSdkTools(request.tools, request.tavily),
      ...(hasTavilySdkTools(request.tavily) ? { stopWhen: stepCountIs(5) } : {})
    };
  }

  /**
   * 统一处理 AI 调用异常：标准化错误、按类型记录日志，并返回错误元组。
   */
  private handleError(scope: string, error: unknown, providerType: AICreateOptions['providerType']): [AIServiceError] {
    const normalized = this.aiProvider.normalizeError(error, providerType);

    if (isExpectedTransientError(normalized)) {
      log.warn(`[AIService] ${scope} ${normalized.code}:`, normalized.message);
    } else {
      log.error(`[AIService] ${scope} error:`, error);
    }

    return [normalized];
  }

  // ── 公开 API ──────────────────────────────────────────────────────────────

  /**
   * 同步生成文本。
   */
  async generateText(createOptions: AICreateOptions, request: AIRequestOptions): Promise<[AIServiceError] | [undefined, AIInvokeResult]> {
    try {
      log.info(`[AIService] generateText request:`, request);

      const baseOptions = {
        ...this.buildBaseOptions(createOptions, request),
        output: toOutput(request.output)
      };

      const result = request.messages
        ? await generateText({ ...baseOptions, messages: request.messages })
        : await generateText({ ...baseOptions, prompt: request.prompt ?? '' });

      log.info(`[AIService] generateText result:`, result);

      const { inputTokens = 0, outputTokens = 0, totalTokens = 0 } = result.usage ?? {};
      return [undefined, { text: result.text, output: result.output, usage: { inputTokens, outputTokens, totalTokens } }];
    } catch (error) {
      return this.handleError('generateText', error, createOptions.providerType);
    }
  }

  /**
   * 流式生成文本。
   */
  async streamText(createOptions: AICreateOptions, request: AIRequestOptions): Promise<[AIServiceError] | [undefined, AIStreamResult]> {
    try {
      log.info(`[AIService] streamText request:`, request);

      const baseOptions = {
        ...this.buildBaseOptions(createOptions, request),
        abortSignal: this.registerAbortSignal(request.requestId)
      };

      const result = request.messages
        ? streamText({ ...baseOptions, messages: request.messages })
        : streamText({ ...baseOptions, prompt: request.prompt ?? '' });

      return [undefined, { stream: result.fullStream }];
    } catch (error) {
      return this.handleError('streamText', error, createOptions.providerType);
    }
  }
}

/** AI 服务单例 */
export const aiService = new AIService();
