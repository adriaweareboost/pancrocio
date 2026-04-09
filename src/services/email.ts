// Email service — sends transactional emails via Resend.
// Falls back to console.log when RESEND_API_KEY is not set (dev mode).

import { Resend } from 'resend';
import { escapeHtml } from '../utils/html.js';

let resend: Resend | null = null;
let fromAddress = 'PanCROcio <pancrocio@weareboost.online>';

export function initEmail(): void {
  const apiKey = process.env.RESEND_API_KEY;
  fromAddress = process.env.RESEND_FROM || fromAddress;
  if (apiKey) {
    resend = new Resend(apiKey);
    console.log('[Email] Resend initialised.');
  } else {
    console.warn('[Email] RESEND_API_KEY not set — emails will be logged to console only.');
  }
}

async function send(to: string, subject: string, html: string, attachments?: { filename: string; content: Buffer }[]): Promise<boolean> {
  if (!resend) {
    console.log(`[Email][DEV] To: ${to} | Subject: ${subject}`);
    console.log(`[Email][DEV] Body preview: ${html.slice(0, 200)}...`);
    if (attachments?.length) console.log(`[Email][DEV] Attachments: ${attachments.map(a => `${a.filename} (${(a.content.length / 1024).toFixed(0)}KB)`).join(', ')}`);
    return true;
  }

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
      attachments: attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
      })),
    });
    if (result.error) {
      console.error(`[Email] Resend error to ${to}:`, result.error);
      return false;
    }
    console.log(`[Email] Sent to ${to}: "${subject}" (id: ${result.data?.id})`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}:`, (err as Error).message);
    return false;
  }
}

// ─── Email templates ───

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="60" height="72" style="vertical-align:middle"><circle cx="100" cy="80" r="42" fill="#fbbf24" stroke="#f59e0b" stroke-width="2"/><path d="M62 68 Q70 30 100 38 Q130 30 138 68" fill="#92400e"/><ellipse cx="84" cy="78" rx="10" ry="11" fill="white"/><circle cx="86" cy="79" r="5" fill="#1e293b"/><ellipse cx="116" cy="78" rx="10" ry="11" fill="white"/><circle cx="118" cy="79" r="5" fill="#1e293b"/><path d="M85 95 Q100 108 115 95" fill="none" stroke="#92400e" stroke-width="2.5" stroke-linecap="round"/><rect x="60" y="120" width="80" height="80" rx="16" fill="#f0f4ff" stroke="#c7d2fe" stroke-width="2"/><rect x="96" y="140" width="8" height="30" rx="3" fill="#EC5F29"/><rect x="75" y="158" width="20" height="15" rx="3" fill="#e0e7ff" stroke="#818cf8" stroke-width="1"/><text x="85" y="169" font-size="7" font-weight="bold" fill="#4338ca" text-anchor="middle" font-family="sans-serif">CRO</text></svg>`;

function emailWrapper(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0;padding:0;background:#f8f9fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#46495C}a{color:#EC5F29}</style></head><body><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="text-align:center;margin-bottom:24px">${LOGO_SVG}<h1 style="font-size:24px;font-weight:800;color:#070F2D;margin:8px 0 0">Pan<span style="color:#EC5F29">CRO</span>cio</h1></div><div style="background:white;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(7,15,45,0.08)">${content}</div><div style="text-align:center;margin-top:24px;font-size:12px;color:#9ca3af"><p>PanCROcio &middot; Powered by <strong style="color:#070F2D">Boost</strong></p><p style="margin-top:4px"><a href="https://www.weareboost.online" style="color:#9ca3af">weareboost.online</a></p></div></div></body></html>`;
}

/** Email 1: Verification code. */
export async function sendVerifyCodeEmail(to: string, code: string): Promise<boolean> {
  const html = emailWrapper(`
    <h2 style="text-align:center;font-size:20px;color:#070F2D;margin:0 0 8px">Tu código de verificación</h2>
    <p style="text-align:center;font-size:14px;color:#46495C;margin:0 0 24px">Introduce este código en PanCROcio para desbloquear tu informe CRO:</p>
    <div style="text-align:center;background:#070F2D;border-radius:12px;padding:24px;margin:0 auto;max-width:240px">
      <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:white;font-family:monospace">${code}</span>
    </div>
    <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:20px">El código expira cuando se usa. Si no solicitaste este código, ignora este email.</p>
  `);
  return send(to, 'Tu código de verificación PanCROcio', html);
}

/** Email 2: Report ready + PDF attachment. */
export async function sendReportEmail(
  to: string,
  url: string,
  globalScore: number,
  reportUrl: string,
  pdfBuffer?: Buffer,
  pdfFilename?: string,
): Promise<boolean> {
  const scoreColor = globalScore >= 80 ? '#22c55e' : globalScore >= 60 ? '#EC5F29' : globalScore >= 40 ? '#f97316' : '#ef4444';
  const html = emailWrapper(`
    <h2 style="text-align:center;font-size:20px;color:#070F2D;margin:0 0 8px">¡Tu informe CRO está listo!</h2>
    <p style="text-align:center;font-size:14px;color:#46495C;margin:0 0 24px">Hemos analizado <strong>${escapeHtml(url)}</strong></p>
    <div style="text-align:center;margin-bottom:24px">
      <div style="display:inline-block;background:${scoreColor};color:white;border-radius:50%;width:80px;height:80px;line-height:80px;font-size:28px;font-weight:800">${globalScore}</div>
      <p style="font-size:12px;color:#9ca3af;margin-top:8px">Puntuación global / 100</p>
    </div>
    <div style="text-align:center;margin-bottom:16px">
      <a href="${escapeHtml(reportUrl)}" style="display:inline-block;padding:14px 32px;background:linear-gradient(90deg,#dd974b,#db501a);color:white;text-decoration:none;border-radius:100px;font-weight:700;font-size:15px">Ver informe completo</a>
    </div>
    ${pdfBuffer ? '<p style="text-align:center;font-size:13px;color:#46495C">También encontrarás el informe en PDF adjunto a este email.</p>' : ''}
    <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:20px">¿Quieres implementar las mejoras? <a href="https://www.weareboost.online">Contáctanos</a></p>
  `);

  const attachments = pdfBuffer && pdfFilename
    ? [{ filename: pdfFilename, content: pdfBuffer }]
    : undefined;

  return send(to, `Tu informe CRO: ${url} (${globalScore}/100)`, html, attachments);
}

/** Email 3: Internal notification to the team. */
export async function sendLeadNotification(
  email: string,
  url: string,
  globalScore?: number,
  auditId?: string,
): Promise<boolean> {
  const notifyTo = process.env.RESEND_NOTIFY_EMAIL;
  if (!notifyTo) return false;

  const scoreInfo = globalScore !== undefined ? ` — Score: ${globalScore}/100` : '';
  const html = emailWrapper(`
    <h2 style="font-size:18px;color:#070F2D;margin:0 0 12px">Nuevo lead en PanCROcio</h2>
    <table style="width:100%;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:8px 0;color:#9ca3af;width:80px">Email</td><td style="padding:8px 0;color:#070F2D;font-weight:600">${escapeHtml(email)}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af">URL</td><td style="padding:8px 0"><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></td></tr>
      ${globalScore !== undefined ? `<tr><td style="padding:8px 0;color:#9ca3af">Score</td><td style="padding:8px 0;font-weight:700;color:${globalScore >= 60 ? '#22c55e' : '#f97316'}">${globalScore}/100</td></tr>` : ''}
      ${auditId ? `<tr><td style="padding:8px 0;color:#9ca3af">Audit</td><td style="padding:8px 0;font-family:monospace;font-size:12px">${auditId}</td></tr>` : ''}
    </table>
  `);

  return send(notifyTo, `[PanCROcio] Nuevo lead: ${email}${scoreInfo}`, html);
}
