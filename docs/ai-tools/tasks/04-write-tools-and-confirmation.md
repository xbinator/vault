# Task 04：写工具与确认流程

日期：2026-04-19

## 目标

在不牺牲安全边界的前提下，让 AI 可以对当前文档执行受控写入。

## 这个 Task 要做什么

- 定义确认适配层，例如 `AIToolConfirmationAdapter`。
- 实现写工具：
  - `insert_at_cursor`
  - `replace_selection`
  - `replace_document`
- 区分 `write` 与 `dangerous` 的确认强度。
- 写工具执行前重新读取最新上下文。
- 处理这些关键分支：
  - 无光标
  - 无选区
  - 选区已变更
  - 用户取消
  - 编辑器不可用

## 修改范围

- `src/ai/tools/confirmation.ts`
- `src/ai/tools/builtin/write.ts`
- `src/ai/tools/builtin/index.ts`
- `test/ai/tools/builtin-write.test.ts`

## 完成标准

- 所有写工具都必须先经过确认层。
- `replace_selection` 在选区失效时不会盲目覆盖。
- `replace_document` 有更强确认语义，且默认不一定进入公开工具集。
- 取消被视为正常结果，而不是异常。

## 验收

- `pnpm test test/ai/tools/builtin-write.test.ts test/ai/tools/builtin-read.test.ts`

## 不包括

- 不处理聊天状态机。
- 不处理 tool result 回注模型。
- 不决定最终 UI 视觉样式，只定义确认能力和数据结构。
