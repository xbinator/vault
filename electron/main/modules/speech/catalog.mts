/**
 * @file catalog.mts
 * @description 拉取并解析语音运行时 catalog manifest V2，提供官方模型列表与更新比较能力。
 */
import type { SpeechCatalogManifest, SpeechCatalogManagedModelRecord, SpeechManagedModelRecord, SpeechRuntimeUpdatesState } from './types.mjs';
import { downloadSpeechRuntimeUrl } from './installer.mjs';

/**
 * catalog 拉取选项。
 */
export interface FetchSpeechCatalogOptions {
  /** 可替换下载函数。 */
  downloadUrl?: (url: string) => Promise<Buffer>;
}

/**
 * catalog 查询上下文。
 */
export interface SpeechCatalogContext {
  /** 平台标识。 */
  platform: 'darwin' | 'win32';
  /** 架构标识。 */
  arch: 'arm64' | 'x64';
}

/**
 * 更新检查上下文。
 */
export interface CheckSpeechRuntimeUpdatesContext extends SpeechCatalogContext {
  /** 当前 binary 版本。 */
  currentVersion: string | null;
  /** 当前已安装官方模型。 */
  managedModels: SpeechManagedModelRecord[];
}

/**
 * 解析 catalog manifest 地址。
 * @returns manifest 地址
 */
function resolveSpeechCatalogManifestUrl(): string {
  const manifestUrl = process.env.TIBIS_SPEECH_RUNTIME_MANIFEST_URL?.trim();
  if (!manifestUrl) {
    throw new Error('Missing TIBIS_SPEECH_RUNTIME_MANIFEST_URL');
  }

  return manifestUrl;
}

/**
 * 断言 manifest 结构满足 V2 最低要求。
 * @param manifest - 待校验 manifest
 */
function assertSpeechCatalogManifest(manifest: SpeechCatalogManifest): void {
  if (manifest.schemaVersion !== 2) {
    throw new Error(`Unsupported speech catalog schema version: ${String(manifest.schemaVersion)}`);
  }

  if (!manifest.binaries || !manifest.models) {
    throw new Error('Speech catalog manifest is missing required sections');
  }
}

/**
 * 拉取并解析 catalog manifest。
 * @param options - 拉取选项
 * @returns catalog manifest
 */
export async function fetchSpeechCatalog(options: FetchSpeechCatalogOptions = {}): Promise<SpeechCatalogManifest> {
  const downloadUrl = options.downloadUrl ?? downloadSpeechRuntimeUrl;
  const bytes = await downloadUrl(resolveSpeechCatalogManifestUrl());
  const manifest = JSON.parse(bytes.toString('utf-8')) as SpeechCatalogManifest;
  assertSpeechCatalogManifest(manifest);
  return manifest;
}

/**
 * 获取当前平台可用的官方模型列表。
 * @param context - 查询上下文
 * @param options - 拉取选项
 * @returns 官方模型列表
 */
export async function getAvailableManagedModels(
  context: SpeechCatalogContext,
  options: FetchSpeechCatalogOptions = {}
): Promise<SpeechCatalogManagedModelRecord[]> {
  const manifest = await fetchSpeechCatalog(options);
  const platformKey = `${context.platform}-${context.arch}`;
  if (!manifest.binaries[platformKey]) {
    throw new Error(`Speech runtime platform is not supported: ${platformKey}`);
  }

  return manifest.models;
}

/**
 * 检查当前平台 binary 与已安装模型是否存在更新。
 * @param context - 更新检查上下文
 * @param options - 拉取选项
 * @returns 更新状态
 */
export async function checkSpeechRuntimeUpdates(
  context: CheckSpeechRuntimeUpdatesContext,
  options: FetchSpeechCatalogOptions = {}
): Promise<SpeechRuntimeUpdatesState> {
  const manifest = await fetchSpeechCatalog(options);
  const platformKey = `${context.platform}-${context.arch}`;
  const binaryRecord = manifest.binaries[platformKey];
  if (!binaryRecord) {
    throw new Error(`Speech runtime platform is not supported: ${platformKey}`);
  }

  const binaryUpdate = context.currentVersion && context.currentVersion === binaryRecord.currentVersion ? null : { version: binaryRecord.currentVersion };

  const modelUpdates = context.managedModels.flatMap((managedModel) => {
    const catalogModel = manifest.models.find((model) => model.id === managedModel.id);
    if (!catalogModel || catalogModel.version === managedModel.version) {
      return [];
    }

    return [
      {
        modelId: catalogModel.id,
        version: catalogModel.version
      }
    ];
  });

  return {
    autoCheck: true,
    autoDownload: false,
    binaryUpdate,
    modelUpdates
  };
}
