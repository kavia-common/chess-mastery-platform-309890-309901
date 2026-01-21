const { query } = require('../db/pool');
const { hashPassword, verifyPassword, signJwt } = require('../auth/auth');

class AuthController {
  async register(req, res, next) {
    try {
      const { username, email, password } = req.body;

      const passwordHash = await hashPassword(password);

      const result = await query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, email, created_at`,
        [username, email, passwordHash]
      );

      const user = result.rows[0];

      // Ensure rating row exists
      await query(
        `INSERT INTO ratings (user_id, rating, updated_at)
         VALUES ($1, 1200, now())
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id]
      );

      const token = signJwt({ userId: user.id, username: user.username, email: user.email });
      return res.status(201).json({ token, user });
    } catch (err) {
      // Unique constraint violations
      if (err && err.code === '23505') {
        return res.status(409).json({ status: 'error', message: 'Username or email already in use' });
      }
      return next(err);
    }
  }

  async login(req, res, next) {
    try {
      const { usernameOrEmail, password } = req.body;

      const result = await query(
        `SELECT id, username, email, password_hash, created_at
         FROM users
         WHERE username = $1 OR email = $1
         LIMIT 1`,
        [usernameOrEmail]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
      }

      const userRow = result.rows[0];
      const ok = await verifyPassword(password, userRow.password_hash);
      if (!ok) return res.status(401).json({ status: 'error', message: 'Invalid credentials' });

      const user = {
        id: userRow.id,
        username: userRow.username,
        email: userRow.email,
        created_at: userRow.created_at,
      };
      const token = signJwt({ userId: user.id, username: user.username, email: user.email });
      return res.status(200).json({ token, user });
    } catch (err) {
      return next(err);
    }
  }

  async me(req, res, next) {
    try {
      const userId = req.user.userId;
      const result = await query(
        `SELECT u.id, u.username, u.email, u.created_at, r.rating, r.updated_at AS rating_updated_at
         FROM users u
         LEFT JOIN ratings r ON r.user_id = u.id
         WHERE u.id = $1`,
        [userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'User not found' });
      return res.status(200).json({ user: result.rows[0] });
    } catch (err) {
      return next(err);
    }
  }

  async updateProfile(req, res, next) {
    try {
      const userId = req.user.userId;
      const { username, email } = req.body;

      const result = await query(
        `UPDATE users
         SET username = COALESCE($2, username),
             email = COALESCE($3, email)
         WHERE id = $1
         RETURNING id, username, email, created_at`,
        [userId, username || null, email || null]
      );

      if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'User not found' });

      return res.status(200).json({ user: result.rows[0] });
    } catch (err) {
      if (err && err.code === '23505') {
        return res.status(409).json({ status: 'error', message: 'Username or email already in use' });
      }
      return next(err);
    }
  }
}

module.exports = new AuthController();
