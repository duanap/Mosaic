# DJQ v1.1 Spec

## Scope and architecture

20×20 Blokus-style board, four independent 21-piece inventories, 2/3/4 human/bot seats, same-device and online play, Chinese light/dark SVG UI, validated local saves and replay, and authoritative Node HTTP/SSE rooms. Node >=22; zero npm runtime dependencies. No accounts, database, ranking, external AI service or multi-process shared rooms.

See the [development design](superpowers/specs/2026-10-16-playability-and-bots-design.md) and [plan](superpowers/plans/2026-10-16-playability-and-bots.md) for task mapping and execution notes.

## Rules and modes

Colors blue/yellow/red/green start at (0,0)/(19,0)/(19,19)/(0,19). Each has all 21 free polyominoes of sizes 1–5, totaling 89 squares. Four rotations and reflection are supported, with identical variants removed. First move covers the start corner; later moves need an own-color diagonal, no own-color edge contact, overlap or boundary violation. Internal edges of a single shape are allowed. Teammate colors cannot supply the own-color connection.

Modes: duo=2 seats, opposite colors [blue,red] versus [yellow,green]; trio=3 seats, public green alternates P1/P2/P3 and is not scored; classic=4 independent seats; teams=4 seats, P1/P3 versus P2/P4. Explicit mode/count mismatch is rejected; omitted mode preserves legacy behavior. Turn order remains blue/yellow/red/green.

No voluntary pass. A color with no legal move is permanently blocked; that search is exhaustive and never limited by strategy budgets. A stopped primary color does not prevent a three-player seat from controlling public green; a resigned seat is excluded.

Simple scoring is negative remaining area. Bonus adds +15 for a whole inventory and another +5 for monomino last. Score per color, then sum per owner/team; ties share victory. In teams one resigned member stops their colors, their teammate continues, and remaining-area penalties still count. A wholly resigned team forfeits; other modes finish when only one non-resigned seat remains.

## Placement and hints

Selecting a tray piece creates a full board preview. Only held pointer movement at least 8 CSS px starts dragging. The grabbed solid cell retains its offset; holes do not hit. Hover never moves a shape. Short release rotates 90° clockwise around the clicked cell; drag release fixes the preview without committing. Flip buttons/F remain. Rotations, flips, arrows and drags clamp origin by full transformed width/height. Invalid contact/overlap shows a complete red preview with confirmation disabled. Confirm/Enter is the only commit.

Pointer identity/capture isolate a second finger. Cancellation, lost capture or window blur restores the pre-drag position. A new revision cancels old input; same-revision presence renders wait until the gesture ends. Native button focus keeps its Enter behavior.

Hint workers enumerate all legal placements and variants. Area groups descend 5→1; each group round-robins piece types before remaining placements. Positions within a piece are ranked by strategy and stable coordinates. A full cycle has no duplicate occupied-cell placement; UI shows i/N or the only candidate. Board/replay/round changes invalidate candidates; old responses cannot override a new position or manual interaction. Hints require confirmation.

## Robots

Standard heuristic strategy values area, local free space, new legal connections, early expansion, enemy routes and allied connection preservation. Duo/teams share allied interests; trio public green protects the current controller's primary color. It is not an optimal solver.

Browser analysis uses module Web Workers. Online bots use a reusable pool of two worker_threads, one task per room and at most 100 jobs by default. Evaluation budget is 400ms, hard timeout 1000ms; failure falls back to a legal move. Results must match room instance/round/revision/turn/controller/configuration/epoch. Cancellation stops work. All-human disconnection pauses bots; their moves never refresh human inactivity retention.

Local restores validate history and seats before scheduling. Undo removes the most recent human action and subsequent bots, cancelling old work. Read-only replay never starts robots.

## Online lifecycle and compatibility

Host chooses mode/scoring and 30/60/90/120-second turns. No readiness fields or ready command. Full seats plus connected humans allow host-start; host may add bots to waiting empty seats or remove bots. Never replace a human or promote a bot to host. Rematch returns to waiting, retaining configuration and current seats, freeing departed humans.

Private 256-bit bearer tokens and authenticated fetch/SSE remain. Commands require round/revision; snapshots have a separate room version. Human disconnection caps the deadline at 45s without extending the original limit. Stale/duplicate intents cannot commit twice.

V2 saves/replays include mode, sanitized seat types and human/bot/timeout sources; V1 stays readable. Restore executes validated history, never imported board snapshots. Online rooms disappear on reboot. Waiting disconnected humans expire after 120s; rooms expire after 15m without human connection/activity, after 30m waiting inactivity or finish, and always after 8h. Bots cannot keep rooms alive.

## Verification

Native rules/room/HTTP/client/worker tests; direct-origin browser mouse/CDP touch, local full bot game, online real-worker teams, legacy replay and native recovery. Mode-specific benchmarks rotate seats against the old first-legal-move strategy. Physical Android/iOS, production HTTPS/CDN and large-scale load remain acceptance checks. See TESTING.md and VERIFICATION.json for actual evidence.
