<template>
  <div class="b-message-bubble">
    <BBubbleText :content="message.content" :placement="message.role === 'assistant' ? 'left' : 'right'" :loading="message.loading" size="auto">
      <template v-if="message.role === 'user' && (imageFiles.length || otherFiles.length)" #header>
        <div class="b-message-bubble__header">
          <div v-if="imageFiles.length" class="b-message-bubble__images">
            <img v-for="file in imageFiles" :key="file.id" :src="file.url || file.path" :alt="file.name" class="b-message-bubble__image" />
          </div>
          <div v-if="otherFiles.length" class="b-message-bubble__files">
            <div v-for="file in otherFiles" :key="file.id" class="b-message-bubble__file">
              <Icon icon="lucide:file" width="14" height="14" />
              <span class="b-message-bubble__file-name">{{ file.name }}</span>
            </div>
          </div>
        </div>
      </template>
      <template v-if="message.finished" #toolbar>
        <div class="b-message-bubble__toolbar" :class="{ 'b-message-bubble__toolbar--right': message.role === 'user' }">
          <BButton type="text" size="small" square icon="lucide:copy" @click="handleCopy(message)" />
          <BButton v-if="message.role === 'user'" square type="text" size="small" icon="lucide:edit-2" @click="$emit('edit', message)" />
          <BButton v-if="message.role === 'assistant'" square type="text" size="small" icon="lucide:refresh-cw" @click="$emit('regenerate', message)" />
        </div>
      </template>
    </BBubbleText>
  </div>
</template>

<script setup lang="ts">
import type { Message } from '../types';
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import BBubbleText from '@/components/BBubbleText/index.vue';
import BButton from '@/components/BButton/index.vue';
import { useClipboard } from '@/hooks/useClipboard';

defineOptions({ name: 'BMessageBubble' });

const { clipboard } = useClipboard();

const props = defineProps<{ message: Message }>();

defineEmits<{
  (e: 'edit', message: Message): void;
  (e: 'regenerate', message: Message): void;
}>();

const imageFiles = computed(() => props.message.files?.filter((file) => file.type === 'image' && (file.url || file.path)) ?? []);
const otherFiles = computed(() => props.message.files?.filter((file) => file.type !== 'image' || (!file.url && !file.path)) ?? []);

function handleCopy(msg: Message) {
  clipboard(msg.content, { successMessage: '已复制到剪贴板' });
}
</script>

<style lang="less">
.b-message-bubble {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
}

.b-message-bubble:last-child {
  margin-bottom: 0;
}

.b-message-bubble__header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.b-message-bubble__images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.b-message-bubble__image {
  max-width: 200px;
  max-height: 200px;
  object-fit: cover;
  border-radius: 8px;
}

.b-message-bubble__files {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.b-message-bubble__file {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  max-width: 220px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 999px;
}

.b-message-bubble__file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.b-message-bubble__toolbar {
  display: flex;
  gap: 4px;
}

.b-message-bubble__toolbar--right {
  justify-content: flex-end;
}
</style>
