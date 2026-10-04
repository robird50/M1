import { Chess } from 'chess.js';
const files = 'abcdefgh';
const rand = n => Math.floor(Math.random() * n);
const pick = a => a[rand(a.length)];
const square = () => files[rand(8)] + (1 + rand(8));
export function candidate(elo = 1400, side = 'w', mateIn = 1) {
  const tier = elo < 1000 ? 0 : elo < 1500 ? 1 : elo < 2000 ? 2 : 3;
  const chess = new Chess(); chess.clear();
  const opponent = side === 'w' ? 'b' : 'w';
  // Edge kings create useful mating nets without baking in a solution.
  const enemyKing = Math.random() < .85 ? pick(['a1','b1','c1','d1','e1','f1','g1','h1','a2','h2','a3','h3','a4','h4','a5','h5','a6','h6','a7','h7','a8','b8','c8','d8','e8','f8','g8','h8']) : square();
  chess.put({type:'k',color:opponent}, enemyKing);
  let ownKing = square();
  while (Math.max(Math.abs(files.indexOf(ownKing[0])-files.indexOf(enemyKing[0])),Math.abs(+ownKing[1]-+enemyKing[1])) < 2) ownKing = square();
  chess.put({type:'k',color:side},ownKing);
  const count = [3,7,11,15][tier] + rand(4);
  const stock = {w:{q:1,r:2,b:2,n:2,p:8},b:{q:1,r:2,b:2,n:2,p:8}};
  for(let i=0;i<count;i++) {
    const color = i < 2 ? side : Math.random() < .52 ? opponent : side;
    let type = i===0 ? pick(tier < 2 ? ['q','r'] : ['r','b','n','q']) : pick(['p','p','p','r','b','n','q']);
    if (!stock[color][type]) continue;
    let sq = square();
    // Some defenders stay near their king, forming plausible escape blockers.
    if(color===opponent && Math.random()<.55) {
      const x=Math.max(0,Math.min(7,files.indexOf(enemyKing[0])+rand(5)-2));
      const y=Math.max(1,Math.min(8,+enemyKing[1]+rand(5)-2)); sq=files[x]+y;
    }
    if(chess.get(sq) || type==='p' && (sq[1]==='1'||sq[1]==='8')) continue;
    chess.put({type,color},sq); stock[color][type]--;
  }
  const fen = chess.fen().replace(/ [wb] /,` ${side} `);
  try { chess.load(fen); } catch { return null; }
  if(chess.isCheck()) return null;
  const other = new Chess(fen.replace(` ${side} `,` ${opponent} `));
  if(other.isCheck()) return null;
  const moves=chess.moves({verbose:true});
  const mates=moves.filter(m=>m.san.endsWith('#'));
  const pieces=chess.board().flat().filter(Boolean).length;
  const checks=moves.filter(m=>m.san.includes('+')).length;
  if(mateIn===2){
    if(mates.length||pieces<[0,6,9,12][tier]||!moves.length)return null;
    return {fen,mateIn:2,elo,pieces,checks};
  }
  if(mates.length!==1) return null;
  const mate=mates[0];
  // Difficulty is structural, not engine strength or a claimed measured rating.
  const complexity=pieces + checks*1.8 + (['n','b','p'].includes(mate.piece)?7:0) + (mate.captured?0:2);
  const floor = [0,13,21,30][tier] + (elo-[600,1000,1500,2000][tier]) / 100 * .7;
  if(complexity < floor || pieces < [0,6,9,12][tier]) return null;
  if(tier===0 && (complexity>12 || !['q','r'].includes(mate.piece))) return null;
  if(tier===1 && complexity>22) return null;
  if(tier===2 && complexity>30) return null;
  if(elo>=2300 && mate.piece==='q') return null;
  return {fen,solution:mate,mateIn:1,elo,complexity,pieces,checks};
}
