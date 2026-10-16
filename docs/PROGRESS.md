# Execution ledger

## 2026-10-16 v1.1 follow-up

- User requested reassessment/plan, then authorized implementation with “继续”. Implemented inline, without subagents, git publication or deployment.
- Held-pointer interaction replaces hover-follow; real desktop and CDP-touch tests cover non-origin grabbing, rotation, cancellation and full-shape bounds.
- Exhaustive lazy move generator preserves findMove ordering. Hints rank and round-robin piece variants with candidate counts. Workers isolate calculation and stale requests are discarded.
- Explicit modes and four-player diagonal teams; per-color bonuses sum by team, single-member resignation preserves teammate. V2 replay and local bot seat restoration retain V1 compatibility.
- Ready removed throughout room protocol, UI and tests. Host starts full/online rooms, with optional bot seats in waiting empty slots.
- Standard strategy includes expansion, local free space, allied frontier protection and enemy routes; three-player public green considers the current controller's main color.
- Browser module workers and bounded two-thread server pool; cancellation epochs reject pre-disconnect results even after reconnect; hard timeout/crash falls back legally.
- Local bot undo/restore/full-game and real-worker online teams/rematch passed. Two fixed-seed 40-game duo benchmarks and 12-game mode benchmarks completed; report actual mode-specific evidence in VERIFICATION.json. These compare to the weak deterministic legacy baseline, not humans.
- Current acceptance uses actual HTTP origins, CSP and native storage; the original about:blank bridge limitation below is historical. The legacy Python suite is optional and was not run in this host's Python environment.
- Physical Android/iOS and production domain/TLS/CDN acceptance remain unperformed. No independent review is claimed. Original V1 ledger follows.

## Historical V1 work
- Repository inspected via connected GitHub tool: empty; initialized main with README (b3588207512e622ca4614fb1c4c05714752faac5).
- Container cannot resolve github.com or registry.npmjs.org. Authorized GitHub writes will use the connector; local work is isolated under /mnt/data/djq.
- Ruling: use native ES modules, Node HTTP and SSE, no dependencies. Cost: not the earlier Vue/TypeScript suggestion; migration remains possible because rules are isolated.
- Ruling: user explicitly requests uninterrupted implementation and delegates undefined choices; specifications and tests replace interactive approval checkpoints.
- Pre-flight: rules produce newGame/applyMove/findMove/replay; rooms consume these; HTTP wraps rooms; browser consumes the same rule module and versioned room snapshots.

- Task 1 complete: 13 rules tests pass; Task 2 complete: 10 room tests pass.

- Task 3 complete: real HTTP/SSE and security-boundary tests implemented; native suite now 38/38 passing.
- Task 4 complete: Chinese responsive local/online UI, replay and accessible controls implemented; Chromium browser suite 9/9 passing using the documented in-memory bridge.
- Task 5 complete: rules/API/deployment/testing/release documentation, dependency-free packaging and distribution smoke checks completed.
- Final review: self-review (no subagent tool or independent reviewer available).
- Final fixed: obsolete stream cleanup could abort a new session - stream generation regression RED to GREEN.
- Final fixed: unrelated resignation reset another seat's deadline - room deadline regression RED to GREEN.
- Final fixed: disconnected waiting host retained an unusable seat - 120-second reclamation and host-transfer regressions RED to GREEN.
- Final fixed: mobile confirmation was below the piece tray - fixed action dock browser regression RED to GREEN.
- Final fixed: Enter on a focused button was intercepted by the board - keyboard regression RED to GREEN.
- Final fixed: home inventory badge said per-player despite two-color ownership - corrected to per-color; browser regression RED to GREEN.
- Ruling: installed Chromium blocks URL navigation; policy left unchanged. Actual UI sources run in about:blank with a test-only HTTP bridge and emulated storage. Cost: direct-origin CSP/storage/TLS/reverse-proxy validation remains an operational acceptance step.
- Verification: npm run verify passed syntax/import checks, 38 native tests and build; browser suite passed 9 tests; built distribution served health, seven assets and room creation successfully. See VERIFICATION.json.
- No deferred functional defects in the selected V1 scope. Public deployment, account systems, durable state, ranking, spectator service and scalable multi-worker rooms are outside this release.
