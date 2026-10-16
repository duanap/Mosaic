import test from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, transform } from '../shared/rules.mjs';
import { clampOrigin, hitPreview, rotatePreview, flipPreview, beginGesture, moveGesture, endGesture } from '../public/placement.mjs';

test('whole shapes stay inside all four edges after movement and transforms',()=>{
  for(const p of PIECES) for(let orientation=0;orientation<8;orientation++) for(const x of [-10,0,19,30]) for(const y of [-10,0,19,30]) {
    const move={piece:p.id,orientation,...clampOrigin(p.id,orientation,{x,y})};
    for(const m of [move,rotatePreview(move),flipPreview(move)])
      for(const [dx,dy] of transform(m.piece,m.orientation)) assert.ok(m.x+dx>=0&&m.x+dx<20&&m.y+dy>=0&&m.y+dy<20);
  }
});
test('grab any solid square without jumping and ignore the hole',()=>{
  const move={piece:'F5',orientation:0,x:5,y:5};
  assert.equal(hitPreview(move,{x:5,y:5}),false);
  assert.equal(hitPreview(move,{x:6,y:7}),true);
  const point={clientX:60,clientY:70,x:6.5,y:7.5};
  const g=beginGesture({pointerId:2,startPoint:point,move});
  assert.deepEqual(moveGesture(g,{...point,clientX:80,x:8.5}).move,{...move,x:7});
  assert.deepEqual(endGesture(g,{cancelled:true}).move,move);
});
test('threshold distinguishes rotation from drag and preserves clicked pivot',()=>{
  const move={piece:'L5',orientation:0,x:6,y:6},point={clientX:0,clientY:0,x:7.5,y:9.5};
  const g=beginGesture({pointerId:1,startPoint:point,move});
  assert.equal(endGesture(moveGesture(g,{...point,clientX:7})).rotate,true);
  assert.equal(endGesture(moveGesture(g,{...point,clientX:8})).rotate,false);
  const rotated=rotatePreview(move,{x:7,y:9});
  assert.ok(hitPreview(rotated,{x:7,y:9}));
});
