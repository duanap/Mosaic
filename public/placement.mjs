import { transform, CORNERS } from '../shared/rules.mjs';

export function clampOrigin(piece,orientation,{x,y}) {
  const cells=transform(piece,orientation),w=Math.max(...cells.map(c=>c[0]))+1,h=Math.max(...cells.map(c=>c[1]))+1;
  return {x:Math.max(0,Math.min(20-w,Math.round(x))),y:Math.max(0,Math.min(20-h,Math.round(y)))};
}
export function hitPreview(move,{x,y}) {
  return !!move&&transform(move.piece,move.orientation).some(([dx,dy])=>move.x+dx===Math.floor(x)&&move.y+dy===Math.floor(y));
}
export function previewAnchor(move) {
  const cells=transform(move.piece,move.orientation),cx=cells.reduce((s,c)=>s+c[0],0)/cells.length,cy=cells.reduce((s,c)=>s+c[1],0)/cells.length;
  const [x,y]=cells.slice().sort((a,b)=>(a[0]-cx)**2+(a[1]-cy)**2-((b[0]-cx)**2+(b[1]-cy)**2)||a[1]-b[1]||a[0]-b[0])[0];
  return {x:move.x+x,y:move.y+y};
}
function changePreview(move,pivot,flip) {
  pivot??=previewAnchor(move);
  const cells=transform(move.piece,move.orientation),mapped=cells.map(([x,y])=>flip?[-x,y]:[-y,x]);
  const minX=Math.min(...mapped.map(c=>c[0])),minY=Math.min(...mapped.map(c=>c[1]));
  const px=pivot.x-move.x,py=pivot.y-move.y;
  const dx=(flip?-px:-py)-minX,dy=(flip?py:px)-minY;
  const orientation=flip?(move.orientation<4?4:0)+(4-move.orientation%4)%4:(move.orientation>=4?4:0)+(move.orientation%4+1)%4;
  return {...move,orientation,...clampOrigin(move.piece,orientation,{x:pivot.x-dx,y:pivot.y-dy})};
}
export const rotatePreview=(move,pivot)=>changePreview(move,pivot,false);
export const flipPreview=(move,pivot)=>changePreview(move,pivot,true);
export function initialPreview(game,piece,previous=null) {
  const target=previous?previewAnchor(previous):game.started[game.turn]?{x:9,y:9}:{x:CORNERS[game.turn][0],y:CORNERS[game.turn][1]};
  const anchor=previewAnchor({piece,orientation:0,x:0,y:0});
  return {piece,orientation:0,...clampOrigin(piece,0,{x:target.x-anchor.x,y:target.y-anchor.y})};
}
export function beginGesture({pointerId,startPoint,move}) {
  return {pointerId,startPoint,original:{...move},move:{...move},moving:false,pivot:{x:Math.floor(startPoint.x),y:Math.floor(startPoint.y)}};
}
export function moveGesture(gesture,point) {
  const moving=gesture.moving||Math.hypot(point.clientX-gesture.startPoint.clientX,point.clientY-gesture.startPoint.clientY)>=8;
  return {...gesture,moving,move:moving?{...gesture.original,...clampOrigin(gesture.original.piece,gesture.original.orientation,{
    x:gesture.original.x+point.x-gesture.startPoint.x,y:gesture.original.y+point.y-gesture.startPoint.y})}:gesture.move};
}
export function endGesture(gesture,{cancelled=false}={}) {
  return {move:cancelled?gesture.original:gesture.move,rotate:!cancelled&&!gesture.moving,suppressClick:gesture.moving};
}
