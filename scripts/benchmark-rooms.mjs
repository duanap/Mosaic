/** Local bounded-load exercise, no external services. */
import {createApp} from '../server/index.mjs';
import {findMove,controller} from '../shared/rules.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
const app=createApp({requestLimit:10000,creationLimit:500});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${app.server.address().port}`,rooms=[],latencies=[],botDelays=[],starts=new Map();
try {
  for(let i=0;i<12;i++) {
    const a=app.store.create({name:'Load '+i,players:2}),code=a.room.code;
    app.store.connect(code,a.token,s=>{
      const start=starts.get(code);
      if(start!==undefined&&s.game?.history.at(-1)?.source==='bot') {botDelays.push(performance.now()-start);starts.delete(code);}
    });
    app.store.command(code,a.token,{type:'set-bot',seat:1,level:'standard'});app.store.command(code,a.token,{type:'start'});rooms.push({code,token:a.token});
  }
  const poll=(async()=>{
    for(let i=0;i<100;i++) {
      const begin=performance.now(),response=await fetch(base+'/api/health');
      if(!response.ok) throw Error('Health request failed');
      await response.json();latencies.push(performance.now()-begin);await new Promise(r=>setTimeout(r,5));
    }
  })();
  for(let round=0;round<4;round++) {
    for(const {code,token} of rooms) {
      const s=app.store.snapshot(code);if(controller(s.game)!==0) throw Error('Unexpected owner');
      starts.set(code,performance.now());app.store.command(code,token,{type:'move',round:s.round,revision:s.game.revision,move:findMove(s.game)});
    }
    const deadline=Date.now()+5000;
    while(rooms.some(({code})=>controller(app.store.snapshot(code).game)!==0)) {
      if(Date.now()>deadline) throw Error('Worker queue stalled');await new Promise(r=>setTimeout(r,5));
    }
  }
  await poll;latencies.sort((a,b)=>a-b);botDelays.sort((a,b)=>a-b);
  const report={rooms:12,humanMoves:48,botMoves:botDelays.length,httpRequests:latencies.length,
    httpMs:{p95:latencies[Math.floor(latencies.length*.95)],max:latencies.at(-1)},
    botBroadcastMs:{p95:botDelays[Math.floor(botDelays.length*.95)],max:botDelays.at(-1)},workers:app.store.bots.slots.length};
  await mkdir('artifacts/bots',{recursive:true});await writeFile('artifacts/bots/concurrency.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {app.shutdown();await new Promise(r=>app.server.close(r));}
