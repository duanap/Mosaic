import { parentPort } from 'node:worker_threads';
import { chooseMove } from '../shared/strategy.mjs';
parentPort.on('message',({game,options})=>{
  try {parentPort.postMessage(chooseMove(game,options));} catch {parentPort.postMessage({move:null});}
});
