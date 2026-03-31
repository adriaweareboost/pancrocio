import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';
import { initDatabase, createLead, createAudit, updateAuditStatus, completeAudit, getAudit, saveDatabase, recoverOrphanedAudits, deleteAuditByUrl, setVerifyCode, verifyEmailCode, isEmailVerified, getLeadEmail } from './services/database.js';
import { scrapeUrl, initBrowser, closeBrowser } from './services/scraper.js';
import { createGeminiProvider } from './services/gemini.js';
import { createGroqProvider } from './services/groq.js';
import { runPipeline } from './services/pipeline.js';
import { generateReportHtml } from './services/report-generator.js';
import { normalizeUrl, isValidUrl, isValidEmail } from './utils/normalize-url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'croagent.db');

// In-memory audit status tracking (auto-cleanup after 30 min)
const PROGRESS_TTL_MS = 30 * 60 * 1000;
const auditProgress = new Map<string, { status: string; messages: string[]; createdAt: number }>();

function cleanupProgress(): void {
  const now = Date.now();
  for (const [id, entry] of auditProgress) {
    if (now - entry.createdAt > PROGRESS_TTL_MS) auditProgress.delete(id);
  }
}

async function main() {
  // Init database
  await initDatabase(DB_PATH);

  // Recover orphaned audits from previous crashes
  const recovered = recoverOrphanedAudits();
  if (recovered > 0) {
    console.log(`Recovered ${recovered} orphaned audit(s) → marked as failed`);
    saveDatabase(DB_PATH);
  }

  // Init LLM providers
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (!geminiKey || !groqKey) {
    console.error('ERROR: GEMINI_API_KEY and GROQ_API_KEY environment variables are required.');
    console.error('Copy .env.example to .env and fill in your API keys.');
    process.exit(1);
  }

  const gemini = createGeminiProvider(geminiKey);
  const groq = createGroqProvider(groqKey);

  // Init browser
  console.log('Starting browser...');
  await initBrowser();
  console.log('Browser ready.');

  // ─── API Routes ───

  // Submit audit
  app.post('/api/v1/audit', async (req, res) => {
    const { email, url } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required', code: 'INVALID_EMAIL' });
    }
    if (!url || !isValidUrl(url)) {
      return res.status(400).json({ error: 'Valid URL (http/https) is required', code: 'INVALID_URL' });
    }

    const normalized = normalizeUrl(url);

    // Remove previous audit for this URL if it exists (allows re-audit)
    deleteAuditByUrl(normalized);

    const leadId = uuid();
    const auditId = uuid();

    // Generate 6-digit verification code
    const verifyCode = String(crypto.randomInt(100000, 999999));

    createLead(leadId, email, url);
    createAudit(auditId, leadId, url, normalized);
    setVerifyCode(leadId, verifyCode);
    saveDatabase(DB_PATH);

    // Log code (in production this would be sent via email)
    console.log(`[Verify] Audit ${auditId} — email: ${email} — code: ${verifyCode}`);

    cleanupProgress();
    auditProgress.set(auditId, { status: 'pending', messages: ['Audit queued'], createdAt: Date.now() });

    res.status(201).json({
      auditId,
      status: 'pending',
      message: 'Audit started. This may take 1-3 minutes.',
    });

    // Run audit in background
    runAudit(auditId, url, gemini, groq).catch((err) => {
      console.error(`Audit ${auditId} failed:`, err);
      updateAuditStatus(auditId, 'failed');
      saveDatabase(DB_PATH);
      auditProgress.set(auditId, {
        status: 'failed',
        messages: [...(auditProgress.get(auditId)?.messages || []), `Error: ${err.message}`],
        createdAt: auditProgress.get(auditId)?.createdAt || Date.now(),
      });
    });
  });

  // Check audit status
  app.get('/api/v1/audit/:id', (req, res) => {
    const audit = getAudit(req.params.id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found', code: 'NOT_FOUND' });
    }

    const progress = auditProgress.get(req.params.id);
    // Filter out raw error messages from user-facing output
    const safeMessages = (progress?.messages || []).map(m => {
      if (m.includes('googleapis.com') || m.includes('Quota exceeded') || m.includes('RESOURCE_EXHAUSTED')) {
        return 'Waiting for AI service availability... (retrying automatically)';
      }
      return m;
    });
    res.json({
      auditId: audit.id,
      status: audit.status,
      messages: safeMessages,
    });
  });

  // Send verification code (re-send)
  app.post('/api/v1/audit/:id/send-code', (req, res) => {
    const audit = getAudit(req.params.id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found', code: 'NOT_FOUND' });
    }
    const email = getLeadEmail(req.params.id);
    // Generate new code
    const newCode = String(crypto.randomInt(100000, 999999));
    const leadResult = getAudit(req.params.id);
    if (leadResult) {
      const leadId = leadResult.lead_id as string;
      setVerifyCode(leadId, newCode);
      saveDatabase(DB_PATH);
      console.log(`[Verify] Re-sent code for ${req.params.id} — email: ${email} — code: ${newCode}`);
    }
    res.json({ ok: true, message: 'Verification code sent to your email' });
  });

  // Verify email code
  app.post('/api/v1/audit/:id/verify', (req, res) => {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Code is required', code: 'MISSING_CODE' });
    }
    const success = verifyEmailCode(req.params.id, String(code));
    if (!success) {
      return res.status(403).json({ error: 'Invalid verification code', code: 'INVALID_CODE' });
    }
    saveDatabase(DB_PATH);
    res.json({ ok: true, verified: true });
  });

  // Check verification status
  app.get('/api/v1/audit/:id/verified', (req, res) => {
    res.json({ verified: isEmailVerified(req.params.id) });
  });

  // Get report
  app.get('/api/v1/audit/:id/report', (req, res) => {
    const audit = getAudit(req.params.id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found', code: 'NOT_FOUND' });
    }
    if (audit.status !== 'completed') {
      return res.status(202).json({ error: 'Audit still in progress', code: 'AUDIT_IN_PROGRESS', status: audit.status });
    }

    const verified = isEmailVerified(req.params.id);
    const reportHtml = audit.report_html as string;

    if (verified) {
      res.setHeader('Content-Type', 'text/html');
      res.send(reportHtml);
    } else {
      // Inject sticky verify bar into the report
      const verifyWidget = `
        <style>
          .report-blur-gate > *:not(.verify-sticky) {
            filter: blur(5px); -webkit-filter: blur(5px);
            pointer-events: none; user-select: none;
          }
          .verify-sticky {
            position: sticky; top: 0; z-index: 9999;
            background: #070F2D; padding: 16px 20px;
            box-shadow: 0 4px 24px rgba(7,15,45,0.3);
            font-family: 'Open Sans', -apple-system, sans-serif;
          }
          .verify-inner {
            max-width: 600px; margin: 0 auto;
            display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
            justify-content: center;
          }
          .verify-text {
            color: white; flex: 1; min-width: 200px;
          }
          .verify-text h3 {
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 16px; font-weight: 800; margin: 0 0 2px;
          }
          .verify-text p { font-size: 12px; opacity: 0.7; margin: 0; }
          .verify-form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
          .verify-form input {
            width: 140px; padding: 10px 12px; border: 2px solid rgba(255,255,255,0.2);
            border-radius: 10px; font-size: 18px; text-align: center;
            letter-spacing: 6px; font-weight: 700; color: white;
            background: rgba(255,255,255,0.1); outline: none;
            font-family: 'Plus Jakarta Sans', monospace;
          }
          .verify-form input:focus { border-color: #EC5F29; background: rgba(255,255,255,0.15); }
          .verify-form input::placeholder { color: rgba(255,255,255,0.3); }
          .verify-form button {
            padding: 10px 20px; border: none; border-radius: 100px;
            background: linear-gradient(90deg, #dd974b, #db501a); color: white;
            font-weight: 700; font-size: 13px; cursor: pointer; white-space: nowrap;
            font-family: 'Plus Jakarta Sans', sans-serif;
          }
          .verify-form button:hover { opacity: 0.9; }
          .verify-form button:disabled { opacity: 0.5; cursor: not-allowed; }
          .verify-error { color: #fca5a5; font-size: 12px; display: none; text-align: center; width: 100%; margin-top: 4px; }
          .verify-resend { color: rgba(255,255,255,0.5); font-size: 11px; text-align: center; width: 100%; margin-top: 6px; }
          .verify-resend a { color: #EC5F29; cursor: pointer; text-decoration: underline; }
          @media (max-width: 500px) {
            .verify-inner { flex-direction: column; text-align: center; }
            .verify-text { min-width: auto; }
            .verify-form { justify-content: center; width: 100%; }
            .verify-form input { width: 120px; }
          }
        </style>
        <div class="verify-sticky" id="verifySticky">
          <div class="verify-inner">
            <div class="verify-text">
              <h3>\u{1F512} Verifica tu email</h3>
              <p>Introduce el codigo de 6 digitos enviado a tu email</p>
            </div>
            <div class="verify-form">
              <input type="text" id="verifyInput" maxlength="6" placeholder="------" autocomplete="off" inputmode="numeric">
              <button onclick="verifyCode()" id="verifyBtn">Desbloquear</button>
            </div>
            <div class="verify-error" id="verifyError">Codigo incorrecto</div>
            <div class="verify-resend">No lo recibes? <a onclick="resendCode()">Reenviar</a></div>
          </div>
        </div>
        <script>
          var auditId = window.location.pathname.split('/')[4];
          function verifyCode() {
            var code = document.getElementById('verifyInput').value.trim();
            if (code.length !== 6) return;
            var btn = document.getElementById('verifyBtn');
            btn.disabled = true; btn.textContent = 'Verificando...';
            fetch('/api/v1/audit/' + auditId + '/verify', {
              method: 'POST', headers: {'Content-Type':'application/json'},
              body: JSON.stringify({code: code})
            }).then(function(r) { return r.json(); }).then(function(d) {
              if (d.verified) { location.reload(); }
              else {
                document.getElementById('verifyError').style.display = 'block';
                btn.disabled = false; btn.textContent = 'Desbloquear';
              }
            }).catch(function() {
              btn.disabled = false; btn.textContent = 'Desbloquear';
            });
          }
          function resendCode() {
            fetch('/api/v1/audit/' + auditId + '/send-code', {method:'POST'});
            var el = document.querySelector('.verify-resend');
            el.innerHTML = 'Codigo reenviado!';
            setTimeout(function() { el.innerHTML = 'No lo recibes? <a onclick="resendCode()">Reenviar</a>'; }, 3000);
          }
          document.getElementById('verifyInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') verifyCode();
          });
        </script>`;

      // Inject sticky bar right after <body> and wrap content in blur gate
      const withGate = reportHtml
        .replace('<body>', '<body><div class="report-blur-gate">' + verifyWidget)
        .replace('</body>', '</div></body>');

      res.setHeader('Content-Type', 'text/html');
      res.send(withGate);
    }
  });

  // Health check
  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`\n🚀 PanCROcio running at http://localhost:${PORT}\n`);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await closeBrowser();
    process.exit(0);
  });
}

async function runAudit(
  auditId: string,
  url: string,
  gemini: ReturnType<typeof createGeminiProvider>,
  groq: ReturnType<typeof createGroqProvider>,
) {
  const progress = auditProgress.get(auditId)!;
  const addMessage = (msg: string) => {
    progress.messages.push(msg);
    progress.status = msg;
  };

  // Step 1: Scrape
  addMessage('Scraping website...');
  updateAuditStatus(auditId, 'scraping');
  saveDatabase(DB_PATH);
  const scrapingResult = await scrapeUrl(url);
  addMessage(`Scraped: ${(Buffer.byteLength(scrapingResult.html) / 1024).toFixed(0)}KB HTML, screenshots captured`);

  // Step 2: Analyze
  addMessage('Running CRO analysis agents...');
  updateAuditStatus(auditId, 'analyzing');
  saveDatabase(DB_PATH);

  const pipelineResult = await runPipeline(scrapingResult, url, gemini, groq, addMessage);

  // Step 3: Generate report
  addMessage('Generating report...');
  updateAuditStatus(auditId, 'generating_report');
  saveDatabase(DB_PATH);

  const reportHtml = generateReportHtml({
    url,
    globalScore: pipelineResult.globalScore,
    scores: pipelineResult.scores,
    quickWins: pipelineResult.quickWins,
    mockups: pipelineResult.mockups,
    analyses: pipelineResult.analyses,
    date: new Date().toISOString().split('T')[0],
  });

  // Step 4: Save
  completeAudit(
    auditId,
    pipelineResult.globalScore,
    JSON.stringify(pipelineResult.scores),
    JSON.stringify(pipelineResult.quickWins),
    JSON.stringify(pipelineResult.mockups),
    reportHtml,
  );
  saveDatabase(DB_PATH);

  addMessage('Audit complete!');
  progress.status = 'completed';
}

main().catch(console.error);
