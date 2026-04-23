# Ask User Choice Remaining Work

> **Current branch:** `codex/ask-user-choice-tool`

## Completed

- Phase 1: Added `awaiting_user_input` as a terminal tool execution status.
- Phase 1: Added choice-question payload types and `createAwaitingUserInputResult()`.
- Phase 1: Tightened tool execution result typing into a discriminated union.
- Phase 2: Added the builtin `ask_user_choice` executor.
- Phase 2: Registered `ask_user_choice` in the default readonly builtin tool catalog.
- Phase 2: Added execution-time validation for pending-question conflicts, invalid modes, option limits, invalid options, `allowOther` defaulting, and `maxSelections` rules.
- Phase 2: Passed spec compliance review after the validation fixes.

## Remaining

- Finish Phase 2 code quality review before building on top of the current executor.
- Review whether `createBuiltinTools()` should receive a real pending-question provider instead of the temporary `getPendingQuestion: () => null` default wiring.
- Review whether `node:crypto` usage in builtin tool registration is safe for the target renderer/build environment, or replace it with an environment-safe UUID provider.
- Phase 3: Inject `toolCallId` into `awaiting_user_input` results in the stream execution path while keeping stream behavior terminal and non-blocking.
- Phase 4: Extend chat message/model conversion so user answers flow back through the existing tool result channel.
- Phase 5: Add the ask-user-choice interaction card with single choice, multiple choice, and optional manual input.
- Phase 6: Connect answer submission to pending-state clearing and next-round generation.
- Phase 7: Update final changelog entries and run the targeted AI tool and BChat regression suites.

## Suggested Next Step

Resume from Phase 2 code quality review. If it passes, continue with Phase 3 from `docs/superpowers/plans/2026-04-23-ask-user-choice-tool.md`; if it rejects, fix those findings before touching stream or UI code.
