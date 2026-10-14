import test from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, variants, transform, newGame, validateMove, applyMove, findMove,
  controller, scores, resign, replay, exportReplay } from '../shared/rules.mjs';

const opening = (game, piece = 'I1') => ({piece, orientation: 0, x: 0, y: 0});
const firstRound = game => {
  for (const [x,y] of [[0,0],[19,0],[19,19],[0,19]]) applyMove(game,{piece:'I1',orientation:0,x,y});
};

test('piece inventory is 21 unique free polyominoes and 89 squares', () => {
  assert.equal(PIECES.length,21);
  assert.equal(PIECES.reduce((n,p)=>n+p.cells.length,0),89);
  assert.deepEqual([1,2,3,4,5].map(n=>PIECES.filter(p=>p.cells.length===n).length),[1,1,2,5,12]);
  const canon = PIECES.map(p=>variants(p.id).map(v=>JSON.stringify(v.cells)).sort()[0]);
  assert.equal(new Set(canon).size,21);
  for (const p of PIECES) {
    const connected = new Set([p.cells[0].join(',')]);
    for(let n=0;n<5;n++) for(const [x,y] of p.cells)
      if([[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(c=>connected.has(c.join(',')))) connected.add([x,y].join(','));
    assert.equal(connected.size,p.cells.length,p.id);
  }
});
test('D4 transforms preserve area and normalize cells', () => {
  for (const p of PIECES) for(let i=0;i<8;i++) {
    const c=transform(p.id,i); assert.equal(c.length,p.cells.length);
    assert.equal(Math.min(...c.map(v=>v[0])),0); assert.equal(Math.min(...c.map(v=>v[1])),0);
  }
  assert.equal(variants('I1').length,1); assert.equal(variants('I2').length,2); assert.equal(variants('F5').length,8);
});
test('game options reject malformed player counts and scoring',()=>{
  for(const n of [0,1,5,2.5,'2',NaN,null]) assert.throws(()=>newGame(n));
  assert.throws(()=>newGame(4,'bogus'));
});
test('each color must cover its own corner and cannot cross edges',()=>{
  const g=newGame(4); assert.equal(validateMove(g,{...opening(g),x:1}).ok,false);
  assert.equal(validateMove(g,{piece:'I5',orientation:0,x:-1,y:0}).ok,false);
  assert.equal(validateMove(g,opening(g)).ok,true); applyMove(g,opening(g));
  assert.equal(validateMove(g,{piece:'I1',orientation:0,x:19,y:0}).ok,true);
});
test('later moves require own diagonal, disallow own edge even with diagonal',()=>{
  const g=newGame(4); firstRound(g);
  assert.equal(validateMove(g,{piece:'I2',orientation:0,x:1,y:1}).ok,true);
  assert.equal(validateMove(g,{piece:'I2',orientation:0,x:0,y:1}).ok,false);
  assert.equal(validateMove(g,{piece:'I2',orientation:0,x:9,y:9}).ok,false);
  assert.equal(validateMove(g,{piece:'I1',orientation:0,x:1,y:1}).ok,false);
});
test('enemy side contact is allowed but never supplies the required own corner',()=>{
  const g=newGame(2); firstRound(g); g.board[1*20+3]=2;
  assert.equal(validateMove(g,{piece:'I2',orientation:0,x:1,y:1}).ok,true);
  assert.equal(validateMove(g,{piece:'I2',orientation:0,x:4,y:1}).ok,false);
});
test('invalid moves never mutate state and reject forged inputs',()=>{
  const g=newGame(4); const before=JSON.stringify(g);
  for(const move of [null,{},[],{...opening(g),piece:'constructor'}, {...opening(g),orientation:8},
    {...opening(g),x:0.1},{...opening(g),x:'0'},{...opening(g),x:Infinity},{...opening(g),cells:[[0,0]]}]) {
    if(move?.cells) continue;
    assert.equal(validateMove(g,move).ok,false); assert.throws(()=>applyMove(g,move));
  }
  assert.equal(JSON.stringify(g),before);
});
test('two seats alternate independent diagonal colors',()=>{
  const g=newGame(2);
  assert.deepEqual([0,1,2,3].map(c=>controller(g,c)),[0,1,0,1]);
  applyMove(g,opening(g)); assert.equal(controller(g),1);
});
test('three seats rotate neutral green and keep controller after own color blocks',()=>{
  const g=newGame(3);
  const observed=[];
  for(let round=0;round<3;round++) for(let c=0;c<4;c++) {
    if(g.turn===3) observed.push(controller(g));
    applyMove(g,findMove(g));
  }
  assert.deepEqual(observed,[0,1,2]);
  g.stopped[0]='blocked'; g.turn=3; g.neutralCursor=0; assert.equal(controller(g),0);
});
test('color scores are summed per owner; neutral is excluded; bonuses per color',()=>{
  const g=newGame(2); g.remaining[0]=[]; g.remaining[2]=[];g.lastPiece[0]='I1';g.lastPiece[2]='I2';
  assert.deepEqual(scores(g).map(s=>s.score),[35,-178]);
  g.scoring='simple'; assert.equal(scores(g)[0].score,0);
  const t=newGame(3);t.remaining[3]=[];assert.deepEqual(scores(t).map(s=>s.score),[-89,-89,-89]);
});
test('resigning one of two seats ends game and marks only that seat forfeited',()=>{
  const g=newGame(2); resign(g,0); assert.equal(g.status,'finished');
  assert.deepEqual(g.resigned,[true,false]); assert.equal(scores(g).find(s=>s.winner).player,1);
});
test('all modes play to termination with legal deterministic moves and conserve area',()=>{
  for(const count of [2,3,4]) {
    const g=newGame(count); let n=0;
    while(g.status==='playing') { const m=findMove(g);assert.ok(m);applyMove(g,m);assert.ok(++n<=84); }
    for(let c=0;c<4;c++) {
      const occupied=g.board.filter(v=>v===c).length;
      const remaining=g.remaining[c].reduce((sum,id)=>sum+PIECES.find(p=>p.id===id).cells.length,0);
      assert.equal(occupied+remaining,89);
    }
    assert.equal(scores(g).some(s=>s.winner),true);
  }
});
test('export/import replay round-trips and rejects forged moves, oversized and invalid schema',()=>{
  const g=newGame(3); for(let i=0;i<12;i++) applyMove(g,findMove(g));
  const record=exportReplay(g,['a','b','c']); assert.deepEqual(replay(record),g);
  const bad=structuredClone(record);bad.actions[0].move.x=10;assert.throws(()=>replay(bad));
  assert.throws(()=>replay({}));assert.throws(()=>replay({...record,actions:new Array(90).fill(record.actions[0])}));
  assert.equal(replay(record,1).history.length,1);
});
test('tied non-resigned top scores share victory',()=>{
  const g=newGame(4,'simple');g.status='finished';assert.equal(scores(g).filter(s=>s.winner).length,4);
  g.resigned[1]=true;assert.equal(scores(g).filter(s=>s.winner).length,3);
});
test('one blocked color in two-player mode does not disable its other color',()=>{
  const g=newGame(2);g.stopped[0]='blocked';g.turn=1;
  applyMove(g,findMove(g));assert.equal(g.turn,2);assert.equal(controller(g),0);
});
test('search matches a separate exhaustive placement oracle',()=>{
  const g=newGame(4);for(let i=0;i<36;i++) applyMove(g,findMove(g));
  const get=(x,y)=>x<0||x>19||y<0||y>19?-2:g.board[y*20+x];
  for(let color=0;color<4;color++) for(const piece of g.remaining[color]) {
    let possible=false;
    outer:for(const v of variants(piece)) for(let y=0;y<20;y++) for(let x=0;x<20;x++) {
      const cells=v.cells.map(([a,b])=>[a+x,b+y]);
      if(cells.some(([a,b])=>get(a,b)!==-1)) continue;
      if(cells.some(([a,b])=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>get(a+dx,b+dy)===color))) continue;
      if(!cells.some(([a,b])=>[[1,1],[1,-1],[-1,1],[-1,-1]].some(([dx,dy])=>get(a+dx,b+dy)===color))) continue;
      possible=true;break outer;
    }
    assert.equal(Boolean(findMove(g,color,piece)),possible,`${color}:${piece}`);
  }
});
