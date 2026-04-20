# Task 06：集成验证与渐进开放

日期：2026-04-19

## 目标

把第一版 AI Tools 做成可验证、可回归、可谨慎开放的能力，而不是只停留在“代码写完”。

## 这个 Task 要做什么

- 整理 focused tests 与最终验收清单。
- 确认默认开放的工具范围。
- 明确是否将 `replace_document` 纳入 MVP。
- 补充 changelog 记录。
- 制定手工回归场景和发布前检查项。

## 修改范围

- `changelog/2026-04-18.md`
- 相关测试文件
- 必要时补少量说明文档

## 完成标准

- Focused tests 全部通过。
- 全量测试通过。
- 构建检查通过。
- Electron 手工验收通过。
- 默认开放工具集已明确。

## 验收

- `pnpm test test/ai/tools/results.test.ts test/ai/tools/editor-context.test.ts test/ai/tools/builtin-read.test.ts test/ai/tools/builtin-write.test.ts test/ai/tools/stream.test.ts`
- `pnpm test`
- `pnpm build`
- `pnpm run electron:build-main`
- `pnpm electron:dev`

## 发布建议

- 默认先开放只读工具和 `insert_at_cursor`。
- `replace_selection` 在确认流程稳定后开放。
- `replace_document` 最后再评估是否对模型默认开放。

## 不包括

- 不扩展到 MCP、自定义工具、Shell 或文件系统工具。
- 不实现工具时间线产品化界面。

## 2026-04-19 更新

已完成的部分：

- 新增 `test/ai/tools/policy.test.ts`，验证 provider 工具能力策略。
- 新增 `test/ai/tools/builtin-index.test.ts`，验证默认工具集暴露策略。
- 已执行通过 focused tests、`pnpm build` 和 `pnpm run electron:build-main`。
- 已确认聊天侧 MVP 默认开放范围为“只读 + insert_at_cursor”。

仍待完成的部分：

- `pnpm test`
- `pnpm electron:dev` 下通过真实用例做手工回归
- 根据联调结果决定 `replace_selection` 和 `replace_document` 的开放时机
