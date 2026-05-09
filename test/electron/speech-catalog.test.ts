/**
 * @file speech-catalog.test.ts
 * @description 验证语音 catalog 的 V2 manifest 解析、官方模型列表与更新检查行为。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 模拟的 catalog manifest 下载结果。
 */
const manifestBytes = Buffer.from(
  JSON.stringify({
    schemaVersion: 2,
    binaries: {
      'darwin-arm64': {
        currentVersion: '2026.06.01',
        versions: [
          {
            version: '2026.05.04',
            url: 'https://example.com/whisper-darwin-arm64-2026.05.04',
            sha256: 'a'.repeat(64),
            archiveType: 'file'
          },
          {
            version: '2026.06.01',
            url: 'https://example.com/whisper-darwin-arm64-2026.06.01',
            sha256: 'b'.repeat(64),
            archiveType: 'file'
          }
        ]
      }
    },
    models: [
      {
        id: 'ggml-base',
        displayName: 'Base',
        version: '2',
        url: 'https://example.com/ggml-base-v2.bin',
        sha256: 'c'.repeat(64),
        sizeBytes: 147000000,
        recommendedFor: '通用快速转写'
      },
      {
        id: 'ggml-small',
        displayName: 'Small',
        version: '1',
        url: 'https://example.com/ggml-small-v1.bin',
        sha256: 'd'.repeat(64),
        sizeBytes: 488000000,
        recommendedFor: '更高精度'
      }
    ]
  })
);

describe('speech catalog', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses a V2 catalog manifest from the configured URL', async () => {
    vi.stubEnv('TIBIS_SPEECH_RUNTIME_MANIFEST_URL', 'https://example.com/manifest.json');

    const { fetchSpeechCatalog } = await import('../../electron/main/modules/speech/catalog.mjs');
    const catalog = await fetchSpeechCatalog({
      downloadUrl: async () => manifestBytes
    });

    expect(catalog.schemaVersion).toBe(2);
    expect(catalog.binaries['darwin-arm64']?.currentVersion).toBe('2026.06.01');
    expect(catalog.models.map((item) => item.id)).toEqual(['ggml-base', 'ggml-small']);
  });

  it('lists catalog managed models for the current platform without mutating metadata', async () => {
    vi.stubEnv('TIBIS_SPEECH_RUNTIME_MANIFEST_URL', 'https://example.com/manifest.json');

    const { getAvailableManagedModels } = await import('../../electron/main/modules/speech/catalog.mjs');
    const models = await getAvailableManagedModels(
      {
        platform: 'darwin',
        arch: 'arm64'
      },
      {
        downloadUrl: async () => manifestBytes
      }
    );

    expect(models).toHaveLength(2);
    expect(models[0]).toMatchObject({
      id: 'ggml-base',
      version: '2',
      displayName: 'Base'
    });
    expect(models[1]).toMatchObject({
      id: 'ggml-small',
      version: '1'
    });
  });

  it('detects newer binary and managed model versions compared with local state', async () => {
    vi.stubEnv('TIBIS_SPEECH_RUNTIME_MANIFEST_URL', 'https://example.com/manifest.json');

    const { checkSpeechRuntimeUpdates } = await import('../../electron/main/modules/speech/catalog.mjs');
    const updates = await checkSpeechRuntimeUpdates(
      {
        platform: 'darwin',
        arch: 'arm64',
        currentVersion: '2026.05.04',
        managedModels: [
          {
            id: 'ggml-base',
            displayName: 'Base',
            version: '1',
            relativePath: 'managed-models/ggml-base/1/model.bin',
            sha256: 'old',
            sizeBytes: 147000000
          }
        ]
      },
      {
        downloadUrl: async () => manifestBytes
      }
    );

    expect(updates.binaryUpdate).toMatchObject({
      version: '2026.06.01'
    });
    expect(updates.modelUpdates).toEqual([
      {
        modelId: 'ggml-base',
        version: '2'
      }
    ]);
  });

  it('returns no updates when local binary and managed models already match the catalog', async () => {
    vi.stubEnv('TIBIS_SPEECH_RUNTIME_MANIFEST_URL', 'https://example.com/manifest.json');

    const { checkSpeechRuntimeUpdates } = await import('../../electron/main/modules/speech/catalog.mjs');
    const updates = await checkSpeechRuntimeUpdates(
      {
        platform: 'darwin',
        arch: 'arm64',
        currentVersion: '2026.06.01',
        managedModels: [
          {
            id: 'ggml-base',
            displayName: 'Base',
            version: '2',
            relativePath: 'managed-models/ggml-base/2/model.bin',
            sha256: 'new',
            sizeBytes: 147000000
          },
          {
            id: 'ggml-small',
            displayName: 'Small',
            version: '1',
            relativePath: 'managed-models/ggml-small/1/model.bin',
            sha256: 'same',
            sizeBytes: 488000000
          }
        ]
      },
      {
        downloadUrl: async () => manifestBytes
      }
    );

    expect(updates.binaryUpdate).toBeNull();
    expect(updates.modelUpdates).toEqual([]);
  });
});
