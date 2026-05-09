/**
 * @file types.mts
 * @description 语音转写主进程模块的共享类型定义。
 */

/**
 * 单段音频转写请求。
 */
export interface SpeechTranscribeRequest {
  /** 音频二进制数据。 */
  buffer: ArrayBuffer;
  /** 音频 MIME 类型。 */
  mimeType: string;
  /** 段落唯一标识。 */
  segmentId: string;
  /** 指定语言。 */
  language?: string;
  /** 可选提示词。 */
  prompt?: string;
}

/**
 * 单段音频转写结果。
 */
export interface SpeechTranscribeResult {
  /** 段落唯一标识。 */
  segmentId: string;
  /** 转写文本。 */
  text: string;
  /** 识别语言。 */
  language?: string;
  /** 转写耗时，单位毫秒。 */
  durationMs: number;
}

/**
 * whisper.cpp 运行时配置。
 */
export interface SpeechRuntimeConfig {
  /** whisper.cpp 可执行文件路径。 */
  whisperBinaryPath: string;
  /** whisper.cpp 模型文件路径。 */
  whisperModelPath: string;
  /** 临时目录根路径。 */
  tempDirectory: string;
}

/**
 * 语音运行时状态。
 */
export type SpeechRuntimeState = 'ready' | 'missing' | 'installing' | 'failed';

/**
 * 运行时 binary 可用状态。
 */
export type SpeechRuntimeBinaryState = 'ready' | 'missing' | 'failed';

/**
 * 当前选择的模型来源。
 */
export interface SpeechModelSelection {
  /** 模型来源。 */
  sourceType: 'managed' | 'external';
  /** 模型唯一标识。 */
  modelId: string;
}

/**
 * 已安装 binary 记录。
 */
export interface SpeechBinaryRecord {
  /** binary 版本。 */
  version: string;
  /** binary 相对运行时根目录的路径。 */
  relativePath: string;
  /** binary 摘要。 */
  sha256: string;
}

/**
 * 应用托管模型记录。
 */
export interface SpeechManagedModelRecord {
  /** 模型唯一标识。 */
  id: string;
  /** 展示名称。 */
  displayName: string;
  /** 模型版本。 */
  version: string;
  /** 模型相对运行时根目录的路径。 */
  relativePath: string;
  /** 模型摘要。 */
  sha256: string;
  /** 模型大小。 */
  sizeBytes: number;
}

/**
 * 外部模型可用性状态。
 */
export type SpeechExternalModelValidationState = 'ready' | 'missing' | 'invalid';

/**
 * 外部模型记录。
 */
export interface SpeechExternalModelRecord {
  /** 模型唯一标识。 */
  id: string;
  /** 展示名称。 */
  displayName: string;
  /** 模型绝对路径。 */
  filePath: string;
  /** 最近一次校验时间。 */
  lastValidatedAt?: number;
  /** 最近一次校验状态。 */
  lastValidationState: SpeechExternalModelValidationState;
  /** 最近一次校验错误。 */
  lastErrorMessage?: string;
}

/**
 * binary 更新记录。
 */
export interface SpeechBinaryUpdateRecord {
  /** 目标版本。 */
  version: string;
}

/**
 * 模型更新记录。
 */
export interface SpeechManagedModelUpdateRecord {
  /** 模型唯一标识。 */
  modelId: string;
  /** 目标版本。 */
  version: string;
}

/**
 * 更新状态。
 */
export interface SpeechRuntimeUpdatesState {
  /** 是否自动检查。 */
  autoCheck: boolean;
  /** 是否自动下载。 */
  autoDownload: boolean;
  /** 待应用的 binary 更新。 */
  binaryUpdate: SpeechBinaryUpdateRecord | null;
  /** 待应用的模型更新。 */
  modelUpdates: SpeechManagedModelUpdateRecord[];
}

/**
 * 语音运行时状态文件。
 */
export interface SpeechRuntimeStateFile {
  /** 状态文件版本。 */
  schemaVersion: 2;
  /** 平台标识。 */
  platform: 'darwin' | 'win32';
  /** 架构标识。 */
  arch: 'arm64' | 'x64';
  /** 当前选择。 */
  selectedModel?: SpeechModelSelection;
  /** binary 状态。 */
  binaries: {
    /** 当前 binary 版本。 */
    currentVersion: string | null;
    /** 已安装 binary 列表。 */
    installed: SpeechBinaryRecord[];
  };
  /** 已安装官方模型。 */
  managedModels: SpeechManagedModelRecord[];
  /** 已注册外部模型。 */
  externalModels: SpeechExternalModelRecord[];
  /** 更新状态。 */
  updates: SpeechRuntimeUpdatesState;
}

/**
 * 当前生效状态。
 */
export type SpeechRuntimeActiveState = 'ready' | 'missing-model' | 'invalid-selection' | 'failed';

/**
 * 当前解析出的模型记录。
 */
export interface SpeechRuntimeResolvedSelection {
  /** 当前选择。 */
  selection: SpeechModelSelection;
  /** 解析后的模型路径。 */
  modelPath: string;
}

/**
 * 语音运行时聚合快照。
 */
export interface SpeechRuntimeSnapshot {
  /** 平台标识。 */
  platform: 'darwin' | 'win32';
  /** 架构标识。 */
  arch: 'arm64' | 'x64';
  /** binary 可用状态。 */
  binaryState: SpeechRuntimeBinaryState;
  /** 当前 binary 版本。 */
  binaryVersion?: string;
  /** 当前选择。 */
  selectedModel?: SpeechModelSelection;
  /** 已安装官方模型。 */
  managedModels: SpeechManagedModelRecord[];
  /** 已注册外部模型。 */
  externalModels: SpeechExternalModelRecord[];
  /** 是否存在可用模型。 */
  hasUsableModel: boolean;
  /** 当前生效状态。 */
  activeState: SpeechRuntimeActiveState;
  /** 可读错误信息。 */
  errorMessage?: string;
}

/**
 * 语音运行时状态快照。
 */
export interface SpeechRuntimeStatus {
  /** 当前状态。 */
  state: SpeechRuntimeState;
  /** 平台标识。 */
  platform: 'darwin' | 'win32';
  /** 架构标识。 */
  arch: 'arm64' | 'x64';
  /** 模型名称。 */
  modelName?: string;
  /** 当前安装目录。 */
  installDir?: string;
  /** 当前安装版本。 */
  version?: string;
  /** 失败时的人类可读错误。 */
  errorMessage?: string;
}

/**
 * 语音运行时资源。
 */
export interface SpeechRuntimeAsset {
  /** 资源名称。 */
  name: 'whisper' | 'model';
  /** 下载地址。 */
  url: string;
  /** sha256 校验值。 */
  sha256: string;
  /** 归档格式。 */
  archiveType: 'file' | 'zip';
  /** 安装目标相对路径。 */
  targetRelativePath: string;
}

/**
 * 语音运行时安装清单。
 */
export interface SpeechRuntimeManifestDefinition {
  /** 平台标识。 */
  platform: 'darwin' | 'win32';
  /** 架构标识。 */
  arch: 'arm64' | 'x64';
  /** 运行时版本。 */
  version: string;
  /** 默认模型名。 */
  modelName: string;
  /** 资源列表。 */
  assets: SpeechRuntimeAsset[];
}

/**
 * 安装进度阶段。
 */
export type SpeechInstallPhase = 'downloading' | 'extracting' | 'verifying' | 'completed';

/**
 * 安装进度事件。
 */
export interface SpeechInstallProgress {
  /** 当前阶段。 */
  phase: SpeechInstallPhase;
  /** 当前完成数。 */
  current: number;
  /** 总数。 */
  total: number;
  /** 进度说明。 */
  message: string;
}
