import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame,legalMoves,variants,validateMove,findMove,applyMove,pieceSize,transform } from '../shared/rules.mjs';
import { rankHints,chooseMove } from '../shared/strategy.mjs';
const key=m=>`${m.piece}:`+transform(m.piece,m.orientation).map(([x,y])=>(y+m.y)*20+x+m.x).sort((a,b)=>a-b).join(',');
test('enumeration equals independent all-orientations all-positions oracle',()=>{
  const game=newGame(4);for(let i=0;i<32;i++) applyMove(game,findMove(game));
  for(const color of [0,1,2,3]) {
    const expected=new Set();
    for(const piece of game.remaining[color]) for(const {orientation} of variants(piece)) for(let y=0;y<20;y++) for(let x=0;x<20;x++) {
      const move={piece,orientation,x,y};if(validateMove(game,move,color).ok) expected.add(key(move));
    }
    const actual=[...legalMoves(game,color)].map(key);assert.equal(actual.length,new Set(actual).size);assert.deepEqual(new Set(actual),expected);
  }
});
test('hints prefer area, cycle piece types and retain rotated and reflected candidates',()=>{
  const game=newGame(4),hints=rankHints(game,0),keys=hints.map(key);
  assert.equal(new Set(keys).size,keys.length);assert.ok(hints.length>20);
  for(let i=1;i<hints.length;i++) assert.ok(pieceSize(hints[i-1].piece)>=pieceSize(hints[i].piece));
  assert.notEqual(hints[0].piece,hints[1].piece);
  assert.ok(hints.some(m=>m.orientation>=4));assert.ok(hints.some(m=>m.orientation%4));
  assert.ok(hints.every(m=>validateMove(game,m).ok));
  game.remaining[0]=['I1'];assert.equal(rankHints(game).length,1);
});
test('bot returns legal moves without mutating game including a zero-budget fallback',()=>{
  const game=newGame(2),copy=structuredClone(game);
  assert.ok(validateMove(game,chooseMove(game,{budgetMs:0}).move).ok);
  const a=chooseMove(game,{maxEvaluations:500,seed:42}),b=chooseMove(game,{maxEvaluations:500,seed:42});
  assert.deepEqual(a.move,b.move);assert.ok(validateMove(game,a.move).ok);assert.deepEqual(game,copy);
});
