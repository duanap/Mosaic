import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomClient, savedSession } from '../public/network.mjs';

test('client rejects stale room snapshots without rolling the UI back',()=>{
  const states=[];const client=new RoomClient({onState:s=>states.push(s),onConnection:()=>{},onLost:()=>{}});
  client.session={code:'ABC234',token:'x'.repeat(43)};
  client.adopt({code:'ABC234',version:4});client.adopt({code:'ABC234',version:3});client.adopt({code:'DEF567',version:5});
  assert.equal(states.length,1);assert.equal(states[0].version,4);
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
