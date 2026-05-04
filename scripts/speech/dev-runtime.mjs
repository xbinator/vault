/**
 * @file dev-runtime.mjs
 * @description 语音自动安装本地开发辅助脚本，固定本地目录与文件名，降低联调复杂度。
 */

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, extname, join, resolve } from 'node:path';
import { calculateFileSha256 } from './manifest-tool.mjs';

/**
 * 本地开发资源总目录名。
 */
const DEFAULT_DEV_RESOURCES_DIRECTORY_NAME = '.dev-resources';

/**
 * 本地开发语音资源子目录名。
 */
const DEFAULT_SPEECH_DIRECTORY_NAME = 'speech';

/**
 * 当前平台键。
 * @typedef {'darwin-arm64' | 'darwin-x64' | 'win32-x64'} SpeechPlatformKey
 */

/**
 * prepare 命令参数。
 * @typedef {object} PrepareSpeechDevRuntimeOptions
 * @property {string} cwd 当前工作目录。
 * @property {string} templateManifestPath manifest 模板路径。
 * @property {string} baseUrl 本地静态服务基础地址。
 * @property {'darwin' | 'win32'} platform 目标平台。
 * @property {'arm64' | 'x64'} arch 目标架构。
 */

/**
 * 静态服务配置。
 * @typedef {object} SpeechDevServerOptions
 * @property {string} directoryPath 静态目录路径。
 * @property {number} port 监听端口。
 */

/**
 * 平台清单定义。
 * @typedef {object} SpeechManifestAsset
 * @property {string} name 资源名称。
 * @property {string} url 资源地址。
 * @property {string} sha256 摘要。
 * @property {string} archiveType 归档类型。
 * @property {string} targetRelativePath 目标相对路径。
 */

/**
 * 平台节点定义。
 * @typedef {object} SpeechManifestPlatform
 * @property {string} platform 平台名称。
 * @property {string} arch 架构名称。
 * @property {string} version 版本号。
 * @property {string} modelName 模型名称。
 * @property {SpeechManifestAsset[]} assets 资源列表。
 */

/**
 * manifest 顶层结构。
 * @typedef {object} SpeechManifestDefinition
 * @property {string} currentVersion 当前版本。
 * @property {Record<string, SpeechManifestPlatform>} platforms 平台映射。
 */

/**
 * 标准化基础地址，避免重复斜杠。
 * @param {string} baseUrl - 原始基础地址。
 * @returns {string} 标准化后的基础地址。
 */
function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

/**
 * 根据当前平台和架构生成 speech 平台键。
 * @param {{ platform: string, arch: string }} input - 平台与架构输入。
 * @returns {SpeechPlatformKey} speech 平台键。
 */
export function resolveCurrentSpeechPlatformKey(input) {
  const platformKey = `${input.platform}-${input.arch}`;

  if (platformKey !== 'darwin-arm64' && platformKey !== 'darwin-x64' && platformKey !== 'win32-x64') {
    throw new Error(`Current platform is not supported for speech dev runtime: ${platformKey}`);
  }

  return /** @type {SpeechPlatformKey} */ (platformKey);
}

/**
 * 解析固定本地开发目录中的关键路径。
 * @param {{ cwd: string }} input - 当前工作目录输入。
 * @returns {{
 *   runtimeDirectory: string,
 *   sourceDirectory: string,
 *   sourceWhisperPath: string,
 *   sourceModelPath: string,
 *   manifestPath: string,
 *   runtimeWhisperPath: string,
 *   runtimeModelPath: string
 * }} 解析后的路径集合。
 */
export function resolveSpeechDevPaths(input) {
  const runtimeDirectory = resolve(input.cwd, DEFAULT_DEV_RESOURCES_DIRECTORY_NAME, DEFAULT_SPEECH_DIRECTORY_NAME);
  const sourceDirectory = join(runtimeDirectory, 'source');

  return {
    runtimeDirectory,
    sourceDirectory,
    sourceWhisperPath: join(sourceDirectory, 'whisper-cli'),
    sourceModelPath: join(sourceDirectory, 'ggml-base.bin'),
    manifestPath: join(runtimeDirectory, 'manifest.json'),
    runtimeWhisperPath: join(runtimeDirectory, 'whisper-cli'),
    runtimeModelPath: join(runtimeDirectory, 'ggml-base.bin')
  };
}

/**
 * 从参数中解析本地静态服务配置。
 * @param {{ cwd?: string, dir?: string, port?: string }} input - 原始参数。
 * @returns {SpeechDevServerOptions} 标准化后的服务配置。
 */
export function resolveSpeechDevServerOptions(input) {
  const workingDirectory = input.cwd ?? process.cwd();
  const directoryPath = input.dir
    ? resolve(workingDirectory, input.dir)
    : resolve(workingDirectory, DEFAULT_DEV_RESOURCES_DIRECTORY_NAME, DEFAULT_SPEECH_DIRECTORY_NAME);
  const port = input.port ? Number(input.port) : 8787;

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('speech dev server port must be a positive integer');
  }

  return {
    directoryPath,
    port
  };
}

/**
 * 读取并解析 JSON 文件。
 * @param {string} filePath - 目标 JSON 文件路径。
 * @returns {Promise<unknown>} 解析后的 JSON 值。
 */
async function readJsonFile(filePath) {
  const jsonContent = await readFile(filePath, 'utf8');

  return JSON.parse(jsonContent);
}

/**
 * 构造当前平台专用的本地开发 manifest。
 * @param {{
 *   manifestDefinition: SpeechManifestDefinition,
 *   baseUrl: string,
 *   platformKey: SpeechPlatformKey,
 *   whisperSha256: string,
 *   modelSha256: string
 * }} input - 构造输入。
 * @returns {SpeechManifestDefinition} 当前平台专用 manifest。
 */
function buildCurrentPlatformManifest(input) {
  const platformDefinition = input.manifestDefinition.platforms[input.platformKey];

  if (!platformDefinition) {
    throw new Error(`Manifest template is missing platform entry: ${input.platformKey}`);
  }

  return {
    currentVersion: input.manifestDefinition.currentVersion,
    platforms: {
      [input.platformKey]: {
        ...platformDefinition,
        assets: [
          {
            ...platformDefinition.assets.find((asset) => asset.name === 'whisper'),
            url: `${normalizeBaseUrl(input.baseUrl)}/whisper-cli`,
            sha256: input.whisperSha256,
            targetRelativePath: 'bin/whisper'
          },
          {
            ...platformDefinition.assets.find((asset) => asset.name === 'model'),
            url: `${normalizeBaseUrl(input.baseUrl)}/ggml-base.bin`,
            sha256: input.modelSha256,
            targetRelativePath: 'models/ggml-base.bin'
          }
        ]
      }
    }
  };
}

/**
 * 将本地资源复制到固定静态目录，并生成当前平台专用 manifest。
 * @param {PrepareSpeechDevRuntimeOptions} options - 准备参数。
 * @returns {Promise<{ manifestPath: string, outputDirectory: string }>} 准备结果。
 */
export async function prepareSpeechDevRuntimeDirectory(options) {
  const resolvedPaths = resolveSpeechDevPaths({ cwd: options.cwd });
  const platformKey = resolveCurrentSpeechPlatformKey({
    platform: options.platform,
    arch: options.arch
  });

  await mkdir(resolvedPaths.runtimeDirectory, { recursive: true });
  await mkdir(resolvedPaths.sourceDirectory, { recursive: true });
  await copyFile(resolvedPaths.sourceWhisperPath, resolvedPaths.runtimeWhisperPath);
  await copyFile(resolvedPaths.sourceModelPath, resolvedPaths.runtimeModelPath);

  const [manifestDefinition, whisperSha256, modelSha256] = await Promise.all([
    readJsonFile(resolve(options.cwd, options.templateManifestPath)),
    calculateFileSha256(resolvedPaths.runtimeWhisperPath),
    calculateFileSha256(resolvedPaths.runtimeModelPath)
  ]);
  const nextManifest = buildCurrentPlatformManifest({
    manifestDefinition,
    baseUrl: options.baseUrl,
    platformKey,
    whisperSha256,
    modelSha256
  });

  await writeFile(resolvedPaths.manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8');

  return {
    manifestPath: resolvedPaths.manifestPath,
    outputDirectory: resolvedPaths.runtimeDirectory
  };
}

/**
 * 为 serve 命令创建静态文件服务。
 * @param {SpeechDevServerOptions} options - 服务配置。
 * @returns {Promise<void>} 仅在服务异常退出时返回。
 */
export async function serveSpeechDevRuntimeDirectory(options) {
  const server = createServer(async (request, response) => {
    const requestUrl = request.url ?? '/';
    const relativePath = requestUrl === '/' ? '/manifest.json' : requestUrl;
    const filePath = join(options.directoryPath, relativePath.replace(/^\/+/u, ''));

    try {
      const fileContent = await readFile(filePath);
      const extension = extname(filePath);
      const contentType = extension === '.json' ? 'application/json; charset=utf-8' : 'application/octet-stream';

      response.statusCode = 200;
      response.setHeader('Content-Type', contentType);
      response.end(fileContent);
    } catch {
      response.statusCode = 404;
      response.end(`Not found: ${basename(filePath)}`);
    }
  });

  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(options.port, '127.0.0.1', () => {
      server.off('error', rejectPromise);
      console.log(`speech dev server ready at http://127.0.0.1:${options.port}/manifest.json`);
      console.log(`serving directory: ${options.directoryPath}`);
      resolvePromise(undefined);
    });
  });
}

/**
 * 打印脚本帮助信息。
 * @returns {void}
 */
function printHelp() {
  console.log('Usage:');
  console.log('  node scripts/speech/dev-runtime.mjs prepare');
  console.log('  node scripts/speech/dev-runtime.mjs serve');
}

/**
 * 执行 prepare 命令。
 * @returns {Promise<number>} 退出码。
 */
async function runPrepareFromCli() {
  const result = await prepareSpeechDevRuntimeDirectory({
    cwd: process.cwd(),
    templateManifestPath: 'resources/speech/manifest.json',
    baseUrl: 'http://127.0.0.1:8787',
    platform: /** @type {'darwin' | 'win32'} */ (process.platform),
    arch: /** @type {'arm64' | 'x64'} */ (process.arch)
  });

  console.log(`speech dev runtime prepared: ${result.outputDirectory}`);
  console.log(`manifest path: ${result.manifestPath}`);
  console.log(`source whisper: ${resolveSpeechDevPaths({ cwd: process.cwd() }).sourceWhisperPath}`);
  console.log(`source model: ${resolveSpeechDevPaths({ cwd: process.cwd() }).sourceModelPath}`);

  return 0;
}

/**
 * 执行 serve 命令。
 * @returns {Promise<number>} 退出码。
 */
async function runServeFromCli() {
  const options = resolveSpeechDevServerOptions({ cwd: process.cwd() });

  await serveSpeechDevRuntimeDirectory(options);

  return 0;
}

/**
 * CLI 主入口。
 * @param {string[]} argv - 原始命令行参数。
 * @returns {Promise<number>} 退出码。
 */
export async function runCli(argv) {
  const normalizedArguments = argv[0] === '--' ? argv.slice(1) : argv;
  const [command] = normalizedArguments;

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return 0;
  }

  if (command === 'prepare') {
    return runPrepareFromCli();
  }

  if (command === 'serve') {
    return runServeFromCli();
  }

  console.error(`未知命令: ${command}`);
  printHelp();
  return 1;
}

/**
 * 仅在直接通过 Node 执行时触发 CLI。
 */
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  runCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      const errorMessage = error instanceof Error ? error.stack ?? error.message : String(error);

      console.error(errorMessage);
      process.exitCode = 1;
    });
}
