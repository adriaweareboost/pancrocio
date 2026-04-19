import { Router } from 'express';
import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import type { LLMProvider } from '../models/interfaces.js';
import { normalizeUrl, isValidUrl, isValidEmail } from '../utils/normalize-url.js';
import { normalizeLangCode } from '../agents/translator.js';
import { auditRateLimit, honeypotCheck, sendCodeRateLimit, verifyRateLimit, hashEmail, acquireAuditSlot, releaseAuditSlot, isPrivateUrl } from '../services/security.js';
import { createLead, createAudit, updateAuditStatus, getAudit, saveDatabase, setVerifyCode, verifyEmailCode, isEmailVerified, getLeadEmail, getStoredPdf, storePdf, countRecentAuditsByEmail, getRecentAuditByUrl, linkLeadToAudit, deleteAuditByUrl, logError, findExistingLead, resetLeadVerification } from '../services/database.js';
import { sendVerifyCodeEmail, sendReportEmail, sendLeadNotification } from '../services/email.js';
import { generateReportPdf, pdfFilename } from '../services/pdf.js';
import { shouldTranslate } from '../agents/translator.js';
import { runAudit, auditProgress, cleanupProgress } from '../services/audit-runner.js';
import { renderLocalizedReport, cleanupReportCache } from '../services/report-cache.js';
import { buildVerifyPage } from '../services/landing.js';

export interface AuditRouterDeps {
  gemini: LLMProvider;
  geminiVision: LLMProvider;
  geminiText: LLMProvider;
  geminiTranslate: LLMProvider;
  dbPath: string;
  siteOrigin: string;
}

export function createAuditRouter(deps: AuditRouterDeps): Router {
  const router = Router();
  const { gemini, geminiVision, geminiText, geminiTranslate, dbPath, siteOrigin } = deps;

  // Submit audit (rate limited: 5/hour/IP, honeypot protected)
  router.post('/', auditRateLimit, honeypotCheck, async (req, res) => {
    const { email, url, lang: requestLang } = req.body;
    const auditLang = normalizeLangCode(requestLang || 'es');

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required', code: 'INVALID_EMAIL' });
    }
    if (!url || !isValidUrl(url)) {
      return res.status(400).json({ error: 'Valid URL (http/https) is required', code: 'INVALID_URL' });
    }

    // SSRF protection
    if (await isPrivateUrl(url)) {
      return res.status(400).json({ error: 'URL must be a public website', code: 'INVALID_URL' });
    }

    // Concurrency limit
    if (!acquireAuditSlot()) {
      return res.status(503).json({ error: 'Server busy. Please try again in a minute.', code: 'SERVER_BUSY' });
    }

    const normalized = normalizeUrl(url);

    // Rate limit: max 5 audits per email per week (whitelisted emails bypass)
    const whitelistEmails = (process.env.WHITELIST_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    if (!whitelistEmails.includes(email.toLowerCase())) {
      const recentCount = countRecentAuditsByEmail(email);
      if (recentCount >= 5) {
        return res.status(429).json({
          error: 'Has alcanzado el limite de 5 auditorias por semana.',
          code: 'EMAIL_RATE_LIMIT',
        });
      }
    }

    // Cache: reuse audit if this URL was analyzed in the last 7 days
    const cachedAudit = getRecentAuditByUrl(normalized);
    if (cachedAudit) {
      releaseAuditSlot();

      const existingLead = findExistingLead(email, normalized);
      const cachedCode = String(crypto.randomInt(100000, 999999));

      if (existingLead) {
        resetLeadVerification(existingLead.id);
        setVerifyCode(existingLead.id, cachedCode);
        saveDatabase(dbPath);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Cache] Existing lead for ${email} + ${url} — code: ${cachedCode}`);
        } else {
          console.log(`[Cache] Existing lead for ${hashEmail(email)} + ${url}`);
        }
      } else {
        const cachedLeadId = uuid();
        createLead(cachedLeadId, email, url);
        linkLeadToAudit(cachedLeadId, cachedAudit.id as string);
        setVerifyCode(cachedLeadId, cachedCode);
        saveDatabase(dbPath);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Cache] New lead for ${email} + ${url} — code: ${cachedCode}`);
        } else {
          console.log(`[Cache] New lead for ${hashEmail(email)} + ${url}`);
        }
        sendLeadNotification(email, url, auditLang, cachedAudit.global_score as number, cachedAudit.id as string).catch(() => {});
      }

      sendVerifyCodeEmail(email, cachedCode, auditLang).catch(() => {});

      return res.status(201).json({
        auditId: cachedAudit.id,
        status: 'completed',
        message: 'Report ready (cached).',
        cached: true,
      });
    }

    // No cache — remove stale audit and run fresh
    deleteAuditByUrl(normalized);

    const leadId = uuid();
    const auditId = uuid();
    const verifyCode = String(crypto.randomInt(100000, 999999));

    createLead(leadId, email, url);
    createAudit(auditId, leadId, url, normalized);
    setVerifyCode(leadId, verifyCode);
    saveDatabase(dbPath);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Verify] Audit ${auditId} — email: ${email} — code: ${verifyCode} (will send after audit completes)`);
    } else {
      console.log(`[Verify] Audit ${auditId} — email: ${hashEmail(email)} — code queued for post-audit`);
    }

    cleanupProgress();
    cleanupReportCache();
    auditProgress.set(auditId, { status: 'pending', messages: ['Audit queued'], createdAt: Date.now() });

    res.status(201).json({
      auditId,
      status: 'pending',
      message: 'Audit started. This may take 1-3 minutes.',
    });

    // Run audit in background
    runAudit(auditId, url, email, verifyCode, gemini, auditLang, { vision: geminiVision, text: geminiText, mockups: geminiTranslate }, dbPath)
      .catch((err) => {
        console.error(`Audit ${auditId} failed:`, err);
        logError(auditId, 'audit_global', err, url);
        updateAuditStatus(auditId, 'failed');
        saveDatabase(dbPath);
        auditProgress.set(auditId, {
          status: 'failed',
          messages: [...(auditProgress.get(auditId)?.messages || []), `Error: ${err.message}`],
          createdAt: auditProgress.get(auditId)?.createdAt || Date.now(),
        });
      })
      .finally(() => releaseAuditSlot());
  });

  // Check audit status
  router.get('/:id', (req, res) => {
    if (!/^[a-f0-9-]{36}$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid audit ID' });
    const audit = getAudit(req.params.id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found', code: 'NOT_FOUND' });
    }

    const progress = auditProgress.get(req.params.id);
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
  router.post('/:id/send-code', sendCodeRateLimit, (req, res) => {
    const id = req.params.id as string;
    if (!/^[a-f0-9-]{36}$/.test(id)) return res.status(400).json({ error: 'Invalid audit ID' });
    const audit = getAudit(id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found', code: 'NOT_FOUND' });
    }
    const email = getLeadEmail(id);
    const newCode = String(crypto.randomInt(100000, 999999));
    const leadId = audit.lead_id as string;
    setVerifyCode(leadId, newCode);
    saveDatabase(dbPath);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Verify] Re-sent code for ${id} — email: ${email} — code: ${newCode}`);
    } else {
      console.log(`[Verify] Re-sent code for ${id} — ${email ? hashEmail(email) : 'unknown'}`);
    }
    const auditLang = normalizeLangCode((req.body?.lang as string) || 'es');
    if (email) sendVerifyCodeEmail(email, newCode, auditLang).catch(() => {});
    res.json({ ok: true, message: 'Verification code sent to your email' });
  });

  // Verify email code
  router.post('/:id/verify', verifyRateLimit, (req, res) => {
    const id = req.params.id as string;
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Code is required', code: 'MISSING_CODE' });
    }
    const success = verifyEmailCode(id, String(code));
    if (!success) {
      return res.status(403).json({ error: 'Invalid verification code', code: 'INVALID_CODE' });
    }
    saveDatabase(dbPath);
    res.json({ ok: true, verified: true });

    // Fire-and-forget: send the report email if audit is already completed.
    const auditId = id;
    (async () => {
      const audit = getAudit(auditId);
      if (!audit || audit.status !== 'completed') return;
      const email = getLeadEmail(auditId);
      if (!email) return;
      const lang = 'es';
      const reportUrl = `${siteOrigin}/api/v1/audit/${auditId}/report`;
      let pdfBuf: Buffer | undefined;
      let pdfName: string | undefined;
      try {
        pdfBuf = getStoredPdf(auditId, lang) || undefined;
        if (!pdfBuf) {
          const html = audit.report_html as string;
          pdfBuf = await generateReportPdf(html);
          storePdf(auditId, lang, pdfBuf);
          saveDatabase(dbPath);
        }
        pdfName = pdfFilename(audit.url as string, lang);
      } catch (err) {
        console.warn(`[Email] PDF generation failed for report email:`, (err as Error).message);
      }
      await sendReportEmail(email, audit.url as string, audit.global_score as number, reportUrl, lang, pdfBuf, pdfName);
      await sendLeadNotification(email, audit.url as string, lang, audit.global_score as number, auditId);
    })().catch(err => console.error('[Email] Report email failed:', err));
  });

  // Check verification status
  router.get('/:id/verified', (req, res) => {
    res.json({ verified: isEmailVerified(req.params.id) });
  });

  // Get report
  router.get('/:id/report', async (req, res) => {
    const audit = getAudit(req.params.id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found', code: 'NOT_FOUND' });
    }
    if (audit.status !== 'completed') {
      return res.status(202).json({ error: 'Audit still in progress', code: 'AUDIT_IN_PROGRESS', status: audit.status });
    }

    const reportLang = (req.query.lang as string) || 'es';
    const verified = isEmailVerified(req.params.id);

    if (verified) {
      try {
        console.log(`[Report] Serving audit ${req.params.id} in lang=${reportLang} (shouldTranslate=${shouldTranslate(reportLang)})`);
        const html = await renderLocalizedReport(audit, reportLang, geminiTranslate, dbPath);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      } catch (err) {
        console.error(`[Report] Translation failed for lang=${reportLang}:`, (err as Error).message);
        res.setHeader('Content-Type', 'text/html');
        res.send(audit.report_html as string);
      }
    } else {
      const auditId = req.params.id;
      const verifyPageHtml = buildVerifyPage(auditId, audit.url as string, audit.global_score as number, reportLang);
      res.setHeader('Content-Type', 'text/html');
      res.send(verifyPageHtml);
    }
  });

  // Download report as PDF
  router.get('/:id/pdf', async (req, res) => {
    const audit = getAudit(req.params.id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found', code: 'NOT_FOUND' });
    }
    if (audit.status !== 'completed') {
      return res.status(202).json({ error: 'Audit still in progress', code: 'AUDIT_IN_PROGRESS', status: audit.status });
    }
    if (!isEmailVerified(req.params.id)) {
      return res.status(403).json({ error: 'Email verification required', code: 'EMAIL_NOT_VERIFIED' });
    }

    const lang = (req.query.lang as string) || 'es';
    const normalizedLang = normalizeLangCode(lang);
    const filename = pdfFilename(audit.url as string, normalizedLang);

    const cached = getStoredPdf(req.params.id, normalizedLang);
    if (cached) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', cached.length);
      return res.send(cached);
    }

    try {
      const html = await renderLocalizedReport(audit, lang, gemini, dbPath);
      const pdf = await generateReportPdf(html);
      storePdf(req.params.id, normalizedLang, pdf);
      saveDatabase(dbPath);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdf.length);
      res.send(pdf);
    } catch (err) {
      console.error(`[PDF] Generation failed for audit ${req.params.id}/${normalizedLang}:`, err);
      res.status(500).json({ error: 'Failed to generate PDF', code: 'PDF_GENERATION_ERROR' });
    }
  });

  return router;
}
