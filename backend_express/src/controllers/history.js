const { query } = require('../db/pool');

class HistoryController {
  async myGames(req, res, next) {
    try {
      const userId = req.user.userId;
      const limit = Math.min(Number(req.query.limit || 50), 200);
      const offset = Math.max(Number(req.query.offset || 0), 0);

      const rows = await query(
        `SELECT g.id, g.status, g.created_at, g.updated_at, g.winner_user_id,
                g.white_user_id, uw.username AS white_username,
                g.black_user_id, ub.username AS black_username,
                jsonb_array_length(g.moves) AS move_count
         FROM games g
         JOIN users uw ON uw.id = g.white_user_id
         JOIN users ub ON ub.id = g.black_user_id
         WHERE g.white_user_id = $1 OR g.black_user_id = $1
         ORDER BY g.updated_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return res.status(200).json({ games: rows.rows, limit, offset });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new HistoryController();
