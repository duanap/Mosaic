import { randomBytes, randomInt } from 'node:crypto';
import { newGame, applyMove, findMove, controller, resign } from '../shared/rules.mjs';

const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codePattern=/^[A-HJ-NP-Z2-9]{6}$/;
export class RoomError extends Error {
  constructor(code,status=400) {super(code);this.status=status;}
}
const fail=(code,status)=>{throw new RoomError(code,status);};
function displayName(value) {
  if(typeof value!=='string') fail('INVALID_NAME');
  const name=value.replace(/[\u0000-\u001f\u007f-\u009f]/g,'').trim();
  if(!name || [...name].length>20) fail('INVALID_NAME');return name;
}

/** All mutation is synchronous; commands cannot interleave inside a turn. */
export class RoomStore {
  constructor({now=Date.now,maxRooms=100}={}) {
    this.now=now;this.maxRooms=maxRooms;this.rooms=new Map();this.tokens=new Map();
  }
  get(code) {
    if(typeof code!=='string'||!codePattern.test(code)) fail('ROOM_NOT_FOUND',404);
    const room=this.rooms.get(code);if(!room) fail('ROOM_NOT_FOUND',404);return room;
  }
  addMember(room,seat,name) {
    const token=randomBytes(32).toString('base64url');
    const member={name:displayName(name),token,ready:false,connected:false,disconnectedAt:this.now(),listener:null,left:false};
    room.players[seat]=member;this.tokens.set(token,{code:room.code,seat});room.lastHuman=this.now();
    return {token,seat,room:this.snapshot(room.code,seat)};
  }
  create({name,players=4,scoring='bonus',turnSeconds=90}={}) {
    if(this.rooms.size>=this.maxRooms) fail('SERVER_FULL',503);
    displayName(name);
    if(![2,3,4].includes(players)||!['simple','bonus'].includes(scoring)||![30,60,90,120].includes(turnSeconds)) fail('INVALID_OPTIONS');
    let code;do {code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');} while(this.rooms.has(code));
    const room={code,capacity:players,scoring,turnSeconds,host:0,players:Array(players).fill(null),phase:'waiting',
      game:null,round:0,version:0,deadline:null,createdAt:this.now(),lastHuman:this.now(),endedAt:null};
    this.rooms.set(code,room);return this.addMember(room,0,name);
  }
  join(code,name) {
    const room=this.get(code);displayName(name);
    if(room.phase!=='waiting') fail('GAME_STARTED',409);
    const seat=room.players.indexOf(null);if(seat<0) fail('ROOM_FULL',409);
    const result=this.addMember(room,seat,name);this.emit(room);return result;
  }
  authorize(code,token) {
    const room=this.get(code);
    const link=typeof token==='string'&&token.length===43?this.tokens.get(token):null;
    if(!link||link.code!==code||!room.players[link.seat]||room.players[link.seat].left) fail('UNAUTHORIZED',401);
    return {room,seat:link.seat,member:room.players[link.seat]};
  }
  snapshot(code,you=null) {
    const room=this.get(code);
    return {code,capacity:room.capacity,scoring:room.scoring,turnSeconds:room.turnSeconds,host:room.host,phase:room.phase,
      round:room.round,version:room.version,deadline:room.deadline,now:this.now(),you,
      players:room.players.map((p,id)=>p?{id,name:p.name,ready:p.ready,connected:p.connected,left:p.left}:null),
      game:room.game?structuredClone(room.game):null};
  }
  emit(room) {
    room.version++;
    for(let i=0;i<room.players.length;i++) {
      const member=room.players[i];
      if(member?.listener) {
        try {member.listener.send(this.snapshot(room.code,i));}
        catch {member.listener.close();}
      }
    }
  }
  connect(code,token,send,close=()=>{}) {
    const {room,seat,member}=this.authorize(code,token);
    const previous=member.listener;
    const listener={id:Symbol('stream'),send,close};member.listener=listener;
    member.connected=true;member.disconnectedAt=null;room.lastHuman=this.now();
    if(previous) previous.close('SESSION_REPLACED');
    this.emit(room);
    return ()=>{
      if(member.listener!==listener) return;
      member.listener=null;member.connected=false;member.disconnectedAt=this.now();
      if(room.phase==='playing' && controller(room.game)===seat)
        room.deadline=Math.min(room.deadline,this.now()+45000);
      if(this.rooms.has(code)) this.emit(room);
    };
  }
  setDeadline(room) {
    if(room.game.status==='finished') {
      room.phase='finished';room.deadline=null;room.endedAt=this.now();return;
    }
    room.phase='playing';room.deadline=this.now()+room.turnSeconds*1000;
    if(!room.players[controller(room.game)]?.connected) room.deadline=Math.min(room.deadline,this.now()+45000);
  }
  command(code,token,command) {
    const {room,seat,member}=this.authorize(code,token);
    if(!command||typeof command!=='object'||Array.isArray(command)) fail('INVALID_COMMAND');
    const type=command.type;
    const originalTurn=room.game?.turn,originalController=room.game?controller(room.game):null,originalDeadline=room.deadline;
    if(type==='ready') {
      if(room.phase!=='waiting'||typeof command.ready!=='boolean') fail('INVALID_COMMAND');
      member.ready=command.ready;
    } else if(type==='start') {
      if(seat!==room.host) fail('HOST_ONLY',403);
      if(room.phase!=='waiting') fail('GAME_STARTED',409);
      if(room.players.some(p=>!p||!p.ready||!p.connected||p.left)) fail('NOT_READY',409);
      room.game=newGame(room.capacity,room.scoring);room.round++;this.setDeadline(room);
    } else if(type==='move'||type==='resign') {
      if(room.phase!=='playing') fail('GAME_NOT_ACTIVE',409);
      if(command.round!==room.round||command.revision!==room.game.revision) fail('STALE_STATE',409);
      if(type==='move') {
        if(controller(room.game)!==seat) fail('NOT_YOUR_TURN',403);
        try {applyMove(room.game,command.move);} catch(error) {fail(error.message);}
      } else {
        try {resign(room.game,seat);} catch(error) {fail(error.message);}
      }
      this.setDeadline(room);
    } else if(type==='rematch') {
      if(seat!==room.host) fail('HOST_ONLY',403);
      if(room.phase!=='finished') fail('GAME_NOT_FINISHED',409);
      room.phase='waiting';room.game=null;room.deadline=null;room.endedAt=null;
      room.players.forEach((p,i)=>{if(p?.left) room.players[i]=null;else if(p) p.ready=false;});
    } else if(type==='leave') {
      if(room.phase==='playing'&&!room.game.resigned[seat]) {resign(room.game,seat);this.setDeadline(room);}
      this.tokens.delete(member.token);member.left=true;member.ready=false;member.connected=false;
      const listener=member.listener;member.listener=null;listener?.close();
      if(room.phase!=='playing') room.players[seat]=null;
      if(room.host===seat) room.host=room.players.findIndex(p=>p&&!p.left);
      if(room.host<0) {this.remove(room);return {left:true};}
    } else fail('INVALID_COMMAND');
    if((type==='resign'||type==='leave')&&room.phase==='playing'&&room.game.turn===originalTurn&&controller(room.game)===originalController) room.deadline=originalDeadline;
    room.lastHuman=this.now();this.emit(room);return this.snapshot(code,seat);
  }
  remove(room) {
    this.rooms.delete(room.code);
    for(const p of room.players) if(p) {
      this.tokens.delete(p.token);const listener=p.listener;p.listener=null;listener?.close('ROOM_NOT_FOUND');
    }
  }
  tick() {
    const now=this.now();
    for(const room of this.rooms.values()) {
      if(room.phase==='waiting') {
        let changed=false;
        room.players.forEach((p,i)=>{
          if(p&&!p.connected&&p.disconnectedAt!==null&&now-p.disconnectedAt>120000) {
            this.tokens.delete(p.token);room.players[i]=null;changed=true;
          }
        });
        if(changed) {
          if(!room.players[room.host]) room.host=room.players.findIndex(p=>p&&!p.left);
          if(room.host<0) {this.remove(room);continue;}
          this.emit(room);
        }
      }
      const noConnections=room.players.every(p=>!p?.connected);
      if(now-room.createdAt>8*3600000 || (noConnections&&now-room.lastHuman>15*60000) ||
        (room.phase==='waiting'&&now-room.lastHuman>30*60000) || (room.endedAt!==null&&now-room.endedAt>30*60000)) {
        this.remove(room);continue;
      }
      if(room.phase==='playing' && now>=room.deadline) {
        const move=findMove(room.game);
        if(move) applyMove(room.game,move,{automatic:true});
        else throw Error('INVARIANT_NO_CURRENT_MOVE');
        this.setDeadline(room);this.emit(room);
      }
    }
  }
  close() {for(const room of this.rooms.values()) this.remove(room);}
}
