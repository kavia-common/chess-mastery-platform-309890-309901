const assert = require('assert');

// PUBLIC_INTERFACE
function getConfig() {
  /**
   * Returns runtime configuration (from env vars).
   *
   * Required env vars:
   * - POSTGRES_URL: PostgreSQL connection string
   * - JWT_SECRET: JWT signing secret
   *
   * Optional env vars:
   * - PORT (default 3001)
   * - HOST (default 0.0.0.0)
   * - CORS_ORIGINS (default http://localhost:3000) comma-separated
   * - WS_PATH (default /ws)
   * - SESSION_SECRET (default JWT_SECRET)
   * - SESSION_TTL_DAYS (default 14)
   */
  const {
    POSTGRES_URL,
    JWT_SECRET,
    SESSION_SECRET,
    CORS_ORIGINS,
    WS_PATH,
    PORT,
    HOST,
    NODE_ENV,
    SESSION_TTL_DAYS,
  } = process.env;

  assert(POSTGRES_URL, 'POSTGRES_URL env var is required');
  assert(JWT_SECRET, 'JWT_SECRET env var is required');

  const origins = (CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    env: NODE_ENV || 'development',
    host: HOST || '0.0.0.0',
    port: Number(PORT || 3001),
    postgresUrl: POSTGRES_URL,
    jwtSecret: JWT_SECRET,
    sessionSecret: SESSION_SECRET || JWT_SECRET,
    sessionTtlDays: Number(SESSION_TTL_DAYS || 14),
    corsOrigins: origins,
    wsPath: WS_PATH || '/ws',
  };
}

module.exports = { getConfig };
