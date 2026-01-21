const swaggerJSDoc = require('swagger-jsdoc');
const { getConfig } = require('./src/config');

const cfg = (() => {
  try {
    return getConfig();
  } catch (e) {
    // During swagger generation in environments without env vars, fall back.
    return { wsPath: '/ws' };
  }
})();

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Chess Mastery Platform API',
      version: '1.0.0',
      description:
        'Express API for chess matchmaking, real-time games, chat, profiles, and leaderboards.\n\nWebSocket usage:\n- Connect to WS at `WS_PATH` (default: `/ws`)\n- Then send `{ "type": "auth", "token": "<JWT>" }`\n- Join a game room with `{ "type": "join_game", "gameId": "<uuid>" }`\n- Server broadcasts moves and chat messages to that game room.\n',
    },
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);
swaggerSpec['x-ws'] = { path: cfg.wsPath };
module.exports = swaggerSpec;
