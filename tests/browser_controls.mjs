import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { createApp } from '../server/index.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.DJQ_PLAYWRIGHT_MODULE||'playwright');

test('selection, Enter/T shortcuts, merged confirmation and header history dialog',async()=>{
  const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1366,height:768}});page.setDefaultTimeout(10000);
    await page.goto(`http://127.0.0.1:${app.server.address().port}`);await page.locator('#local-start').click();
    // Reproduce the reported defect: a mouse selection left focus on the tray button.
    await page.locator('[data-piece="I5"]').click();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#move-number').innerText(),'1','Enter confirms immediately after selecting a valid piece');
    assert.equal(await page.locator('.control-heading,.remaining-pill,#selection-title,.preview-info,#game-history').count(),0);
    assert.equal((await page.locator('#selected-piece-meta').innerText()).trim(),'');
    await page.keyboard.press('t');await page.waitForFunction(()=>!document.querySelector('#confirm-move').disabled);
    assert.equal((await page.locator('#confirm-move').innerText()).trim(),'确认落子');
    assert.equal(await page.locator('#board').evaluate(n=>n===document.activeElement),true);
    assert.match(await page.locator('#selected-piece-meta').innerText(),/^[A-Z][1-5]$/);
    assert.equal(await page.locator('#selected-piece-meta small,#selected-piece-meta span').count(),0);
    const flip=await page.locator('#flip').boundingBox(),hint=await page.locator('#hint').boundingBox();assert.ok(hint.y>=flip.y+flip.height&&Math.abs(hint.x-flip.x)<1);
    await page.keyboard.press('Enter');assert.equal(await page.locator('#move-number').innerText(),'2');
    await page.locator('[data-piece="F5"]').click();assert.equal(await page.locator('#confirm-move').isDisabled(),true);
    assert.notEqual((await page.locator('#confirm-move').innerText()).trim(),'确认落子');await page.keyboard.press('Enter');assert.equal(await page.locator('#move-number').innerText(),'2');
    const rules=await page.locator('#rules-button').boundingBox(),log=await page.locator('#log-button').boundingBox();assert.ok(log.x>rules.x);
    await page.locator('#log-button').click();await page.locator('#modal').waitFor({state:'visible'});
    assert.equal(await page.locator('#modal .move-log li').count(),2);
    await mkdir('artifacts/browser/ui-v2',{recursive:true});await page.screenshot({path:'artifacts/browser/ui-v2/history-dialog.png',fullPage:true});
    await page.keyboard.press('t');await page.keyboard.press('Enter');assert.equal(await page.locator('#move-number').innerText(),'2');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#modal').isVisible(),false);
    const version=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
    assert.equal(await page.title(),`角斗士棋 v${version}`);assert.match(await page.locator('.brand-label').innerText(),new RegExp(`DJQ.*v${version.replaceAll('.','\\.')}`));
    assert.equal(await page.getByText('同屏对局自动保存在本机',{exact:true}).count(),0);
  } finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});

test('online confirmation resists repeated Enter and the history modal receives live updates',async()=>{
  const app=createApp({creationLimit:100,requestLimit:2000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  let release;
  try {
    const a=await browser.newPage({viewport:{width:1366,height:768}}),b=await browser.newPage(),base=`http://127.0.0.1:${app.server.address().port}`;
    await a.goto(base);await a.locator('#mode-2').click();await a.locator('#create-room').click();const code=await a.locator('#room-code').innerText();
    await b.goto(base);await b.locator('#room-code-input').fill(code);await b.locator('#join-room').click();await a.locator('#online-start').click();
    await b.locator('#log-button').click();assert.equal(await b.locator('#modal-log li').count(),0);
    const gate=new Promise(r=>{release=r;});let requests=0;
    await a.route('**/commands',async route=>{if(route.request().postDataJSON().type==='move'){requests++;await gate;}await route.continue();});
    await a.locator('[data-piece="I5"]').click();await a.keyboard.press('Enter');
    await a.waitForFunction(()=>document.querySelector('#confirm-move').getAttribute('aria-busy')==='true');
    assert.equal(await a.locator('#confirm-move').isDisabled(),true);assert.match(await a.locator('#confirm-move').innerText(),/提交中/);
    await a.keyboard.press('Enter');assert.equal(requests,1);
    release();await a.waitForFunction(()=>document.querySelector('#move-number').textContent==='1');
    await b.waitForFunction(()=>document.querySelectorAll('#modal-log li').length===1);assert.equal(await b.locator('#modal').isVisible(),true);
    await b.keyboard.press('t');assert.equal(await b.locator('#preview rect').count(),0,'modal text interaction never starts analysis');
    await b.keyboard.press('Escape');await b.locator('#hint').focus();await b.keyboard.press('Enter');await b.waitForFunction(()=>!document.querySelector('#confirm-move').disabled);
    assert.equal(await b.locator('#move-number').innerText(),'1');await b.keyboard.press('Enter');await a.waitForFunction(()=>document.querySelector('#move-number').textContent==='2');
  } finally {release?.();await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});
