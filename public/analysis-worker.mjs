import { rankHints, chooseMove } from '../shared/strategy.mjs';
self.onmessage=({data})=>{
  const {requestId,context,kind,game}=data;
  try {self.postMessage({requestId,context,...(kind==='hints'?{moves:rankHints(game)}:chooseMove(game,data.options))});}
  catch {self.postMessage({requestId,context,error:'ANALYSIS_FAILED'});}
};
