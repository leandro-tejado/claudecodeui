// @ts-nocheck -- JWT request augmentation is narrowed by Auth route contracts.
import jwt from 'jsonwebtoken';

import { IS_PLATFORM } from '@/shared/utils.js';

import { userDb, appConfigDb } from '../database/index.js';

// Use env var if set, otherwise auto-generate a unique secret per installation
const JWT_SECRET = process.env.JWT_SECRET || appConfigDb.getOrCreateJwtSecret();

// Session lifetime. Configurable because a self-hosted instance reachable only
// from a private network can afford a longer session than the shared default.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Optional API key middleware
const validateApiKey = (req, res, next) => {
  // Skip API key validation if not configured
  if (!process.env.API_KEY) {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};

// JWT authentication middleware
const authenticateToken = async (req, res, next) => {
  // Platform mode:  use single database user
  if (IS_PLATFORM) {
    try {
      const user = userDb.getFirstUser();
      if (!user) {
        return res.status(500).json({ error: 'Platform mode: No user found in database' });
      }
      req.user = user;
      return next();
    } catch (error) {
      console.error('Platform mode error:', error);
      return res.status(500).json({ error: 'Platform mode: Failed to fetch user' });
    }
  }

  // Normal OSS JWT validation
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  // Also check query param for SSE endpoints (EventSource can't set headers)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  // No `X-Auth-Error` here on purpose: a request that carries no token at all
  // says nothing about the stored session. A request fired before the client
  // hydrates its token would otherwise wipe a perfectly valid session.
  if (!token) {
    console.warn(`AUTH_TOKEN_MISSING on ${req.method} ${req.path}`);
    return res.status(401).json({
      error: 'Access denied. No token provided.',
      code: 'AUTH_TOKEN_MISSING',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify user still exists and is active. The lookup gets its own catch so
    // a transient storage failure cannot reach the outer handler below, which
    // would report it as an invalid token and make the client discard a session
    // that was never wrong.
    let user;
    try {
      user = userDb.getUserById(decoded.userId);
    } catch (lookupError) {
      console.error(
        `AUTH_BACKEND_UNAVAILABLE on ${req.method} ${req.path}:`,
        lookupError instanceof Error ? lookupError.message : String(lookupError),
      );
      return res.status(503).json({
        error: 'Authentication backend unavailable. Please retry.',
        code: 'AUTH_BACKEND_UNAVAILABLE',
      });
    }

    if (!user) {
      console.warn(`AUTH_TOKEN_INVALID (user not found) on ${req.method} ${req.path}`);
      res.setHeader('X-Auth-Error', 'invalid-token');
      return res.status(401).json({
        error: 'Invalid token. User not found.',
        code: 'AUTH_TOKEN_INVALID',
      });
    }

    // Auto-refresh: if token is past halfway through its lifetime, issue a new one
    if (decoded.exp && decoded.iat) {
      const now = Math.floor(Date.now() / 1000);
      const halfLife = (decoded.exp - decoded.iat) / 2;
      if (now > decoded.iat + halfLife) {
        const newToken = generateToken(user);
        res.setHeader('X-Refreshed-Token', newToken);
      }
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.warn(`AUTH_TOKEN_EXPIRED on ${req.method} ${req.path}`);
      res.setHeader('X-Auth-Error', 'session-expired');
      return res.status(401).json({
        error: 'Session expired. Please log in again.',
        code: 'AUTH_TOKEN_EXPIRED',
      });
    }

    console.warn(
      `AUTH_TOKEN_INVALID on ${req.method} ${req.path} — token verification failed:`,
      error instanceof Error ? error.message : String(error),
    );
    res.setHeader('X-Auth-Error', 'invalid-token');
    return res.status(401).json({
      error: 'Invalid token',
      code: 'AUTH_TOKEN_INVALID',
    });
  }
};

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// WebSocket authentication function
const authenticateWebSocket = (token) => {
  // Platform mode: bypass token validation, return first user
  if (IS_PLATFORM) {
    try {
      const user = userDb.getFirstUser();
      if (user) {
        return { id: user.id, userId: user.id, username: user.username };
      }
      return null;
    } catch (error) {
      console.error('Platform mode WebSocket error:', error);
      return null;
    }
  }

  // Normal OSS JWT validation
  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Verify user actually exists in database (matches REST authenticateToken behavior)
    const user = userDb.getUserById(decoded.userId);
    if (!user) {
      return null;
    }
    return { userId: user.id, username: user.username };
  } catch (error) {
    if (!(error instanceof jwt.TokenExpiredError)) {
      console.warn(
        'WebSocket token verification failed:',
        error instanceof Error ? error.message : String(error),
      );
    }
    return null;
  }
};

export {
  validateApiKey,
  authenticateToken,
  generateToken,
  authenticateWebSocket,
  JWT_SECRET
};
