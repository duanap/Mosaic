# DJQ V1 Implementation Plan

Goal: a complete 2-4 player browser game, playable locally and through online rooms.
Architecture: shared deterministic ES-module rules, a dependency-free Node.js server, HTTP commands and authenticated fetch/SSE snapshots, an SVG browser client.
Spec: GAME_SPEC.md. Execution: continuous inline implementation as explicitly requested by the owner.

## Constraints
- Keep all four colors, correct 21-piece sets, diagonal own-color contacts only.
- Both local and online games, phone/desktop support; no account, database, Docker or CI.
- Server authority, optimistic version checks, private recovery tokens, bounded rooms and streams.
- Use no unverified third-party package copies. Container cannot resolve external package hosts; native modules make execution and verification reproducible.

## Tasks
1. Rules engine: test piece inventory, transforms, placement, skips, 2/3/4 control, scoring, replay and complete games; then implement shared/rules.mjs.
2. Rooms: test lifecycle, authorization, stale commands, timeout, reconnect and cleanup; then implement server/rooms.mjs.
3. HTTP/SSE: integration-test real requests, snapshots, credentials, malformed bodies, headers and file boundaries; implement server/index.mjs.
4. Browser: test full local and online journeys in Chromium; implement public/index.html, app.mjs and style.css, including accessible controls and mobile layouts.
5. Delivery: complete rules, protocol, deployment, build checks and release notes; audit and repeat all verification; commit and publish to the authorized repository.

## Review focus
Untrusted moves and replay imports; stale or competing tabs; a stopped primary color controlling neutral green; disconnected seats with no voluntary pass; small screens and position selection after transforms.
