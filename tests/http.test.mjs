import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/index.mjs';
import { findMove } from '../shared/rules.mjs';
async function run(t,options={}) {
  const app=createApp(options);app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const base=`http://127.0.0.1:${app.server.address().port}`;
  t.after(async()=>{app.shutdown();await new Promise(resolve=>app.server.close(resolve));});
  const request=async(path,body,token,headers={})=>{
    const res=await fetch(base+path,{method:body===undefined?'GET':'POST',
      headers:{...(body!==undefined?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`} : {}),...headers},
      body:body===undefined?undefined:JSON.stringify(body)});
    return {status:res.status,headers:res.headers,body:await res.json()};
  };
  return {app,base,request};
}
test('health, security headers, static path boundary and unknown methods',async t=>{
  const {base,request}=await run(t);
  const health=await request('/api/health');assert.equal(health.body.ok,true);assert.equal(health.headers.get('cache-control'),'no-store');
  const page=await fetch(base+'/');assert.equal(page.status,200);assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  for(const path of ['/server/index.mjs','/.env','/../package.json','/shared/../server/rooms.mjs']) assert.equal((await fetch(base+path)).status,404);
  assert.equal((await fetch(base+'/api/health',{method:'DELETE'})).status,405);
});
test('real HTTP create, join, authentication and illegal commands',async t=>{
  const {request}=await run(t);
  const a=await request('/api/rooms',{name:'Alice',players:2});assert.equal(a.status,201);
  const code=a.body.room.code,b=await request(`/api/rooms/${code}/join`,{name:'Bob'});assert.equal(b.status,201);
  assert.equal((await request(`/api/rooms/${code}`)).status,401);
  const snap=await request(`/api/rooms/${code}`,undefined,a.body.token);assert.equal(snap.body.you,0);
  assert.equal(JSON.stringify(snap.body).includes(a.body.token),false);
  assert.equal((await request(`/api/rooms/${code}/commands`,{type:'start'},b.body.token)).status,403);
  assert.equal((await request('/api/rooms',{name:'invalid',players:1})).status,400);
});
test('JSON/body limits and cross-origin write protection',async t=>{
  const {base,request}=await run(t);
  assert.equal((await request('/api/rooms',{name:'a',players:2},null,{origin:'https://evil.invalid'})).status,403);
  assert.equal((await fetch(base+'/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:'{'})).status,400);
  assert.equal((await fetch(base+'/api/rooms',{method:'POST',headers:{'content-type':'text/plain'},body:'{}'})).status,415);
  assert.equal((await request('/api/rooms',{name:'x'.repeat(9000),players:2})).status,413);
});
test('authenticated SSE receives a current snapshot and can reconnect',async t=>{
  const {base,request}=await run(t);const a=(await request('/api/rooms',{name:'A',players:2})).body;
  const abort=new AbortController();
  const res=await fetch(`${base}/api/rooms/${a.room.code}/events`,{headers:{authorization:`Bearer ${a.token}`},signal:abort.signal});
  assert.equal(res.status,200);assert.ok(res.headers.get('content-type').startsWith('text/event-stream'));
  const reader=res.body.getReader();const chunk=new TextDecoder().decode((await reader.read()).value);
  assert.ok(chunk.includes('event: state'));assert.ok(chunk.includes('"connected":true'));assert.equal(chunk.includes(a.token),false);
  abort.abort();await reader.cancel().catch(()=>{});
  const snapshot=await request(`/api/rooms/${a.room.code}`,undefined,a.token);assert.equal(snapshot.status,200);
});
test('two clients play through real HTTP and replay export contains only game data',async t=>{
  const {app,request}=await run(t);const a=(await request('/api/rooms',{name:'A',players:2})).body;
  const code=a.room.code,b=(await request(`/api/rooms/${code}/join`,{name:'B'})).body;
  for(const p of [a,b]) {app.store.connect(code,p.token,()=>{});await request(`/api/rooms/${code}/commands`,{type:'ready',ready:true},p.token);}
  let state=(await request(`/api/rooms/${code}/commands`,{type:'start'},a.token)).body;
  const command={type:'move',round:state.round,revision:state.game.revision,move:findMove(state.game)};
  assert.equal((await request(`/api/rooms/${code}/commands`,command,b.token)).status,403);
  state=(await request(`/api/rooms/${code}/commands`,command,a.token)).body;assert.equal(state.game.revision,1);
  assert.equal((await request(`/api/rooms/${code}/commands`,command,a.token)).status,409);
  const record=await request(`/api/rooms/${code}/replay`,undefined,a.token);
  assert.equal(record.body.actions.length,1);assert.equal(JSON.stringify(record.body).includes(a.token),false);
});
test('general and room-creation request limits are enforced',async t=>{
  const {request}=await run(t,{requestLimit:3,creationLimit:1});
  assert.equal((await request('/api/rooms',{name:'A',players:2})).status,201);
  assert.equal((await request('/api/rooms',{name:'B',players:2})).status,429);
  await request('/api/health');assert.equal((await request('/api/health')).status,429);
});
