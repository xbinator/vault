# HeaderTabs Context Menu Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `HeaderTabs` 的右键菜单同一时间只能打开一个，并且必须等待前一个关闭动画完成后，后一个才允许打开。

**Architecture:** 不修改 `BDropdown` 公共层，只在 `src/layouts/default/components/HeaderTabs.vue` 内部增加受控 `open` 状态、待打开队列和关闭冷却计时器。测试覆盖“只能同时打开一个”和“关闭动画完成后再打开下一项”两个核心行为。

**Tech Stack:** Vue 3 Composition API, Ant Design Vue Dropdown, Vitest, Vue Test Utils

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/layouts/default/components/HeaderTabs.vue` | 改：增加局部受控 dropdown 打开状态、关闭冷却锁和延迟切换逻辑 |
| `test/layouts/default/HeaderTabs.test.ts` | 改：补充右键菜单只能单开、等待关闭动画再开下一项的测试 |
| `changelog/2026-05-12.md` | 改：记录 HeaderTabs 右键菜单弹出行为收紧 |

## Scope Notes

- 只作用在 `HeaderTabs` 右键菜单，不修改公共 `BDropdown` / `BDropdownMenu`
- 保留当前 `HeaderTabs.vue` 的本地未提交菜单宽度改动
- 关闭动画等待时长使用组件内常量，不扩展为全局配置
