# DJQ V1 Spec

## Scope
Standard 20x20 Blokus-style rules, 2/3/4 human seats, same-device and online rooms, Chinese UI, light/dark theme, move preview/rotate/flip/confirm, legal hint, auto skip, scoring, rematch, replay export/import. No ranking, accounts, database, general-purpose AI or spectator service in V1.

## Rules and rulings
Colors are blue, yellow, red, green, in that order, with corners (0,0), (19,0), (19,19), (0,19). Each color has all 21 free polyominoes of sizes 1-5, totalling 89 squares. Tiles within the same piece share edges; edge prohibition applies only to separately placed same-color pieces. Each later placement needs a same-color diagonal contact, no same-color edge contact, no overlap, and no boundary violation. Once placed, pieces cannot move.
2 players own [blue,red] and [yellow,green]; 3 own blue/yellow/red and alternate neutral green P1/P2/P3. Primary-color elimination does not remove a seat from neutral control. A resigned seat is excluded. Green scoring is ignored. Neutral cursor advances only when green is played; an immobile green is permanently skipped.
A color with no legal move is permanently blocked: because opponents can only fill cells, legal possibilities cannot reappear. Voluntary passing is disallowed. A color running out of tiles is complete. Two-player colors block independently.
Scoring is selected before the game: simple negative remaining squares, or bonus (+15 when all used, an additional +5 if monomino last). Score each color first, then aggregate by seat; tied top scores share victory. Resigned seats cannot win; other seats continue playing.

## Local play
No time limit. Store a validated action log locally, replay it on restore (never trust stored board snapshots). Undo is local only. Replay exports omit session credentials and may be imported read-only. Pause any local game while an imported replay is viewed.

## Online play
Host chooses 2/3/4 seats, scoring, 30/60/90/120 second turns. Defaults: 4 seats, bonus, 90 seconds. Six-character random nonambiguous invitation code. Host and all connected seats must be ready before starting. Full state is public within a room; tokens are private. POST commands require a random 256-bit seat bearer token; live updates use authenticated fetch/SSE, not a query-string secret.
Commands carry the current game revision to reject stale double clicks and multiple tabs. Server validates shape/orientation/position/controller. On deadline the server chooses a deterministic legal move (not optimal AI). Disconnected current controllers get 45 seconds recovery grace, capped by the original turn deadline; reconnect never extends a deadline. Ended or abandoned rooms expire after a documented retention; no disk state survives a process restart. Waiting seats can leave; active departure is resignation. Host can reopen a finished room, resetting readiness, and start a rematch after everyone is ready.
Per-process room/player limits, request/body/rate/stream limits, same-origin writes, no cache on API, CSP, safe static paths, no tokens in logs/snapshots.

## Implementation decisions
HTTP + SSE instead of WebSocket: turn-based commands do not need bidirectional high-rate traffic, and native HTTP avoids package downloads and custom WebSocket framing. JavaScript ES modules with JSDoc contracts, runtime validation and native node:test instead of the previously suggested Vue/TypeScript/Vite stack: this first version is directly runnable with Node 22+, with no build-time dependency. These are V1 engineering choices, not claims about official game rules.
