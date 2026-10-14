"""In-memory browser harness for containers that block all browser URL navigation.

This does not change browser policy. It loads our local HTML/CSS/JS into
about:blank and relays fetch/SSE to the real local server through Python.
It verifies UI and transport integration, NOT browser-origin/CSP enforcement.
Use ordinary browser_smoke.py without DJQ_BROWSER_BRIDGE for direct navigation.
"""
import json
import pathlib
import re
import httpx
ROOT = pathlib.Path(__file__).resolve().parents[1]

class Bridge:
    def __init__(self, base):
        self.base = base
        self.client = None
        self.streams = {}
        self.counter = 0
    async def request(self, spec):
        if self.client is None:
            self.client = httpx.AsyncClient(base_url=self.base, timeout=60, trust_env=False)
        req = self.client.build_request(spec['method'], spec['path'], headers=spec['headers'], content=spec.get('body'))
        res = await self.client.send(req, stream=spec['path'].endswith('/events'))
        result = {'status': res.status_code, 'headers': dict(res.headers)}
        if spec['path'].endswith('/events') and res.status_code == 200:
            self.counter += 1
            key = str(self.counter)
            self.streams[key] = (res, res.aiter_bytes())
            result['stream'] = key
        else:
            await res.aread()
            result['body'] = res.text
            await res.aclose()
        return result
    async def read(self, key):
        if key not in self.streams:
            return {'done': True}
        try:
            chunk = await anext(self.streams[key][1])
            return {'done': False, 'chunk': chunk.decode('utf-8')}
        except (StopAsyncIteration, httpx.HTTPError):
            await self.close(key)
            return {'done': True}
    async def shutdown(self):
        for key in list(self.streams):
            await self.close(key)
        if self.client:
            await self.client.aclose()
            self.client = None
    async def close(self, key):
        entry = self.streams.pop(key, None)
        if entry:
            await entry[0].aclose()

FETCH_SHIM = r"""
window.fetch = async (path, options = {}) => {
  const result = await window.__bridgeRequest({path: String(path), method: options.method || 'GET',
    headers: Object.fromEntries(new Headers(options.headers).entries()), body: options.body || null});
  let body = result.body;
  if (result.stream) {
    let ended = false;
    body = new ReadableStream({
      start(controller) {
        options.signal?.addEventListener('abort', () => {
          if (!ended) { ended = true; controller.error(new DOMException('Aborted', 'AbortError')); }
          void window.__bridgeClose(result.stream);
        }, {once:true});
      },
      async pull(controller) {
        try {
          const message = await window.__bridgeRead(result.stream);
          if (ended) return;
          if (message.done) {ended = true; controller.close();}
          else controller.enqueue(new TextEncoder().encode(message.chunk));
        } catch (error) { if (!ended) {ended = true; controller.error(error);} }
      },
      cancel() { ended = true; return window.__bridgeClose(result.stream); }
    });
  }
  return new Response(body, {status: result.status, headers: result.headers});
};
"""

def attach(page, base):
    bridge = Bridge(base)
    page.expose_function('__bridgeRequest', bridge.request)
    page.expose_function('__bridgeRead', bridge.read)
    page.expose_function('__bridgeClose', bridge.close)
    page.expose_function('__bridgeShutdown', bridge.shutdown)
    source = '\n'.join((ROOT / f).read_text() for f in ['shared/rules.mjs', 'public/i18n.mjs', 'public/network.mjs', 'public/app.mjs'])
    source = re.sub(r'^import\s+[\s\S]*?;\s*', '', source, flags=re.M)
    source = re.sub(r'^export\s+', '', source, flags=re.M)
    html = (ROOT / 'public/index.html').read_text()
    html = re.sub(r'<script[^>]*>.*?</script>', '', html)
    html = re.sub(r'<link[^>]*>', '', html)
    def load():
        bag = page.evaluate('window.__storageBag || {local:{},session:{}}')
        if page.evaluate('typeof window.__djqStop === \'function\''):
            page.evaluate('async()=>{window.__djqStop();await window.__bridgeShutdown();}')
            page.wait_for_timeout(60)
        page.goto('about:blank')
        page.set_content(html)
        page.add_style_tag(content=(ROOT / 'public/style.css').read_text())
        page.evaluate('''bag => {
          window.__storageBag=bag;
          for (const [key, name] of [['local','localStorage'],['session','sessionStorage']]) {
            const store=bag[key];
            Object.defineProperty(window, name, {configurable:true, value:{
              getItem:k=>Object.hasOwn(store,k)?store[k]:null,
              setItem:(k,v)=>store[k]=String(v), removeItem:k=>delete store[k], clear:()=>Object.keys(store).forEach(k=>delete store[k])
            }});
          }
        }''', bag)
        page.evaluate(FETCH_SHIM)
        page.add_script_tag(content='(()=>{\n'+source+'\nwindow.__djqStop=()=>network.stop(false);\n})()')
    load()
    page.reload = lambda **kwargs: load()
    def dispose():
        if not page.is_closed():
            page.evaluate('async()=>{window.__djqStop?.();await window.__bridgeShutdown();}')
            page.wait_for_timeout(80)
    bridge.dispose = dispose
    return bridge
