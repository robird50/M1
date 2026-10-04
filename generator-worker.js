import { candidate } from './generator.js';
import { solveMateTwo } from './mate-two.js';
let ticket = 0;
let engine=null,ready=null,pending=null;
function engineReady(){
  if(ready)return ready;
  engine=new Worker('/engine/stockfish-19-lite-single.js');
  ready=new Promise((resolve,reject)=>{
    engine.onerror=()=>{reject(new Error('Search engine could not load'));pending?.reject(new Error('Search engine stopped'));};
    engine.onmessage=({data})=>{for(const line of String(data).split('\n')){
      if(line==='uciok'){engine.postMessage('setoption name Hash value 16');engine.postMessage('isready');}
      if(line==='readyok')resolve();
      if(pending){const score=line.match(/score (mate|cp) (-?\d+)/);if(score)pending.score=score[1]==='mate'?+score[2]:null;
        if(line.startsWith('bestmove ')){const p=pending;pending=null;p.resolve({mate:p.score,uci:line.split(' ')[1]});}}
    }};engine.postMessage('uci');
  });return ready;
}
function analyze(fen){return new Promise((resolve,reject)=>{pending={resolve,reject,score:null};engine.postMessage(`position fen ${fen}`);engine.postMessage('go depth 6 nodes 18000');});}
self.onmessage = async ({data}) => {
  const id=++ticket, seen=new Set(data.seen);
  let attempts=0;
  if(data.mateIn===2){
    try{
      await engineReady();
      while(id===ticket){
        attempts++;
        const p=candidate(data.elo,data.side,2);
        if(!p||seen.has(p.fen)){if(attempts%100===0){self.postMessage({attempts});await new Promise(r=>setTimeout(r,0));}continue;}
        self.postMessage({attempts});
        const result=await analyze(p.fen);
        if(result.mate!==2)continue;
        const preferred={from:result.uci.slice(0,2),to:result.uci.slice(2,4),promotion:result.uci[4]};
        const solved=solveMateTwo(p.fen,preferred);if(!solved)continue;
        const tier=data.elo<1000?0:data.elo<1500?1:data.elo<2000?2:3;
        const complexity=p.pieces+p.checks*1.8+(['n','b','p'].includes(solved.solution.piece)?7:0)+5;
        const floor=[0,13,21,30][tier]+(data.elo-[600,1000,1500,2000][tier])/100*.7;
        if(complexity<floor||tier===0&&complexity>18||tier===1&&complexity>27||tier===2&&complexity>35||data.elo>=2300&&solved.solution.piece==='q')continue;
        self.postMessage({puzzle:{...p,...solved,complexity},attempts});return;
      }
    }catch(error){self.postMessage({error:error.message});}
    return;
  }
  const batch=()=>{
    if(id!==ticket) return;
    for(let i=0;i<100;i++) {
      attempts++;
      const puzzle=candidate(data.elo,data.side);
      if(puzzle&&!seen.has(puzzle.fen)) {self.postMessage({puzzle,attempts});return;}
    }
    self.postMessage({attempts});
    setTimeout(batch,0);
  };batch();
};
