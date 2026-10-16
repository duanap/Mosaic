/** Lazy exhaustive search. Rules are supplied to avoid circular imports. */
export function* enumerateMoves(game,color,preferredPiece,{SIZE,CORNERS,variants,validateMove,pieceSize}) {
  if(game.status!=='playing'||game.stopped[color]) return;
  const edges=[[1,0],[-1,0],[0,1],[0,-1]],diagonals=[[1,1],[1,-1],[-1,1],[-1,-1]];
  const at=(x,y)=>x>=0&&x<SIZE&&y>=0&&y<SIZE?game.board[y*SIZE+x]:-2,anchors=[];
  if(!game.started[color]) anchors.push(CORNERS[color]);
  else for(let y=0;y<SIZE;y++) for(let x=0;x<SIZE;x++) {
    if(at(x,y)!==-1||edges.some(([dx,dy])=>at(x+dx,y+dy)===color)) continue;
    if(diagonals.some(([dx,dy])=>at(x+dx,y+dy)===color)) anchors.push([x,y]);
  }
  anchors.sort((a,b)=>(Math.abs(a[0]-9.5)+Math.abs(a[1]-9.5))-(Math.abs(b[0]-9.5)+Math.abs(b[1]-9.5)));
  const ids=game.remaining[color].filter(id=>!preferredPiece||id===preferredPiece).slice().sort((a,b)=>pieceSize(b)-pieceSize(a));
  for(const piece of ids) for(const {orientation,cells} of variants(piece)) {
    const checked=new Set();
    for(const [ax,ay] of anchors) for(const [dx,dy] of cells) {
      const x=ax-dx,y=ay-dy,key=`${x},${y}`;
      if(checked.has(key)) continue;checked.add(key);
      const move={piece,orientation,x,y};
      if(validateMove(game,move,color).ok) yield move;
    }
  }
}
