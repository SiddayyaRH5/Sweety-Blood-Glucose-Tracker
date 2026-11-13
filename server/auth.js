import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const BCRYPT_ROUNDS = 10;
const DEV_FALLBACK_SECRET = 'sweety-dev-only-jwt-secret-change-in-production';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret && secret !== 'change-this-to-a-long-random-secret') {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production environment.');
  }
  return DEV_FALLBACK_SECRET;
}

export async function hashPassword(plainText) {
  return bcrypt.hash(plainText, BCRYPT_ROUNDS);
}

export async function verifyPassword(plainText, passwordHash) {
  return bcrypt.compare(plainText, passwordHash);
}

export function signAuthToken(user) {
  const expiresIn = process.env.JWT_EXPIRES_IN?.trim() || '7d';
  return jwt.sign(
    {
      sub: user.id,
      name: user.name,
      email: user.email,
    },
    getJwtSecret(),
    { expiresIn }
  );
}

export function verifyAuthToken(token) {
  const decoded = jwt.verify(token, getJwtSecret());
  const sub = decoded?.sub;
  const email = typeof decoded?.email === 'string' ? decoded.email : '';
  const name = typeof decoded?.name === 'string' ? decoded.name : '';

  if (!sub || !email) {
    throw new Error('Invalid token payload.');
  }

  return {
    id: String(sub),
    name,
    email,
  };
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing Bearer token.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Empty Bearer token.' });
    return;
  }

  try {
    req.user = verifyAuthToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired authentication token.' });
  }
}
