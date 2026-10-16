import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore } from '../server/rooms.mjs';
import { findMove, controller } from '../shared/rules.mjs';
function setup(count=2,options={}) {
  let time=1000;const store=new RoomStore({now:()=>time,...options});
  const a=store.create({name:'Alice',players:count,scoring:'bonus',turnSeconds:60});
  const seats=[a];for(let i=1;i<count;i++) seats.push(store.join(a.room.code,`P${i+1}`));
  const handles=seats.map(s=>store.connect(a.room.code,s.token,()=>{}));
  return {store,seats,handles,code:a.room.code,clock:v=>{time=v;}};
}
function start(x) {x.store.command(x.code,x.seats[0].token,{type:'start'});return x.store.snapshot(x.code,0);}
function moveCommand(s) {return {type:'move',round:s.round,revision:s.game.revision,move:findMove(s.game)};}
test('room creation, capacity, presence and host-only start',()=>{
  const x=setup(); assert.throws(()=>x.store.join(x.code,'full'),/ROOM_FULL/);
  assert.throws(()=>x.store.command(x.code,x.seats[1].token,{type:'start'}),/HOST_ONLY/);
  x.handles[1]();assert.throws(()=>start(x),/PLAYER_OFFLINE/);
  x.store.connect(x.code,x.seats[1].token,()=>{});assert.equal(start(x).phase,'playing');
});
test('snapshot never discloses tokens and unauthorized access is refused',()=>{
  const x=setup(); const snapshot=JSON.stringify(x.store.snapshot(x.code,0));
  for(const s of x.seats) assert.equal(snapshot.includes(s.token),false);
  assert.throws(()=>x.store.command(x.code,'wrong',{type:'start'}),/UNAUTHORIZED/);
  assert.throws(()=>x.store.connect(x.code,'wrong',()=>{}),/UNAUTHORIZED/);
});
test('valid move broadcasts, stale revision and wrong owner are rejected',()=>{
  const x=setup();const s=start(x),command=moveCommand(s);
  assert.throws(()=>x.store.command(x.code,x.seats[1].token,command),/NOT_YOUR_TURN/);
  x.store.command(x.code,x.seats[0].token,command);
  assert.equal(x.store.snapshot(x.code).game.revision,1);
  assert.throws(()=>x.store.command(x.code,x.seats[0].token,command),/STALE_STATE/);
  assert.throws(()=>x.store.command(x.code,x.seats[1].token,{...moveCommand(x.store.snapshot(x.code)),round:0}),/STALE_STATE/);
});
test('timeout places a real legal move exactly once and resets deadline',()=>{
  const x=setup();const s=start(x);x.clock(s.deadline+1);x.store.tick();
  const n=x.store.snapshot(x.code);assert.equal(n.game.revision,1);assert.equal(n.game.history[0].automatic,true);
  assert.ok(n.deadline>s.deadline);x.store.tick();assert.equal(x.store.snapshot(x.code).game.revision,1);
});
test('disconnect shortens but reconnect never extends current deadline',()=>{
  const x=setup();const s=start(x);x.clock(2000);x.handles[0]();
  const away=x.store.snapshot(x.code);assert.equal(away.deadline,47000);
  x.store.connect(x.code,x.seats[0].token,()=>{});assert.equal(x.store.snapshot(x.code).deadline,away.deadline);
  assert.ok(away.deadline<s.deadline);
});
test('primary blocked seat still controls neutral green in three-player room',()=>{
  const x=setup(3);start(x);
  for(let i=0;i<3;i++) {const s=x.store.snapshot(x.code);x.store.command(x.code,x.seats[i].token,moveCommand(s));}
  const s=x.store.snapshot(x.code);assert.equal(controller(s.game),0);
  x.store.command(x.code,x.seats[0].token,moveCommand(s));assert.equal(x.store.snapshot(x.code).game.neutralCursor,1);
});
test('resignation, rematch without readiness, and old-round commands',()=>{
  const x=setup();const s=start(x);const old=moveCommand(s);
  x.store.command(x.code,x.seats[0].token,{type:'resign',round:s.round,revision:s.game.revision});
  assert.equal(x.store.snapshot(x.code).phase,'finished');
  x.store.command(x.code,x.seats[0].token,{type:'rematch'});
  assert.equal(x.store.snapshot(x.code).phase,'waiting');
  const n=start(x);
  assert.notEqual(n.round,s.round);assert.throws(()=>x.store.command(x.code,x.seats[0].token,old),/STALE_STATE/);
});
test('waiting leave transfers host, revokes token, and removes empty rooms',()=>{
  const x=setup();x.store.command(x.code,x.seats[0].token,{type:'leave'});
  assert.equal(x.store.snapshot(x.code).host,1);assert.throws(()=>x.store.authorize(x.code,x.seats[0].token),/UNAUTHORIZED/);
  x.store.command(x.code,x.seats[1].token,{type:'leave'});assert.equal(x.store.rooms.size,0);assert.equal(x.store.tokens.size,0);
});
test('limits, bad options, and idle cleanup',()=>{
  const x=setup(2,{maxRooms:1});assert.throws(()=>x.store.create({name:'Bob',players:2}),/SERVER_FULL/);
  x.handles.forEach(fn=>fn());x.clock(16*60*1000);x.store.tick();assert.equal(x.store.rooms.size,0);
  for(const options of [{players:5},{players:2,name:''},{players:2,name:'a',turnSeconds:1},{players:2,name:'a',scoring:'bogus'}])
    assert.throws(()=>new RoomStore().create(options));
});
test('stream replacement does not grow connections and old disconnect cannot disconnect new stream',()=>{
  const x=setup();x.store.connect(x.code,x.seats[0].token,()=>{});x.handles[0]();
  assert.equal(x.store.snapshot(x.code).players[0].connected,true);
});
test('unrelated resignation must not extend another controller deadline',()=>{
  const x=setup(4);const s=start(x);x.clock(9000);
  x.store.command(x.code,x.seats[2].token,{type:'resign',round:s.round,revision:0});
  assert.equal(x.store.snapshot(x.code).deadline,s.deadline);
});
test('inactive waiting host is released after recovery grace and host transfers',()=>{
  const x=setup();x.handles[0]();x.clock(122000);x.store.tick();
  const state=x.store.snapshot(x.code);assert.equal(state.host,1);assert.equal(state.players[0],null);
  assert.throws(()=>x.store.authorize(x.code,x.seats[0].token),/UNAUTHORIZED/);
  const replacement=x.store.join(x.code,'New');assert.equal(replacement.seat,0);
});
test('replaced stream gets explicit fatal reason and room versions are monotonic',()=>{
  const x=setup();const reasons=[];
  x.store.connect(x.code,x.seats[0].token,()=>{},reason=>reasons.push(reason));
  const before=x.store.snapshot(x.code).version;
  x.store.connect(x.code,x.seats[0].token,()=>{});
  assert.deepEqual(reasons,['SESSION_REPLACED']);assert.ok(x.store.snapshot(x.code).version>before);
});
