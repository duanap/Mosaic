import test from 'node:test';
import assert from 'node:assert/strict';
import {PIECES,newGame,boardSize,boardCorners,ownedColors,controller,validateMove,applyMove,findMove,legalMoves,transform,pieceSize,scores,exportReplay,replay} from '../shared/rules.mjs';
import {rankHints,chooseMove} from '../shared/strategy.mjs';
import {clampOrigin,initialPreview,rotatePreview,flipPreview,beginGesture,moveGesture} from '../public/placement.mjs';
const key=move=>`${move.piece}:`+transform(move.piece,move.orientation).map(([x,y])=>`${x+move.x},${y+move.y}`).sort().join(';');

test('14x14 is a two-player single-color game with all 42 pieces and original scoring',()=>{
  const game=newGame(2,'bonus',{boardSize:14});
  assert.equal(game.mode,'duel');assert.equal(game.remaining.length,2);assert.deepEqual([...legalMoves(game,2)],[]);
  assert.equal(boardSize(game),14);assert.equal(game.board.length,196);
  assert.deepEqual(boardCorners(game),[[0,0],[13,13]]);
  assert.deepEqual([ownedColors(2,0,game.mode),ownedColors(2,1,game.mode)],[[0],[1]]);
  assert.ok(game.remaining.every(ids=>ids.length===21&&ids.reduce((n,id)=>n+pieceSize(id),0)===89));
  assert.deepEqual(scores(game).map(s=>s.score),[-89,-89]);
  for(const [color,[x,y]] of boardCorners(game).entries()) {
    assert.equal(controller(game),color%2);applyMove(game,{piece:'I1',orientation:0,x,y});
    assert.equal(game.board[y*14+x],color);
  }
  assert.equal(validateMove(game,{piece:'I5',orientation:0,x:10,y:0}).code,'OUT_OF_BOUNDS');
  for(const options of [{players:3,size:14},{players:4,size:14},{players:2,size:16},{players:2,size:'14'},{players:2,size:null}])
    assert.throws(()=>newGame(options.players,'bonus',{boardSize:options.size}),/INVALID_OPTIONS/);
  assert.equal(newGame(2).board.length,400);
  assert.throws(()=>newGame(2,'bonus',{mode:'duel',boardSize:20}),/INVALID_OPTIONS/);
});

test('14x14 legal search equals independent exhaustive placement and hints retain transforms',()=>{
  const game=newGame(2,'bonus',{boardSize:14});for(let i=0;i<12;i++) applyMove(game,findMove(game));
  const original=structuredClone(game);
  for(let color=0;color<2;color++) {
    const expected=new Set();
    for(const piece of game.remaining[color]) for(let orientation=0;orientation<8;orientation++) for(let y=0;y<14;y++) for(let x=0;x<14;x++) {
      const move={piece,orientation,x,y};if(validateMove(game,move,color).ok) expected.add(key(move));
    }
    const actual=[...legalMoves(game,color)].map(key);assert.equal(actual.length,new Set(actual).size);assert.deepEqual(new Set(actual),expected);
  }
  const hints=rankHints(game);assert.ok(hints.length>0);assert.ok(hints.every(move=>validateMove(game,move).ok));
  assert.deepEqual(game,original);
});

test('14x14 bots reach a valid result and replay keeps size while older saves default to 20',()=>{
  const game=newGame(2,'bonus',{boardSize:14});
  let turns=0;
  while(game.status==='playing') {
    assert.ok(turns++<42);const result=chooseMove(game,{budgetMs:Infinity,maxEvaluations:80});
    assert.ok(result.move&&validateMove(game,result.move).ok);applyMove(game,result.move);
    assert.equal(game.board.length,196);
    assert.equal(game.board.filter(c=>c>=0).length+game.remaining.flat().reduce((n,id)=>n+pieceSize(id),0),178);
  }
  const legacyDuo=newGame(2,'bonus',{mode:'duo',boardSize:14});for(let i=0;i<4;i++) applyMove(legacyDuo,findMove(legacyDuo));assert.equal(legacyDuo.remaining.length,4);assert.deepEqual(replay(exportReplay(legacyDuo)),legacyDuo);
  const record=exportReplay(game);assert.equal(record.boardSize,14);assert.deepEqual(replay(record),game);
  assert.throws(()=>replay({...record,boardSize:16}),/INVALID_OPTIONS/);
  const legacy=exportReplay(newGame(2));delete legacy.boardSize;assert.equal(boardSize(replay(legacy)),20);
  assert.equal(boardSize(replay({format:'djq-replay',version:1,players:2,scoring:'bonus',actions:[]})),20);
});

test('14x14 selection, transforms and held dragging stay within the complete shape bounds',()=>{
  const game=newGame(2,'bonus',{boardSize:14});
  for(const piece of PIECES) for(let orientation=0;orientation<8;orientation++) {
    let move={piece:piece.id,orientation,...clampOrigin(piece.id,orientation,{x:30,y:30},14)};
    for(const variant of [move,rotatePreview(move,undefined,14),flipPreview(move,undefined,14)])
      for(const [x,y] of transform(variant.piece,variant.orientation)) assert.ok(variant.x+x<14&&variant.y+y<14&&variant.x+x>=0&&variant.y+y>=0);
  }
  applyMove(game,findMove(game));assert.deepEqual(initialPreview(game,'I1'),{piece:'I1',orientation:0,x:13,y:13});
  const held=beginGesture({pointerId:1,size:14,startPoint:{x:0,y:0,clientX:0,clientY:0},move:{piece:'I5',orientation:0,x:0,y:0}});
  assert.deepEqual(moveGesture(held,{x:100,y:100,clientX:100,clientY:100}).move,{piece:'I5',orientation:0,x:9,y:13});
});
