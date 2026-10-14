const SESSION_KEY='djq-room-v1';
export function savedSession() {
  try {const s=JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return /^[A-HJ-NP-Z2-9]{6}$/.test(s?.code??'')&&/^[A-Za-z0-9_-]{43}$/.test(s?.token??'')?s:null;
  } catch{return null;}
}
export class RoomClient {
  constructor({onState,onConnection,onLost}) {
    this.onState=onState;this.onConnection=onConnection;this.onLost=onLost;
    this.session=null;this.running=false;this.abort=null;this.lastVersion=-1;this.generation=0;
  }
  async request(path,data) {
    let response;
    try {response=await fetch(path,{method:data===undefined?'GET':'POST',cache:'no-store',credentials:'omit',redirect:'error',
      signal:AbortSignal.timeout(10000),headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),
        ...(this.session?{Authorization:`Bearer ${this.session.token}`}:{})},body:data===undefined?undefined:JSON.stringify(data)});
    } catch {throw Error('NETWORK_ERROR');}
    const value=await response.json();if(!response.ok) throw Error(value.error??'NETWORK_ERROR');return value;
  }
  adopt(state) {
    if(!state?.code||state.code!==this.session?.code) return;
    if(state.version<this.lastVersion) return;
    this.lastVersion=state.version??0;this.onState(state);
  }
  async attach(session) {
    this.stop(false);this.session=session;this.lastVersion=-1;
    try {sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));} catch{}
    const state=await this.request(`/api/rooms/${session.code}`);this.adopt(state);
    this.running=true;void this.stream();
  }
  async create(options) {const value=await this.request('/api/rooms',options);await this.attach({code:value.room.code,token:value.token});}
  async join(code,name) {const value=await this.request(`/api/rooms/${code}/join`,{name});await this.attach({code,token:value.token});}
  async command(command) {
    try {const state=await this.request(`/api/rooms/${this.session.code}/commands`,command);this.adopt(state);return state;}
    catch(error) {
      if(error.message==='STALE_STATE') this.adopt(await this.request(`/api/rooms/${this.session.code}`));
      throw error;
    }
  }
  async stream() {
    let wait=500;const generation=this.generation,session=this.session;
    while(this.running&&generation===this.generation) {
      const abort=new AbortController();this.abort=abort;let watchdog;
      try {
        watchdog=setTimeout(()=>abort.abort(),10000);
        const response=await fetch(`/api/rooms/${session.code}/events`,{cache:'no-store',credentials:'omit',redirect:'error',
          headers:{Authorization:`Bearer ${session.token}`},signal:abort.signal});
        if(!response.ok) {const value=await response.json();throw Error(value.error??'NETWORK_ERROR');}
        if(generation!==this.generation||!this.running) break;
        this.onConnection(true);wait=500;
        const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
        for(;;) {
          clearTimeout(watchdog);watchdog=setTimeout(()=>abort.abort(),45000);
          const {done,value}=await reader.read();if(done) break;
          buffer+=decoder.decode(value,{stream:true});if(buffer.length>1048576) throw Error('NETWORK_ERROR');
          let end;
          while((end=buffer.indexOf('\n\n'))>=0) {
            const event=buffer.slice(0,end);buffer=buffer.slice(end+2);
            const line=event.split('\n').find(s=>s.startsWith('data: '));if(!line) continue;
            const value=JSON.parse(line.slice(6));
            if(event.startsWith('event: fatal')) throw Error(value.error);
            if(event.startsWith('event: state')) this.adopt(value);
          }
        }
      } catch(error) {
        if(generation===this.generation&&['UNAUTHORIZED','ROOM_NOT_FOUND','SESSION_REPLACED'].includes(error.message)) {
          this.stop();this.onLost(error.message);break;
        }
      } finally {clearTimeout(watchdog);abort.abort();}
      if(!this.running||generation!==this.generation) break;
      this.onConnection(false);await new Promise(resolve=>setTimeout(resolve,wait));wait=Math.min(wait*2,8000);
    }
  }
  stop(clear=true) {
    this.running=false;this.generation++;this.abort?.abort();this.onConnection(false);
    if(clear) {this.session=null;try{sessionStorage.removeItem(SESSION_KEY);}catch{}}
  }
}
