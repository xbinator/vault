# AI Tools File Protocol Design

## Background

The current AI tool layer has already shifted from editor-state writing tools toward file-level tools. `read_file`, `edit_file`, and `write_file` now form the beginning of a more stable protocol, but the shared state, error handling, and result structures are still partially embedded inside `src/ai/tools/builtin/index.ts`.

This design defines the next target shape for the tool layer so future work can keep the boundary between tool execution, shared file state, and exposure policy clear.

## Goals

- Keep `src/ai/tools/builtin` focused on executable tool implementations only.
- Formalize `read_file`, `read_directory`, `edit_file`, and `write_file` as a coherent file-level protocol.
- Move shared file snapshot logic out of `src/ai/tools/builtin/index.ts`.
- Standardize file-tool input, output, and error semantics.
- Make confirmation cards and tests consume stable structured data instead of ad hoc fields.

## Non-Goals

- Reintroducing editor-state write tools such as cursor insertion or selection replacement.
- Building a generic service or adapter framework for every AI tool category.
- Expanding file tools to multimodal file reading in this phase.

## Proposed Structure

### Tool implementation layer

`src/ai/tools/builtin` should contain executable tool modules only.

```text
src/ai/tools/builtin/
  index.ts
  askUserChoice/
    index.ts
  environment/
    index.ts
  fileEdit/
    index.ts
    types.ts
  fileRead/
    index.ts
    types.ts
  fileWrite/
    index.ts
    types.ts
  logs/
    index.ts
  read/
    index.ts
  settings/
    index.ts
```

### Shared protocol layer

Cross-tool file protocol logic should move to a shared layer.

```text
src/ai/tools/shared/
  fileErrors.ts
  fileState.ts
  fileTypes.ts
  pathUtils.ts
```

### Policy and exposure layer

Modules that decide what tools are exposed should remain outside `builtin`.

```text
src/ai/tools/
  builtinCatalog.ts
  policy.ts
```

## Responsibilities

### `src/ai/tools/builtin/index.ts`

- Assemble builtin tool executors.
- Create and inject shared file-state dependencies.
- Avoid embedding file snapshot maps or file-protocol logic directly.

### `src/ai/tools/builtin/fileRead/index.ts`

- Validate `read_file` and `read_directory` inputs.
- Resolve and normalize paths.
- Read file or directory content.
- Record read snapshots through the shared file-state store.

### `src/ai/tools/builtin/fileEdit/index.ts`

- Validate `edit_file` inputs.
- Require a complete prior `read_file` snapshot.
- Reject stale writes when file content changed after the read.
- Perform exact string replacement.
- Return structured preview data for confirmation and chat display.

### `src/ai/tools/builtin/fileWrite/index.ts`

- Validate `write_file` inputs.
- Allow direct writes for new files.
- Require a complete prior `read_file` snapshot for overwriting existing files.
- Reject stale writes when file content changed after the read.
- Return structured preview data for confirmation and chat display.

### `src/ai/tools/shared/fileState.ts`

- Own file read snapshot storage and access rules.
- Provide reusable guard functions for read-before-write and stale-content checks.
- Keep the concern limited to snapshot state rather than filesystem IO.

### `src/ai/tools/shared/fileErrors.ts`

- Define canonical file-tool error codes.
- Provide shared constructors or helpers for file-tool failures.

### `src/ai/tools/shared/fileTypes.ts`

- Define shared file-tool types used across `fileRead`, `fileEdit`, and `fileWrite`.

### `src/ai/tools/shared/pathUtils.ts`

- Normalize file paths consistently.
- Centralize workspace-relative and absolute path rules when shared by multiple file tools.

## Shared Interfaces

### File state types

```ts
/**
 * File read range metadata.
 */
export interface FileReadRange {
  offset: number
  limit?: number
}

/**
 * Snapshot captured from a successful read_file call.
 */
export interface FileReadSnapshot {
  path: string
  content: string
  isPartial: boolean
  readAt: number
}
```

### File state store

```ts
/**
 * Shared file snapshot storage interface.
 */
export interface FileStateStore {
  getSnapshot(path: string): FileReadSnapshot | null
  setSnapshot(snapshot: FileReadSnapshot): void
  clearSnapshot(path: string): void
}

/**
 * Creates a file snapshot store.
 */
export function createFileStateStore(): FileStateStore

/**
 * Requires that a file has been read before a write-like operation.
 */
export function requireReadSnapshot(
  store: FileStateStore,
  path: string
): FileReadSnapshot

/**
 * Requires that a file has been fully read before a write-like operation.
 */
export function requireFullReadSnapshot(
  store: FileStateStore,
  path: string
): FileReadSnapshot

/**
 * Requires that current file content still matches the read snapshot.
 */
export function requireFreshSnapshot(
  snapshot: FileReadSnapshot,
  currentContent: string
): void
```

## Tool Schemas

### `read_file`

```ts
export interface ReadFileInput {
  path: string
  offset?: number
  limit?: number
}

export interface ReadFileOutput {
  path: string
  content: string
  offset: number
  lineCount: number
  hasMore: boolean
}
```

Design notes:

- `offset` is one-based.
- `limit` controls line count, not bytes.
- `read_file` stays focused on reading and snapshot generation only.

### `read_directory`

```ts
export interface ReadDirectoryInput {
  path: string
}

export interface ReadDirectoryEntry {
  name: string
  path: string
  kind: 'file' | 'directory'
}

export interface ReadDirectoryOutput {
  path: string
  entries: ReadDirectoryEntry[]
}
```

### `edit_file`

```ts
export interface EditFileInput {
  path: string
  oldString: string
  newString: string
  replaceAll?: boolean
}

export interface EditFileOutput {
  path: string
  changed: boolean
  replaceAll: boolean
  matchCount: number
  beforePreview: string
  afterPreview: string
}
```

Validation rules:

- `oldString` must not be empty.
- `oldString` and `newString` must not be identical.
- If multiple matches exist and `replaceAll` is not true, fail with `match_not_unique`.

### `write_file`

```ts
export interface WriteFileInput {
  path: string
  content: string
}

export interface WriteFileOutput {
  path: string
  created: boolean
  changed: boolean
  beforePreview: string | null
  afterPreview: string
}
```

Design notes:

- `write_file` always expresses final full-file content.
- It should not absorb partial-edit semantics.

## Result Model

File tools should return consistent structured results so runtime, UI, and tests can all rely on the same shape.

### Success

```ts
export interface FileToolSuccess<TPayload> {
  ok: true
  tool: 'read_file' | 'read_directory' | 'edit_file' | 'write_file'
  summary: string
  payload: TPayload
}
```

### Failure

```ts
export type FileToolErrorCode =
  | 'file_not_read'
  | 'file_read_partial'
  | 'file_changed'
  | 'file_not_found'
  | 'match_not_found'
  | 'match_not_unique'
  | 'invalid_input'
  | 'permission_denied'

export interface FileToolFailure {
  ok: false
  tool: 'read_file' | 'read_directory' | 'edit_file' | 'write_file'
  code: FileToolErrorCode
  message: string
}
```

### Awaiting confirmation

```ts
export interface FileToolAwaitingConfirmation<TPayload> {
  ok: false
  awaitingConfirmation: true
  tool: 'edit_file' | 'write_file'
  summary: string
  payload: TPayload
}
```

## Confirmation Card Contract

Confirmation cards should be driven by `tool` and `payload` rather than tool-specific ad hoc parsing logic.

### `read_file`

- Show path, offset, line count, and whether more content remains.
- Show a truncated text preview only.

### `read_directory`

- Show path and entry count.
- Show a compact list of directory entries.

### `edit_file`

- Show path, match count, and whether `replaceAll` is enabled.
- Show before and after preview sections.
- Use the same preview payload for confirmation and chat rendering.

### `write_file`

- Show path plus whether the file is newly created.
- For new files, show only the after preview.
- For overwrites, show before and after preview sections.

## Error Handling

The UI should display the human-readable `message`, while tests and control flow should primarily depend on stable `code` values.

Recommended initial error codes:

- `file_not_read`
- `file_read_partial`
- `file_changed`
- `file_not_found`
- `match_not_found`
- `match_not_unique`
- `invalid_input`
- `permission_denied`

## Testing Strategy

Tests should align with the same protocol boundaries:

- `fileRead` tests assert snapshot creation and partial-read semantics.
- `fileEdit` tests assert read-before-write, stale-content checks, match validation, and preview output.
- `fileWrite` tests assert new-file writes, overwrite guards, stale-content checks, and preview output.
- Confirmation-card tests assert rendering from structured payloads rather than implementation-specific strings.

Recommended long-term test layout:

```text
test/ai/tools/builtin/
  fileRead.test.ts
  fileEdit.test.ts
  fileWrite.test.ts
```

## Migration Plan

1. Extract shared snapshot logic from `src/ai/tools/builtin/index.ts` into `src/ai/tools/shared/fileState.ts`.
2. Introduce canonical file-tool error codes in `src/ai/tools/shared/fileErrors.ts`.
3. Add `types.ts` beside `fileRead`, `fileEdit`, and `fileWrite` for module-local schemas.
4. Refactor confirmation-card logic to consume structured file-tool payloads consistently.
5. Normalize tests around the new shared protocol and reduce string-based assertions where possible.

## Risks

- Introducing too many abstractions too early could slow down iteration.
- Moving result structures without updating confirmation-card rendering could create UI drift.
- Existing read-file tests that still assume older editor-context behavior should be handled separately from this protocol refactor.

## Recommendation

Adopt the lightweight shared-layer approach first:

- Keep `builtin` as the executable tool layer.
- Move file snapshot and error protocol logic into `src/ai/tools/shared/`.
- Standardize file-tool schemas and results before adding more file operations.

This gives the tool system clearer boundaries without forcing a large architectural rewrite.
