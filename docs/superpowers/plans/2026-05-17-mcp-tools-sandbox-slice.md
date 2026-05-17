# MCP Tools Sandbox Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first testable MCP wiring slice so persisted MCP settings flow into chat requests and main-process filtering has a stable boundary for the sandbox runtime.

**Architecture:** Reuse `src/shared/storage/tool-settings/types.ts` as the single MCP configuration source. Extend the Pinia tool settings store and chat stream request payload, then add a small main-process MCP assembly module that filters discovered tools by enabled server, server allowlist, and request-level tool selectors.

**Tech Stack:** Vue 3, Pinia, TypeScript, Electron main process modules, Vitest.

---

### Task 1: Store And Request Payload

**Files:**
- Modify: `src/stores/toolSettings.ts`
- Modify: `src/components/BChatSidebar/hooks/useChatStream.ts`
- Modify: `types/ai.d.ts`
- Test: `test/stores/toolSettings.test.ts`
- Test: `test/useChatStream.test.ts`

- [ ] **Step 1: Write failing store tests**

Add tests proving the store exposes `mcp`, derives enabled servers, updates invocation defaults, and persists MCP changes through `toolSettingsStorage`.

- [ ] **Step 2: Run store tests and verify failure**

Run: `pnpm test test/stores/toolSettings.test.ts`
Expected: FAIL because `store.mcp` and MCP actions do not exist yet.

- [ ] **Step 3: Implement store MCP state and actions**

Extend `ToolSettingsStoreState` with `mcp: MCPToolSettings`, initialize it from storage, and add `hasEnabledMcpServers`, `getMcpServerById`, `addMcpServer`, `updateMcpServer`, `removeMcpServer`, and `updateMcpInvocationDefaults`.

- [ ] **Step 4: Write failing request payload test**

Add a `useChatStream` test proving `agent.stream()` receives `mcp` with enabled server IDs, enabled tools, and tool instructions from the store.

- [ ] **Step 5: Run request payload test and verify failure**

Run: `pnpm test test/useChatStream.test.ts -t "passes MCP invocation defaults"`
Expected: FAIL because chat requests do not send `mcp`.

- [ ] **Step 6: Implement request payload wiring**

Add `AIMCPRequestConfig` to shared AI request typing and pass `toolSettingsStore.mcp.invocationDefaults` as `mcp` in `agent.stream()`.

### Task 2: Main-Process MCP Filtering Boundary

**Files:**
- Create: `electron/main/modules/ai/mcp-tools.mts`
- Test: `test/electron/mcp-tools.test.ts`

- [ ] **Step 1: Write failing filtering tests**

Add tests for no config, disabled server, empty command, server `toolAllowlist`, request `enabledTools`, and same-name tools on different servers.

- [ ] **Step 2: Run filtering tests and verify failure**

Run: `pnpm test test/electron/mcp-tools.test.ts`
Expected: FAIL because `mcp-tools.mts` does not exist.

- [ ] **Step 3: Implement filtering helpers**

Create pure exported helpers that accept normalized `MCPToolSettings`, request `AIMCPRequestConfig`, and discovered tool snapshots, returning the final server-scoped exposed tools.

- [ ] **Step 4: Run filtering tests and verify pass**

Run: `pnpm test test/electron/mcp-tools.test.ts`
Expected: PASS.

### Task 3: Documentation And Verification

**Files:**
- Modify: `changelog/2026-05-17.md`

- [ ] **Step 1: Add changelog entry**

Record the MCP wiring slice under `Changed`.

- [ ] **Step 2: Run focused verification**

Run: `pnpm test test/stores/toolSettings.test.ts test/useChatStream.test.ts test/electron/mcp-tools.test.ts`
Expected: PASS.
