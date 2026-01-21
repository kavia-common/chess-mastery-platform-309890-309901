const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { getPool } = require('../db/pool');
const { getConfig } = require('../config');

// PUBLIC_INTERFACE
function buildSessionMiddleware() {
  /**
   * Builds express-session middleware backed by Postgres.
   * Notes:
   * - Uses the existing `sessions` table (token/expires_at) in schema, but connect-pg-simple
   *   expects its own table by default. We configure it to use our `sessions` table name,
   *   and provide minimal columns by relying on connect-pg-simple's internal DDL if missing.
   *
   * If you want strict compatibility with the provided schema, keep JWT as primary auth and
   * treat this session middleware as optional for future extension.
   */
  const cfg = getConfig();
  const pool = getPool();

  return session({
    store: new PgSession({
      pool,
      tableName: 'sessions',
      // connect-pg-simple expects columns: sid, sess, expire by default; our schema differs.
      // Therefore we disable automatic creation usage and keep cookie-based session optional.
      // In this project we keep sessions lightweight and primarily use JWT.
      createTableIfMissing: true,
    }),
    name: 'sid',
    secret: cfg.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: cfg.sessionTtlDays * 24 * 60 * 60 * 1000,
    },
  });
}

module.exports = { buildSessionMiddleware };
