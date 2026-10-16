# V1.1.0 - 2026-10-16

## Changes

- Held drag replaces mouse-follow. Grab any solid square; short tap rotates around it. Whole-piece bounds apply to drag, arrows, rotation and flip. Release fixes preview, explicit confirmation commits; cancelled touch restores its origin.
- Hints cycle unique legal placements, prioritize larger pieces, round-robin same-size shapes and include rotation/reflection, with candidate counts.
- Four-player teams pair blue/red versus yellow/green and sum team scores. Each person retains their color. One resignation does not end the teammate's play.
- Ready removed. Full rooms with connected humans start directly by host. Waiting empty seats can hold standard bots without token/event connections.
- Standard position-aware bots run locally and online. Module Web Workers and a bounded server pool keep analysis off UI/request threads. Cancellation and instance/round/revision/epoch checks reject stale output. Bots cannot become host or keep abandoned rooms alive.
- Local bot undo returns to the preceding human decision. V2 replays preserve mode/seat/source; V1 saves/replays remain readable.
- Zero runtime npm dependencies. Refresh client/server together: the old ready protocol was removed. No production deployment performed.

## Current verification boundary

Native and real-origin Edge/Chromium browser suites cover actual HTTP/SSE, native storage, module workers, mouse/touch, legacy replay, teams and bots. Controlled bot benchmarks and a 12-room/two-worker concurrency exercise are recorded in VERIFICATION.json. Physical Android/iOS Safari, production TLS/CDN and large-scale load remain unverified. Author self-review; no independent review claimed.

# V1.0.0 - 2026-10-14 (historical)

## Delivered scope
2/3/4-player rules and Chinese responsive UI; local play, undo, restore and validated JSON replay; online room lifecycle, authenticated state streams, turn clocks, deterministic timeout moves, reconnect, resignation and rematch. Node 22+, zero npm dependencies, MIT project source. No account, database, ranking, multiplayer spectator service or general-purpose AI.

## Engineering decisions
- Native ES modules and HTTP/SSE replace the earlier suggested Vue/TypeScript/WebSocket stack. This keeps the first delivery directly executable and testable without external dependencies. The rule module remains isolated for future UI migration.
- Neutral green remains human-controlled in three-player games; blocked primary colors do not lose neutral control. Resignation removes that seat from the neutral cycle.
- Bonus scoring is per color before owner aggregation. Ties share victory. Only genuine absence of a legal move permits an automatic skip.
- Online commands use both round and revision; stale snapshots use a monotonic room version. Seat tokens are not included in invite links, URLs, snapshots or replays.
- Current-seat disconnect grace is capped by the existing deadline. Other seats leaving cannot reset that clock. Waiting disconnected seats are reclaimed after 120 seconds.
- One authoritative process stores rooms in memory. Restarts discard online rooms. No existing cloud service was modified or deployed.

## Review and verification boundaries
Author self-review was performed; no independent reviewer or subagent was available. Review found and fixed client stream generation cleanup, stale turn-deadline extension, abandoned waiting-host seats, mobile confirmation reachability and focused-button Enter handling, with regression tests.

Native tests exercise real HTTP/SSE and security headers. Browser UI tests use the actual production sources with the documented in-memory HTTP bridge because this container blocks browser URL navigation by policy. The policy was left unchanged. Direct browser-origin security, native storage behavior, HTTPS and real reverse-proxy acceptance remain deployment checks, not claimed completed work. See TESTING.md and the generated verification report for exact executed counts.

## Operations
Use a single Node process behind the supplied Nginx/systemd examples. The room cap is 100 per process. This is a tested small-room V1, not a load-tested large-scale competitive service. No GitHub Actions workflow or paid service is included.
