import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, recoverOrphanedAudits, saveDatabase, setBackupDbPath, startBackupScheduler } from './services/database.js';
import { initBrowser, closeBrowser } from './services/scraper.js';
import { createGeminiProvider } from './services/gemini.js';
import { initEmail } from './services/email.js';
import { securityHeaders, corsProtection, generalRateLimit } from './services/security.js';
import { createAuditRouter } from './routes/audit.js';
import { createAdminRouter } from './routes/admin.js';
import { createPreviewRouter } from './routes/preview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(corsProtection);
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Rate limit all API routes except admin and progress polling (GET /api/v1/audit/:id)
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/v1/admin/')) return next();
  if (req.method === 'GET' && /^\/v1\/audit\/[a-f0-9-]+$/.test(req.path)) return next();
  return generalRateLimit(req, res, next);
});

const PORT = process.env.PORT || 3000;
const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://scanandboost.weareboost.online').replace(/\/$/, '');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'croagent.db');

async function main() {
  // Init database + backup system
  await initDatabase(DB_PATH);
  setBackupDbPath(DB_PATH);
  startBackupScheduler();

  // Recover orphaned audits from previous crashes
  const recovered = recoverOrphanedAudits();
  if (recovered > 0) {
    console.log(`Recovered ${recovered} orphaned audit(s) → marked as failed`);
    saveDatabase(DB_PATH);
  }

  // Init LLM providers
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error('ERROR: GEMINI_API_KEY environment variable is required.');
    process.exit(1);
  }

  const geminiVision = createGeminiProvider(geminiKey);
  const geminiText = createGeminiProvider(process.env.GEMINI_API_KEY_2 || geminiKey);
  const geminiTranslate = createGeminiProvider(process.env.GEMINI_API_KEY_3 || geminiKey);
  const gemini = geminiVision;

  if (process.env.GEMINI_API_KEY_2) console.log('[LLM] 3-provider mode: vision + text + translate (parallel)');
  else console.log('[LLM] Single-provider mode');

  // Init email service
  initEmail();

  // Init browser
  console.log('Starting browser...');
  await initBrowser();
  console.log('Browser ready.');

  // ─── Mount routes ───

  app.use('/api/v1/audit', createAuditRouter({
    gemini, geminiVision, geminiText, geminiTranslate, dbPath: DB_PATH, siteOrigin: SITE_ORIGIN,
  }));

  app.use('/api/v1/admin', createAdminRouter({
    gemini, geminiVision, geminiText, geminiTranslate, dbPath: DB_PATH,
  }));

  // Admin dashboard page
  app.get('/admin', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
  });

  // /analytics redirect
  app.get('/analytics', (_req, res) => {
    res.redirect('/admin');
  });

  // Health check
  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  app.use('/preview', createPreviewRouter({ gemini }));

  // Start server
  app.listen(PORT, () => {
    console.log(`\n🚀 Scan&Boost running at http://localhost:${PORT}\n`);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await closeBrowser();
    process.exit(0);
  });

  // Prevent process crashes from uncaught errors
  process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception (process kept alive):', err.message);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection (process kept alive):', reason);
  });
}

main().catch(console.error);
