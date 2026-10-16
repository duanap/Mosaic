import { transform, pieceSize, COLORS } from '../shared/rules.mjs';

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

/** One shape renderer serves the tray and the enlarged current selection. */
export function pieceSVG(id,orientation=0,{tight=false}={}) {
  const cells=transform(id,orientation),w=Math.max(...cells.map(c=>c[0]))+1,h=Math.max(...cells.map(c=>c[1]))+1;
  const viewBox=tight?`-.5 -.5 ${w+1} ${h+1}`:'0 0 6 6',offset=tight?'0 0':`${(6-w)/2} ${(6-h)/2}`;
  return `<svg viewBox="${viewBox}" aria-hidden="true"><g transform="translate(${offset})">${cells.map(([x,y])=>`<rect x="${x+.06}" y="${y+.06}" width=".88" height=".88" rx=".12"/>`).join('')}</g></svg>`;
}

export function selectionMarkup(piece,orientation,color,t) {
  return `<div id="selected-piece-preview" class="selected-piece-art c${color}">${piece?pieceSVG(piece,orientation,{tight:true}):'<span class="selection-placeholder" aria-hidden="true">＋</span>'}</div>
    <div id="selected-piece-meta" class="selected-piece-meta">${piece?`<strong>${piece} <small>${pieceSize(piece)} ${t('squares')}</small></strong><span class="c${color}"><i></i>${t(COLORS[color])}${t('colorSuffix')}${orientation>=4?` · ${t('mirrored')}`:''} · ${orientation%4*90}°</span>`:`<strong>${t('noSelection')}</strong><span>${t('selectionHelp')}</span>`}</div>`;
}

let observer;
/** Fits actual available width AND height without changing the SVG's 600-unit coordinates. */
export function fitGameBoard() {
  observer?.disconnect();observer=null;
  const frame=document.querySelector('.game-shell-v2 .board-frame'),board=frame?.querySelector('#board');
  if(!frame||!board) return;
  const fit=()=>{
    if(!frame.isConnected) return;
    const rect=frame.getBoundingClientRect(),size=Math.max(0,Math.floor(Math.min(rect.width,rect.height)));
    board.style.width=`${size}px`;board.style.height=`${size}px`;
  };
  fit();observer=new ResizeObserver(fit);observer.observe(frame);
}
