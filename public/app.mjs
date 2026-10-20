import { PIECES, COLORS, CORNERS, transform, newGame, validateMove, applyMove, findMove,
  controller, scores, teamScores, resign, replay, exportReplay, ownedColors } from '/shared/rules.mjs';
import { RoomClient, savedSession, savedSessions } from '/network.mjs';
import { t } from '/i18n.mjs';
import { clampOrigin, hitPreview, rotatePreview, flipPreview, initialPreview, beginGesture, moveGesture, endGesture } from '/placement.mjs';
import { AnalysisClient } from '/analysis-client.mjs';
import { pieceSVG, selectionMarkup, fitGameBoard, previewOutline, pieceActionsPosition, renderRegion } from '/game-ui.mjs';

const $=selector=>document.querySelector(selector);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(key,fallback=null)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
const LOCAL='djq-local-v1';
const APP_VERSION=document.querySelector('meta[name="application-version"]').content;
document.title=`${t('title')} v${APP_VERSION}`;
const compactGame=matchMedia('(min-width:600px) and (max-height:560px) and (orientation:landscape)');
const analysis=new AnalysisClient();
const botAnalysis=new AnalysisClient();
let hintMoves=null,hintIndex=0,hintLabel='',analysisGeneration=0,hintPending=false;
let botGeneration=0,botKey=null;
const announcedLocalResults=new WeakSet(),announcedOnlineResults=new Set();
const ui={view:'home',mode:'local',count:4,variant:'classic',seatKinds:['human','human','human','human'],scoring:'bonus',seconds:90,name:read('djq-name',`${t('player')}${Math.floor(Math.random()*900)+100}`),
  joinCode:(code=>/^[0-9]{6}$/.test(code??'')?code:'')(new URLSearchParams(location.search).get('room')),
  menu:null,piecesOpen:false,game:null,room:null,names:[],selected:null,orientation:0,cursor:null,showCorners:false,pending:false,connected:false,
  replayRecord:null,replayStep:0,clockOffset:0,recoveries:[],theme:read('djq-theme',matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')};
if(!['dark','light'].includes(ui.theme)) ui.theme='light';
document.documentElement.dataset.theme=ui.theme;
const icons={
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/>',
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
 history:'<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6"/><circle cx="4" cy="12" r=".6"/><circle cx="4" cy="18" r=".6"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>'
};
const icon=name=>`<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]??icons.arrow}</svg>`;
const badge=c=>`<span class="color-mark c${c}" role="img" aria-label="${t(COLORS[c])}${t('colorSuffix')}"></span>`;
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
let renderedTray=null;
function syncTray() {
  const tray=$('.piece-tray');if(!tray) return;
  const color=ui.game.turn,allowed=canPlay(),remaining=ui.game.remaining[color];
  const key=JSON.stringify([color,allowed,remaining,ui.selected,ui.orientation]);
  if(renderedTray?.node===tray&&renderedTray.key===key) return;
  renderedTray={node:tray,key};
  tray.className=`piece-tray c${color}`;
  const legend=$('.tray-legend>span');if(legend) legend.className=`c${color}`;
  tray.querySelectorAll('[data-piece]').forEach(button=>{
    const piece=button.dataset.piece,selected=piece===ui.selected,used=!remaining.includes(piece),orientation=selected?ui.orientation:0;
    button.classList.toggle('selected',selected);button.classList.toggle('used',used);
    if(button.getAttribute('aria-pressed')!==String(selected)) button.setAttribute('aria-pressed',String(selected));
    if(button.disabled!==(!allowed||used)) button.disabled=!allowed||used;
    renderRegion(button,orientation,()=>miniPiece(piece,orientation)+`<span>${piece}</span>`);
  });
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
  return `<header class="site-header ${match?'match-header':''}"><button id="home-button" class="brand" aria-label="${t('home')}"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><strong>${t('title')}</strong><span class="brand-label">DJQ <small>v${APP_VERSION}</small></span></button>
  ${match?`<div class="match-context"><strong>${t(ui.view==='replay'?'replay':ui.mode)}</strong><span>${ui.game.players} ${t('people')} / ${modeLabel(ui.game)} / ${t(ui.game.scoring)}${ui.mode==='online'&&ui.room?` / ${ui.room.code}`:''}</span>${ui.view==='game'&&ui.mode==='online'&&ui.game.status==='playing'?'<span id="countdown" class="countdown" aria-label="回合剩余时间"></span>':''}</div>`:''}
  <nav aria-label="${t('gameNavigation')}"><button id="rules-button" class="text-button" aria-label="${t('rules')}">${icon('help')}<span>${t('rules')}</span></button>${match?`<button id="log-button" class="text-button" aria-label="${t('log')}">${icon('history')}<span>${t('log')}</span></button>`:''}${match?`<button id="leave-room" class="text-button" aria-label="${t('home')}">${icon('home')}<span>${t('home')}</span></button>`:`<a class="github-link" href="https://github.com/duanap/Mosaic" target="_blank" rel="noopener noreferrer">GitHub ${icon('arrow')}</a>`}<button id="theme-toggle" class="icon-button" aria-label="${t('theme')}">${icon(ui.theme==='dark'?'sun':'moon')}</button></nav></header>`;
}
const miniPiece=pieceSVG;
function boardPosition(game) {
  const tiles=game.board.map((c,index)=>c<0?'':`<rect class="tile c${c}" x="${index%20*30+1.5}" y="${Math.floor(index/20)*30+1.5}" width="27" height="27" rx="3.6"/>`).join('');
  const last=game.history.findLast(a=>a.type==='move');
  const highlight=last?transform(last.move.piece,last.move.orientation).map(([x,y])=>`<rect class="last-tile" x="${(x+last.move.x)*30+4}" y="${(y+last.move.y)*30+4}" width="22" height="22" rx="2"/>`).join(''):'';
  const marks=CORNERS.map(([x,y],c)=>game.started[c]?'':`<g class="start-mark c${c}"><circle cx="${x*30+15}" cy="${y*30+15}" r="11"/></g>`).join('');
  return tiles+marks+highlight;
}
function boardSVG(game,interactive=true) {
  const grid=Array.from({length:21},(_,i)=>`M${i*30} 0V600M0 ${i*30}H600`).join('');
  return `<svg ${interactive?`id="board" tabindex="0" role="application" aria-label="20 x 20 ${t('title')}. ${t('shortcut')}"`:'aria-hidden="true"'} class="board-svg" viewBox="0 0 600 600"><rect class="board-base" width="600" height="600"/><path class="grid-lines" d="${grid}"/><g ${interactive?'id="board-position"':''}>${boardPosition(game)}</g>${interactive?'<g id="frontiers"></g><g id="preview" pointer-events="none"></g>':''}</svg>`;
}
const demo=newGame(4);for(let n=0;n<32;n++) applyMove(demo,findMove(demo));
function recoveryView() {
  ui.recoveries=savedSessions();
  if(!ui.recoveries.length) return '';
  return `<section class="recovery-section" aria-labelledby="recovery-title"><h2 id="recovery-title">${t('recoverSeat')}</h2><p>${t('recoverHelp')}</p><div class="recovery-actions">${ui.recoveries.map((s,i)=>`<button class="button secondary" data-recover="${i}"${busy()} ${ui.room?'disabled':''}>${icon('back')}<span>${escape(s.name||t('player'))} / ${s.code}${s.seat===null?'':` / ${t('seat')} ${s.seat+1}`}</span></button>`).join('')}</div></section>`;
}
function homeView() {
  return `<main class="home-shell"><section class="hero"><div class="hero-copy"><h1>${t('hero')}</h1><p class="lead">${t('intro')}</p><div class="quick-rules">${[1,2,3].map(n=>`<span><b>0${n}</b>${t('tip'+n)}</span>`).join('')}</div></div>
  <div class="hero-art"><div class="art-orbit"></div><div class="hero-board-wrap">${boardSVG(demo,false)}</div><div class="art-tag"><span class="tag-block">21</span><span>${t('tiles')} / ${t('perColor')}</span></div></div></section>
  <section class="play-section"><div class="section-heading"><h2>选择玩法</h2></div>
  ${ui.room?`<div class="active-room panel"><div><strong>你已在房间 ${ui.room.code}</strong><p>关闭菜单不会退出房间，可以随时返回等候室。</p></div><button id="return-room" class="button primary">返回房间${icon('arrow')}</button><button id="home-leave-room" data-action="leave-room" class="text-button">退出房间</button></div>`:''}
  <div class="entry-grid">${[
    ['local','同屏玩法','在同一台设备上轮流操作，<br>可与朋友或人机对战。'],
    ['create','创建房间','设置人数与玩法，<br>邀请朋友或添加人机。'],
    ['join','加入房间','输入邀请码，<br>加入朋友的房间。']
  ].map(([mode,title,description])=>`<button id="open-${mode}" data-menu="${mode}" class="entry-card entry-${mode} panel" ${ui.room?'disabled':''}><span class="entry-copy"><strong>${title}</strong><span>${description}</span></span><span class="entry-art" aria-hidden="true"><img src="/assets/lobby-entry-sprites.png" width="1672" height="941" alt="" loading="lazy" decoding="async" draggable="false"></span><span class="entry-arrow" aria-hidden="true">${icon('arrow')}</span></button>`).join('')}</div>
  ${read(LOCAL)?`<button id="resume-local" class="text-button resume" ${ui.room?'disabled':''}>${t('resume')}${icon('back')}</button>`:''}</section>
  ${recoveryView()}<footer class="home-footer"><span>${t('footer')}</span><button id="import-replay" class="text-button" ${ui.room?'disabled':''}>${t('import')}${icon('arrow')}</button></footer></main>`;
}
function connectionLabel() {return `<span id="connection" class="connection ${ui.connected?'connected':''}"><i></i>${t(ui.connected?'connected':'reconnecting')}</span>`;}
function setupMenu(mode) {
  if(mode==='room') return roomMenu();
  const local=mode==='local',join=mode==='join';
  const modes=`<div class="setup-modes" aria-label="选择人数">${[2,3,4].map(n=>`<button type="button" id="mode-${n}" data-count="${n}" class="${ui.count===n?'selected':''}" aria-pressed="${ui.count===n}"><strong>${n}人</strong><span>${t('mode'+n)}</span></button>`).join('')}</div>${modeSettings()}`;
  const name=`<label>${t('name')}<input id="player-name" required maxlength="20" autocomplete="nickname" value="${escape(ui.name)}"></label>`;
  const scoring=`<label class="inline-field">${t('scoring')}<select id="scoring"><option value="bonus" ${ui.scoring==='bonus'?'selected':''}>${t('bonus')} +15 / +20</option><option value="simple" ${ui.scoring==='simple'?'selected':''}>${t('simple')}</option></select></label>`;
  return `<form id="setup-form" class="setup-form" data-mode="${mode}"><p class="setup-intro">${local?'选择人数和席位，添加人机后即可在本机开始。':join?'输入朋友提供的6位数字房间号，加入后在等候室等待开局。':'创建后进入等候室，邀请朋友或添加人机，再由房主开始。'}</p>
  ${join?`${name}<label>${t('code')}<input id="room-code-input" required minlength="6" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="off" spellcheck="false" value="${escape(ui.joinCode)}" placeholder="6位数字房间号"></label>`:`${modes}${local?localSeats():name}${scoring}${local?'':`<label class="inline-field">${t('turnLimit')}<select id="turn-seconds">${[30,60,90,120].map(n=>`<option value="${n}" ${ui.seconds===n?'selected':''}>${n} ${t('seconds')}</option>`).join('')}</select></label>`}`}
  <p id="menu-error" class="menu-error" role="alert"></p><button type="submit" id="${local?'local-start':join?'join-room':'create-room'}" class="button primary wide" ${ui.pending?'disabled':''}>${ui.pending?'请稍候…':local?t('localStart'):join?t('join'):t('create')}${icon('arrow')}</button></form>`;
}
function syncHomeDialog() {
  const dialog=$('#modal'),ours=['setup','room'].includes(dialog.dataset.content);
  if(ui.view!=='home'||!ui.menu) {if(ours) {if(dialog.open) dialog.close();dialog.innerHTML='';delete dialog.dataset.content;}return;}
  const top=dialog.scrollTop;dialog.dataset.content=ui.menu==='room'?'room':'setup';
  dialog.innerHTML=`<div class="modal-heading"><h2 id="modal-title">${({local:'同屏玩法',create:'创建房间',join:'加入房间',room:'房间等候室'})[ui.menu]}</h2><button type="button" id="close-modal" class="icon-button" aria-label="${t('close')}" ${ui.pending?'disabled':''}>${icon('close')}</button></div>${setupMenu(ui.menu)}`;
  if(!dialog.open) dialog.showModal();dialog.scrollTop=top;
}
function actionError(error) {const node=$('#menu-error');if(node) node.textContent=t(error.message);else toast(t(error.message));}
function roomMenu() {
  const r=ui.room,host=r.you===r.host,full=r.players.every(p=>p&&!p.left),online=r.players.every(p=>p&&(p.kind==='bot'||p.connected));
  return `<div class="room-menu"><div class="lobby-intro"><p>${t('lobbyDesc')}</p></div><div class="lobby-grid"><section class="lobby-main panel"><div class="lobby-code"><div><span class="eyebrow">${t('code')}</span><strong id="room-code">${r.code}</strong></div><button id="copy-invite" class="button secondary">${icon('link')}${t('invite')}</button></div><div class="lobby-seats">${r.players.map((p,i)=>`<div class="lobby-seat ${p?'':'empty'}"><div class="seat-avatar c${i}">${i+1}</div><div class="seat-name"><strong>${p?escape(p.name):t('empty')}${r.mode==='teams'?` / ${i%2?'B':'A'}队`:''}</strong><span>${ownedColors(r.capacity,i).map(badge).join('')} ${i===r.host?t('host'):''} ${i===r.you?` / ${t('you')}`:''}</span></div><span class="seat-status">${p?p.kind==='bot'?'标准机器人':t(p.connected?'connected':'offline'):''}</span>${host&&!p?`<button class="button secondary small" data-add-bot="${i}"${busy()}>添加机器人</button>`:''}${host&&p?.kind==='bot'?`<button class="text-button" data-remove-bot="${i}"${busy()}>移除</button>`:''}</div>`).join('')}</div><div class="lobby-buttons">${host?`<button id="online-start" class="button primary" ${!full||!online||!ui.connected||ui.pending?'disabled':''}>${t('start')}${icon('arrow')}</button>`:`<span>${t('waitHost')}</span>`}<p class="fine">${!full?'等待朋友加入，或添加机器人补齐空位':!online?'等待真人玩家重新连接':'玩家已就位，由房主开始'}</p></div></section><aside class="panel lobby-aside"><h2>${r.capacity} ${t('people')} / ${r.mode==='teams'?'双色组队':t('mode'+r.capacity)}</h2><dl><div><dt>棋盘</dt><dd>20 &times; 20</dd></div><div><dt>${t('scoring')}</dt><dd>${t(r.scoring)}</dd></div><div><dt>${t('turnLimit')}</dt><dd>${r.turnSeconds} ${t('seconds')}</dd></div></dl><p>${r.mode==='teams'?'蓝红为A队，黄绿为B队。每人控制自己的颜色，按队伍总分结算。':t(r.capacity===3?'neutralHelp':'ruleFirst')}</p>${connectionLabel()}<button id="leave-room" class="text-button" aria-label="${t('home')}">${icon('home')}退出房间</button></aside></div><p class="room-lifecycle">等候室离线席位保留2分钟；房主退出后自动转交。无人房间会清理，房间内的对局不会永久保存。</p></div>`;
}
function canPlay() {return ui.view==='game'&&ui.game?.status==='playing'&&!ui.pending&&(ui.mode==='local'?ui.game.seats[controller(ui.game)].kind==='human':(ui.connected&&ui.room?.you===controller(ui.game)));}
function canRematch() {return ui.view==='game'&&ui.game?.status==='finished'&&!ui.pending&&(ui.mode==='local'||ui.connected&&ui.room?.you===ui.room?.host);}
function resultAnnounced() {return ui.mode==='online'?announcedOnlineResults.has(`${ui.room.code}:${ui.room.round}`):announcedLocalResults.has(ui.game);}
function playerCards(game) {
  return `<div class="player-cards players-${game.players}">${scores(game).map(s=>{
    const active=game.status==='playing'&&controller(game)===s.player,bot=game.seats[s.player].kind==='bot',color=active?game.turn:s.colors[0];
    const ended=s.colors.every(c=>game.stopped[c]);
    const offline=ui.mode==='online'&&!bot&&!ui.room?.players[s.player]?.connected;
    const state=s.resigned?t('resigned'):game.status==='finished'?(s.winner?t('win'):t('gameEnded')):active?t(bot?'thinking':'currentTurn')+(offline?` · ${t('offline')}`:''):offline?t('offline'):ended?(game.players===3&&!game.stopped[3]?t('neutralRotation'):t('colorEnded')):t('waitingTurn');
    return `<article class="player-card c${color} ${active?'active':''} ${s.resigned?'forfeited':''}" data-player="${s.player}" ${active?'aria-current="true"':''}><div class="player-ident"><span class="player-avatar">${s.player+1}</span><div><strong>${escape(playerName(s.player))}</strong>${game.mode==='teams'||ui.mode==='online'&&ui.room?.you===s.player?`<small class="player-affiliation">${[game.mode==='teams'?`${s.player%2?'B':'A'}${t('team')}`:null,ui.mode==='online'&&ui.room?.you===s.player?t('you'):null].filter(Boolean).join(' · ')}</small>`:''}</div></div><div class="player-score"><strong>${s.score>0?'+':''}${s.score}</strong></div><div class="player-state ${active?'is-current':''}"><span>${state}</span><span class="player-colors">${s.colors.map(c=>`<span>${badge(c)}${t(COLORS[c])}${t('colorSuffix')}</span>`).join('')}</span></div></article>`;
  }).join('')}</div>`;
}
function cornersButton(className='text-button') {return `<button id="show-corners" class="${className}" aria-pressed="${ui.showCorners}">${icon('hint')}${t('corners')}</button>`;}
function auxiliaryControls(game) {
  const replaying=ui.view==='replay';
  return `<div class="auxiliary-actions">${replaying?cornersButton():''}${game.status==='finished'?`<button id="export-replay" class="text-button">${icon('export')}${t('export')}</button>`:''}${!replaying&&game.status==='playing'&&ui.mode==='local'?`<button id="undo" class="text-button" ${!game.history.length?'disabled':''}>${icon('back')}${t('undo')}</button>`:''}${!replaying&&game.status==='playing'?`<button id="resign" class="text-button danger" ${ui.pending||ui.mode==='local'&&!canPlay()||ui.mode==='online'&&(!ui.connected||game.resigned[ui.room.you])?'disabled':''}>${t('resign')}</button>`:''}</div>`;
}
function controlsAndActions(game) {
  const modal=compactGame.matches&&ui.piecesOpen;
  return `<div id="game-controls" class="controls-column" ${modal?'role="dialog" aria-modal="true"':''} aria-label="${t('gameActions')}">${controls(game)}<aside class="auxiliary-panel panel" aria-label="${t('gameActions')}">${auxiliaryControls(game)}${ui.view==='replay'?'':`<div class="commit-section"><span id="hint-status" class="visually-hidden" role="status" aria-live="polite"></span><div class="commit-actions"><button id="confirm-move" class="button primary confirm-button" disabled aria-busy="${ui.pending}">${icon('check')}<span id="preview-status" role="status" aria-live="polite">${t('noSelection')}</span></button></div></div>`}</aside></div>`;
}
function controls(game) {
  const active=game.turn,allowed=canPlay(),remaining=game.remaining[active],replaying=ui.view==='replay';
  const close=`<button id="close-pieces" class="icon-button close-pieces" aria-label="${t('closePieces')}">${icon('close')}</button>`;

  if(replaying) return `<aside id="piece-controls" class="control-panel panel replay-panel"  aria-labelledby="controls-title">${close}<div class="control-scroll"><p class="eyebrow">REPLAY / READ ONLY</p><h2 id="controls-title">${t('replay')}</h2><p class="replay-help">${t('replayHelp')}</p><div class="replay-progress"><strong id="replay-label">${ui.replayStep} / ${ui.replayRecord.actions.length}</strong><input id="replay-range" aria-label="${t('replay')}" type="range" min="0" max="${ui.replayRecord.actions.length}" value="${ui.replayStep}"></div></div><div class="replay-buttons"><button id="replay-prev" class="button secondary" ${ui.replayStep===0?'disabled':''}>${icon('back')}${t('prev')}</button><button id="replay-next" class="button primary" ${ui.replayStep===ui.replayRecord.actions.length?'disabled':''}>${t('next')}${icon('arrow')}</button></div></aside>`;
  return `<aside id="piece-controls" class="control-panel panel"  aria-label="${t('choosePiece')}">${close}<div class="control-scroll"><div class="tray-legend"><span class="c${active}"><i></i>${t('available')}</span><span><i></i>${t('used')}</span></div>
  <div class="piece-tray c${active}" aria-label="${t('choosePiece')}">${PIECES.slice().reverse().map(p=>`<button class="piece ${ui.selected===p.id?'selected':''} ${remaining.includes(p.id)?'':'used'}" data-piece="${p.id}" aria-label="${p.id} / ${p.cells.length} ${t('squares')}" aria-pressed="${ui.selected===p.id}" ${!allowed||!remaining.includes(p.id)?'disabled':''}>${miniPiece(p.id,ui.selected===p.id?ui.orientation:0)}<span>${p.id}</span></button>`).join('')}</div>
  </div></aside><aside class="selection-panel panel"><section class="selection-tools" aria-label="${t('choosePiece')}"><div class="selection-preview"><div id="selected-piece" class="selected-piece">${selectionMarkup(ui.selected,ui.orientation,active)}</div><button id="clear-selection" class="icon-button" aria-label="${t('clear')}" ${!ui.selected?'disabled':''}>${icon('close')}</button></div><div class="transform-tools">${cornersButton('tool-button')}<button id="hint" class="tool-button hint-button" ${!allowed||hintPending?'disabled':''} aria-busy="${hintPending}">${icon('hint')}${t(hintPending?'calculating':'hint')}<kbd>T</kbd><small id="hint-sequence"></small></button></div></section>
  ${ui.view==='game'?`<p id="game-shortcuts" class="keyboard-help">${t('shortcut')}</p>`:''}</aside>`;
}
function moveLog(game) {
  return `<section class="move-log"><h3>${t('log')}</h3>${game.history.length?`<ol>${game.history.slice().reverse().map(a=>`<li>${a.type==='move'?badge(a.color):icon('close')}<span>${escape(playerName(a.player))}<small>${a.type==='move'?`${a.move.piece} / ${String.fromCharCode(65+a.move.x)}${a.move.y+1}${a.source==='bot'?' / 机器人':a.automatic?` / ${t('auto')}`:''}`:t('resigned')}</small></span></li>`).join('')}</ol>`:`<p>${t('emptyLog')}</p>`}</section>`;
}
function resultView(game) {
  const teams=game.mode==='teams',rows=teams?teamScores(game):scores(game),winners=rows.filter(s=>s.winner);
  const name=s=>teams?`${s.team?'B':'A'}${t('team')}（${s.members.map(i=>escape(playerName(i))).join('、')}）`:escape(playerName(s.player));
  return `<section class="result-summary"><div class="result-icon">${icon('trophy')}</div><h3>${winners.map(name).join(' & ')} ${t(winners.length>1?'tie':'win')}</h3><p>${t(game.scoring)}</p><ol class="result-scores">${rows.map(s=>`<li class="${s.winner?'winner':''}"><span>${name(s)}</span><strong>${s.score>0?'+':''}${s.score}</strong></li>`).join('')}</ol>${ui.view==='game'?(ui.mode==='local'||ui.room.you===ui.room.host?`<button id="rematch" class="button primary" ${canRematch()?'':'disabled'}>${t('rematch')}${icon('arrow')}</button>`:`<span>${t('waitHost')}</span>`):''}</section>`;
}
function teamCards(game) {return game.mode==='teams'?`<div class="team-cards">${teamScores(game).map(s=>`<article><strong>${s.team?'B':'A'}队 · ${s.members.map(i=>escape(playerName(i))).join(' + ')}</strong><span>${s.score}分</span></article>`).join('')}</div>`:'';}
function mobileDock(game) {
  if(ui.view==='replay') return `<div class="mobile-dock replay-dock"><button data-action="replay-prev" ${ui.replayStep===0?'disabled':''}>${icon('back')}${t('prev')}</button><button id="dock-pieces" aria-controls="game-controls" aria-expanded="${ui.piecesOpen}">${t('replay')} ${ui.replayStep}/${ui.replayRecord.actions.length}</button><button data-action="replay-next" ${ui.replayStep===ui.replayRecord.actions.length?'disabled':''}>${t('next')}${icon('arrow')}</button></div>`;
  if(game.status!=='playing') return '';
  const allowed=canPlay();
  return `<div class="mobile-dock"><div class="dock-status">${badge(game.turn)}<span>${ui.selected??t('noSelection')}</span><small>${t(game.seats[controller(game)].kind==='bot'?'thinking':allowed?'yourTurn':'otherTurn')}</small></div><div class="dock-actions"><button data-action="rotate" ${!allowed||!ui.selected?'disabled':''}>${icon('rotate')}${t('rotate')}</button><button data-action="flip" ${!allowed||!ui.selected?'disabled':''}>${icon('flip')}${t('flip')}</button><button id="dock-pieces" aria-controls="game-controls" aria-expanded="${ui.piecesOpen}">${icon('users')}${t('pieces')}</button><button data-action="confirm-move" class="dock-confirm" disabled>${icon('check')}${t(ui.pending?'submitting':'confirm')}</button></div></div>`;
}
function playersPanel(game) {
  return `<div class="players-heading"><h2 id="players-heading">${t('playersTitle')}</h2><span>${game.players} ${t('people')}</span></div>${playerCards(game)}${teamCards(game)}
  ${game.players===3?`<div class="neutral-bar">${badge(3)}<strong>${t('neutral')}</strong><span>${t('neutralHelp')}</span><b>${escape(playerName(controller(game,3)))}</b></div>`:''}${ui.mode==='online'?`<div class="table-status">${connectionLabel()}</div>`:''}`;
}
function gameView() {
  const game=ui.game;
  return `<main class="game-shell game-shell-v2 ${ui.view==='game'&&game.status==='finished'?'is-finished':''} ${ui.piecesOpen?'pieces-open':''}"><div class="game-layout"><aside class="players-panel" aria-labelledby="players-heading">${playersPanel(game)}</aside>
  <section class="board-section" aria-label="${t('boardTitle')}">
  <div class="board-frame">${boardSVG(game)}<div id="piece-actions" class="piece-actions c${game.turn}" role="group" aria-label="${t('pieceActions')}" hidden><button id="floating-flip" data-action="flip" aria-label="${t('flip')}" title="${t('flip')}">${icon('flip')}</button><button id="floating-confirm" data-action="confirm-move" aria-label="${t('confirm')}" title="${t('confirm')}" disabled>${icon('check')}</button></div></div><span id="move-number" class="visually-hidden">${game.history.filter(a=>a.type==='move').length}</span></section>${controlsAndActions(game)}</div><button id="pieces-backdrop" class="pieces-backdrop" aria-label="${t('closePieces')}" tabindex="-1"></button>${mobileDock(game)}</main>`;
}
let renderedView=null,renderedHeader='',renderedPosition=null,positionVersion=0;
function syncGameView() {
  const game=ui.game,identity=`${ui.mode}:${ui.room?.code}:${ui.room?.round}`;
  if(!renderedPosition||renderedPosition.identity!==identity||renderedPosition.revision!==game.revision||
    ui.mode==='local'&&renderedPosition.game!==game) {
    positionVersion++;renderedPosition={identity,revision:game.revision,game};
  }
  renderRegion($('#board-position'),positionVersion,()=>boardPosition(game));
  renderRegion($('#move-number'),positionVersion,()=>String(game.history.filter(a=>a.type==='move').length));
  const playersKey=JSON.stringify([positionVersion,ui.names,ui.room?.you,ui.room?.players.map(p=>p?.connected)]);
  renderRegion($('.players-panel'),playersKey,()=>playersPanel(game));
  renderRegion($('.table-status'),ui.connected,connectionLabel);

  const shell=$('.game-shell'),modal=compactGame.matches&&ui.piecesOpen,allowed=canPlay();
  shell.classList.toggle('is-finished',ui.view==='game'&&game.status==='finished');
  shell.classList.toggle('pieces-open',ui.piecesOpen);
  const controls=$('#game-controls');
  if(modal) {controls.setAttribute('role','dialog');controls.setAttribute('aria-modal','true');}
  else {controls.removeAttribute('role');controls.removeAttribute('aria-modal');}
  document.querySelectorAll('.match-header,.players-panel,.board-section,.mobile-dock').forEach(node=>{node.inert=modal;});
  $('#piece-actions').className=`piece-actions c${game.turn}`;
  renderRegion($('.auxiliary-actions'),`${positionVersion}:${ui.pending}:${allowed}:${ui.connected}:${ui.showCorners}`,()=>auxiliaryControls(game));
  $('#show-corners')?.setAttribute('aria-pressed',String(ui.showCorners));
  if(ui.view==='replay') {
    $('#replay-label').textContent=`${ui.replayStep} / ${ui.replayRecord.actions.length}`;
    $('#replay-range').value=ui.replayStep;
    $('#replay-prev').disabled=ui.replayStep===0;$('#replay-next').disabled=ui.replayStep===ui.replayRecord.actions.length;
  } else {
    $('#clear-selection').disabled=!ui.selected;
    const hint=$('#hint');hint.disabled=!allowed||hintPending;hint.setAttribute('aria-busy',String(hintPending));
    renderRegion(hint,hintPending,()=>`${icon('hint')}${t(hintPending?'calculating':'hint')}<kbd>T</kbd><small id="hint-sequence"></small>`);
    $('#confirm-move').setAttribute('aria-busy',String(ui.pending));
  }
  let dock=$('.mobile-dock');
  if(ui.view!=='replay'&&game.status!=='playing') {dock?.remove();dock=null;}
  else if(!dock) {shell.insertAdjacentHTML('beforeend',mobileDock(game));dock=$('.mobile-dock');}
  if(dock) {
    dock.inert=modal;
    const pieces=$('#dock-pieces');pieces.setAttribute('aria-expanded',String(ui.piecesOpen));
    if(ui.view==='replay') {
      pieces.textContent=`${t('replay')} ${ui.replayStep}/${ui.replayRecord.actions.length}`;
      dock.querySelector('[data-action="replay-prev"]').disabled=ui.replayStep===0;
      dock.querySelector('[data-action="replay-next"]').disabled=ui.replayStep===ui.replayRecord.actions.length;
    } else {
      renderRegion($('.dock-status'),`${game.turn}:${ui.selected}:${allowed}:${game.seats[controller(game)].kind}`,()=>`${badge(game.turn)}<span>${ui.selected??t('noSelection')}</span><small>${t(game.seats[controller(game)].kind==='bot'?'thinking':allowed?'yourTurn':'otherTurn')}</small>`);
      dock.querySelectorAll('[data-action="rotate"],[data-action="flip"]').forEach(button=>{button.disabled=!allowed||!ui.selected;});
    }
  }
}
function render() {
  if(drag) return;
  if(ui.view==='game'&&ui.game?.status==='finished'&&!resultAnnounced()) ui.piecesOpen=false;
  const focused=document.activeElement,focusId=focused?.id,focusPiece=focused?.dataset?.piece;
  document.body.dataset.screen=ui.view==='game'||ui.view==='replay'?'game':ui.view;
  const nextHeader=header();
  if(ui.view==='home'||renderedView!==ui.view) {
    $('#app').innerHTML=nextHeader+(ui.view==='home'?homeView():gameView());renderedPosition=null;
  } else if(nextHeader!==renderedHeader) $('.site-header').outerHTML=nextHeader;
  renderedView=ui.view;renderedHeader=nextHeader;
  if(ui.view!=='home') syncGameView();
  if(ui.game&&ui.view!=='home') {updatePreview();drawFrontiers();}
  fitGameBoard(positionPieceActions);
  updateCountdown();
  syncHomeDialog();
  syncLogDialog();
  syncResultDialog();
  const replacement=focusId?document.getElementById(focusId):focusPiece?document.querySelector(`[data-piece="${focusPiece}"]`):null;
  if(!focused?.isConnected&&replacement&&!replacement.disabled&&replacement.getClientRects().length) replacement.focus({preventScroll:true});
  scheduleLocalBot();
}
function updateCountdown() {
  const node=$('#countdown');if(!node||!ui.room?.deadline) return;
  const seconds=Math.max(0,Math.ceil((ui.room.deadline-(Date.now()+ui.clockOffset))/1000));
  node.textContent=`${seconds}s`;node.classList.toggle('urgent',seconds<=15);
}
function currentMove() {return ui.selected&&ui.cursor?{piece:ui.selected,orientation:ui.orientation,x:ui.cursor.x,y:ui.cursor.y}:null;}
function positionPieceActions() {
  const group=$('#piece-actions'),board=$('#board'),move=currentMove();if(!group||!board) return;
  group.hidden=!move||!canPlay()||compactGame.matches&&ui.piecesOpen;
  if(group.hidden) return;
  const frame=board.parentElement.getBoundingClientRect(),rect=board.getBoundingClientRect();
  const position=pieceActionsPosition(move,rect,group.getBoundingClientRect());
  group.style.left=`${position.x-frame.left}px`;group.style.top=`${position.y-frame.top}px`;
  $('#floating-flip').disabled=!canPlay();
}
function updatePreview() {
  const group=$('#preview'),message=$('#preview-status'),confirm=$('#confirm-move');if(!group) return;
  const move=currentMove(),result=move?validateMove(ui.game,move):null;
  renderRegion(group,JSON.stringify([ui.game.turn,move,result?.ok]),()=>{
    const cells=move?transform(move.piece,move.orientation).map(([x,y])=>[x+move.x,y+move.y]):[];
    return cells.map(([x,y])=>`<rect class="ghost c${ui.game.turn} ${result?.ok?'valid':'invalid'}" x="${x*30+1.5}" y="${y*30+1.5}" width="27" height="27" rx="3.6"/>`).join('')+(move?`<path class="preview-outline c${ui.game.turn}" d="${previewOutline(cells)}"/>`:'');
  });
  const feedback=ui.pending?t('submitting'):ui.game.status!=='playing'?t('rematch'):!canPlay()?t(ui.mode==='online'&&!ui.connected?'reconnecting':ui.game.seats[controller(ui.game)].kind==='bot'?'thinking':'otherTurn'):!move?t('noSelection'):result.ok?t('confirm'):`${t(result.code)} (${move.x+1}, ${move.y+1})`;
  if(message&&message.textContent!==feedback) message.textContent=feedback;
  if(confirm) {
    const ended=ui.game.status==='finished';confirm.disabled=ended?!canRematch():!canPlay()||!result?.ok;
    if(ended) confirm.dataset.action='rematch';else delete confirm.dataset.action;
  }
  if(confirm) confirm.dataset.feedback=move&&!result?.ok?'invalid':result?.ok?'ready':'neutral';
  document.querySelectorAll('[data-action="confirm-move"]').forEach(button=>{
    button.disabled=!canPlay()||!result?.ok;
    if(button.id==='floating-confirm') {button.title=feedback;button.setAttribute('aria-label',feedback);}
    else renderRegion(button,feedback,()=>`<span>${escape(feedback)}</span>`);
  });
  const hintStatus=$('#hint-status'),hintSequence=$('#hint-sequence');
  if(hintStatus&&hintStatus.textContent!==hintLabel) hintStatus.textContent=hintLabel;
  const sequence=hintLabel&&hintMoves?.length?`${hintIndex||hintMoves.length}/${hintMoves.length}`:'';
  if(hintSequence&&hintSequence.textContent!==sequence) hintSequence.textContent=sequence;
  syncTray();
  const selected=$('#selected-piece'),key=`${ui.selected}:${ui.orientation}:${ui.game.turn}`;
  if(selected&&selected.dataset.selection!==key) {selected.innerHTML=selectionMarkup(ui.selected,ui.orientation,ui.game.turn);selected.dataset.selection=key;}
  positionPieceActions();
}
function drawFrontiers() {
  const node=$('#frontiers');if(!node) return;
  renderRegion(node,`${positionVersion}:${ui.showCorners}`,()=>{
    if(!ui.showCorners||ui.game.status!=='playing') return '';
    const g=ui.game,c=g.turn,points=[];
    const at=(x,y)=>x<0||x>19||y<0||y>19?-2:g.board[y*20+x];
    if(!g.started[c]) points.push(CORNERS[c]);
    else for(let y=0;y<20;y++) for(let x=0;x<20;x++) {
      if(at(x,y)!==-1||[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>at(x+dx,y+dy)===c)) continue;
      if([[1,1],[1,-1],[-1,1],[-1,-1]].some(([dx,dy])=>at(x+dx,y+dy)===c)) points.push([x,y]);
    }
    return points.map(([x,y])=>`<circle class="frontier c${c}" cx="${x*30+15}" cy="${y*30+15}" r="3.5"/>`).join('');
  });
}
function saveLocal() {if(ui.mode==='local'&&ui.view==='game') {if(!write(LOCAL,exportReplay(ui.game,ui.names))) toast(t('storageError'));}}
function beginLocal(record=null) {
  ui.mode='local';ui.room=null;ui.replayRecord=null;ui.game=record?replay(record):newGame(ui.count,ui.scoring,{mode:selectedMode(),seats:ui.seatKinds.slice(0,ui.count).map(kind=>kind==='bot'?{kind,level:'standard'}:{kind})});
  ui.names=Array.from({length:ui.game.players},(_,i)=>String(record?.names?.[i]??`${ui.game.seats[i].kind==='bot'?'机器人':t('player')} ${i+1}`).slice(0,20));
  ui.menu=null;ui.view='game';resetSelection();saveLocal();render();window.scrollTo(0,0);
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
    const enteredRoom=ui.room?.code!==state.code||ui.room?.phase!=='waiting'||ui.view!=='home';
    ui.mode='online';ui.room=state;ui.game=state.game;ui.names=state.players.map((p,i)=>p?.name??`${t('player')} ${i+1}`);
    ui.clockOffset=state.now-Date.now();ui.view=state.phase==='waiting'?'home':'game';
    if(state.phase!=='waiting') ui.menu=null;else if(enteredRoom) ui.menu='room';render();
  },
  onConnection(connected) {if(ui.connected===connected) return;ui.connected=connected;if(ui.mode==='online'&&ui.view!=='home') render();},
  onLost(code) {ui.mode='local';ui.room=null;ui.game=null;ui.view='home';ui.menu=null;resetSelection();render();toast(t(code));}
});
async function commitMove() {
  const move=currentMove();if(!canPlay()||!move||!validateMove(ui.game,move).ok) return;
  ui.piecesOpen=false;
  if(ui.mode==='local') {applyMove(ui.game,move);resetSelection();saveLocal();render();}
  else {ui.pending=true;render();try{await network.command({type:'move',round:ui.room.round,revision:ui.game.revision,move});}finally{ui.pending=false;render();}}
}
function showRules() {
  const dialog=$('#modal');dialog.dataset.content='rules';dialog.innerHTML=`<div class="modal-heading"><div><p class="eyebrow">HOW TO PLAY</p><h2 id="modal-title">${t('rules')}</h2></div><button id="close-modal" class="icon-button" aria-label="${t('close')}">${icon('close')}</button></div><div class="rules-content">${['ruleFirst','ruleConnect','ruleModes','ruleEnd','ruleScore','ruleTimer'].map((key,i)=>`<section><b>0${i+1}</b><p>${t(key)}</p></section>`).join('')}<p class="fine">${t('shortcut')}</p></div>`;dialog.showModal();
}
function showLog() {
  if(!ui.game) return;
  const dialog=$('#modal');dialog.dataset.content='log';
  dialog.innerHTML=`<div class="modal-heading"><h2 id="modal-title">${t('log')}</h2><button id="close-modal" class="icon-button" aria-label="${t('close')}">${icon('close')}</button></div><div id="modal-log">${moveLog(ui.game)}</div>`;
  dialog.showModal();
}
function syncLogDialog() {
  const dialog=$('#modal');if(!dialog.open||dialog.dataset.content!=='log') return;
  if(!ui.game||!['game','replay'].includes(ui.view)) {dialog.close();return;}
  const log=$('#modal-log'),key=`${ui.room?.code}:${ui.room?.round}:${ui.view}:${ui.game.revision}`;
  if(log&&log.dataset.revision!==key) {const top=dialog.scrollTop;log.innerHTML=moveLog(ui.game);log.dataset.revision=key;dialog.scrollTop=top;}
}
function showResultDialog() {
  if(!ui.game||ui.game.status!=='finished') return;
  const dialog=$('#modal');dialog.dataset.content='result';
  dialog.innerHTML=`<div class="modal-heading"><h2 id="modal-title">${t('resultTitle')}</h2><button id="close-modal" class="icon-button" aria-label="${t('viewBoard')}">${icon('close')}</button></div><div id="result-content">${resultView(ui.game)}</div>`;
  if(!dialog.open) dialog.showModal();
  dialog.scrollTop=0;$('#close-modal').focus({preventScroll:true});
}
function syncResultDialog() {
  const dialog=$('#modal');
  if(ui.view!=='game'||ui.game?.status!=='finished') {
    if(dialog.dataset.content==='result') {if(dialog.open) dialog.close();dialog.innerHTML='';delete dialog.dataset.content;}
    return;
  }
  if(dialog.open&&dialog.dataset.content==='result') {const button=$('#rematch');if(button) button.disabled=!canRematch();}
  if(ui.mode==='online') {
    const key=`${ui.room.code}:${ui.room.round}`;
    if(announcedOnlineResults.has(key)) return;announcedOnlineResults.add(key);
  } else {
    if(announcedLocalResults.has(ui.game)) return;announcedLocalResults.add(ui.game);
  }
  showResultDialog();
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
  saveLocal();ui.menu=null;ui.view='home';ui.mode='local';ui.room=null;ui.game=null;ui.replayRecord=null;resetSelection();render();window.scrollTo(0,0);
}
async function resumeOnline(session,automatic=false) {
  ui.pending=true;ui.mode='online';render();
  try {await network.attach(session,{automatic});}
  catch(error) {
    network.stop(false);ui.mode='local';ui.room=null;ui.game=null;ui.view='home';resetSelection();throw error;
  } finally {ui.pending=false;render();}
}
function transformSelection(action) {
  if(!canPlay()||!ui.selected) return;
  manualPreview();setPreview(action==='rotate'?rotatePreview(currentMove()):flipPreview(currentMove()));
  render();$('#board').focus({preventScroll:true});
}
async function handleButton(button) {
  const id=button.dataset.action??button.id;
  if(ui.pending) return;
  if(button.dataset.menu) {if(ui.room) return;captureOptions();ui.menu=button.dataset.menu;render();return;}
  if(id==='return-room') {ui.menu='room';render();return;}
  if(button.dataset.recover!==undefined) {
    const session=ui.recoveries[Number(button.dataset.recover)];
    if(session&&!ui.pending&&!ui.room) {captureOptions();await resumeOnline({code:session.code,token:session.token});}
    return;
  }
  if(button.dataset.count) {captureOptions();ui.count=Number(button.dataset.count);render();return;}
  if(button.dataset.addBot!==undefined||button.dataset.removeBot!==undefined) {
    const adding=button.dataset.addBot!==undefined;ui.pending=true;render();
    try {await network.command({type:adding?'set-bot':'remove-bot',seat:Number(adding?button.dataset.addBot:button.dataset.removeBot),...(adding?{level:'standard'}:{})});} finally {ui.pending=false;render();}return;
  }
  if(button.dataset.piece) {
    if(!canPlay()) return;manualPreview();setPreview(initialPreview(ui.game,button.dataset.piece,currentMove()));ui.piecesOpen=false;render();
    $('#board').focus({preventScroll:true});
    return;
  }
  if(id==='theme-toggle') {captureOptions();ui.theme=ui.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=ui.theme;write('djq-theme',ui.theme);render();}
  else if(id==='rules-button') showRules();
  else if(id==='log-button') showLog();
  else if(id==='home-button'||id==='leave-room') {captureOptions();await goHome();}
  else if(id==='local-start') {captureOptions();beginLocal();}
  else if(id==='resume-local') {try{beginLocal(read(LOCAL));}catch{write(LOCAL,null);throw Error('INVALID_REPLAY');}}
  else if(id==='create-room'||id==='join-room') {
    captureOptions();write('djq-name',ui.name);ui.pending=true;ui.mode='online';render();
    try {if(id==='create-room') await network.create({name:ui.name,players:ui.count,mode:selectedMode(),scoring:ui.scoring,turnSeconds:ui.seconds});
      else await network.join(ui.joinCode.trim(),ui.name);
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
    transformSelection(id);
  }
  else if(id==='hint') {
    if(!canPlay()||hintPending) return;
    if(!hintMoves) {
      hintPending=true;const generation=analysisGeneration;
      render();
      const result=await analysis.analyze({context:generation,kind:'hints',game:ui.game});
      if(generation!==analysisGeneration) return;
      hintPending=false;if(!result) {render();toast(t('analysisFailed'));return;}hintMoves=result.moves;
    }
    if(!hintMoves.length) {render();toast(t('noHint'));return;}
    const move=hintMoves[hintIndex];hintLabel=hintMoves.length===1?'仅此1个可行方案':`方案 ${hintIndex+1}/${hintMoves.length}`;
    hintIndex=(hintIndex+1)%hintMoves.length;setPreview(move);if(compactGame.matches) ui.piecesOpen=false;render();
    $('#board').focus({preventScroll:true});
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
    if(!canRematch()) return;$('#modal').close();
    if(ui.mode==='local') {ui.count=ui.game.players;ui.variant=ui.game.mode==='teams'?'teams':'classic';ui.seatKinds=ui.game.seats.map(s=>s.kind);ui.scoring=ui.game.scoring;beginLocal();}
    else {ui.pending=true;render();try{await network.command({type:'rematch'});}finally{ui.pending=false;render();}}
  }
  else if(id==='export-replay') exportFile();
  else if(id==='import-replay') $('#import-file').click();
  else if(id==='replay-prev'||id==='replay-next') setReplayStep(ui.replayStep+(id==='replay-next'?1:-1));
}
let suppressClickUntil=0,drag=null,controlTouch=null;
const touchClicks=new Map();
const touchActionKey=button=>button?.id||button?.dataset.action||`piece:${button?.dataset.piece}`;
$('#app').addEventListener('click',event=>{
  if(Date.now()<suppressClickUntil&&event.target.closest('#board,[data-piece]')) return;
  const button=event.target.closest('button');
  if(event.isTrusted&&event.detail>0&&touchClicks.get(touchActionKey(button))>Date.now()) return;
  if(button&&!button.disabled) handleButton(button).catch(error=>toast(t(error.message)));
});
$('#modal').addEventListener('click',event=>{
  if(event.target.closest('#close-modal')||event.target===$('#modal')) {if(!ui.pending){captureOptions();ui.menu=null;$('#modal').close();}}
  else {const button=event.target.closest('button');if(button&&!button.disabled&&!(button.type==='submit'&&button.closest('form'))) handleButton(button).catch(actionError);}
});
$('#modal').addEventListener('cancel',event=>{if(ui.pending) event.preventDefault();else {captureOptions();ui.menu=null;}});
$('#modal').addEventListener('close',()=>{if(!$('#modal').open&&['setup','room'].includes($('#modal').dataset.content)) {captureOptions();ui.menu=null;}});
$('#modal').addEventListener('submit',event=>{
  if(event.target.id!=='setup-form') return;event.preventDefault();
  const button=event.target.querySelector('button[type="submit"]');if(button&&!button.disabled) handleButton(button).catch(actionError);
});
for(const root of [$('#app'),$('#modal')]) {
  root.addEventListener('change',event=>{
    if(event.target.id==='replay-range') setReplayStep(Number(event.target.value));else {captureOptions();if(event.target.id==='game-mode') render();}
  });
  root.addEventListener('input',event=>{
    if(event.target.id==='room-code-input') event.target.value=event.target.value.replace(/[^0-9]/g,'').slice(0,6);
    if(event.target.id==='replay-range') $('#replay-label').textContent=`${event.target.value} / ${ui.replayRecord.actions.length}`;
  });
}
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
// Activate stationary touch controls once, without relying on a compatibility click
// after an SVG drag. Scroll gestures and pointer cancellation never activate a button.
$('#app').addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch') return;
  if(!event.isPrimary) {controlTouch=null;return;}
  if(ui.view!=='game'||$('#modal').open) return;
  const button=event.target.closest('.controls-column button,.mobile-dock button,.piece-actions button');
  if(button&&!button.disabled) controlTouch={button,id:event.pointerId,x:event.clientX,y:event.clientY};
});
document.addEventListener('pointermove',event=>{
  if(controlTouch?.id===event.pointerId&&Math.hypot(event.clientX-controlTouch.x,event.clientY-controlTouch.y)>8) controlTouch=null;
});
document.addEventListener('pointerup',event=>{
  if(controlTouch?.id!==event.pointerId) return;
  const {button,x,y}=controlTouch;controlTouch=null;
  if(!button.isConnected||button.disabled||Math.hypot(event.clientX-x,event.clientY-y)>8) return;
  touchClicks.set(touchActionKey(button),Date.now()+700);button.click();
});
document.addEventListener('pointercancel',()=>{controlTouch=null;});
window.addEventListener('blur',()=>{controlTouch=null;});
document.addEventListener('pointerup',event=>finishGesture(event));
document.addEventListener('pointercancel',event=>finishGesture(event,true));
document.addEventListener('lostpointercapture',event=>finishGesture(event,true));
window.addEventListener('blur',()=>finishGesture(null,true));
document.addEventListener('keydown',event=>{
  if($('#modal').open) return;
  if(compactGame.matches&&ui.piecesOpen) {
    if(event.key==='Escape') {event.preventDefault();ui.piecesOpen=false;render();$('#dock-pieces')?.focus({preventScroll:true});return;}
    if(event.key==='Tab') {
      const nodes=[...$('#game-controls').querySelectorAll('button:not(:disabled),input:not(:disabled),summary')].filter(n=>n.getClientRects().length);
      const first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&document.activeElement===first) {event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last) {event.preventDefault();first?.focus();}
    }
  }
  if(event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,select,textarea,[contenteditable="true"]')) return;
  if(!canPlay()) return;
  if(drag) {if(event.key==='Escape') finishGesture(null,true);return;}
  if(event.key==='Enter'&&event.repeat) {event.preventDefault();return;}
  if(event.key==='Enter'&&event.target.closest('button,a')) return;
  const key=event.key.toLowerCase();
  if(['r','f','t','enter','escape','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) event.preventDefault();
  if(key==='r'||key==='f') transformSelection(key==='r'?'rotate':'flip');
  else if(key==='t') {const button=$('#hint');if(button&&!button.disabled) handleButton(button);}
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
  if(ui.room) {toast('请先退出当前房间再导入棋谱');return;}
  try {if(file.size>524288) throw Error();const input=JSON.parse(await file.text()),validated=replay(input);
    ui.replayRecord=exportReplay(validated,Array.isArray(input.names)?input.names:[]);ui.names=ui.replayRecord.names;
    ui.mode='local';ui.room=null;ui.view='replay';setReplayStep(0);window.scrollTo(0,0);
  } catch {toast(t('INVALID_REPLAY'));}
});
window.addEventListener('pagehide',()=>{network.stop(false);analysis.cancel();botAnalysis.cancel();botGeneration++;botKey=null;});
window.addEventListener('pageshow',event=>{const session=event.persisted?savedSession():null;if(session) resumeOnline(session,true).catch(error=>toast(t(error.message)));
else if(ui.joinCode) {ui.menu='join';render();}else if(event.persisted) scheduleLocalBot();});
setInterval(updateCountdown,1000);
render();
const session=savedSession();
if(session) resumeOnline(session,true).catch(error=>toast(t(error.message)));
else if(ui.joinCode) {ui.menu='join';render();}
