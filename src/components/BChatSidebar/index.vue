<template>
  <div class="editor-sidebar">
    <div class="sidebar-header">
      <BButton square size="small" type="text" :disabled="loading" @click="handleNewSession">
        <Icon icon="lucide:message-circle-plus" width="16" height="16" />
      </BButton>
      <SessionHistory :sessions="chatStore.sortedSessions" :active-session-id="activeSessionId" :loading="loading" @switch-session="handleSwitchSession" />
    </div>

    <BChat
      ref="chatRef"
      v-model:messages="messages"
      v-model:input-value="inputValue"
      :loading="loading"
      :disabled="false"
      :session-id="activeSessionId"
      placeholder="输入消息..."
      @submit="handleSubmit"
      @abort="handleAbort"
      @edit="handleEdit"
      @regenerate="handleRegenerate"
      @loading-change="handleLoadingChange"
      @message-update="handleMessageUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { message as antdMessage } from 'ant-design-vue';
import { nanoid } from 'nanoid';
import type { Message } from '@/components/BChat/types';
import { useChatStore } from '@/stores/chat';
import { useServiceModelStore } from '@/stores/service-model';
import { Modal } from '@/utils/modal';
import SessionHistory from './components/SessionHistory.vue';

// ─── Stores & Router ────────────────────────────────────────────────────────

const router = useRouter();
const serviceModelStore = useServiceModelStore();
const chatStore = useChatStore();

chatStore.initialize('chat');

// ─── State ──────────────────────────────────────────────────────────────────

const inputValue = ref('');
const loading = ref(false);
const activeSessionId = ref<string | null>(null);
const messages = ref<Message[]>([]);
const chatRef = ref<any>(null);

watch(
  () => chatStore.sortedSessions,
  async (sessions) => {
    if (activeSessionId.value && sessions.some((item) => item.id === activeSessionId.value)) {
      return;
    }

    activeSessionId.value = sessions[0]?.id ?? null;
    messages.value = activeSessionId.value ? [...(await chatStore.loadSessionMessages(activeSessionId.value))] : [];
  },
  { immediate: true }
);

watch(messages, (value) => {
  chatStore.setSessionMessages(activeSessionId.value, value, false);
});

function syncMessagesFromStore(sessionId: string | null): void {
  messages.value = sessionId ? [...chatStore.getMessagesBySessionId(sessionId)] : [];
}

// ─── Event Handlers ───────────────────────────────────────────────────────────

function handleLoadingChange(isLoading: boolean) {
  loading.value = isLoading;
}

function handleMessageUpdate(sessionId: string) {
  if (sessionId === activeSessionId.value) {
    syncMessagesFromStore(sessionId);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** 获取可用的服务配置，未配置时引导用户前往设置页 */
async function getServiceConfig(): Promise<{ providerId: string; modelId: string } | null> {
  const config = await serviceModelStore.getAvailableServiceConfig('chat');
  if (config?.providerId && config?.modelId) return config;

  const [, confirmed] = await Modal.confirm('提示', '当前未配置可用的大模型服务', {
    confirmText: '去填写',
    cancelText: '取消'
  });

  if (confirmed) router.push('/settings/service-model');
  return null;
}

/** 启动流式请求的公共逻辑 */
async function startStream(sessionId: string, excludeId: string, config: { providerId: string; modelId: string }) {
  if (chatRef.value) {
    await chatRef.value.startStream(sessionId, excludeId, config);
  }
}

// ─── Event Handlers ───────────────────────────────────────────────────────────

async function handleSubmit(prompt: string): Promise<void> {
  if (loading.value) return;

  const config = await getServiceConfig();
  if (!config) return;

  try {
    const sessionId = activeSessionId.value ?? (await chatStore.createSession('chat'));
    activeSessionId.value = sessionId;

    const userMessage = chatStore.createMessage({
      id: nanoid(),
      role: 'user',
      content: prompt,
      createdAt: Date.now(),
      finished: true
    });
    await chatStore.appendMessage(sessionId, userMessage, true);
    syncMessagesFromStore(sessionId);
    inputValue.value = '';

    await startStream(sessionId, userMessage.id, config);
  } catch (error) {
    console.error('发送消息失败:', error);
    antdMessage.error('发送消息失败，请重试');
    loading.value = false;
  }
}

async function handleRegenerate(msg: Message): Promise<void> {
  if (loading.value) return;

  const config = await getServiceConfig();
  if (!config) return;

  const sessionId = activeSessionId.value;
  if (!sessionId) return;

  try {
    await chatStore.truncateMessages(sessionId, msg.id, true);
    syncMessagesFromStore(sessionId);
    await startStream(sessionId, msg.id, config);
  } catch (error) {
    console.error('重新生成消息失败:', error);
    antdMessage.error('重新生成消息失败，请重试');
    loading.value = false;
  }
}

async function handleAbort(): Promise<void> {
  // 中止操作由 BChat 组件处理
}

function handleEdit(msg: Message): void {
  inputValue.value = msg.content;
}

async function handleNewSession(): Promise<void> {
  if (loading.value) return;
  inputValue.value = '';
  activeSessionId.value = null;
  messages.value = [];
}

async function handleSwitchSession(sessionId: string): Promise<void> {
  if (loading.value) return;

  try {
    activeSessionId.value = sessionId;
    await chatStore.loadSessionMessages(sessionId);
    syncMessagesFromStore(sessionId);
  } catch (error) {
    console.error('切换会话失败:', error);
    antdMessage.error('切换会话失败，请重试');
  }
}
</script>

<style scoped lang="less">
.editor-sidebar {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  height: 100%;
  margin-right: 6px;
  overflow: hidden;
  background: var(--bg-primary);
  border-radius: 8px;

  :deep(.b-bubble--left .b-bubble__container) {
    padding: 12px 0 0;
  }
}

.sidebar-header {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
}
</style>
