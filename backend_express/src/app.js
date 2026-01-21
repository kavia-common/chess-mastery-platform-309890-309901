const cors = require('cors');
const express = require('express');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');
const { getConfig } = require('./config');
const { buildSessionMiddleware } = require('./middleware/session');

// Initialize express app
const app = express();
const cfg = getConfig();

/**
 * Respect proxy headers in previews / behind a load balancer.
 * - Default: trust proxy enabled (good for most preview deployments)
 * - Override: TRUST_PROXY=false to disable
 */
const trustProxyEnv = (process.env.TRUST_PROXY || 'true').toLowerCase();
app.set('trust proxy', trustProxyEnv === '1' || trustProxyEnv === 'true' || trustProxyEnv === 'yes');

// CORS: allow configured origins; return proper 403 JSON instead of generic 500 on disallowed origins.
app.use(cors({
  origin: (origin, cb) => {
    // Allow non-browser tools (no origin) and configured origins
    if (!origin) return cb(null, true);
    if (cfg.corsOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Explicitly respond to disallowed CORS requests with a clear error (instead of falling through).
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !cfg.corsOrigins.includes(origin)) {
    return res.status(403).json({ status: 'error', message: 'Not allowed by CORS' });
  }
  return next();
});

app.use(cookieParser());

// Optional session middleware (JWT remains primary auth)
app.use(buildSessionMiddleware());

// Swagger docs
app.use('/docs', swaggerUi.serve, (req, res, next) => {
  const host = req.get('host');
  let protocol = req.protocol;

  const actualPort = req.socket.localPort;
  const hasPort = host.includes(':');

  const needsPort =
    !hasPort &&
    ((protocol === 'http' && actualPort !== 80) ||
      (protocol === 'https' && actualPort !== 443));
  const fullHost = needsPort ? `${host}:${actualPort}` : host;
  protocol = req.secure ? 'https' : protocol;

  const dynamicSpec = {
    ...swaggerSpec,
    servers: [
      {
        url: `${protocol}://${fullHost}`,
      },
    ],
  };
  swaggerUi.setup(dynamicSpec)(req, res, next);
});

// Parse JSON request body
app.use(express.json());

// Mount routes
app.use('/', routes);

// Error handling middleware
app.use((err, req, res, next) => {
  // Handle disallowed CORS via explicit status
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ status: 'error', message: err.message });
  }

  console.error(err.stack);
  return res.status(500).json({
    status: 'error',
    message: 'Internal Server Error',
  });
});

module.exports = app;
