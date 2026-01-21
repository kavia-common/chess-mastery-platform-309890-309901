/**
 * Minimal chess rules helper.
 *
 * NOTE: This is intentionally lightweight and not a full chess library.
 * It supports:
 * - FEN parsing/serialization
 * - Move application for common SAN forms: pawn moves (e4), captures (exd5), piece moves (Nf3),
 *   captures (Nxf3), checks (+) and mates (#) ignored in parsing, promotions (e8=Q),
 *   castling (O-O / O-O-O)
 * - Legal move validation with basic rules (piece moves, occupancy, turn, check prevention)
 *
 * For complex edge cases, swap this module for a full chess engine later.
 */

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];

function sqToIdx(sq) {
  const file = FILES.indexOf(sq[0]);
  const rank = RANKS.indexOf(sq[1]);
  return { x: file, y: rank };
}

function idxToSq(x, y) {
  return `${FILES[x]}${RANKS[y]}`;
}

function isUpper(c) {
  return c === c.toUpperCase();
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function parseFen(fen) {
  const [placement, activeColor, castling, enPassant, halfmove, fullmove] = fen.split(' ');
  const rows = placement.split('/');
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));

  for (let r = 0; r < 8; r++) {
    const row = rows[r];
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
      } else {
        board[7 - r][file] = ch;
        file += 1;
      }
    }
  }

  return {
    board,
    activeColor,
    castling: castling === '-' ? '' : castling,
    enPassant,
    halfmove: Number(halfmove),
    fullmove: Number(fullmove),
  };
}

function toFen(state) {
  const { board, activeColor, castling, enPassant, halfmove, fullmove } = state;
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) empty += 1;
      else {
        if (empty) row += String(empty);
        empty = 0;
        row += p;
      }
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return `${rows.join('/')} ${activeColor} ${castling || '-'} ${enPassant || '-'} ${halfmove} ${fullmove}`;
}

function pieceColor(piece) {
  if (!piece) return null;
  return isUpper(piece) ? 'w' : 'b';
}

function findKing(board, color) {
  const target = color === 'w' ? 'K' : 'k';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (board[y][x] === target) return { x, y };
    }
  }
  return null;
}

function onBoard(x, y) {
  return x >= 0 && x < 8 && y >= 0 && y < 8;
}

function rayAttacks(board, from, dx, dy, attackerColor) {
  let x = from.x + dx;
  let y = from.y + dy;
  while (onBoard(x, y)) {
    const p = board[y][x];
    if (p) {
      if (pieceColor(p) === attackerColor) return { x, y, p };
      return null;
    }
    x += dx;
    y += dy;
  }
  return null;
}

function isSquareAttacked(state, sq, byColor) {
  const { board } = state;
  const { x, y } = sq;

  // Pawn attacks
  const pawn = byColor === 'w' ? 'P' : 'p';
  const pawnDir = byColor === 'w' ? 1 : -1;
  for (const dx of [-1, 1]) {
    const px = x - dx;
    const py = y - pawnDir;
    if (onBoard(px, py) && board[py][px] === pawn) return true;
  }

  // Knight attacks
  const knight = byColor === 'w' ? 'N' : 'n';
  const jumps = [
    [1, 2], [2, 1], [-1, 2], [-2, 1],
    [1, -2], [2, -1], [-1, -2], [-2, -1],
  ];
  for (const [dx, dy] of jumps) {
    const nx = x + dx;
    const ny = y + dy;
    if (onBoard(nx, ny) && board[ny][nx] === knight) return true;
  }

  // King adjacency
  const king = byColor === 'w' ? 'K' : 'k';
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      if (!dx && !dy) continue;
      const kx = x + dx;
      const ky = y + dy;
      if (onBoard(kx, ky) && board[ky][kx] === king) return true;
    }
  }

  // Bishop/queen diagonals
  const bishop = byColor === 'w' ? 'B' : 'b';
  const queen = byColor === 'w' ? 'Q' : 'q';
  const rook = byColor === 'w' ? 'R' : 'r';

  for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    let cx = x + dx;
    let cy = y + dy;
    while (onBoard(cx, cy)) {
      const p = board[cy][cx];
      if (p) {
        if (pieceColor(p) === byColor && (p === bishop || p === queen)) return true;
        break;
      }
      cx += dx;
      cy += dy;
    }
  }

  // Rook/queen orthogonals
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let cx = x + dx;
    let cy = y + dy;
    while (onBoard(cx, cy)) {
      const p = board[cy][cx];
      if (p) {
        if (pieceColor(p) === byColor && (p === rook || p === queen)) return true;
        break;
      }
      cx += dx;
      cy += dy;
    }
  }

  return false;
}

function inCheck(state, color) {
  const king = findKing(state.board, color);
  if (!king) return false;
  const attacker = color === 'w' ? 'b' : 'w';
  return isSquareAttacked(state, king, attacker);
}

function generatePieceMoves(state, from) {
  const { board, activeColor, enPassant, castling } = state;
  const piece = board[from.y][from.x];
  if (!piece) return [];
  const color = pieceColor(piece);
  if (color !== activeColor) return [];

  const moves = [];
  const targetColor = color === 'w' ? 'b' : 'w';

  const addMove = (toX, toY, flags = {}) => {
    if (!onBoard(toX, toY)) return;
    const dest = board[toY][toX];
    if (dest && pieceColor(dest) === color) return;
    moves.push({ from, to: { x: toX, y: toY }, capture: Boolean(dest), ...flags });
  };

  const p = piece.toUpperCase();
  if (p === 'P') {
    const dir = color === 'w' ? 1 : -1;
    const startRank = color === 'w' ? 1 : 6;
    // one forward
    if (onBoard(from.x, from.y + dir) && !board[from.y + dir][from.x]) {
      addMove(from.x, from.y + dir);
      // two forward
      if (from.y === startRank && !board[from.y + 2 * dir][from.x]) {
        addMove(from.x, from.y + 2 * dir, { pawnDouble: true });
      }
    }
    // captures
    for (const dx of [-1, 1]) {
      const tx = from.x + dx;
      const ty = from.y + dir;
      if (!onBoard(tx, ty)) continue;
      const dest = board[ty][tx];
      if (dest && pieceColor(dest) === targetColor) addMove(tx, ty, { capture: true });
      // en passant
      const epsq = enPassant && enPassant !== '-' ? sqToIdx(enPassant) : null;
      if (epsq && epsq.x === tx && epsq.y === ty) {
        addMove(tx, ty, { capture: true, enPassant: true });
      }
    }
    return moves;
  }

  if (p === 'N') {
    const jumps = [
      [1, 2], [2, 1], [-1, 2], [-2, 1],
      [1, -2], [2, -1], [-1, -2], [-2, -1],
    ];
    for (const [dx, dy] of jumps) addMove(from.x + dx, from.y + dy);
    return moves;
  }

  const slide = (dirs) => {
    for (const [dx, dy] of dirs) {
      let x = from.x + dx;
      let y = from.y + dy;
      while (onBoard(x, y)) {
        const dest = board[y][x];
        if (!dest) {
          addMove(x, y);
        } else {
          if (pieceColor(dest) === targetColor) addMove(x, y, { capture: true });
          break;
        }
        x += dx;
        y += dy;
      }
    }
  };

  if (p === 'B') slide([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
  if (p === 'R') slide([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  if (p === 'Q') slide([[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]);

  if (p === 'K') {
    for (const dx of [-1, 0, 1]) {
      for (const dy of [-1, 0, 1]) {
        if (!dx && !dy) continue;
        addMove(from.x + dx, from.y + dy);
      }
    }

    // Castling: basic squares empty + not in check and not through check
    const rank = color === 'w' ? 0 : 7;
    if (!inCheck(state, color)) {
      // king side
      if ((color === 'w' ? castling.includes('K') : castling.includes('k'))
        && !board[rank][5] && !board[rank][6]
        && !isSquareAttacked(state, { x: 5, y: rank }, targetColor)
        && !isSquareAttacked(state, { x: 6, y: rank }, targetColor)) {
        moves.push({ from, to: { x: 6, y: rank }, castle: 'K' });
      }
      // queen side
      if ((color === 'w' ? castling.includes('Q') : castling.includes('q'))
        && !board[rank][1] && !board[rank][2] && !board[rank][3]
        && !isSquareAttacked(state, { x: 3, y: rank }, targetColor)
        && !isSquareAttacked(state, { x: 2, y: rank }, targetColor)) {
        moves.push({ from, to: { x: 2, y: rank }, castle: 'Q' });
      }
    }
  }

  return moves;
}

function applyMove(state, move) {
  const next = {
    ...state,
    board: cloneBoard(state.board),
    halfmove: state.halfmove,
    fullmove: state.fullmove,
    castling: state.castling,
    enPassant: '-',
  };

  const piece = next.board[move.from.y][move.from.x];
  next.board[move.from.y][move.from.x] = null;

  // handle en passant capture
  if (move.enPassant) {
    const dir = next.activeColor === 'w' ? -1 : 1;
    next.board[move.to.y + dir][move.to.x] = null;
  }

  // handle castling rook movement
  if (move.castle) {
    const rank = next.activeColor === 'w' ? 0 : 7;
    if (move.to.x === 6) {
      // king side
      const rook = next.board[rank][7];
      next.board[rank][7] = null;
      next.board[rank][5] = rook;
    } else if (move.to.x === 2) {
      // queen side
      const rook = next.board[rank][0];
      next.board[rank][0] = null;
      next.board[rank][3] = rook;
    }
  }

  next.board[move.to.y][move.to.x] = move.promotion ? (next.activeColor === 'w' ? move.promotion : move.promotion.toLowerCase()) : piece;

  // update castling rights if king/rook moved
  const moved = piece.toUpperCase();
  if (moved === 'K') {
    next.castling = next.castling.replace(next.activeColor === 'w' ? /[KQ]/g : /[kq]/g, '');
  }
  if (moved === 'R') {
    const rank = next.activeColor === 'w' ? 0 : 7;
    if (move.from.y === rank && move.from.x === 0) next.castling = next.castling.replace(next.activeColor === 'w' ? 'Q' : 'q', '');
    if (move.from.y === rank && move.from.x === 7) next.castling = next.castling.replace(next.activeColor === 'w' ? 'K' : 'k', '');
  }

  // if rook captured, update castling rights
  if (move.capture) {
    const targetColor = next.activeColor === 'w' ? 'b' : 'w';
    // capture squares on rook home squares
    if (move.to.y === 0 && move.to.x === 0) next.castling = next.castling.replace('Q', '');
    if (move.to.y === 0 && move.to.x === 7) next.castling = next.castling.replace('K', '');
    if (move.to.y === 7 && move.to.x === 0) next.castling = next.castling.replace('q', '');
    if (move.to.y === 7 && move.to.x === 7) next.castling = next.castling.replace('k', '');
    // targetColor unused; left for clarity
    void targetColor;
  }

  // en passant target
  if (move.pawnDouble) {
    const epY = move.from.y + (next.activeColor === 'w' ? 1 : -1);
    next.enPassant = idxToSq(move.from.x, epY);
  }

  // halfmove clock
  if (moved === 'P' || move.capture) next.halfmove = 0;
  else next.halfmove += 1;

  // toggle turn and fullmove
  next.activeColor = next.activeColor === 'w' ? 'b' : 'w';
  if (next.activeColor === 'w') next.fullmove += 1;

  return next;
}

function allLegalMoves(state) {
  const legal = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const p = state.board[y][x];
      if (!p) continue;
      if (pieceColor(p) !== state.activeColor) continue;
      const from = { x, y };
      for (const m of generatePieceMoves(state, from)) {
        const next = applyMove(state, m);
        if (!inCheck(next, state.activeColor)) {
          legal.push(m);
        }
      }
    }
  }
  return legal;
}

function parseSan(state, sanRaw) {
  const san = sanRaw.replace(/[+#]/g, '').trim();

  if (san === 'O-O' || san === '0-0') return { castle: 'K' };
  if (san === 'O-O-O' || san === '0-0-0') return { castle: 'Q' };

  const promotionMatch = san.match(/=([QRBN])/);
  const promotion = promotionMatch ? promotionMatch[1] : null;

  const cleaned = san.replace(/=([QRBN])/g, '');
  const capture = cleaned.includes('x');

  // Determine piece (default pawn)
  const pieceMatch = cleaned.match(/^[KQRBN]/);
  const pieceLetter = pieceMatch ? pieceMatch[0] : 'P';

  // Destination square is last two chars like e4
  const destMatch = cleaned.match(/([a-h][1-8])$/);
  if (!destMatch) return null;
  const toSq = destMatch[1];
  const to = sqToIdx(toSq);

  // Disambiguation: file/rank in between piece and 'x'/'dest'
  const between = cleaned
    .replace(/^[KQRBN]/, '') // strip piece if present
    .replace(/x/, '')
    .replace(/([a-h][1-8])$/, '');

  const disFile = between.match(/[a-h]/)?.[0] || null;
  const disRank = between.match(/[1-8]/)?.[0] || null;

  // For pawn captures, format like exd5: between contains source file
  let pawnFromFile = null;
  if (pieceLetter === 'P' && capture) {
    pawnFromFile = cleaned[0]; // first char file
  }

  return {
    pieceLetter,
    to,
    capture,
    promotion,
    disFile,
    disRank,
    pawnFromFile,
  };
}

// PUBLIC_INTERFACE
function validateAndApplySanMove(fen, san) {
  /**
   * Validates SAN move against the given FEN. Returns { ok, fenAfter, status }.
   * status: { check, checkmate, stalemate }
   */
  const state = parseFen(fen);
  const parsed = parseSan(state, san);
  if (!parsed) return { ok: false, error: 'Invalid SAN format' };

  const legalMoves = allLegalMoves(state);
  let candidates = legalMoves;

  if (parsed.castle) {
    const rank = state.activeColor === 'w' ? 0 : 7;
    const toX = parsed.castle === 'K' ? 6 : 2;
    candidates = candidates.filter((m) => m.castle && m.to.x === toX && m.to.y === rank);
  } else {
    const desiredPiece = state.activeColor === 'w' ? parsed.pieceLetter : parsed.pieceLetter.toLowerCase();
    candidates = candidates.filter((m) => {
      const moving = state.board[m.from.y][m.from.x];
      if (moving !== desiredPiece) return false;
      if (m.to.x !== parsed.to.x || m.to.y !== parsed.to.y) return false;
      if (Boolean(m.capture) !== Boolean(parsed.capture)) return false;
      return true;
    });

    if (parsed.disFile) {
      candidates = candidates.filter((m) => FILES[m.from.x] === parsed.disFile);
    }
    if (parsed.disRank) {
      candidates = candidates.filter((m) => RANKS[m.from.y] === parsed.disRank);
    }
    if (parsed.pawnFromFile) {
      candidates = candidates.filter((m) => FILES[m.from.x] === parsed.pawnFromFile);
    }
    if (parsed.promotion) {
      candidates = candidates.map((m) => ({ ...m, promotion: parsed.promotion }));
    }
  }

  if (candidates.length !== 1) {
    return { ok: false, error: candidates.length === 0 ? 'Illegal move' : 'Ambiguous move' };
  }

  const next = applyMove(state, candidates[0]);

  // Determine end conditions
  const opponent = next.activeColor;
  const oppInCheck = inCheck(next, opponent);
  const oppLegal = allLegalMoves(next);

  const checkmate = oppInCheck && oppLegal.length === 0;
  const stalemate = !oppInCheck && oppLegal.length === 0;

  return {
    ok: true,
    fenAfter: toFen(next),
    status: {
      check: oppInCheck,
      checkmate,
      stalemate,
    },
  };
}

module.exports = { validateAndApplySanMove };
