import { Chess } from 'chess.js';
import { explainNotMate } from './explanations.js';
import { sameMove, explainFailedMateTwo } from './mate-two.js';
const $ = id => document.getElementById(id);
const icons = {
 sound:'<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
 mute:'<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6m0-6-5 6"/>',
 flip:'<path d="M4 8h15l-4-4M20 16H5l4 4"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
 hand:'<path d="M9 12V4a1.5 1.5 0 0 1 3 0v6m0-3a1.5 1.5 0 0 1 3 0v4m0-2a1.5 1.5 0 0 1 3 0v4m0-2a1.5 1.5 0 0 1 3 0v5c0 4-3 6-6 6-3 0-5-2-7-5l-3-4a1.5 1.5 0 0 1 2-2l2 1"/>',
 hint:'<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2z"/>',
 shuffle:'<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 4-3 5-5m3-4c1-2 3-3 4-3h3m-4-4 4 4-4 4"/>'
};
const svg = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg>`;
function read(key,fallback) {try {return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function save(key,val) {try{localStorage.setItem(key,JSON.stringify(val));}catch{}}
let stats=read('m1-stats',{solved:0,streak:0,best:null});
let seen=new Set(read('m1-seen',[]));
let settings=read('m1-settings',{elo:1400,side:'random',motion:true,sound:true});
settings.elo=Math.max(600,Math.min(2600,Number(settings.elo)||1400));
if(!['random','w','b'].includes(settings.side)) settings.side='random';
settings.mateIn=settings.mateIn===2?2:1;
let puzzle=null,game=null,orientation='w',selected=null,drag=null,finished=false,assisted=false,mistakes=0,started=0,elapsed=0,loading=false,number=0,hinted=false,lastMove=null,worker=null,engine=null,engineReady=null,verifyWait=null,lastPointer=0;
let audio, settling=false, victory=false, victoryOpeningUntil=0, remaining=1, opponentThinking=false, finalSolutions=[];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
$('flip').innerHTML=svg('flip');$('copy').innerHTML=svg('copy');$('hint').innerHTML=svg('hint')+'Get a hint';$('generateIcon').innerHTML=svg('shuffle');$('dragTip').innerHTML=svg('hand')+'Pick up a piece · drag · release to drop';
function updateStats(){ $('solvedCount').textContent=stats.solved;$('streakCount').textContent=stats.streak;$('bestTime').textContent=stats.best===null?'—':`${stats.best}s`;save('m1-stats',stats); }
function updateSettings(){
  const elo=settings.elo;$('elo').value=elo;$('eloValue').textContent=elo;
  $('mateLength').value=settings.mateIn;$('mateLength').setAttribute('aria-valuetext',settings.mateIn===2?'Mate in two':'Mate in one');
  $('modeOne').classList.toggle('active',settings.mateIn===1);$('modeTwo').classList.toggle('active',settings.mateIn===2);
  $('mateLengthNote').textContent=settings.mateIn===2?'Your move. Their reply. Your checkmate.':'Find checkmate in one move.';
  document.querySelector('h1').innerHTML=settings.mateIn===2?'Two moves.<br> <em>One plan.</em>':'One move.<br> <em>All it takes.</em>';
  document.querySelector('.how-it-works p').innerHTML=settings.mateIn===2?'<strong>Think one reply ahead.</strong> Make your first move, watch the opponent defend, then deliver checkmate.':'<strong>Just one move.</strong> No opponent, no clock to beat. Take your time and find the checkmate.';
  $('elo').style.background=`linear-gradient(to right,#829962 ${(elo-600)/20}%,#e6e9df ${(elo-600)/20}%)`;
  $('levelBadge').textContent=elo<1000?'Beginner':elo<1500?'Intermediate':elo<2000?'Advanced':'Expert';
  $('difficultyNote').textContent=elo<1000?'A clear mating pattern. A satisfying first step.':elo<1500?'More possibilities. One perfect finish.':elo<2000?'A busier board. Look beyond the obvious.':'Competing checks and hidden mating nets.';
  document.querySelectorAll('[data-side]').forEach(b=>{b.classList.toggle('active',b.dataset.side===settings.side);b.setAttribute('aria-pressed',b.dataset.side===settings.side);});
  $('motion').classList.toggle('on',settings.motion);$('motion').setAttribute('aria-checked',settings.motion);
  $('sound').innerHTML=svg(settings.sound?'sound':'mute');$('sound').setAttribute('aria-pressed',settings.sound);
  save('m1-settings',settings);
}
$('elo').oninput=e=>{settings.elo=+e.target.value;updateSettings();};
$('mateLength').oninput=e=>{settings.mateIn=+e.target.value;updateSettings();};
document.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>{settings.side=b.dataset.side;updateSettings();});
$('motion').onclick=()=>{settings.motion=!settings.motion;updateSettings();};
$('sound').onclick=()=>{settings.sound=!settings.sound;updateSettings();};
function feedback(title,text,type=''){ $('feedbackTitle').textContent=title;$('feedbackText').textContent=text;$('feedback').className=`feedback ${type}`;document.querySelector('.feedback-icon').textContent=type==='success'?'✓':type==='error'?'↺':'↗'; }
function clock(){if(started&&!finished&&!loading){elapsed=Math.floor((performance.now()-started)/1000);}$('timer').textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;}
setInterval(clock,250);
function lock(locked){loading=locked;for(const id of ['generate','hint','reveal','flip','copy']) $(id).disabled=locked;$('generateText').textContent=locked?'Finding your puzzle…':'Generate puzzle';$('boardOverlay').classList.toggle('hidden',!locked);}
function initEngine(){
  engine?.terminate();engine=new Worker('/engine/stockfish-19-lite-single.js');
  $('engineStatus').textContent='Loading engine';$('engineDot').className='';
  engineReady=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Engine loading timed out. Please try again.')),20000);
    engine.onerror=()=>{clearTimeout(timeout);reject(new Error('Stockfish could not load. Run the app using its local web server.'));verifyWait?.reject(new Error('Engine stopped. Please generate again.'));};
    engine.onmessage=({data})=>{
      for(const line of String(data).split('\n')){
        if(line==='uciok'){engine.postMessage('setoption name Hash value 16');engine.postMessage('isready');}
        if(line==='readyok'){clearTimeout(timeout);$('engineDot').className='ready';$('engineStatus').textContent='Stockfish 19 Lite';resolve();}
        if(verifyWait){
          const mateScore=line.match(/score (mate|cp) (-?\d+)/);if(mateScore)verifyWait.mate=mateScore[1]==='mate'&&+mateScore[2]===verifyWait.expected;
          if(line.startsWith('bestmove ')){const task=verifyWait;verifyWait=null;clearTimeout(task.timeout);task.resolve(task.mate&&line.split(' ')[1]===task.move);}
        }
      }
    };
    engine.postMessage('uci');
  });return engineReady;
}
function verify(p){return new Promise((resolve,reject)=>{
  const move=p.solution.from+p.solution.to+(p.solution.promotion||'');
  verifyWait={resolve,reject,move,expected:p.mateIn||1,mate:false,timeout:setTimeout(()=>{verifyWait=null;reject(new Error('Engine verification timed out. Please try again.'));},15000)};
  engine.postMessage('ucinewgame');engine.postMessage(`position fen ${p.fen}`);engine.postMessage(`go depth ${p.mateIn===2?6:3} searchmoves ${move}`);
});}
function findPuzzle(side){return new Promise((resolve,reject)=>{
  worker?.terminate();worker=new Worker(new URL('./generator-worker.js',import.meta.url),{type:'module'});
  const timeout=setTimeout(()=>{worker.terminate();reject(new Error('This search took too long. Generate again to start a fresh search.'));},45000);
  worker.onerror=()=>{clearTimeout(timeout);reject(new Error('Puzzle generator could not start. Please reload the app.'));};
  worker.onmessage=({data})=>{if(data.error){clearTimeout(timeout);worker.terminate();reject(new Error(data.error));}else if(data.puzzle){clearTimeout(timeout);worker.terminate();resolve(data.puzzle);}else $('loadingDetail').textContent=`Testing mating nets · ${data.attempts.toLocaleString()} positions`;};
  worker.postMessage({elo:settings.elo,side,mateIn:settings.mateIn,seen:[...seen]});
});}
async function generate(){
  if(loading||settling||opponentThinking)return;cancelDrag();lock(true);selected=null;hinted=false;
  $('loadingLabel').textContent='Finding the perfect finish…';$('loadingDetail').textContent='Generating a unique mating net';
  try{
    if(!engineReady) initEngine();await engineReady;
    const side=settings.side==='random'?(Math.random()<.5?'w':'b'):settings.side;
    let p;for(let i=0;i<5;i++){p=await findPuzzle(side);$('loadingLabel').textContent='Checking with Stockfish…';if(await verify(p))break;p=null;}
    if(!p)throw new Error('Engine rejected this position. Please generate again.');
    puzzle=p;game=new Chess(p.fen);orientation=side;finished=false;victory=false;victoryOpeningUntil=0;assisted=false;mistakes=0;lastMove=null;elapsed=0;started=performance.now();number++;
    remaining=p.mateIn||1;opponentThinking=false;finalSolutions=[];
    seen.add(p.fen);save('m1-seen',[...seen]);
    $('turnLabel').textContent=`${side==='w'?'White':'Black'} to move · mate in ${remaining}`;$('turnDot').classList.toggle('black',side==='b');$('puzzleNumber').textContent=`M${remaining} / ${String(number).padStart(3,'0')} · ${p.elo}`;
    feedback(remaining===2?'Find the forcing first move.':'Look for the final move.',remaining===2?'Force checkmate after any opponent reply.':'Only one move delivers checkmate.');render();lock(false);clock();
  }catch(error){
    worker?.terminate();engine?.terminate();engineReady=null;verifyWait=null;lock(false);
    $('engineStatus').textContent='Retry available';$('engineDot').className='error';
    feedback('Let’s try that again.',error.message,'error');
    if(!game){$('boardOverlay').classList.remove('hidden');$('loadingLabel').textContent='Unable to prepare a puzzle';$('loadingDetail').textContent='Use Generate puzzle to retry';document.querySelector('.spinner').style.display='none';}
  }
}
$('generate').onclick=()=>{document.querySelector('.spinner').style.display='';generate();};
function squares(){const f=orientation==='w'?'abcdefgh':'hgfedcba',r=orientation==='w'?'87654321':'12345678';return [...r].flatMap(rank=>[...f].map(file=>file+rank));}
function currentSolution(){return remaining===2?puzzle?.solution:finalSolutions[0]||puzzle?.solution;}
function brokenKingIcon(square){
  const id=`cracked-king-${square}`;
  const outline='<g fill="currentColor"><path d="M15 2h6v5h5v5h-5v4c3-4 10-3 11 2 1 4-3 7-6 9l-1 4H11l-1-4c-3-2-7-5-6-9 1-5 8-6 11-2v-4h-5V7h5Z"/><path d="M9 32h18l2 5H7Z"/></g>';
  return `<svg class="broken-king" viewBox="0 0 36 40" aria-hidden="true"><defs><clipPath id="${id}-left"><path d="M0 0H18V12L15 18 21 23 16 28 20 33 17 40H0Z"/></clipPath><clipPath id="${id}-right"><path d="M18 0H36V40H17L20 33 16 28 21 23 15 18 18 12Z"/></clipPath></defs><g class="king-half-left"><g clip-path="url(#${id}-left)">${outline}</g></g><g class="king-half-right"><g clip-path="url(#${id}-right)">${outline}</g></g></svg>`;
}
function kingBadge(piece,square){
  if(!victory||piece?.type!=='k')return '';
  const winner=piece.color!==game.turn();
  const crown='<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="m3 7 4 4 5-7 5 7 4-4-2 11H5L3 7Z"/><path d="M5 21h14"/></svg>';
  const now=performance.now(),column=orientation==='w'?'abcdefgh'.indexOf(square[0]):'hgfedcba'.indexOf(square[0]);
  const elapsed=Math.max(0,now-(victoryOpeningUntil-2200));
  return `<span class="king-result ${winner?'winner':'loser'} ${column<2?'pill-right':''} ${now<victoryOpeningUntil?'opening':''}" style="--badge-elapsed:-${elapsed}ms" role="img" aria-label="${winner?'Correct — winning king':'Checkmate — king cracked in half'}"><span class="badge-shape"><span class="badge-label">${winner?'Correct':'Checkmate'}</span><span class="badge-icon">${winner?crown:brokenKingIcon(square)}</span></span></span>`;
}
function render(){
  const legal=selected&&game?game.moves({square:selected,verbose:true}).map(m=>m.to):[];
  const checked=game?.isCheck(),checkmated=checked&&game.isCheckmate();
  $('board').innerHTML=squares().map((sq,i)=>{
    const p=game?.get(sq),dark=('abcdefgh'.indexOf(sq[0])+(+sq[1]))%2===1;
    const kingInCheck=checked&&p?.type==='k'&&p.color===game.turn();
    const cls=['square',dark?'dark':'light',p?'occupied':'',p?.color===game?.turn()&&!finished&&!opponentThinking?'draggable':'',selected===sq?'selected':'',legal.includes(sq)?'legal':'',hinted&&sq===currentSolution()?.from?'hinted':'',lastMove?.includes(sq)?'last':'',kingInCheck?'in-check':'',kingInCheck&&checkmated?'checkmated':''].filter(Boolean).join(' ');
    const names={k:'king',q:'queen',r:'rook',b:'bishop',n:'knight',p:'pawn'};
    return `<button class="${cls}" data-square="${sq}" role="gridcell" aria-label="${sq}${p?`, ${p.color==='w'?'white':'black'} ${names[p.type]}`:', empty'}${kingInCheck?checkmated?', checkmated':', in check':''}" aria-selected="${selected===sq}">${i%8===0?`<span class="coordinate rank">${sq[1]}</span>`:''}${i>=56?`<span class="coordinate file">${sq[0]}</span>`:''}${p?`<img class="piece" draggable="false" alt="" src="/pieces/${p.color}${p.type.toUpperCase()}.svg">`:''}${kingBadge(p,sq)}</button>`;
  }).join('');
}
function squareAt(x,y){const rect=$('board').getBoundingClientRect();const col=Math.floor((x-rect.left)/rect.width*8),row=Math.floor((y-rect.top)/rect.height*8);if(col<0||col>7||row<0||row>7)return null;return squares()[row*8+col];}
function select(sq){if(loading||settling||opponentThinking||finished||!game)return;if(selected&&selected!==sq){const from=selected;selected=null;tryMove(from,sq);return;}if(game.get(sq)?.color===game.turn()){selected=selected===sq?null:sq;render();}else{selected=null;render();}}
$('board').onclick=e=>{if(performance.now()-lastPointer<350)return;const sq=e.target.closest('[data-square]')?.dataset.square;if(sq)select(sq);};
$('board').onpointerdown=e=>{
  if(loading||settling||opponentThinking||finished||!game||e.button!==0||drag)return;
  const sq=e.target.closest('[data-square]')?.dataset.square;if(!sq)return;
  e.preventDefault();lastPointer=performance.now();
  const p=game.get(sq);if(p?.color!==game.turn())return;
  const size=$('board').getBoundingClientRect().width/8;
  drag={from:sq,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,px:e.clientX,py:e.clientY,vx:0,vy:0,angle:0,angularV:0,size,ghost:null,moved:false,previousSelected:selected};
  $('board').setPointerCapture(e.pointerId);
  // Keep the captured DOM intact for the entire gesture.
  selected=null;
  document.querySelectorAll('.selected,.legal').forEach(el=>el.classList.remove('selected','legal'));
  document.querySelector(`[data-square="${sq}"]`).classList.add('drag-origin');
  for(const m of game.moves({square:sq,verbose:true}))document.querySelector(`[data-square="${m.to}"]`)?.classList.add('legal');
  drag.ghost=document.createElement('img');drag.ghost.className='drag-ghost';drag.ghost.src=`/pieces/${p.color}${p.type.toUpperCase()}.svg`;drag.ghost.draggable=false;drag.ghost.style.width=size+'px';drag.ghost.style.height=size+'px';document.body.append(drag.ghost);
  drag.ghost.style.transform=`translate(${e.clientX-size*.5}px,${e.clientY-size*.35}px) rotate(0deg) scale(1.08)`;
  $('board').classList.add('dragging');
  requestAnimationFrame(animateDrag);
};
$('board').onpointermove=e=>{
  if(!drag||e.pointerId!==drag.pointer)return;
  drag.x=e.clientX;drag.y=e.clientY;
  if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>3)drag.moved=true;
  if(drag.moved){const target=squareAt(e.clientX,e.clientY);document.querySelectorAll('.target').forEach(el=>el.classList.remove('target'));if(target)document.querySelector(`[data-square="${target}"]`)?.classList.add('target');}
};
function animateDrag(){if(!drag?.ghost)return;
  const physics=settings.motion&&!reduced.matches;
  if(physics){
    const dx=drag.x-drag.px,dy=drag.y-drag.py;drag.vx=(drag.vx+dx*.48)*.53;drag.vy=(drag.vy+dy*.48)*.53;drag.px+=drag.vx;drag.py+=drag.vy;
    const target=Math.max(-38,Math.min(38,-drag.vx*3.2));drag.angularV+=(target-drag.angle)*.085;drag.angularV*=.86;drag.angle+=drag.angularV;
  }else{drag.px=drag.x;drag.py=drag.y;drag.angle=0;}
  drag.ghost.style.transform=`translate(${drag.px-drag.size*.5}px,${drag.py-drag.size*.35}px) rotate(${drag.angle}deg) scale(1.08)`;drag.raf=requestAnimationFrame(animateDrag);
}
function cancelDrag(){if(drag){cancelAnimationFrame(drag.raf);drag.ghost?.remove();if($('board').hasPointerCapture(drag.pointer))$('board').releasePointerCapture(drag.pointer);drag=null;}$('board').classList.remove('dragging');document.querySelectorAll('.target,.drag-origin,.legal').forEach(el=>el.classList.remove('target','drag-origin','legal'));}
async function land(ghost,sq,size,bounce=true){
  const r=document.querySelector(`[data-square="${sq}"]`).getBoundingClientRect();
  const x=r.x+(r.width-size)/2,y=r.y+(r.height-size)/2;
  const end=`translate(${x}px,${y}px) rotate(0deg) scale(.88)`;
  const motion=settings.motion&&!reduced.matches;
  const animation=ghost.animate([
    {transform:ghost.style.transform,filter:'drop-shadow(0 16px 8px #0004)'},
    {transform:`translate(${x}px,${y+size*.025}px) rotate(0deg) scale(${bounce?'.96,.80':'.88'})`,offset:.72,filter:'drop-shadow(0 2px 1px #0002)'},
    {transform:end,filter:'drop-shadow(0 2px 1px #0002)'}
  ],{duration:motion?260:90,easing:'cubic-bezier(.2,.7,.25,1)',fill:'forwards'});
  await animation.finished;ghost.style.transform=end;animation.cancel();
}
$('board').onpointerup=async e=>{
  if(!drag||drag.pointer!==e.pointerId)return;lastPointer=performance.now();
  const {from,ghost,size,raf,pointer}=drag,to=squareAt(e.clientX,e.clientY);
  cancelAnimationFrame(raf);drag=null;if($('board').hasPointerCapture(pointer))$('board').releasePointerCapture(pointer);
  $('board').classList.remove('dragging');settling=true;
  try{
    await land(ghost,to||from,size);
    if(to&&to!==from){
      const accepted=await tryMove(from,to);
      if(!accepted){document.querySelector(`[data-square="${from}"]`)?.classList.add('drag-origin');await land(ghost,from,size,false);}
      else document.querySelector(`[data-square="${to}"]`)?.classList.add('drag-origin');
    }
  }finally{ghost.remove();settling=false;selected=null;render();}
};
$('board').onpointercancel=()=>{cancelDrag();selected=null;render();};
window.addEventListener('blur',()=>{if(drag){cancelDrag();selected=null;render();}});
async function tryMove(from,to,promotion){
  if(loading||opponentThinking||finished||!game)return;
  const legal=game.moves({square:from,verbose:true}).filter(m=>m.to===to);
  if(legal.some(m=>m.promotion)&&!promotion){promotion=await choosePromotion(game.turn());if(!promotion){render();return;}}
  let move;try{move=game.move({from,to,promotion});}catch{feedback('That move isn’t legal.','Try a different square. Your position is unchanged.','error');render();return false;}
  if(remaining===2&&!game.isCheckmate()){
    if(sameMove(move,puzzle.solution)){
      remaining=1;lastMove=[from,to];selected=null;hinted=false;opponentThinking=true;
      for(const id of ['generate','hint','reveal','flip','copy'])$(id).disabled=true;
      $('turnLabel').textContent=`${game.turn()==='w'?'White':'Black'} is replying…`;
      feedback(`${move.san} forces mate in two.`,"The opponent is playing a defense. Then it's your finishing move.");render();
      setTimeout(playDefense,450);return true;
    }
    const explanation=explainFailedMateTwo(game,move);game.undo();mistakes++;stats.streak=0;updateStats();feedback(explanation.title,explanation.text,'error');selected=null;hinted=false;render();return false;
  }
  if(game.isCheckmate()){
    lastMove=[from,to];finished=true;victory=true;victoryOpeningUntil=performance.now()+2200;elapsed=Math.floor((performance.now()-started)/1000);
    $('turnLabel').textContent=`Checkmate · M${puzzle.mateIn||1} solved`;
    if(!assisted){stats.solved++;stats.streak=mistakes?0:stats.streak+1;stats.best=stats.best===null?elapsed:Math.min(stats.best,elapsed);}else stats.streak=0;
    updateStats();feedback(`${move.san} · Beautiful finish.`,assisted?'Checkmate found with a hint. Ready for another?':`Checkmate in ${puzzle.mateIn===2?'two':'one'}. Solved in ${elapsed}s.`,'success');playSound();
  }else{const explanation=explainNotMate(game,move);game.undo();mistakes++;stats.streak=0;updateStats();feedback(explanation.title,explanation.text,'error');}
  selected=null;hinted=false;render();clock();return finished;
}
async function playDefense(){
  const branch=puzzle.branches.slice().sort((a,b)=>a.mates.length-b.mates.length)[0];
  const reply=branch.reply,piece=game.get(reply.from),origin=document.querySelector(`[data-square="${reply.from}"]`),r=origin.getBoundingClientRect();
  const ghost=document.createElement('img');ghost.className='drag-ghost';ghost.src=`/pieces/${piece.color}${piece.type.toUpperCase()}.svg`;ghost.style.width=r.width+'px';ghost.style.height=r.width+'px';ghost.style.transform=`translate(${r.x}px,${r.y}px) scale(.88)`;document.body.append(ghost);origin.classList.add('drag-origin');
  try{await land(ghost,reply.to,r.width,false);game.move(reply);finalSolutions=branch.mates;lastMove=[reply.from,reply.to];}
  finally{ghost.remove();opponentThinking=false;for(const id of ['generate','hint','reveal','flip','copy'])$(id).disabled=false;}
  $('turnLabel').textContent=`${game.turn()==='w'?'White':'Black'} to move · mate in 1`;$('turnDot').classList.toggle('black',game.turn()==='b');
  feedback(`${piece.color==='w'?'White':'Black'} played ${reply.san}.`,'Now find the final checkmate.');render();
}
function choosePromotion(color){return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.innerHTML='<h2>Choose your promotion.</h2><p>Which piece delivers the mate?</p><div class="promotion-options">'+['q','r','b','n'].map(type=>`<button data-promote="${type}" aria-label="Promote to ${{q:'queen',r:'rook',b:'bishop',n:'knight'}[type]}"><img src="/pieces/${color}${type.toUpperCase()}.svg" alt=""></button>`).join('')+'</div>';document.body.append(dialog);
  dialog.oncancel=()=>{dialog.remove();resolve(null);};dialog.querySelectorAll('button').forEach(b=>b.onclick=()=>{dialog.close();dialog.remove();resolve(b.dataset.promote);});dialog.showModal();
});}
function playSound(){if(!settings.sound)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();[523.25,659.25,783.99].forEach((f,i)=>{const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(.07,audio.currentTime+i*.1);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+i*.1+.4);o.start(audio.currentTime+i*.1);o.stop(audio.currentTime+i*.1+.4);});}catch{}}
$('flip').onclick=()=>{if(settling||opponentThinking)return;cancelDrag();orientation=orientation==='w'?'b':'w';render();};
$('hint').onclick=()=>{if(!puzzle||finished||settling||opponentThinking)return;cancelDrag();assisted=true;hinted=true;selected=null;feedback('Start with the highlighted piece.',remaining===2?'Find the move that forces mate after every defense.':'Find the square where it delivers checkmate.');render();};
$('reveal').onclick=()=>{if(!puzzle||finished||settling||opponentThinking)return;cancelDrag();assisted=true;
  const branch=puzzle.branches?.slice().sort((a,b)=>a.mates.length-b.mates.length)[0];
  const line=remaining===2?[puzzle.solution,branch.reply,branch.mates[0]]:[currentSolution()];
  for(const m of line)game.move(m);const m=line.at(-1);lastMove=[m.from,m.to];finished=true;selected=null;stats.streak=0;updateStats();feedback(line.map(m=>m.san).join(' → '),'Solution revealed. Generate a fresh puzzle to try again.');render();clock();};
$('copy').onclick=async()=>{if(!game)return;try{await navigator.clipboard.writeText(puzzle.fen);feedback('Position copied.','The original puzzle FEN is on your clipboard.');}catch{feedback('Copy this position:',puzzle.fen);}};
$('credits').onclick=e=>{e.preventDefault();$('creditsDialog').showModal();};$('closeCredits').onclick=()=>$('creditsDialog').close();
updateStats();updateSettings();render();generate();
