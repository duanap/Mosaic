/** One worker per active analysis; cancellation really stops computation. */
export class AnalysisClient {
  constructor({createWorker=()=>new Worker('/analysis-worker.mjs',{type:'module'}),timeoutMs=1000}={}) {this.createWorker=createWorker;this.timeoutMs=timeoutMs;this.sequence=0;this.active=null;}
  cancel() {if(this.active) this.active.finish(null);}
  analyze({context,kind,game,options}) {
    this.cancel();const requestId=++this.sequence;
    return new Promise(resolve=>{
      let worker,timer;
      const finish=value=>{if(this.active?.requestId!==requestId) return;clearTimeout(timer);worker?.terminate();this.active=null;resolve(value);};
      this.active={requestId,finish};
      try {
        worker=this.createWorker();worker.onmessage=({data})=>{if(data.requestId===requestId) finish(data.error?null:data);};
        worker.onerror=()=>finish(null);timer=setTimeout(()=>finish(null),kind==='hints'?10000:this.timeoutMs);
        worker.postMessage({requestId,context,kind,game,options});
      } catch {finish(null);}
    });
  }
}
