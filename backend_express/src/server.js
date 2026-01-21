const dotenv = require('dotenv');
dotenv.config();

const app = require('./app');
const { getConfig } = require('./config');
const { createWebSocketServer } = require('./ws/hub');

const cfg = getConfig();

const server = app.listen(cfg.port, cfg.host, () => {
  console.log(`Server running at http://${cfg.host}:${cfg.port}`);
  console.log(`WebSocket running at ws://{host}:${cfg.port}${cfg.wsPath}`);
});

// Attach WebSocket server to same HTTP server
createWebSocketServer(server, { path: cfg.wsPath });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = server;
