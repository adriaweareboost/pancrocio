import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import type { LLMProvider } from '../models/interfaces.js';
import { normalizeUrl, isValidUrl, isValidEmail } from '../utils/normalize-url.js';
import { normalizeLangCode } from '../agents/translator.js';
import { acquireAuditSlot, releaseAuditSlot, resetRateLimits } from '../services/security.js';
import { getAllLeads, getLeadStats, purgeAllAudits, getAnalytics, getErrorLog, getErrorStats, deleteError, getTimingStats, saveDatabase, createBackup, listBackups, getBackupFile, exportDatabase, restoreFromBackup, createBatchLead, createAudit, linkLeadToAudit, getRecentAuditByUrl, deleteAuditByUrl, updateAuditStatus, logError, createEmailDraft, listEmailDrafts, getEmailDraft, updateEmailDraftStatus, deleteEmailDraft, getEmailDraftStats, createSequence, createSequenceStep, listSequences, getSequenceWithSteps, getDueSteps, updateStepStatus, markSequenceReplied, getSequenceStats } from '../services/database.js';
import { runAudit, auditProgress } from '../services/audit-runner.js';

export interface AdminRouterDeps {
  gemini: LLMProvider; geminiVision: LLMProvider; geminiText: LLMProvider; geminiTranslate: LLMProvider; dbPath: string;
}

export function createAdminRouter(deps: AdminRouterDeps): Router {
  const router = Router();
  const { gemini, geminiVision, geminiText, geminiTranslate, dbPath } = deps;

  router.use('/', (req, res, next) => {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || req.query.key !== adminKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  router.get('/emails', async (_req, res) => {
    const resendKey = process.env.RESEND_OUTBOUND_API_KEY || process.env.RESEND_API_KEY;
    if (!resendKey) return res.status(503).json({ error: 'RESEND_API_KEY not configured' });
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        headers: { 'Authorization': `Bearer ${resendKey}` }
      });
      const data = await resp.json() as { data?: Array<Record<string, unknown>> };
      const emails = (data.data || []) as Array<Record<string, unknown>>;
      const total = emails.length;
      const delivered = emails.filter((e: Record<string, unknown>) => e.last_event === 'delivered').length;
      const opened = emails.filter((e: Record<string, unknown>) => ['opened', 'clicked'].includes(e.last_event as string)).length;
      const clicked = emails.filter((e: Record<string, unknown>) => e.last_event === 'clicked').length;
      const bounced = emails.filter((e: Record<string, unknown>) => e.last_event === 'bounced').length;
      const openRate = total > 0 ? Math.round((opened / total) * 100) : 0;
      res.json({ emails, stats: { total, delivered, opened, clicked, bounced, openRate } });
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch from Resend', detail: (err as Error).message });
    }
  });

  router.get('/emails/:id', async (req, res) => {
    const resendKey = process.env.RESEND_OUTBOUND_API_KEY || process.env.RESEND_API_KEY;
    if (!resendKey) return res.status(503).json({ error: 'RESEND_API_KEY not configured' });
    try {
      const resp = await fetch(`https://api.resend.com/emails/${encodeURIComponent(req.params.id)}`, {
        headers: { 'Authorization': `Bearer ${resendKey}` }
      });
      const email = await resp.json();
      res.json({ email });
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch email', detail: (err as Error).message });
    }
  });

  const TOOLS_BASE = process.env.TOOLS_BASE_URL || 'https://boost-sales-tools-production.up.railway.app';
  const TOOLS_KEY = process.env.TOOLS_API_KEY || '';

  router.post('/campaigns/load-clickup', async (req, res) => {
    try {
      const resp = await fetch(`${TOOLS_BASE}/tool/outbound/load-clickup`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOOLS_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await resp.json();
      res.status(resp.status).json(data);
    } catch (err) {
      res.status(502).json({ error: 'proxy_failed', detail: (err as Error).message });
    }
  });

  router.post('/campaigns/load-batch', async (req, res) => {
    const { websites } = req.body as { websites?: string[] };
    if (!websites || !Array.isArray(websites) || websites.length === 0) {
      return res.status(400).json({ error: 'websites array required' });
    }
    const batchAdminKey = process.env.ADMIN_KEY;
    try {
      const batchResp = await fetch(`https://scanandboost.weareboost.online/api/v1/admin/batch?key=${encodeURIComponent(batchAdminKey || '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: websites, email: 'batch@weareboost.online', lang: 'es' }),
      });
      const data = await batchResp.json() as Record<string, unknown>;
      const cached = (data.skipped as number) || 0;
      res.json({ queued: data.queued, cached, jobs: data.jobs });
    } catch (err) {
      res.status(502).json({ error: 'batch_failed', detail: (err as Error).message });
    }
  });

  router.post('/campaigns/prepare-emails', async (req, res) => {
    try {
      const resp = await fetch(`${TOOLS_BASE}/tool/outbound/prepare-emails`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOOLS_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await resp.json() as Record<string, unknown>;
      const drafts = (data.drafts || []) as Array<Record<string, unknown>>;
      for (const d of drafts) {
        try {
          createEmailDraft({
            id: d.id as string,
            campaignName: d.campaignName as string,
            toEmail: d.toEmail as string,
            toName: d.toName as string | undefined,
            subject: d.subject as string,
            html: d.html as string,
            auditScore: d.auditScore as number | undefined,
            variant: d.variant as string | undefined,
          });
        } catch { /* skip duplicate */ }
      }
      if (drafts.length > 0) saveDatabase(dbPath).catch(() => {});
      res.status(resp.status).json(data);
    } catch (err) {
      res.status(502).json({ error: 'proxy_failed', detail: (err as Error).message });
    }
  });

  router.post('/campaigns/preview', async (req, res) => {
    try {
      const resp = await fetch(`${TOOLS_BASE}/tool/outbound/preview`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOOLS_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await resp.json();
      res.status(resp.status).json(data);
    } catch (err) {
      res.status(502).json({ error: 'proxy_failed', detail: (err as Error).message });
    }
  });

  router.post('/campaigns/launch', async (req, res) => {
    try {
      const resp = await fetch(`${TOOLS_BASE}/tool/outbound/launch`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOOLS_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await resp.json();
      res.status(resp.status).json(data);
    } catch (err) {
      res.status(502).json({ error: 'proxy_failed', detail: (err as Error).message });
    }
  });

  router.get('/sequences', (_req, res) => {
    const status = typeof _req.query.status === 'string' ? _req.query.status : undefined;
    const sequences = listSequences(status);
    const stats = getSequenceStats();
    res.json({ sequences, stats });
  });

  router.get('/sequences/:id', (req, res) => {
    const data = getSequenceWithSteps(req.params.id);
    if (!data.sequence) return res.status(404).json({ error: 'Sequence not found' });
    res.json(data);
  });

  router.post('/sequences', (req, res) => {
    const { id, leadEmail, leadName, domain, country, campaignName, auditId, auditScore, reportUrl } = req.body;
    if (!id || !leadEmail) return res.status(400).json({ error: 'id and leadEmail required' });
    createSequence({ id, leadEmail, leadName, domain, country: country || 'ES', campaignName, auditId, auditScore, reportUrl });
    saveDatabase(dbPath).catch(() => {});
    res.status(201).json({ ok: true, id });
  });

  router.post('/sequence-steps', (req, res) => {
    const { id, sequenceId, stepNumber, scheduledDate, draftId } = req.body;
    if (!id || !sequenceId || stepNumber === undefined || !scheduledDate) {
      return res.status(400).json({ error: 'id, sequenceId, stepNumber, scheduledDate required' });
    }
    createSequenceStep({ id, sequenceId, stepNumber, scheduledDate, draftId });
    saveDatabase(dbPath).catch(() => {});
    res.status(201).json({ ok: true, id });
  });

  router.get('/sequence-steps/due', (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    const steps = getDueSteps(date);
    res.json({ steps, date });
  });

  router.post('/sequence-steps/:id/sent', (req, res) => {
    const { emailId } = req.body as { emailId?: string };
    updateStepStatus(req.params.id, 'sent', emailId);
    saveDatabase(dbPath).catch(() => {});
    res.json({ ok: true });
  });

  router.post('/sequences/:id/replied', (_req, res) => {
    markSequenceReplied(_req.params.id);
    saveDatabase(dbPath).catch(() => {});
    res.json({ ok: true });
  });

  router.get('/drafts', (_req, res) => {
    const status = typeof _req.query.status === 'string' ? _req.query.status : undefined;
    const drafts = listEmailDrafts(status);
    const stats = getEmailDraftStats();
    res.json({ drafts, stats });
  });

  router.get('/drafts/:id', (req, res) => {
    const draft = getEmailDraft(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    res.json({ draft });
  });

  router.post('/drafts', (req, res) => {
    const { id, campaignName, toEmail, toName, subject, html, textFallback, leadTaskId, auditId, auditScore, variant } = req.body;
    if (!id || !campaignName || !toEmail || !subject || !html) {
      return res.status(400).json({ error: 'Missing required fields: id, campaignName, toEmail, subject, html' });
    }
    createEmailDraft({ id, campaignName, toEmail, toName, subject, html, textFallback, leadTaskId, auditId, auditScore, variant });
    saveDatabase(dbPath).catch(() => {});
    res.status(201).json({ ok: true, id });
  });

  router.post('/drafts/:id/approve', (_req, res) => {
    const draft = getEmailDraft(_req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    updateEmailDraftStatus(_req.params.id, 'pending');
    saveDatabase(dbPath).catch(() => {});
    res.json({ ok: true, status: 'pending' });
  });

  router.post('/drafts/:id/send', async (req, res) => {
    const draft = getEmailDraft(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (draft.status !== 'pending' && draft.status !== 'draft') {
      return res.status(400).json({ error: `Cannot send draft in status ${draft.status}` });
    }
    try {
      const sendRes = await fetch(`${TOOLS_BASE}/tool/email/send`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOOLS_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: draft.to_email,
          subject: draft.subject,
          html: draft.html,
          text: draft.text_fallback || undefined,
          agentId: 'campaign-pipeline',
          campaign: draft.campaign_name,
        }),
      });
      const data = await sendRes.json() as Record<string, unknown>;
      if (!sendRes.ok) {
        return res.status(502).json({ error: 'Email send failed', detail: data });
      }
      updateEmailDraftStatus(req.params.id, 'sent', data.emailId as string);
      saveDatabase(dbPath).catch(() => {});
      res.json({ ok: true, emailId: data.emailId });
    } catch (err) {
      res.status(502).json({ error: 'Send failed', detail: (err as Error).message });
    }
  });

  router.post('/drafts/:id/reject', (req, res) => {
    const draft = getEmailDraft(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    updateEmailDraftStatus(req.params.id, 'rejected');
    saveDatabase(dbPath).catch(() => {});
    res.json({ ok: true, status: 'rejected' });
  });

  router.delete('/drafts/:id', (req, res) => {
    deleteEmailDraft(req.params.id);
    saveDatabase(dbPath).catch(() => {});
    res.json({ ok: true });
  });

  router.post('/drafts/send-all-pending', async (_req, res) => {
    const pending = listEmailDrafts('pending');
    const results: Array<{ id: string; ok: boolean; emailId?: string; error?: string }> = [];
    for (const d of pending) {
      try {
        const sendRes = await fetch(`${TOOLS_BASE}/tool/email/send`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${TOOLS_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: d.to_email, subject: d.subject, html: getEmailDraft(d.id as string)?.html,
            agentId: 'campaign-pipeline', campaign: d.campaign_name,
          }),
        });
        const data = await sendRes.json() as Record<string, unknown>;
        if (sendRes.ok) {
          updateEmailDraftStatus(d.id as string, 'sent', data.emailId as string);
          results.push({ id: d.id as string, ok: true, emailId: data.emailId as string });
        } else {
          results.push({ id: d.id as string, ok: false, error: String(data.error || 'send_failed') });
        }
      } catch (err) {
        results.push({ id: d.id as string, ok: false, error: (err as Error).message });
      }
    }
    saveDatabase(dbPath).catch(() => {});
    res.json({ sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results });
  });

  router.get('/leads', (_req, res) => {
    const stats = getLeadStats();
    const leads = getAllLeads(100, 'web');
    res.json({ stats, leads });
  });

  router.get('/batch/audits', (_req, res) => {
    const audits = getAllLeads(200, 'internal');
    res.json({ audits, total: audits.length });
  });

  const batchQueue: Array<{ url: string; email: string; lang: string; auditId: string }> = [];
  let batchRunning = false;

  async function processBatchQueue() {
    if (batchRunning) return;
    batchRunning = true;
    while (batchQueue.length > 0) {
      const item = batchQueue.shift()!;
      console.log(`[Batch] Processing ${item.url} (${batchQueue.length} remaining)`);
      try {
        if (!acquireAuditSlot()) {
          await new Promise(resolve => setTimeout(resolve, 10000));
          batchQueue.unshift(item);
          continue;
        }
        if (!auditProgress.has(item.auditId)) {
          auditProgress.set(item.auditId, { status: 'pending', messages: ['Batch resumed'], createdAt: Date.now() });
        }

        await runAudit(item.auditId, item.url, item.email, '', gemini, item.lang, { vision: geminiVision, text: geminiText, mockups: geminiTranslate }, dbPath)
          .catch((err) => {
            console.error(`[Batch] Audit ${item.auditId} failed:`, err.message);
            logError(item.auditId, 'batch_audit', err, item.url);
            updateAuditStatus(item.auditId, 'failed');
            saveDatabase(dbPath);
          })
          .finally(() => releaseAuditSlot());

        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (err) {
        console.error(`[Batch] Error processing ${item.url}:`, (err as Error).message);
      }
    }
    batchRunning = false;
    console.log('[Batch] Queue empty, done.');
  }

  router.post('/batch', (req, res) => {
    const { urls, email, lang } = req.body as { urls?: string[]; email?: string; lang?: string };
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'urls array is required' });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (urls.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 URLs per batch' });
    }

    const auditLang = normalizeLangCode(lang || 'es');
    const jobs: Array<{ url: string; auditId: string }> = [];

    for (const rawUrl of urls) {
      if (!isValidUrl(rawUrl)) continue;
      const normalized = normalizeUrl(rawUrl);

      const existing = getRecentAuditByUrl(normalized);
      if (existing) {
        console.log(`[Batch] Reusing cached audit ${existing.id} for ${rawUrl}`);
        jobs.push({ url: rawUrl, auditId: existing.id as string });
        continue;
      }

      deleteAuditByUrl(normalized);

      const auditId_batch = uuid();
      try {
        const leadId = uuid();
        createBatchLead(leadId, email, rawUrl);
        createAudit(auditId_batch, leadId, rawUrl, normalized);
        linkLeadToAudit(leadId, auditId_batch);
        auditProgress.set(auditId_batch, { status: 'pending', messages: ['Batch queued'], createdAt: Date.now() });
      } catch (err) {
        console.error(`[Batch] Failed to pre-create audit for ${rawUrl}:`, (err as Error).message);
        continue;
      }
      batchQueue.push({ url: rawUrl, email, lang: auditLang, auditId: auditId_batch });
      jobs.push({ url: rawUrl, auditId: auditId_batch });
    }

    saveDatabase(dbPath).catch((err) => console.error('[Batch] saveDatabase failed:', (err as Error).message));
    processBatchQueue();
    res.json({
      ok: true,
      queued: jobs.length,
      skipped: urls.length - jobs.length,
      jobs,
      message: `${jobs.length} audits queued. They will process sequentially (~45s each).`,
    });
  });

  router.get('/batch/status', (_req, res) => {
    res.json({
      queueLength: batchQueue.length,
      running: batchRunning,
      items: batchQueue.map(i => ({ url: i.url, auditId: i.auditId })),
    });
  });

  router.post('/purge', (_req, res) => {
    purgeAllAudits();
    saveDatabase(dbPath);
    res.json({ ok: true, message: 'All audits, leads, and cache purged.' });
  });

  router.get('/backups', (_req, res) => {
    res.json({ backups: listBackups() });
  });

  router.post('/backups/create', async (_req, res) => {
    try {
      const filename = await createBackup();
      res.json({ ok: true, filename });
    } catch (err) {
      res.status(500).json({ error: 'Backup failed', details: (err as Error).message });
    }
  });

  router.get('/backups/download', (req, res) => {
    const filename = req.query.file as string;
    if (filename) {
      if (!/^croagent-backup-[\w.-]+\.db$/.test(filename)) {
        return res.status(400).json({ error: 'Invalid backup filename' });
      }
      const data = getBackupFile(filename);
      if (!data) return res.status(404).json({ error: 'Backup not found' });
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(data);
    }
    const data = exportDatabase();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="scanboost-live-${ts}.db"`);
    res.send(data);
  });

  router.post('/backups/restore', async (req, res) => {
    const filename = req.query.file as string;
    if (!filename || !/^croagent-backup-[\w.-]+\.db$/.test(filename)) {
      return res.status(400).json({ error: 'Invalid or missing backup filename' });
    }
    const result = await restoreFromBackup(filename);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  router.get('/timings', (_req, res) => {
    res.json(getTimingStats());
  });

  router.get('/errors', (_req, res) => {
    const errors = getErrorLog(100);
    const stats = getErrorStats();
    res.json({ stats, errors });
  });

  router.delete('/errors/:id', (req, res) => {
    const errorId = Number(req.params.id);
    if (!Number.isInteger(errorId) || errorId <= 0) {
      return res.status(400).json({ error: 'Invalid error ID' });
    }
    deleteError(errorId);
    saveDatabase(dbPath);
    res.json({ ok: true });
  });

  router.get('/analytics', (_req, res) => {
    res.json(getAnalytics());
  });

  router.post('/reset-rate-limits', (_req, res) => {
    const cleared = resetRateLimits();
    res.json({ ok: true, message: `Cleared ${cleared} rate limit buckets.` });
  });

  return router;
}
