<template>
  <div v-show="visible" class="header-right">
    <div class="find-bar" :class="{ 'is-empty': isNoMatchFound }">
      <AInput v-model:value="keyword" v-focus class="find-input" placeholder="在文档中查找" @press-enter="findNext" @keydown.esc="closeFind" />
      <span class="find-result">{{ findResultText }}</span>
      <button v-for="action in navigationActions" :key="action.icon" type="button" class="find-action" :disabled="action.disabled" @click="action.onClick">
        <Icon :icon="action.icon" />
      </button>
      <span class="find-divider"></span>
      <button type="button" class="find-action" @click="closeFind">
        <Icon icon="lucide:x" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, toRef, watch } from 'vue';
import { Icon } from '@iconify/vue';
import type BEditor from '@/components/BEditor/index.vue';
import { vFocus } from '@/directives/focus';

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  content: string;
  editorInstance: InstanceType<typeof BEditor> | null;
}

const props = withDefaults(defineProps<Props>(), {
  content: '',
  editorInstance: null
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface FindResult {
  start: number;
  end: number;
}

interface NavigationAction {
  icon: string;
  disabled: boolean;
  onClick: () => void;
}

// ─── State ───────────────────────────────────────────────────────────────────

interface FindBarState {
  keyword: string;
  matchIndex: number;
  show: boolean;
}

const state = reactive<FindBarState>({
  keyword: '',
  matchIndex: 0,
  show: false
});

const visible = defineModel<boolean>('visible', { default: false });
const keyword = toRef(state, 'keyword');

// ─── Search Logic ─────────────────────────────────────────────────────────────

const trimmedKeyword = computed(() => state.keyword.trim());

function collectMatches(text: string, searchKeyword: string): FindResult[] {
  if (!searchKeyword) return [];

  const results: FindResult[] = [];
  const lowerText = text.toLowerCase();
  const lowerKeyword = searchKeyword.toLowerCase();

  let pos = lowerText.indexOf(lowerKeyword);
  while (pos !== -1) {
    results.push({ start: pos, end: pos + searchKeyword.length });
    pos = lowerText.indexOf(lowerKeyword, pos + searchKeyword.length);
  }

  return results;
}

const matches = computed<FindResult[]>(() => collectMatches(props.content, trimmedKeyword.value));

const matchCount = computed(() => matches.value.length);
const hasMatches = computed(() => matchCount.value > 0);
const isNoMatchFound = computed(() => !hasMatches.value && Boolean(trimmedKeyword.value));

// ─── Display ──────────────────────────────────────────────────────────────────

const findResultText = computed(() => {
  if (!trimmedKeyword.value) return '';
  if (!hasMatches.value) return '0/0';
  return `${state.matchIndex + 1}/${matchCount.value}`;
});

// ─── Navigation ───────────────────────────────────────────────────────────────

function resetSearch(): void {
  state.matchIndex = 0;
}

function moveToNextMatch(): void {
  if (!hasMatches.value) return;
  state.matchIndex = (state.matchIndex + 1) % matchCount.value;
}

function moveToPreviousMatch(): void {
  if (!hasMatches.value) return;
  state.matchIndex = state.matchIndex <= 0 ? matchCount.value - 1 : state.matchIndex - 1;
}

function findNext(): void {
  moveToNextMatch();

  props.editorInstance?.findNext();
}

function findPrevious(): void {
  moveToPreviousMatch();
  props.editorInstance?.findPrevious();
}

const navigationActions = computed<NavigationAction[]>(() => [
  { icon: 'lucide:chevron-up', disabled: !hasMatches.value, onClick: findPrevious },
  { icon: 'lucide:chevron-down', disabled: !hasMatches.value, onClick: findNext }
]);

function closeFind(): void {
  state.show = false;
  state.keyword = '';
  resetSearch();
  props.editorInstance?.clearSearch();
}

// ─── Watchers ─────────────────────────────────────────────────────────────────

watch(keyword, (value) => {
  resetSearch();
  if (!value.trim()) {
    props.editorInstance?.clearSearch();
    return;
  }
  props.editorInstance?.setSearchTerm(value.trim());
});

watch(
  () => props.content,
  () => {
    // 内容变更后，若当前索引越界则修正到末尾
    if (state.matchIndex >= matchCount.value && matchCount.value > 0) {
      state.matchIndex = matchCount.value - 1;
    }
  }
);
</script>
>

<style scoped>
.header-right {
  display: flex;
  align-items: center;
}

.find-bar {
  display: flex;
  gap: 4px;
  align-items: center;
  width: 340px;
  max-width: 100%;
  height: 32px;
  padding: 0 6px 0 8px;
  background: #fff;
  border: 1px solid #dadce0;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
}

.find-bar.is-empty {
  border-color: #f59e0b;
  box-shadow: 0 0 0 1px rgb(245 158 11 / 12%);
}

.find-input {
  flex: 1;
  min-width: 0;
}

.find-bar :deep(.ant-input) {
  height: 24px;
  padding: 0;
  font-size: 12px;
  line-height: 24px;
  color: rgb(32 33 36 / 92%);
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

.find-bar :deep(.ant-input:focus) {
  border: none;
  box-shadow: none;
}

.find-bar :deep(.ant-input::placeholder) {
  color: rgb(0 0 0 / 35%);
}

.find-result {
  min-width: 40px;
  font-size: 12px;
  color: rgb(0 0 0 / 45%);
  text-align: right;
}

.find-divider {
  width: 1px;
  height: 16px;
  background: rgb(0 0 0 / 8%);
}

.find-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: rgb(0 0 0 / 56%);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.find-action:hover:not(:disabled) {
  color: rgb(0 0 0 / 85%);
  background: rgb(0 0 0 / 5%);
}

.find-action:disabled {
  color: rgb(0 0 0 / 22%);
  cursor: not-allowed;
}
</style>
