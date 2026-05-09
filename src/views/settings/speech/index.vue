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

          <SpeechSettingsItem icon="lucide:list" label="目录模型" hint="远端 catalog 中可用的官方模型">
            {{ catalogModelSummary }}
          </SpeechSettingsItem>

          <SpeechSettingsItem icon="lucide:tag" label="版本" hint="本地运行时版本">
            {{ snapshot?.binaryVersion ?? '-' }}
          </SpeechSettingsItem>

          <SpeechSettingsItem icon="lucide:folder" label="安装目录" hint="语音组件本地存储路径" :path="true">
            {{ runtimeInstallDir }}
          </SpeechSettingsItem>

          <div v-if="catalogModels.length" class="speech-settings__model-list">
            <div v-for="catalogModel in catalogModels" :key="catalogModel.id" class="speech-settings__model-card">
              <div class="speech-settings__model-meta">
                <div class="speech-settings__model-name">
                  {{ catalogModel.displayName }} <span>v{{ catalogModel.version }}</span>
                </div>
                <div class="speech-settings__model-hint">
                  {{ getManagedModelStatusLabel(catalogModel.id, catalogModel.version) }}
                </div>
              </div>
              <div class="speech-settings__model-actions">
                <BButton type="secondary" size="small" :disabled="installing || updatingRuntime" @click="handleInstallManagedModel(catalogModel.id, false)">
                  下载
                </BButton>
                <BButton
                  type="secondary"
                  size="small"
                  :disabled="installing || updatingRuntime || !isManagedModelInstalled(catalogModel.id, catalogModel.version)"
                  @click="handleSetActiveManagedModel(catalogModel.id)"
                >
                  设为当前
                </BButton>
                <BButton
                  type="secondary"
                  size="small"
                  :disabled="installing || updatingRuntime || !isManagedModelInstalled(catalogModel.id, catalogModel.version)"
                  @click="handleRemoveManagedModel(catalogModel.id)"
                >
                  删除模型
                </BButton>
              </div>
            </div>
          </div>
        </div>

        <div class="speech-settings__section">
          <div class="speech-settings__section-title">外部模型</div>

          <SpeechSettingsItem icon="lucide:folder-search" label="已注册模型" hint="已添加到语音系统中的本地模型">
            {{ externalModelSummary }}
          </SpeechSettingsItem>

          <SpeechSettingsItem icon="lucide:file-check" label="列表状态" hint="外部模型最近一次校验结果">
            {{ externalModelStateSummary }}
          </SpeechSettingsItem>

          <div class="speech-settings__model-list">
            <div class="speech-settings__model-toolbar">
              <BButton type="secondary" size="small" :disabled="installing || updatingRuntime" @click="handleAddExternalModel"> 添加本地模型 </BButton>
            </div>

            <div v-if="externalModels.length" class="speech-settings__model-stack">
              <div v-for="externalModel in externalModels" :key="externalModel.id" class="speech-settings__model-card">
                <div class="speech-settings__model-meta">
                  <div class="speech-settings__model-name">{{ externalModel.displayName }}</div>
                  <div class="speech-settings__model-hint">
                    {{ getExternalModelStatusLabel(externalModel) }}
                  </div>
                </div>
                <div class="speech-settings__model-actions">
                  <BButton
                    type="secondary"
                    size="small"
                    :disabled="installing || updatingRuntime || externalModel.lastValidationState !== 'ready'"
                    @click="handleSetActiveExternalModel(externalModel.id)"
                  >
                    设为当前
                  </BButton>
                  <BButton type="secondary" size="small" :disabled="installing || updatingRuntime" @click="handleRenameExternalModel(externalModel)">
                    重命名
                  </BButton>
                  <BButton type="secondary" size="small" :disabled="installing || updatingRuntime" @click="handleRevalidateExternalModel(externalModel.id)">
                    重新校验
                  </BButton>
                  <BButton type="secondary" size="small" :disabled="installing || updatingRuntime" @click="handleRemoveExternalModel(externalModel)">
                    删除
                  </BButton>
                </div>
              </div>
            </div>

            <div v-else class="speech-settings__empty-state">暂未添加外部模型</div>
          </div>
        </div>

        <div class="speech-settings__section">
          <div class="speech-settings__section-title">当前生效配置</div>

          <SpeechSettingsItem icon="lucide:circle-play" label="当前选择" hint="当前实际参与语音转写的模型">
            {{ activeModelSummary }}
          </SpeechSettingsItem>

          <SpeechSettingsItem icon="lucide:shield-alert" label="生效状态" hint="当前 binary 与模型组合的最终状态">
            {{ snapshot?.activeState ?? '-' }}
          </SpeechSettingsItem>

          <SpeechSettingsItem icon="lucide:refresh-cw" label="更新状态" hint="当前 binary 与官方模型的可用更新">
            {{ updateSummary }}
          </SpeechSettingsItem>
        </div>
      </div>

      <div class="speech-settings__actions">
        <BButton :disabled="installing" @click="handleInstall">
          {{ installButtonLabel }}
        </BButton>
        <BButton type="secondary" :disabled="installing || checkingUpdates" @click="handleCheckUpdates">
          {{ checkingUpdates ? '检查中...' : '检查更新' }}
        </BButton>
        <BButton type="secondary" :disabled="installing || updatingRuntime" @click="handleDownloadUpdates">
          {{ updatingRuntime ? '处理中...' : '下载更新' }}
        </BButton>
        <BButton type="secondary" :disabled="installing || updatingRuntime" @click="handleApplyUpdate">
          {{ updatingRuntime ? '处理中...' : '应用更新' }}
        </BButton>
        <BButton type="secondary" :disabled="installing || updatingRuntime" @click="handleRollbackUpdate">
          {{ updatingRuntime ? '处理中...' : '回滚更新' }}
        </BButton>
        <BButton v-if="snapshot?.binaryState === 'ready'" type="secondary" :disabled="installing" @click="handleRemove"> 删除 </BButton>
        <BButton type="secondary" :disabled="installing" @click="refreshStatus"> 刷新 </BButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  ElectronSpeechExternalModelRecord,
  ElectronSpeechManagedModelRecord,
  ElectronSpeechRuntimeSnapshot,
  ElectronSpeechRuntimeUpdatesState
} from 'types/electron-api';
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
const catalogModels = ref<ElectronSpeechManagedModelRecord[]>([]);
const runtimeUpdates = ref<ElectronSpeechRuntimeUpdatesState | null>(null);
const installing = ref(false);
const checkingUpdates = ref(false);
const updatingRuntime = ref(false);
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

const catalogModelSummary = computed(() => {
  if (!catalogModels.value.length) {
    return '暂无目录模型';
  }

  return catalogModels.value.map((item) => `${item.displayName} (${item.version})`).join('、');
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

const updateSummary = computed(() => {
  if (!runtimeUpdates.value) {
    return '未检查';
  }

  const parts: string[] = [];
  if (runtimeUpdates.value.binaryUpdate) {
    parts.push(`Binary ${runtimeUpdates.value.binaryUpdate.version}`);
  }

  if (runtimeUpdates.value.modelUpdates.length) {
    parts.push(runtimeUpdates.value.modelUpdates.map((item) => `${item.modelId} ${item.version}`).join('、'));
  }

  return parts.length ? parts.join('；') : '已是最新版本';
});

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function teardownProgressListener(): void {
  disposeProgressListener.value?.();
  disposeProgressListener.value = null;
}

/**
 * 根据模型标识获取已安装官方模型记录。
 * @param modelId - 模型唯一标识
 * @returns 已安装模型记录
 */
function getInstalledManagedModel(modelId: string): ElectronSpeechManagedModelRecord | undefined {
  return snapshot.value?.managedModels.find((item) => item.id === modelId);
}

/**
 * 判断官方模型是否已安装到指定版本。
 * @param modelId - 模型唯一标识
 * @param version - catalog 版本
 * @returns 是否已安装
 */
function isManagedModelInstalled(modelId: string, version: string): boolean {
  const installedModel = getInstalledManagedModel(modelId);
  return installedModel?.version === version;
}

/**
 * 获取官方模型状态文案。
 * @param modelId - 模型唯一标识
 * @param version - catalog 版本
 * @returns 状态文案
 */
function getManagedModelStatusLabel(modelId: string, version: string): string {
  const installedModel = getInstalledManagedModel(modelId);
  if (!installedModel) {
    return '未安装';
  }

  if (installedModel.version !== version) {
    return `已安装 v${installedModel.version}，可更新到 v${version}`;
  }

  if (snapshot.value?.selectedModel?.sourceType === 'managed' && snapshot.value.selectedModel.modelId === modelId) {
    return '当前使用中';
  }

  return `已安装 v${installedModel.version}`;
}

/**
 * 获取外部模型状态文案。
 * @param externalModel - 外部模型记录
 * @returns 状态文案
 */
function getExternalModelStatusLabel(externalModel: ElectronSpeechExternalModelRecord): string {
  const statusTextMap: Record<ElectronSpeechExternalModelRecord['lastValidationState'], string> = {
    ready: '可用',
    missing: '文件缺失',
    invalid: '校验失败'
  };
  const statusText = statusTextMap[externalModel.lastValidationState];
  const activeLabel =
    snapshot.value?.selectedModel?.sourceType === 'external' && snapshot.value.selectedModel.modelId === externalModel.id ? '当前使用中' : null;

  return [statusText, activeLabel, externalModel.filePath].filter((item): item is string => Boolean(item)).join(' / ');
}

/**
 * 刷新语音运行时补充状态。
 */
async function refreshAuxiliaryState(): Promise<void> {
  if (!hasElectronAPI()) {
    catalogModels.value = [];
    runtimeUpdates.value = null;
    return;
  }

  catalogModels.value = await getElectronAPI().listSpeechCatalogModels();
  runtimeUpdates.value = await getElectronAPI().checkSpeechRuntimeUpdates();
}

// ─── 操作处理 ──────────────────────────────────────────────────────────────────

/**
 * 刷新语音运行时状态。
 */
async function refreshStatus(): Promise<void> {
  if (!hasElectronAPI()) {
    snapshot.value = null;
    externalModels.value = [];
    catalogModels.value = [];
    runtimeUpdates.value = null;
    return;
  }
  snapshot.value = await getElectronAPI().getSpeechRuntimeSnapshot();
  externalModels.value = await getElectronAPI().listExternalSpeechModels();
  await refreshAuxiliaryState();
}

/**
 * 检查语音运行时更新。
 */
async function handleCheckUpdates(): Promise<void> {
  if (!hasElectronAPI()) {
    message.error('当前环境不支持检查语音组件更新');
    return;
  }

  checkingUpdates.value = true;
  try {
    runtimeUpdates.value = await getElectronAPI().checkSpeechRuntimeUpdates();
    message.success('语音组件更新检查完成');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '语音组件更新检查失败');
  } finally {
    checkingUpdates.value = false;
  }
}

/**
 * 下载语音运行时更新。
 */
async function handleDownloadUpdates(): Promise<void> {
  if (!hasElectronAPI()) {
    message.error('当前环境不支持下载语音组件更新');
    return;
  }

  updatingRuntime.value = true;
  try {
    snapshot.value = await getElectronAPI().downloadSpeechRuntimeUpdates();
    await refreshAuxiliaryState();
    message.success('语音组件更新已下载');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '语音组件更新下载失败');
  } finally {
    updatingRuntime.value = false;
  }
}

/**
 * 应用语音运行时更新。
 */
async function handleApplyUpdate(): Promise<void> {
  if (!hasElectronAPI()) {
    message.error('当前环境不支持应用语音组件更新');
    return;
  }

  updatingRuntime.value = true;
  try {
    snapshot.value = await getElectronAPI().applySpeechRuntimeUpdate();
    await refreshAuxiliaryState();
    message.success('语音组件更新已应用');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '语音组件更新应用失败');
  } finally {
    updatingRuntime.value = false;
  }
}

/**
 * 回滚语音运行时更新。
 */
async function handleRollbackUpdate(): Promise<void> {
  if (!hasElectronAPI()) {
    message.error('当前环境不支持回滚语音组件更新');
    return;
  }

  updatingRuntime.value = true;
  try {
    snapshot.value = await getElectronAPI().rollbackSpeechRuntimeUpdate();
    await refreshAuxiliaryState();
    message.success('语音组件已回滚到上一版本');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '语音组件回滚失败');
  } finally {
    updatingRuntime.value = false;
  }
}

/**
 * 安装官方模型。
 * @param modelId - 模型唯一标识
 * @param setActive - 安装后是否设为当前
 */
async function handleInstallManagedModel(modelId: string, setActive: boolean): Promise<void> {
  if (!hasElectronAPI()) {
    message.error('当前环境不支持安装官方模型');
    return;
  }

  updatingRuntime.value = true;
  try {
    snapshot.value = await getElectronAPI().installManagedSpeechModel({ modelId, setActive });
    await refreshAuxiliaryState();
    message.success(setActive ? '官方模型已安装并设为当前' : '官方模型已安装');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '官方模型安装失败');
  } finally {
    updatingRuntime.value = false;
  }
}

/**
 * 删除已安装官方模型。
 * @param modelId - 模型唯一标识
 */
async function handleRemoveManagedModel(modelId: string): Promise<void> {
  if (!hasElectronAPI()) {
    message.error('当前环境不支持删除官方模型');
    return;
  }

  updatingRuntime.value = true;
  try {
    snapshot.value = await getElectronAPI().removeManagedSpeechModel(modelId);
    await refreshAuxiliaryState();
    message.success('官方模型已删除');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '官方模型删除失败');
  } finally {
    updatingRuntime.value = false;
  }
}

/**
 * 添加外部模型。
 */
async function handleAddExternalModel(): Promise<void> {
  if (!hasElectronAPI()) {
    message.error('当前环境不支持添加外部模型');
    return;
  }

  const selectedFile = await getElectronAPI().openFile({
    filters: [{ name: 'Speech Model', extensions: ['bin'] }]
  });
  if (selectedFile.canceled || !selectedFile.filePath) {
    return;
  }

  const [cancelled, displayName] = await Modal.input('添加外部模型', {
    defaultValue: selectedFile.fileName.replace(/\.[^.]+$/, ''),
    placeholder: '请输入模型名称',
    okText: '添加'
  });
  if (cancelled || !displayName) {
    return;
  }

  updatingRuntime.value = true;
  try {
    await getElectronAPI().registerExternalSpeechModel({
      filePath: selectedFile.filePath,
      displayName
    });
    await refreshStatus();
    message.success('外部模型已添加');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '外部模型添加失败');
  } finally {
    updatingRuntime.value = false;
  }
}

/**
 * 重命名外部模型。
 * @param externalModel - 外部模型记录
 */
async function handleRenameExternalModel(externalModel: ElectronSpeechExternalModelRecord): Promise<void> {
  if (!hasElectronAPI()) {
    message.error('当前环境不支持重命名外部模型');
    return;
  }

  const [cancelled, displayName] = await Modal.input('重命名外部模型', {
    defaultValue: externalModel.displayName,
    placeholder: '请输入模型名称',
    okText: '保存'
  });
  if (cancelled || !displayName || displayName === externalModel.displayName) {
    return;
  }

  updatingRuntime.value = true;
  try {
    await getElectronAPI().renameExternalSpeechModel(externalModel.id, displayName);
    await refreshStatus();
    message.success('外部模型名称已更新');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '外部模型重命名失败');
  } finally {
    updatingRuntime.value = false;
  }
}

/**
 * 重新校验外部模型。
 * @param modelId - 外部模型唯一标识
 */
async function handleRevalidateExternalModel(modelId: string): Promise<void> {
  if (!hasElectronAPI()) {
    message.error('当前环境不支持校验外部模型');
    return;
  }

  updatingRuntime.value = true;
  try {
    await getElectronAPI().revalidateExternalSpeechModel(modelId);
    await refreshStatus();
    message.success('外部模型校验完成');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '外部模型校验失败');
  } finally {
    updatingRuntime.value = false;
  }
}

/**
 * 删除外部模型。
 * @param externalModel - 外部模型记录
 */
async function handleRemoveExternalModel(externalModel: ElectronSpeechExternalModelRecord): Promise<void> {
  if (!hasElectronAPI()) {
    message.error('当前环境不支持删除外部模型');
    return;
  }

  const [cancelled] = await Modal.delete(`确定要删除外部模型“${externalModel.displayName}”吗？`);
  if (cancelled) {
    return;
  }

  updatingRuntime.value = true;
  try {
    snapshot.value = await getElectronAPI().removeExternalSpeechModel(externalModel.id);
    externalModels.value = externalModels.value.filter((item) => item.id !== externalModel.id);
    await refreshAuxiliaryState();
    message.success('外部模型已删除');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '外部模型删除失败');
  } finally {
    updatingRuntime.value = false;
  }
}

/**
 * 将外部模型设为当前。
 * @param modelId - 外部模型唯一标识
 */
async function handleSetActiveExternalModel(modelId: string): Promise<void> {
  if (!hasElectronAPI()) {
    message.error('当前环境不支持切换外部模型');
    return;
  }

  updatingRuntime.value = true;
  try {
    snapshot.value = await getElectronAPI().setActiveSpeechModel({
      sourceType: 'external',
      modelId
    });
    message.success('外部模型已设为当前');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '外部模型切换失败');
  } finally {
    updatingRuntime.value = false;
  }
}

/**
 * 将已安装官方模型设为当前。
 * @param modelId - 模型唯一标识
 */
async function handleSetActiveManagedModel(modelId: string): Promise<void> {
  if (!hasElectronAPI()) {
    message.error('当前环境不支持切换官方模型');
    return;
  }

  updatingRuntime.value = true;
  try {
    snapshot.value = await getElectronAPI().setActiveSpeechModel({
      sourceType: 'managed',
      modelId
    });
    message.success('官方模型已设为当前');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '官方模型切换失败');
  } finally {
    updatingRuntime.value = false;
  }
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

.speech-settings__model-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 16px;
  border-top: 1px solid var(--border-tertiary);
}

.speech-settings__model-toolbar {
  display: flex;
  justify-content: flex-end;
}

.speech-settings__model-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.speech-settings__model-card {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-tertiary);
  border-radius: 12px;
}

.speech-settings__model-meta {
  min-width: 0;
}

.speech-settings__model-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);

  span {
    font-weight: 500;
    color: var(--text-secondary);
  }
}

.speech-settings__model-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.speech-settings__model-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
}

.speech-settings__empty-state {
  padding: 12px 14px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px dashed var(--border-tertiary);
  border-radius: 12px;
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
