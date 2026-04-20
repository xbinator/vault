# Task 05：聊天侧工具循环与状态机

日期：2026-04-19

## 目标

把 AI 工具真正接到聊天流程里，形成完整的一轮工具调用闭环。

## 这个 Task 要做什么

- 在 `useChat` 暴露 tool-call 事件。
- 在 `BChat` 接入：
  - tool-call 监听
  - 工具执行
  - tool result 暂存
  - 下一轮模型继续生成
- 在 `BChatSidebar` 注入：
  - 内置工具集合
  - 当前 editor context
  - 确认适配器
- 增加最小状态管理：
  - `idle`
  - `streaming_text`
  - `executing_tool`
  - `awaiting_tool_confirmation`
  - `resuming_after_tool`
  - `completed`
  - `failed`
  - `aborted`
- 增加重复 `toolCallId` 防护。
- 增加 abort 行为处理。
- 增加 provider capability gating。

## 修改范围

- `src/hooks/useChat.ts`
- `src/ai/tools/stream.ts`
- `src/components/BChat/types.ts`
- `src/components/BChat/index.vue`
- `src/components/BChatSidebar/index.vue`
- `test/ai/tools/stream.test.ts`

## 完成标准

- 聊天可以执行只读工具并继续回复。
- 聊天可以在确认后执行写工具并继续回复。
- 同一个 `toolCallId` 不会重复执行写操作。
- 用户中止本轮生成后，不会继续下一轮工具请求。
- 不支持 native tools 的 provider 不进入工具流程。

## 验收

- `pnpm test test/ai/tools/stream.test.ts`
- `pnpm build`
- 手工验证：
  - `总结当前文档`
  - `把我选中的文字改得更简洁`
  - 取消写入
  - 确认写入
  - 停止生成

## 不包括

- 不做工具调用历史持久化。
- 不做调试时间线界面。

## 2026-04-19 更新

- `useChat` 已能把 tool-call 事件抛给 renderer，`BChat` 也已接好执行、回注和第二轮续流。
- 已加入 provider capability gating，未验证的 provider 不会进入工具调用流程。
- 聊天侧默认只暴露低风险工具：`read_current_document`、`get_current_selection`、`search_current_document` 和 `insert_at_cursor`。
- `replace_selection` 和 `replace_document` 保留在内置工具能力中，但暂不作为聊天侧默认开放范围。
