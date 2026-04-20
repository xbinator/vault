<template>
  <div class="b-chat">
    <Container v-if="messages.length" :loading="loading" class="b-chat__container">
      <div class="b-chat__messages">
        <MessageBubble v-for="item in messages" :key="item.id" :message="item" @edit="handleEdit" @regenerate="handleRegenerate" />
      </div>
      <div v-if="toolStatus" class="b-chat__tool-status">{{ toolStatus }}</div>
    </Container>

    <div v-else class="b-chat__empty">
      <slot name="empty"></slot>
    </div>

    <div class="b-chat__input">
      <div class="b-chat__input__container">
        <BPromptEditor v-model:value="inputValue" :placeholder="props.placeholder" :max-height="200" variant="borderless" @submit="handleSubmit" />

        <div class="b-chat__input__buttons">
          <BButton v-if="loading" size="small" square icon="lucide:square" @click="handleAbort" />
          <BButton v-else size="small" square :disabled="!inputValue" icon="lucide:arrow-up" @click="handleSubmit" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BChatProps as Props, Message } from './types';
import type { ModelMessage } from 'ai';
import type { AIServiceError, AIStreamFinishChunk, AIStreamToolCallChunk } from 'types/ai';
import { nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message as aMessage } from 'ant-design-vue';
import { nanoid } from 'nanoid';
import { getProviderToolSupport, type AIToolProviderSupport } from '@/ai/tools/policy';
import { createToolResultMessages, executeToolCall, toTransportTools, type ExecutedToolCall } from '@/ai/tools/stream';
import BButton from '@/components/BButton/index.vue';
import { useChat } from '@/hooks/useChat';
import { providerStorage } from '@/shared/storage';
import { useServiceModelStore } from '@/stores/service-model';
import { Modal } from '@/utils/modal';
import Container from './components/Container.vue';
import MessageBubble from './components/MessageBubble.vue';

interface ServiceConfig {
  providerId: string;
  modelId: string;
  toolSupport: AIToolProviderSupport;
}

defineOptions({ name: 'BChat' });

const props = withDefaults(defineProps<Props>(), {
  placeholder: '输入消息...'
});

const emit = defineEmits<{ (e: 'complete', message: Message): void }>();

const inputValue = defineModel<string>('inputValue', { default: '' });
const messages = defineModel<Message[]>('messages', { default: () => [] });

const loading = ref(false);
const toolStatus = ref('');
const pendingToolResults = ref<ExecutedToolCall[]>([]);
const executedToolCallIds = ref<Set<string>>(new Set());

const router = useRouter();
const serviceModelStore = useServiceModelStore();
let lastServiceConfig: ServiceConfig | null = null;

function toModelMessages(sourceMessages: Message[]): ModelMessage[] {
  return sourceMessages.map((item) => ({
    role: item.role,
    content: item.content
  }));
}

function removeTrailingEmptyAssistantMessage(): void {
  const lastMessage = messages.value[messages.value.length - 1];
  if (!lastMessage || lastMessage.role !== 'assistant') {
    return;
  }

  if (!lastMessage.content && !lastMessage.usage) {
    messages.value.pop();
  }
}

async function handleToolCall(chunk: AIStreamToolCallChunk): Promise<void> {
  if (executedToolCallIds.value.has(chunk.toolCallId)) {
    return;
  }

  executedToolCallIds.value.add(chunk.toolCallId);
  toolStatus.value = `正在执行工具：${chunk.toolName}`;

  const result = await executeToolCall(chunk, props.tools ?? [], props.getToolContext?.());
  pendingToolResults.value.push(result);

  toolStatus.value = result.result.status === 'success' ? `工具已完成：${chunk.toolName}` : `工具处理完成：${chunk.toolName}`;
}

const { agent } = useChat({
  onChunk: async (content: string): Promise<void> => {
    const message = messages.value[messages.value.length - 1];

    message.content += content;
    message.loading = false;
    message.createdAt ||= new Date().toISOString();
  },
  onFinish: async ({ usage }: AIStreamFinishChunk): Promise<void> => {
    const message = messages.value[messages.value.length - 1];

    message.usage = usage;
  },
  onToolCall: handleToolCall,
  onComplete: (): void => {
    loading.value = false;

    const message = messages.value[messages.value.length - 1];
    if (message) {
      message.loading = false;
      message.finished = true;
    }

    // 工具轮次完成后立即发起下一轮，当前轮次的空 assistant 占位不写入历史。
    if (pendingToolResults.value.length && lastServiceConfig) {
      const nextToolResults = [...pendingToolResults.value];

      pendingToolResults.value = [];
      removeTrailingEmptyAssistantMessage();

      nextTick(() => {
        // eslint-disable-next-line no-use-before-define
        streamMessages(messages.value, lastServiceConfig as ServiceConfig, nextToolResults);
      });
      return;
    }

    executedToolCallIds.value = new Set();
    toolStatus.value = '';

    emit('complete', message);
  },
  onError: (error: AIServiceError): void => {
    aMessage.error(error.message);
  }
});

async function getServiceConfig(): Promise<ServiceConfig | undefined> {
  const config = await serviceModelStore.getAvailableServiceConfig('chat');
  if (config?.providerId && config?.modelId) {
    const provider = await providerStorage.getProvider(config.providerId);

    return {
      providerId: config.providerId,
      modelId: config.modelId,
      toolSupport: getProviderToolSupport(provider)
    };
  }

  const [, confirmed] = await Modal.confirm('提示', '当前未配置可用的大模型服务', { confirmText: '去配置', cancelText: '取消' });

  if (confirmed) {
    router.push('/settings/service-model');
  }

  return undefined;
}

function createAssistantPlaceholder(): Message {
  return { id: nanoid(), role: 'assistant', content: '', createdAt: '', loading: true };
}

function findRegenerateStartIndex(targetMessage: Message): number {
  const targetIndex = messages.value.findIndex((item) => item.id === targetMessage.id);
  if (targetIndex === -1 || targetMessage.role !== 'assistant') return -1;

  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    if (messages.value[index].role === 'user') return index;
  }

  return -1;
}

function streamMessages(_messages: Message[], config: ServiceConfig, toolResults: ExecutedToolCall[] = []): void {
  loading.value = true;
  lastServiceConfig = config;

  const modelMessages = toModelMessages(_messages);
  const continuedMessages = toolResults.length ? [...modelMessages, ...createToolResultMessages(toolResults)] : modelMessages;
  const shouldEnableTools = config.toolSupport.supported && Boolean(props.tools?.length);

  // provider 未验证时直接降级为普通对话，避免把未兼容的 tool schema 发给模型侧。
  toolStatus.value =
    !config.toolSupport.supported && props.tools?.length ? `已禁用工具调用：${config.toolSupport.reason ?? '当前服务商暂不支持 AI Tools'}` : '';

  agent.stream({
    messages: continuedMessages,
    modelId: config.modelId,
    providerId: config.providerId,
    tools: shouldEnableTools ? toTransportTools(props.tools ?? []) : undefined
  });

  messages.value.push(createAssistantPlaceholder());
}

async function handleSubmit(): Promise<void> {
  if (loading.value) return;

  const config = await getServiceConfig();
  if (!config) return;

  const content = inputValue.value.trim();
  if (!content) return;

  const message: Message = { id: nanoid(), role: 'user', content, createdAt: new Date().toISOString() };

  await props.onBeforeSend?.(message);

  messages.value.push(message);

  streamMessages(messages.value, config);

  inputValue.value = '';
}

function handleAbort(): void {
  pendingToolResults.value = [];
  executedToolCallIds.value = new Set();
  toolStatus.value = '';
  agent.abort();
}

function handleEdit(message: Message): void {
  inputValue.value = message.content;
}

async function handleRegenerate(message: Message): Promise<void> {
  if (loading.value) return;

  const config = await getServiceConfig();
  if (!config) return;

  const startIndex = findRegenerateStartIndex(message);
  if (startIndex === -1) {
    aMessage.warning('未找到可用于重新生成的用户消息');
    return;
  }

  const _messages = messages.value.slice(0, startIndex + 1);

  await props.onBeforeRegenerate?.(_messages, message);

  messages.value = _messages;

  nextTick(() => streamMessages(_messages, config));
}
</script>

<style lang="less">
.b-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.b-chat__container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.b-chat__empty {
  flex: 1;
  min-height: 0;
}

.b-chat__messages {
  display: flex;
  flex-direction: column;
}

.b-chat__tool-status {
  padding: 0 16px 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.b-chat__input {
  padding: 12px;
  border-top: 1px solid var(--border-primary);
}

.b-chat__input__container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
  padding: 8px 0 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--input-border);
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s;

  .b-prompt-variable__textarea {
    padding: 0 12px 0 0;
    background: transparent;
  }
}

.b-chat__input__buttons {
  display: flex;
  gap: 4px;
  align-items: flex-end;
  padding: 0 12px 0 0;
}

.b-chat__input__right {
  display: flex;
  gap: 8px;
  align-items: center;
}

.b-chat__input__model-select {
  width: 100px;
  font-size: 12px;

  .ant-select-selection-item {
    font-size: 12px;
  }
}
</style>
