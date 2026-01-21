const { query } = require('../db/pool');
const { broadcastToGame } = require('../ws/hub');

class ChatController {
  async list(req, res, next) {
    try {
      const { gameId } = req.params;
      const userId = req.user.userId;

      const g = await query('SELECT white_user_id, black_user_id FROM games WHERE id = $1', [gameId]);
      if (g.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Game not found' });

      if (g.rows[0].white_user_id !== userId && g.rows[0].black_user_id !== userId) {
        return res.status(403).json({ status: 'error', message: 'Not a player in this game' });
      }

      const msgs = await query(
        `SELECT id, game_id, sender_user_id, message_text, created_at
         FROM chat_messages
         WHERE game_id = $1
         ORDER BY created_at ASC
         LIMIT 200`,
        [gameId]
      );

      return res.status(200).json({ messages: msgs.rows });
    } catch (err) {
      return next(err);
    }
  }

  async send(req, res, next) {
    try {
      const { gameId } = req.params;
      const userId = req.user.userId;
      const { messageText } = req.body;

      const g = await query('SELECT white_user_id, black_user_id FROM games WHERE id = $1', [gameId]);
      if (g.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Game not found' });

      if (g.rows[0].white_user_id !== userId && g.rows[0].black_user_id !== userId) {
        return res.status(403).json({ status: 'error', message: 'Not a player in this game' });
      }

      const ins = await query(
        `INSERT INTO chat_messages (game_id, sender_user_id, message_text, created_at)
         VALUES ($1, $2, $3, now())
         RETURNING id, game_id, sender_user_id, message_text, created_at`,
        [gameId, userId, messageText]
      );

      const row = ins.rows[0];

      broadcastToGame(gameId, {
        type: 'chat',
        gameId,
        message: {
          id: row.id,
          senderUserId: row.sender_user_id,
          messageText: row.message_text,
          createdAt: row.created_at,
        },
      });

      return res.status(201).json({ message: row });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new ChatController();
