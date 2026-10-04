import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { explainNotMate } from './explanations.js';
const cases=[
  ['checking piece captured','7k/7Q/8/8/8/8/8/K7 b - - 0 1','Qh7+','capturing the checking queen on h7'],
  ['king escapes','7k/8/8/8/8/8/8/K6R b - - 0 1','Rh1+','safe square'],
  ['check blocked','7k/5Kb1/8/8/8/8/8/7R b - - 0 1','Rh1+','blocking the check on h6'],
  ['no check','7k/8/8/8/8/1Q6/8/K7 b - - 0 1','Qb3','does not check'],
  ['stalemate','7k/5K2/6Q1/8/8/8/8/8 b - - 0 1','Qg6','stalemate']
];
for(const [name,fen,san,expected] of cases){
  const chess=new Chess(fen),explanation=explainNotMate(chess,{san});
  assert.equal(chess.fen(),fen,'Explanation must not alter the position');
  assert((explanation.title+' '+explanation.text).includes(expected),name);
  if(explanation.reply){assert(chess.moves().includes(explanation.reply.san));chess.move(explanation.reply);assert(!chess.isCheckmate(),'Reply must escape mate');}
  console.log(name+': '+explanation.title+' '+explanation.text);
}
console.log('PASS: capture, king escape, blocking, no check, and stalemate explanations.');
