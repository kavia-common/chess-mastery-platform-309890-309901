const WebSocket = require('ws');
const { verifyJwt } = require('../auth/auth');

/**
 * Message envelope:
 * { type: 'auth'|'join_game'|'leave_game'|'chat'|'move'|'ping', ... }
 *
 * Server events:
 * - matchmaking: { type:'match_found', gameId, color }
 * - game: { type:'move', gameId, san, fenAfter, moveNumber }
 * - chat: { type:'chat', gameId, message: { id, senderUserId, messageText, createdAt } }
 */

// In-memory connection index
const clientsByUserId = new Map(); // userId -> Set(ws)
const gameRooms = new Map(); // gameId -> Set(ws)

// PUBLIC_INTERFACE
function createWebSocketServer(httpServer, { path }) {
  /** Creates ws server bound to the existing HTTP server. */
  const wss = new WebSocket.Server({ server: httpServer, path });

  wss.on('connection', (ws) => {
    ws.isAuthed = false;
    ws.userId = null;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(ws, msg);
      } catch (err) {
        safeSend(ws, { type: 'error', message: 'Invalid JSON message' });
      }
    });

    ws.on('close', () => {
      cleanupClient(ws);
    });

    safeSend(ws, { type: 'hello', message: 'ws connected; send {type:"auth", token:"..."}' });
  });

  return wss;
}

function safeSend(ws, obj) {
  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  } catch (e) {
    // ignore
  }
}

function registerClient(ws, userId) {
  ws.isAuthed = true;
  ws.userId = userId;
  if (!clientsByUserId.has(userId)) clientsByUserId.set(userId, new Set());
  clientsByUserId.get(userId).add(ws);
}

function cleanupClient(ws) {
  if (ws.userId && clientsByUserId.has(ws.userId)) {
    const set = clientsByUserId.get(ws.userId);
    set.delete(ws);
    if (set.size === 0) clientsByUserId.delete(ws.userId);
  }
  if (ws.joinedGames) {
    for (const gameId of ws.joinedGames) {
      leaveGameRoom(ws, gameId);
    }
  }
}

function joinGameRoom(ws, gameId) {
  if (!ws.joinedGames) ws.joinedGames = new Set();
  ws.joinedGames.add(gameId);
  if (!gameRooms.has(gameId)) gameRooms.set(gameId, new Set());
  gameRooms.get(gameId).add(ws);
}

function leaveGameRoom(ws, gameId) {
  if (ws.joinedGames) ws.joinedGames.delete(gameId);
  const room = gameRooms.get(gameId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) gameRooms.delete(gameId);
  }
}

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'auth': {
      if (!msg.token) return safeSend(ws, { type: 'error', message: 'Missing token' });
      try {
        const decoded = verifyJwt(msg.token);
        registerClient(ws, decoded.userId);
        return safeSend(ws, { type: 'auth_ok', userId: decoded.userId });
      } catch (e) {
        return safeSend(ws, { type: 'error', message: 'Invalid token' });
      }
    }
    case 'join_game': {
      if (!ws.isAuthed) return safeSend(ws, { type: 'error', message: 'Not authenticated' });
      if (!msg.gameId) return safeSend(ws, { type: 'error', message: 'Missing gameId' });
      joinGameRoom(ws, msg.gameId);
      return safeSend(ws, { type: 'joined_game', gameId: msg.gameId });
    }
    case 'leave_game': {
      if (!ws.isAuthed) return safeSend(ws, { type: 'error', message: 'Not authenticated' });
      if (!msg.gameId) return safeSend(ws, { type: 'error', message: 'Missing gameId' });
      leaveGameRoom(ws, msg.gameId);
      return safeSend(ws, { type: 'left_game', gameId: msg.gameId });
    }
    case 'ping':
      return safeSend(ws, { type: 'pong', t: Date.now() });
    default:
      return safeSend(ws, { type: 'error', message: `Unknown type: ${msg.type}` });
  }
}

// PUBLIC_INTERFACE
function notifyUser(userId, payload) {
  /** Sends a payload to all connected ws clients for a given userId. */
  const set = clientsByUserId.get(userId);
  if (!set) return;
  for (const ws of set) safeSend(ws, payload);
}

// PUBLIC_INTERFACE
function broadcastToGame(gameId, payload) {
  /** Broadcast payload to all ws clients currently in a game room. */
  const room = gameRooms.get(gameId);
  if (!room) return;
  for (const ws of room) safeSend(ws, payload);
}

module.exports = { createWebSocketServer, notifyUser, broadcastToGame };
