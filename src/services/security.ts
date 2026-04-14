// Security middleware — rate limiting, honeypot, anti-scraping, SSRF protection.
// All protection runs in-memory (no external deps needed).

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { lookup } from 'dns/promises';

// ─── Rate limiter (per IP) ───

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_AUDITS_PER_IP = 10;           // 10 audits per hour per IP
const MAX_REQUESTS_PER_IP = 300;        // 300 requests per hour per IP (general)
const MAX_VERIFY_ATTEMPTS = 5;          // 5 verify attempts per audit per 15 min
const MAX_SEND_CODE_PER_AUDIT = 3;      // 3 resends per audit per hour
const MAX_CONCURRENT_AUDITS = 3;        // max simultaneous running audits

// Global concurrent audit limiter
let runningAudits = 0;

export function acquireAuditSlot(): boolean {
  if (runningAudits >= MAX_CONCURRENT_AUDITS) return false;
  runningAudits++;
  return true;
}

export function releaseAuditSlot(): void {
  runningAudits = Math.max(0, runningAudits - 1);
}

export function getRunningAudits(): number {
  return runningAudits;
}

function getClientIp(req: Request): string {
  // Trust only the LAST proxy hop (Railway's proxy), not user-supplied X-Forwarded-For
  const forwarded = req.headers['x-forwarded-for'] as string | undefined;
  if (forwarded) {
    const parts = forwarded.split(',').map(s => s.trim());
    // With trust proxy = 1, Express gives us the rightmost client IP
    // But we also use socket IP as a fallback fingerprint
    return parts[0] || req.socket.remoteAddress || 'unknown';
  }
  return req.socket.remoteAddress || 'unknown';
}

function checkRate(key: string, max: number, windowMs = RATE_WINDOW_MS): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(key, bucket);
  }
  bucket.count++;
  if (bucket.count > max) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, remaining: max - bucket.count, retryAfter: 0 };
}

/** Clear all rate limit buckets (used by admin reset endpoint). */
export function resetRateLimits(): number {
  const count = rateBuckets.size;
  rateBuckets.clear();
  return count;
}

// Cleanup stale buckets periodically + cap map size
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now >= bucket.resetAt) rateBuckets.delete(key);
  }
  // Evict oldest if map is too large (prevent memory exhaustion)
  if (rateBuckets.size > 10000) {
    const entries = [...rateBuckets.entries()];
    entries.sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (let i = 0; i < entries.length - 5000; i++) {
      rateBuckets.delete(entries[i][0]);
    }
  }
}, 5 * 60 * 1000);

/** Rate limit middleware for audit submissions. */
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

/** General rate limit for all API routes. */
export function generalRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const { allowed, retryAfter } = checkRate(`general:${ip}`, MAX_REQUESTS_PER_IP);
  if (!allowed) {
    res.status(429).json({ error: 'Too many requests.', code: 'RATE_LIMIT', retryAfter });
    return;
  }
  next();
}

/** Rate limit for verification attempts (per audit ID, 15 min window). */
export function verifyRateLimit(req: Request, res: Response, next: NextFunction): void {
  const auditId = req.params.id;
  const { allowed, retryAfter } = checkRate(`verify:${auditId}`, MAX_VERIFY_ATTEMPTS, 15 * 60 * 1000);
  if (!allowed) {
    res.status(429).json({
      error: 'Too many verification attempts. Try again later.',
      code: 'VERIFY_RATE_LIMIT',
      retryAfter,
    });
    return;
  }
  next();
}

/** Rate limit for code resend (per audit ID, 1 hour window). */
export function sendCodeRateLimit(req: Request, res: Response, next: NextFunction): void {
  const auditId = req.params.id;
  const { allowed, retryAfter } = checkRate(`sendcode:${auditId}`, MAX_SEND_CODE_PER_AUDIT);
  if (!allowed) {
    res.status(429).json({
      error: 'Too many resend attempts. Try again later.',
      code: 'SEND_CODE_RATE_LIMIT',
      retryAfter,
    });
    return;
  }
  next();
}

// ─── Honeypot field (anti-bot) ───

export function honeypotCheck(req: Request, res: Response, next: NextFunction): void {
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

export function hashEmail(email: string): string {
  return email.split('@')[0].slice(0, 3) + '***@' + email.split('@')[1];
}

// ─── Security headers ───

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'");
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

export function corsProtection(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

// ─── SSRF protection ───

const PRIVATE_IP_RANGES = [
  /^127\./,                          // loopback
  /^10\./,                           // class A private
  /^172\.(1[6-9]|2\d|3[01])\./,    // class B private
  /^192\.168\./,                     // class C private
  /^169\.254\./,                     // link-local
  /^0\./,                            // current network
  /^fc00:/i,                         // IPv6 unique local
  /^fd/i,                            // IPv6 unique local
  /^fe80:/i,                         // IPv6 link-local
  /^::1$/,                           // IPv6 loopback
];

const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0', 'metadata.google.internal']);

/** Check if a URL targets a private/internal network (SSRF protection). */
export async function isPrivateUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Block known dangerous hostnames
    if (BLOCKED_HOSTNAMES.has(hostname)) return true;

    // Check if the hostname is an IP address directly
    if (PRIVATE_IP_RANGES.some(re => re.test(hostname))) return true;

    // Resolve hostname to IP and check
    try {
      const { address } = await lookup(hostname);
      if (PRIVATE_IP_RANGES.some(re => re.test(address))) return true;
    } catch {
      // DNS resolution failed — allow (could be legitimate)
    }

    return false;
  } catch {
    return true; // Invalid URL = block
  }
}
