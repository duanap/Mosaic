/** Direct-origin browser tests; optional Playwright and installed Chromium/Edge. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createApp } from '../server/index.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.DJQ_PLAYWRIGHT_MODULE||'playwright');

test('desktop and touch placement uses held drag and full-piece bounds',async t=>{
  const app=createApp({requestLimit:5000,creationLimit:200});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    for(const mobile of [false,true]) await t.test(mobile?'touch':'mouse',async()=>{
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},hasTouch:mobile,isMobile:mobile});
      try {
        const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(`http://127.0.0.1:${app.server.address().port}`);await page.locator('#local-start').click();
        await page.locator('[data-piece="F5"]').click();await page.locator('#board').scrollIntoViewIfNeeded();
        const rects=()=>page.locator('#preview').innerHTML();
        const before=await rects();await page.mouse.move(0,0);await page.mouse.move(200,200);assert.equal(await rects(),before);
        const board=await page.locator('#board').boundingBox(),cell=board.width/20;
        const ghost=await page.locator('#preview rect').last().boundingBox();
        const x=ghost.x+ghost.width/2,y=ghost.y+ghost.height/2,dx=cell*4,dy=cell*4;
        if(mobile) {
          const cdp=await context.newCDPSession(page);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy,id:1}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        } else {await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:5});await page.mouse.up();}
        await page.waitForTimeout(80);
        const after=await rects();assert.notEqual(after,before);assert.equal(await page.locator('#preview rect').count(),5);
        // The grabbed last square follows the pointer, rather than making it the top-left origin.
        const last=await page.locator('#preview rect').last().boundingBox();assert.ok(Math.abs(last.x+last.width/2-(x+dx))<cell/2);
        if(mobile) {
          const cdp=await context.newCDPSession(page),p=await page.locator('#preview rect').last().boundingBox(),x=p.x+p.width/2,y=p.y+p.height/2;
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+cell,y:y+cell,id:1}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
          assert.equal(await rects(),after,'cancel restores the starting preview');
        }
        await page.waitForTimeout(360);
        const p=await page.locator('#preview rect').last().boundingBox();
        if(mobile) await page.touchscreen.tap(p.x+p.width/2,p.y+p.height/2); else await page.mouse.click(p.x+p.width/2,p.y+p.height/2);
        assert.notEqual(await rects(),after);
        await page.locator('#board').focus();for(let i=0;i<30;i++) await page.keyboard.press('ArrowRight');
        await page.locator('#board').focus();await page.keyboard.press('f');
        const cells=await page.locator('#preview rect').evaluateAll(nodes=>nodes.map(n=>[Number(n.getAttribute('x')),Number(n.getAttribute('y'))]));
        assert.ok(cells.every(([x,y])=>x>=0&&x<600&&y>=0&&y<600));
        assert.equal(await page.locator('#move-number').innerText(),'0');
        await page.locator('#hint').click();await page.locator(mobile?'.mobile-dock [data-action="confirm-move"]':'#confirm-move').click();
        assert.equal(await page.locator('#move-number').innerText(),'1');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await mkdir('artifacts/browser',{recursive:true});await page.screenshot({path:`artifacts/browser/gameplay-${mobile?'touch':'desktop'}.png`,fullPage:true});
        assert.deepEqual(errors,[]);
      } finally {await context.close();}
    });
  } finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});

test('manual four-color opening, keyboard focus and v1 replay safety',async()=>{
  const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    const page=await browser.newPage();await page.goto(`http://127.0.0.1:${app.server.address().port}`);await page.locator('#local-start').click();
    for(let i=0;i<4;i++) {await page.locator('[data-piece="I5"]').click();await page.locator('#confirm-move').click();}
    assert.equal(await page.locator('#move-number').innerText(),'4');
    await page.locator('#hint').focus();await page.keyboard.press('Enter');await page.locator('#preview rect').first().waitFor();
    assert.equal(await page.locator('#move-number').innerText(),'4','Enter on hint does not commit');
    await page.locator('#board').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#move-number').innerText(),'5');
    await page.locator('#theme-toggle').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await page.locator('#home-button').click();
    const record={format:'djq-replay',version:1,players:2,scoring:'bonus',names:['<img src=x onerror=alert(1)>','B'],actions:[]};
    await page.locator('#import-file').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(record))});
    await page.locator('#replay-next').waitFor();assert.equal(await page.locator('img').count(),0);assert.match(await page.locator('.player-ident strong').first().innerText(),/<img/);
    await page.locator('#home-button').click();record.actions=[{type:'move',color:0,player:0,move:{piece:'I5',orientation:0,x:5,y:5}}];
    await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(record))});
    await page.locator('#toast').waitFor();assert.equal(await page.locator('#local-start').count(),1);
  } finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});

test('three and four human seats start without readiness and retain neutral control',async()=>{
  const app=createApp({creationLimit:100,requestLimit:2000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    for(const count of [3,4]) {
      const context=await browser.newContext(),pages=[];
      try {
        for(let i=0;i<count;i++) {const page=await context.newPage();pages.push(page);await page.goto(`http://127.0.0.1:${app.server.address().port}`);}
        const host=pages[0];await host.locator('#mode-'+count).click();await host.locator('#create-room').click();const code=await host.locator('#room-code').innerText();
        for(const page of pages.slice(1)) {await page.locator('#room-code-input').fill(code);await page.locator('#join-room').click();await page.locator('#room-code').waitFor();}
        await host.locator('#online-start').click();
        for(let color=0;color<4;color++) {
          const page=pages[color===3&&count===3?0:color];await page.locator('#hint').click();await page.locator('#confirm-move').click();
        }
        for(const page of pages) await page.waitForFunction(()=>document.querySelector('#move-number')?.textContent==='4');
      } finally {await context.close();}
    }
  } finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});

test('local bot play, hint cycling, undo, restore and full-game termination',async t=>{
  const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${app.server.address().port}`);
    await page.locator('#mode-2').click();await page.locator('[data-seat-kind="1"]').selectOption('bot');await page.locator('#local-start').click();
    await page.locator('#hint').click();await page.waitForFunction(()=>document.querySelector('#hint-status').textContent.includes('方案 1/'));
    const first=await page.locator('#preview').innerHTML(),piece=await page.locator('.piece.selected').getAttribute('data-piece');
    await page.locator('#hint').click();assert.notEqual(await page.locator('#preview').innerHTML(),first);
    assert.notEqual(await page.locator('.piece.selected').getAttribute('data-piece'),piece);
    await page.locator('#confirm-move').click();await page.waitForFunction(()=>Number(document.querySelector('#move-number').textContent)>=2);
    await page.locator('#undo').click();assert.equal(await page.locator('#move-number').innerText(),'0');
    await page.waitForTimeout(150);assert.equal(await page.locator('#move-number').innerText(),'0');
    await page.reload();await page.locator('#resume-local').click();assert.equal(await page.locator('#move-number').innerText(),'0');
    const record=await page.evaluate(()=>JSON.parse(localStorage.getItem('djq-local-v1')));assert.equal(record.seats[1].kind,'bot');
    for(let n=0;n<85;n++) {
      await page.waitForFunction(()=>document.querySelector('#rematch')||!document.querySelector('#hint')?.disabled);
      if(await page.locator('#rematch').count()) break;
      await page.locator('#hint').click();await page.locator('#confirm-move').click();
    }
    await page.locator('#rematch').waitFor();assert.ok((await page.evaluate(()=>JSON.parse(localStorage.getItem('djq-local-v1')).actions)).some(a=>a.source==='bot'));
    await page.locator('#rematch').click();assert.equal(await page.locator('#move-number').innerText(),'0');assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('djq-local-v1')))).seats[1].kind,'bot');
    assert.deepEqual(errors,[]);
  } finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});

test('four-player team room with two humans and two bots starts directly and rematches',async t=>{
  const app=createApp({requestLimit:5000,creationLimit:200});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    const a=await browser.newPage(),b=await browser.newPage(),base=`http://127.0.0.1:${app.server.address().port}`;
    await a.goto(base);await a.locator('#game-mode').selectOption('teams');await a.locator('#create-room').click();
    const code=await a.locator('#room-code').innerText();await a.locator('[data-add-bot="2"]').click();await a.locator('[data-add-bot="3"]').click();
    await b.goto(base);await b.locator('#room-code-input').fill(code);await b.locator('#join-room').click();
    assert.equal(await a.locator('#ready').count(),0);await a.locator('#online-start').click();
    await b.locator('#hint').waitFor();assert.equal(await a.locator('.team-cards article').count(),2);
    await a.locator('#hint').click();await a.locator('#confirm-move').click();
    await b.locator('#hint').click();await b.locator('#confirm-move').click();
    await a.waitForFunction(()=>Number(document.querySelector('#move-number').textContent)>=4);
    const game=app.store.snapshot(code).game;assert.equal(game.mode,'teams');assert.ok(game.history.slice(2,4).every(a=>a.source==='bot'));
    a.on('dialog',d=>d.accept());await a.locator('#resign').click();
    assert.equal(app.store.snapshot(code).phase,'playing');
    // Complete the rest through legal human intents; real worker jobs still own bot turns.
    for(let n=0;n<100&&app.store.snapshot(code).phase==='playing';n++) {
      const room=app.store.get(code),g=room.game;
      const {controller,findMove}=await import('../shared/rules.mjs');const actor=controller(g);
      if(room.players[actor].kind==='human') app.store.command(code,room.players[actor].token,{type:'move',round:room.round,revision:g.revision,move:findMove(g)});
      else await new Promise(r=>setTimeout(r,40));
    }
    assert.equal(app.store.snapshot(code).phase,'finished');await b.locator('#result-content').waitFor();assert.equal(await b.locator('.result-scores li').count(),2);assert.equal(await b.locator('#rematch').count(),0,'only the host starts a rematch');
    await b.locator('#close-modal').click();assert.equal(await b.locator('#confirm-move').isDisabled(),true);await b.locator('#theme-toggle').click();assert.equal(await b.locator('#modal').isVisible(),false,'a dismissed online result stays dismissed');
    await a.locator('#rematch').click();await a.locator('#online-start').click();
    assert.equal(app.store.snapshot(code).round,2);assert.equal(app.store.snapshot(code).game.seats[2].kind,'bot');
  } finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});
