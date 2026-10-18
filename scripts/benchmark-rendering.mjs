/** Optional Playwright benchmark: production sources, fixed positions, same browser. */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createApp } from '../server/index.mjs';
import { newGame, applyMove, findMove, exportReplay } from '../shared/rules.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.DJQ_PLAYWRIGHT_MODULE||'playwright');
const baseline=process.argv[2]||'HEAD';
const original=new Map(['app.mjs','game-ui.mjs'].map(file=>[file,execFileSync('git',['show',`${baseline}:public/${file}`],{encoding:'utf8'})]));
const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
let browser;
try {
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const results=[];
  for(const [width,height] of [[1366,768],[390,844]]) for(const turns of [0,32,52]) {
    const game=newGame(4);for(let n=0;n<turns&&game.status==='playing';n++) applyMove(game,findMove(game));
    if(game.status!=='playing') throw Error('Benchmark fixture must remain playable');
    for(const implementation of ['baseline','current']) {
      const page=await browser.newPage({viewport:{width,height}}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      try {
        if(implementation==='baseline') for(const [file,body] of original) await page.route(`**/${file}`,route=>route.fulfill({contentType:'text/javascript',body}));
        const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
        await page.goto(`http://127.0.0.1:${app.server.address().port}`);
        await page.evaluate(record=>localStorage.setItem('djq-local-v1',JSON.stringify(record)),exportReplay(game));
        await page.reload();await page.locator('#resume-local').click();
        const result=await page.evaluate(async()=>{
          document.querySelector('.piece:not(:disabled)').click();
          const transform=n=>document.querySelector('#board').dispatchEvent(new KeyboardEvent('keydown',{key:n%2?'f':'r',bubbles:true}));
          for(let n=0;n<12;n++) transform(n);
          await new Promise(requestAnimationFrame);
          const board=document.querySelector('#board'),piece=document.querySelector('.piece'),times=[];
          let boardReplacements=0,mutationRecords=0;
          const observer=new MutationObserver(records=>{
            mutationRecords+=records.length;
            for(const record of records) for(const node of record.removedNodes) if(node.nodeType===1&&(node.id==='board'||node.querySelector('#board'))) boardReplacements++;
          });
          observer.observe(document.querySelector('#app'),{childList:true,subtree:true});
          for(let n=0;n<80;n++) {
            const start=performance.now();
            transform(n);
            times.push(performance.now()-start);
          }
          await Promise.resolve();observer.disconnect();times.sort((a,b)=>a-b);
          return {actions:times.length,totalMs:times.reduce((a,b)=>a+b,0),p50Ms:times[39],p95Ms:times[75],boardReplacements,mutationRecords,
            boardRetained:board===document.querySelector('#board'),pieceRetained:piece===document.querySelector('.piece')};
        });
        if(errors.length) throw Error(errors.join('; '));
        results.push({implementation,width,height,turns,...result});
      } finally {await page.close();}
    }
  }
  const report={generatedAt:new Date().toISOString(),baseline,baselineCommit:execFileSync('git',['rev-parse',baseline],{encoding:'utf8'}).trim(),browser:browser.version(),cpuThrottle:4,warmupActions:12,
    note:'Synchronous transform-handler work under synthetic keyboard input; not physical mobile FPS or end-to-end latency.',results};
  await mkdir('artifacts/rendering',{recursive:true});await writeFile('artifacts/rendering/benchmark.json',JSON.stringify(report,null,2)+'\n');
  console.table(results.map(({implementation,width,turns,totalMs,p95Ms,boardReplacements})=>({implementation,width,turns,totalMs:Math.round(totalMs),p95Ms:Math.round(p95Ms*10)/10,boardReplacements})));
} finally {await browser?.close();app.shutdown();await new Promise(r=>app.server.close(r));}
