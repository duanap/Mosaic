import { transform } from '../shared/rules.mjs';

const regionKeys=new WeakMap();
/** Build a region only when its inputs change; keep surrounding interactive nodes. */
export function renderRegion(node,key,markup) {
  if(!node||regionKeys.has(node)&&regionKeys.get(node)===key) return;
  node.innerHTML=markup();regionKeys.set(node,key);
}

/** Only exposed cell edges belong to the preview outline; internal joins never glow. */
export function previewOutline(cells) {
  const occupied=new Set(cells.map(([x,y])=>`${x},${y}`)),edges=[];
  for(const [x,y] of cells) {
    const left=x*30,top=y*30,right=left+30,bottom=top+30;
    if(!occupied.has(`${x},${y-1}`)) edges.push(`M${left} ${top}H${right}`);
    if(!occupied.has(`${x+1},${y}`)) edges.push(`M${right} ${top}V${bottom}`);
    if(!occupied.has(`${x},${y+1}`)) edges.push(`M${right} ${bottom}H${left}`);
    if(!occupied.has(`${x-1},${y}`)) edges.push(`M${left} ${bottom}V${top}`);
  }
  return edges.join('');
}

/** Position adjacent to the piece, flipping above it near the board's lower edge. */
export function pieceActionsPosition(move,board,toolbar) {
  const cells=transform(move.piece,move.orientation),scaleX=board.width/20,scaleY=board.height/20;
  const left=board.left+move.x*scaleX,top=board.top+move.y*scaleY;
  const right=left+(Math.max(...cells.map(c=>c[0]))+1)*scaleX,bottom=top+(Math.max(...cells.map(c=>c[1]))+1)*scaleY;
  const minX=board.left+4,maxX=Math.max(minX,board.left+board.width-toolbar.width-4);
  const minY=board.top+4,maxY=Math.max(minY,board.top+board.height-toolbar.height-4);
  let x=(left+right-toolbar.width)/2,y=bottom+8;
  if(y>maxY) y=top-toolbar.height-8;
  if(y<minY) {y=(top+bottom-toolbar.height)/2;x=right+8<=maxX?right+8:left-toolbar.width-8;}
  return {x:Math.max(minX,Math.min(maxX,x)),y:Math.max(minY,Math.min(maxY,y))};
}

/** One shape renderer serves the tray and the enlarged current selection. */
export function pieceSVG(id,orientation=0,{tight=false}={}) {
  const cells=transform(id,orientation),w=Math.max(...cells.map(c=>c[0]))+1,h=Math.max(...cells.map(c=>c[1]))+1;
  const viewBox=tight?`-.5 -.5 ${w+1} ${h+1}`:'0 0 6 6',offset=tight?'0 0':`${(6-w)/2} ${(6-h)/2}`;
  return `<svg viewBox="${viewBox}" aria-hidden="true"><g transform="translate(${offset})">${cells.map(([x,y])=>`<rect x="${x+.06}" y="${y+.06}" width=".88" height=".88" rx=".12"/>`).join('')}</g></svg>`;
}

export function selectionMarkup(piece,orientation,color) {
  return `<div id="selected-piece-preview" class="selected-piece-art c${color}">${piece?pieceSVG(piece,orientation,{tight:true}):'<span class="selection-placeholder" aria-hidden="true">＋</span>'}</div>
    <div id="selected-piece-meta" class="selected-piece-meta">${piece?`<strong>${piece}</strong>`:''}</div>`;
}

let observer,observedFrame;
/** Fits actual available width AND height without changing the SVG's 600-unit coordinates. */
export function fitGameBoard(onFit=()=>{}) {
  const frame=document.querySelector('.game-shell-v2 .board-frame'),board=frame?.querySelector('#board');
  if(frame&&frame===observedFrame) {onFit();return;}
  observer?.disconnect();observer=null;observedFrame=frame;
  if(!frame||!board) return;
  const fit=()=>{
    if(!frame.isConnected) return;
    const rect=frame.getBoundingClientRect(),size=Math.max(0,Math.floor(Math.min(rect.width,rect.height)));
    board.style.width=`${size}px`;board.style.height=`${size}px`;
    onFit();
  };
  fit();observer=new ResizeObserver(fit);observer.observe(frame);
}
