import test from 'node:test';
import assert from 'node:assert/strict';
import { previewOutline } from '../public/game-ui.mjs';

test('preview perimeter omits internal joins between adjacent cells',()=>{
  assert.equal((previewOutline([[0,0]]).match(/M/g)||[]).length,4);
  const domino=previewOutline([[0,0],[1,0]]);
  assert.equal((domino.match(/M/g)||[]).length,6);
  assert.equal(domino.includes('M30 0V30'),false);
  assert.equal(domino.includes('M30 30V0'),false);
});
