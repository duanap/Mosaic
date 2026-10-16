import { Worker } from 'node:worker_threads';

/** Bounded reusable worker pool. A room has at most one queued/running job. */
export class BotScheduler {
  constructor({workers=2,budgetMs=400,hardTimeoutMs=1000,maxQueue=100,onResult=()=>{},createWorker=()=>new Worker(new URL('./bot-worker.mjs',import.meta.url))}={}) {
    this.limit=workers;this.budgetMs=budgetMs;this.timeoutMs=hardTimeoutMs;this.maxQueue=maxQueue;this.onResult=onResult;this.createWorker=createWorker;
    this.slots=[];this.jobs=new Map();this.queue=[];this.closed=false;
  }
  request(job) {
    if(this.closed) return;
    const code=job.context.code,old=this.jobs.get(code);
    if(old&&JSON.stringify(old.context)===JSON.stringify(job.context)) return;
    this.cancel(code);
    if(this.jobs.size>=this.maxQueue) {queueMicrotask(()=>{if(!this.closed)this.onResult(job.context,{move:null});});return;}
    this.jobs.set(code,job);this.queue.push(job);this.pump();
  }
  cancel(code) {
    this.jobs.delete(code);this.queue=this.queue.filter(j=>j.context.code!==code);
    for(const slot of this.slots) if(slot.job?.context.code===code) {clearTimeout(slot.timer);slot.job=null;slot.worker?.terminate();slot.worker=null;}
    this.pump();
  }
  pump() {
    if(this.closed) return;
    while(this.queue.length) {
      let slot=this.slots.find(s=>!s.job);
      if(!slot) {if(this.slots.length>=this.limit) return;slot={worker:null,job:null};this.slots.push(slot);}
      const job=this.queue.shift();if(this.jobs.get(job.context.code)!==job) continue;
      slot.job=job;
      const finish=(result,broken=false)=>{
        if(slot.job!==job) return;
        clearTimeout(slot.timer);slot.job=null;this.jobs.delete(job.context.code);
        if(broken) {slot.worker?.terminate();slot.worker=null;} else slot.worker?.unref();
        this.onResult(job.context,result);this.pump();
      };
      try {
        if(!slot.worker) slot.worker=this.createWorker();
        const worker=slot.worker;worker.removeAllListeners('message');worker.removeAllListeners('error');worker.removeAllListeners('exit');
        worker.on('message',data=>finish(data));worker.on('error',()=>finish({move:null},true));
        worker.on('exit',()=>{if(slot.worker===worker) {slot.worker=null;finish({move:null},true);}});
        worker.ref();slot.timer=setTimeout(()=>finish({move:null},true),this.timeoutMs);
        worker.postMessage({game:job.game,options:{budgetMs:this.budgetMs,seed:job.context.revision}});
      } catch {finish({move:null},true);}
    }
  }
  close() {
    this.closed=true;this.jobs.clear();this.queue=[];
    for(const slot of this.slots) {clearTimeout(slot.timer);slot.job=null;slot.worker?.terminate();slot.worker=null;}
  }
}
