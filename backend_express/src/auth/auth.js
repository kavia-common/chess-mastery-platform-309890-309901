const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getConfig } = require('../config');

const SALT_ROUNDS = 12;

// PUBLIC_INTERFACE
async function hashPassword(password) {
  /** Hashes a plaintext password using bcrypt. */
  return bcrypt.hash(password, SALT_ROUNDS);
}

// PUBLIC_INTERFACE
async function verifyPassword(password, passwordHash) {
  /** Verifies plaintext password against stored bcrypt hash. */
  return bcrypt.compare(password, passwordHash);
}

// PUBLIC_INTERFACE
function signJwt(payload, options = {}) {
  /** Signs a JWT for the given payload. */
  const cfg = getConfig();
  return jwt.sign(payload, cfg.jwtSecret, { expiresIn: '7d', ...options });
}

// PUBLIC_INTERFACE
function verifyJwt(token) {
  /** Verifies a JWT and returns its decoded payload. Throws on failure. */
  const cfg = getConfig();
  return jwt.verify(token, cfg.jwtSecret);
}

module.exports = { hashPassword, verifyPassword, signJwt, verifyJwt };
