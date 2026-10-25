/** Deterministic rules shared by the browser and the authoritative server. */
import { enumerateMoves } from './moves.mjs';
import { normalizeMode, normalizeSeats } from './modes.mjs';
export const SIZE = 20;
export const COLORS = ['blue', 'yellow', 'red', 'green'];
export const CORNERS = [[0,0],[19,0],[19,19],[0,19]];
const smallCorners=[[0,0],[13,0],[13,13],[0,13]];
const duelCorners=[[0,0],[13,13]];
export const boardSize=game=>game.boardSize??SIZE;
export const boardCorners=game=>game.mode==='duel'?duelCorners:boardSize(game)===14?smallCorners:CORNERS;
export const PIECES = [
  ['I1',[[0,0]]], ['I2',[[0,0],[1,0]]],
  ['I3',[[0,0],[1,0],[2,0]]], ['L3',[[0,0],[0,1],[1,1]]],
  ['I4',[[0,0],[1,0],[2,0],[3,0]]], ['O4',[[0,0],[1,0],[0,1],[1,1]]],
  ['T4',[[0,0],[1,0],[2,0],[1,1]]], ['L4',[[0,0],[0,1],[0,2],[1,2]]],
  ['Z4',[[0,0],[1,0],[1,1],[2,1]]],
  ['F5',[[1,0],[2,0],[0,1],[1,1],[1,2]]],
  ['I5',[[0,0],[1,0],[2,0],[3,0],[4,0]]],
  ['L5',[[0,0],[0,1],[0,2],[0,3],[1,3]]],
  ['N5',[[0,0],[0,1],[1,1],[1,2],[1,3]]],
  ['P5',[[0,0],[1,0],[0,1],[1,1],[0,2]]],
  ['T5',[[0,0],[1,0],[2,0],[1,1],[1,2]]],
  ['U5',[[0,0],[2,0],[0,1],[1,1],[2,1]]],
  ['V5',[[0,0],[0,1],[0,2],[1,2],[2,2]]],
  ['W5',[[0,0],[0,1],[1,1],[1,2],[2,2]]],
  ['X5',[[1,0],[0,1],[1,1],[2,1],[1,2]]],
  ['Y5',[[0,0],[0,1],[1,1],[0,2],[0,3]]],
  ['Z5',[[0,0],[1,0],[1,1],[1,2],[2,2]]]
].map(([id,cells]) => Object.freeze({id,cells:Object.freeze(cells.map(Object.freeze))}));
Object.freeze(PIECES);
const byId = new Map(PIECES.map(p=>[p.id,p]));
const edges = [[1,0],[-1,0],[0,1],[0,-1]];
const diagonals = [[1,1],[1,-1],[-1,1],[-1,-1]];
const inside = (game,x,y) => x>=0 && x<boardSize(game) && y>=0 && y<boardSize(game);
const at = (game,x,y) => inside(game,x,y) ? game.board[y*boardSize(game)+x] : -2;
const transformed = new Map();
const unique = new Map();

/** orientation = clockwise quarter-turns + (mirrored horizontally ? 4 : 0). */
export function transform(id, orientation=0) {
  if(!byId.has(id) || !Number.isInteger(orientation) || orientation<0 || orientation>7) throw Error('INVALID_PIECE');
  const key=`${id}:${orientation}`;
  if(transformed.has(key)) return transformed.get(key);
  let cells=byId.get(id).cells.map(([x,y])=>[orientation>=4?-x:x,y]);
  for(let i=0;i<orientation%4;i++) cells=cells.map(([x,y])=>[-y,x]);
  const minX=Math.min(...cells.map(c=>c[0])),minY=Math.min(...cells.map(c=>c[1]));
  cells=cells.map(([x,y])=>Object.freeze([x-minX,y-minY])).sort((a,b)=>a[1]-b[1] || a[0]-b[0]);
  transformed.set(key,Object.freeze(cells)); return transformed.get(key);
}
export function variants(id) {
  if(!unique.has(id)) {
    const seen=new Set(), values=[];
    for(let orientation=0;orientation<8;orientation++) {
      const cells=transform(id,orientation),key=JSON.stringify(cells);
      if(!seen.has(key)) {seen.add(key);values.push(Object.freeze({orientation,cells}));}
    }
    unique.set(id,Object.freeze(values));
  }
  return unique.get(id);
}
export const pieceSize = id => byId.get(id)?.cells.length ?? 0;
export const ownedColors = (players,seat,mode) => players===2&&mode!=='duel' ? [seat,seat+2] : [seat];

export function newGame(players=4,scoring='bonus',{mode,seats,boardSize:size=SIZE}={}) {
  if(![2,3,4].includes(players) || !['simple','bonus'].includes(scoring)||![14,20].includes(size)||size===14&&players!==2) throw Error('INVALID_OPTIONS');
  mode=normalizeMode(players,mode??(size===14?'duel':undefined));
  if(mode==='duel'&&size!==14) throw Error('INVALID_OPTIONS');
  const colors=mode==='duel'?2:4;
  return {players,scoring,boardSize:size,mode,seats:normalizeSeats(players,seats),board:Array(size*size).fill(-1),remaining:Array.from({length:colors},()=>PIECES.map(p=>p.id)),
    started:Array(colors).fill(false),stopped:Array(colors).fill(null),lastPiece:Array(colors).fill(null),
    resigned:Array(players).fill(false),turn:0,neutralCursor:0,status:'playing',revision:0,history:[]};
}
export function controller(game,color=game.turn) {
  if(game.players===2) return color%2;
  if(game.players===3 && color===3) {
    for(let i=0;i<3;i++) {const seat=(game.neutralCursor+i)%3;if(!game.resigned[seat]) return seat;}
    return -1;
  }
  return color;
}

/** Validates supplied coordinates, never client-supplied cell arrays. */
export function validateMove(game,move,color=game.turn) {
  const fail=code=>({ok:false,code});
  if(game.status!=='playing') return fail('GAME_FINISHED');
  if(!Number.isInteger(color) || color<0 || color>=game.remaining.length || game.stopped[color]) return fail('COLOR_STOPPED');
  if(!move || typeof move!=='object' || Array.isArray(move)) return fail('INVALID_MOVE');
  const {piece,orientation,x,y}=move;
  if(!byId.has(piece) || !game.remaining[color].includes(piece)) return fail('PIECE_UNAVAILABLE');
  if(!Number.isInteger(orientation)||orientation<0||orientation>7||!Number.isInteger(x)||!Number.isInteger(y)) return fail('INVALID_MOVE');
  const cells=transform(piece,orientation).map(([dx,dy])=>[x+dx,y+dy]);
  if(cells.some(([cx,cy])=>!inside(game,cx,cy))) return fail('OUT_OF_BOUNDS');
  if(cells.some(([cx,cy])=>at(game,cx,cy)!==-1)) return fail('OCCUPIED');
  if(cells.some(([cx,cy])=>edges.some(([dx,dy])=>at(game,cx+dx,cy+dy)===color))) return fail('SAME_COLOR_EDGE');
  if(!game.started[color]) {
    const [sx,sy]=boardCorners(game)[color];
    if(!cells.some(([cx,cy])=>cx===sx&&cy===sy)) return fail('START_CORNER');
  } else if(!cells.some(([cx,cy])=>diagonals.some(([dx,dy])=>at(game,cx+dx,cy+dy)===color))) return fail('NEED_CORNER');
  return {ok:true,cells};
}

/** Frontier search is exhaustive: every legal later move covers an own diagonal. */
export function legalMoves(game,color=game.turn,preferredPiece=null) {
  return enumerateMoves(game,color,preferredPiece,{SIZE:boardSize(game),CORNERS:boardCorners(game),variants,validateMove,pieceSize});
}
export function findMove(game,color=game.turn,preferredPiece=null) {return legalMoves(game,color,preferredPiece).next().value??null;}

function settle(game) {
  if(game.mode==='teams'&&[0,1].some(team=>[team,team+2].every(s=>game.resigned[s]))) {game.status='finished';return;}
  if(game.resigned.filter(v=>!v).length<=1) {game.status='finished';return;}
  for(let i=0;i<game.remaining.length;i++) {
    const color=game.turn;
    if(!game.stopped[color]) {
      if(game.remaining[color].length===0) game.stopped[color]='complete';
      else if(!findMove(game,color)) game.stopped[color]='blocked';
    }
    if(!game.stopped[color]) return;
    game.turn=(game.turn+1)%game.remaining.length;
  }
  game.status='finished';
}
export function applyMove(game,move,{automatic=false,source=automatic?'timeout':'human'}={}) {
  const result=validateMove(game,move);
  if(!result.ok) throw Error(result.code);
  const color=game.turn, player=controller(game),clean={piece:move.piece,orientation:move.orientation,x:move.x,y:move.y};
  if(!['human','bot','timeout'].includes(source)) throw Error('INVALID_MOVE');
  for(const [x,y] of result.cells) game.board[y*boardSize(game)+x]=color;
  game.remaining[color]=game.remaining[color].filter(id=>id!==move.piece);
  game.started[color]=true;game.lastPiece[color]=move.piece;
  game.history.push({type:'move',color,player,move:clean,automatic:source!=='human',source});
  game.revision++;
  if(color===3 && game.players===3) game.neutralCursor=(player+1)%3;
  if(game.remaining[color].length===0) game.stopped[color]='complete';
  game.turn=(color+1)%game.remaining.length;settle(game);return game;
}
export function resign(game,player) {
  if(game.status!=='playing'||!Number.isInteger(player)||player<0||player>=game.players||game.resigned[player]) throw Error('INVALID_RESIGN');
  game.resigned[player]=true;
  for(const c of ownedColors(game.players,player,game.mode)) game.stopped[c]='resigned';
  game.history.push({type:'resign',player});game.revision++;settle(game);return game;
}
function individualScores(game) {
  const colorScores=game.remaining.map((ids,c)=>{
    const remaining=ids.reduce((n,id)=>n+pieceSize(id),0);
    return {color:c,remaining,placed:89-remaining,score:remaining?-remaining:(game.scoring==='bonus'?15+(game.lastPiece[c]==='I1'?5:0):0)};
  });
  const rows=Array.from({length:game.players},(_,player)=>{
    const colors=ownedColors(game.players,player,game.mode),parts=colors.map(c=>colorScores[c]);
    return {player,colors,score:parts.reduce((n,v)=>n+v.score,0),remaining:parts.reduce((n,v)=>n+v.remaining,0),
      placed:parts.reduce((n,v)=>n+v.placed,0),resigned:game.resigned[player],winner:false};
  });
  const best=Math.max(...rows.filter(s=>!s.resigned).map(s=>s.score));
  if(game.status==='finished') for(const row of rows) row.winner=!row.resigned&&row.score===best;
  return rows;
}
export function teamScores(game) {
  if(game.mode!=='teams') return [];
  const individuals=individualScores(game),rows=[0,1].map(team=>{
    const members=[team,team+2],parts=members.map(s=>individuals[s]);
    return {team,members,score:parts.reduce((s,p)=>s+p.score,0),remaining:parts.reduce((s,p)=>s+p.remaining,0),
      placed:parts.reduce((s,p)=>s+p.placed,0),forfeited:members.every(s=>game.resigned[s]),winner:false};
  });
  const best=Math.max(...rows.filter(s=>!s.forfeited).map(s=>s.score));
  if(game.status==='finished') for(const row of rows) row.winner=!row.forfeited&&row.score===best;
  return rows;
}
export function scores(game) {
  const rows=individualScores(game);
  if(game.mode==='teams') {const teams=teamScores(game);for(const row of rows) row.winner=!row.resigned&&teams[row.player%2].winner;}
  return rows;
}
export function exportReplay(game,names=[],{seats=game.seats}={}) {
  return {format:'djq-replay',version:2,players:game.players,scoring:game.scoring,boardSize:boardSize(game),mode:game.mode,seats:normalizeSeats(game.players,seats),
    names:Array.from({length:game.players},(_,i)=>String(names[i]??`P${i+1}`).slice(0,20)),actions:structuredClone(game.history)};
}
/** Replay is validated by actually executing every action; no imported board is trusted. */
export function replay(record,steps=record?.actions?.length) {
  if(!record||record.format!=='djq-replay'||![1,2].includes(record.version)||!Array.isArray(record.actions)||record.actions.length>88||
    !Number.isInteger(steps)||steps<0||steps>record.actions.length) throw Error('INVALID_REPLAY');
  if(record.version===2&&(!Object.hasOwn(record,'mode')||!Object.hasOwn(record,'seats'))) throw Error('INVALID_REPLAY');
  const game=newGame(record.players,record.scoring,record.version===2?{mode:record.mode,seats:record.seats,boardSize:record.boardSize}:{});
  for(const action of record.actions.slice(0,steps)) {
    if(!action||typeof action!=='object') throw Error('INVALID_REPLAY');
    if(action.type==='move') {
      if(action.color!==game.turn || action.player!==controller(game)) throw Error('INVALID_REPLAY');
      const source=record.version===1?(action.automatic===true?'timeout':'human'):action.source;
      if(!['human','bot','timeout'].includes(source)||(source==='bot'&&game.seats[action.player].kind!=='bot')||
        (source==='human'&&game.seats[action.player].kind!=='human')||
        (record.version===2&&action.automatic!==(source!=='human'))) throw Error('INVALID_REPLAY');
      applyMove(game,action.move,{source});
    } else if(action.type==='resign') resign(game,action.player);
    else throw Error('INVALID_REPLAY');
  }
  return game;
}
