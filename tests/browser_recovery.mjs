/** Optional direct-browser regression suite; see docs/TESTING.md. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createApp } from '../server/index.mjs';

const { chromium }=createRequire(import.meta.url)(process.env.DJQ_PLAYWRIGHT_MODULE||'playwright');
const SESSION='djq-room-v1',RECOVERY='djq-recovery-v1';

test('seat recovery in a browser with real storage and HTTP/SSE',async t=>{
  const app=createApp({requestLimit:2000,creationLimit:200});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
    async function context(t,options={}) {
      const context=await browser.newContext(options),errors=[];
      context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
      t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});return context;
    }
    async function page(context) {
      const page=await context.newPage();page.setDefaultTimeout(10000);await page.goto(base);return page;
    }
    async function host(page,name='Alice') {
      await page.locator('#mode-2').click();await page.locator('#player-name').fill(name);
      await page.locator('#create-room').click();await page.locator('#room-code').waitFor();
      return page.locator('#room-code').innerText();
    }
    await t.test('closing a mobile tab retains its seat and manual recovery returns to the same room',async t=>{
      const ctx=await context(t,{viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      const a=await page(ctx),code=await host(a,'<b>Alice</b>');await a.close();
      const reopened=await page(ctx);await reopened.locator('[data-recover]').waitFor();
      assert.equal(await reopened.locator('#room-code').count(),0);
      assert.match(await reopened.locator('[data-recover]').innerText(),/<b>Alice<\/b>/);
      assert.equal(await reopened.locator('.recovery-section b').count(),0);
      const token=await reopened.evaluate(key=>JSON.parse(localStorage.getItem(key))[0].token,RECOVERY);
      assert.equal((await reopened.locator('#app').innerHTML()).includes(token),false);
      assert.ok(await reopened.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await mkdir('artifacts/browser',{recursive:true});
      await reopened.screenshot({path:'artifacts/browser/recovery-mobile.png',fullPage:true});
      await reopened.locator('[data-recover]').click();await reopened.locator('#room-code').waitFor();
      assert.equal(await reopened.locator('#room-code').innerText(),code);
      assert.equal(await reopened.locator('.lobby-seat:not(.empty)').count(),1);
      await reopened.locator('#leave-room').click();await reopened.locator('#local-start').waitFor();
      assert.equal(await reopened.locator('[data-recover]').count(),0);
    });
    await t.test('multiple seats in the same browser remain independent during explicit takeover',async t=>{
      const ctx=await context(t),a=await page(ctx),code=await host(a);
      const b=await page(ctx);await b.locator('#player-name').fill('Bob');
      await b.locator('#room-code-input').fill(code);await b.locator('#join-room').click();
      await b.locator('#room-code').waitFor();
      const c=await page(ctx);assert.equal(await c.locator('[data-recover]').count(),2);
      assert.equal(await a.locator('#room-code').innerText(),code);
      assert.equal(await b.locator('#room-code').innerText(),code);
      await c.getByRole('button',{name:/Alice \/ /}).click();await c.locator('#room-code').waitFor();
      await a.locator('#local-start').waitFor();await a.reload();
      assert.equal(await a.locator('#room-code').count(),0);
      assert.equal(await b.locator('#room-code').innerText(),code);
      assert.equal(await c.locator('#room-code').innerText(),code);
      assert.equal(await c.evaluate(key=>JSON.parse(localStorage.getItem(key)).length,RECOVERY),2);
      await c.locator('#leave-room').click();await c.locator('#local-start').waitFor();
      assert.equal(await c.locator('[data-recover]').count(),1);
      assert.match(await c.locator('[data-recover]').innerText(),/Bob/);
      await b.reload();await b.locator('#room-code').waitFor();
      assert.equal(await b.locator('#room-code').innerText(),code);
    });
    await t.test('a closed tab resumes an active game and can submit the next move',async t=>{
      const ctx=await context(t),a=await page(ctx),code=await host(a);
      const b=await page(ctx);await b.locator('#player-name').fill('Bob');
      await b.locator('#room-code-input').fill(code);await b.locator('#join-room').click();
      await a.locator('#online-start').click();
      await a.locator('#hint').click();await a.locator('#confirm-move').click();
      await b.waitForFunction(()=>document.querySelector('#move-number')?.textContent==='1');await b.close();
      const reopened=await page(ctx);await reopened.getByRole('button',{name:/Bob \/ /}).click();
      await reopened.waitForFunction(()=>document.querySelector('#move-number')?.textContent==='1');
      await reopened.locator('#hint').click();await reopened.locator('#confirm-move').click();
      await a.waitForFunction(()=>document.querySelector('#move-number')?.textContent==='2');
    });
    for(const withoutLocks of [false,true]) await t.test(`copied tab credentials require manual takeover${withoutLocks?' without Web Locks':''}`,async t=>{
      const ctx=await context(t);
      if(withoutLocks) await ctx.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));
      const a=await page(ctx),code=await host(a);
      const opened=ctx.waitForEvent('page');await a.evaluate(()=>{window.open(location.href,'_blank');});
      const b=await opened;b.setDefaultTimeout(10000);await b.waitForLoadState('domcontentloaded');
      await b.waitForFunction(()=>document.querySelector('#room-code')||document.querySelector('#create-room:not(:disabled)'));
      assert.equal(await b.locator('#room-code').count(),0,'a copied tab must require an explicit recovery action');
      assert.equal(await a.locator('#room-code').innerText(),code);
      assert.equal(await b.evaluate(key=>sessionStorage.getItem(key),SESSION),null);
      await b.locator('[data-recover]').click();await b.locator('#room-code').waitFor();
      await a.locator('#local-start').waitFor();assert.equal(await b.locator('#room-code').innerText(),code);
    });
    await t.test('a failed explicit takeover cannot leave the original tab connected without its seat lock',async t=>{
      const ctx=await context(t),a=await page(ctx);await host(a);
      const b=await page(ctx);await b.route('**/api/rooms/**',route=>route.abort());
      await b.locator('[data-recover]').click();await b.locator('#toast').waitFor();
      await a.locator('#local-start').waitFor();
      assert.equal(await a.evaluate(key=>sessionStorage.getItem(key),SESSION),null);
      assert.equal(await b.locator('[data-recover]').count(),1);
      await b.unroute('**/api/rooms/**');await b.locator('[data-recover]').click();await b.locator('#room-code').waitFor();
    });
    await t.test('seat credentials survive closing and restarting the browser process',async()=>{
      const profiles=resolve('artifacts/browser');await mkdir(profiles,{recursive:true});
      const profile=await mkdtemp(join(profiles,'recovery-profile-'));
      const options={headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})};
      let persistent;
      try {
        persistent=await chromium.launchPersistentContext(profile,options);
        const a=await page(persistent),code=await host(a);await persistent.close();persistent=null;
        persistent=await chromium.launchPersistentContext(profile,options);
        const b=await page(persistent);await b.locator('[data-recover]').waitFor();
        assert.equal(await b.locator('#room-code').count(),0);
        await b.locator('[data-recover]').click();await b.locator('#room-code').waitFor();
        assert.equal(await b.locator('#room-code').innerText(),code);
      } finally {
        await persistent?.close();
        assert.equal(dirname(profile),profiles);await rm(profile,{recursive:true,force:true});
      }
    });
    await t.test('temporary API failure on reload preserves recovery credentials',async t=>{
      const ctx=await context(t),a=await page(ctx),code=await host(a);
      await a.route('**/api/rooms/**',route=>route.abort());await a.reload();
      await a.locator('#toast').waitFor();assert.equal(await a.locator('[data-recover]').count(),1);
      assert.equal(await a.evaluate(key=>JSON.parse(sessionStorage.getItem(key)).code,SESSION),code);
      await a.unroute('**/api/rooms/**');await a.locator('[data-recover]').click();
      await a.locator('#room-code').waitFor();assert.equal(await a.locator('#room-code').innerText(),code);
    });
    await t.test('a missing room removes its obsolete recovery entry',async t=>{
      const ctx=await context(t),a=await page(ctx),code=await host(a);await a.close();
      app.store.remove(app.store.get(code));
      const b=await page(ctx);await b.locator('[data-recover]').click();await b.locator('#toast').waitFor();
      assert.equal(await b.locator('[data-recover]').count(),0);
      assert.equal(await b.evaluate(key=>sessionStorage.getItem(key),SESSION),null);
      assert.equal(await b.locator('.github-link').getAttribute('href'),'https://github.com/duanap/Mosaic');
    });
  } finally {
    await browser?.close();app.shutdown();await new Promise(resolve=>app.server.close(resolve));
  }
});
