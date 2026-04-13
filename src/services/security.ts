// Security middleware — rate limiting, honeypot, anti-scraping.
// All protection runs in-memory (no external deps needed).

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// ─── Rate limiter (per IP) ───

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_AUDITS_PER_IP = 20;          // 20 audits per hour per IP
const MAX_REQUESTS_PER_IP = 300;       // 300 requests per hour per IP (general — includes polling during analysis)

function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'unknown';
}

function checkRate(key: string, max: number): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(key, bucket);
  }
  bucket.count++;
  if (bucket.count > max) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, remaining: max - bucket.count, retryAfter: 0 };
}

// Cleanup stale buckets periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now >= bucket.resetAt) rateBuckets.delete(key);
  }
}, 5 * 60 * 1000);

/** Rate limit middleware for audit submissions (strict: 5/hour/IP). */
export function auditRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const { allowed, remaining, retryAfter } = checkRate(`audit:${ip}`, MAX_AUDITS_PER_IP);
  res.setHeader('X-RateLimit-Limit', MAX_AUDITS_PER_IP);
  res.setHeader('X-RateLimit-Remaining', remaining);
  if (!allowed) {
    res.status(429).json({
      error: 'Too many audit requests. Please try again later.',
      code: 'RATE_LIMIT',
      retryAfter,
    });
    return;
  }
  next();
}

/** General rate limit for all API routes (60/hour/IP). */
export function generalRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const { allowed, retryAfter } = checkRate(`general:${ip}`, MAX_REQUESTS_PER_IP);
  if (!allowed) {
    res.status(429).json({ error: 'Too many requests.', code: 'RATE_LIMIT', retryAfter });
    return;
  }
  next();
}

// ─── Honeypot field (anti-bot) ───

/**
 * Checks for a honeypot field in the request body. Bots that fill in
 * hidden fields are silently rejected with a fake success response
 * (so they don't know they were caught).
 */
export function honeypotCheck(req: Request, res: Response, next: NextFunction): void {
  // If the hidden "website" or "company" field is filled, it's a bot
  const body = req.body || {};
  if (body.website || body.company_url || body.fax) {
    // Fake success to confuse bot
    res.status(201).json({
      auditId: crypto.randomUUID(),
      status: 'pending',
      message: 'Audit started.',
    });
    return;
  }
  next();
}

// ─── Email obfuscation ───

/**
 * Hash an email for logging purposes (never log raw emails in production).
 */
export function hashEmail(email: string): string {
  return email.split('@')[0].slice(0, 3) + '***@' + email.split('@')[1];
}

// ─── Security headers ───

/** Adds security headers to all responses. */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Prevent bots from caching API responses
  if (_req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  next();
}

// ─── CORS ───

const ALLOWED_ORIGINS = new Set([
  'https://pancrocio.weareboost.online',
  'https://pancrocio-production.up.railway.app',
  'https://www.weareboost.online',
  'https://weareboost.online',
]);

/** CORS middleware — only allows known origins for API routes. */
export function corsProtection(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}
