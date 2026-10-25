import { openSetup, startLocal } from './browser_helpers.mjs';
/** Real game layout and accessibility regression tests, using HTTP and module workers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createApp } from '../server/index.mjs';
import { newGame, applyMove, findMove, exportReplay } from '../shared/rules.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.DJQ_PLAYWRIGHT_MODULE||'playwright');
const viewports=[[1920,1080],[1600,900],[1366,768],[1280,800],[1024,768],[844,390],[932,430],[390,844],[360,800]];

test('minimal board chrome, color breathing outline and stacked connection and hint buttons',async()=>{
  const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'no-preference'}),page=await context.newPage();
    page.setDefaultTimeout(10000);await page.goto(`http://127.0.0.1:${app.server.address().port}`);await startLocal(page);
    assert.equal(await page.locator('.board-heading,.board-meta,.player-type,.player-score span,.control-heading>div>span').count(),0);
    assert.equal(await page.locator('#board text').count(),0);
    assert.ok((await page.locator('.color-mark').allTextContents()).every(text=>text===''));
    assert.ok((await page.locator('.color-mark').all()).length>0);
    await page.locator('[data-piece="I5"]').click();
    assert.equal(await page.locator('#rotate,#flip').count(),0);
    const corners=await page.locator('#show-corners').boundingBox(),hint=await page.locator('#hint').boundingBox();
    assert.ok(Math.abs(corners.x-hint.x)<1&&hint.y>=corners.y+corners.height,'connections sit above hints');
    assert.equal(await page.locator('#preview rect').count(),5);
    const outline=page.locator('#preview .preview-outline');assert.equal(await outline.count(),1);
    const colors=await outline.evaluate(el=>({stroke:getComputedStyle(el).stroke,fill:getComputedStyle(document.querySelector('#preview rect')).fill}));
    assert.equal(colors.stroke,colors.fill,'preview perimeter uses the actual piece color');
    const phases=await outline.evaluate(async el=>{
      const animation=el.getAnimations()[0];if(!animation)throw Error('Missing breathing animation');
      animation.pause();animation.currentTime=0;await new Promise(requestAnimationFrame);
      const start={filter:getComputedStyle(el).filter,opacity:getComputedStyle(el).strokeOpacity};
      animation.currentTime=1100;await new Promise(requestAnimationFrame);
      return {name:getComputedStyle(el).animationName,start,peak:{filter:getComputedStyle(el).filter,opacity:getComputedStyle(el).strokeOpacity}};
    });
    assert.equal(phases.name,'preview-breathe');assert.notEqual(phases.start.filter,phases.peak.filter);assert.ok(Number(phases.peak.opacity)>Number(phases.start.opacity));
    await page.locator('#confirm-move').click();assert.equal(await outline.count(),0,'committed pieces stop glowing');
    await page.locator('[data-piece="I5"]').click();const yellow=await outline.evaluate(el=>getComputedStyle(el).stroke);assert.notEqual(yellow,colors.stroke);
    await page.locator('#board').focus();await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#confirm-move').isDisabled(),true);assert.equal(await outline.evaluate(el=>getComputedStyle(el).stroke),yellow,'invalid feedback does not change the glow color');
    await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await outline.evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.setViewportSize({width:390,height:844});await page.locator('#show-corners').scrollIntoViewIfNeeded();
    const mobileCorners=await page.locator('#show-corners').boundingBox(),mobileHint=await page.locator('#hint').boundingBox();assert.ok(Math.abs(mobileCorners.x-mobileHint.x)<1&&mobileHint.y>=mobileCorners.y+mobileCorners.height);
  } finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});

test('UI 2.0 fits actual games across desktop tablet and phone sizes',async t=>{
  const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const measurements=[];
  try {
    await mkdir('artifacts/browser/ui-v2',{recursive:true});
    for(const [width,height] of viewports) await t.test(`${width}x${height}`,async()=>{
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000}),page=await context.newPage(),errors=[];
      try {
        page.setDefaultTimeout(15000);
        page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${app.server.address().port}`);await startLocal(page);
        await page.locator('.players-panel').waitFor();
        const summary=await page.locator('.match-context').boundingBox();assert.ok(Math.abs(summary.x+summary.width/2-width/2)<1,'match summary is centered on the viewport');
        await page.waitForFunction(()=>{const b=document.querySelector('#board').getBoundingClientRect();return Math.abs(b.width-b.height)<1&&b.width>150;});
        const b=await page.locator('#board').boundingBox(),left=await page.locator('.players-panel').boundingBox(),right=await page.locator('.control-panel').boundingBox();
        assert.ok(Math.abs(b.width-b.height)<1);assert.ok(b.x>=0&&b.x+b.width<=width+1);assert.ok(b.y>=0&&b.y+b.height<=height+1);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        assert.equal(await page.locator('.player-card').count(),4);assert.equal(await page.locator('[data-piece]').count(),21);
        assert.equal(await page.locator('#selected-piece-preview').count(),1);assert.match(await page.locator('.player-card').first().innerText(),/-89/);
        if(width>=1024&&height>=600) {
          assert.ok(left.x+left.width<=b.x,'players on the left');assert.ok(right.x>=b.x+b.width,'controls on the right');
          await page.locator('#confirm-move').scrollIntoViewIfNeeded();const confirm=await page.locator('#confirm-move').boundingBox();assert.ok(confirm.y>=0&&confirm.y+confirm.height<=height+1);
          assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'desktop has no whole-page scroll');
        }
        const compact=width>height&&height<=560;
        if(compact) {await page.locator('#dock-pieces').click();await page.locator('#game-controls').waitFor({state:'visible'});}
        await page.locator('[data-piece="F5"]').click();
        if(compact) await page.locator('#dock-pieces').click();
        await page.locator('.selection-panel').scrollIntoViewIfNeeded();
        const preview=await page.locator('.selection-preview').boundingBox(),tools=await page.locator('.transform-tools').boundingBox();assert.ok(Math.abs(preview.width-preview.height)<1&&Math.abs(preview.width-tools.width)<1,'square preview and equal columns at every size');
        const shape=await page.locator('#selected-piece-preview').innerHTML();assert.match(await page.locator('#selected-piece-meta').innerText(),/F5/);
        await page.keyboard.press('r');assert.notEqual(await page.locator('#selected-piece-preview').innerHTML(),shape);
        await page.keyboard.press('f');assert.equal(await page.locator('#selected-piece-preview rect').count(),5);
        if(compact&&await page.locator('#close-pieces').isVisible()) await page.locator('#close-pieces').click();
        await page.locator('#board').focus();await page.keyboard.press('Escape');
        assert.equal(await page.locator('#preview rect').count(),0);assert.equal(await page.locator('#selected-piece-preview rect').count(),0);
        if(compact) await page.locator('#dock-pieces').click();
        await page.locator('#hint').click();await page.waitForFunction(()=>document.querySelector('#hint-status').textContent.includes('方案'));
        if(compact&&await page.locator('#close-pieces').isVisible()) await page.locator('#close-pieces').click();
        await page.locator(width<=760||compact?'.mobile-dock [data-action="confirm-move"]':'#confirm-move').click();
        assert.equal(await page.locator('#move-number').innerText(),'1');
        if(compact) await page.locator('#dock-pieces').click();
        await page.locator('[data-piece="I5"]').click();if(compact) await page.locator('#dock-pieces').click();
        await page.locator('#show-corners').click();assert.equal(await page.locator('#show-corners').getAttribute('aria-pressed'),'true');
        assert.equal(await page.locator('#export-replay').count(),0,'export appears only after the game finishes');
        if(compact) await page.locator('#close-pieces').click();
        await page.locator('#board').focus();await page.keyboard.press('Escape');await page.evaluate(()=>window.scrollTo(0,0));
        if(width===1920||compact||width===390) await page.screenshot({path:`artifacts/browser/ui-v2/light-${width}x${height}.png`,fullPage:true});
        await page.locator('#theme-toggle').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
        if(width===1920) await page.screenshot({path:'artifacts/browser/ui-v2/dark-1920x1080.png',fullPage:true});
        measurements.push({width,height,board:Math.round(b.width),threeColumns:width>=1024&&height>=600});assert.deepEqual(errors,[]);
      } finally {await context.close();}
    });
    await writeFile('artifacts/browser/ui-v2/measurements.json',JSON.stringify(measurements,null,2));
  } finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});

test('presence snapshots preserve captured drag while the new layout defers rendering',async()=>{
  const app=createApp({creationLimit:100,requestLimit:2000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    const a=await browser.newPage({viewport:{width:1366,height:768}}),b=await browser.newPage(),base=`http://127.0.0.1:${app.server.address().port}`;
    await a.goto(base);await openSetup(a,'create');await a.locator('#mode-2').click();await a.locator('#create-room').click();const code=await a.locator('#room-code').innerText();
    await b.goto(base);await openSetup(b,'join');await b.locator('#room-code-input').fill(code);await b.locator('#join-room').click();await a.locator('#online-start').click();
    await a.locator('.match-header #countdown').waitFor();assert.equal(await a.locator('.board-section #countdown').count(),0);
    await a.locator('[data-piece="F5"]').click();const board=await a.locator('#board').boundingBox(),cell=board.width/20,last=await a.locator('#preview rect').last().boundingBox(),x=last.x+last.width/2,y=last.y+last.height/2;
    await a.evaluate(()=>{window.testCapturedBoard=document.querySelector('#board');});
    await a.mouse.move(x,y);await a.mouse.down();await a.mouse.move(x+cell*2,y+cell*2,{steps:3});
    await b.close();const end=Date.now()+3000;while(app.store.snapshot(code).players[1].connected) {assert.ok(Date.now()<end);await new Promise(r=>setTimeout(r,10));}
    await a.waitForTimeout(50);assert.equal(await a.evaluate(()=>document.querySelector('#board')===window.testCapturedBoard),true);
    const before=await a.locator('#preview').innerHTML();await a.mouse.move(x+cell*3,y+cell*3,{steps:3});assert.notEqual(await a.locator('#preview').innerHTML(),before);
    await a.mouse.up();assert.equal(await a.locator('#preview rect').count(),5);assert.equal(await a.locator('#move-number').innerText(),'0');
    await a.waitForFunction(()=>document.querySelector('[data-player="1"] .player-state').textContent.includes('离线'));
    assert.equal(await a.evaluate(()=>document.querySelector('#board')===window.testCapturedBoard),true,'presence and gesture completion keep the same board');
  } finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});

test('match regions retain board, inventory, focus and scroll across previews, moves and undo',async()=>{
  const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1366,height:768}});
    await page.goto(`http://127.0.0.1:${app.server.address().port}`);await startLocal(page);
    await page.evaluate(()=>{
      window.stableNodes=['#board','.grid-lines','#board-position','#piece-controls','[data-piece="F5"]','#confirm-move','.player-card'].map(s=>[s,document.querySelector(s)]);
      window.positionMutations=0;
      new MutationObserver(records=>window.positionMutations+=records.length).observe(document.querySelector('#board-position'),{childList:true,subtree:true});
    });
    await page.locator('[data-piece="F5"]').click();
    for(const key of ['r','f','ArrowRight','Escape']) await page.keyboard.press(key);
    await page.locator('[data-piece="I5"]').click();await page.locator('#theme-toggle').click();
    assert.equal(await page.evaluate(()=>stableNodes.every(([s,node])=>node===document.querySelector(s))),true);
    assert.equal(await page.evaluate(()=>positionMutations),0,'previews and theme never rebuild placed tiles');
    await page.locator('#board').focus();await page.keyboard.press('r');
    assert.equal(await page.locator('#board').evaluate(node=>node===document.activeElement),true);
    await page.keyboard.press('Escape');await page.locator('[data-piece="I5"]').click();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#move-number').innerText(),'1');
    assert.ok(await page.evaluate(()=>positionMutations>0),'actual moves update the board content');
    assert.equal(await page.evaluate(()=>stableNodes.slice(0,-1).every(([s,node])=>node===document.querySelector(s))),true);
    assert.equal(await page.locator('.piece.selected').count(),0);
    await page.locator('#undo').click();assert.equal(await page.locator('#move-number').innerText(),'0');
    assert.equal(await page.evaluate(()=>stableNodes.slice(0,-1).every(([s,node])=>node===document.querySelector(s))),true);
    await page.locator('[data-piece="I5"]').click();assert.equal(await page.locator('[data-piece="I5"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('[data-piece="F5"]').getAttribute('aria-pressed'),'false');
  } finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});

test('UI 2.0 keeps modes, disabled states, replay, drawer focus and rotation changes coherent',async t=>{
  const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage(),errors=[];
    page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    const base=`http://127.0.0.1:${app.server.address().port}`;await page.goto(base);
    for(const count of [2,3,4]) {
      await openSetup(page,'local');await page.locator('#mode-'+count).click();if(count===4) await page.locator('[name="game-mode"][value="teams"]').check();
      await startLocal(page);assert.equal(await page.locator('.player-card').count(),count);
      assert.match(await page.locator('.player-card').first().innerText(),count===2?/-178/ : /-89/);
      assert.equal(await page.locator('.neutral-bar').count(),count===3?1:0);assert.equal(await page.locator('.team-cards article').count(),count===4?2:0);
      await page.locator('[data-piece="F5"]').click();assert.equal(await page.locator('#confirm-move').isDisabled(),true,'F5 base orientation does not cover the starting corner');
      await page.locator('#board').focus();const shape=await page.locator('#selected-piece-preview').innerHTML();
      await page.keyboard.press('r');assert.notEqual(await page.locator('#selected-piece-preview').innerHTML(),shape);
      assert.equal(await page.locator('#board').evaluate(n=>n===document.activeElement),true,'rotation preserves board keyboard focus');
      const rotated=await page.locator('#selected-piece-preview').innerHTML();await page.keyboard.press('f');assert.notEqual(await page.locator('#selected-piece-preview').innerHTML(),rotated);
      await page.keyboard.press('Escape');assert.equal(await page.locator('#preview rect').count(),0);
      await page.locator('#hint').click();await page.locator('#confirm-move').click();assert.equal(await page.locator('#move-number').innerText(),'1');
      await page.locator('#log-button').click();assert.equal(await page.locator('#modal .move-log li').count(),1);await page.keyboard.press('Escape');
      await page.locator('#theme-toggle').click();await page.locator('#log-button').click();assert.equal(await page.locator('#modal .move-log li').count(),1);await page.keyboard.press('Escape');
      await page.locator('#undo').click();assert.equal(await page.locator('#move-number').innerText(),'0');
      await page.locator('#home-button').click();
    }
    // Use a validated real midgame history for screenshots, not decorative board cells.
    const game=newGame(4);for(let i=0;i<36;i++) applyMove(game,findMove(game));
    const record=exportReplay(game,['玩家 1','玩家 2','玩家 3','玩家 4']);
    await page.evaluate(record=>localStorage.setItem('djq-local-v1',JSON.stringify(record)),record);await page.reload();await page.locator('#resume-local').click();
    await page.setViewportSize({width:1920,height:1080});
    await page.locator('#hint').click();await page.waitForFunction(()=>!document.querySelector('#confirm-move').disabled);
    if(await page.locator('html').getAttribute('data-theme')==='dark')await page.locator('#theme-toggle').click();
    await page.screenshot({path:'artifacts/browser/ui-v2/desktop-light-midgame.png',fullPage:true});
    await page.locator('#theme-toggle').click();await page.screenshot({path:'artifacts/browser/ui-v2/desktop-dark-midgame.png',fullPage:true});
    await page.setViewportSize({width:844,height:390});
    await page.locator('#dock-pieces').click();assert.equal(await page.locator('#game-controls').getAttribute('aria-modal'),'true');
    assert.equal(await page.locator('.board-section').evaluate(n=>n.inert),true);
    await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('#confirm-move').evaluate(n=>n===document.activeElement),true,'focus wraps inside the drawer');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#dock-pieces').evaluate(n=>n===document.activeElement),true);
    const moveBefore=await page.locator('#preview').innerHTML();await page.locator('[data-action="rotate"]').click();assert.notEqual(await page.locator('#preview').innerHTML(),moveBefore);
    await page.locator('#dock-pieces').click();await page.screenshot({path:'artifacts/browser/ui-v2/phone-landscape-drawer.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>!document.querySelector('#game-controls').hasAttribute('aria-modal')&&!document.querySelector('.board-section').inert);
    assert.equal(await page.locator('#game-controls').getAttribute('aria-modal'),null);
    const board=await page.locator('#board').boundingBox();assert.ok(Math.abs(board.width-board.height)<1);
    await page.setViewportSize({width:844,height:390});assert.equal(await page.locator('#game-controls').isVisible(),false,'rotation closes a stale drawer');
    await page.locator('#home-button').click();
    await page.locator('#import-file').setInputFiles({name:'replay.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(record))});
    await page.locator('[data-action="replay-next"]').click();assert.equal(await page.locator('#move-number').innerText(),'1');
    await page.locator('#dock-pieces').click();assert.equal(await page.locator('[data-piece]').count(),0,'replay has no editable inventory');
    await page.locator('#replay-range').focus();await page.keyboard.press('Home');
    for(let n=0;n<10;n++) await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#move-number').innerText(),'10');
    assert.deepEqual(errors,[]);await context.close();
  } finally {await browser.close();app.shutdown();await new Promise(r=>app.server.close(r));}
});
