import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomStore} from '../server/rooms.mjs';
import {findMove,controller} from '../shared/rules.mjs';
function setup() {
  let time=1000;const jobs=new Map(),botScheduler={request(j){jobs.set(j.context.code,j);},cancel(code){jobs.delete(code);},close(){jobs.clear();}};
  const store=new RoomStore({now:()=>time,botScheduler}),a=store.create({name:'A',players:2}),code=a.room.code;
  const disconnect=store.connect(code,a.token,()=>{});
  store.command(code,a.token,{type:'set-bot',seat:1,level:'standard'});
  store.command(code,a.token,{type:'start'});
  return {store,a,code,jobs,disconnect,clock:v=>{time=v;}};
}
test('bots fill empty seats only and require no connection/readiness to start',()=>{
  const x=setup(),r=x.store.snapshot(x.code);assert.equal(r.phase,'playing');assert.equal(r.players[1].kind,'bot');
  assert.equal(Object.hasOwn(r.players[0],'ready'),false);assert.equal(x.store.tokens.size,1);
  assert.throws(()=>x.store.command(x.code,x.a.token,{type:'set-bot',seat:0,level:'standard'}));
  assert.throws(()=>x.store.command(x.code,x.a.token,{type:'ready',ready:true}),/INVALID_COMMAND/);x.store.close();
});
test('authoritative bot results apply exactly once and stale or disconnected jobs are rejected',()=>{
  const x=setup(),s=x.store.snapshot(x.code);
  x.store.command(x.code,x.a.token,{type:'move',round:1,revision:0,move:findMove(s.game)});
  const job=x.jobs.get(x.code);assert.ok(job);assert.equal(controller(job.game),1);
  assert.throws(()=>x.store.command(x.code,x.a.token,{type:'move',round:1,revision:1,move:findMove(job.game)}),/NOT_YOUR_TURN/);
  x.disconnect();assert.equal(x.store.applyBotResult(job.context,{move:findMove(job.game)}),false);
  x.store.connect(x.code,x.a.token,()=>{});
  assert.equal(x.store.applyBotResult(job.context,{move:findMove(job.game)}),false,'pre-disconnect result stays invalid after reconnect');
  const fresh=x.jobs.get(x.code);assert.ok(x.store.applyBotResult(fresh.context,{move:findMove(fresh.game)}));
  assert.equal(x.store.applyBotResult(fresh.context,{move:findMove(fresh.game)}),false);
  assert.equal(x.store.snapshot(x.code).game.history[1].source,'bot');
  assert.equal(x.store.get(x.code).lastHuman,1000);x.store.close();
});
test('bot timeout falls back once, queue task is cancelled, and last human leave removes room',()=>{
  const x=setup(),s=x.store.snapshot(x.code);x.store.command(x.code,x.a.token,{type:'move',round:1,revision:0,move:findMove(s.game)});
  const job=x.jobs.get(x.code),deadline=x.store.snapshot(x.code).deadline;x.clock(deadline+1);x.store.tick();
  assert.equal(x.store.snapshot(x.code).game.revision,2);assert.equal(x.store.applyBotResult(job.context,{move:findMove(job.game)}),false);
  x.store.command(x.code,x.a.token,{type:'leave'});assert.equal(x.store.rooms.size,0);assert.equal(x.store.tokens.size,0);x.store.close();
});
test('waiting host transfer never promotes a bot or reclaims it as disconnected',()=>{
  let time=0;const store=new RoomStore({now:()=>time}),a=store.create({name:'A',players:4,mode:'teams'}),code=a.room.code;
  const off=store.connect(code,a.token,()=>{});store.command(code,a.token,{type:'set-bot',seat:1,level:'standard'});
  const b=store.join(code,'B');store.connect(code,b.token,()=>{});
  assert.throws(()=>store.command(code,b.token,{type:'set-bot',seat:3,level:'standard'}),/HOST_ONLY/);
  off();time=122000;store.tick();const room=store.snapshot(code);assert.equal(room.host,b.seat);assert.equal(room.players[1].kind,'bot');
  store.close();
});
