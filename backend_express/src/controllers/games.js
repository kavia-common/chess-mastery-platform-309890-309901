const { query, getPool } = require('../db/pool');
const { validateAndApplySanMove } = require('../chess/engine');
const { computeEloDelta } = require('../ratings/elo');
const { broadcastToGame } = require('../ws/hub');

class GamesController {
  async getGame(req, res, next) {
    try {
      const { gameId } = req.params;
      const userId = req.user.userId;

      const g = await query(
        `SELECT id, white_user_id, black_user_id, status, moves, current_fen, winner_user_id, created_at, updated_at
         FROM games
         WHERE id = $1`,
        [gameId]
      );
      if (g.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Game not found' });

      const game = g.rows[0];
      if (game.white_user_id !== userId && game.black_user_id !== userId) {
        return res.status(403).json({ status: 'error', message: 'Not a player in this game' });
      }

      return res.status(200).json({ game });
    } catch (err) {
      return next(err);
    }
  }

  async getMoves(req, res, next) {
    try {
      const { gameId } = req.params;
      const userId = req.user.userId;

      const g = await query('SELECT white_user_id, black_user_id FROM games WHERE id = $1', [gameId]);
      if (g.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Game not found' });
      if (g.rows[0].white_user_id !== userId && g.rows[0].black_user_id !== userId) {
        return res.status(403).json({ status: 'error', message: 'Not a player in this game' });
      }

      const moves = await query(
        `SELECT id, move_number, san, from_sq, to_sq, fen_after, created_at
         FROM game_moves
         WHERE game_id = $1
         ORDER BY move_number ASC`,
        [gameId]
      );
      return res.status(200).json({ moves: moves.rows });
    } catch (err) {
      return next(err);
    }
  }

  async submitMove(req, res, next) {
    try {
      const { gameId } = req.params;
      const userId = req.user.userId;
      const { san } = req.body;

      const g = await query(
        `SELECT id, white_user_id, black_user_id, status, moves, current_fen, winner_user_id
         FROM games WHERE id = $1`,
        [gameId]
      );
      if (g.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Game not found' });
      const game = g.rows[0];

      if (game.status !== 'active') return res.status(409).json({ status: 'error', message: 'Game not active' });
      if (game.white_user_id !== userId && game.black_user_id !== userId) {
        return res.status(403).json({ status: 'error', message: 'Not a player in this game' });
      }

      const turn = game.current_fen.split(' ')[1]; // 'w'|'b'
      const expectedUserId = turn === 'w' ? game.white_user_id : game.black_user_id;
      if (expectedUserId !== userId) return res.status(409).json({ status: 'error', message: 'Not your turn' });

      const validated = validateAndApplySanMove(game.current_fen, san);
      if (!validated.ok) return res.status(400).json({ status: 'error', message: validated.error });

      const moveNumber = (game.moves?.length || 0) + 1;
      const fenAfter = validated.fenAfter;

      const pool = getPool();
      const client = await pool.connect();

      let updatedGame;
      try {
        await client.query('BEGIN');

        const lock = await client.query(
          'SELECT moves, current_fen, status FROM games WHERE id = $1 FOR UPDATE',
          [gameId]
        );
        if (lock.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ status: 'error', message: 'Game not found' });
        }
        if (lock.rows[0].status !== 'active') {
          await client.query('ROLLBACK');
          return res.status(409).json({ status: 'error', message: 'Game not active' });
        }

        await client.query(
          `INSERT INTO game_moves (game_id, move_number, san, fen_after)
           VALUES ($1, $2, $3, $4)`,
          [gameId, moveNumber, san, fenAfter]
        );

        const newMoves = [...(lock.rows[0].moves || []), san];

        const status = (validated.status.checkmate || validated.status.stalemate) ? 'finished' : 'active';
        const winnerUserId = validated.status.checkmate ? userId : null;

        const upd = await client.query(
          `UPDATE games
           SET moves = $2::jsonb,
               current_fen = $3,
               status = $4::game_status,
               winner_user_id = $5,
               updated_at = now()
           WHERE id = $1
           RETURNING id, white_user_id, black_user_id, status, moves, current_fen, winner_user_id, updated_at`,
          [gameId, JSON.stringify(newMoves), fenAfter, status, winnerUserId]
        );
        updatedGame = upd.rows[0];

        // If game ended, update ELO
        if (status === 'finished') {
          await this._finalizeRatingsWithClient(client, updatedGame);
        }

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      broadcastToGame(gameId, {
        type: 'move',
        gameId,
        san,
        fenAfter,
        moveNumber,
        status: updatedGame.status,
        winnerUserId: updatedGame.winner_user_id,
      });

      return res.status(200).json({ game: updatedGame, move: { san, fenAfter, moveNumber } });
    } catch (err) {
      return next(err);
    }
  }

  async resign(req, res, next) {
    try {
      const { gameId } = req.params;
      const userId = req.user.userId;

      const g = await query(
        `SELECT id, white_user_id, black_user_id, status
         FROM games WHERE id = $1`,
        [gameId]
      );
      if (g.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Game not found' });
      const game = g.rows[0];

      if (game.status !== 'active') return res.status(409).json({ status: 'error', message: 'Game not active' });
      if (game.white_user_id !== userId && game.black_user_id !== userId) {
        return res.status(403).json({ status: 'error', message: 'Not a player in this game' });
      }

      const winnerUserId = game.white_user_id === userId ? game.black_user_id : game.white_user_id;

      const pool = getPool();
      const client = await pool.connect();

      let updated;
      try {
        await client.query('BEGIN');
        const upd = await client.query(
          `UPDATE games
           SET status = 'finished', winner_user_id = $2, updated_at = now()
           WHERE id = $1 AND status = 'active'
           RETURNING id, white_user_id, black_user_id, status, moves, current_fen, winner_user_id, updated_at`,
          [gameId, winnerUserId]
        );
        if (upd.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ status: 'error', message: 'Game not active' });
        }
        updated = upd.rows[0];
        await this._finalizeRatingsWithClient(client, updated);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      broadcastToGame(gameId, { type: 'game_finished', gameId, reason: 'resign', winnerUserId });
      return res.status(200).json({ game: updated });
    } catch (err) {
      return next(err);
    }
  }

  async draw(req, res, next) {
    try {
      const { gameId } = req.params;
      const userId = req.user.userId;

      const g = await query(
        `SELECT id, white_user_id, black_user_id, status
         FROM games WHERE id = $1`,
        [gameId]
      );
      if (g.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Game not found' });
      const game = g.rows[0];

      if (game.status !== 'active') return res.status(409).json({ status: 'error', message: 'Game not active' });
      if (game.white_user_id !== userId && game.black_user_id !== userId) {
        return res.status(403).json({ status: 'error', message: 'Not a player in this game' });
      }

      const pool = getPool();
      const client = await pool.connect();

      let updated;
      try {
        await client.query('BEGIN');
        const upd = await client.query(
          `UPDATE games
           SET status = 'finished', winner_user_id = NULL, updated_at = now()
           WHERE id = $1 AND status = 'active'
           RETURNING id, white_user_id, black_user_id, status, moves, current_fen, winner_user_id, updated_at`,
          [gameId]
        );
        if (upd.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ status: 'error', message: 'Game not active' });
        }
        updated = upd.rows[0];
        await this._finalizeRatingsWithClient(client, updated, { draw: true });
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      broadcastToGame(gameId, { type: 'game_finished', gameId, reason: 'draw', winnerUserId: null });
      return res.status(200).json({ game: updated });
    } catch (err) {
      return next(err);
    }
  }

  async _finalizeRatingsWithClient(client, game, { draw = false } = {}) {
    const whiteId = game.white_user_id;
    const blackId = game.black_user_id;

    const r = await client.query(
      'SELECT user_id, rating FROM ratings WHERE user_id = ANY($1::uuid[])',
      [[whiteId, blackId]]
    );
    const whiteRating = r.rows.find((x) => x.user_id === whiteId)?.rating ?? 1200;
    const blackRating = r.rows.find((x) => x.user_id === blackId)?.rating ?? 1200;

    let scoreWhite = 0.5;
    if (!draw) {
      scoreWhite = game.winner_user_id === whiteId ? 1 : 0;
    }

    const deltaWhite = computeEloDelta(whiteRating, blackRating, scoreWhite);
    const deltaBlack = -deltaWhite;

    await client.query(
      `INSERT INTO ratings (user_id, rating, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET rating = EXCLUDED.rating, updated_at = EXCLUDED.updated_at`,
      [whiteId, Math.max(0, whiteRating + deltaWhite)]
    );
    await client.query(
      `INSERT INTO ratings (user_id, rating, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET rating = EXCLUDED.rating, updated_at = EXCLUDED.updated_at`,
      [blackId, Math.max(0, blackRating + deltaBlack)]
    );
  }
}

module.exports = new GamesController();
