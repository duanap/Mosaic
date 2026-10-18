# Performance work, stage 1 — 2026-10-18

Implemented against local `40a407d` (`main`), which differs from the audit's `fde8f5d`. This is the rendering and snapshot-deduplication phase of the proposed v1.2 work. Package/release version remains 1.1.0 until the release scope is complete.

## Delivered

- Match/replay screens mount once per view transition. The board SVG, grid, preview/frontier containers, inventory buttons, selection panel and confirmation button survive ordinary state updates, moves, undo and rematches.
- Placed tiles/start markers/last-move highlights update on position changes. Revision and room/round identity invalidate online positions; local game identity also handles undo, restored games and rematches with reused revision numbers.
- Player/score/team markup updates on position, name, seat or presence changes. Local connection status has its own region. Countdown changes only its text/style.
- Preview shapes, inventory orientations, frontier markers and hint-button contents use cached inputs. Stationary previews and pointer movement no longer rebuild inventory shapes; selecting another piece resets the previous tray orientation.
- Existing delegated pointer/touch handling, drag deferral, keyboard focus and landscape drawer behavior remain. Closing a drawer also clears inert state. Board sizing reuses its ResizeObserver until the frame is replaced.
- RoomClient accepts strictly newer nonnegative integer versions, filtering duplicate HTTP/SSE responses. Room `emit()` increments version before broadcasting, including presence changes. Timestamp-only duplicates do not trigger onState; attaching a seat resets the version gate.

The home view and setup dialogs retain their existing rendering path. This phase adds no runtime dependencies or framework.

## Verification

- `npm run verify`: syntax/import checks, **72 native tests**, distribution build.
- `npm run test:browser`: **40 tests** using real local HTTP/SSE, native storage and module workers in installed Edge/Chromium.
- New assertions check retained board/grid/inventory/confirmation nodes, zero placed-tile mutations during selection/transforms/theme changes, genuine updates on moves/undo, selection attributes, and board retention after an SSE presence update and drag completion.
- Existing acceptance covers touch compatibility-click suppression, pending online confirmation, local bots, recovery, replay, responsive layouts and drawer focus/inert handling. Desktop midgame screenshot inspected after the change.

Use the Playwright and Chromium environment settings documented in [TESTING.md](TESTING.md). The optional comparison script is:

```sh
node scripts/benchmark-rendering.mjs 40a407d
```

It intercepts only baseline `app.mjs` and `game-ui.mjs` from that Git revision; current/baseline use the same rules and local server. For desktop 1366×768 and portrait 390×844, it restores fixed games after 0/32/52 moves, warms up 12 transforms, then measures 80 alternating rotations/flips with Chromium CPU throttled 4×. JSON output is saved under ignored `artifacts/rendering/benchmark.json`. It records handler p50/p95/total milliseconds, DOM mutation records, board replacements and retained nodes. Timing is observational rather than a flaky test threshold.

Recorded on 2026-10-18 with Node 22.23.3 and Edge/Chromium 155.0.4283.45, comparing baseline `40a407dd4447fa24a8f95ee1014a2ab9e865d932` with the stage-1 working tree:

| Viewport | Moves | Total before → after (ms / 80 actions) | P95 before → after (ms) |
| --- | ---: | ---: | ---: |
| 1366×768 | 0 | 1517 → 430 | 24.5 → 7.4 |
| 1366×768 | 32 | 1679 → 248 | 24.6 → 4.8 |
| 1366×768 | 52 | 1702 → 334 | 27.9 → 5.6 |
| 390×844 | 0 | 1492 → 419 | 23.8 → 7.4 |
| 390×844 | 32 | 1625 → 308 | 25.2 → 5.3 |
| 390×844 | 52 | 1899 → 329 | 30.2 → 6.1 |

In all six comparisons, baseline replaced the board 80 times; current replaced it **zero** times and retained the original board and inventory button. Each row is one warmed run on this host, not a statistical guarantee across devices.

These are synthetic synchronous-handler measurements, not device FPS or physical Android/iOS latency. Production HTTPS/CDN and physical-device acceptance remain outstanding.

## Next phases

1. Progressive hint batches with diverse shapes and cancellation-safe cached continuation. Preserve exhaustive rule-level legal-move detection, all rotations/reflections and deduplication. Add opening/midgame/endgame timing coverage before changing the worker protocol.
2. Static-file conditional caching/304 and image format comparisons. Measure bytes and repeat-load behavior independently of game rendering.
3. Physical Android/iOS, long-running multiplayer sessions and production proxy/CDN acceptance.
