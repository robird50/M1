const names={k:'king',q:'queen',r:'rook',b:'bishop',n:'knight',p:'pawn'};
// Inspect the position AFTER the attempted move, before the app restores it.
export function explainNotMate(chess,attempt){
  const color=chess.turn(),side=color==='w'?'White':'Black';
  const checked=chess.isCheck(),replies=chess.moves({verbose:true});
  if(chess.isStalemate())return {title:`${attempt.san} is stalemate, not checkmate.`,text:`${side}'s king is not in check, and ${side} has no legal move. That would be a draw.`,reply:null};
  const king=chess.board().flat().find(p=>p?.type==='k'&&p.color===color)?.square;
  const checkers=checked?chess.attackers(king,color==='w'?'b':'w'):[];
  const reply=replies.find(m=>m.captured&&checkers.includes(m.to))||replies.find(m=>m.piece==='k')||replies.find(m=>m.captured)||replies[0];
  if(!reply)return {title:`${attempt.san} does not give checkmate.`,text:`${side}'s king is not in check.`,reply:null};
  const captureSquare=reply.flags.includes('e')?reply.to[0]+reply.from[1]:reply.to;
  let action;
  if(checked&&reply.captured&&checkers.includes(captureSquare))action=`capturing the checking ${names[reply.captured]} on ${captureSquare}${reply.flags.includes('e')?' en passant':''}`;
  else if(reply.piece==='k')action=`moving the king from ${reply.from} to the safe square ${reply.to}${reply.captured?` and capturing your ${names[reply.captured]}`:''}`;
  else if(checked)action=`blocking the check on ${reply.to} with the ${names[reply.piece]} from ${reply.from}${reply.promotion?`, promoting to a ${names[reply.promotion]}`:''}`;
  else action=`${reply.captured?'capturing your '+names[reply.captured]+' on '+reply.to:'moving the '+names[reply.piece]+' from '+reply.from+' to '+reply.to}${reply.promotion?` and promoting to a ${names[reply.promotion]}`:''}`;
  return {title:checked?`${attempt.san} can be answered by ${reply.san}.`:`${attempt.san} does not check ${side}'s king.`,text:`${side} can play ${reply.san}, ${action}. ${checked?'That gets the king out of check.':'Checkmate requires the king to be in check with no legal escape.'}`,reply};
}
