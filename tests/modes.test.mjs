import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,teamScores,scores,resign,applyMove,findMove,controller,exportReplay,replay,validateMove} from '../shared/rules.mjs';
test('teams aggregate diagonal colors and individual resignation preserves teammate',()=>{
  const game=newGame(4,'bonus',{mode:'teams'});resign(game,0);
  assert.equal(game.status,'playing');assert.equal(game.stopped[2],null);
  resign(game,2);assert.equal(game.status,'finished');
  assert.equal(teamScores(game).find(t=>t.winner).team,1);
  assert.deepEqual(scores(game).filter(s=>s.winner).map(s=>s.player),[1,3]);
});
test('teams natural scores sum contributions and ties include both teams',()=>{
  const game=newGame(4,'simple',{mode:'teams'});game.status='finished';
  assert.equal(teamScores(game).filter(s=>s.winner).length,2);
  assert.equal(teamScores(game)[0].score,-178);
  assert.throws(()=>newGame(2,'bonus',{mode:'teams'}),/INVALID_OPTIONS/);
  for(const mode of ['toString','constructor',{},['teams']]) assert.throws(()=>newGame(4,'bonus',{mode}),/INVALID_OPTIONS/);
});
test('teammate color cannot supply the own-color diagonal connection',()=>{
  const game=newGame(4,'simple',{mode:'teams'});game.started[0]=true;game.board[21]=2;
  const move={piece:'I1',orientation:0,x:2,y:2};assert.equal(validateMove(game,move).code,'NEED_CORNER');
  game.board[21]=0;assert.ok(validateMove(game,move).ok);
});
test('v1 records remain readable and v2 preserves modes seats and move sources',()=>{
  for(const players of [2,3,4]) {
    const record={format:'djq-replay',version:1,players,scoring:'bonus',names:[],actions:[]};
    assert.equal(replay(record).players,players);
  }
  const game=newGame(4,'bonus',{mode:'teams',seats:[{kind:'bot',level:'standard'},{kind:'human'},{kind:'human'},{kind:'human'}]});
  applyMove(game,findMove(game),{source:'bot'});assert.equal(controller(game),1);
  const record=exportReplay(game);assert.equal(record.version,2);assert.deepEqual(replay(record),game);
  const bad=structuredClone(record);bad.seats[0]={kind:'human'};assert.throws(()=>replay(bad),/INVALID_REPLAY/);
  assert.throws(()=>replay({...record,mode:'duo'}));
});
