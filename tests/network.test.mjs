import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomClient, savedSession, savedSessions } from '../public/network.mjs';

const SESSION_KEY='djq-room-v1',RECOVERY_KEY='djq-recovery-v1';
function storage() {
  const values=new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
function browserStorage(t) {
  for(const key of ['sessionStorage','localStorage']) {
    const original=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value:storage(),configurable:true,writable:true});
    t.after(()=>{if(original) Object.defineProperty(globalThis,key,original);else delete globalThis[key];});
  }
}
function quietClient() {
  const client=new RoomClient({onState:()=>{},onConnection:()=>{},onLost:()=>{}});
  client.request=async()=>({code:client.session.code,version:1,you:0,players:[{name:'Alice'}]});
  client.stream=async()=>{};
  return client;
}

test('client rejects stale room snapshots without rolling the UI back',()=>{
  const states=[];const client=new RoomClient({onState:s=>states.push(s),onConnection:()=>{},onLost:()=>{}});
  client.session={code:'ABC234',token:'x'.repeat(43)};
  client.adopt({code:'ABC234',version:4});client.adopt({code:'ABC234',version:3});client.adopt({code:'DEF567',version:5});
  assert.equal(states.length,1);assert.equal(states[0].version,4);
});
test('HTTP and SSE snapshots of the same version are delivered once, with newer presence accepted',()=>{
  const states=[],client=new RoomClient({onState:s=>states.push(s),onConnection:()=>{},onLost:()=>{}});
  client.session={code:'ABC234',token:'x'.repeat(43)};
  const state={code:'ABC234',version:0,now:1,game:{revision:0}};
  client.adopt(state);client.adopt({...state,now:2});
  client.adopt({...state,version:1,players:[{connected:false}]});
  client.adopt({...state,version:0});
  assert.deepEqual(states.map(s=>s.version),[0,1]);
  assert.equal(states[1].players[0].connected,false);
  for(const version of [undefined,NaN,Infinity,-1,'2',1.5]) client.adopt({...state,version});
  assert.equal(states.length,2);
});
test('reattaching a room resets snapshot deduplication for the newly selected seat',async t=>{
  browserStorage(t);
  const client=quietClient(),states=[];client.onState=state=>states.push(state);
  await client.attach({code:'ABC234',token:'x'.repeat(43)});
  await client.attach({code:'ABC234',token:'y'.repeat(43)});
  assert.deepEqual(states.map(s=>s.version),[1,1]);client.stop();
});
test('obsolete stream cleanup cannot abort a newly attached stream',async()=>{
  const original=globalThis.fetch,signals=[];
  globalThis.fetch=async(path,options)=>new Promise((resolve,reject)=>{
    signals.push(options.signal);options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});
  });
  const client=new RoomClient({onState:()=>{},onConnection:()=>{},onLost:()=>{}});
  client.session={code:'ABC234',token:'x'.repeat(43)};client.running=true;
  const first=client.stream();client.stop(false);client.running=true;const second=client.stream();
  try {await new Promise(r=>setTimeout(r,15));assert.equal(signals[1].aborted,false);}
  finally {client.stop(false);await Promise.all([first,second]);globalThis.fetch=original;}
});
test('saved session rejects invalid or malformed recovery credentials',()=>{
  const values=['{}','null','{"code":"ABC234","token":"short"}','not json'];
  const original=globalThis.sessionStorage;
  try {for(const value of values) {globalThis.sessionStorage={getItem:()=>value};assert.equal(savedSession(),null);}}
  finally {if(original===undefined) delete globalThis.sessionStorage;else globalThis.sessionStorage=original;}
});

test('attached seat survives closing its tab without automatically selecting it in a new tab',async t=>{
  browserStorage(t);
  const seat={code:'ABC234',token:'x'.repeat(43)},client=quietClient();
  await client.attach(seat);client.stop(false);
  globalThis.sessionStorage=storage();
  assert.equal(savedSession(),null);
  const seats=JSON.parse(localStorage.getItem(RECOVERY_KEY));
  assert.ok(Array.isArray(seats),'a durable recovery list must survive tab closure');
  assert.equal(seats.length,1);assert.equal(seats[0].token,seat.token);
});

test('legacy tab session is backed up for recovery and malformed credentials are discarded',t=>{
  browserStorage(t);
  const seat={code:'ABC234',token:'x'.repeat(43)};
  sessionStorage.setItem(SESSION_KEY,JSON.stringify(seat));
  assert.deepEqual(savedSession(),seat);
  assert.equal(JSON.parse(localStorage.getItem(RECOVERY_KEY))?.[0].token,seat.token);
});

test('leaving clears only the current seat while retaining other saved seats',async t=>{
  browserStorage(t);
  const first=quietClient(),second=quietClient();
  await first.attach({code:'ABC234',token:'x'.repeat(43)});
  await second.attach({code:'ABC234',token:'y'.repeat(43)});
  first.stop();
  const seats=JSON.parse(localStorage.getItem(RECOVERY_KEY));
  assert.ok(Array.isArray(seats));assert.deepEqual(seats.map(s=>s.token),['y'.repeat(43)]);
  assert.equal(savedSession().token,'y'.repeat(43),'an old tab must not clear another seat');
});

test('transient attach failure retains credentials while invalid rooms remove them',async t=>{
  browserStorage(t);
  const seat={code:'ABC234',token:'x'.repeat(43)},client=quietClient();
  await client.attach(seat);client.stop(false);
  client.request=async()=>{throw Error('NETWORK_ERROR');};
  await assert.rejects(client.attach(seat),/NETWORK_ERROR/);
  assert.equal(savedSession().token,seat.token);
  client.request=async()=>{throw Error('ROOM_NOT_FOUND');};
  await assert.rejects(client.attach(seat),/ROOM_NOT_FOUND/);
  assert.equal(savedSession(),null);
  assert.deepEqual(JSON.parse(localStorage.getItem(RECOVERY_KEY)),[]);
});

test('storage denial does not prevent playing or attaching a seat',async t=>{
  browserStorage(t);
  for(const key of ['sessionStorage','localStorage']) Object.defineProperty(globalThis,key,{configurable:true,get(){throw Error('storage blocked');}});
  const client=quietClient();await client.attach({code:'ABC234',token:'x'.repeat(43)});
  assert.equal(client.running,true);assert.equal(savedSession(),null);client.stop();
});

test('recovery list rejects corrupt, expired and malformed records',t=>{
  browserStorage(t);
  const valid={code:'ABC234',token:'x'.repeat(43),expiresAt:Date.now()+60000};
  for(const raw of ['not json','null','{}']) {
    localStorage.setItem(RECOVERY_KEY,raw);assert.deepEqual(savedSessions(),[]);
  }
  localStorage.setItem(RECOVERY_KEY,JSON.stringify([null,{},valid,{...valid,token:'short'},
    {...valid,code:['ABC234']},{...valid,expiresAt:Date.now()-1},{...valid,expiresAt:Date.now()+9*3600000}]));
  assert.equal(savedSessions().length,1);assert.equal(savedSessions()[0].code,valid.code);
});

test('recovery records are bounded, deduplicated and retain separate seats in the same room',async t=>{
  browserStorage(t);const client=quietClient();
  for(let i=0;i<22;i++) await client.attach({code:'ABC234',token:String(i).padStart(43,'x')});
  assert.equal(savedSessions().length,20);
  await client.attach({code:'ABC234',token:String(21).padStart(43,'x')});
  assert.equal(savedSessions().length,20);assert.equal(new Set(savedSessions().map(s=>s.token)).size,20);
  assert.ok(savedSessions().every(s=>s.name==='Alice'&&s.seat===0));client.stop(false);
});

test('stream replacement preserves shared recovery but removes the old tab selection',async t=>{
  browserStorage(t);
  const seat={code:'ABC234',token:'x'.repeat(43)};
  await quietClient().attach(seat);
  const original=globalThis.fetch,lost=[];
  t.after(()=>globalThis.fetch=original);
  globalThis.fetch=async()=>new Response('event: fatal\ndata: {"error":"SESSION_REPLACED"}\n\n');
  const client=new RoomClient({onState:()=>{},onConnection:()=>{},onLost:code=>lost.push(code)});
  client.session=seat;client.running=true;await client.stream();
  assert.deepEqual(lost,['SESSION_REPLACED']);assert.equal(savedSession(),null);
  assert.equal(savedSessions()[0].token,seat.token);assert.equal(client.running,false);
});

test('stream authorization loss removes only the rejected recovery record',async t=>{
  browserStorage(t);
  const seat={code:'ABC234',token:'x'.repeat(43)};
  await quietClient().attach(seat);
  const original=globalThis.fetch;
  t.after(()=>globalThis.fetch=original);
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'UNAUTHORIZED'}),{status:401});
  const client=new RoomClient({onState:()=>{},onConnection:()=>{},onLost:()=>{}});
  client.session=seat;client.running=true;await client.stream();
  assert.equal(savedSession(),null);assert.deepEqual(savedSessions(),[]);assert.equal(client.running,false);
});

test('automatic restoration cannot replace a connected seat when Web Locks are unavailable',async t=>{
  browserStorage(t);
  const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
  t.after(()=>{if(original) Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;});
  const seat={code:'ABC234',token:'x'.repeat(43)},client=quietClient();
  client.request=async()=>({code:seat.code,version:1,you:0,players:[{name:'Alice',connected:true}]});
  await assert.rejects(client.attach(seat,{automatic:true}),/SESSION_REPLACED/);
  assert.equal(savedSession(),null);assert.equal(savedSessions().length,1);
  await client.attach(seat);assert.equal(client.running,true);client.stop();
});

test('a stolen seat lock stops the old client even if the new connection fails',async t=>{
  browserStorage(t);
  const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let revoke;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request(name,options,callback){
    const request=new Promise((resolve,reject)=>{revoke=reject;});void callback({name});return request;
  }}}});
  t.after(()=>{if(original) Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;});
  const client=quietClient(),lost=[];client.onLost=reason=>lost.push(reason);t.after(()=>client.stop(false));
  await client.attach({code:'ABC234',token:'x'.repeat(43)});
  revoke(Error('lock stolen'));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(client.running,false);assert.deepEqual(lost,['SESSION_REPLACED']);
  assert.equal(savedSession(),null);assert.equal(savedSessions().length,1);
});
