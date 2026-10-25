import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile} from 'node:fs/promises';
import {createApp} from '../server/index.mjs';
import {openSetup} from './browser_helpers.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.DJQ_PLAYWRIGHT_MODULE||'playwright');
const radio=(page,name,value)=>page.locator(`input[name="${name}"][value="${value}"]`);
async function fixture(run) {
  const app=createApp({requestLimit:5000,creationLimit:200});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {await mkdir('artifacts/browser/duo14',{recursive:true});await run({app,browser,base:`http://127.0.0.1:${app.server.address().port}`});}
  finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
}
async function select14(page,mode) {await openSetup(page,mode);await page.locator('#mode-2').click();await radio(page,'board-size',14).check();}

test('setup aligns names and option fields, uses visible radios and supplies a random nickname',()=>fixture(async({browser,base})=>{
  const page=await browser.newPage();await page.goto(base);await page.evaluate(()=>localStorage.setItem('djq-name','玩家123'));await page.reload();
  await select14(page,'create');const nickname=await page.locator('#player-name').inputValue();
  assert.equal(await radio(page,'board-size',14).evaluate(node=>node===document.activeElement),true);
  await page.keyboard.press('ArrowLeft');assert.equal(await radio(page,'board-size',20).isChecked(),true);
  assert.equal(await radio(page,'board-size',20).evaluate(node=>node===document.activeElement),true);
  await page.keyboard.press('ArrowRight');assert.equal(await radio(page,'board-size',14).isChecked(),true);
  assert.match(nickname,/^[\u4e00-\u9fff]{4,6}[0-9]{2}$/);assert.notEqual(nickname,'玩家123');
  await page.locator('#player-name').fill('同排昵称');await radio(page,'scoring','simple').check();await radio(page,'turn-seconds',30).check();
  for(const [width,height] of [[1440,1000],[768,1024],[390,844],[360,800]]) {
    await page.setViewportSize({width,height});
    const alignment=await page.evaluate(()=>{
      const input=document.querySelector('#player-name').getBoundingClientRect(),label=document.querySelector('label:has(#player-name) .field-label').getBoundingClientRect();
      const options=[...document.querySelectorAll('.setup-option-row .choice-options')].map(n=>n.getBoundingClientRect().left);
      return {dy:Math.abs((input.top+input.height/2)-(label.top+label.height/2)),dx:options.map(x=>Math.abs(x-input.left)),overflow:document.querySelector('#modal').scrollWidth>document.querySelector('#modal').clientWidth+1};
    });
    assert.ok(alignment.dy<1);assert.ok(alignment.dx.every(dx=>dx<1));assert.equal(alignment.overflow,false);
    assert.equal(await page.locator('#setup-form select').count(),0);assert.equal(await page.locator('#player-name').inputValue(),'同排昵称');
    if(width===1440||width===390) await page.locator('#modal').screenshot({path:`artifacts/browser/duo14/setup-light-${width}.png`});
  }
  await page.keyboard.press('Escape');await page.locator('#theme-toggle').click();await select14(page,'create');
  await page.locator('#modal').screenshot({path:'artifacts/browser/duo14/setup-dark-360.png'});
  await page.locator('#create-room').click();await page.locator('#room-code').waitFor();
  assert.match(await page.locator('.lobby-aside').innerText(),/14\s*×\s*14/);
}));

test('14x14 local play supports all four colors, hints, bounds, undo, restore, rematch and replay',()=>fixture(async({browser,base})=>{
  const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await select14(page,'local');await page.locator('#local-start').click();
  assert.equal(await page.locator('#board').getAttribute('viewBox'),'0 0 420 420');assert.equal(await page.locator('[data-piece]').count(),21);
  assert.equal(await page.locator('#board .start-mark').count(),4);
  await page.locator('[data-piece="F5"]').click();await page.keyboard.press('r');await page.keyboard.press('f');
  for(let n=0;n<18;n++) {await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');}
  assert.ok(await page.locator('#preview rect').evaluateAll(nodes=>nodes.every(n=>Number(n.getAttribute('x'))<420&&Number(n.getAttribute('y'))<420)));
  await page.keyboard.press('Escape');
  for(let n=1;n<=4;n++) {
    await page.locator('#hint').click();await page.waitForFunction(()=>!document.querySelector('#confirm-move').disabled);
    await page.locator('#confirm-move').click();assert.equal(await page.locator('#move-number').innerText(),String(n));
  }
  let record=await page.evaluate(()=>JSON.parse(localStorage.getItem('djq-local-v1')));
  assert.equal(record.boardSize,14);assert.deepEqual(record.actions.map(a=>a.color),[0,1,2,3]);
  await page.screenshot({path:'artifacts/browser/duo14/game-desktop.png',fullPage:true});
  await page.reload();await page.locator('#resume-local').click();assert.equal(await page.locator('#board').getAttribute('data-size'),'14');
  await page.locator('#undo').click();assert.equal(await page.locator('#move-number').innerText(),'3');
  page.on('dialog',dialog=>dialog.accept());await page.locator('#resign').click();await page.locator('#result-content').waitFor();await page.locator('#close-modal').click();
  const downloaded=page.waitForEvent('download');await page.locator('#export-replay').click();const download=await downloaded;
  record=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(record.boardSize,14);
  await page.locator('#confirm-move').click();assert.equal(await page.locator('#board').getAttribute('data-size'),'14');assert.equal(await page.locator('#move-number').innerText(),'0');
  await page.locator('#home-button').click();await page.locator('#import-file').setInputFiles({name:'duo14.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(record))});
  assert.equal(await page.locator('#board').getAttribute('data-size'),'14');await page.locator('#replay-next').click();assert.equal(await page.locator('#move-number').innerText(),'1');
  assert.deepEqual(errors,[]);
}));

test('14x14 touch dragging clamps at the small board edge and keeps drawer geometry',()=>fixture(async({browser,base})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage();
  await page.goto(base);await select14(page,'local');await page.locator('#local-start').click();await page.locator('[data-piece="F5"]').tap();await page.locator('#board').scrollIntoViewIfNeeded();
  const ghost=await page.locator('#preview rect').last().boundingBox(),x=ghost.x+ghost.width/2,y=ghost.y+ghost.height/2,board=await page.locator('#board').boundingBox();
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:board.x+board.width+60,y:y+board.height+60,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(await page.locator('#preview rect').evaluateAll(nodes=>nodes.every(n=>Number(n.getAttribute('x'))<=391.5&&Number(n.getAttribute('y'))<=391.5)));
  const toolbar=await page.locator('#piece-actions').boundingBox();assert.ok(toolbar.x>=board.x&&toolbar.x+toolbar.width<=board.x+board.width+1);
  await page.locator('#hint').tap();await page.waitForFunction(()=>!document.querySelector('#confirm-move').disabled);await page.locator('#confirm-move').tap();
  assert.equal(await page.locator('#move-number').innerText(),'1');
  await page.setViewportSize({width:844,height:390});await page.locator('#dock-pieces').tap();assert.equal(await page.locator('#game-controls').getAttribute('aria-modal'),'true');
  await page.screenshot({path:'artifacts/browser/duo14/game-landscape.png',fullPage:true});
  await context.close();
}));

test('14x14 online room shares size through SSE and recovery, including server bots',()=>fixture(async({app,browser,base})=>{
  const a=await browser.newPage({viewport:{width:1366,height:768}}),b=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  for(const page of [a,b]) page.on('pageerror',error=>errors.push(error.message));
  await a.goto(base);await select14(a,'create');await radio(a,'turn-seconds',30).check();await a.locator('#create-room').click();
  const code=await a.locator('#room-code').innerText();assert.equal(app.store.snapshot(code).boardSize,14);
  await b.goto(`${base}/?room=${code}`);await b.locator('#join-room').click();await b.locator('#room-code').waitFor();
  await a.locator('#online-start').click();await b.locator('#board').waitFor();
  for(const page of [a,b]) assert.equal(await page.locator('#board').getAttribute('data-size'),'14');
  await a.locator('[data-piece="I5"]').click();await a.keyboard.press('Enter');await b.waitForFunction(()=>document.querySelector('#move-number').textContent==='1');
  await b.locator('#hint').click();await b.waitForFunction(()=>!document.querySelector('#confirm-move').disabled);await b.locator('#confirm-move').click();await a.waitForFunction(()=>document.querySelector('#move-number').textContent==='2');
  await a.reload();await a.locator('#board').waitFor();assert.equal(await a.locator('#board').getAttribute('data-size'),'14');
  a.on('dialog',dialog=>dialog.accept());await a.locator('#resign').click();await a.locator('#rematch').click();await a.locator('#online-start').click();assert.equal(await a.locator('#board').getAttribute('data-size'),'14');
  await a.locator('#leave-room').click();await b.close();
  const bot=await browser.newPage();await bot.goto(base);await select14(bot,'create');await bot.locator('#create-room').click();await bot.locator('[data-add-bot="1"]').click();await bot.locator('#online-start').click();
  await bot.locator('[data-piece="I5"]').click();await bot.keyboard.press('Enter');await bot.waitForFunction(()=>Number(document.querySelector('#move-number').textContent)>=2);
  assert.equal(await bot.locator('#board').getAttribute('data-size'),'14');assert.deepEqual(errors,[]);
}));
