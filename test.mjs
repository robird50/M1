import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Chess } from 'chess.js';
import { candidate } from './generator.js';
const engine=spawn(process.execPath,['node_modules/stockfish/bin/stockfish-19-lite-single.js']);
const lines=createInterface({input:engine.stdout});
let wait=null;
lines.on('line',line=>wait?.(line));
function until(command,match){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Engine timeout')),20000);wait=line=>{if(match(line)){clearTimeout(timer);wait=null;resolve(line);}};engine.stdin.write(command+'\n');});}
try {
  await until('uci',l=>l==='uciok');await until('isready',l=>l==='readyok');
  const results=[];
  for(const elo of [600,1200,1700,2400]) for(const side of ['w','b']) for(let n=0;n<3;n++) {
    let p,attempts=0;const start=Date.now();
    while(!p&&attempts<50000){p=candidate(elo,side);attempts++;}
    assert(p,`No puzzle at ${elo}/${side}`);
    const chess=new Chess(p.fen);
    assert.equal(chess.turn(),side);assert.equal(chess.isCheck(),false);
    const mates=chess.moves({verbose:true}).filter(m=>m.san.endsWith('#'));
    assert.equal(mates.length,1,'Exactly one mating move');
    assert.equal(mates[0].san,p.solution.san);
    chess.move(p.solution);assert(chess.isCheckmate());
    const uci=p.solution.from+p.solution.to+(p.solution.promotion||'');let mate=false;
    engine.stdin.write(`ucinewgame\nposition fen ${p.fen}\n`);
    await until(`go depth 3 searchmoves ${uci}`,line=>{if(/score mate 1(?: |$)/.test(line))mate=true;return line.startsWith('bestmove ');}).then(line=>assert.equal(line.split(' ')[1],uci));
    assert(mate,'Stockfish must verify mate in one');
    results.push({elo,side,attempts,ms:Date.now()-start,complexity:p.complexity});
  }
  console.table(results);console.log('PASS: 24 fresh puzzles, four difficulty tiers, both colors; unique mates and Stockfish 19 Lite verification.');
}finally{engine.kill();lines.close();}
