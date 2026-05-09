/**
 * @file installer.mts
 * @description 管理语音运行时 binary、官方模型和兼容安装入口的下载、校验与状态更新。
 */
import { createHash } from 'node:crypto';
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { get as getHttps } from 'node:https';
import { dirname, join } from 'node:path';
import type {
  SpeechCatalogManifest,
  SpeechInstallProgress,
  SpeechManagedModelRecord,
  SpeechRuntimeAsset,
  SpeechRuntimeManifestDefinition,
  SpeechRuntimeStateFile
} from './types.mjs';
import { createEmptySpeechRuntimeState, getSpeechRuntimeRoot, readSpeechRuntimeState, writeSpeechRuntimeState } from './runtime.mjs';

/**
 * ZIP 资源解压输入。
 */
export interface SpeechZipExtractInput {
  /** 资源定义。 */
  asset: SpeechRuntimeAsset;
  /** 资源字节。 */
  bytes: Buffer;
  /** 解压后的目标文件路径。 */
  outputFilePath: string;
}

/**
 * 语音运行时安装选项。
 */
export interface InstallSpeechRuntimeOptions {
  /** 测试或调用方注入的 userData 根目录。 */
  userDataPath?: string;
  /** 平台标识。 */
  platform: 'darwin' | 'win32';
  /** 架构标识。 */
  arch: 'arm64' | 'x64';
  /** 当前安装清单。 */
  manifest: SpeechRuntimeManifestDefinition;
  /** 安装进度回调。 */
  onProgress?: (progress: SpeechInstallProgress) => void | Promise<void>;
  /** 可替换的下载实现。 */
  downloadAsset?: (asset: SpeechRuntimeAsset) => Promise<Buffer>;
  /** 可替换的 zip 解压实现。 */
  extractZipAsset?: (input: SpeechZipExtractInput) => Promise<void>;
}

/**
 * 下载 binary 的输入。
 */
export interface InstallSpeechBinaryOptions {
  /** 测试或调用方注入的 userData 根目录。 */
  userDataPath?: string;
  /** 平台标识。 */
  platform: 'darwin' | 'win32';
  /** 架构标识。 */
  arch: 'arm64' | 'x64';
  /** binary 版本。 */
  version: string;
  /** binary 相对路径。 */
  relativePath: string;
  /** binary 摘要。 */
  sha256: string;
  /** 下载地址。 */
  url: string;
  /** 归档格式。 */
  archiveType: 'file' | 'zip';
  /** 可替换下载实现。 */
  downloadUrl?: (url: string) => Promise<Buffer>;
  /** 可替换 zip 解压实现。 */
  extractZipAsset?: (input: SpeechZipExtractInput) => Promise<void>;
}

/**
 * 下载官方模型的输入。
 */
export interface InstallManagedSpeechModelOptions {
  /** 测试或调用方注入的 userData 根目录。 */
  userDataPath?: string;
  /** 平台标识。 */
  platform: 'darwin' | 'win32';
  /** 架构标识。 */
  arch: 'arm64' | 'x64';
  /** 模型唯一标识。 */
  modelId: string;
  /** 展示名称。 */
  displayName: string;
  /** 版本。 */
  version: string;
  /** 相对路径。 */
  relativePath: string;
  /** 摘要。 */
  sha256: string;
  /** 文件大小。 */
  sizeBytes: number;
  /** 下载地址。 */
  url: string;
  /** 可替换下载实现。 */
  downloadUrl?: (url: string) => Promise<Buffer>;
}

/**
 * 删除官方模型的输入。
 */
export interface RemoveManagedSpeechModelOptions {
  /** 测试或调用方注入的 userData 根目录。 */
  userDataPath?: string;
  /** 模型唯一标识。 */
  modelId: string;
}

/**
 * 应用 binary 更新的输入。
 */
export interface ApplySpeechBinaryUpdateOptions {
  /** 测试或调用方注入的 userData 根目录。 */
  userDataPath?: string;
  /** 目标版本。 */
  version: string;
}

/**
 * 回滚 binary 更新的输入。
 */
export interface RollbackSpeechBinaryUpdateOptions {
  /** 测试或调用方注入的 userData 根目录。 */
  userDataPath?: string;
}

/**
 * 远程 speech runtime 总清单。
 */
interface RemoteSpeechRuntimeIndexManifest {
  /** 当前默认版本。 */
  currentVersion: string;
  /** 平台清单映射。 */
  platforms: Record<string, SpeechRuntimeManifestDefinition>;
}

/**
 * 兼容从 V2 catalog 中还原旧安装入口所需的 manifest。
 * @param catalogManifest - V2 catalog manifest
 * @param platform - 平台标识
 * @param arch - 架构标识
 * @returns 旧安装入口兼容 manifest
 */
function resolveSpeechRuntimeManifestFromCatalog(
  catalogManifest: SpeechCatalogManifest,
  platform: 'darwin' | 'win32',
  arch: 'arm64' | 'x64'
): SpeechRuntimeManifestDefinition {
  const platformKey = `${platform}-${arch}`;
  const binaryPlatform = catalogManifest.binaries[platformKey];
  if (!binaryPlatform) {
    throw new Error(`Speech runtime platform is not supported: ${platformKey}`);
  }

  const currentBinary = binaryPlatform.versions.find((item) => item.version === binaryPlatform.currentVersion);
  if (!currentBinary) {
    throw new Error(`Speech runtime binary version is not available: ${binaryPlatform.currentVersion}`);
  }

  const managedModel = catalogManifest.models[0];
  if (!managedModel) {
    throw new Error('Speech runtime catalog is missing managed models');
  }

  return {
    platform,
    arch,
    version: currentBinary.version,
    modelName: managedModel.id,
    assets: [
      {
        name: 'whisper',
        url: currentBinary.url,
        sha256: currentBinary.sha256,
        archiveType: currentBinary.archiveType,
        targetRelativePath: `bin/${resolveWhisperBinaryName(platform)}`
      },
      {
        name: 'model',
        url: managedModel.url,
        sha256: managedModel.sha256,
        archiveType: 'file',
        targetRelativePath: `models/${managedModel.id}.bin`
      }
    ]
  };
}

/**
 * 运行时清单解析选项。
 */
export interface ResolveSpeechRuntimeManifestOptions {
  /** 可替换的远程下载实现。 */
  downloadUrl?: (url: string) => Promise<Buffer>;
}

/**
 * 读取或初始化 V2 状态。
 * @param userDataPath - 可选 userData 根目录
 * @param platform - 平台标识
 * @param arch - 架构标识
 * @returns 当前状态
 */
async function readOrCreateRuntimeState(
  userDataPath: string | undefined,
  platform: 'darwin' | 'win32',
  arch: 'arm64' | 'x64'
): Promise<SpeechRuntimeStateFile> {
  return (await readSpeechRuntimeState({ userDataPath, platform, arch })) ?? createEmptySpeechRuntimeState({ userDataPath, platform, arch });
}

/**
 * 计算资源默认文件名。
 * @param platform - 平台标识
 * @returns whisper 文件名
 */
function resolveWhisperBinaryName(platform: 'darwin' | 'win32'): string {
  return platform === 'win32' ? 'whisper.exe' : 'whisper';
}

/**
 * 根据环境变量拼接基础 URL 形式的运行时清单。
 * @param platform - 平台标识
 * @param arch - 架构标识
 * @returns 运行时清单
 */
function resolveSpeechRuntimeManifestFromBaseUrl(platform: 'darwin' | 'win32', arch: 'arm64' | 'x64'): SpeechRuntimeManifestDefinition {
  const baseUrl = process.env.TIBIS_SPEECH_RUNTIME_BASE_URL?.trim();
  const version = process.env.TIBIS_SPEECH_RUNTIME_VERSION?.trim() || 'latest';
  const modelName = process.env.TIBIS_SPEECH_MODEL_NAME?.trim() || 'ggml-base';
  if (!baseUrl) {
    throw new Error('Missing TIBIS_SPEECH_RUNTIME_BASE_URL');
  }

  const platformDir = `${platform}-${arch}`;
  const whisperFileName = resolveWhisperBinaryName(platform);

  return {
    platform,
    arch,
    version,
    modelName,
    assets: [
      {
        name: 'whisper',
        url: `${baseUrl}/${platformDir}/${whisperFileName}`,
        sha256: process.env.TIBIS_SPEECH_WHISPER_SHA256?.trim() ?? '',
        archiveType: 'file',
        targetRelativePath: `bin/${whisperFileName}`
      },
      {
        name: 'model',
        url: `${baseUrl}/models/${modelName}.bin`,
        sha256: process.env.TIBIS_SPEECH_MODEL_SHA256?.trim() ?? '',
        archiveType: 'file',
        targetRelativePath: `models/${modelName}.bin`
      }
    ]
  };
}

/**
 * 下载远程 URL 内容。
 * @param url - 远程资源 URL
 * @returns 下载后的字节
 */
export async function downloadSpeechRuntimeUrl(url: string): Promise<Buffer> {
  const request = url.startsWith('https://') ? getHttps : get;

  return new Promise<Buffer>((resolve, reject) => {
    request(url, (response) => {
      if (!response.statusCode || response.statusCode >= 400) {
        reject(new Error(`Failed to download speech asset: ${url}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * 根据 manifest URL 解析运行时清单。
 * @param manifestUrl - manifest 地址
 * @param platform - 平台标识
 * @param arch - 架构标识
 * @param downloadUrl - 下载函数
 * @returns 运行时清单
 */
async function resolveSpeechRuntimeManifestFromIndex(
  manifestUrl: string,
  platform: 'darwin' | 'win32',
  arch: 'arm64' | 'x64',
  downloadUrl: (url: string) => Promise<Buffer>
): Promise<SpeechRuntimeManifestDefinition> {
  const bytes = await downloadUrl(manifestUrl);
  const parsedManifest = JSON.parse(bytes.toString('utf-8')) as RemoteSpeechRuntimeIndexManifest | SpeechCatalogManifest;
  if ('schemaVersion' in parsedManifest && parsedManifest.schemaVersion === 2) {
    return resolveSpeechRuntimeManifestFromCatalog(parsedManifest, platform, arch);
  }

  const platformKey = `${platform}-${arch}`;
  const indexManifest = parsedManifest as RemoteSpeechRuntimeIndexManifest;
  const manifest = indexManifest.platforms[platformKey];
  if (!manifest) {
    throw new Error(`Speech runtime platform is not supported: ${platformKey}`);
  }

  return {
    ...manifest,
    version: manifest.version || indexManifest.currentVersion
  };
}

/**
 * 根据配置解析运行时清单。
 * @param platform - 平台标识
 * @param arch - 架构标识
 * @param options - 解析选项
 * @returns 运行时清单
 */
export async function resolveSpeechRuntimeManifest(
  platform: 'darwin' | 'win32',
  arch: 'arm64' | 'x64',
  options: ResolveSpeechRuntimeManifestOptions = {}
): Promise<SpeechRuntimeManifestDefinition> {
  const manifestUrl = process.env.TIBIS_SPEECH_RUNTIME_MANIFEST_URL?.trim();
  const downloadUrl = options.downloadUrl ?? downloadSpeechRuntimeUrl;
  if (manifestUrl) {
    return resolveSpeechRuntimeManifestFromIndex(manifestUrl, platform, arch, downloadUrl);
  }

  return resolveSpeechRuntimeManifestFromBaseUrl(platform, arch);
}

/**
 * 下载远程资源。
 * @param asset - 资源定义
 * @returns 下载后的字节
 */
export async function downloadSpeechRuntimeAsset(asset: SpeechRuntimeAsset): Promise<Buffer> {
  return downloadSpeechRuntimeUrl(asset.url);
}

/**
 * 校验资源摘要。
 * @param sha256 - 预期摘要
 * @param bytes - 资源字节
 * @param label - 资源名称
 */
function assertChecksum(sha256: string, bytes: Buffer, label: string): void {
  if (!sha256) {
    return;
  }

  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== sha256) {
    throw new Error(`Checksum mismatch for speech asset: ${label}`);
  }
}

/**
 * 向目标路径写入下载资源。
 * @param outputFilePath - 输出路径
 * @param bytes - 资源字节
 * @param archiveType - 归档格式
 * @param asset - 资源定义
 * @param extractZipAsset - zip 解压函数
 */
async function writeDownloadedAsset(
  outputFilePath: string,
  bytes: Buffer,
  archiveType: 'file' | 'zip',
  asset: SpeechRuntimeAsset,
  extractZipAsset?: (input: SpeechZipExtractInput) => Promise<void>
): Promise<void> {
  await mkdir(dirname(outputFilePath), { recursive: true });
  if (archiveType === 'zip') {
    if (!extractZipAsset) {
      throw new Error('extractZipAsset must be implemented');
    }

    await extractZipAsset({
      asset,
      bytes,
      outputFilePath
    });
    return;
  }

  await writeFile(outputFilePath, bytes);
}

/**
 * 安装单个 binary 资源。
 * @param options - 安装选项
 */
export async function installSpeechBinary(options: InstallSpeechBinaryOptions): Promise<void> {
  const runtimeRoot = getSpeechRuntimeRoot({ userDataPath: options.userDataPath });
  const outputFilePath = join(runtimeRoot, options.relativePath);
  const downloadUrl = options.downloadUrl ?? downloadSpeechRuntimeUrl;
  const bytes = await downloadUrl(options.url);
  assertChecksum(options.sha256, bytes, 'whisper');

  await writeDownloadedAsset(outputFilePath, bytes, options.archiveType, {
    name: 'whisper',
    url: options.url,
    sha256: options.sha256,
    archiveType: options.archiveType,
    targetRelativePath: options.relativePath
  }, options.extractZipAsset);

  if (options.platform !== 'win32') {
    await chmod(outputFilePath, 0o755);
  }

  const state = await readOrCreateRuntimeState(options.userDataPath, options.platform, options.arch);
  state.binaries.installed = state.binaries.installed.filter((record) => record.version !== options.version);
  state.binaries.installed.push({
    version: options.version,
    relativePath: options.relativePath,
    sha256: options.sha256
  });
  state.binaries.currentVersion = options.version;
  await writeSpeechRuntimeState(state, { userDataPath: options.userDataPath, platform: options.platform, arch: options.arch });
}

/**
 * 下载 binary 更新，但不切换当前版本。
 * @param options - 下载选项
 */
export async function downloadSpeechBinaryUpdate(options: InstallSpeechBinaryOptions): Promise<void> {
  const runtimeRoot = getSpeechRuntimeRoot({ userDataPath: options.userDataPath });
  const outputFilePath = join(runtimeRoot, options.relativePath);
  const downloadUrl = options.downloadUrl ?? downloadSpeechRuntimeUrl;
  const bytes = await downloadUrl(options.url);
  assertChecksum(options.sha256, bytes, 'whisper');

  await writeDownloadedAsset(outputFilePath, bytes, options.archiveType, {
    name: 'whisper',
    url: options.url,
    sha256: options.sha256,
    archiveType: options.archiveType,
    targetRelativePath: options.relativePath
  }, options.extractZipAsset);

  if (options.platform !== 'win32') {
    await chmod(outputFilePath, 0o755);
  }

  const state = await readOrCreateRuntimeState(options.userDataPath, options.platform, options.arch);
  state.binaries.installed = state.binaries.installed.filter((record) => record.version !== options.version);
  state.binaries.installed.push({
    version: options.version,
    relativePath: options.relativePath,
    sha256: options.sha256
  });
  state.updates.binaryUpdate = {
    version: options.version
  };
  await writeSpeechRuntimeState(state, { userDataPath: options.userDataPath, platform: options.platform, arch: options.arch });
}

/**
 * 安装单个官方模型。
 * @param options - 安装选项
 */
export async function installManagedSpeechModel(options: InstallManagedSpeechModelOptions): Promise<void> {
  const runtimeRoot = getSpeechRuntimeRoot({ userDataPath: options.userDataPath });
  const outputFilePath = join(runtimeRoot, options.relativePath);
  const metaPath = join(dirname(outputFilePath), 'meta.json');
  const downloadUrl = options.downloadUrl ?? downloadSpeechRuntimeUrl;
  const bytes = await downloadUrl(options.url);
  assertChecksum(options.sha256, bytes, options.modelId);

  await mkdir(dirname(outputFilePath), { recursive: true });
  await writeFile(outputFilePath, bytes);

  const modelRecord: SpeechManagedModelRecord = {
    id: options.modelId,
    displayName: options.displayName,
    version: options.version,
    relativePath: options.relativePath,
    sha256: options.sha256,
    sizeBytes: options.sizeBytes
  };
  await writeFile(metaPath, JSON.stringify(modelRecord, null, 2));

  const state = await readOrCreateRuntimeState(options.userDataPath, options.platform, options.arch);
  state.managedModels = state.managedModels.filter((record) => record.id !== options.modelId);
  state.managedModels.push(modelRecord);
  await writeSpeechRuntimeState(state, { userDataPath: options.userDataPath, platform: options.platform, arch: options.arch });
}

/**
 * 删除官方模型。
 * @param options - 删除选项
 */
export async function removeManagedSpeechModel(options: RemoveManagedSpeechModelOptions): Promise<void> {
  const state = await readSpeechRuntimeState({ userDataPath: options.userDataPath });
  if (!state) {
    return;
  }

  if (state.selectedModel?.sourceType === 'managed' && state.selectedModel.modelId === options.modelId) {
    throw new Error(`Managed speech model ${options.modelId} is currently selected`);
  }

  state.managedModels = state.managedModels.filter((record) => record.id !== options.modelId);
  await writeSpeechRuntimeState(state, { userDataPath: options.userDataPath, platform: state.platform, arch: state.arch });
}

/**
 * 应用 binary 更新。
 * @param options - 应用更新选项
 */
export async function applySpeechBinaryUpdate(options: ApplySpeechBinaryUpdateOptions): Promise<void> {
  const state = await readSpeechRuntimeState({ userDataPath: options.userDataPath });
  if (!state) {
    throw new Error('Speech runtime state is not initialized');
  }

  const targetBinary = state.binaries.installed.find((record) => record.version === options.version);
  if (!targetBinary) {
    throw new Error(`Speech runtime binary version is not installed: ${options.version}`);
  }

  state.binaries.currentVersion = options.version;
  state.updates.binaryUpdate = null;
  await writeSpeechRuntimeState(state, { userDataPath: options.userDataPath, platform: state.platform, arch: state.arch });
}

/**
 * 回滚到上一已安装 binary 版本。
 * @param options - 回滚选项
 */
export async function rollbackSpeechBinaryUpdate(options: RollbackSpeechBinaryUpdateOptions): Promise<void> {
  const state = await readSpeechRuntimeState({ userDataPath: options.userDataPath });
  if (!state) {
    throw new Error('Speech runtime state is not initialized');
  }

  const currentVersion = state.binaries.currentVersion;
  const previousBinary = [...state.binaries.installed].reverse().find((record) => record.version !== currentVersion);
  if (!previousBinary) {
    throw new Error('No previous speech runtime binary version is available');
  }

  state.binaries.currentVersion = previousBinary.version;
  state.updates.binaryUpdate = null;
  await writeSpeechRuntimeState(state, { userDataPath: options.userDataPath, platform: state.platform, arch: state.arch });
}

/**
 * 兼容第一版：安装语音运行时。
 * @param options - 安装选项
 */
export async function installSpeechRuntime(options: InstallSpeechRuntimeOptions): Promise<void> {
  const runtimeRoot = getSpeechRuntimeRoot({ userDataPath: options.userDataPath });
  const tempDir = join(runtimeRoot, 'tmp', `${Date.now()}`);
  const stagedDir = join(runtimeRoot, `runtime-${options.manifest.version}`);
  const currentDir = join(runtimeRoot, 'current');
  const downloadAsset = options.downloadAsset ?? downloadSpeechRuntimeAsset;
  const extractZipAsset = options.extractZipAsset;
  const downloadedAssets = new Map<SpeechRuntimeAsset['name'], Buffer>();

  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });

  for (const [index, asset] of options.manifest.assets.entries()) {
    // eslint-disable-next-line no-await-in-loop
    await options.onProgress?.({
      phase: 'downloading',
      current: index + 1,
      total: options.manifest.assets.length,
      message: `Downloading ${asset.name}`
    });

    // eslint-disable-next-line no-await-in-loop
    const bytes = await downloadAsset(asset);
    downloadedAssets.set(asset.name, bytes);
    assertChecksum(asset.sha256, bytes, asset.name);
    const outputFilePath = join(tempDir, asset.targetRelativePath);

    if (asset.archiveType === 'zip') {
      // eslint-disable-next-line no-await-in-loop
      await options.onProgress?.({
        phase: 'extracting',
        current: index + 1,
        total: options.manifest.assets.length,
        message: `Extracting ${asset.name}`
      });
    }

    // eslint-disable-next-line no-await-in-loop
    await writeDownloadedAsset(outputFilePath, bytes, asset.archiveType, asset, extractZipAsset);

    if (asset.name === 'whisper' && options.platform !== 'win32') {
      // eslint-disable-next-line no-await-in-loop
      await chmod(outputFilePath, 0o755);
    }

    // eslint-disable-next-line no-await-in-loop
    await options.onProgress?.({
      phase: 'verifying',
      current: index + 1,
      total: options.manifest.assets.length,
      message: `Verified ${asset.name}`
    });
  }

  await rm(stagedDir, { recursive: true, force: true });
  await rename(tempDir, stagedDir);
  await rm(currentDir, { recursive: true, force: true });
  await rename(stagedDir, currentDir);

  await writeFile(
    join(runtimeRoot, 'manifest.json'),
    JSON.stringify({
      version: options.manifest.version,
      modelName: options.manifest.modelName,
      platform: options.manifest.platform,
      arch: options.manifest.arch,
      currentDir: 'current'
    })
  );

  await installSpeechBinary({
    userDataPath: options.userDataPath,
    platform: options.platform,
    arch: options.arch,
    version: options.manifest.version,
    relativePath: `binaries/${options.platform}-${options.arch}/${options.manifest.version}/${resolveWhisperBinaryName(options.platform)}`,
    sha256: options.manifest.assets.find((asset) => asset.name === 'whisper')?.sha256 ?? '',
    url: options.manifest.assets.find((asset) => asset.name === 'whisper')?.url ?? '',
    archiveType: 'file',
    downloadUrl: async () => downloadedAssets.get('whisper') ?? Buffer.alloc(0)
  });

  await installManagedSpeechModel({
    userDataPath: options.userDataPath,
    platform: options.platform,
    arch: options.arch,
    modelId: options.manifest.modelName,
    displayName: options.manifest.modelName,
    version: '1',
    relativePath: `managed-models/${options.manifest.modelName}/1/model.bin`,
    sha256: options.manifest.assets.find((asset) => asset.name === 'model')?.sha256 ?? '',
    sizeBytes: 0,
    url: options.manifest.assets.find((asset) => asset.name === 'model')?.url ?? '',
    downloadUrl: async () => downloadedAssets.get('model') ?? Buffer.alloc(0)
  });

  await options.onProgress?.({
    phase: 'completed',
    current: options.manifest.assets.length,
    total: options.manifest.assets.length,
    message: 'Speech runtime installed'
  });
}
