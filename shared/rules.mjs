/** Deterministic rules shared by the browser and the authoritative server. */
export const SIZE = 20;
export const COLORS = ['blue', 'yellow', 'red', 'green'];
export const CORNERS = [[0,0],[19,0],[19,19],[0,19]];
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
const inside = (x,y) => x>=0 && x<SIZE && y>=0 && y<SIZE;
const at = (game,x,y) => inside(x,y) ? game.board[y*SIZE+x] : -2;
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
export const ownedColors = (players,seat) => players===2 ? [seat,seat+2] : [seat];

export function newGame(players=4,scoring='bonus') {
  if(![2,3,4].includes(players) || !['simple','bonus'].includes(scoring)) throw Error('INVALID_OPTIONS');
  return {players,scoring,board:Array(400).fill(-1),remaining:Array.from({length:4},()=>PIECES.map(p=>p.id)),
    started:[false,false,false,false],stopped:[null,null,null,null],lastPiece:[null,null,null,null],
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
  if(!Number.isInteger(color) || color<0 || color>3 || game.stopped[color]) return fail('COLOR_STOPPED');
  if(!move || typeof move!=='object' || Array.isArray(move)) return fail('INVALID_MOVE');
  const {piece,orientation,x,y}=move;
  if(!byId.has(piece) || !game.remaining[color].includes(piece)) return fail('PIECE_UNAVAILABLE');
  if(!Number.isInteger(orientation)||orientation<0||orientation>7||!Number.isInteger(x)||!Number.isInteger(y)) return fail('INVALID_MOVE');
  const cells=transform(piece,orientation).map(([dx,dy])=>[x+dx,y+dy]);
  if(cells.some(([cx,cy])=>!inside(cx,cy))) return fail('OUT_OF_BOUNDS');
  if(cells.some(([cx,cy])=>at(game,cx,cy)!==-1)) return fail('OCCUPIED');
  if(cells.some(([cx,cy])=>edges.some(([dx,dy])=>at(game,cx+dx,cy+dy)===color))) return fail('SAME_COLOR_EDGE');
  if(!game.started[color]) {
    const [sx,sy]=CORNERS[color];
    if(!cells.some(([cx,cy])=>cx===sx&&cy===sy)) return fail('START_CORNER');
  } else if(!cells.some(([cx,cy])=>diagonals.some(([dx,dy])=>at(game,cx+dx,cy+dy)===color))) return fail('NEED_CORNER');
  return {ok:true,cells};
}

/** Frontier search is exhaustive: every legal later move covers an own diagonal. */
export function findMove(game,color=game.turn,preferredPiece=null) {
  if(game.status!=='playing' || game.stopped[color]) return null;
  const anchors=[];
  if(!game.started[color]) anchors.push(CORNERS[color]);
  else for(let y=0;y<SIZE;y++) for(let x=0;x<SIZE;x++) {
    if(at(game,x,y)!==-1 || edges.some(([dx,dy])=>at(game,x+dx,y+dy)===color)) continue;
    if(diagonals.some(([dx,dy])=>at(game,x+dx,y+dy)===color)) anchors.push([x,y]);
  }
  anchors.sort((a,b)=>(Math.abs(a[0]-9.5)+Math.abs(a[1]-9.5))-(Math.abs(b[0]-9.5)+Math.abs(b[1]-9.5)));
  const ids=game.remaining[color].filter(id=>!preferredPiece||id===preferredPiece).slice().sort((a,b)=>pieceSize(b)-pieceSize(a));
  for(const piece of ids) for(const {orientation,cells} of variants(piece)) {
    const checked=new Set();
    for(const [ax,ay] of anchors) for(const [dx,dy] of cells) {
      const x=ax-dx,y=ay-dy,key=`${x},${y}`;
      if(checked.has(key)) continue;checked.add(key);
      const move={piece,orientation,x,y};
      if(validateMove(game,move,color).ok) return move;
    }
  }
  return null;
}

function settle(game) {
  if(game.resigned.filter(v=>!v).length<=1) {game.status='finished';return;}
  for(let i=0;i<4;i++) {
    const color=game.turn;
    if(!game.stopped[color]) {
      if(game.remaining[color].length===0) game.stopped[color]='complete';
      else if(!findMove(game,color)) game.stopped[color]='blocked';
    }
    if(!game.stopped[color]) return;
    game.turn=(game.turn+1)%4;
  }
  game.status='finished';
}
export function applyMove(game,move,{automatic=false}={}) {
  const result=validateMove(game,move);
  if(!result.ok) throw Error(result.code);
  const color=game.turn, player=controller(game),clean={piece:move.piece,orientation:move.orientation,x:move.x,y:move.y};
  for(const [x,y] of result.cells) game.board[y*SIZE+x]=color;
  game.remaining[color]=game.remaining[color].filter(id=>id!==move.piece);
  game.started[color]=true;game.lastPiece[color]=move.piece;
  game.history.push({type:'move',color,player,move:clean,automatic:Boolean(automatic)});
  game.revision++;
  if(color===3 && game.players===3) game.neutralCursor=(player+1)%3;
  if(game.remaining[color].length===0) game.stopped[color]='complete';
  game.turn=(color+1)%4;settle(game);return game;
}
export function resign(game,player) {
  if(game.status!=='playing'||!Number.isInteger(player)||player<0||player>=game.players||game.resigned[player]) throw Error('INVALID_RESIGN');
  game.resigned[player]=true;
  for(const c of ownedColors(game.players,player)) game.stopped[c]='resigned';
  game.history.push({type:'resign',player});game.revision++;settle(game);return game;
}
export function scores(game) {
  const colorScores=game.remaining.map((ids,c)=>{
    const remaining=ids.reduce((n,id)=>n+pieceSize(id),0);
    return {color:c,remaining,placed:89-remaining,score:remaining?-remaining:(game.scoring==='bonus'?15+(game.lastPiece[c]==='I1'?5:0):0)};
  });
  const rows=Array.from({length:game.players},(_,player)=>{
    const colors=ownedColors(game.players,player),parts=colors.map(c=>colorScores[c]);
    return {player,colors,score:parts.reduce((n,v)=>n+v.score,0),remaining:parts.reduce((n,v)=>n+v.remaining,0),
      placed:parts.reduce((n,v)=>n+v.placed,0),resigned:game.resigned[player],winner:false};
  });
  const best=Math.max(...rows.filter(s=>!s.resigned).map(s=>s.score));
  if(game.status==='finished') for(const row of rows) row.winner=!row.resigned&&row.score===best;
  return rows;
}
export function exportReplay(game,names=[]) {
  return {format:'djq-replay',version:1,players:game.players,scoring:game.scoring,
    names:Array.from({length:game.players},(_,i)=>String(names[i]??`P${i+1}`).slice(0,20)),actions:structuredClone(game.history)};
}
/** Replay is validated by actually executing every action; no imported board is trusted. */
export function replay(record,steps=record?.actions?.length) {
  if(!record||record.format!=='djq-replay'||record.version!==1||!Array.isArray(record.actions)||record.actions.length>88||
    !Number.isInteger(steps)||steps<0||steps>record.actions.length) throw Error('INVALID_REPLAY');
  const game=newGame(record.players,record.scoring);
  for(const action of record.actions.slice(0,steps)) {
    if(!action||typeof action!=='object') throw Error('INVALID_REPLAY');
    if(action.type==='move') {
      if(action.color!==game.turn || action.player!==controller(game)) throw Error('INVALID_REPLAY');
      applyMove(game,action.move,{automatic:action.automatic===true});
    } else if(action.type==='resign') resign(game,action.player);
    else throw Error('INVALID_REPLAY');
  }
  return game;
}
