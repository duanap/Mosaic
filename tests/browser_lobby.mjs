import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {createApp} from '../server/index.mjs';
import {openSetup} from './browser_helpers.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.DJQ_PLAYWRIGHT_MODULE||'playwright');
async function fixture(run) {
  const app=createApp({requestLimit:5000,creationLimit:100});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {await mkdir('artifacts/browser/ui-v2',{recursive:true});await run({app,browser,base:`http://127.0.0.1:${app.server.address().port}`});}
  finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
}

test('three setup dialogs cancel safely, validate input and start local bots only on submit',()=>fixture(async({app,browser,base})=>{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  assert.equal(await page.locator('.entry-card').count(),3);assert.equal(await page.locator('#board,#setup-form').count(),0);
  await page.screenshot({path:'artifacts/browser/ui-v2/home-mobile.png',fullPage:true});
  for(const mode of ['local','create','join']) {
    await openSetup(page,mode);assert.equal(await page.locator('#modal').isVisible(),true);assert.equal(await page.locator('#board').count(),0);
    assert.ok(await page.locator('#modal').evaluate(n=>n.scrollWidth<=n.clientWidth+1));await page.keyboard.press('Escape');assert.equal(await page.locator('#modal').isVisible(),false);assert.equal(app.store.rooms.size,0);
  }
  await openSetup(page,'join');await page.locator('#room-code-input').fill('ABCDEF');await page.locator('#join-room').click();await page.waitForFunction(()=>document.querySelector('#menu-error').textContent.length>0);
  assert.equal(await page.locator('#modal').isVisible(),true);assert.equal(await page.locator('#room-code-input').inputValue(),'ABCDEF');assert.equal(await page.locator('#board').count(),0);await page.keyboard.press('Escape');
  await openSetup(page,'local');await page.locator('#mode-2').click();await page.locator('[data-seat-kind="1"]').selectOption('bot');await page.screenshot({path:'artifacts/browser/ui-v2/local-setup-mobile.png',fullPage:true});
  assert.equal(await page.locator('#board').count(),0);await page.locator('#local-start').click();assert.equal(await page.locator('#modal').isVisible(),false);assert.equal(await page.locator('#board').count(),1);assert.equal(await page.locator('#export-replay').count(),0);
  await page.locator('#hint').click();await page.locator('#confirm-move').click();await page.waitForFunction(()=>Number(document.querySelector('#move-number').textContent)>=2);
  assert.equal(await page.locator('.selection-panel #game-shortcuts').count(),1);assert.equal(await page.locator('.control-panel .selection-tools').count(),0);assert.deepEqual(errors,[]);
}));

test('waiting room stays in a modal, survives dismissal, transfers host and cleans the last seat',()=>fixture(async({app,browser,base})=>{
  const a=await browser.newPage(),b=await browser.newPage();await a.goto(base);await openSetup(a,'create');await a.locator('#mode-2').click();await a.locator('#player-name').fill('房主');await a.locator('#create-room').click();await a.locator('#room-code').waitFor();
  const code=await a.locator('#room-code').innerText();assert.equal(await a.locator('#board').count(),0);assert.equal(app.store.snapshot(code).phase,'waiting');
  await a.locator('#close-modal').click();assert.equal(await a.locator('#open-create').isDisabled(),true);assert.equal(await a.locator('#import-replay').isDisabled(),true);assert.ok((await a.locator('[data-recover]').all()).length>0);assert.equal(await a.locator('[data-recover]').first().isDisabled(),true);await a.locator('#return-room').click();assert.equal(await a.locator('#room-code').innerText(),code);
  await a.reload();await a.locator('#room-code').waitFor();assert.equal(await a.locator('#room-code').innerText(),code);
  await b.goto(`${base}/?room=${code}`);await b.locator('#setup-form[data-mode="join"]').waitFor();assert.equal(await b.locator('#room-code-input').inputValue(),code);await b.locator('#player-name').fill('朋友');await b.locator('#join-room').click();await b.locator('#room-code').waitFor();
  assert.equal(await b.locator('#online-start').count(),0);assert.equal(await b.locator('#board').count(),0);await a.locator('#leave-room').click();await a.locator('#modal').waitFor({state:'hidden'});
  await b.locator('[data-add-bot="0"]').waitFor();assert.equal(app.store.snapshot(code).host,1);await b.locator('[data-add-bot="0"]').click();await b.locator('[data-remove-bot="0"]').waitFor();
  await b.screenshot({path:'artifacts/browser/ui-v2/room-waiting.png',fullPage:true});await b.locator('#leave-room').click();await b.locator('#modal').waitFor({state:'hidden'});assert.equal(app.store.rooms.size,0);assert.equal(await b.locator('[data-recover]').count(),0);
}));

test('double create is single-flight and starts a real room only after adding bots',()=>fixture(async({app,browser,base})=>{
  const page=await browser.newPage();await page.goto(base);await openSetup(page,'create');await page.locator('#mode-2').click();
  let release,count=0;const gate=new Promise(r=>release=r);await page.route('**/api/rooms',async route=>{count++;await gate;await route.continue();});
  await page.locator('#create-room').click();await page.waitForFunction(()=>document.querySelector('#create-room').disabled);await page.keyboard.press('Enter');await page.keyboard.press('Escape');assert.equal(await page.locator('#modal').isVisible(),true);assert.equal(count,1);release();
  await page.locator('#room-code').waitFor();assert.equal(app.store.rooms.size,1);assert.equal(await page.locator('#board').count(),0);assert.equal(await page.locator('#online-start').isDisabled(),true);
  await page.locator('[data-add-bot="1"]').click();await page.locator('#online-start').click();await page.locator('#board').waitFor();assert.equal(await page.locator('#modal').isVisible(),false);
  const home=await page.locator('#leave-room svg').innerHTML();assert.match(home,/m3 10 9-7/);
  page.on('dialog',d=>d.accept());await page.locator('#leave-room').click();await page.locator('#board').waitFor({state:'detached'});assert.equal(app.store.rooms.size,0);
}));
