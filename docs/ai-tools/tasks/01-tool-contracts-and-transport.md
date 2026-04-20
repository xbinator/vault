# Task 01：工具协议与传输类型

日期：2026-04-19

## 目标

建立 AI Tools 的基础协议，让主进程和 renderer 之间可以稳定传输工具定义、tool call 和 tool result。

## 这个 Task 要做什么

- 定义核心工具类型：
  - `AIToolDefinition`
  - `AIToolExecutor`
  - `AIToolExecutionResult`
  - `AIToolExecutionError`
- 扩展错误码，至少覆盖：
  - `TOOL_NOT_FOUND`
  - `INVALID_INPUT`
  - `NO_ACTIVE_DOCUMENT`
  - `NO_SELECTION`
  - `NO_CURSOR`
  - `USER_CANCELLED`
  - `EDITOR_UNAVAILABLE`
  - `STALE_CONTEXT`
  - `TOOL_TIMEOUT`
  - `UNSUPPORTED_PROVIDER`
  - `CONFIRMATION_DISMISSED`
  - `EXECUTION_FAILED`
- 增加 transport 层类型：
  - `AITransportTool`
  - `AIStreamToolCallChunk`
  - `AITransportToolResult`
- 明确 `toolCallId` 是 transport 必填字段。
- 在 Electron 主进程中把 tool-call 事件透传给 renderer。
- 在 preload 层暴露 `onAiStreamToolCall`。

## 修改范围

- `src/ai/tools/types.ts`
- `src/ai/tools/results.ts`
- `types/ai.d.ts`
- `types/electron-api.d.ts`
- `electron/main/modules/ai/service.mts`
- `electron/main/modules/ai/ipc.mts`
- `electron/preload/index.mts`
- `test/ai/tools/results.test.ts`

## 完成标准

- renderer 能收到带 `toolCallId` 的 tool-call 事件。
- `AIRequestOptions` 可以传入 tools。
- 错误码集合已经覆盖第一版需要的分支。
- 所有新增类型不使用 `any`。

## 验收

- `pnpm test test/ai/tools/results.test.ts`
- `pnpm build`
- `pnpm run electron:build-main`

## 不包括

- 不实现具体内置工具。
- 不处理编辑器上下文。
- 不做聊天侧工具执行循环。
