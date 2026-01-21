const { query } = require('../db/pool');

class LeaderboardsController {
  async top(req, res, next) {
    try {
      const limit = Math.min(Number(req.query.limit || 50), 200);

      const rows = await query(
        `SELECT user_id, username, rating, updated_at
         FROM leaderboard
         LIMIT $1`,
        [limit]
      );

      return res.status(200).json({ leaderboard: rows.rows });
    } catch (err) {
      return next(err);
    }
  }

  async recent(req, res, next) {
    try {
      const limit = Math.min(Number(req.query.limit || 50), 200);

      const rows = await query(
        `SELECT g.id AS game_id, g.status, g.created_at, g.updated_at,
                uw.username AS white_username, ub.username AS black_username,
                g.winner_user_id
         FROM games g
         JOIN users uw ON uw.id = g.white_user_id
         JOIN users ub ON ub.id = g.black_user_id
         ORDER BY g.updated_at DESC
         LIMIT $1`,
        [limit]
      );

      return res.status(200).json({ recentGames: rows.rows });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new LeaderboardsController();
