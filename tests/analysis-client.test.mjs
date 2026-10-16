import test from 'node:test';
import assert from 'node:assert/strict';
import {AnalysisClient} from '../public/analysis-client.mjs';
test('cancel terminates worker and late response cannot replace a new request',async()=>{
  const workers=[];
  const client=new AnalysisClient({createWorker:()=>{const w={postMessage(data){this.data=data;},terminate(){this.closed=true;}};workers.push(w);return w;}});
  const a=client.analyze({kind:'hints',context:1}),b=client.analyze({kind:'hints',context:2});
  assert.equal(await a,null);assert.ok(workers[0].closed);
  workers[0].onmessage({data:{requestId:1,moves:['old']}});
  workers[1].onmessage({data:{requestId:2,moves:['new']}});
  assert.deepEqual((await b).moves,['new']);assert.ok(workers[1].closed);
});
test('worker startup failure and hard timeout resolve without leaking active work',async()=>{
  const bad=new AnalysisClient({createWorker:()=>{throw Error('blocked');}});assert.equal(await bad.analyze({kind:'bot'}),null);
  let closed=false;const slow=new AnalysisClient({timeoutMs:5,createWorker:()=>({postMessage(){},terminate(){closed=true;}})});
  assert.equal(await slow.analyze({kind:'bot'}),null);assert.ok(closed);assert.equal(slow.active,null);
});
