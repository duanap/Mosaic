# Verification and test reproduction

## Native suite

`npm run verify` runs syntax/import checks, all Node tests, and distribution generation. Tests use node:test and built-in HTTP/fetch. No npm dependency install, cloud CI or paid service is required. The suite covers rules, rooms, request security, actual HTTP/SSE integration, and client stream-lifecycle races.

Important cases: exact 21-piece inventory and 89-cell conservation; unique rotations/reflections; boundary/overlap/edge/corner failures; separate-color ownership; neutral control; scoring and ties; full game termination; independent exhaustive move-search oracle; stale round/revision rejection; private tokens; waiting-seat reclamation; disconnect deadlines; timeout moves; real SSE snapshots; malformed JSON, large bodies and request limits; old stream cleanup isolation.

Seat recovery regressions also cover persistent storage, legacy session migration, multiple saved seats, per-seat cleanup, expired/malformed records, storage denial, transient failures, and preserving shared recovery on stream replacement.

## Browser suite

For the direct-browser seat recovery suite, make the optional Node `playwright` package and Chromium available, then run `node --test tests/browser_recovery.mjs`. `CHROMIUM_PATH` may point to an installed Chromium/Edge executable; `DJQ_PLAYWRIGHT_MODULE` may point to an existing Playwright package directory. The test starts its own local server on an ephemeral loopback port. It checks actual localStorage/sessionStorage, closing/reopening tabs, restarting the browser process, resuming an active game, explicit recovery without automatic takeover (including copied tab credentials, with and without Web Locks), separate seats in one browser, safe recovery labels, temporary API failures, invalid-room cleanup, the repository link, and mobile layout. It writes `artifacts/browser/recovery-mobile.png` and needs no production server or browser bridge.

With Python Playwright and Chromium available, start the server and run:

```sh
python tests/browser_smoke.py
```

Set CHROMIUM_PATH if Chromium is not on PATH. DJQ_BASE_URL defaults to http://127.0.0.1:3000. Screenshot output defaults to artifacts/browser, ignored by Git. Browser tests cover local move/undo/reload, mobile layout and fixed action dock, keyboard operation, online 2/3/4-player turns, reconnect/rematch, safe replay import, and a complete local game.

This development container's installed Chromium blocks all URL navigation by policy. The policy was left unchanged. The browser suite was run using the included in-memory harness:

```sh
DJQ_BROWSER_BRIDGE=1 python tests/browser_smoke.py
```

This renders the actual local HTML/CSS/application JavaScript in Chromium's about:blank and relays its fetch and SSE calls to the real Node server through Python/httpx. Browser storage is emulated for reload testing in this opaque origin. It verifies actual UI flows and real HTTP/SSE messages, but does NOT verify direct browser navigation, browser-enforced CSP/same-origin behavior, real storage quotas, TLS or a production reverse proxy. The native HTTP tests independently verify security header values and origin rejection. Run the direct suite and the deployment checklist on the real hostname for those remaining environment-specific checks.

The harness is test-only and is not imported by the production app. It requires the optional Python packages playwright and httpx. No browser driver or third-party package is copied into the repository.
