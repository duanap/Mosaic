# Room API and protocol

All HTTP API responses are JSON except the event stream. Errors are `{ "error": "CODE" }`. POST requests require `Content-Type: application/json`, a maximum 8192-byte body, and same-origin requests when an Origin header is supplied. Use HTTPS in production.

Room codes are strings containing exactly six ASCII digits (`000000`–`999999`), generated with cryptographic randomness and retried on active-room collisions. Preserve leading zeros in URLs, snapshots and saved sessions; mobile joining uses a numeric keyboard. Alphanumeric codes and malformed invitation links are no longer accepted. Deploy client and server together; the service restart discards previous in-memory rooms as usual.

Room creation additionally accepts `boardSize: 20 | 14` (default 20). Size 14 requires `players: 2` / `mode: duo`; all four colors retain their full 21-piece inventory. Waiting snapshots and active game data include `boardSize`, preserved for rematches and bot jobs. V2 replay exports include `boardSize`; V1 and older V2 records without that field remain 20×20. Frontend selection, preview coordinates, exhaustive move search and worker evaluation use this size. Publish shared rules, browser modules and server together.

## Routes

| Method | Path | Authentication | Result |
| --- | --- | --- | --- |
| GET | /api/health | none | Health and application version |
| POST | /api/rooms | none | Create with name, players (2/3/4), mode (duo/trio/classic/teams), scoring (simple/bonus), turnSeconds (30/60/90/120) |
| POST | /api/rooms/:code/join | none | Join with name |
| GET | /api/rooms/:code | Bearer | Current personalized snapshot |
| GET | /api/rooms/:code/events | Bearer | Authenticated fetch/SSE stream |
| POST | /api/rooms/:code/commands | Bearer | Apply command and return snapshot |
| GET | /api/rooms/:code/replay | Bearer | Validated action history export |

Create/join returns `{token, seat, room}`. The current tab stores its selected seat in sessionStorage; localStorage keeps up to 20 recovery records for at most eight hours each, allowing explicit recovery after closing a tab/browser in the same browser profile and origin. Existing tab credentials are backed up on first use. New tabs display recovery buttons rather than automatically taking over another tab's connection. Multiple seats may be saved separately. Tokens are never rendered in the UI or placed in a URL, room snapshot, shared link, replay export, or server log. A token controls a seat, not an account; losing it does not grant recovery by nickname.

Voluntary leave and UNAUTHORIZED/ROOM_NOT_FOUND remove only the affected recovery record. Transient network failures preserve it; SESSION_REPLACED clears the old tab's selection but preserves the shared recovery record. Storage availability does not affect the ability to play. Recovery still requires a live server-side seat: waiting disconnected seats expire after 120 seconds, rooms without connections expire 15 minutes after their last human activity, and all rooms expire after eight hours or a server restart. Clearing site data or switching browser/device loses recovery access.

On HTTPS/localhost, Web Locks protect automatic reconnection from taking over a seat whose tab credentials were copied (for example by duplicating a tab). Explicit recovery may take over that lock and the server-side stream. The old tab disconnects when its lock is taken, even if the new page's subsequent connection fails; shared recovery credentials remain available for retry. Without Web Locks, automatic reconnection checks the seat's connection state first and requests manual recovery if it is still connected; a delayed disconnect may therefore require clicking the recovery button after a refresh.

## Commands

- `{"type":"start"}`: host only; every seat occupied, all human seats connected. No ready command or snapshot readiness fields; old ready commands return INVALID_COMMAND. Missing seats return ROOM_NOT_FULL, offline human seats PLAYER_OFFLINE.
- `{"type":"set-bot","seat":1,"level":"standard"}`: host only, waiting room, empty seat only. Creates a bot without token or event stream. No replacement of human seats.
- `{"type":"remove-bot","seat":1}`: host only, waiting room, bot seat only; frees it for a friend.
- `{"type":"move","round":1,"revision":0,"move":{"piece":"F5","orientation":0,"x":0,"y":0}}`: coordinates shown here illustrate the schema, not a guaranteed legal move. The server computes occupied cells from its own piece table.
- `{"type":"resign","round":1,"revision":5}`: stop the actor's colors and exclude them from the winner set.
- `{"type":"rematch"}`: finished room, host only; return to waiting, retain bot configuration and present human seats, free departed seats, then host starts when full/online.
- `{"type":"leave"}`: release waiting/finished seat, or resign an active seat and revoke the token.

Move/resign require the exact game revision AND room round number. The revision increments for successful moves or resignations. A separate monotonic room `version` orders snapshots, including presence changes; clients ignore older snapshots. A new round increments `round`, preventing an old opening command from replaying in a rematch.

Modes must match seat count: duo=2, trio=3, classic=4, teams=4. Omitted mode defaults to the legacy count-based mode. Teams are seats [0,2] versus [1,3]; each seat still owns one color. Snapshots include `mode` and player `kind: human | bot`; bots additionally have `level: standard` and connected=false. Bot seats do not require connection to start and cannot be authorized or promoted to host. Seat recovery remains human-only.

Replay exports are version 2, with `mode`, sanitized `seats` (kind/level only), and move `source: human | bot | timeout`; `automatic` is source != human. No tokens or listeners are serialized. The reader accepts v1 records, mapping old automatic moves to timeout and choosing the legacy mode by player count. History is validated by replaying legal intents, including controller and source/seat compatibility.

## SSE

Use fetch with an Authorization header, not EventSource with a token in its URL. The server sends `event: state` followed by a single JSON data line and a blank line. Every connection receives a full current snapshot; reconnecting does not require incremental replay. Heartbeats arrive every 15 seconds. Reconnect backoff is 0.5 to 8 seconds. One stream per seat; opening a second tab sends the first `event: fatal` with `SESSION_REPLACED`, stopping its retry loop. Client stream generations isolate old abort/finally handlers from new connections.

## Rulings and retention

No voluntary pass. Colors without a legal move are permanently blocked. Three-player neutral green rotates only after its actual moves; a player with a blocked primary color still controls green. Resigned players are excluded from neutral rotation. One remaining non-resigned player wins immediately outside teams. In teams a single resignation stops only that seat; a wholly resigned team loses, otherwise final color scores are added by team, including resigned colors' remaining penalties.

A timed-out turn receives the engine's first deterministic legal move, prioritizing large pieces. This is basic legal-move assistance, not a competitive AI. Current-controller disconnection caps the remaining deadline at 45 seconds; reconnect does not restore extra time. Unrelated resignations do not reset another player's clock.

Bot seats use a distinct position-aware strategy. A bounded pool of two worker_threads evaluates candidates with a 400ms budget and 1000ms hard timeout. Failed or timed-out analysis falls back to a legal move. Results must match room instance, round, revision, turn, controller, configuration generation and cancellation epoch. Expired, duplicate and pre-disconnect results are rejected. Only the server applies online bot moves; no bot token is issued. All humans disconnected pauses new bot jobs and cancels current ones; bot activity never refreshes lastHuman. Human timeout rules remain active. Removing a room or shutting down terminates its work.

Waiting disconnected seats are reclaimed after 120 seconds, and host ownership transfers. Rooms with no connections expire after 15 minutes without human activity; waiting and finished rooms expire after 30 minutes of inactivity / finish respectively. Every room has an 8-hour maximum lifetime. Service restart discards all rooms. Room count defaults to 100; no multi-process shared-state operation is supported.

## Limits

Per source IP: 240 API requests/minute and 12 create/join requests/10 minutes. Limit maps have at most 10,000 entries. At most 600 TCP connections and one event stream per seat. Slow SSE clients are disconnected when the write buffer exceeds 256 KiB. Body/header/request timeouts and private static-file allowlists constrain resource use. TRUST_PROXY is off by default; turn it on only behind your own proxy overwriting X-Real-IP.
