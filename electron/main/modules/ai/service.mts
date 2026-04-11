import type { AICreateOptions, AIRequestOptions, AIInvokeResult, AIStreamResult } from 'types/ai';
import { generateText, streamText } from 'ai';
import { AIProviderRegistry } from './providers/_index.mjs';

class AIService {
  public aiProvider: AIProviderRegistry = new AIProviderRegistry();

  private createModel(createOptions: AICreateOptions, modelId: string) {
    return this.aiProvider.create(createOptions, modelId);
  }

  async generateText(createOptions: AICreateOptions, request: AIRequestOptions): Promise<AIInvokeResult> {
    try {
      const model = this.createModel(createOptions, request.modelId);
      const { prompt, system, temperature } = request;
      const result = await generateText({ model, prompt, system, temperature });

      const { inputTokens = 0, outputTokens = 0, totalTokens = 0 } = result.usage || {};

      return { text: result.text, usage: { inputTokens, outputTokens, totalTokens } };
    } catch (error: unknown) {
      throw this.aiProvider.normalizeError(error, createOptions.providerType);
    }
  }

  async streamText(createOptions: AICreateOptions, request: AIRequestOptions): Promise<AIStreamResult> {
    try {
      const model = this.createModel(createOptions, request.modelId);
      const { prompt, system, temperature } = request;
      const result = streamText({ model, prompt, system, temperature });

      return { stream: result.textStream };
    } catch (error: unknown) {
      throw this.aiProvider.normalizeError(error, createOptions.providerType);
    }
  }
}

export const aiService = new AIService();
