import { legalMoves, transform, pieceSize, controller, ownedColors, boardSize, boardCorners } from './rules.mjs';
const edges=[[1,0],[-1,0],[0,1],[0,-1]],diagonals=[[1,1],[1,-1],[-1,1],[-1,-1]];
export const STRATEGY_WEIGHTS=Object.freeze({area:50,connections:4,space:.8,block:2,earlyExpansion:4,lateExpansion:.6,alliedFrontier:4,enemyFrontier:2});

/** Local frontier change and expansion estimate; input position is never changed. */
export function evaluateMove(game,move,{color=game.turn,weights=STRATEGY_WEIGHTS}={}) {
  const width=boardSize(game),inside=(x,y)=>x>=0&&x<width&&y>=0&&y<width;
  const cells=transform(move.piece,move.orientation).map(([dx,dy])=>[dx+move.x,dy+move.y]);
  const covered=new Set(cells.map(([x,y])=>y*width+x)),affected=new Set();
  const before=(x,y)=>inside(x,y)?game.board[y*width+x]:-2;
  const after=(x,y)=>inside(x,y)?covered.has(y*width+x)?color:game.board[y*width+x]:-2;
  const frontier=(at,x,y,c=color)=>at(x,y)===-1&&!edges.some(([dx,dy])=>at(x+dx,y+dy)===c)&&diagonals.some(([dx,dy])=>at(x+dx,y+dy)===c);
  for(const [x,y] of cells) for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) if(inside(x+dx,y+dy)) affected.add((y+dy)*width+x+dx);
  let connections=0,space=0,block=0,progress=0,alliedFrontier=0,enemyFrontier=0;
  const seat=controller(game,color),allies=new Set(game.mode==='teams'?[seat,(seat+2)%4].flatMap(s=>ownedColors(game.players,s)):ownedColors(game.players,seat));
  // The public green helps its current controller, but its score is never counted as theirs.
  allies.add(color);
  for(const i of affected) {
    const x=i%width,y=Math.floor(i/width);
    connections+=Number(frontier(after,x,y))-Number(frontier(before,x,y));
    if(frontier(after,x,y)) for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) if(after(x+dx,y+dy)===-1) space+=1/(1+Math.abs(dx)+Math.abs(dy));
    for(let c=0;c<4;c++) if(c!==color&&!game.stopped[c]) {
      const delta=Number(frontier(after,x,y,c))-Number(frontier(before,x,y,c));
      if(allies.has(c)) alliedFrontier+=delta;else enemyFrontier-=delta;
    }
  }
  const [sx,sy]=boardCorners(game)[color];
  for(const [x,y] of cells) {
    progress=Math.max(progress,Math.abs(x-sx)+Math.abs(y-sy));
    for(const [dx,dy] of diagonals) {const c=before(x+dx,y+dy);if(c>=0&&!allies.has(c)) block++;}
  }
  const size=pieceSize(move.piece),placed=21-game.remaining[color].length;
  // Early expansion gets past the narrow home corner; later, preserve new entry points.
  const neutral=game.players===3&&color===3;
  let score=size*weights.area+(connections*weights.connections+space*weights.space)*(neutral?0.2:1)+
    block*weights.block+progress*(placed<8?weights.earlyExpansion:weights.lateExpansion)*(neutral?0.2:1)+
    alliedFrontier*weights.alliedFrontier+enemyFrontier*weights.enemyFrontier;
  if(move.piece==='I1'&&game.remaining[color].length>1) score-=5;
  if(game.remaining[color].length===1&&move.piece==='I1'&&game.scoring==='bonus') score+=20;
  return score;
}
export function rankHints(game,color=game.turn) {
  const groups=new Map();
  for(const move of legalMoves(game,color)) {
    if(!groups.has(move.piece)) groups.set(move.piece,[]);
    groups.get(move.piece).push({move,score:evaluateMove(game,move,{color})});
  }
  for(const values of groups.values()) values.sort((a,b)=>b.score-a.score||a.move.y-b.move.y||a.move.x-b.move.x||a.move.orientation-b.move.orientation);
  const result=[];
  for(let size=5;size>=1;size--) {
    const buckets=[...groups.entries()].filter(([id])=>pieceSize(id)===size).map(([,values])=>values).sort((a,b)=>b[0].score-a[0].score);
    for(let index=0;buckets.some(b=>index<b.length);index++) for(const b of buckets) if(b[index]) result.push(b[index].move);
  }
  return result;
}
export function chooseMove(game,{color=game.turn,budgetMs=400,seed=0,now=()=>performance.now(),maxEvaluations=Infinity,weights=STRATEGY_WEIGHTS}={}) {
  const start=now();let move=null,best=-Infinity,evaluated=0,fallback=false;
  for(const candidate of legalMoves(game,color)) {
    if(!move) move=candidate;
    if(evaluated>=maxEvaluations||now()-start>=budgetMs) {fallback=evaluated===0;break;}
    // Seed affects only near-ties. The same seed and evaluation count are reproducible.
    const noise=((candidate.x*73+candidate.y*37+candidate.orientation*13+seed)>>>0)%101/10000;
    const score=evaluateMove(game,candidate,{color,weights})+noise;
    if(score>best) {move=candidate;best=score;}evaluated++;
  }
  return {move,metrics:{evaluated,elapsedMs:now()-start,fallback}};
}
