# Task 02：编辑器上下文与只读工具

日期：2026-04-19

## 目标

让 AI 可以读取当前编辑器上下文，但不会写入文档。

## 这个 Task 要做什么

- 建立 active editor context registry。
- 约定上下文结构包含：
  - 当前文档标识、标题、路径
  - `getContent()`
  - `getSelection()`
  - 编辑器读写入口占位
- 实现只读工具：
  - `read_current_document`
  - `get_current_selection`
  - `search_current_document`
- 处理空选区和空搜索关键词等边界情况。
- 增加内置只读工具注册导出。

## 修改范围

- `src/ai/tools/editor-context.ts`
- `src/ai/tools/builtin/read.ts`
- `src/ai/tools/builtin/index.ts`
- `test/ai/tools/editor-context.test.ts`
- `test/ai/tools/builtin-read.test.ts`

## 完成标准

- 没有 active context 时能返回明确失败。
- `get_current_selection` 在无选区时返回空选区结构，而不是抛错。
- `search_current_document` 对空关键词返回 `INVALID_INPUT`。
- 搜索结果有数量上限和预览截断逻辑。

## 验收

- `pnpm test test/ai/tools/editor-context.test.ts test/ai/tools/builtin-read.test.ts`

## 不包括

- 不实现写工具。
- 不改聊天 UI。
- 不改 Electron IPC。
