# Speech Runtime V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有单运行时单模型语音能力升级为支持多官方模型、外部模型注册、显式模型选择、后台更新与回滚的 V2 架构。

**Architecture:** 以 `speech-runtime/state.json` 为单一状态源，将运行时拆成 catalog、runtime store、installer、service 和 renderer 五层。主进程负责状态解析、安装、迁移和更新，渲染层仅消费 `snapshot` 与操作型 IPC，不直接推导本地目录结构。

**Tech Stack:** Electron main IPC、TypeScript、Vue 3、Vitest、Node `fs/promises`

---

## File Map

### Existing files to modify

- `electron/main/modules/speech/types.mts`
  - 从 V1 单模型类型升级到 V2 状态、目录、更新、快照和 IPC 输入输出类型定义。
- `electron/main/modules/speech/runtime.mts`
  - 负责 `state.json` 读写、V1 迁移、当前 binary 与模型选择解析、可用性校验。
- `electron/main/modules/speech/installer.mts`
  - 负责 binary/官方模型下载、校验、staging、提交安装、删除、应用更新和回滚。
- `electron/main/modules/speech/service.mts`
  - 只解析当前生效 `SpeechRuntimeConfig` 并执行转写，不承载安装逻辑。
- `electron/main/modules/speech/ipc.mts`
  - 暴露 V2 snapshot、模型管理、更新管理等 IPC 接口，并兼容旧接口。
- `electron/preload/index.mts`
  - 向渲染层公开新增 speech API，并保留旧方法的兼容出口。
- `src/views/settings/speech/index.vue`
  - 从单状态页升级成“运行时概览 + 官方模型 + 外部模型 + 当前生效配置”的管理页。
- `src/views/settings/speech/components/SpeechSettingsItem.vue`
  - 复用或微调基础展示项，承接更复杂的模型与更新状态展示。
- `src/components/BChatSidebar/components/InputToolbar/VoiceInput.vue`
  - 从“runtime 是否 ready”升级为“binary 可用 + 当前模型可用”的兜底判断。
- `resources/speech/manifest.json`
  - 升级为 V2 远端 manifest 结构，拆分 binary 与 models。

### New files to create

- `electron/main/modules/speech/catalog.mts`
  - 负责远端 manifest V2 拉取、解析、更新比较。
- `test/electron/speech-runtime.test.ts`
  - 覆盖 `state.json` 读写、当前选择解析、外部模型校验、V1 迁移。
- `test/electron/speech-catalog.test.ts`
  - 覆盖 manifest V2 解析与更新识别。

### Existing tests to expand

- `test/electron/speech-installer.test.ts`
  - 从“安装 current 目录”升级到 binary 仓库、模型仓库、apply/rollback 语义。
- `test/electron/speech-service.test.ts`
  - 覆盖 managed/external 模型解析、无效选择拦截。
- `test/views/settings/speech/index.test.ts`
  - 从源码接线断言升级到页面结构和新 API 使用断言。
- `test/components/BChatSidebar/components/VoiceInput.test.ts`
  - 覆盖无模型、外部模型失效、自动安装推荐模型等交互兜底。

## Delivery Strategy

按下面 6 个阶段交付，每个阶段都应保持可测、可提交、可回退：

1. 先完成 V2 类型与状态存储，不碰 UI。
2. 再完成多官方模型安装与切换，闭环主目标。
3. 再接入外部模型注册与校验。
4. 再补 catalog 与更新状态。
5. 再升级设置页和聊天入口。
6. 最后做旧数据迁移、兼容接口和回归测试。

## Task 1: V2 状态模型与运行时解析

**Files:**
- Modify: `electron/main/modules/speech/types.mts`
- Modify: `electron/main/modules/speech/runtime.mts`
- Modify: `electron/main/modules/speech/service.mts`
- Test: `test/electron/speech-runtime.test.ts`
- Test: `test/electron/speech-service.test.ts`

- [ ] 定义 V2 类型，包括 `SpeechModelSelection`、`SpeechBinaryRecord`、`SpeechManagedModelRecord`、`SpeechExternalModelRecord`、`SpeechRuntimeStateFile`、`SpeechRuntimeSnapshot`、`SpeechRuntimeResolvedSelection`。
- [ ] 在 `runtime.mts` 中新增 `getSpeechRuntimeStatePath()`、`readSpeechRuntimeState()`、`writeSpeechRuntimeState()`、`createEmptySpeechRuntimeState()`、`resolveSpeechRuntimeSelection()`、`getSpeechRuntimeSnapshot()`。
- [ ] 将 `resolveInstalledSpeechRuntimePaths()` 替换为“解析 binary + 当前模型”的组合解析，返回 V2 `SpeechRuntimeConfig`。
- [ ] 在 `service.mts` 中仅保留 `resolveSpeechRuntimeConfig()` 和 `transcribeAudioSegment()` 的消费逻辑，不再读取 V1 manifest。
- [ ] 为 `runtime.mts` 新增测试：
  - 缺失 `state.json` 时返回 `binaryState: 'missing'` 且 `hasUsableModel: false`
  - `managed` 选择可解析成相对路径模型
  - `external` 选择可解析成绝对路径模型
  - 当前选择缺失时返回 `activeState: 'invalid-selection'`
  - 外部模型文件不存在时返回 `lastValidationState: 'missing'`
- [ ] 为 `service.mts` 扩展测试：
  - managed 模型场景下从 `state.json` 解析模型路径
  - external 模型场景下直接使用 `filePath`
  - `activeState !== 'ready'` 时拦截转写并抛出用户可读错误
- [ ] 运行验证：
  - `pnpm test -- test/electron/speech-runtime.test.ts test/electron/speech-service.test.ts`

## Task 2: 官方模型仓库与安装器重构

**Files:**
- Modify: `electron/main/modules/speech/types.mts`
- Modify: `electron/main/modules/speech/installer.mts`
- Modify: `electron/main/modules/speech/runtime.mts`
- Test: `test/electron/speech-installer.test.ts`

- [ ] 将 installer 的输入结构从“一个 manifest + assets”拆成：
  - binary 安装输入
  - managed model 安装输入
  - 删除 managed model 输入
  - apply/rollback 输入
- [ ] 为 `installer.mts` 新增目录写入约定：
  - `binaries/<platform-arch>/<version>/`
  - `managed-models/<modelId>/<version>/`
  - `cache/downloads/`
  - `temp/`
- [ ] 实现 `installSpeechBinary()`，下载并校验 binary，写入 binary 仓库，只更新 `state.binaries.installed`，不自动切换 `currentVersion`。
- [ ] 实现 `installManagedModel()`，下载并校验模型，写入 `managed-models/<id>/<version>/model.bin` 与 `meta.json`。
- [ ] 实现 `setActiveManagedModel()`，在“安装并设为当前”路径下单独改写 `selectedModel`。
- [ ] 实现 `removeManagedModel()`，若正在使用则显式报错，避免误删当前模型。
- [ ] 更新测试覆盖：
  - 安装 binary 写入版本化目录与 `state.json`
  - 安装 managed model 写入版本化模型目录与 `meta.json`
  - 删除当前使用中的 managed model 被拒绝
  - 应用切换仅改状态指针，不搬运大文件
- [ ] 运行验证：
  - `pnpm test -- test/electron/speech-installer.test.ts`

## Task 3: 外部模型注册、校验与切换

**Files:**
- Modify: `electron/main/modules/speech/types.mts`
- Modify: `electron/main/modules/speech/runtime.mts`
- Modify: `electron/main/modules/speech/ipc.mts`
- Modify: `electron/preload/index.mts`
- Test: `test/electron/speech-runtime.test.ts`

- [ ] 在 `runtime.mts` 中实现外部模型操作：
  - `registerExternalModel(filePath, displayName)`
  - `renameExternalModel(id, displayName)`
  - `revalidateExternalModel(id)`
  - `removeExternalModel(id)`
  - `setActiveModel(selection)`
- [ ] 校验外部模型时至少检查：
  - 路径存在
  - 可读
  - 文件扩展名为 `.bin` 或读取文件头满足最低规则
- [ ] 生成稳定 `id`，并把最近一次校验结果写回 `lastValidatedAt`、`lastValidationState`、`lastErrorMessage`。
- [ ] 为 IPC 增加接口：
  - `speech:listExternalModels`
  - `speech:registerExternalModel`
  - `speech:renameExternalModel`
  - `speech:revalidateExternalModel`
  - `speech:removeExternalModel`
  - `speech:setActiveModel`
- [ ] 在 preload 中暴露对应 Electron API，保持类型同步更新。
- [ ] 补测试：
  - 注册成功后能出现在 `externalModels`
  - 不存在路径注册失败并回写 `invalid`/`missing`
  - 当前使用中的外部模型禁止删除
  - 切换到外部模型后 snapshot 的 `selectedModel.sourceType === 'external'`
- [ ] 运行验证：
  - `pnpm test -- test/electron/speech-runtime.test.ts`

## Task 4: Catalog、更新检查、下载、应用与回滚

**Files:**
- Create: `electron/main/modules/speech/catalog.mts`
- Modify: `electron/main/modules/speech/types.mts`
- Modify: `electron/main/modules/speech/installer.mts`
- Modify: `electron/main/modules/speech/ipc.mts`
- Modify: `resources/speech/manifest.json`
- Test: `test/electron/speech-catalog.test.ts`
- Test: `test/electron/speech-installer.test.ts`
- Test: `test/scripts/speech/manifest-tool.test.ts`

- [ ] 定义 manifest V2 类型，拆分：
  - `binaries[platform-arch].currentVersion`
  - `binaries[platform-arch].versions[]`
  - `models[]`
- [ ] 在 `catalog.mts` 中实现：
  - `fetchSpeechCatalog()`
  - `getAvailableManagedModels()`
  - `checkSpeechRuntimeUpdates()`
- [ ] 在 installer 中新增：
  - `downloadBinaryUpdate()`
  - `downloadManagedModelUpdate()`
  - `applyRuntimeUpdate()`
  - `rollbackRuntimeUpdate()`
- [ ] 更新策略实现要求：
  - 后台下载只写 staging/installed 记录
  - 不自动改写 `currentVersion`
  - 应用更新和回滚都只改状态指针
- [ ] 增加 IPC：
  - `speech:getRuntimeSnapshot`
  - `speech:listCatalogModels`
  - `speech:checkRuntimeUpdates`
  - `speech:downloadRuntimeUpdates`
  - `speech:applyRuntimeUpdate`
  - `speech:rollbackRuntimeUpdate`
- [ ] 扩展 manifest 工具与其测试，确保 `resources/speech/manifest.json` 的 V2 结构仍可校验、填充 sha256、支持本地化。
- [ ] 运行验证：
  - `pnpm test -- test/electron/speech-catalog.test.ts test/electron/speech-installer.test.ts test/scripts/speech/manifest-tool.test.ts`

## Task 5: 设置页升级为运行时与模型管理页

**Files:**
- Modify: `src/views/settings/speech/index.vue`
- Modify: `src/views/settings/speech/components/SpeechSettingsItem.vue`
- Modify: `electron/preload/index.mts`
- Test: `test/views/settings/speech/index.test.ts`

- [ ] 将页面结构拆成四个区块：
  - 运行时概览
  - 官方模型
  - 外部模型
  - 当前生效配置
- [ ] 使用 `getSpeechRuntimeSnapshot()` 驱动首屏展示，不再依赖 `getSpeechRuntimeStatus()` 的单状态模型。
- [ ] 新增操作按钮与交互：
  - 检查更新
  - 下载更新
  - 应用更新
  - 回滚上一版本
  - 下载官方模型
  - 删除官方模型
  - 设为当前
  - 添加外部模型
  - 重命名外部模型
  - 重新校验
  - 移除外部模型
- [ ] 保持交互约束：
  - 删除当前生效模型前必须先改选
  - 安装完成后不自动切换，除非用户明确使用“安装并设为当前”
  - 当前生效区域要明确区分“已安装”和“正在使用”
- [ ] 更新设置页测试断言：
  - 页面源码或挂载结果包含 `getSpeechRuntimeSnapshot`
  - 页面包含官方模型和外部模型分区
  - 页面包含更新相关操作文案与 handler
  - 页面不再只展示 `modelName`/`version` 的单模型结构
- [ ] 运行验证：
  - `pnpm test -- test/views/settings/speech/index.test.ts`

## Task 6: 聊天入口兜底、V1 迁移与兼容接口收尾

**Files:**
- Modify: `src/components/BChatSidebar/components/InputToolbar/VoiceInput.vue`
- Modify: `electron/main/modules/speech/runtime.mts`
- Modify: `electron/main/modules/speech/ipc.mts`
- Modify: `electron/preload/index.mts`
- Test: `test/components/BChatSidebar/components/VoiceInput.test.ts`
- Test: `test/electron/speech-runtime.test.ts`

- [ ] 在 `runtime.mts` 中实现 V1 到 V2 一次性迁移：
  - 检测旧 `speech-runtime/manifest.json`
  - 检测新 `speech-runtime/state.json` 不存在
  - 读取旧 `current/bin/*` 与 `current/models/*.bin`
  - 生成 V2 `state.json`
  - 成功后再清理旧 `current/` 和 `manifest.json`
- [ ] 在 IPC 中保留旧接口过渡：
  - `speech:getRuntimeStatus` 映射到 `snapshot`
  - `speech:installRuntime` 语义变为“确保 binary 就绪，并在缺省时安装推荐模型”
  - `speech:removeRuntime` 改成清空受管资源并提示风险
- [ ] 升级 `VoiceInput.vue` 的启动前校验：
  - binary 缺失时提示下载基础运行时
  - binary 已就绪但没有可用模型时提示去设置页下载或添加模型
  - 当前选中的外部模型失效时提示重新选择
  - 当前配置可用时正常开始录音
- [ ] 扩展 `VoiceInput.test.ts`：
  - 运行时完全可用时允许开始录音
  - 缺少模型时不进入录音
  - 外部模型失效时展示错误提示并阻止录音
  - 兼容旧安装接口返回 ready 场景
- [ ] 运行最终验证：
  - `pnpm test -- test/electron/speech-runtime.test.ts test/electron/speech-service.test.ts test/electron/speech-installer.test.ts test/electron/speech-catalog.test.ts test/views/settings/speech/index.test.ts test/components/BChatSidebar/components/VoiceInput.test.ts`
  - `pnpm test -- test/scripts/speech/manifest-tool.test.ts`
  - `pnpm lint`
  - `pnpm exec tsc -p electron/tsconfig.json --noEmit`
  - `pnpm exec vue-tsc --noEmit`

## Risks And Decisions To Confirm During Execution

- 外部模型“合法文件”的最低校验规则需要尽快定死，否则 renderer 和 main 的错误文案会反复改。
- `speech:installRuntime` 在 V2 中是否默认顺带安装 `ggml-base`，需要在执行时保持和产品稿一致。
- 设置页是否需要新增更细的子组件拆分，目前可以先在 `index.vue` 落地，若体量失控再切组件。
- `resources/speech/manifest.json` 升级后，脚本和现有开发流程 `speech:dev:start` 也要同步回归。

## Spec Coverage Check

- 多官方模型并存、切换、删除：Task 2、Task 5
- 外部模型注册、校验、切换、删除：Task 3、Task 5、Task 6
- 后台检查、下载、应用更新与回滚：Task 4、Task 5
- V1 到 V2 平滑迁移：Task 6
- `service.mts` 职责保持聚焦：Task 1
- 聊天入口与设置页兜底：Task 5、Task 6

Plan complete and saved to `docs/superpowers/plans/2026-05-09-speech-runtime-v2.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
