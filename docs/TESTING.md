# Test and verification reproduction

## Native tests and distribution

`npm run verify` runs syntax/import checks, all `tests/*.test.mjs` tests, then builds `dist/`. Node >=22; no dependency installation required. Browser suites are separate because Playwright/Chromium is optional.

Coverage includes piece inventory/area, all transforms, exhaustive search oracle, whole-shape bounds and grab offsets, teams/resignation, V1/V2 replay, private auth, start without ready, bot permissions, stale/duplicate/late results, disconnect epochs, timeouts, worker cancellation/crash, real workers, HTTP/SSE, recovery storage and stream races.

## Direct browser suites

Use an existing Node Playwright package and Chromium/Edge installation. If normally resolvable, run `npm run test:browser`. For an external installation on Windows:

```powershell
$env:DJQ_PLAYWRIGHT_MODULE = 'C:/path/to/node_modules/playwright'
$env:CHROMIUM_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
npm run test:browser
```

`tests/browser_gameplay.mjs`, `tests/browser_recovery.mjs`, `tests/browser_layout.mjs`, and `tests/browser_controls.mjs` start real local servers on ephemeral ports, with actual CSP, native storage, HTTP/SSE and module Workers. Current acceptance uses no bridge or emulated storage. Optional browser packages are not production dependencies.

The UI 2.0 layout suite checks nine real viewport sizes (1920×1080 through 360×800), full desktop three-column fit, square SVG bounds, selected-shape synchronization, actual export downloads, all local modes, invalid-move confirmation, keyboard focus, narrow landscape drawer/inert/focus wrapping, orientation changes, read-only replay and captured drag surviving an SSE presence update. See [UI 2.0 delivery](UI_V2.md) and [its verification report](UI_V2_VERIFICATION.json). Screenshots in `docs/screenshots/ui-v2/` are committed review artifacts; other screenshots/logs remain ignored under artifacts/.

The controls suite reproduces mouse-selection→Enter confirmation, T-key suggestions, disabled validation messages inside the confirm button, real-time history dialogs, package-matching title/version, and an intercepted real HTTP move held pending while repeated Enter is rejected. Native checks also enforce version metadata and title consistency with package.json.

It also checks drag-following mirror/check actions, touch activation, square equal-width portrait previews, stable scroll on selection (360/390/768px), controls before seats, separate auxiliary cards, and dismissible one-time results. Finished local/online games retain board inspection and export; only the online host can rematch. Native geometry covers floating actions near all four board corners.

Coverage: hover/held drag/tap rotation; multi-square non-origin grabbing; native Chromium CDP touch and cancellation rollback; bounds/flip/arrows; manual four-color opening; focused Enter; dark theme; hint cycling; local full bot game/undo/reload/rematch; 3/4 human online and neutral green; team game with 2 humans/2 bots; team resignation/rematch; safe/invalid V1 replay import; native recovery, browser restart, multi-tab Web Locks, and temporary failures. Screenshots: ignored `artifacts/browser/`.

The optional legacy `tests/browser_smoke.py` requires Python Playwright and a separately running server. V1.1 acceptance uses the Node suites, including equivalent keyboard/replay/mode paths. The historical about:blank bridge cannot verify module Workers/CSP and is not used for current acceptance.

## Strategy and concurrency benchmarks

```sh
node scripts/benchmark-bots.mjs --games 40 --seed 20261016 --mode duo --output artifacts/bots/duo.json
node scripts/benchmark-bots.mjs --games 40 --seed 73011 --mode duo --output artifacts/bots/duo-holdout.json
node scripts/benchmark-bots.mjs --games 12 --seed 20261016 --mode teams --output artifacts/bots/teams.json
node scripts/benchmark-bots.mjs --games 12 --seed 20261016 --mode classic --output artifacts/bots/classic.json
node scripts/benchmark-bots.mjs --games 12 --seed 20261016 --mode trio --output artifacts/bots/trio.json
node scripts/benchmark-rooms.mjs
```

Seeds affect near-ties only, so many games may share deterministic opening lines. These are controlled comparisons to the weak old deterministic baseline, not independent human-strength trials. The baseline chooses the first legal move with big-piece priority. Seats rotate; draws split a point among tied winners. Reports include scores, area and evaluation p50/p95/max. Online queue/cold worker startup/network timings are separate. The room benchmark reports health-request and bot-broadcast timings across 12 rooms sharing two real threads.

## Remaining acceptance

Chromium touch simulation is not physical Android or iOS Safari. Check grabbing every solid region, holes, short tap, four edges, scrolling outside board, dock confirmation, orientation changes and cancellation/multiple fingers on actual devices. Record device/browser and outcomes. Repeat bot/team/recovery flows through actual HTTPS/reverse proxy/CDN. Local validation does not deploy or verify production infrastructure.
