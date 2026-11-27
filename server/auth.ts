import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, StoredUser } from './db';

const COOKIE_NAME = 'datainsight_session';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Stable fallback secret per process if SESSION_SECRET is not provided
const FALLBACK_SECRET = crypto
  .createHash('sha256')
  .update(
    `${process.env.GEMINI_API_KEY || ''}:${process.env.ADMIN_PASSWORD || ''}:datainsight-pro-session-v1`
  )
  .digest('hex');

function getSessionSecret(): string {
  return (process.env.SESSION_SECRET || FALLBACK_SECRET).trim();
}

interface SessionPayload {
  uid: string;
  exp: number;
}

export function createSessionToken(userId: string): string {
  const payload: SessionPayload = {
    uid: userId,
    exp: Date.now() + SESSION_MAX_AGE_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as SessionPayload;
    if (!parsed.uid || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    result[key] = decodeURIComponent(val);
  }
  return result;
}

export function setSessionCookie(res: Response, userId: string): void {
  const token = createSessionToken(userId);
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`,
  ];
  if (isProd) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isProd) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export interface AuthedRequest extends Request {
  user?: StoredUser;
}

export async function getRequestUser(req: Request): Promise<StoredUser | null> {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const user = await db.findUserById(payload.uid);
  if (!user || !user.isActive) return null;
  return user;
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      res.status(401).json({ error: 'Απαιτείται σύνδεση στον λογαριασμό σας.' });
      return;
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      res.status(401).json({ error: 'Απαιτείται σύνδεση.' });
      return;
    }
    if (user.role !== 'admin') {
      res.status(403).json({ error: 'Απαιτούνται δικαιώματα διαχειριστή.' });
      return;
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
