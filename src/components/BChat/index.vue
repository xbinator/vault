<!-- 聊天组件模板 -->
<template>
  <div class="b-chat">
    <Container :loading="props.loading" class="b-chat__container">
      <div class="b-chat__messages">
        <MessageBubble v-for="item in messages" :key="item.id" :message="item" @edit="handleEdit" @regenerate="handleRegenerate" />
      </div>
      <slot></slot>
    </Container>

    <div class="b-chat__input">
      <div class="b-chat__input__container">
        <!-- 提示词编辑器组件 -->
        <BPromptEditor
          v-model:value="inputValue"
          :placeholder="props.placeholder"
          :max-height="200"
          :submit-on-enter="props.submitOnEnter"
          :disabled="props.loading || props.disabled"
          variant="borderless"
          @submit="handleSubmit"
        />
        <BButton v-if="!props.loading" size="small" square icon="lucide:arrow-up" :disabled="!props.canSubmit || props.disabled" @click="handleSubmit" />
        <BButton v-else size="small" square icon="lucide:square" @click="handleAbort" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BChatProps as Props, Message } from './types';
import type { AIServiceError, AIStreamFinishChunk } from 'types/ai';
import { ref } from 'vue';
import { message as antdMessage } from 'ant-design-vue';
import { nanoid } from 'nanoid';
import BButton from '@/components/BButton/index.vue';
import { useChat } from '@/hooks/useChat';
import { useChatStore } from '@/stores/chat';
import Container from './components/Container.vue';
import MessageBubble from './components/MessageBubble.vue';

defineOptions({ name: 'BChat' });

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  placeholder: '输入消息...',
  disabled: false,
  submitOnEnter: true,
  canSubmit: false,
  sessionId: ''
});

const emit = defineEmits<{
  (e: 'submit', prompt: string): void;
  (e: 'abort'): void;
  (e: 'edit', message: Message): void;
  (e: 'regenerate', message: Message): void;
  (e: 'loadingChange', loading: boolean): void;
  (e: 'messageUpdate', sessionId: string): void;
}>();

// 输入框内容
const inputValue = defineModel<string>('inputValue', { default: '' });
// 消息列表，支持双向绑定
const messages = defineModel<Message[]>('messages', { default: () => [] });

// Stores
const chatStore = useChatStore();

// State
const activeRequest = ref<{ sessionId: string; messageId: string } | null>(null);

// Stream Lifecycle
async function finalizeRequest(errorMessage?: string): Promise<void> {
  const request = activeRequest.value;
  if (!request) return;

  activeRequest.value = null;
  emit('loadingChange', false);

  await chatStore.updateMessage(request.sessionId, request.messageId, { loading: false, finished: true, error: errorMessage }, false);
  await chatStore.persistSession(request.sessionId);
}

const { agent } = useChat({
  onChunk: async (content: string) => {
    const request = activeRequest.value;
    if (!request) return;

    const current = chatStore.getMessagesBySessionId(request.sessionId).find((m) => m.id === request.messageId);

    if (current) {
      const updates = { content: current.content + content, loading: false };
      await chatStore.updateMessage(request.sessionId, request.messageId, updates, false);
      emit('messageUpdate', request.sessionId);
    }
  },
  onFinish: async ({ usage }: AIStreamFinishChunk) => {
    if (activeRequest.value) {
      const updates = { usage };
      await chatStore.updateMessage(activeRequest.value.sessionId, activeRequest.value.messageId, updates, false);
      emit('messageUpdate', activeRequest.value.sessionId);
    }
  },
  onComplete: () => finalizeRequest(),
  onError: (error: AIServiceError) => {
    antdMessage.error(error.message);
    finalizeRequest(error.message);
  }
});

/**
 * 提交消息处理函数
 */
function handleSubmit(): void {
  const prompt = inputValue.value.trim();
  if (!props.canSubmit || props.loading || props.disabled) return;

  emit('submit', prompt);
}

/**
 * 中止当前流式请求
 */
function handleAbort(): void {
  agent.abort();
  emit('abort');
}

/**
 * 处理消息编辑
 * 将消息内容填充到输入框中
 * @param msg 要编辑的消息对象
 */
function handleEdit(msg: Message): void {
  emit('edit', msg);
}

/**
 * 处理消息重新生成
 * @param msg 要重新生成的消息对象
 */
function handleRegenerate(msg: Message): void {
  emit('regenerate', msg);
}

/**
 * 启动流式请求
 * @param sessionId 会话ID
 * @param excludeId 要排除的消息ID
 * @param config 服务配置
 */
async function startStream(sessionId: string, excludeId: string, config: { providerId: string; modelId: string }) {
  const messageId = await appendAssistantPlaceholder(sessionId);
  activeRequest.value = { sessionId, messageId };
  emit('loadingChange', true);

  await agent.stream({
    messages: chatStore
      .getMessagesBySessionId(sessionId)
      .filter((m) => m.id !== excludeId)
      .map(({ role, content }) => ({ role, content })),
    modelId: config.modelId,
    providerId: config.providerId
  });
}

/**
 * 创建一条 assistant 占位消息并挂载到 session，返回消息 id
 * @param sessionId 会话ID
 * @returns 消息ID
 */
async function appendAssistantPlaceholder(sessionId: string): Promise<string> {
  const msg = chatStore.createMessage({
    id: nanoid(),
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    loading: true,
    finished: false
  });
  await chatStore.appendMessage(sessionId, msg, false);
  return msg.id;
}

// 暴露方法给父组件
defineExpose({
  startStream
});
</script>

<style lang="less">
/* 聊天组件主容器 */
.b-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 消息列表容器 */
.b-chat__container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.b-chat__messages {
  display: flex;
  flex-direction: column;
}

/* 输入区域样式 */
.b-chat__input {
  padding: 12px;
  border-top: 1px solid var(--border-primary);
}

.b-chat__input__container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--input-border);
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s;

  .b-prompt-variable__textarea {
    padding: 0;
    background: transparent;
  }
}

.b-chat__input__buttons {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.b-chat__input__right {
  display: flex;
  gap: 8px;
  align-items: center;
}

.b-chat__input__model-select {
  width: 100px;
  font-size: 12px;

  :deep(.ant-select-selection-item) {
    font-size: 12px;
  }
}
</style>
