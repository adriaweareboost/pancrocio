import { escapeHtml } from '../utils/html.js';
import { normalizeLangCode } from '../agents/translator.js';

// ─── Verify page i18n ───
const VERIFY_STRINGS: Record<string, { title: string; ready: string; subtitle: string; unlock: string; error: string; openEmail: string; noCode: string; resend: string; resent: string }> = {
  es: { title: 'Verificar Email', ready: '\u00a1Tu informe esta listo!', subtitle: 'Introduce el codigo de 6 digitos que te hemos enviado por email para desbloquear tu informe.', unlock: 'Desbloquear informe', error: 'Codigo incorrecto. Intentalo de nuevo.', openEmail: 'Abrir email', noCode: '\u00bfNo lo recibes?', resend: 'Reenviar codigo', resent: '\u00a1Codigo reenviado!' },
  en: { title: 'Verify Email', ready: 'Your report is ready!', subtitle: 'Enter the 6-digit code we sent to your email to unlock your report.', unlock: 'Unlock report', error: 'Incorrect code. Try again.', openEmail: 'Open email', noCode: "Didn't receive it?", resend: 'Resend code', resent: 'Code resent!' },
  fr: { title: 'Verifier Email', ready: 'Votre rapport est pret !', subtitle: 'Entrez le code a 6 chiffres que nous avons envoye a votre email pour debloquer votre rapport.', unlock: 'Debloquer le rapport', error: 'Code incorrect. Reessayez.', openEmail: 'Ouvrir email', noCode: 'Pas recu ?', resend: 'Renvoyer le code', resent: 'Code renvoye !' },
  de: { title: 'E-Mail bestatigen', ready: 'Ihr Bericht ist fertig!', subtitle: 'Geben Sie den 6-stelligen Code ein, den wir an Ihre E-Mail gesendet haben, um Ihren Bericht freizuschalten.', unlock: 'Bericht freischalten', error: 'Falscher Code. Versuchen Sie es erneut.', openEmail: 'E-Mail offnen', noCode: 'Nicht erhalten?', resend: 'Code erneut senden', resent: 'Code gesendet!' },
  it: { title: 'Verifica Email', ready: 'Il tuo report e pronto!', subtitle: 'Inserisci il codice a 6 cifre che ti abbiamo inviato per email per sbloccare il tuo report.', unlock: 'Sblocca report', error: 'Codice errato. Riprova.', openEmail: 'Apri email', noCode: 'Non lo ricevi?', resend: 'Reinvia codice', resent: 'Codice reinviato!' },
  pt: { title: 'Verificar Email', ready: 'Seu relatorio esta pronto!', subtitle: 'Insira o codigo de 6 digitos que enviamos para seu email para desbloquear seu relatorio.', unlock: 'Desbloquear relatorio', error: 'Codigo incorreto. Tente novamente.', openEmail: 'Abrir email', noCode: 'Nao recebeu?', resend: 'Reenviar codigo', resent: 'Codigo reenviado!' },
};

export function buildVerifyPage(auditId: string, url: string, score: number | null, lang = 'es'): string {
  const s = VERIFY_STRINGS[normalizeLangCode(lang)] || VERIFY_STRINGS.en;
  const scoreDisplay = score !== null ? `<div style="margin-top:16px"><span style="font-size:48px;font-weight:800;color:#EC5F29">${score}</span><span style="font-size:18px;color:#9ca3af">/100</span></div>` : '';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${escapeHtml(s.title)} — Scan&amp;Boost</title>
  <link rel="icon" type="image/png" href="/favicon-boost.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Open Sans', -apple-system, sans-serif; background: #f8f9fb; color: #46495C; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; }
    h1, h2 { font-family: 'Plus Jakarta Sans', sans-serif; }
    .verify-card { background: white; border-radius: 20px; padding: 40px 32px; box-shadow: 0 4px 24px rgba(7,15,45,0.10); max-width: 440px; width: 100%; text-align: center; }
    .logo { margin-bottom: 16px; }
    .url { font-size: 13px; color: #9ca3af; word-break: break-all; margin-top: 8px; }
    .subtitle { font-size: 15px; color: #46495C; margin: 20px 0 24px; line-height: 1.5; }
    .code-input { width: 200px; padding: 14px; border: 2px solid #e2e4ea; border-radius: 12px; font-size: 28px; text-align: center; letter-spacing: 8px; font-weight: 800; color: #070F2D; outline: none; font-family: 'Plus Jakarta Sans', monospace; }
    .code-input:focus { border-color: #EC5F29; box-shadow: 0 0 0 3px rgba(236,95,41,0.12); }
    .code-input::placeholder { color: #d1d5db; letter-spacing: 4px; font-weight: 400; }
    .submit-btn { display: block; width: 100%; max-width: 200px; margin: 20px auto 0; padding: 14px; background: linear-gradient(90deg, #dd974b, #db501a); color: white; border: none; border-radius: 100px; font-size: 16px; font-weight: 700; font-family: 'Plus Jakarta Sans', sans-serif; cursor: pointer; transition: transform 0.15s, box-shadow 0.2s; }
    .submit-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(219,80,26,0.35); }
    .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .error { color: #dc2626; font-size: 13px; margin-top: 12px; display: none; }
    .resend { margin-top: 16px; font-size: 13px; color: #9ca3af; }
    .resend a { color: #EC5F29; cursor: pointer; text-decoration: underline; }
    .footer { margin-top: 24px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="verify-card">
    <h1 style="font-size:28px;color:#070F2D;margin-bottom:4px">Scan&amp;<span style="color:#EC5F29">Boost</span></h1>
    <p style="font-size:16px;color:#070F2D;font-weight:600;margin-top:12px">${escapeHtml(s.ready)}</p>
    <p class="url">${escapeHtml(url)}</p>
    ${scoreDisplay}
    <p class="subtitle">${escapeHtml(s.subtitle)}</p>
    <input type="text" id="codeInput" class="code-input" maxlength="6" placeholder="------" autocomplete="off" inputmode="numeric" autofocus>
    <button id="verifyBtn" class="submit-btn" onclick="verify()" data-label="${escapeHtml(s.unlock)}">${escapeHtml(s.unlock)}</button>
    <div class="error" id="errorMsg">${escapeHtml(s.error)}</div>
    <div style="margin-top:16px;text-align:center">
      <a href="https://mail.google.com" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#f3f4f6;border-radius:8px;color:#46495C;text-decoration:none;font-size:13px;font-weight:600;transition:background 0.2s" onmouseover="this.style.background='#e2e4ea'" onmouseout="this.style.background='#f3f4f6'">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
        ${escapeHtml(s.openEmail)}
      </a>
    </div>
    <div class="resend">${escapeHtml(s.noCode)} <a onclick="resend()">${escapeHtml(s.resend)}</a></div>
    <div class="resend" id="resentMsg" style="display:none;color:#22c55e">${escapeHtml(s.resent)}</div>
  </div>
  <div class="footer">Scan&amp;Boost &middot; Powered by <strong style="color:#070F2D">Boost</strong></div>
  <script>
    var auditId = '${auditId.replace(/[^a-f0-9-]/g, '')}';
    function verify() {
      var code = document.getElementById('codeInput').value.trim();
      if (code.length !== 6) return;
      var btn = document.getElementById('verifyBtn');
      btn.disabled = true; btn.textContent = '...';
      document.getElementById('errorMsg').style.display = 'none';
      fetch('/api/v1/audit/' + auditId + '/verify', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({code: code})
      }).then(function(r) { return r.json(); }).then(function(d) {
        if (d.verified) { window.location.href = window.location.pathname + '?lang=' + '${lang}'; }
        else {
          document.getElementById('errorMsg').style.display = 'block';
          btn.disabled = false; btn.textContent = document.getElementById('verifyBtn').dataset.label;
        }
      }).catch(function() {
        btn.disabled = false; btn.textContent = document.getElementById('verifyBtn').dataset.label;
      });
    }
    function resend() {
      fetch('/api/v1/audit/' + auditId + '/send-code', {method:'POST'});
      document.getElementById('resentMsg').style.display = 'block';
      setTimeout(function() { document.getElementById('resentMsg').style.display = 'none'; }, 3000);
    }
    document.getElementById('codeInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') verify();
    });
  </script>
</body>
</html>`;
}

// ─── Mock data for /preview endpoint ───
export function buildMockReportInput() {
  const mkScore = (value: number) => ({
    value,
    label: (value >= 90 ? 'excellent' : value >= 70 ? 'good' : value >= 50 ? 'fair' : value >= 30 ? 'poor' : 'critical') as 'critical' | 'poor' | 'fair' | 'good' | 'excellent',
  });
  return {
    url: 'https://example.com',
    globalScore: 62,
    date: new Date().toISOString().split('T')[0],
    scores: {
      visualHierarchy: mkScore(58),
      uxHeuristics: mkScore(71),
      copyMessaging: mkScore(45),
      trustSignals: mkScore(80),
      mobileExperience: mkScore(63),
      performance: mkScore(55),
    },
    quickWins: [
      { rank: 1, title: 'CTA principal poco visible', problem: 'El boton de "Comprar ahora" se confunde con el fondo y los usuarios no lo encuentran rapido.', recommendation: 'Cambiar a color naranja contrastado, aumentar tamano un 20% y anadir microcopy "Envio gratis".', impact: 'high' as const, effort: 'low' as const, category: 'visualHierarchy' as const, priorityScore: 9 },
      { rank: 2, title: 'Falta prueba social en hero', problem: 'No hay testimonios ni numero de clientes visible above the fold.', recommendation: 'Anadir badge "+5.000 clientes confian en nosotros" debajo del CTA principal.', impact: 'high' as const, effort: 'low' as const, category: 'trustSignals' as const, priorityScore: 9 },
      { rank: 3, title: 'Formulario con demasiados campos', problem: 'El formulario de contacto pide 8 campos, lo que reduce la tasa de envio.', recommendation: 'Reducir a 3 campos esenciales: nombre, email, mensaje. Mover el resto a un segundo paso.', impact: 'medium' as const, effort: 'medium' as const, category: 'uxHeuristics' as const, priorityScore: 7 },
      { rank: 4, title: 'Headline poco claro', problem: 'El titulo principal habla de tecnologia, no de beneficios al usuario.', recommendation: 'Reescribir enfocandose en el valor: "Ahorra 3 horas al dia automatizando X".', impact: 'high' as const, effort: 'low' as const, category: 'copyMessaging' as const, priorityScore: 9 },
      { rank: 5, title: 'Imagenes sin lazy loading', problem: 'La home carga 18 imagenes a la vez, ralentizando el LCP.', recommendation: 'Anadir loading="lazy" a imagenes below the fold y usar formatos modernos (WebP).', impact: 'medium' as const, effort: 'low' as const, category: 'performance' as const, priorityScore: 8 },
      { rank: 6, title: 'Menu mobile dificil de usar', problem: 'El menu hamburguesa tiene texto muy pequeno y los enlaces estan muy juntos.', recommendation: 'Aumentar tamano de fuente a 16px y separacion vertical a minimo 12px.', impact: 'medium' as const, effort: 'low' as const, category: 'mobileExperience' as const, priorityScore: 7 },
    ],
    mockups: [
      { title: 'Hero rediseado con CTA destacado', description: 'Nueva propuesta visual del hero con CTA naranja, headline orientado a beneficios y badge de prueba social.', relatedQuickWin: 1, htmlContent: '<div style="background:linear-gradient(135deg,#070F2D,#1a2347);padding:60px 40px;border-radius:12px;text-align:center;color:white"><h1 style="font-size:36px;font-weight:800;margin-bottom:12px">Ahorra 3 horas al dia automatizando tu trabajo</h1><p style="opacity:0.7;margin-bottom:24px">Mas de 5.000 empresas ya lo hacen</p><button style="background:linear-gradient(90deg,#dd974b,#db501a);color:white;padding:16px 40px;border:none;border-radius:100px;font-size:18px;font-weight:700;cursor:pointer">Empezar gratis ahora</button><p style="font-size:12px;opacity:0.5;margin-top:12px">Sin tarjeta de credito. Cancela cuando quieras.</p></div>' },
      { title: 'Formulario simplificado', description: 'Formulario de 3 campos en vez de 8, con focus inmediato y boton ancho.', relatedQuickWin: 3, htmlContent: '<div style="background:white;padding:32px;border-radius:12px;border:1px solid #e2e4ea;max-width:400px;margin:0 auto"><h3 style="margin-bottom:20px;color:#070F2D">Contactanos</h3><input style="width:100%;padding:12px;border:1px solid #e2e4ea;border-radius:8px;margin-bottom:12px" placeholder="Nombre"><input style="width:100%;padding:12px;border:1px solid #e2e4ea;border-radius:8px;margin-bottom:12px" placeholder="Email"><textarea style="width:100%;padding:12px;border:1px solid #e2e4ea;border-radius:8px;margin-bottom:12px" placeholder="Mensaje" rows="3"></textarea><button style="width:100%;background:#EC5F29;color:white;padding:14px;border:none;border-radius:8px;font-weight:700">Enviar</button></div>' },
    ],
    analyses: (['visualHierarchy', 'uxHeuristics', 'copyMessaging', 'trustSignals', 'mobileExperience', 'performance'] as const).map((cat) => ({
      agentName: `Mock ${cat} agent`,
      category: cat,
      score: mkScore(60),
      executionTimeMs: 1234,
      findings: [
        { title: 'Hallazgo de ejemplo', description: 'Esta es una descripcion mock para previsualizar el informe sin necesidad de correr una auditoria real.', severity: 'warning' as const, recommendation: 'Recomendacion mock para probar el layout del informe.' },
        { title: 'Otro hallazgo', description: 'Segundo hallazgo de ejemplo con texto mas largo para verificar como se ve el informe con contenido realista. Lorem ipsum dolor sit amet consectetur adipiscing elit.', severity: 'info' as const, recommendation: 'Aplicar buenas practicas estandar.' },
      ],
    })),
  };
}
