import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Chess } from 'chess.js';
import { candidate } from './generator.js';
import { solveMateTwo } from './mate-two.js';
const engine=spawn(process.execPath,['node_modules/stockfish/bin/stockfish-19-lite-single.js']);
const lines=createInterface({input:engine.stdout});let wait=null;lines.on('line',l=>wait?.(l));
function until(cmd,match){return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Engine timed out')),20000);wait=l=>{if(match(l)){clearTimeout(t);wait=null;resolve(l);}};engine.stdin.write(cmd+'\n');});}
try{
 await until('uci',l=>l==='uciok');await until('isready',l=>l==='readyok');
 for(const [elo,side] of [[600,'w'],[1200,'b'],[1700,'w'],[2400,'b']]){
  let p=null,attempts=0;const start=Date.now();
  while(!p&&attempts<20000){
   attempts++;const raw=candidate(elo,side,2);if(!raw)continue;
   let score=null;engine.stdin.write(`position fen ${raw.fen}\n`);
   const best=await until('go depth 6 nodes 18000',l=>{const m=l.match(/score (mate|cp) (-?\d+)/);if(m)score=m[1]==='mate'?+m[2]:null;return l.startsWith('bestmove ');});
   if(score!==2)continue;const uci=best.split(' ')[1];
   const solved=solveMateTwo(raw.fen,{from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]});if(!solved)continue;
   const tier=elo<1000?0:elo<1500?1:elo<2000?2:3;
   const complexity=raw.pieces+raw.checks*1.8+(['n','b','p'].includes(solved.solution.piece)?7:0)+5;
   const floor=[0,13,21,30][tier]+(elo-[600,1000,1500,2000][tier])/100*.7;
   if(complexity<floor||tier===0&&complexity>18||tier===1&&complexity>27||tier===2&&complexity>35||elo>=2300&&solved.solution.piece==='q')continue;
   p={...raw,...solved,complexity};
  }
  assert(p,'Must generate mate in two');const chess=new Chess(p.fen);assert(!chess.moves().some(m=>m.endsWith('#')));
  chess.move(p.solution);assert.equal(chess.moves().length,p.branches.length);
  for(const branch of p.branches){chess.move(branch.reply);for(const m of branch.mates){chess.move(m);assert(chess.isCheckmate());chess.undo();}chess.undo();}
  console.log(JSON.stringify({elo,side,attempts,ms:Date.now()-start,fen:p.fen,solution:p.solution.san,defenses:p.branches.length,complexity:p.complexity}));
 }
 console.log('PASS: unique M2 keys, no immediate mate, and a verified mate after every legal defense across all four difficulty bands.');
}finally{engine.kill();lines.close();}
