import { Chess } from 'chess.js';
export const sameMove=(a,b)=>a&&b&&a.from===b.from&&a.to===b.to&&(a.promotion||'')===(b.promotion||'');
export function mateTwoBranches(chess,key){
  chess.move(key);
  if(chess.isCheckmate()){chess.undo();return null;}
  const replies=chess.moves({verbose:true}).sort((a,b)=>(b.piece==='k')-(a.piece==='k')||Boolean(b.captured)-Boolean(a.captured));
  if(!replies.length){chess.undo();return null;}
  const branches=[];
  for(const reply of replies){
    chess.move(reply);
    const mates=chess.moves({verbose:true}).filter(m=>m.san.endsWith('#'));
    chess.undo();
    if(!mates.length){chess.undo();return null;}
    branches.push({reply,mates});
  }
  chess.undo();return branches;
}
export function solveMateTwo(fen,preferred){
  const chess=new Chess(fen),moves=chess.moves({verbose:true});
  if(moves.some(m=>m.san.endsWith('#')))return null;
  moves.sort((a,b)=>(sameMove(b,preferred)?1:0)-(sameMove(a,preferred)?1:0)||b.san.includes('+')-a.san.includes('+'));
  let solution=null;
  for(const key of moves){
    const branches=mateTwoBranches(chess,key);
    if(branches){if(solution)return null;solution={solution:key,branches};}
  }
  return solution;
}
export function explainFailedMateTwo(chess,attempt){
  const side=chess.turn()==='w'?'White':'Black',attacker=chess.turn()==='w'?'Black':'White';
  const replies=chess.moves({verbose:true});
  if(!replies.length)return {title:`${attempt.san} gives stalemate.`,text:`${side} has no legal move, but its king is not in check. That is a draw, not mate in two.`};
  for(const reply of replies){
    chess.move(reply);
    const canMate=chess.moves({verbose:true}).some(m=>m.san.endsWith('#'));
    chess.undo();
    if(!canMate)return {title:`${attempt.san} does not force mate in two.`,text:`${side} can play ${reply.san} (${reply.from} → ${reply.to})${reply.san.endsWith('#')?', delivering checkmate.':`. After that reply, ${attacker} has no legal move that gives checkmate on the next turn.`}`};
  }
  throw new Error('Expected a refuting defense for an incorrect mate-in-two move');
}
