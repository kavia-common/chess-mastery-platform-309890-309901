const { verifyJwt } = require('../auth/auth');

// PUBLIC_INTERFACE
function requireAuth(req, res, next) {
  /**
   * Express middleware that requires a valid Bearer token.
   * Sets req.user = { userId, username, email } (as present in token).
   */
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ status: 'error', message: 'Missing Authorization Bearer token' });
  }

  try {
    const decoded = verifyJwt(token);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
