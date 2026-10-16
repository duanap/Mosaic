import { openSetup, startLocal } from './browser_helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { createApp } from '../server/index.mjs';
import { newGame, applyMove, findMove, exportReplay } from '../shared/rules.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.DJQ_PLAYWRIGHT_MODULE||'playwright');

test('piece-local flip and confirm follow held drags and stay inside the board',async()=>{
  const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1366,height:768}});await page.goto(`http://127.0.0.1:${app.server.address().port}`);await startLocal(page);
    assert.equal(await page.locator('#piece-actions').isVisible(),false);
    await page.locator('[data-piece="F5"]').click();assert.equal(await page.locator('#floating-confirm').isDisabled(),true);
    const before=await page.locator('#preview').innerHTML();await page.locator('#floating-flip').click();assert.notEqual(await page.locator('#preview').innerHTML(),before);
    const board=await page.locator('#board').boundingBox(),cell=board.width/20,ghost=await page.locator('#preview rect').last().boundingBox(),toolbar=await page.locator('#piece-actions').boundingBox();
    const x=ghost.x+ghost.width/2,y=ghost.y+ghost.height/2;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+cell*4,y+cell*4,{steps:4});await page.mouse.up();
    const after=await page.locator('#piece-actions').boundingBox();assert.ok(after.y>toolbar.y+cell*3,'toolbar follows the held piece');
    assert.ok(after.x>=board.x&&after.y>=board.y&&after.x+after.width<=board.x+board.width&&after.y+after.height<=board.y+board.height);
    await page.locator('#hint').click();await page.waitForFunction(()=>!document.querySelector('#floating-confirm').disabled);await page.locator('#floating-confirm').click();
    assert.equal(await page.locator('#move-number').innerText(),'1');assert.equal(await page.locator('#piece-actions').isVisible(),false);
  } finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});

test('portrait selection preserves scroll, splits preview equally and precedes seats',async()=>{
  const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});await page.goto(`http://127.0.0.1:${app.server.address().port}`);await startLocal(page);
    for(const [width,height] of [[390,844],[360,800],[768,1024]]) {
      await page.setViewportSize({width,height});
      await page.locator('[data-piece="F5"]').evaluate(node=>scrollTo(0,node.getBoundingClientRect().top+scrollY-180));await page.evaluate(()=>new Promise(requestAnimationFrame));const scroll=await page.evaluate(()=>scrollY);
      assert.ok(scroll>0);await page.locator('[data-piece="F5"]').tap();
      assert.ok(Math.abs(await page.evaluate(()=>scrollY)-scroll)<2,'selecting a piece never jumps back to the board');
      const preview=await page.locator('.selection-preview').boundingBox(),tools=await page.locator('.transform-tools').boundingBox();
      assert.ok(Math.abs(preview.width-tools.width)<1,'preview and actions each get half the row');assert.ok(Math.abs(preview.width-preview.height)<1,'preview card is square');
      const controls=await page.locator('#game-controls').boundingBox(),seats=await page.locator('.players-panel').boundingBox(),main=await page.locator('#piece-controls').boundingBox(),aux=await page.locator('.auxiliary-panel').boundingBox();
      assert.ok(controls.y+controls.height<=seats.y);assert.ok(aux.y>=main.y+main.height+8);
      assert.equal(await page.locator('.selection-panel .transform-tools #show-corners').count(),1);assert.equal(await page.locator('.auxiliary-panel #confirm-move').count(),1);
      assert.equal(await page.locator('.player-state>span:first-child').nth(1).innerText(),'等待回合');
      assert.equal(await page.locator('.player-state>span:first-child+.player-colors').count(),4);
      assert.equal(await page.locator('.selection-panel #game-shortcuts').count(),1);assert.equal(await page.locator('#piece-controls .selection-preview').count(),0);assert.equal(await page.locator('#export-replay').count(),0);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(width===390) {await page.evaluate(()=>scrollTo(0,0));await mkdir('artifacts/browser/ui-v2',{recursive:true});await page.screenshot({path:'artifacts/browser/ui-v2/phone-portrait-controls.png',fullPage:true});}
    }
    await page.setViewportSize({width:390,height:844});await page.locator('#board').scrollIntoViewIfNeeded();const shape=await page.locator('#preview').innerHTML();await page.locator('#floating-flip').tap();assert.notEqual(await page.locator('#preview').innerHTML(),shape);
    await page.locator('#hint').tap();await page.waitForFunction(()=>document.querySelector('#hint-status').textContent.includes('方案'));await page.locator('#board').scrollIntoViewIfNeeded();await page.locator('#floating-confirm').tap();assert.equal(await page.locator('#move-number').innerText(),'1');
  } finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});

test('finished game announces winners once, closes for board inspection and rematches',async()=>{
  const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    const game=newGame(4);while(game.status==='playing') applyMove(game,findMove(game));
    const record=exportReplay(game,['玩家 1','玩家 2','玩家 3','玩家 4']),page=await browser.newPage({viewport:{width:1366,height:768}});
    await page.goto(`http://127.0.0.1:${app.server.address().port}`);await page.evaluate(record=>localStorage.setItem('djq-local-v1',JSON.stringify(record)),record);await page.reload();await page.locator('#resume-local').click();
    await page.locator('#result-content').waitFor();assert.match(await page.locator('#result-content h3').innerText(),/获胜|平局/);assert.equal(await page.locator('.result-scores li').count(),4);
    assert.equal(await page.locator('#piece-actions').isVisible(),false);assert.equal(await page.locator('.result-banner').count(),0);
    await mkdir('artifacts/browser/ui-v2',{recursive:true});await page.screenshot({path:'artifacts/browser/ui-v2/result-dialog.png',fullPage:true});
    await page.locator('#close-modal').click();assert.equal(await page.locator('#modal').isVisible(),false);
    const downloaded=page.waitForEvent('download');await page.locator('#export-replay').click();assert.match((await downloaded).suggestedFilename(),/\.json$/);
    await page.locator('#theme-toggle').click();assert.equal(await page.locator('#modal').isVisible(),false,'ordinary renders do not reopen a dismissed result');
    assert.equal((await page.locator('#confirm-move').innerText()).trim(),'再来一局');assert.equal(await page.locator('#confirm-move').isDisabled(),false);
    for(const [width,height] of [[1366,768],[844,390],[390,844]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.equal(await page.locator('#undo,#result-button,.mobile-dock').count(),0,'finished game removes undo, result shortcut and bottom dock');
      assert.equal(await page.locator('#game-controls').isVisible(),true);assert.equal(await page.locator('#confirm-move').isEnabled(),true);
      if(width===844) {await page.locator('#confirm-move').scrollIntoViewIfNeeded();const confirm=await page.locator('#confirm-move').boundingBox();assert.ok(confirm.y>=0&&confirm.y+confirm.height<=height,'main rematch remains on screen without a bottom dock');await page.screenshot({path:'artifacts/browser/ui-v2/phone-landscape-finished.png',fullPage:true});}
    }
    await page.locator('#confirm-move').click();assert.equal(await page.locator('#move-number').innerText(),'0');
    await page.setViewportSize({width:1366,height:768});
    await page.locator('#home-button').click();await page.evaluate(record=>localStorage.setItem('djq-local-v1',JSON.stringify(record)),record);await page.reload();await page.locator('#resume-local').click();await page.locator('#rematch').click();assert.equal(await page.locator('#move-number').innerText(),'0');
  } finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});

test('selection, Enter/T shortcuts, merged confirmation and header history dialog',async()=>{
  const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1366,height:768}});page.setDefaultTimeout(10000);
    await page.goto(`http://127.0.0.1:${app.server.address().port}`);
    assert.doesNotMatch(await page.locator('.home-shell').innerText(),/SMALL BOARD|BIG POSSIBILITIES|NEW ANGLE|LITTLE SQUARES|SAME SCREEN|PLAY TOGETHER|LET'S PLAY/);
    await mkdir('artifacts/browser/ui-v2',{recursive:true});await page.screenshot({path:'artifacts/browser/ui-v2/home-light.png',fullPage:true});
    await startLocal(page);
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
    const corners=await page.locator('#show-corners').boundingBox(),hint=await page.locator('#hint').boundingBox();assert.ok(hint.y>=corners.y+corners.height&&Math.abs(hint.x-corners.x)<1);
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
    await a.goto(base);await openSetup(a,'create');await a.locator('#mode-2').click();await a.locator('#create-room').click();const code=await a.locator('#room-code').innerText();
    await b.goto(base);await openSetup(b,'join');await b.locator('#room-code-input').fill(code);await b.locator('#join-room').click();await a.locator('#online-start').click();
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

test('mobile drag completion preserves the next touchscreen button activation',async()=>{
  const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();page.setDefaultTimeout(10000);
    await page.goto(`http://127.0.0.1:${app.server.address().port}`);await startLocal(page);await page.locator('[data-piece="F5"]').tap();await page.locator('#board').scrollIntoViewIfNeeded();
    const p=await page.locator('#preview rect').last().boundingBox(),board=await page.locator('#board').boundingBox(),x=p.x+p.width/2,y=p.y+p.height/2,dx=board.width/5,cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dx,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.locator('#hint').tap();await page.waitForFunction(()=>document.querySelector('#hint-status').textContent.includes('方案'));
    await page.locator('#board').scrollIntoViewIfNeeded();await page.locator('#floating-confirm').tap();assert.equal(await page.locator('#move-number').innerText(),'1');
    await page.locator('#show-corners').tap();assert.equal(await page.locator('#show-corners').getAttribute('aria-pressed'),'true','one tap toggles once despite compatibility clicks');
    await page.locator('#show-corners').tap();assert.equal(await page.locator('#show-corners').getAttribute('aria-pressed'),'false');
    const button=await page.locator('#show-corners').boundingBox(),tx=button.x+button.width/2,ty=button.y+button.height/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx,y:ty-40,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await page.locator('#show-corners').getAttribute('aria-pressed'),'false','swiping controls only scrolls');
    await page.locator('#show-corners').scrollIntoViewIfNeeded();const cancelled=await page.locator('#show-corners').boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cancelled.x+cancelled.width/2,y:cancelled.y+cancelled.height/2,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    assert.equal(await page.locator('#show-corners').getAttribute('aria-pressed'),'false','cancelled touch never activates controls');
  } finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});
