const express = require('express');
const { z } = require('zod');

const healthController = require('../controllers/health');
const authController = require('../controllers/auth');
const matchmakingController = require('../controllers/matchmaking');
const gamesController = require('../controllers/games');
const chatController = require('../controllers/chat');
const leaderboardsController = require('../controllers/leaderboards');
const historyController = require('../controllers/history');

const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../http/validate');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Health
 *   - name: Auth
 *   - name: Profile
 *   - name: Matchmaking
 *   - name: Games
 *   - name: Chat
 *   - name: Leaderboards
 *   - name: History
 */

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: error
 *         message:
 *           type: string
 *           example: Something went wrong
 *     AuthResponse:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *         user:
 *           type: object
 *           properties:
 *             id: { type: string, format: uuid }
 *             username: { type: string }
 *             email: { type: string }
 *             created_at: { type: string, format: date-time }
 *     Game:
 *       type: object
 *       properties:
 *         id: { type: string, format: uuid }
 *         white_user_id: { type: string, format: uuid }
 *         black_user_id: { type: string, format: uuid }
 *         status: { type: string, enum: [waiting, active, finished] }
 *         moves: { type: array, items: { type: string } }
 *         current_fen: { type: string }
 *         winner_user_id: { type: string, format: uuid, nullable: true }
 *         created_at: { type: string, format: date-time }
 *         updated_at: { type: string, format: date-time }
 */

//
// Health
//
/**
 * @swagger
 * /:
 *   get:
 *     summary: Health endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service health check passed
 */
router.get('/', healthController.check.bind(healthController));

/**
 * @swagger
 * /health/db:
 *   get:
 *     summary: Database connectivity check
 *     description: Runs a trivial `SELECT 1` query to validate POSTGRES_URL connectivity.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Database reachable
 *       503:
 *         description: Database unreachable
 */
router.get('/health/db', async (req, res) => {
  try {
    const { query } = require('../db/pool');
    const r = await query('SELECT 1 AS ok', []);
    return res.status(200).json({ status: 'ok', db: r.rows[0] });
  } catch (e) {
    return res.status(503).json({ status: 'error', message: 'Database unreachable' });
  }
});

//
// Auth
//
const registerSchema = z.object({
  username: z.string().min(3).max(32),
  email: z.string().email(),
  password: z.string().min(8).max(256),
});
/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username,email,password]
 *             properties:
 *               username: { type: string, example: alice }
 *               email: { type: string, example: alice@example.com }
 *               password: { type: string, example: "P@ssw0rd123" }
 *     responses:
 *       201:
 *         description: Registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 */
router.post('/auth/register', validateBody(registerSchema), authController.register.bind(authController));

const loginSchema = z.object({
  usernameOrEmail: z.string().min(1),
  password: z.string().min(1),
});
/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login and get JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [usernameOrEmail,password]
 *             properties:
 *               usernameOrEmail: { type: string, example: alice }
 *               password: { type: string, example: "P@ssw0rd123" }
 *     responses:
 *       200:
 *         description: Logged in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 */
router.post('/auth/login', validateBody(loginSchema), authController.login.bind(authController));

//
// Profile
//
/**
 * @swagger
 * /profile/me:
 *   get:
 *     summary: Get current user's profile
 *     tags: [Profile]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 */
router.get('/profile/me', requireAuth, authController.me.bind(authController));

const updateProfileSchema = z.object({
  username: z.string().min(3).max(32).optional(),
  email: z.string().email().optional(),
});
/**
 * @swagger
 * /profile/me:
 *   put:
 *     summary: Update current user's profile
 *     tags: [Profile]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: string }
 *               email: { type: string }
 *     responses:
 *       200:
 *         description: Updated profile
 */
router.put('/profile/me', requireAuth, validateBody(updateProfileSchema), authController.updateProfile.bind(authController));

//
// Matchmaking
//
/**
 * @swagger
 * /matchmaking/join:
 *   post:
 *     summary: Join matchmaking queue and attempt to match
 *     tags: [Matchmaking]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Joined queue
 */
router.post('/matchmaking/join', requireAuth, matchmakingController.join.bind(matchmakingController));

/**
 * @swagger
 * /matchmaking/leave:
 *   post:
 *     summary: Leave matchmaking queue
 *     tags: [Matchmaking]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Left queue
 */
router.post('/matchmaking/leave', requireAuth, matchmakingController.leave.bind(matchmakingController));

/**
 * @swagger
 * /matchmaking/status:
 *   get:
 *     summary: Get matchmaking queue status for current user
 *     tags: [Matchmaking]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Status
 */
router.get('/matchmaking/status', requireAuth, matchmakingController.status.bind(matchmakingController));

//
// Games
//
/**
 * @swagger
 * /games/{gameId}:
 *   get:
 *     summary: Fetch game state (FEN, moves, status)
 *     tags: [Games]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Game
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 game:
 *                   $ref: '#/components/schemas/Game'
 */
router.get('/games/:gameId', requireAuth, gamesController.getGame.bind(gamesController));

/**
 * @swagger
 * /games/{gameId}/moves:
 *   get:
 *     summary: Fetch a game's move list (for analysis)
 *     tags: [Games]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Moves
 */
router.get('/games/:gameId/moves', requireAuth, gamesController.getMoves.bind(gamesController));

const submitMoveSchema = z.object({
  san: z.string().min(1).max(32),
});
/**
 * @swagger
 * /games/{gameId}/move:
 *   post:
 *     summary: Submit a SAN move (validated and persisted); broadcasts over WebSocket
 *     tags: [Games]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [san]
 *             properties:
 *               san: { type: string, example: e4 }
 *     responses:
 *       200:
 *         description: Move accepted
 */
router.post('/games/:gameId/move', requireAuth, validateBody(submitMoveSchema), gamesController.submitMove.bind(gamesController));

/**
 * @swagger
 * /games/{gameId}/resign:
 *   post:
 *     summary: Resign the active game
 *     tags: [Games]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Game resigned
 */
router.post('/games/:gameId/resign', requireAuth, gamesController.resign.bind(gamesController));

/**
 * @swagger
 * /games/{gameId}/draw:
 *   post:
 *     summary: Mark the active game as draw (simple)
 *     tags: [Games]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Game drawn
 */
router.post('/games/:gameId/draw', requireAuth, gamesController.draw.bind(gamesController));

//
// Chat
//
const sendChatSchema = z.object({
  messageText: z.string().min(1).max(2000),
});
/**
 * @swagger
 * /games/{gameId}/chat:
 *   get:
 *     summary: List chat messages for a game
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Messages
 *   post:
 *     summary: Send a chat message (persisted + broadcast over WebSocket)
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messageText]
 *             properties:
 *               messageText: { type: string, example: gg! nice game }
 *     responses:
 *       201:
 *         description: Message created
 */
router.get('/games/:gameId/chat', requireAuth, chatController.list.bind(chatController));
router.post('/games/:gameId/chat', requireAuth, validateBody(sendChatSchema), chatController.send.bind(chatController));

//
// Leaderboards
//
/**
 * @swagger
 * /leaderboards/top:
 *   get:
 *     summary: Get top players by ELO (leaderboard view)
 *     tags: [Leaderboards]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: Leaderboard
 */
router.get('/leaderboards/top', leaderboardsController.top.bind(leaderboardsController));

/**
 * @swagger
 * /leaderboards/recent:
 *   get:
 *     summary: Get recent games by updated_at
 *     tags: [Leaderboards]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: Recent games
 */
router.get('/leaderboards/recent', leaderboardsController.recent.bind(leaderboardsController));

//
// History
//
/**
 * @swagger
 * /history/me:
 *   get:
 *     summary: List current user's games (history)
 *     tags: [History]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Games list
 */
router.get('/history/me', requireAuth, historyController.myGames.bind(historyController));

module.exports = router;
