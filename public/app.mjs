import { PIECES, COLORS, CORNERS, transform, newGame, validateMove, applyMove, findMove,
  controller, scores, resign, replay, exportReplay, pieceSize, ownedColors } from '/shared/rules.mjs';
import { RoomClient, savedSession } from '/network.mjs';
import { t } from '/i18n.mjs';

const $=selector=>document.querySelector(selector);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(key,fallback=null)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
const LOCAL='djq-local-v1';
const ui={view:'home',mode:'local',count:4,scoring:'bonus',seconds:90,name:read('djq-name',`${t('player')}${Math.floor(Math.random()*900)+100}`),
  joinCode:new URLSearchParams(location.search).get('room')?.toUpperCase().slice(0,6)??'',
  game:null,room:null,names:[],selected:null,orientation:0,cursor:null,showCorners:false,pending:false,connected:false,
  replayRecord:null,replayStep:0,clockOffset:0,theme:read('djq-theme',matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')};
if(!['dark','light'].includes(ui.theme)) ui.theme='light';
document.documentElement.dataset.theme=ui.theme;
const icons={
 arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',back:'<path d="m10 6-6 6 6 6M4 12h16"/>',
 moon:'<path d="M20 14A8.5 8.5 0 0 1 10 4 8.5 8.5 0 1 0 20 14Z"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
 rotate:'<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',flip:'<path d="M12 3v18M8 6 3 18h5V6Zm8 0 5 12h-5V6Z"/>',
 hint:'<path d="M9 18h6m-5 3h4M8 13a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>',
 check:'<path d="m5 12 4 4L19 6"/>',link:'<path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v1"/>',
 export:'<path d="M4 14v6h16v-6M12 16V3m-5 5 5-5 5 5"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 2 4v2"/>',
 trophy:'<path d="M8 3h8v8a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 3v5m-5 0h10"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>'
};
const icon=name=>`<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]??icons.arrow}</svg>`;
const badge=c=>`<span class="color-mark c${c}">${'BYRG'[c]}</span>`;
const playerName=i=>ui.names[i]??`${t('player')} ${i+1}`;
const busy=()=>ui.pending?' disabled':'';
let toastTimer;
function toast(message) {const node=$('#toast');node.textContent=message;node.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.hidden=true,4200);}
function resetSelection() {ui.selected=null;ui.orientation=0;ui.cursor=null;}
function captureOptions() {
  if($('#player-name')) ui.name=$('#player-name').value;
  if($('#room-code-input')) ui.joinCode=$('#room-code-input').value;
  if($('#scoring')) ui.scoring=$('#scoring').value;
  if($('#turn-seconds')) ui.seconds=Number($('#turn-seconds').value);
}
function header() {
  return `<header class="site-header"><button id="home-button" class="brand" aria-label="${t('home')}"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><strong>${t('title')}</strong><span class="brand-label">DJQ</span></button>
  <nav><button id="rules-button" class="text-button">${icon('help')}<span>${t('rules')}</span></button><a class="github-link" href="https://github.com/duanap/djq" target="_blank" rel="noopener noreferrer">GitHub ${icon('arrow')}</a><button id="theme-toggle" class="icon-button" aria-label="${t('theme')}">${icon(ui.theme==='dark'?'sun':'moon')}</button></nav></header>`;
}
function miniPiece(id,orientation=0) {
  const cells=transform(id,orientation),w=Math.max(...cells.map(c=>c[0]))+1,h=Math.max(...cells.map(c=>c[1]))+1;
  return `<svg viewBox="0 0 6 6" aria-hidden="true"><g transform="translate(${(6-w)/2} ${(6-h)/2})">${cells.map(([x,y])=>`<rect x="${x+.06}" y="${y+.06}" width=".88" height=".88" rx=".13"/>`).join('')}</g></svg>`;
}
function boardSVG(game,interactive=true) {
  const tiles=game.board.map((c,index)=>c<0?'':`<rect class="tile c${c}" x="${index%20*30+1.5}" y="${Math.floor(index/20)*30+1.5}" width="27" height="27" rx="3.6"/>`).join('');
  const last=game.history.findLast(a=>a.type==='move');
  const highlight=last?transform(last.move.piece,last.move.orientation).map(([x,y])=>`<rect class="last-tile" x="${(x+last.move.x)*30+4}" y="${(y+last.move.y)*30+4}" width="22" height="22" rx="2"/>`).join(''):'';
  const marks=CORNERS.map(([x,y],c)=>game.started[c]?'':`<g class="start-mark c${c}"><circle cx="${x*30+15}" cy="${y*30+15}" r="11"/><text x="${x*30+15}" y="${y*30+19.5}" text-anchor="middle">${'BYRG'[c]}</text></g>`).join('');
  const grid=Array.from({length:21},(_,i)=>`M${i*30} 0V600M0 ${i*30}H600`).join('');
  return `<svg ${interactive?`id="board" tabindex="0" role="application" aria-label="20 x 20 ${t('title')}. ${t('shortcut')}"`:'aria-hidden="true"'} class="board-svg" viewBox="0 0 600 600"><rect class="board-base" width="600" height="600"/><path class="grid-lines" d="${grid}"/>${tiles}${marks}${highlight}${interactive?'<g id="frontiers"></g><g id="preview" pointer-events="none"></g>':''}</svg>`;
}
const demo=newGame(4);for(let n=0;n<32;n++) applyMove(demo,findMove(demo));
function homeView() {
  return `<main class="home-shell"><section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="live-dot"></span> SMALL BOARD. BIG POSSIBILITIES.</p><h1>${t('hero')}</h1><p class="lead">${t('intro')}</p><div class="quick-rules">${[1,2,3].map(n=>`<span><b>0${n}</b>${t('tip'+n)}</span>`).join('')}</div></div>
  <div class="hero-art"><div class="art-orbit"></div><div class="hero-board-wrap">${boardSVG(demo,false)}</div><div class="art-tag"><span class="tag-block">21</span><span>${t('tiles')} / ${t('perColor')}<small>89 LITTLE SQUARES</small></span></div><span class="art-caption">A NEW ANGLE ON EVERY MOVE.</span></div></section>
  <section class="play-section"><div class="section-heading"><div><p class="eyebrow">01 / LET'S PLAY</p><h2>${t('chooseMode')}</h2></div><div class="mode-switch" aria-label="${t('chooseMode')}">${[2,3,4].map(n=>`<button id="mode-${n}" data-count="${n}" class="${ui.count===n?'selected':''}" aria-pressed="${ui.count===n}"><strong>${n}<small>${t('people')}</small></strong><span>${t('mode'+n)}</span></button>`).join('')}</div></div>
  <div class="play-cards"><article class="play-card local-card"><div class="card-top"><span class="card-icon">${icon('users')}</span><span class="eyebrow">SAME SCREEN</span></div><h3>${t('localTitle')}</h3><p>${t('localDesc')}</p><label class="inline-field">${t('scoring')}<select id="scoring"><option value="bonus" ${ui.scoring==='bonus'?'selected':''}>${t('bonus')} +15 / +20</option><option value="simple" ${ui.scoring==='simple'?'selected':''}>${t('simple')}</option></select></label><button id="local-start" class="button primary wide">${t('localStart')}${icon('arrow')}</button>${read(LOCAL)?`<button id="resume-local" class="text-button resume">${t('resume')}${icon('back')}</button>`:`<p class="fine">${t('saved')}</p>`}</article>
  <article class="play-card online-card"><div class="card-top"><span class="card-icon">${icon('link')}</span><span class="eyebrow">PLAY TOGETHER</span></div><h3>${t('onlineTitle')}</h3><p>${t('onlineDesc')}</p><div class="online-fields"><label>${t('name')}<input id="player-name" maxlength="20" autocomplete="nickname" value="${escape(ui.name)}"></label><label>${t('turnLimit')}<select id="turn-seconds">${[30,60,90,120].map(n=>`<option value="${n}" ${ui.seconds===n?'selected':''}>${n} ${t('seconds')}</option>`).join('')}</select></label></div><div class="online-actions"><button id="create-room" class="button secondary"${busy()}>${t('create')}${icon('arrow')}</button><div class="join-field"><input id="room-code-input" maxlength="6" autocomplete="off" aria-label="${t('code')}" placeholder="${t('code')}" value="${escape(ui.joinCode)}"><button id="join-room" class="text-button"${busy()}>${t('join')}</button></div></div></article></div></section>
  <footer class="home-footer"><span>DJQ / v1.0.0 <i></i>${t('footer')}</span><button id="import-replay" class="text-button">${t('import')}${icon('arrow')}</button></footer></main>`;
}
function connectionLabel() {return `<span id="connection" class="connection ${ui.connected?'connected':''}"><i></i>${t(ui.connected?'connected':'reconnecting')}</span>`;}
function lobbyView() {
  const r=ui.room,me=r.players[r.you],allReady=r.players.every(p=>p?.ready&&p.connected),host=r.you===r.host;
  return `<main class="lobby-shell"><div class="lobby-intro"><p class="eyebrow">YOUR TABLE IS READY</p><h1>${t('lobbyTitle')}</h1><p>${t('lobbyDesc')}</p></div><div class="lobby-grid"><section class="lobby-main panel"><div class="lobby-code"><div><span class="eyebrow">${t('code')}</span><strong id="room-code">${r.code}</strong></div><button id="copy-invite" class="button secondary">${icon('link')}${t('invite')}</button></div><div class="lobby-seats">${r.players.map((p,i)=>`<div class="lobby-seat ${p?'':'empty'}"><div class="seat-avatar c${i}">${i+1}</div><div class="seat-name"><strong>${p?escape(p.name):t('empty')}</strong><span>${p?`${ownedColors(r.capacity,i).map(badge).join('')} ${i===r.host?t('host'):''} ${i===r.you?` / ${t('you')}`:''}`:'- - -'}</span></div><span class="seat-status ${p?.ready?'is-ready':''}">${p?t(!p.connected?'offline':p.ready?'readyDone':'waiting'):''}</span></div>`).join('')}</div><div class="lobby-buttons"><button id="ready" class="button ${me?.ready?'secondary':'primary'}" ${!ui.connected||ui.pending?'disabled':''}>${icon('check')}${t(me?.ready?'unready':'ready')}</button>${host?`<button id="online-start" class="button primary" ${!allReady||!ui.connected||ui.pending?'disabled':''}>${t('start')}${icon('arrow')}</button>`:''}</div></section><aside class="panel lobby-aside"><p class="eyebrow">TABLE SETTINGS</p><h2>${r.capacity} ${t('people')} / ${t('mode'+r.capacity)}</h2><dl><div><dt>BOARD</dt><dd>20 &times; 20</dd></div><div><dt>${t('scoring')}</dt><dd>${t(r.scoring)}</dd></div><div><dt>${t('turnLimit')}</dt><dd>${r.turnSeconds} ${t('seconds')}</dd></div></dl><p>${t(r.capacity===3?'neutralHelp':'ruleFirst')}</p>${connectionLabel()}<button id="leave-room" class="text-button">${icon('back')}${t('home')}</button></aside></div></main>`;
}
function canPlay() {return ui.view==='game'&&ui.game?.status==='playing'&&!ui.pending&&(ui.mode==='local'||(ui.connected&&ui.room?.you===controller(ui.game)));}
function playerCards(game) {
  return `<div class="player-cards players-${game.players}">${scores(game).map(s=>{
    const active=game.status==='playing'&&controller(game)===s.player;
    return `<article class="player-card ${active?'active':''} ${s.resigned?'forfeited':''}"><div class="player-ident"><span class="player-avatar c${active?game.turn:s.colors[0]}">${s.player+1}</span><div><strong>${escape(playerName(s.player))}${ui.mode==='online'&&ui.room?.you===s.player?`<small> / ${t('you')}</small>`:''}</strong><div class="player-colors">${s.colors.map(c=>`${badge(c)}${game.stopped[c]?`<span class="stopped-text">${t(game.stopped[c])}</span>`:''}`).join('')}</div></div></div><div class="player-score"><strong>${s.score>0?'+':''}${s.score}</strong><span>${s.remaining} ${t('squares')}${t('remaining')}</span></div></article>`;
  }).join('')}</div>`;
}
function controls(game) {
  const active=game.turn,allowed=canPlay(),remaining=game.remaining[active];
  if(ui.view==='replay') return `<aside class="control-panel panel"><p class="eyebrow">REPLAY / READ ONLY</p><h2>${t('replay')}</h2><p>${t('replayHelp')}</p><div class="replay-progress"><strong id="replay-label">${ui.replayStep} / ${ui.replayRecord.actions.length}</strong><input id="replay-range" aria-label="${t('replay')}" type="range" min="0" max="${ui.replayRecord.actions.length}" value="${ui.replayStep}"></div><div class="replay-buttons"><button id="replay-prev" class="button secondary" ${ui.replayStep===0?'disabled':''}>${icon('back')}${t('prev')}</button><button id="replay-next" class="button primary" ${ui.replayStep===ui.replayRecord.actions.length?'disabled':''}>${t('next')}${icon('arrow')}</button></div>${moveLog(game)}</aside>`;
  return `<aside class="control-panel panel"><div class="control-heading"><div><p class="eyebrow">YOUR PIECES</p><h2>${game.status==='finished'?t('finished'):t('choosePiece')}</h2></div><span class="remaining-pill c${active}">${remaining.length}<small> / 21</small></span></div><div class="tool-row"><button id="rotate" class="tool-button" ${!allowed||!ui.selected?'disabled':''}>${icon('rotate')}${t('rotate')}<kbd>R</kbd></button><button id="flip" class="tool-button" ${!allowed||!ui.selected?'disabled':''}>${icon('flip')}${t('flip')}<kbd>F</kbd></button><button id="hint" class="tool-button" ${!allowed?'disabled':''}>${icon('hint')}${t('hint')}</button></div><div class="piece-tray c${active}">${PIECES.slice().reverse().map(p=>`<button class="piece ${ui.selected===p.id?'selected':''} ${remaining.includes(p.id)?'':'used'}" data-piece="${p.id}" aria-label="${p.id} / ${p.cells.length} ${t('squares')}" aria-pressed="${ui.selected===p.id}" ${!allowed||!remaining.includes(p.id)?'disabled':''}>${miniPiece(p.id,ui.selected===p.id?ui.orientation:0)}<span>${p.id}</span></button>`).join('')}</div><div class="preview-info"><span id="preview-status" role="status" aria-live="polite">${t('chooseHelp')}</span><button id="clear-selection" class="icon-button" aria-label="${t('clear')}">${icon('close')}</button></div><button id="confirm-move" class="button primary wide confirm-button" disabled>${icon('check')}${t('confirm')}</button><p class="keyboard-help">${t('shortcut')}</p><div class="secondary-actions">${ui.mode==='local'?`<button id="undo" class="text-button" ${!game.history.length?'disabled':''}>${icon('back')}${t('undo')}</button>`:''}${game.status==='playing'?`<button id="resign" class="text-button danger" ${ui.pending||ui.mode==='online'&&(!ui.connected||game.resigned[ui.room.you])?'disabled':''}>${t('resign')}</button>`:''}</div>${moveLog(game)}</aside>`;
}
function moveLog(game) {
  return `<section class="move-log"><h3>${t('log')}</h3>${game.history.length?`<ol>${game.history.slice(-5).reverse().map(a=>`<li>${a.type==='move'?badge(a.color):icon('close')}<span>${escape(playerName(a.player))}<small>${a.type==='move'?`${a.move.piece} / ${String.fromCharCode(65+a.move.x)}${a.move.y+1}${a.automatic?` / ${t('auto')}`:''}`:t('resigned')}</small></span></li>`).join('')}</ol>`:`<p>${t('emptyLog')}</p>`}</section>`;
}
function resultView(game) {
  const winners=scores(game).filter(s=>s.winner);
  return `<section class="result-banner"><div class="result-icon">${icon('trophy')}</div><div><p class="eyebrow">WELL PLAYED</p><h2>${winners.map(s=>escape(playerName(s.player))).join(' & ')} ${t(winners.length>1?'tie':'win')}</h2><p>${t('finished')} / ${t(game.scoring)}</p></div>${ui.view!=='replay'?(ui.mode==='local'||ui.room.you===ui.room.host?`<button id="rematch" class="button primary"${busy()}>${t('rematch')}${icon('arrow')}</button>`:`<span>${t('waitHost')}</span>`):''}</section>`;
}
function mobileDock(game) {
  if(ui.view!=='game'||game.status!=='playing') return '';
  const allowed=canPlay();
  return `<div class="mobile-dock"><div class="dock-status">${badge(game.turn)}<span>${ui.selected??t('choosePiece')}</span><small>${t(allowed?'yourTurn':'otherTurn')}</small></div><div class="dock-actions"><button data-action="rotate" ${!allowed||!ui.selected?'disabled':''}>${icon('rotate')}${t('rotate')}</button><button data-action="flip" ${!allowed||!ui.selected?'disabled':''}>${icon('flip')}${t('flip')}</button><button id="dock-pieces">${icon('users')}${t('choosePiece')}</button><button data-action="confirm-move" class="dock-confirm" disabled>${icon('check')}${t('confirm')}</button></div></div>`;
}
function gameView() {
  const game=ui.game,playing=game.status==='playing',color=game.turn;
  return `<main class="game-shell"><div class="game-top"><div><span class="eyebrow">${ui.view==='replay'?'REPLAY':ui.mode==='local'?'LOCAL TABLE':'ONLINE TABLE'}</span><h1>${t(ui.view==='replay'?'replay':ui.mode)} <small>${game.players} ${t('people')}${ui.mode==='online'&&ui.room?` / ${ui.room.code}`:''}</small></h1></div><div class="game-top-actions">${ui.mode==='online'?connectionLabel():`<span class="saved-label">${t('saved')}</span>`}<button id="export-replay" class="button secondary small">${icon('export')}${t('export')}</button></div></div>${playerCards(game)}${!playing?resultView(game):''}
  ${game.players===3?`<div class="neutral-bar">${badge(3)}<strong>${t('neutral')}</strong><span>${t('neutralHelp')}</span><b>${t('player')} ${controller(game,3)+1}</b></div>`:''}
  <div class="game-layout"><section class="board-section"><div class="turn-banner"><div>${badge(color)}<span>${playing?`${t('turn')} / <strong>${escape(playerName(controller(game)))}</strong> ${game.players===3&&color===3?` / ${t('neutral')}`:''}`:t('finished')}</span></div>${ui.mode==='online'&&playing?'<span id="countdown" class="countdown"></span>':`<span class="turn-note">${ui.view==='replay'?t('replay'):t(ui.mode==='local'?'local':canPlay()?'yourTurn':'otherTurn')}</span>`}</div><div class="board-frame">${boardSVG(game)}</div><div class="board-meta"><span><strong id="move-number">${game.history.filter(a=>a.type==='move').length}</strong> ${t('moves')}</span><button id="show-corners" class="text-button" aria-pressed="${ui.showCorners}">${icon('hint')}${t('corners')}</button></div></section>${controls(game)}</div>${mobileDock(game)}</main>`;
}
function render() {
  $('#app').innerHTML=header()+(ui.view==='home'?homeView():ui.view==='lobby'?lobbyView():gameView());
  if(ui.game&&ui.view!=='home'&&ui.view!=='lobby') {updatePreview();drawFrontiers();}
  updateCountdown();
}
function updateCountdown() {
  const node=$('#countdown');if(!node||!ui.room?.deadline) return;
  const seconds=Math.max(0,Math.ceil((ui.room.deadline-(Date.now()+ui.clockOffset))/1000));
  node.textContent=`${seconds}s`;node.classList.toggle('urgent',seconds<=15);
}
function currentMove() {return ui.selected&&ui.cursor?{piece:ui.selected,orientation:ui.orientation,x:ui.cursor.x,y:ui.cursor.y}:null;}
function updatePreview() {
  const group=$('#preview'),message=$('#preview-status'),confirm=$('#confirm-move');if(!group) return;
  const move=currentMove(),result=move?validateMove(ui.game,move):null;
  const cells=move?transform(move.piece,move.orientation).map(([x,y])=>[x+move.x,y+move.y]):[];
  group.innerHTML=cells.filter(([x,y])=>x>=0&&x<20&&y>=0&&y<20).map(([x,y])=>`<rect class="ghost c${ui.game.turn} ${result?.ok?'valid':'invalid'}" x="${x*30+1.5}" y="${y*30+1.5}" width="27" height="27" rx="3.6"/>`).join('');
  if(message) {message.textContent=!ui.selected?t('chooseHelp'):!move?t('selectPosition'):`${t(result.ok?'legal':result.code)} (${move.x+1}, ${move.y+1})`;message.className=result?.ok?'valid-message':'';}
  if(confirm) confirm.disabled=!canPlay()||!result?.ok;
  const dock=$('[data-action="confirm-move"]');if(dock) dock.disabled=!canPlay()||!result?.ok;
}
function drawFrontiers() {
  const node=$('#frontiers');if(!node) return;node.innerHTML='';
  if(!ui.showCorners||ui.game.status!=='playing') return;
  const g=ui.game,c=g.turn,points=[];
  const at=(x,y)=>x<0||x>19||y<0||y>19?-2:g.board[y*20+x];
  if(!g.started[c]) points.push(CORNERS[c]);
  else for(let y=0;y<20;y++) for(let x=0;x<20;x++) {
    if(at(x,y)!==-1||[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>at(x+dx,y+dy)===c)) continue;
    if([[1,1],[1,-1],[-1,1],[-1,-1]].some(([dx,dy])=>at(x+dx,y+dy)===c)) points.push([x,y]);
  }
  node.innerHTML=points.map(([x,y])=>`<circle class="frontier c${c}" cx="${x*30+15}" cy="${y*30+15}" r="3.5"/>`).join('');
}
function saveLocal() {if(ui.mode==='local'&&ui.view==='game') {if(!write(LOCAL,exportReplay(ui.game,ui.names))) toast(t('storageError'));}}
function beginLocal(record=null) {
  ui.mode='local';ui.room=null;ui.replayRecord=null;ui.game=record?replay(record):newGame(ui.count,ui.scoring);
  ui.names=Array.from({length:ui.game.players},(_,i)=>String(record?.names?.[i]??`${t('player')} ${i+1}`).slice(0,20));
  ui.view='game';resetSelection();saveLocal();render();window.scrollTo(0,0);
}
let lastGameKey='';
const network=new RoomClient({
  onState(state) {
    const key=`${state.code}:${state.round}:${state.game?.revision??-1}`;
    if(key!==lastGameKey) {resetSelection();lastGameKey=key;}
    ui.mode='online';ui.room=state;ui.game=state.game;ui.names=state.players.map((p,i)=>p?.name??`${t('player')} ${i+1}`);
    ui.clockOffset=state.now-Date.now();ui.view=state.phase==='waiting'?'lobby':'game';render();
  },
  onConnection(connected) {ui.connected=connected;if(ui.mode==='online'&&ui.view!=='home') render();},
  onLost(code) {ui.mode='local';ui.room=null;ui.game=null;ui.view='home';resetSelection();render();toast(t(code));}
});
async function commitMove() {
  const move=currentMove();if(!canPlay()||!move||!validateMove(ui.game,move).ok) return;
  if(ui.mode==='local') {applyMove(ui.game,move);resetSelection();saveLocal();render();}
  else {ui.pending=true;render();try{await network.command({type:'move',round:ui.room.round,revision:ui.game.revision,move});}finally{ui.pending=false;render();}}
}
function showRules() {
  const dialog=$('#modal');dialog.innerHTML=`<div class="modal-heading"><div><p class="eyebrow">HOW TO PLAY</p><h2 id="modal-title">${t('rules')}</h2></div><button id="close-modal" class="icon-button" aria-label="${t('close')}">${icon('close')}</button></div><div class="rules-content">${['ruleFirst','ruleConnect','ruleModes','ruleEnd','ruleScore','ruleTimer'].map((key,i)=>`<section><b>0${i+1}</b><p>${t(key)}</p></section>`).join('')}<p class="fine">${t('shortcut')}</p></div>`;dialog.showModal();
}
function exportFile() {
  const record=ui.view==='replay'?ui.replayRecord:exportReplay(ui.game,ui.names),blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`djq-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function goHome() {
  if(ui.mode==='online'&&ui.room) {
    if(ui.game?.status==='playing'&&!confirm(t('leaveConfirm'))) return;
    try{await network.command({type:'leave'});}catch(error){if(!['ROOM_NOT_FOUND','UNAUTHORIZED'].includes(error.message)) throw error;}
    network.stop();
  }
  saveLocal();ui.view='home';ui.mode='local';ui.room=null;ui.game=null;ui.replayRecord=null;resetSelection();render();window.scrollTo(0,0);
}
async function handleButton(button) {
  const id=button.dataset.action??button.id;
  if(button.dataset.count) {captureOptions();ui.count=Number(button.dataset.count);render();return;}
  if(button.dataset.piece) {if(!canPlay()) return;ui.selected=button.dataset.piece;ui.orientation=0;ui.cursor=null;render();if(matchMedia('(max-width:760px)').matches) $('#board').scrollIntoView({block:'center'});return;}
  if(id==='theme-toggle') {captureOptions();ui.theme=ui.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=ui.theme;write('djq-theme',ui.theme);render();}
  else if(id==='rules-button') showRules();
  else if(id==='home-button'||id==='leave-room') {captureOptions();await goHome();}
  else if(id==='local-start') {captureOptions();beginLocal();}
  else if(id==='resume-local') {try{beginLocal(read(LOCAL));}catch{write(LOCAL,null);throw Error('INVALID_REPLAY');}}
  else if(id==='create-room'||id==='join-room') {
    captureOptions();write('djq-name',ui.name);ui.pending=true;ui.mode='online';render();
    try {if(id==='create-room') await network.create({name:ui.name,players:ui.count,scoring:ui.scoring,turnSeconds:ui.seconds});
      else await network.join(ui.joinCode.trim().toUpperCase(),ui.name);
    } finally {ui.pending=false;render();}
  }
  else if(id==='ready'||id==='online-start') {
    ui.pending=true;render();try{await network.command(id==='ready'?{type:'ready',ready:!ui.room.players[ui.room.you].ready}:{type:'start'});}finally{ui.pending=false;render();}
  }
  else if(id==='copy-invite') {
    const link=`${location.origin}/?room=${ui.room.code}`;
    try {await navigator.clipboard.writeText(link);toast(t('copied'));}
    catch {const modal=$('#modal');modal.innerHTML=`<div class="modal-heading"><h2 id="modal-title">${t('invite')}</h2><button id="close-modal" class="icon-button">${icon('close')}</button></div><input value="${escape(link)}" readonly aria-label="${t('invite')}">`;modal.showModal();modal.querySelector('input').select();}
  }
  else if(id==='rotate'||id==='flip') {
    if(!canPlay()||!ui.selected) return;
    ui.orientation=id==='rotate'?(ui.orientation>=4?4:0)+(ui.orientation%4+1)%4:(ui.orientation<4?4:0)+(4-ui.orientation%4)%4;render();
  }
  else if(id==='hint') {if(!canPlay()) return;const move=findMove(ui.game);if(!move){toast(t('noHint'));return;}ui.selected=move.piece;ui.orientation=move.orientation;ui.cursor={x:move.x,y:move.y};render();}
  else if(id==='clear-selection') {resetSelection();render();}
  else if(id==='confirm-move') await commitMove();
  else if(id==='dock-pieces') $('.piece-tray').scrollIntoView({block:'center'});
  else if(id==='show-corners') {ui.showCorners=!ui.showCorners;button.setAttribute('aria-pressed',String(ui.showCorners));drawFrontiers();}
  else if(id==='undo'&&ui.mode==='local'&&ui.game.history.length) {const record=exportReplay(ui.game,ui.names);record.actions.pop();ui.game=replay(record);resetSelection();saveLocal();render();}
  else if(id==='resign'&&confirm(t('resignConfirm'))) {
    if(ui.mode==='local') {resign(ui.game,controller(ui.game));resetSelection();saveLocal();render();}
    else {ui.pending=true;render();try{await network.command({type:'resign',round:ui.room.round,revision:ui.game.revision});}finally{ui.pending=false;render();}}
  }
  else if(id==='rematch') {
    if(ui.mode==='local') {ui.count=ui.game.players;ui.scoring=ui.game.scoring;beginLocal();}
    else {ui.pending=true;render();try{await network.command({type:'rematch'});}finally{ui.pending=false;render();}}
  }
  else if(id==='export-replay') exportFile();
  else if(id==='import-replay') $('#import-file').click();
  else if(id==='replay-prev'||id==='replay-next') setReplayStep(ui.replayStep+(id==='replay-next'?1:-1));
}
let suppressClickUntil=0,drag=null;
$('#app').addEventListener('click',event=>{
  if(Date.now()<suppressClickUntil) return;
  const button=event.target.closest('button');if(button&&!button.disabled) handleButton(button).catch(error=>toast(t(error.message)));
});
$('#modal').addEventListener('click',event=>{if(event.target.closest('#close-modal')||event.target===$('#modal')) $('#modal').close();});
$('#app').addEventListener('change',event=>{
  if(event.target.id==='replay-range') setReplayStep(Number(event.target.value));else captureOptions();
});
$('#app').addEventListener('input',event=>{
  if(event.target.id==='room-code-input') event.target.value=event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
  if(event.target.id==='replay-range') $('#replay-label').textContent=`${event.target.value} / ${ui.replayRecord.actions.length}`;
});
function setCursorFromPointer(event) {
  const board=$('#board');if(!board||!canPlay()||!ui.selected) return false;
  const r=board.getBoundingClientRect();if(event.clientX<r.left||event.clientX>=r.right||event.clientY<r.top||event.clientY>=r.bottom) return false;
  ui.cursor={x:Math.floor((event.clientX-r.left)/r.width*20),y:Math.floor((event.clientY-r.top)/r.height*20)};updatePreview();return true;
}
$('#app').addEventListener('pointerdown',event=>{
  const piece=event.target.closest('[data-piece]');
  if(piece&&!piece.disabled&&event.pointerType==='mouse') drag={id:piece.dataset.piece,startX:event.clientX,startY:event.clientY,moving:false};
  if(event.target.closest('#board')) {setCursorFromPointer(event);$('#board')?.focus({preventScroll:true});}
});
document.addEventListener('pointermove',event=>{
  if(drag&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>8&&canPlay()) {
    if(!drag.moving) {drag.moving=true;ui.selected=drag.id;ui.orientation=0;render();}
    setCursorFromPointer(event);
  } else if(event.target.closest?.('#board')&&event.pointerType==='mouse') setCursorFromPointer(event);
});
document.addEventListener('pointerup',event=>{if(drag?.moving){setCursorFromPointer(event);suppressClickUntil=Date.now()+350;}drag=null;});
document.addEventListener('pointercancel',()=>drag=null);
document.addEventListener('keydown',event=>{
  if($('#modal').open||event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,select,textarea,[contenteditable="true"]')) return;
  if(!canPlay()) return;
  if(event.key==='Enter'&&event.target.closest('button,a')) return;
  const key=event.key.toLowerCase();
  if(['r','f','enter','escape','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) event.preventDefault();
  if(key==='r'||key==='f') {const button=$(key==='r'?'#rotate':'#flip');if(button&&!button.disabled) handleButton(button);}
  else if(key==='enter') commitMove().catch(error=>toast(t(error.message)));
  else if(key==='escape') {resetSelection();render();}
  else if(key.startsWith('arrow')&&ui.selected) {
    ui.cursor??={x:CORNERS[ui.game.turn][0],y:CORNERS[ui.game.turn][1]};
    if(key==='arrowleft') ui.cursor.x--;if(key==='arrowright') ui.cursor.x++;if(key==='arrowup') ui.cursor.y--;if(key==='arrowdown') ui.cursor.y++;
    ui.cursor.x=Math.max(0,Math.min(19,ui.cursor.x));ui.cursor.y=Math.max(0,Math.min(19,ui.cursor.y));updatePreview();
  }
});
function setReplayStep(step) {ui.replayStep=Math.max(0,Math.min(ui.replayRecord.actions.length,step));ui.game=replay(ui.replayRecord,ui.replayStep);resetSelection();render();}
$('#import-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file) return;
  try {if(file.size>524288) throw Error();const input=JSON.parse(await file.text()),validated=replay(input);
    ui.replayRecord=exportReplay(validated,Array.isArray(input.names)?input.names:[]);ui.names=ui.replayRecord.names;
    ui.mode='local';ui.room=null;ui.view='replay';setReplayStep(0);window.scrollTo(0,0);
  } catch {toast(t('INVALID_REPLAY'));}
});
window.addEventListener('pagehide',()=>network.stop(false));
window.addEventListener('pageshow',event=>{if(event.persisted&&savedSession()) network.attach(savedSession()).catch(error=>toast(t(error.message)));});
setInterval(updateCountdown,1000);
render();
const session=savedSession();
if(session) {ui.mode='online';network.attach(session).catch(error=>{network.stop();ui.mode='local';ui.view='home';render();toast(t(error.message));});}
