const SESSION_KEY='djq-room-v1';
const RECOVERY_KEY='djq-recovery-v1',RECOVERY_TTL=8*3600000;
const validSession=s=>typeof s?.code==='string'&&/^[A-HJ-NP-Z2-9]{6}$/.test(s.code)&&
  typeof s?.token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(s.token);
export function savedSessions() {
  try {
    const seats=JSON.parse(localStorage.getItem(RECOVERY_KEY));
    if(!Array.isArray(seats)) return [];
    return seats.filter(s=>validSession(s)&&Number.isFinite(s.expiresAt)&&s.expiresAt>Date.now()&&s.expiresAt<=Date.now()+RECOVERY_TTL)
      .slice(0,20).map(s=>({code:s.code,token:s.token,expiresAt:s.expiresAt,
        name:typeof s.name==='string'?s.name.slice(0,40):'',seat:Number.isInteger(s.seat)&&s.seat>=0&&s.seat<4?s.seat:null}));
  } catch{return [];}
}
function rememberSession(session,state=null) {
  const seats=savedSessions(),previous=seats.find(s=>s.token===session.token&&s.code===session.code);
  const name=state?.players?.[state.you]?.name??previous?.name??'';
  const entry={code:session.code,token:session.token,expiresAt:previous?.expiresAt??Date.now()+RECOVERY_TTL,
    name:typeof name==='string'?name.slice(0,40):'',seat:state?.you??previous?.seat??null};
  try {localStorage.setItem(RECOVERY_KEY,JSON.stringify([entry,...seats.filter(s=>s.token!==session.token||s.code!==session.code)].slice(0,20)));} catch{}
}
function clearTabSession(session) {
  if(!session) return;
  try {
    const current=JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if(current?.code===session.code&&current?.token===session.token) sessionStorage.removeItem(SESSION_KEY);
  } catch{}
}
function clearSession(session) {
  if(!session) return;
  clearTabSession(session);
  try {localStorage.setItem(RECOVERY_KEY,JSON.stringify(savedSessions().filter(s=>s.code!==session.code||s.token!==session.token)));} catch{}
}
export function savedSession() {
  try {const s=JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if(!validSession(s)) return null;
    const session={code:s.code,token:s.token};rememberSession(session);return session;
  } catch{return null;}
}
export class RoomClient {
  constructor({onState,onConnection,onLost}) {
    this.onState=onState;this.onConnection=onConnection;this.onLost=onLost;
    this.session=null;this.running=false;this.abort=null;this.lastVersion=-1;this.generation=0;this.releaseSeat=null;
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
    if(!Number.isSafeInteger(state.version)||state.version<0||state.version<=this.lastVersion) return;
    this.lastVersion=state.version;this.onState(state);
  }
  async holdSeat(session,automatic) {
    const locks=globalThis.navigator?.locks;if(!locks) return false;
    const generation=this.generation;let acquired=false;
    await new Promise((resolve,reject)=>{
      // A copied tab inherits sessionStorage. Only an explicit recovery may steal its seat lock.
      locks.request(`djq-seat:${session.code}:${session.token}`,automatic?{ifAvailable:true}:{steal:true},lock=>{
        if(!lock||generation!==this.generation) {reject(Error('SESSION_REPLACED'));return;}
        const held=new Promise(release=>{this.releaseSeat=release;});acquired=true;resolve();return held;
      }).catch(error=>{
        if(!acquired) reject(error);
        else if(generation===this.generation) {this.releaseSelection();this.onLost('SESSION_REPLACED');}
      });
    });
    return true;
  }
  releaseSelection() {
    this.stop(false);clearTabSession(this.session);this.session=null;
  }
  async attach(session,{automatic=false}={}) {
    if(!validSession(session)) throw Error('UNAUTHORIZED');
    this.stop(false);this.session=session;this.lastVersion=-1;
    const generation=this.generation;
    try {sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));} catch{}
    rememberSession(session);
    try {
      const locked=await this.holdSeat(session,automatic);
      if(generation!==this.generation) return;
      const state=await this.request(`/api/rooms/${session.code}`);
      if(generation!==this.generation) return;
      // In insecure/older browsers, require explicit recovery if the seat is still connected.
      if(automatic&&!locked&&state.players?.[state.you]?.connected) throw Error('SESSION_REPLACED');
      rememberSession(session,state);this.adopt(state);
      this.running=true;void this.stream();
    }
    catch(error) {
      if(generation!==this.generation) return;
      if(['UNAUTHORIZED','ROOM_NOT_FOUND'].includes(error.message)) this.stop();
      else if(error.message==='SESSION_REPLACED') this.releaseSelection();
      else this.stop(false);
      throw error;
    }
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
          if(error.message==='SESSION_REPLACED') this.releaseSelection();else this.stop();
          this.onLost(error.message);break;
        }
      } finally {clearTimeout(watchdog);abort.abort();}
      if(!this.running||generation!==this.generation) break;
      this.onConnection(false);await new Promise(resolve=>setTimeout(resolve,wait));wait=Math.min(wait*2,8000);
    }
  }
  stop(clear=true) {
    this.running=false;this.generation++;this.abort?.abort();this.releaseSeat?.();this.releaseSeat=null;this.onConnection(false);
    if(clear) {clearSession(this.session);this.session=null;}
  }
}
