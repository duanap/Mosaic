import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {BotScheduler} from '../server/bots.mjs';
import {newGame,validateMove} from '../shared/rules.mjs';
const job=code=>({context:{code,revision:0},game:newGame(2)});
class FakeWorker extends EventEmitter {
  postMessage(value){this.value=value;}
  terminate(){this.closed=true;}
  ref(){}
  unref(){}
}
test('pool is bounded, deduplicates, cancels running work and ignores late output',()=>{
  const workers=[],results=[],pool=new BotScheduler({workers:1,createWorker:()=>{const w=new FakeWorker();workers.push(w);return w;},onResult:(c,r)=>results.push([c,r])});
  pool.request(job('A'));pool.request(job('A'));pool.request(job('B'));assert.equal(workers.length,1);assert.equal(pool.jobs.size,2);
  pool.cancel('A');assert.ok(workers[0].closed);assert.equal(workers.length,2);
  workers[0].emit('message',{move:'old'});assert.equal(results.length,0);
  workers[1].emit('message',{move:'new'});assert.equal(results.length,1);assert.equal(results[0][0].code,'B');
  workers[1].emit('exit',0);pool.request(job('C'));assert.equal(workers.length,3,'idle worker exits must not leave a dead reusable slot');pool.close();
});
test('hard timeout and worker crash provide one fallback result and free the slot',async()=>{
  const workers=[],results=[],pool=new BotScheduler({workers:1,hardTimeoutMs:10,createWorker:()=>{const w=new FakeWorker();workers.push(w);return w;},onResult:(c,r)=>results.push([c,r])});
  pool.request(job('A'));await new Promise(r=>setTimeout(r,30));assert.equal(results.length,1);assert.ok(workers[0].closed);
  pool.request(job('B'));workers[1].emit('error',Error('crash'));assert.equal(results.length,2);assert.equal(pool.jobs.size,0);pool.close();
});
test('actual module worker computes a legal result and terminates on close',async()=>{
  let pool;const result=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('worker did not return')),3000);
    pool=new BotScheduler({onResult:(context,value)=>{clearTimeout(timer);resolve(value);}});pool.request(job('real'));
  }).finally(()=>pool?.close());
  assert.ok(result.move);assert.ok(validateMove(newGame(2),result.move).ok);assert.ok(result.metrics.evaluated>0);
});
