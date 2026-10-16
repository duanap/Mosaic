import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { newGame,findMove,applyMove,controller,scores,teamScores } from '../shared/rules.mjs';
import { chooseMove } from '../shared/strategy.mjs';
const args=process.argv.slice(2),option=(key,fallback)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1];};
const games=Number(option('games',40)),seed=Number(option('seed',20261016)),mode=option('mode','duo'),output=option('output',null);
if(!Number.isInteger(games)||games<1||games>1000||!['duo','trio','classic','teams'].includes(mode)) throw Error('Invalid benchmark options');
const results=[],times=[];let points=0,fallbacks=0;
for(let index=0;index<games;index++) {
  const players=mode==='duo'?2:mode==='trio'?3:4,botSeat=index%players;
  const game=newGame(players,'bonus',{mode});let steps=0;
  while(game.status==='playing') {
    const actor=controller(game),isBot=mode==='teams'?actor%2===botSeat%2:actor===botSeat;
    let move;
    if(isBot) {const result=chooseMove(game,{seed:seed+index*997+steps});move=result.move;times.push(result.metrics.elapsedMs);fallbacks+=Number(result.metrics.fallback);}
    else move=findMove(game);
    if(!move||++steps>84) throw Error('Nonterminating or illegal benchmark');
    applyMove(game,move);
  }
  const rows=mode==='teams'?teamScores(game):scores(game),own=rows[mode==='teams'?botSeat%2:botSeat],top=rows.filter(r=>r.winner);
  const point=own.winner?1/top.length:0;points+=point;
  results.push({index,seed:seed+index*997,botSeat,points:point,score:own.score,placed:own.placed,steps,scores:rows.map(r=>r.score)});
  if((index+1)%10===0) process.stderr.write(`${mode}: ${index+1}/${games} games\n`);
}
times.sort((a,b)=>a-b);const percentile=p=>times[Math.min(times.length-1,Math.floor(times.length*p))]??0;
const report={mode,games,seed,points,winRate:points/games,averagePlaced:results.reduce((s,r)=>s+r.placed,0)/games,
  thinkingMs:{p50:percentile(.5),p95:percentile(.95),max:times.at(-1)??0},fallbacks,results};
if(output) {await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({...report,results:undefined},null,2));
