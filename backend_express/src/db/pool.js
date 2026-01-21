const { Pool } = require('pg');
const { getConfig } = require('../config');

let _pool;

// PUBLIC_INTERFACE
function getPool() {
  /** Returns a singleton pg Pool configured from POSTGRES_URL. */
  if (_pool) return _pool;

  const cfg = getConfig();
  _pool = new Pool({
    connectionString: cfg.postgresUrl,
    // Let platform manage TLS; users can add ?sslmode=require etc. in POSTGRES_URL when needed.
  });

  _pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL client error', err);
  });

  return _pool;
}

// PUBLIC_INTERFACE
async function query(text, params) {
  /**
   * Runs a parameterized query using the shared pool.
   * @param {string} text SQL string with $1,$2,...
   * @param {any[]} params query parameters
   */
  const pool = getPool();
  return pool.query(text, params);
}

module.exports = { getPool, query };
