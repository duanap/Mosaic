export function normalizeMode(players,mode) {
  const value=mode??({2:'duo',3:'trio',4:'classic'})[players];
  if(![2,3,4].includes(players)||!['duo','duel','trio','classic','teams'].includes(value)||!({duo:players===2,duel:players===2,trio:players===3,classic:players===4,teams:players===4})[value]) throw Error('INVALID_OPTIONS');
  return value;
}
export const teamOf=(mode,seat)=>mode==='teams'?seat%2:null;
export function normalizeSeats(players,seats) {
  if(seats===undefined) return Array.from({length:players},()=>({kind:'human'}));
  if(!Array.isArray(seats)||seats.length!==players||seats.some(s=>!s||!['human','bot'].includes(s.kind)||(s.kind==='bot'&&s.level!=='standard'))) throw Error('INVALID_OPTIONS');
  return seats.map(s=>s.kind==='bot'?{kind:'bot',level:'standard'}:{kind:'human'});
}
