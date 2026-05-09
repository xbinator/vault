<!--
  @file index.vue
  @description 语音组件设置页，负责展示语音运行时快照、官方模型、外部模型和当前生效配置。
-->
<template>
  <div class="speech-settings">
    <div class="speech-settings__header">
      <div class="speech-settings__title">语音组件</div>
    </div>

    <div class="speech-settings__body">
      <div class="speech-settings__overview">
        <div class="speech-settings__overview-icon">
          <Icon icon="lucide:mic-2" />
        </div>

        <div class="speech-settings__overview-content">
          <div class="speech-settings__overview-title">本地语音组件</div>
          <div class="speech-settings__overview-desc">用于本地语音转写、模型运行和音频处理</div>
        </div>

        <div class="speech-settings__status-badge" :class="`speech-settings__status-badge--${statusBadgeState}`">
          <span class="speech-settings__status-dot" :class="`speech-settings__status-dot--${statusBadgeState}`"></span>
          {{ statusConfig.label }}
        </div>
      </div>

      <div class="speech-settings__list">
        <div class="speech-settings__section">
          <div class="speech-settings__section-title">运行环境</div>

          <SpeechSettingsItem icon="lucide:activity" label="状态" hint="当前语音运行时检测结果">
            <span class="speech-settings__status-dot" :class="`speech-settings__status-dot--${statusBadgeState}`"></span>
            {{ statusConfig.label }}
          </SpeechSettingsItem>

          <SpeechSettingsItem icon="lucide:monitor" label="平台" hint="当前系统平台">
            {{ snapshot?.platform ?? '-' }}
          </SpeechSettingsItem>

          <SpeechSettingsItem icon="lucide:binary" label="架构" hint="运行时 CPU 架构">
            {{ snapshot?.arch ?? '-' }}
          </SpeechSettingsItem>
        </div>

        <div class="speech-settings__section">
          <div class="speech-settings__section-title">官方模型</div>

          <SpeechSettingsItem icon="lucide:brain" label="模型" hint="当前使用的语音识别模型">
            {{ managedModelSummary }}
          </SpeechSettingsItem>

          <SpeechSettingsItem icon="lucide:tag" label="版本" hint="本地运行时版本">
            {{ snapshot?.binaryVersion ?? '-' }}
          </SpeechSettingsItem>

          <SpeechSettingsItem icon="lucide:folder" label="安装目录" hint="语音组件本地存储路径" :path="true">
            {{ runtimeInstallDir }}
          </SpeechSettingsItem>
        </div>

        <div class="speech-settings__section">
          <div class="speech-settings__section-title">外部模型</div>

          <SpeechSettingsItem icon="lucide:folder-search" label="已注册模型" hint="已添加到语音系统中的本地模型">
            {{ externalModelSummary }}
          </SpeechSettingsItem>

          <SpeechSettingsItem icon="lucide:file-check" label="列表状态" hint="外部模型最近一次校验结果">
            {{ externalModelStateSummary }}
          </SpeechSettingsItem>
        </div>

        <div class="speech-settings__section">
          <div class="speech-settings__section-title">当前生效配置</div>

          <SpeechSettingsItem icon="lucide:circle-play" label="当前选择" hint="当前实际参与语音转写的模型">
            {{ activeModelSummary }}
          </SpeechSettingsItem>

          <SpeechSettingsItem icon="lucide:shield-alert" label="生效状态" hint="当前 binary 与模型组合的最终状态">
            {{ snapshot?.activeState ?? '-' }}
          </SpeechSettingsItem>
        </div>
      </div>

      <div class="speech-settings__actions">
        <BButton :disabled="installing" @click="handleInstall">
          {{ installButtonLabel }}
        </BButton>
        <BButton v-if="snapshot?.binaryState === 'ready'" type="secondary" :disabled="installing" @click="handleRemove"> 删除 </BButton>
        <BButton type="secondary" :disabled="installing" @click="refreshStatus"> 刷新 </BButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ElectronSpeechExternalModelRecord, ElectronSpeechRuntimeSnapshot } from 'types/electron-api';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { message } from 'ant-design-vue';
import BButton from '@/components/BButton/index.vue';
import { getElectronAPI, hasElectronAPI } from '@/shared/platform/electron-api';
import { Modal } from '@/utils/modal';
import SpeechSettingsItem from './components/SpeechSettingsItem.vue';

// ─── 状态映射配置 ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<'ready' | 'installing' | 'failed' | 'missing' | 'unknown', { label: string }> = {
  ready: { label: '已安装' },
  installing: { label: '安装中' },
  failed: { label: '安装失败' },
  missing: { label: '未安装' },
  unknown: { label: '未检测' }
};

// ─── 响应式状态 ────────────────────────────────────────────────────────────────

const snapshot = ref<ElectronSpeechRuntimeSnapshot | null>(null);
const externalModels = ref<ElectronSpeechExternalModelRecord[]>([]);
const installing = ref(false);
const disposeProgressListener = ref<(() => void) | null>(null);

// ─── 计算属性 ──────────────────────────────────────────────────────────────────

const statusBadgeState = computed<'ready' | 'installing' | 'failed' | 'missing' | 'unknown'>(() => {
  if (installing.value) {
    return 'installing';
  }

  if (!snapshot.value) {
    return 'unknown';
  }

  if (snapshot.value.binaryState === 'ready' && snapshot.value.activeState === 'ready') {
    return 'ready';
  }

  if (snapshot.value.binaryState === 'missing') {
    return 'missing';
  }

  return 'failed';
});

const statusConfig = computed(() => STATUS_CONFIG[statusBadgeState.value]);

const installButtonLabel = computed(() => {
  if (installing.value) return '安装中...';
  if (snapshot.value?.binaryState === 'ready') return '重装';
  return '下载';
});

const runtimeInstallDir = computed(() => {
  return snapshot.value ? '[用户数据目录]/speech-runtime' : '-';
});

const managedModelSummary = computed(() => {
  if (!snapshot.value?.managedModels.length) {
    return '暂无已安装官方模型';
  }

  return snapshot.value.managedModels.map((item) => `${item.displayName} (${item.version})`).join('、');
});

const externalModelSummary = computed(() => {
  if (!externalModels.value.length) {
    return '暂无已注册外部模型';
  }

  return externalModels.value.map((item) => item.displayName).join('、');
});

const externalModelStateSummary = computed(() => {
  if (!externalModels.value.length) {
    return '-';
  }

  return externalModels.value.map((item) => `${item.displayName}: ${item.lastValidationState}`).join('；');
});

const activeModelSummary = computed(() => {
  if (!snapshot.value?.selectedModel) {
    return '未选择';
  }

  const activeModelId = snapshot.value.selectedModel.modelId;
  if (snapshot.value.selectedModel.sourceType === 'managed') {
    const managedModel = snapshot.value.managedModels.find((item) => item.id === activeModelId);
    return managedModel ? `官方模型 / ${managedModel.displayName} / v${managedModel.version}` : `官方模型 / ${activeModelId}`;
  }

  const externalModel = externalModels.value.find((item) => item.id === activeModelId);
  return externalModel ? `外部模型 / ${externalModel.displayName}` : `外部模型 / ${activeModelId}`;
});

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function teardownProgressListener(): void {
  disposeProgressListener.value?.();
  disposeProgressListener.value = null;
}

// ─── 操作处理 ──────────────────────────────────────────────────────────────────

async function refreshStatus(): Promise<void> {
  if (!hasElectronAPI()) {
    snapshot.value = null;
    externalModels.value = [];
    return;
  }
  snapshot.value = await getElectronAPI().getSpeechRuntimeSnapshot();
  externalModels.value = await getElectronAPI().listExternalSpeechModels();
}

async function handleInstall(): Promise<void> {
  if (!hasElectronAPI()) {
    message.error('当前环境不支持安装语音组件');
    return;
  }

  if (snapshot.value?.binaryState === 'ready') {
    const [cancelled] = await Modal.confirm('确认', '确定要重新安装语音组件吗？');
    if (cancelled) return;
  }

  installing.value = true;
  teardownProgressListener();

  disposeProgressListener.value = getElectronAPI().onSpeechInstallProgress(() => {
    // 进度监听，暂不处理
  });

  try {
    await getElectronAPI().installSpeechRuntime();
    await refreshStatus();
    message.success('语音组件已安装');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '语音组件安装失败');
  } finally {
    installing.value = false;
    teardownProgressListener();
  }
}

async function handleRemove(): Promise<void> {
  if (!hasElectronAPI()) {
    message.error('当前环境不支持删除语音组件');
    return;
  }

  const [cancelled] = await Modal.delete('确定要删除当前语音组件吗？');
  if (cancelled) return;

  await getElectronAPI().removeSpeechRuntime();
  await refreshStatus();
  message.success('语音组件已删除');
}

// ─── 生命周期 ──────────────────────────────────────────────────────────────────

onMounted(refreshStatus);
onUnmounted(teardownProgressListener);
</script>

<style scoped lang="less">
.speech-settings {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
  border-radius: 8px;
}

.speech-settings__header {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
  align-items: center;
  height: 52px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-primary);
}

.speech-settings__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.speech-settings__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 820px;
  padding: 20px;
  margin: 0 auto;
  overflow: auto;
}

// ─── Overview ─────────────────────────────────────────────────────────────────

.speech-settings__overview {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 18px;
  border: 1px solid var(--color-primary-border);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
}

.speech-settings__overview-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  font-size: 20px;
  color: var(--color-primary);
  background: var(--bg-elevated);
  border: 1px solid var(--color-primary-border);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
}

.speech-settings__overview-content {
  flex: 1;
  min-width: 0;
}

.speech-settings__overview-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.speech-settings__overview-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

.speech-settings__status-badge {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: 999px;

  &--unknown {
    color: var(--text-tertiary);
    background: var(--bg-elevated);
    border-color: var(--border-primary);
  }

  &--ready {
    color: var(--color-success);
    background: var(--color-success-bg);
    border-color: var(--color-success);
  }

  &--installing {
    color: var(--color-primary);
    background: var(--color-primary-bg);
    border-color: var(--color-primary-border);
  }

  &--failed {
    color: var(--color-error);
    background: var(--color-error-bg);
    border-color: var(--color-error);
  }

  &--missing {
    color: var(--color-warning);
    background: var(--color-warning-bg);
    border-color: var(--color-warning-border);
  }
}

// ─── Status dot ───────────────────────────────────────────────────────────────

.speech-settings__status-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  background: var(--text-tertiary);
  border-radius: 50%;

  &--ready {
    background: var(--color-success);
  }

  &--installing {
    background: var(--color-primary);
    animation: speech-settings-pulse 1.5s ease-in-out infinite;
  }

  &--failed {
    background: var(--color-error);
  }

  &--missing {
    background: var(--color-warning);
  }
}

@keyframes speech-settings-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.4;
  }
}

// ─── Section list ─────────────────────────────────────────────────────────────

.speech-settings__list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.speech-settings__section {
  overflow: hidden;
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
}

.speech-settings__section-title {
  display: flex;
  gap: 8px;
  align-items: center;
  height: 44px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-primary);
}

// ─── Actions ──────────────────────────────────────────────────────────────────

.speech-settings__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
  width: 100%;
  padding-top: 4px;
}
</style>
