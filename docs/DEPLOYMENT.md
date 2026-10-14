# Deployment

## Local development (Windows / Linux / macOS)

Install Node.js 22 or newer. The application has zero npm runtime and development dependencies; `npm start` works directly after cloning. An npm install is optional, not required.

```sh
git clone https://github.com/duanap/djq.git
cd djq
npm start
```

Visit `http://127.0.0.1:3000/`. `npm run dev` restarts the Node server on source changes; refresh the browser after client edits. Restarting clears active rooms.

To let other devices on your trusted local network join:

```sh
# Linux/macOS
HOST=0.0.0.0 PORT=3000 npm start
```

```powershell
# Windows PowerShell
$env:HOST = '0.0.0.0'
$env:PORT = '3000'
npm start
```

Open `http://YOUR_LAN_IP:3000` from each device and allow that port in the host firewall for the trusted network. Use your configured LAN address, not localhost, on the other devices. Public deployments should use an HTTPS reverse proxy instead of exposing the Node port.

## Distribution

```sh
npm run verify
cd dist
npm start
```

The build step copies a self-contained distribution; it does not transpile, fetch CDN files or require a bundler. The original modular source stays readable. `node --env-file=.env server/index.mjs` loads a copied `.env.example`; plain `npm start` uses the process environment and does not read `.env` automatically.

## Linux server / existing panel

Use one Node process, bound to 127.0.0.1:3000, with your panel's process manager or `deploy/djq.service`. Set a real, dedicated hostname in Nginx and obtain/configure its TLS certificate in your normal panel workflow. A sample Nginx proxy configuration is in `deploy/nginx.conf`; it is not an already provisioned site.

Set the following environment values for an HTTPS site, replacing the example hostname:

```ini
HOST=127.0.0.1
PORT=3000
PUBLIC_ORIGIN=https://djq.example.com
TRUST_PROXY=1
```

PUBLIC_ORIGIN is the exact origin (scheme + hostname + optional port), without a trailing slash. Wrong origin settings cause ORIGIN_DENIED on writes. TRUST_PROXY=1 is suitable only when Nginx overwrites X-Real-IP and the Node port is not directly reachable from the Internet.

For systemd, create an unprivileged `djq` service user, put the project at `/opt/djq`, make files readable to that account, and save environment settings in `/etc/djq.env`. Verify `command -v node` and adjust ExecStart to its absolute path. Install the supplied service file to `/etc/systemd/system/djq.service`, then run:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now djq
sudo systemctl status djq
sudo journalctl -u djq -n 100 --no-pager
```

## Nginx / EdgeOne / other CDN

For `/api/*`, bypass cache and disable response buffering. Keep SSE connections open for at least 65 seconds; the server emits 15-second heartbeats. Forward Host and overwrite X-Real-IP; preserve Authorization. Do not add a caching rule for JSON, invitation endpoints or event streams. The provided proxy uses ordinary HTTP/1.1; WebSocket Upgrade rules are not required.

Static assets are served with no-cache (revalidation), and API responses with no-store. TLS, domain registration, DNS changes, CDN configuration, server provisioning and production smoke tests are separate operational steps; this repository does not modify your existing server or cloud account.

## Acceptance on your actual hostname

Check /api/health, create a room, join from a second browser/device, ready both, make a move, refresh one tab and confirm recovery, wait for a timed move, resign, and start a rematch. Repeat a three-player room to verify neutral green. Inspect the event stream for active updates through the proxy and check that tokens do not appear in proxy URLs/logs. If using a CDN, repeat with it enabled.

## Boundaries

Rooms are in-memory and deliberately ephemeral. Use one instance; load balancing across several workers without affinity/shared state is unsupported. There are no accounts, persistent rankings, payment integrations or external telemetry. Local games can be retained via browser storage and JSON replay export. The MIT license covers this project's original code; it does not grant rights to third-party brand assets. This project is an independent implementation, not an official Mattel product.
