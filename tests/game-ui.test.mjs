import test from 'node:test';
import assert from 'node:assert/strict';
import { previewOutline, pieceActionsPosition } from '../public/game-ui.mjs';

test('preview perimeter omits internal joins between adjacent cells',()=>{
  assert.equal((previewOutline([[0,0]]).match(/M/g)||[]).length,4);
  const domino=previewOutline([[0,0],[1,0]]);
  assert.equal((domino.match(/M/g)||[]).length,6);
  assert.equal(domino.includes('M30 0V30'),false);
  assert.equal(domino.includes('M30 30V0'),false);
});

test('piece actions remain inside the board at corners and follow piece movement',()=>{
  const board={left:50,top:100,width:300,height:300},toolbar={width:94,height:46};
  for(const move of [{piece:'I5',orientation:0,x:0,y:0},{piece:'I5',orientation:1,x:19,y:15},{piece:'F5',orientation:7,x:17,y:17}]) {
    const p=pieceActionsPosition(move,board,toolbar);
    assert.ok(p.x>=board.left&&p.x+toolbar.width<=board.left+board.width);
    assert.ok(p.y>=board.top&&p.y+toolbar.height<=board.top+board.height);
  }
  const a=pieceActionsPosition({piece:'F5',orientation:0,x:4,y:4},board,toolbar),b=pieceActionsPosition({piece:'F5',orientation:0,x:6,y:6},board,toolbar);
  assert.equal(b.x-a.x,30);assert.equal(b.y-a.y,30);
});
