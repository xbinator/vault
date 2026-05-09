/**
 * @file runtime.mts
 * @description 管理语音运行时 V2 状态文件、快照聚合、模型选择解析与兼容状态映射。
 */
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { app } from 'electron';
import type {
  SpeechExternalModelRecord,
  SpeechModelSelection,
  SpeechRuntimeConfig,
  SpeechRuntimeResolvedSelection,
  SpeechRuntimeSnapshot,
  SpeechRuntimeStateFile,
  SpeechRuntimeStatus
} from './types.mjs';

/**
 * 运行时上下文。
 */
export interface SpeechRuntimeContext {
  /** 测试或调用方注入的 userData 根目录。 */
  userDataPath?: string;
  /** 测试或调用方注入的平台标识。 */
  platform?: NodeJS.Platform;
  /** 测试或调用方注入的架构标识。 */
  arch?: string;
}

/**
 * 注册外部模型的输入。
 */
export interface RegisterExternalSpeechModelInput {
  /** 模型绝对路径。 */
  filePath: string;
  /** 展示名称。 */
  displayName: string;
}

/**
 * 兼容第一版 manifest 文件结构。
 */
export interface SpeechRuntimeManifestFile {
  /** 运行时版本。 */
  version: string;
  /** 默认模型名。 */
  modelName: string;
  /** 平台标识。 */
  platform: 'darwin' | 'win32';
  /** 架构标识。 */
  arch: 'arm64' | 'x64';
  /** 当前生效目录。 */
  currentDir: string;
}

/**
 * 获取平台标识。
 * @param context - 运行时上下文
 * @returns 平台标识
 */
function getRuntimePlatform(context: SpeechRuntimeContext): 'darwin' | 'win32' {
  return (context.platform ?? process.platform) as 'darwin' | 'win32';
}

/**
 * 获取架构标识。
 * @param context - 运行时上下文
 * @returns 架构标识
 */
function getRuntimeArch(context: SpeechRuntimeContext): 'arm64' | 'x64' {
  return (context.arch ?? process.arch) as 'arm64' | 'x64';
}

/**
 * 获取语音运行时根目录。
 * @param context - 可选测试上下文
 * @returns 运行时根目录
 */
export function getSpeechRuntimeRoot(context: SpeechRuntimeContext = {}): string {
  const userDataPath = context.userDataPath ?? app.getPath('userData');
  return join(userDataPath, 'speech-runtime');
}

/**
 * 获取状态文件路径。
 * @param context - 可选测试上下文
 * @returns 状态文件路径
 */
export function getSpeechRuntimeStatePath(context: SpeechRuntimeContext = {}): string {
  return join(getSpeechRuntimeRoot(context), 'state.json');
}

/**
 * 获取兼容用 manifest 文件路径。
 * @param context - 可选测试上下文
 * @returns manifest 路径
 */
export function getSpeechRuntimeManifestPath(context: SpeechRuntimeContext = {}): string {
  return join(getSpeechRuntimeRoot(context), 'manifest.json');
}

/**
 * 创建空白 V2 状态。
 * @param context - 可选测试上下文
 * @returns 空白状态
 */
export function createEmptySpeechRuntimeState(context: SpeechRuntimeContext = {}): SpeechRuntimeStateFile {
  return {
    schemaVersion: 2,
    platform: getRuntimePlatform(context),
    arch: getRuntimeArch(context),
    binaries: {
      currentVersion: null,
      installed: []
    },
    managedModels: [],
    externalModels: [],
    updates: {
      autoCheck: true,
      autoDownload: false,
      binaryUpdate: null,
      modelUpdates: []
    }
  };
}

/**
 * 读取 V2 状态文件。
 * @param context - 可选测试上下文
 * @returns 状态文件，不存在时返回 null
 */
export async function readSpeechRuntimeState(context: SpeechRuntimeContext = {}): Promise<SpeechRuntimeStateFile | null> {
  try {
    const content = await readFile(getSpeechRuntimeStatePath(context), 'utf-8');
    return JSON.parse(content) as SpeechRuntimeStateFile;
  } catch {
    return null;
  }
}

/**
 * 写入 V2 状态文件。
 * @param state - 待写入状态
 * @param context - 可选测试上下文
 */
export async function writeSpeechRuntimeState(state: SpeechRuntimeStateFile, context: SpeechRuntimeContext = {}): Promise<void> {
  const runtimeRoot = getSpeechRuntimeRoot(context);
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(getSpeechRuntimeStatePath(context), JSON.stringify(state, null, 2));
}

/**
 * 兼容读取第一版 manifest。
 * @param context - 可选测试上下文
 * @returns V1 manifest，不存在时返回 null
 */
export async function readSpeechRuntimeManifest(context: SpeechRuntimeContext = {}): Promise<SpeechRuntimeManifestFile | null> {
  try {
    const content = await readFile(getSpeechRuntimeManifestPath(context), 'utf-8');
    return JSON.parse(content) as SpeechRuntimeManifestFile;
  } catch {
    return null;
  }
}

/**
 * 解析当前 binary 记录。
 * @param state - 状态文件
 * @returns 当前 binary 记录
 */
function resolveCurrentBinaryRecord(state: SpeechRuntimeStateFile) {
  if (!state.binaries.currentVersion) {
    return null;
  }

  return state.binaries.installed.find((record) => record.version === state.binaries.currentVersion) ?? null;
}

/**
 * 校验外部模型记录，并在快照中返回最新状态。
 * @param record - 外部模型记录
 * @returns 更新后的外部模型记录
 */
async function validateExternalModelRecord(record: SpeechExternalModelRecord): Promise<SpeechExternalModelRecord> {
  try {
    await access(record.filePath);
    return {
      ...record,
      lastValidatedAt: Date.now(),
      lastValidationState: 'ready',
      lastErrorMessage: undefined
    };
  } catch {
    return {
      ...record,
      lastValidatedAt: Date.now(),
      lastValidationState: 'missing',
      lastErrorMessage: `Speech model file is not available: ${record.filePath}`
    };
  }
}

/**
 * 校验外部模型路径是否合法。
 * @param filePath - 外部模型路径
 */
async function assertExternalModelPath(filePath: string): Promise<void> {
  if (!filePath.toLowerCase().endsWith('.bin')) {
    throw new Error(`Speech model file must be a .bin file: ${filePath}`);
  }

  await access(filePath);
}

/**
 * 解析当前选择及模型路径。
 * @param state - 状态文件
 * @param context - 运行时上下文
 * @returns 当前选择及对应模型路径
 */
export async function resolveSpeechRuntimeSelection(
  state: SpeechRuntimeStateFile,
  context: SpeechRuntimeContext = {}
): Promise<SpeechRuntimeResolvedSelection> {
  if (!state.selectedModel) {
    throw new Error('No speech model is selected');
  }

  const runtimeRoot = getSpeechRuntimeRoot(context);
  if (state.selectedModel.sourceType === 'managed') {
    const managedModel = state.managedModels.find((record) => record.id === state.selectedModel?.modelId);
    if (!managedModel) {
      throw new Error(`Selected managed speech model is not installed: ${state.selectedModel.modelId}`);
    }

    return {
      selection: state.selectedModel,
      modelPath: join(runtimeRoot, managedModel.relativePath)
    };
  }

  const externalModel = state.externalModels.find((record) => record.id === state.selectedModel?.modelId);
  if (!externalModel) {
    throw new Error(`Selected external speech model is not registered: ${state.selectedModel.modelId}`);
  }

  const validatedExternalModel = await validateExternalModelRecord(externalModel);
  if (validatedExternalModel.lastValidationState !== 'ready') {
    throw new Error(validatedExternalModel.lastErrorMessage ?? 'Selected speech model is not available');
  }

  return {
    selection: state.selectedModel,
    modelPath: validatedExternalModel.filePath
  };
}

/**
 * 解析当前运行时配置。
 * @param context - 运行时上下文
 * @returns 当前运行时配置
 */
export async function resolveSpeechRuntimeConfig(context: SpeechRuntimeContext = {}): Promise<SpeechRuntimeConfig> {
  const state = await readSpeechRuntimeState(context);
  if (!state) {
    throw new Error('Speech runtime is not installed');
  }

  const currentBinary = resolveCurrentBinaryRecord(state);
  if (!currentBinary) {
    throw new Error('Speech runtime binary is not installed');
  }

  const runtimeRoot = getSpeechRuntimeRoot(context);
  const whisperBinaryPath = join(runtimeRoot, currentBinary.relativePath);
  const resolvedSelection = await resolveSpeechRuntimeSelection(state, context);

  await access(whisperBinaryPath);
  await access(resolvedSelection.modelPath);

  return {
    whisperBinaryPath,
    whisperModelPath: resolvedSelection.modelPath,
    tempDirectory: process.env.TIBIS_WHISPER_TEMP_DIR ?? '/tmp'
  };
}

/**
 * 生成语音运行时快照。
 * @param context - 运行时上下文
 * @returns 运行时快照
 */
export async function getSpeechRuntimeSnapshot(context: SpeechRuntimeContext = {}): Promise<SpeechRuntimeSnapshot> {
  const platform = getRuntimePlatform(context);
  const arch = getRuntimeArch(context);
  const state = await readSpeechRuntimeState(context);
  if (!state) {
    return {
      platform,
      arch,
      binaryState: 'missing',
      managedModels: [],
      externalModels: [],
      hasUsableModel: false,
      activeState: 'missing-model'
    };
  }

  const currentBinary = resolveCurrentBinaryRecord(state);
  let binaryState: SpeechRuntimeSnapshot['binaryState'] = 'missing';
  if (currentBinary) {
    try {
      await access(join(getSpeechRuntimeRoot(context), currentBinary.relativePath));
      binaryState = 'ready';
    } catch {
      binaryState = 'failed';
    }
  }

  const externalModels = await Promise.all(state.externalModels.map((record) => validateExternalModelRecord(record)));
  const hasUsableManagedModel = state.managedModels.length > 0;
  const hasUsableExternalModel = externalModels.some((record) => record.lastValidationState === 'ready');
  const hasUsableModel = hasUsableManagedModel || hasUsableExternalModel;

  if (!state.selectedModel) {
    return {
      platform,
      arch,
      binaryState,
      binaryVersion: currentBinary?.version,
      selectedModel: undefined,
      managedModels: state.managedModels,
      externalModels,
      hasUsableModel,
      activeState: hasUsableModel ? 'invalid-selection' : 'missing-model'
    };
  }

  try {
    await resolveSpeechRuntimeSelection({ ...state, externalModels }, context);
    return {
      platform,
      arch,
      binaryState,
      binaryVersion: currentBinary?.version,
      selectedModel: state.selectedModel,
      managedModels: state.managedModels,
      externalModels,
      hasUsableModel: binaryState === 'ready',
      activeState: binaryState === 'ready' ? 'ready' : 'failed',
      errorMessage: binaryState === 'ready' ? undefined : 'Speech runtime binary is not available'
    };
  } catch (error) {
    return {
      platform,
      arch,
      binaryState,
      binaryVersion: currentBinary?.version,
      selectedModel: state.selectedModel,
      managedModels: state.managedModels,
      externalModels,
      hasUsableModel: false,
      activeState: 'invalid-selection',
      errorMessage: error instanceof Error ? error.message : 'Unknown speech runtime error'
    };
  }
}

/**
 * 注册外部模型。
 * @param context - 运行时上下文
 * @param input - 注册输入
 * @returns 新增记录
 */
export async function registerExternalSpeechModel(
  context: SpeechRuntimeContext,
  input: RegisterExternalSpeechModelInput
): Promise<SpeechExternalModelRecord> {
  const state = (await readSpeechRuntimeState(context)) ?? createEmptySpeechRuntimeState(context);
  await assertExternalModelPath(input.filePath);

  const record: SpeechExternalModelRecord = {
    id: `external-${randomUUID()}`,
    displayName: input.displayName,
    filePath: input.filePath,
    lastValidatedAt: Date.now(),
    lastValidationState: 'ready'
  };

  state.externalModels.push(record);
  await writeSpeechRuntimeState(state, context);
  return record;
}

/**
 * 重新命名外部模型。
 * @param context - 运行时上下文
 * @param modelId - 模型唯一标识
 * @param displayName - 新展示名
 * @returns 更新后的记录
 */
export async function renameExternalSpeechModel(
  context: SpeechRuntimeContext,
  modelId: string,
  displayName: string
): Promise<SpeechExternalModelRecord> {
  const state = await readSpeechRuntimeState(context);
  if (!state) {
    throw new Error('Speech runtime is not installed');
  }

  const record = state.externalModels.find((item) => item.id === modelId);
  if (!record) {
    throw new Error(`External speech model is not registered: ${modelId}`);
  }

  record.displayName = displayName;
  await writeSpeechRuntimeState(state, context);
  return record;
}

/**
 * 重新校验外部模型。
 * @param context - 运行时上下文
 * @param modelId - 模型唯一标识
 * @returns 校验后的记录
 */
export async function revalidateExternalSpeechModel(context: SpeechRuntimeContext, modelId: string): Promise<SpeechExternalModelRecord> {
  const state = await readSpeechRuntimeState(context);
  if (!state) {
    throw new Error('Speech runtime is not installed');
  }

  const record = state.externalModels.find((item) => item.id === modelId);
  if (!record) {
    throw new Error(`External speech model is not registered: ${modelId}`);
  }

  const validatedRecord = await validateExternalModelRecord(record);
  state.externalModels = state.externalModels.map((item) => (item.id === modelId ? validatedRecord : item));
  await writeSpeechRuntimeState(state, context);
  return validatedRecord;
}

/**
 * 设置当前生效模型。
 * @param context - 运行时上下文
 * @param selection - 当前选择
 */
export async function setActiveSpeechModel(context: SpeechRuntimeContext, selection: SpeechModelSelection): Promise<void> {
  const state = await readSpeechRuntimeState(context);
  if (!state) {
    throw new Error('Speech runtime is not installed');
  }

  if (selection.sourceType === 'managed') {
    const exists = state.managedModels.some((item) => item.id === selection.modelId);
    if (!exists) {
      throw new Error(`Managed speech model is not installed: ${selection.modelId}`);
    }
  } else {
    const exists = state.externalModels.some((item) => item.id === selection.modelId);
    if (!exists) {
      throw new Error(`External speech model is not registered: ${selection.modelId}`);
    }
  }

  state.selectedModel = selection;
  await writeSpeechRuntimeState(state, context);
}

/**
 * 删除外部模型。
 * @param context - 运行时上下文
 * @param modelId - 模型唯一标识
 */
export async function removeExternalSpeechModel(context: SpeechRuntimeContext, modelId: string): Promise<void> {
  const state = await readSpeechRuntimeState(context);
  if (!state) {
    return;
  }

  if (state.selectedModel?.sourceType === 'external' && state.selectedModel.modelId === modelId) {
    throw new Error(`External speech model ${modelId} is currently selected`);
  }

  state.externalModels = state.externalModels.filter((item) => item.id !== modelId);
  await writeSpeechRuntimeState(state, context);
}

/**
 * 获取兼容第一版的运行时状态。
 * @param context - 可选测试上下文
 * @returns 兼容状态
 */
export async function getSpeechRuntimeStatus(context: SpeechRuntimeContext = {}): Promise<SpeechRuntimeStatus> {
  const snapshot = await getSpeechRuntimeSnapshot(context);
  const currentManagedModel = snapshot.selectedModel?.sourceType === 'managed'
    ? snapshot.managedModels.find((record) => record.id === snapshot.selectedModel?.modelId)
    : undefined;

  if (snapshot.binaryState === 'ready' && snapshot.activeState === 'ready') {
    return {
      state: 'ready',
      platform: snapshot.platform,
      arch: snapshot.arch,
      modelName: currentManagedModel?.id ?? snapshot.selectedModel?.modelId,
      installDir: getSpeechRuntimeRoot(context),
      version: snapshot.binaryVersion
    };
  }

  if (snapshot.binaryState === 'missing') {
    return {
      state: 'missing',
      platform: snapshot.platform,
      arch: snapshot.arch,
      errorMessage: snapshot.errorMessage
    };
  }

  return {
    state: 'failed',
    platform: snapshot.platform,
    arch: snapshot.arch,
    errorMessage: snapshot.errorMessage ?? 'Speech runtime is not ready'
  };
}

/**
 * 删除已安装语音运行时。
 * @param context - 可选测试上下文
 */
export async function removeSpeechRuntime(context: SpeechRuntimeContext = {}): Promise<void> {
  await rm(getSpeechRuntimeRoot(context), { recursive: true, force: true });
}
