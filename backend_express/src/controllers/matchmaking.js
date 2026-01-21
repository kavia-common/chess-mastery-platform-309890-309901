const { query } = require('../db/pool');
const { notifyUser } = require('../ws/hub');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

class MatchmakingController {
  async join(req, res, next) {
    try {
      const userId = req.user.userId;

      const ratingRes = await query('SELECT rating FROM ratings WHERE user_id = $1', [userId]);
      const rating = ratingRes.rows[0]?.rating ?? 1200;

      await query(
        `INSERT INTO matchmaking_queue (user_id, rating_snapshot)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET rating_snapshot = EXCLUDED.rating_snapshot, queued_at = now()`,
        [userId, rating]
      );

      // Attempt to find a match immediately
      await this.tryMatch();

      return res.status(200).json({ status: 'ok', queued: true });
    } catch (err) {
      return next(err);
    }
  }

  async leave(req, res, next) {
    try {
      const userId = req.user.userId;
      await query('DELETE FROM matchmaking_queue WHERE user_id = $1', [userId]);
      return res.status(200).json({ status: 'ok', queued: false });
    } catch (err) {
      return next(err);
    }
  }

  async status(req, res, next) {
    try {
      const userId = req.user.userId;
      const q = await query('SELECT queued_at, rating_snapshot FROM matchmaking_queue WHERE user_id = $1', [userId]);
      return res.status(200).json({ queued: q.rows.length > 0, entry: q.rows[0] || null });
    } catch (err) {
      return next(err);
    }
  }

  async tryMatch() {
    // Select two earliest queued users.
    const queued = await query(
      `SELECT user_id, rating_snapshot
       FROM matchmaking_queue
       ORDER BY queued_at ASC
       LIMIT 2`,
      []
    );

    if (queued.rows.length < 2) return null;

    const [a, b] = queued.rows;
    if (a.user_id === b.user_id) return null;

    // Remove both entries atomically and create game.
    const client = await require('../db/pool').getPool().connect();
    try {
      await client.query('BEGIN');

      const lock = await client.query(
        `SELECT user_id
         FROM matchmaking_queue
         ORDER BY queued_at ASC
         LIMIT 2
         FOR UPDATE SKIP LOCKED`
      );
      if (lock.rows.length < 2) {
        await client.query('ROLLBACK');
        return null;
      }

      const userIds = lock.rows.map((r) => r.user_id);

      await client.query('DELETE FROM matchmaking_queue WHERE user_id = ANY($1::uuid[])', [userIds]);

      // Deterministic color assignment: higher rating gets white (simple), tie by order
      const userA = userIds[0];
      const userB = userIds[1];

      const ratingRows = await client.query(
        'SELECT user_id, rating_snapshot FROM (VALUES ($1::uuid,$3::int), ($2::uuid,$4::int)) AS t(user_id, rating_snapshot)',
        [userA, userB, a.rating_snapshot, b.rating_snapshot]
      );
      const ra = ratingRows.rows.find((r) => r.user_id === userA)?.rating_snapshot ?? a.rating_snapshot;
      const rb = ratingRows.rows.find((r) => r.user_id === userB)?.rating_snapshot ?? b.rating_snapshot;

      const whiteUserId = ra >= rb ? userA : userB;
      const blackUserId = whiteUserId === userA ? userB : userA;

      const gameRes = await client.query(
        `INSERT INTO games (white_user_id, black_user_id, status, moves, current_fen, created_at, updated_at)
         VALUES ($1, $2, 'active', '[]'::jsonb, $3, now(), now())
         RETURNING id`,
        [whiteUserId, blackUserId, START_FEN]
      );
      const gameId = gameRes.rows[0].id;

      await client.query('COMMIT');

      notifyUser(whiteUserId, { type: 'match_found', gameId, color: 'white' });
      notifyUser(blackUserId, { type: 'match_found', gameId, color: 'black' });

      return { gameId, whiteUserId, blackUserId };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

module.exports = new MatchmakingController();
