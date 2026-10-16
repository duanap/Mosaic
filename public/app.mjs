import { PIECES, COLORS, CORNERS, transform, newGame, validateMove, applyMove, findMove,
  controller, scores, teamScores, resign, replay, exportReplay, pieceSize, ownedColors } from '/shared/rules.mjs';
import { RoomClient, savedSession, savedSessions } from '/network.mjs';
import { t } from '/i18n.mjs';
import { clampOrigin, hitPreview, rotatePreview, flipPreview, initialPreview, beginGesture, moveGesture, endGesture } from '/placement.mjs';
import { AnalysisClient } from '/analysis-client.mjs';
import { pieceSVG, selectionMarkup, fitGameBoard } from '/game-ui.mjs';

const $=selector=>document.querySelector(selector);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(key,fallback=null)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
const LOCAL='djq-local-v1';
const compactGame=matchMedia('(min-width:600px) and (max-height:560px) and (orientation:landscape)');
const analysis=new AnalysisClient();
const botAnalysis=new AnalysisClient();
let hintMoves=null,hintIndex=0,hintLabel='',analysisGeneration=0,hintPending=false;
let botGeneration=0,botKey=null;
const ui={view:'home',mode:'local',count:4,variant:'classic',seatKinds:['human','human','human','human'],scoring:'bonus',seconds:90,name:read('djq-name',`${t('player')}${Math.floor(Math.random()*900)+100}`),
  joinCode:new URLSearchParams(location.search).get('room')?.toUpperCase().slice(0,6)??'',
  piecesOpen:false,historyOpen:false,game:null,room:null,names:[],selected:null,orientation:0,cursor:null,showCorners:false,pending:false,connected:false,
  replayRecord:null,replayStep:0,clockOffset:0,recoveries:[],theme:read('djq-theme',matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')};
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
function resetSelection() {analysis.cancel();analysisGeneration++;botAnalysis.cancel();botGeneration++;botKey=null;hintMoves=null;hintIndex=0;hintLabel='';hintPending=false;drag=null;ui.selected=null;ui.orientation=0;ui.cursor=null;}
function setPreview(move) {ui.selected=move.piece;ui.orientation=move.orientation;ui.cursor={x:move.x,y:move.y};}
function manualPreview() {hintLabel='';if(hintPending){analysis.cancel();analysisGeneration++;hintPending=false;}}
const selectedMode=()=>ui.count===4?ui.variant:ui.count===2?'duo':'trio';
const modeLabel=game=>game.mode==='teams'?'四人双色组队':game.mode==='classic'?'四人各自计分':t('mode'+game.players);
function modeSettings() {return ui.count===4?`<label class="inline-field mode-settings">四人玩法<select id="game-mode"><option value="classic" ${ui.variant==='classic'?'selected':''}>四人各自计分</option><option value="teams" ${ui.variant==='teams'?'selected':''}>两队双色 · 蓝红 / 黄绿</option></select></label>`:'';}
function localSeats() {return `<fieldset class="local-seats"><legend>同屏玩家 / 机器人</legend>${Array.from({length:ui.count},(_,i)=>`<label><span>${t('player')} ${i+1} ${ownedColors(ui.count,i).map(badge).join('')}${selectedMode()==='teams'?` / ${i%2?'B':'A'}队`:''}</span><select data-seat-kind="${i}" ${i===0?'disabled':''}><option value="human" ${ui.seatKinds[i]==='human'?'selected':''}>真人</option><option value="bot" ${ui.seatKinds[i]==='bot'?'selected':''}>机器人 · 标准</option></select></label>`).join('')}</fieldset>`;}
function syncTray() {
  const selected=document.querySelector('[data-piece="'+ui.selected+'"]');
  if(selected) selected.innerHTML=miniPiece(ui.selected,ui.orientation)+`<span>${ui.selected}</span>`;
}
function captureOptions() {
  if($('#player-name')) ui.name=$('#player-name').value;
  if($('#room-code-input')) ui.joinCode=$('#room-code-input').value;
  if($('#scoring')) ui.scoring=$('#scoring').value;
  if($('#turn-seconds')) ui.seconds=Number($('#turn-seconds').value);
  if($('#game-mode')) ui.variant=$('#game-mode').value;
  document.querySelectorAll('[data-seat-kind]').forEach(node=>ui.seatKinds[Number(node.dataset.seatKind)]=node.value);
}
function header() {
  const match=(ui.view==='game'||ui.view==='replay')&&ui.game;
  return `<header class="site-header ${match?'match-header':''}"><button id="home-button" class="brand" aria-label="${t('home')}"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><strong>${t('title')}</strong><span class="brand-label">DJQ</span></button>
  ${match?`<div class="match-context"><strong>${t(ui.view==='replay'?'replay':ui.mode)}</strong><span>${ui.game.players} ${t('people')} / ${modeLabel(ui.game)} / ${t(ui.game.scoring)}${ui.mode==='online'&&ui.room?` / ${ui.room.code}`:''}</span></div>`:''}
  <nav aria-label="${t('gameNavigation')}"><button id="rules-button" class="text-button">${icon('help')}<span>${t('rules')}</span></button>${match?`<button id="leave-room" class="text-button">${icon('back')}<span>${t('home')}</span></button>`:`<a class="github-link" href="https://github.com/duanap/Mosaic" target="_blank" rel="noopener noreferrer">GitHub ${icon('arrow')}</a>`}<button id="theme-toggle" class="icon-button" aria-label="${t('theme')}">${icon(ui.theme==='dark'?'sun':'moon')}</button></nav></header>`;
}
const miniPiece=pieceSVG;
function boardSVG(game,interactive=true) {
  const tiles=game.board.map((c,index)=>c<0?'':`<rect class="tile c${c}" x="${index%20*30+1.5}" y="${Math.floor(index/20)*30+1.5}" width="27" height="27" rx="3.6"/>`).join('');
  const last=game.history.findLast(a=>a.type==='move');
  const highlight=last?transform(last.move.piece,last.move.orientation).map(([x,y])=>`<rect class="last-tile" x="${(x+last.move.x)*30+4}" y="${(y+last.move.y)*30+4}" width="22" height="22" rx="2"/>`).join(''):'';
  const marks=CORNERS.map(([x,y],c)=>game.started[c]?'':`<g class="start-mark c${c}"><circle cx="${x*30+15}" cy="${y*30+15}" r="11"/><text x="${x*30+15}" y="${y*30+19.5}" text-anchor="middle">${'BYRG'[c]}</text></g>`).join('');
  const grid=Array.from({length:21},(_,i)=>`M${i*30} 0V600M0 ${i*30}H600`).join('');
  return `<svg ${interactive?`id="board" tabindex="0" role="application" aria-label="20 x 20 ${t('title')}. ${t('shortcut')}"`:'aria-hidden="true"'} class="board-svg" viewBox="0 0 600 600"><rect class="board-base" width="600" height="600"/><path class="grid-lines" d="${grid}"/>${tiles}${marks}${highlight}${interactive?'<g id="frontiers"></g><g id="preview" pointer-events="none"></g>':''}</svg>`;
}
const demo=newGame(4);for(let n=0;n<32;n++) applyMove(demo,findMove(demo));
function recoveryView() {
  ui.recoveries=savedSessions();
  if(!ui.recoveries.length) return '';
  return `<section class="recovery-section" aria-labelledby="recovery-title"><h2 id="recovery-title">${t('recoverSeat')}</h2><p>${t('recoverHelp')}</p><div class="recovery-actions">${ui.recoveries.map((s,i)=>`<button class="button secondary" data-recover="${i}"${busy()}>${icon('back')}<span>${escape(s.name||t('player'))} / ${s.code}${s.seat===null?'':` / ${t('seat')} ${s.seat+1}`}</span></button>`).join('')}</div></section>`;
}
function homeView() {
  return `<main class="home-shell"><section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="live-dot"></span> SMALL BOARD. BIG POSSIBILITIES.</p><h1>${t('hero')}</h1><p class="lead">${t('intro')}</p><div class="quick-rules">${[1,2,3].map(n=>`<span><b>0${n}</b>${t('tip'+n)}</span>`).join('')}</div></div>
  <div class="hero-art"><div class="art-orbit"></div><div class="hero-board-wrap">${boardSVG(demo,false)}</div><div class="art-tag"><span class="tag-block">21</span><span>${t('tiles')} / ${t('perColor')}<small>89 LITTLE SQUARES</small></span></div><span class="art-caption">A NEW ANGLE ON EVERY MOVE.</span></div></section>
  <section class="play-section"><div class="section-heading"><div><p class="eyebrow">01 / LET'S PLAY</p><h2>${t('chooseMode')}</h2></div><div class="mode-switch" aria-label="${t('chooseMode')}">${[2,3,4].map(n=>`<button id="mode-${n}" data-count="${n}" class="${ui.count===n?'selected':''}" aria-pressed="${ui.count===n}"><strong>${n}<small>${t('people')}</small></strong><span>${t('mode'+n)}</span></button>`).join('')}</div></div>
  ${modeSettings()}<div class="play-cards"><article class="play-card local-card"><div class="card-top"><span class="card-icon">${icon('users')}</span><span class="eyebrow">SAME SCREEN</span></div><h3>${t('localTitle')}</h3><p>${t('localDesc')}</p>${localSeats()}<label class="inline-field">${t('scoring')}<select id="scoring"><option value="bonus" ${ui.scoring==='bonus'?'selected':''}>${t('bonus')} +15 / +20</option><option value="simple" ${ui.scoring==='simple'?'selected':''}>${t('simple')}</option></select></label><button id="local-start" class="button primary wide">${t('localStart')}${icon('arrow')}</button>${read(LOCAL)?`<button id="resume-local" class="text-button resume">${t('resume')}${icon('back')}</button>`:`<p class="fine">${t('saved')}</p>`}</article>
  <article class="play-card online-card"><div class="card-top"><span class="card-icon">${icon('link')}</span><span class="eyebrow">PLAY TOGETHER</span></div><h3>${t('onlineTitle')}</h3><p>${t('onlineDesc')}</p><div class="online-fields"><label>${t('name')}<input id="player-name" maxlength="20" autocomplete="nickname" value="${escape(ui.name)}"></label><label>${t('turnLimit')}<select id="turn-seconds">${[30,60,90,120].map(n=>`<option value="${n}" ${ui.seconds===n?'selected':''}>${n} ${t('seconds')}</option>`).join('')}</select></label></div><div class="online-actions"><button id="create-room" class="button secondary"${busy()}>${t('create')}${icon('arrow')}</button><div class="join-field"><input id="room-code-input" maxlength="6" autocomplete="off" aria-label="${t('code')}" placeholder="${t('code')}" value="${escape(ui.joinCode)}"><button id="join-room" class="text-button"${busy()}>${t('join')}</button></div></div></article></div></section>
  ${recoveryView()}<footer class="home-footer"><span>DJQ / v1.1.0 <i></i>${t('footer')}</span><button id="import-replay" class="text-button">${t('import')}${icon('arrow')}</button></footer></main>`;
}
function connectionLabel() {return `<span id="connection" class="connection ${ui.connected?'connected':''}"><i></i>${t(ui.connected?'connected':'reconnecting')}</span>`;}
function lobbyView() {
  const r=ui.room,host=r.you===r.host,full=r.players.every(p=>p&&!p.left),online=r.players.every(p=>p&&(p.kind==='bot'||p.connected));
  return `<main class="lobby-shell"><div class="lobby-intro"><p class="eyebrow">YOUR TABLE</p><h1>${t('lobbyTitle')}</h1><p>${t('lobbyDesc')}</p></div><div class="lobby-grid"><section class="lobby-main panel"><div class="lobby-code"><div><span class="eyebrow">${t('code')}</span><strong id="room-code">${r.code}</strong></div><button id="copy-invite" class="button secondary">${icon('link')}${t('invite')}</button></div><div class="lobby-seats">${r.players.map((p,i)=>`<div class="lobby-seat ${p?'':'empty'}"><div class="seat-avatar c${i}">${i+1}</div><div class="seat-name"><strong>${p?escape(p.name):t('empty')}${r.mode==='teams'?` / ${i%2?'B':'A'}队`:''}</strong><span>${ownedColors(r.capacity,i).map(badge).join('')} ${i===r.host?t('host'):''} ${i===r.you?` / ${t('you')}`:''}</span></div><span class="seat-status">${p?p.kind==='bot'?'标准机器人':t(p.connected?'connected':'offline'):''}</span>${host&&!p?`<button class="button secondary small" data-add-bot="${i}"${busy()}>添加机器人</button>`:''}${host&&p?.kind==='bot'?`<button class="text-button" data-remove-bot="${i}"${busy()}>移除</button>`:''}</div>`).join('')}</div><div class="lobby-buttons">${host?`<button id="online-start" class="button primary" ${!full||!online||!ui.connected||ui.pending?'disabled':''}>${t('start')}${icon('arrow')}</button>`:`<span>${t('waitHost')}</span>`}<p class="fine">${!full?'等待朋友加入，或添加机器人补齐空位':!online?'等待真人玩家重新连接':'玩家已就位，由房主开始'}</p></div></section><aside class="panel lobby-aside"><p class="eyebrow">TABLE SETTINGS</p><h2>${r.capacity} ${t('people')} / ${r.mode==='teams'?'双色组队':t('mode'+r.capacity)}</h2><dl><div><dt>BOARD</dt><dd>20 &times; 20</dd></div><div><dt>${t('scoring')}</dt><dd>${t(r.scoring)}</dd></div><div><dt>${t('turnLimit')}</dt><dd>${r.turnSeconds} ${t('seconds')}</dd></div></dl><p>${r.mode==='teams'?'蓝红为A队，黄绿为B队。每人控制自己的颜色，按队伍总分结算。':t(r.capacity===3?'neutralHelp':'ruleFirst')}</p>${connectionLabel()}<button id="leave-room" class="text-button">${icon('back')}${t('home')}</button></aside></div></main>`;
}
function canPlay() {return ui.view==='game'&&ui.game?.status==='playing'&&!ui.pending&&(ui.mode==='local'?ui.game.seats[controller(ui.game)].kind==='human':(ui.connected&&ui.room?.you===controller(ui.game)));}
function playerCards(game) {
  return `<div class="player-cards players-${game.players}">${scores(game).map(s=>{
    const active=game.status==='playing'&&controller(game)===s.player,bot=game.seats[s.player].kind==='bot',color=active?game.turn:s.colors[0];
    const ended=s.colors.every(c=>game.stopped[c]);
    const offline=ui.mode==='online'&&!bot&&!ui.room?.players[s.player]?.connected;
    const state=s.resigned?t('resigned'):game.status==='finished'?(s.winner?t('win'):t('finished')):active?t(bot?'thinking':'currentTurn')+(offline?` · ${t('offline')}`:''):offline?t('offline'):ended?(game.players===3&&!game.stopped[3]?t('neutralRotation'):t('colorEnded')):t('waitingTurn');
    return `<article class="player-card c${color} ${active?'active':''} ${s.resigned?'forfeited':''}" data-player="${s.player}" ${active?'aria-current="true"':''}><div class="player-ident"><span class="player-avatar">${s.player+1}</span><div><strong>${escape(playerName(s.player))}</strong><small class="player-type">${t(bot?'robot':'human')}${game.mode==='teams'?` / ${s.player%2?'B':'A'}${t('team')}`:''}${ui.mode==='online'&&ui.room?.you===s.player?` / ${t('you')}`:''}</small><div class="player-colors">${s.colors.map(c=>`<span>${badge(c)}${t(COLORS[c])}${t('colorSuffix')}</span>`).join('')}</div></div></div><div class="player-score"><strong>${s.score>0?'+':''}${s.score}</strong><span>${s.remaining} ${t('squares')}${t('remaining')}</span></div><span class="player-state ${active?'is-current':''}">${state}</span></article>`;
  }).join('')}</div>`;
}
function controls(game) {
  const active=game.turn,allowed=canPlay(),remaining=game.remaining[active],replaying=ui.view==='replay';
  const modal=compactGame.matches&&ui.piecesOpen;
  const close=`<button id="close-pieces" class="icon-button close-pieces" aria-label="${t('closePieces')}">${icon('close')}</button>`;
  const auxiliary=`<div class="auxiliary-actions"><button id="show-corners" class="text-button" aria-pressed="${ui.showCorners}">${icon('hint')}${t('corners')}</button><button id="export-replay" class="text-button">${icon('export')}${t('export')}</button>${!replaying&&ui.mode==='local'?`<button id="undo" class="text-button" ${!game.history.length?'disabled':''}>${icon('back')}${t('undo')}</button>`:''}${!replaying&&game.status==='playing'?`<button id="resign" class="text-button danger" ${ui.pending||ui.mode==='local'&&!canPlay()||ui.mode==='online'&&(!ui.connected||game.resigned[ui.room.you])?'disabled':''}>${t('resign')}</button>`:''}</div>`;
  if(replaying) return `<aside id="game-controls" class="control-panel panel replay-panel" ${modal?'role="dialog" aria-modal="true"':''} aria-labelledby="controls-title">${close}<div class="control-scroll"><p class="eyebrow">REPLAY / READ ONLY</p><h2 id="controls-title">${t('replay')}</h2><p class="replay-help">${t('replayHelp')}</p><div class="replay-progress"><strong id="replay-label">${ui.replayStep} / ${ui.replayRecord.actions.length}</strong><input id="replay-range" aria-label="${t('replay')}" type="range" min="0" max="${ui.replayRecord.actions.length}" value="${ui.replayStep}"></div>${auxiliary}${moveLog(game)}</div><div class="replay-buttons"><button id="replay-prev" class="button secondary" ${ui.replayStep===0?'disabled':''}>${icon('back')}${t('prev')}</button><button id="replay-next" class="button primary" ${ui.replayStep===ui.replayRecord.actions.length?'disabled':''}>${t('next')}${icon('arrow')}</button></div></aside>`;
  return `<aside id="game-controls" class="control-panel panel" ${modal?'role="dialog" aria-modal="true"':''} aria-labelledby="controls-title">${close}<div class="control-scroll"><div class="control-heading"><div><h2 id="controls-title">${t('choosePiece')}</h2><span>${t('shapeInventory')}</span></div><span class="remaining-pill c${active}">${remaining.length}<small> / 21</small></span></div><div class="tray-legend"><span class="c${active}"><i></i>${t('available')}</span><span><i></i>${t('used')}</span></div>
  <div class="piece-tray c${active}" aria-label="${t('choosePiece')}">${PIECES.slice().reverse().map(p=>`<button class="piece ${ui.selected===p.id?'selected':''} ${remaining.includes(p.id)?'':'used'}" data-piece="${p.id}" aria-label="${p.id} / ${p.cells.length} ${t('squares')}" aria-pressed="${ui.selected===p.id}" ${!allowed||!remaining.includes(p.id)?'disabled':''}>${miniPiece(p.id,ui.selected===p.id?ui.orientation:0)}<span>${p.id}</span></button>`).join('')}</div>
  <section class="selection-tools" aria-labelledby="selection-title"><h3 id="selection-title">${t('currentPiece')}</h3><div id="selected-piece" class="selected-piece">${selectionMarkup(ui.selected,ui.orientation,active,t)}</div><div class="transform-tools"><button id="rotate" class="tool-button" ${!allowed||!ui.selected?'disabled':''}>${icon('rotate')}${t('rotate')}<kbd>R</kbd></button><button id="flip" class="tool-button" ${!allowed||!ui.selected?'disabled':''}>${icon('flip')}${t('flip')}<kbd>F</kbd></button><p class="keyboard-help">${t('shortcut')}</p></div></section>
  ${auxiliary}<details id="game-history" class="game-history" ${ui.historyOpen?'open':''}><summary>${t('log')}<span>${game.history.length}</span></summary>${moveLog(game)}</details></div>
  <div class="commit-section"><div class="preview-info"><span id="preview-status" role="status" aria-live="polite">${t('chooseHelp')}</span><button id="clear-selection" class="icon-button" aria-label="${t('clear')}">${icon('close')}</button></div><div class="commit-actions"><button id="hint" class="button hint-button" ${!allowed||hintPending?'disabled':''} aria-busy="${hintPending}">${icon('hint')}${t(hintPending?'calculating':'hint')}</button><button id="confirm-move" class="button primary confirm-button" disabled aria-busy="${ui.pending}">${icon('check')}${t(ui.pending?'submitting':'confirm')}</button></div></div></aside>`;
}
function moveLog(game) {
  return `<section class="move-log"><h3>${t('log')}</h3>${game.history.length?`<ol>${game.history.slice(-5).reverse().map(a=>`<li>${a.type==='move'?badge(a.color):icon('close')}<span>${escape(playerName(a.player))}<small>${a.type==='move'?`${a.move.piece} / ${String.fromCharCode(65+a.move.x)}${a.move.y+1}${a.source==='bot'?' / 机器人':a.automatic?` / ${t('auto')}`:''}`:t('resigned')}</small></span></li>`).join('')}</ol>`:`<p>${t('emptyLog')}</p>`}</section>`;
}
function resultView(game) {
  const winners=game.mode==='teams'?teamScores(game).filter(s=>s.winner):scores(game).filter(s=>s.winner);
  const labels=winners.map(s=>game.mode==='teams'?`${s.team?'B':'A'}队（${s.members.map(i=>escape(playerName(i))).join('、')}）`:escape(playerName(s.player)));
  return `<section class="result-banner"><div class="result-icon">${icon('trophy')}</div><div><p class="eyebrow">WELL PLAYED</p><h2>${labels.join(' & ')} ${t(winners.length>1?'tie':'win')}</h2><p>${t('finished')} / ${t(game.scoring)}</p></div>${ui.view!=='replay'?(ui.mode==='local'||ui.room.you===ui.room.host?`<button id="rematch" class="button primary"${busy()}>${t('rematch')}${icon('arrow')}</button>`:`<span>${t('waitHost')}</span>`):''}</section>`;
}
function teamCards(game) {return game.mode==='teams'?`<div class="team-cards">${teamScores(game).map(s=>`<article><strong>${s.team?'B':'A'}队 · ${s.members.map(i=>escape(playerName(i))).join(' + ')}</strong><span>${s.score}分 / 剩${s.remaining}格</span></article>`).join('')}</div>`:'';}
function mobileDock(game) {
  if(ui.view==='replay') return `<div class="mobile-dock replay-dock"><button data-action="replay-prev" ${ui.replayStep===0?'disabled':''}>${icon('back')}${t('prev')}</button><button id="dock-pieces" aria-controls="game-controls" aria-expanded="${ui.piecesOpen}">${t('replay')} ${ui.replayStep}/${ui.replayRecord.actions.length}</button><button data-action="replay-next" ${ui.replayStep===ui.replayRecord.actions.length?'disabled':''}>${t('next')}${icon('arrow')}</button></div>`;
  if(game.status!=='playing') return `<div class="mobile-dock ended-dock"><button id="dock-pieces" aria-controls="game-controls" aria-expanded="${ui.piecesOpen}">${icon('export')}${t('gameActions')}</button></div>`;
  const allowed=canPlay();
  return `<div class="mobile-dock"><div class="dock-status">${badge(game.turn)}<span>${ui.selected??t('choosePiece')}</span><small>${t(game.seats[controller(game)].kind==='bot'?'thinking':allowed?'yourTurn':'otherTurn')}</small></div><div class="dock-actions"><button data-action="rotate" ${!allowed||!ui.selected?'disabled':''}>${icon('rotate')}${t('rotate')}</button><button data-action="flip" ${!allowed||!ui.selected?'disabled':''}>${icon('flip')}${t('flip')}</button><button id="dock-pieces" aria-controls="game-controls" aria-expanded="${ui.piecesOpen}">${icon('users')}${t('choosePiece')}</button><button data-action="confirm-move" class="dock-confirm" disabled>${icon('check')}${t(ui.pending?'submitting':'confirm')}</button></div></div>`;
}
function gameView() {
  const game=ui.game,playing=game.status==='playing',color=game.turn;
  return `<main class="game-shell game-shell-v2 ${ui.piecesOpen?'pieces-open':''}"><div class="game-layout"><aside class="players-panel" aria-labelledby="players-heading"><div class="players-heading"><h2 id="players-heading">${t('playersTitle')}</h2><span>${game.players} ${t('people')}</span></div>${playerCards(game)}${teamCards(game)}
  ${game.players===3?`<div class="neutral-bar">${badge(3)}<strong>${t('neutral')}</strong><span>${t('neutralHelp')}</span><b>${escape(playerName(controller(game,3)))}</b></div>`:''}<div class="table-status">${ui.mode==='online'?connectionLabel():`<span>${t('saved')}</span>`}<span>DJQ · UI 2.0</span></div></aside>
  <section class="board-section" aria-label="${t('boardTitle')}"><div class="board-heading"><h2>20 × 20 <span>${t('boardTitle')}</span></h2><div class="turn-banner"><div>${badge(color)}<span>${playing?`<strong>${escape(playerName(controller(game)))}</strong>${game.seats[controller(game)].kind==='bot'?` · ${t('thinking')}`:''}`:t('finished')}</span></div>${ui.mode==='online'&&playing?'<span id="countdown" class="countdown"></span>':''}</div></div>${!playing?resultView(game):''}
  <div class="board-frame">${boardSVG(game)}</div><div class="board-meta"><span><strong id="move-number">${game.history.filter(a=>a.type==='move').length}</strong> ${t('moves')}</span><span>${t(ui.view==='replay'?'replay':'boardGesture')}</span></div></section>${controls(game)}</div><button id="pieces-backdrop" class="pieces-backdrop" aria-label="${t('closePieces')}" tabindex="-1"></button>${mobileDock(game)}</main>`;
}
function render() {
  if(drag) return;
  const focused=document.activeElement,focusId=focused?.id,focusPiece=focused?.dataset?.piece;
  document.body.dataset.screen=ui.view==='game'||ui.view==='replay'?'game':ui.view;
  $('#app').innerHTML=header()+(ui.view==='home'?homeView():ui.view==='lobby'?lobbyView():gameView());
  if(compactGame.matches&&ui.piecesOpen) document.querySelectorAll('.match-header,.players-panel,.board-section,.mobile-dock').forEach(node=>{node.inert=true;});
  if(ui.game&&ui.view!=='home'&&ui.view!=='lobby') {updatePreview();drawFrontiers();}
  fitGameBoard();
  updateCountdown();
  const replacement=focusId?document.getElementById(focusId):focusPiece?document.querySelector(`[data-piece="${focusPiece}"]`):null;
  if(replacement&&!replacement.disabled&&replacement.getClientRects().length) replacement.focus({preventScroll:true});
  scheduleLocalBot();
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
  group.innerHTML=cells.map(([x,y])=>`<rect class="ghost c${ui.game.turn} ${result?.ok?'valid':'invalid'}" x="${x*30+1.5}" y="${y*30+1.5}" width="27" height="27" rx="3.6"/>`).join('');
  if(message) {message.textContent=!ui.selected?t('chooseHelp'):!move?t('selectPosition'):`${t(result.ok?'legal':result.code)} (${move.x+1}, ${move.y+1})${hintLabel?' / '+hintLabel:''}`;message.className=result?.ok?'valid-message':'';}
  if(confirm) confirm.disabled=!canPlay()||!result?.ok;
  const dock=$('[data-action="confirm-move"]');if(dock) dock.disabled=!canPlay()||!result?.ok;
  syncTray();
  const selected=$('#selected-piece'),key=`${ui.selected}:${ui.orientation}:${ui.game.turn}`;
  if(selected&&selected.dataset.selection!==key) {selected.innerHTML=selectionMarkup(ui.selected,ui.orientation,ui.game.turn,t);selected.dataset.selection=key;}
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
  ui.mode='local';ui.room=null;ui.replayRecord=null;ui.game=record?replay(record):newGame(ui.count,ui.scoring,{mode:selectedMode(),seats:ui.seatKinds.slice(0,ui.count).map(kind=>kind==='bot'?{kind,level:'standard'}:{kind})});
  ui.names=Array.from({length:ui.game.players},(_,i)=>String(record?.names?.[i]??`${ui.game.seats[i].kind==='bot'?'机器人':t('player')} ${i+1}`).slice(0,20));
  ui.view='game';resetSelection();saveLocal();render();window.scrollTo(0,0);
}
function scheduleLocalBot() {
  if(ui.mode!=='local'||ui.view!=='game'||ui.game?.status!=='playing'||ui.game.seats[controller(ui.game)].kind!=='bot') return;
  const key=`${botGeneration}:${ui.game.revision}`;if(botKey===key) return;botKey=key;
  const game=ui.game,generation=botGeneration,revision=game.revision;
  botAnalysis.analyze({kind:'bot',context:key,game}).then(result=>{
    if(generation!==botGeneration||ui.game!==game||ui.view!=='game'||ui.mode!=='local'||game.revision!==revision) return;
    const move=result?.move&&validateMove(game,result.move).ok?result.move:findMove(game);
    if(!move) return;applyMove(game,move,{source:'bot'});resetSelection();saveLocal();render();
  });
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
  ui.piecesOpen=false;
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
async function resumeOnline(session,automatic=false) {
  ui.pending=true;ui.mode='online';render();
  try {await network.attach(session,{automatic});}
  catch(error) {
    network.stop(false);ui.mode='local';ui.room=null;ui.game=null;ui.view='home';resetSelection();throw error;
  } finally {ui.pending=false;render();}
}
async function handleButton(button) {
  const id=button.dataset.action??button.id;
  if(button.dataset.recover!==undefined) {
    const session=ui.recoveries[Number(button.dataset.recover)];
    if(session&&!ui.pending) {captureOptions();await resumeOnline({code:session.code,token:session.token});}
    return;
  }
  if(button.dataset.count) {captureOptions();ui.count=Number(button.dataset.count);render();return;}
  if(button.dataset.addBot!==undefined||button.dataset.removeBot!==undefined) {
    const adding=button.dataset.addBot!==undefined;ui.pending=true;render();
    try {await network.command({type:adding?'set-bot':'remove-bot',seat:Number(adding?button.dataset.addBot:button.dataset.removeBot),...(adding?{level:'standard'}:{})});} finally {ui.pending=false;render();}return;
  }
  if(button.dataset.piece) {
    if(!canPlay()) return;manualPreview();setPreview(initialPreview(ui.game,button.dataset.piece,currentMove()));ui.piecesOpen=false;render();
    if(compactGame.matches) $('#board').focus({preventScroll:true});
    else if(matchMedia('(max-width:760px)').matches) $('#board').scrollIntoView({block:'center'});
    return;
  }
  if(id==='theme-toggle') {captureOptions();ui.theme=ui.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=ui.theme;write('djq-theme',ui.theme);render();}
  else if(id==='rules-button') showRules();
  else if(id==='home-button'||id==='leave-room') {captureOptions();await goHome();}
  else if(id==='local-start') {captureOptions();beginLocal();}
  else if(id==='resume-local') {try{beginLocal(read(LOCAL));}catch{write(LOCAL,null);throw Error('INVALID_REPLAY');}}
  else if(id==='create-room'||id==='join-room') {
    captureOptions();write('djq-name',ui.name);ui.pending=true;ui.mode='online';render();
    try {if(id==='create-room') await network.create({name:ui.name,players:ui.count,mode:selectedMode(),scoring:ui.scoring,turnSeconds:ui.seconds});
      else await network.join(ui.joinCode.trim().toUpperCase(),ui.name);
    } finally {ui.pending=false;render();}
  }
  else if(id==='online-start') {
    ui.pending=true;render();try{await network.command({type:'start'});}finally{ui.pending=false;render();}
  }
  else if(id==='copy-invite') {
    const link=`${location.origin}/?room=${ui.room.code}`;
    try {await navigator.clipboard.writeText(link);toast(t('copied'));}
    catch {const modal=$('#modal');modal.innerHTML=`<div class="modal-heading"><h2 id="modal-title">${t('invite')}</h2><button id="close-modal" class="icon-button">${icon('close')}</button></div><input value="${escape(link)}" readonly aria-label="${t('invite')}">`;modal.showModal();modal.querySelector('input').select();}
  }
  else if(id==='rotate'||id==='flip') {
    if(!canPlay()||!ui.selected) return;
    manualPreview();
    setPreview(id==='rotate'?rotatePreview(currentMove()):flipPreview(currentMove()));render();
  }
  else if(id==='hint') {
    if(!canPlay()||hintPending) return;
    if(!hintMoves) {
      hintPending=true;const generation=analysisGeneration;
      button.disabled=true;button.setAttribute('aria-busy','true');button.innerHTML=icon('hint')+t('calculating');
      const result=await analysis.analyze({context:generation,kind:'hints',game:ui.game});
      if(generation!==analysisGeneration) return;
      hintPending=false;if(!result) {render();toast(t('analysisFailed'));return;}hintMoves=result.moves;
    }
    if(!hintMoves.length) {render();toast(t('noHint'));return;}
    const move=hintMoves[hintIndex];hintLabel=hintMoves.length===1?'仅此1个可行方案':`方案 ${hintIndex+1}/${hintMoves.length}`;
    hintLabel+=` / ${pieceSize(move.piece)}格${move.orientation%4?' / 已旋转':''}${move.orientation>=4?' / 已翻转':''}`;
    hintIndex=(hintIndex+1)%hintMoves.length;setPreview(move);if(compactGame.matches) ui.piecesOpen=false;render();
    if(compactGame.matches) $('#board').focus({preventScroll:true});
  }
  else if(id==='clear-selection') {resetSelection();render();}
  else if(id==='confirm-move') await commitMove();
  else if(id==='dock-pieces') {
    if(compactGame.matches) {ui.piecesOpen=true;render();$('#close-pieces').focus({preventScroll:true});}
    else $('#game-controls').scrollIntoView({block:'start'});
  }
  else if(id==='close-pieces'||id==='pieces-backdrop') {ui.piecesOpen=false;render();$('#dock-pieces')?.focus({preventScroll:true});}
  else if(id==='show-corners') {ui.showCorners=!ui.showCorners;button.setAttribute('aria-pressed',String(ui.showCorners));drawFrontiers();}
  else if(id==='undo'&&ui.mode==='local'&&ui.game.history.length) {
    const record=exportReplay(ui.game,ui.names);let end=record.actions.length-1;
    if(ui.game.seats.some(s=>s.kind==='bot')) {while(end>=0&&ui.game.seats[record.actions[end].player].kind==='bot') end--;}
    if(end<0) return;record.actions=record.actions.slice(0,end);ui.game=replay(record);resetSelection();saveLocal();render();
  }
  else if(id==='resign'&&confirm(t('resignConfirm'))) {
    if(ui.mode==='local'&&!canPlay()) return;
    if(ui.mode==='local') {resign(ui.game,controller(ui.game));resetSelection();saveLocal();render();}
    else {ui.pending=true;render();try{await network.command({type:'resign',round:ui.room.round,revision:ui.game.revision});}finally{ui.pending=false;render();}}
  }
  else if(id==='rematch') {
    if(ui.mode==='local') {ui.count=ui.game.players;ui.variant=ui.game.mode==='teams'?'teams':'classic';ui.seatKinds=ui.game.seats.map(s=>s.kind);ui.scoring=ui.game.scoring;beginLocal();}
    else {ui.pending=true;render();try{await network.command({type:'rematch'});}finally{ui.pending=false;render();}}
  }
  else if(id==='export-replay') exportFile();
  else if(id==='import-replay') $('#import-file').click();
  else if(id==='replay-prev'||id==='replay-next') setReplayStep(ui.replayStep+(id==='replay-next'?1:-1));
}
let suppressClickUntil=0,drag=null;
$('#app').addEventListener('click',event=>{
  if(Date.now()<suppressClickUntil&&event.target.closest('#board,[data-piece]')) return;
  const button=event.target.closest('button');if(button&&!button.disabled) handleButton(button).catch(error=>toast(t(error.message)));
});
$('#modal').addEventListener('click',event=>{if(event.target.closest('#close-modal')||event.target===$('#modal')) $('#modal').close();});
$('#app').addEventListener('change',event=>{
  if(event.target.id==='replay-range') setReplayStep(Number(event.target.value));else {captureOptions();if(event.target.id==='game-mode') render();}
});
$('#app').addEventListener('toggle',event=>{if(event.target.id==='game-history') ui.historyOpen=event.target.open;},true);
$('#app').addEventListener('input',event=>{
  if(event.target.id==='room-code-input') event.target.value=event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
  if(event.target.id==='replay-range') $('#replay-label').textContent=`${event.target.value} / ${ui.replayRecord.actions.length}`;
});
function pointerPoint(event) {
  const r=$('#board').getBoundingClientRect();
  return {clientX:event.clientX,clientY:event.clientY,x:(event.clientX-r.left)/r.width*20,y:(event.clientY-r.top)/r.height*20};
}
$('#app').addEventListener('pointerdown',event=>{
  if(drag||!canPlay()||event.button!==0||!event.isPrimary) return;
  const board=event.target.closest('#board');
  if(!board||!hitPreview(currentMove(),pointerPoint(event))) return;
  event.preventDefault();board.focus({preventScroll:true});
  manualPreview();
  drag=beginGesture({pointerId:event.pointerId,startPoint:pointerPoint(event),move:currentMove()});
  board.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointerId||!canPlay()) return;
  drag=moveGesture(drag,pointerPoint(event));setPreview(drag.move);updatePreview();
});
function finishGesture(event,cancelled=false) {
  if(!drag||(event&&event.pointerId!==drag.pointerId)) return;
  const gesture=drag,result=endGesture(gesture,{cancelled});drag=null;
  setPreview(result.rotate?rotatePreview(result.move,gesture.pivot):result.move);
  suppressClickUntil=Date.now()+350;render();
}
document.addEventListener('pointerup',event=>finishGesture(event));
document.addEventListener('pointercancel',event=>finishGesture(event,true));
document.addEventListener('lostpointercapture',event=>finishGesture(event,true));
window.addEventListener('blur',()=>finishGesture(null,true));
document.addEventListener('keydown',event=>{
  if(compactGame.matches&&ui.piecesOpen) {
    if(event.key==='Escape') {event.preventDefault();ui.piecesOpen=false;render();$('#dock-pieces')?.focus({preventScroll:true});return;}
    if(event.key==='Tab') {
      const nodes=[...$('#game-controls').querySelectorAll('button:not(:disabled),input:not(:disabled),summary')].filter(n=>n.getClientRects().length);
      const first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&document.activeElement===first) {event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last) {event.preventDefault();first?.focus();}
    }
  }
  if($('#modal').open||event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,select,textarea,[contenteditable="true"]')) return;
  if(!canPlay()) return;
  if(drag) {if(event.key==='Escape') finishGesture(null,true);return;}
  if(event.key==='Enter'&&event.target.closest('button,a')) return;
  const key=event.key.toLowerCase();
  if(['r','f','enter','escape','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) event.preventDefault();
  if(key==='r'||key==='f') {const button=$(key==='r'?'#rotate':'#flip');if(button&&!button.disabled) handleButton(button);}
  else if(key==='enter') commitMove().catch(error=>toast(t(error.message)));
  else if(key==='escape') {resetSelection();render();}
  else if(key.startsWith('arrow')&&ui.selected) {
    manualPreview();
    ui.cursor??={x:CORNERS[ui.game.turn][0],y:CORNERS[ui.game.turn][1]};
    if(key==='arrowleft') ui.cursor.x--;if(key==='arrowright') ui.cursor.x++;if(key==='arrowup') ui.cursor.y--;if(key==='arrowdown') ui.cursor.y++;
    ui.cursor=clampOrigin(ui.selected,ui.orientation,ui.cursor);updatePreview();
  }
});
compactGame.addEventListener('change',()=>{if(drag) finishGesture(null,true);ui.piecesOpen=false;render();});
function setReplayStep(step) {ui.replayStep=Math.max(0,Math.min(ui.replayRecord.actions.length,step));ui.game=replay(ui.replayRecord,ui.replayStep);resetSelection();render();}
$('#import-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file) return;
  try {if(file.size>524288) throw Error();const input=JSON.parse(await file.text()),validated=replay(input);
    ui.replayRecord=exportReplay(validated,Array.isArray(input.names)?input.names:[]);ui.names=ui.replayRecord.names;
    ui.mode='local';ui.room=null;ui.view='replay';setReplayStep(0);window.scrollTo(0,0);
  } catch {toast(t('INVALID_REPLAY'));}
});
window.addEventListener('pagehide',()=>{network.stop(false);analysis.cancel();botAnalysis.cancel();botGeneration++;botKey=null;});
window.addEventListener('pageshow',event=>{const session=event.persisted?savedSession():null;if(session) resumeOnline(session,true).catch(error=>toast(t(error.message)));else if(event.persisted) scheduleLocalBot();});
setInterval(updateCountdown,1000);
render();
const session=savedSession();
if(session) resumeOnline(session,true).catch(error=>toast(t(error.message)));
