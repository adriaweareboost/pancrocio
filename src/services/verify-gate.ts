// Verify gate — sticky bar injected into the report HTML when the user
// has not yet verified their email. Provides a 6-digit code input and
// blurs the underlying report content.

import { escapeHtml, escapeJsString } from '../utils/html.js';

export interface VerifyGateStrings {
  title: string;
  subtitle: string;
  unlockButton: string;
  verifyingButton: string;
  errorMessage: string;
  resendQuestion: string;
  resendLink: string;
  resentConfirmation: string;
}

export const DEFAULT_VERIFY_STRINGS: VerifyGateStrings = {
  title: '\u{1F512} Verifica tu email',
  subtitle: 'Introduce el código de 6 dígitos enviado a tu email',
  unlockButton: 'Desbloquear',
  verifyingButton: 'Verificando...',
  errorMessage: 'Código incorrecto',
  resendQuestion: 'No lo recibes?',
  resendLink: 'Reenviar',
  resentConfirmation: '¡Código reenviado!',
};

/** Returns the HTML+CSS+JS markup for the verify gate, localised to `strings`. */
export function buildVerifyGate(strings: VerifyGateStrings = DEFAULT_VERIFY_STRINGS): string {
  return `
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
          .verify-text { color: white; flex: 1; min-width: 200px; }
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
              <h3>${escapeHtml(strings.title)}</h3>
              <p>${escapeHtml(strings.subtitle)}</p>
            </div>
            <div class="verify-form">
              <input type="text" id="verifyInput" maxlength="6" placeholder="------" autocomplete="off" inputmode="numeric">
              <button onclick="verifyCode()" id="verifyBtn">${escapeHtml(strings.unlockButton)}</button>
            </div>
            <div class="verify-error" id="verifyError">${escapeHtml(strings.errorMessage)}</div>
            <div class="verify-resend">${escapeHtml(strings.resendQuestion)} <a onclick="resendCode()">${escapeHtml(strings.resendLink)}</a></div>
          </div>
        </div>
        <script>
          var auditId = window.location.pathname.split('/')[4];
          var UNLOCK_LABEL = '${escapeJsString(strings.unlockButton)}';
          var VERIFYING_LABEL = '${escapeJsString(strings.verifyingButton)}';
          var RESEND_QUESTION = '${escapeJsString(strings.resendQuestion)}';
          var RESEND_LINK = '${escapeJsString(strings.resendLink)}';
          var RESENT_CONFIRMATION = '${escapeJsString(strings.resentConfirmation)}';
          function verifyCode() {
            var code = document.getElementById('verifyInput').value.trim();
            if (code.length !== 6) return;
            var btn = document.getElementById('verifyBtn');
            btn.disabled = true; btn.textContent = VERIFYING_LABEL;
            fetch('/api/v1/audit/' + auditId + '/verify', {
              method: 'POST', headers: {'Content-Type':'application/json'},
              body: JSON.stringify({code: code})
            }).then(function(r) { return r.json(); }).then(function(d) {
              if (d.verified) { location.reload(); }
              else {
                document.getElementById('verifyError').style.display = 'block';
                btn.disabled = false; btn.textContent = UNLOCK_LABEL;
              }
            }).catch(function() {
              btn.disabled = false; btn.textContent = UNLOCK_LABEL;
            });
          }
          function resendCode() {
            fetch('/api/v1/audit/' + auditId + '/send-code', {method:'POST'});
            var el = document.querySelector('.verify-resend');
            el.innerHTML = RESENT_CONFIRMATION;
            setTimeout(function() {
              el.innerHTML = RESEND_QUESTION + ' <a onclick="resendCode()">' + RESEND_LINK + '</a>';
            }, 3000);
          }
          document.getElementById('verifyInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') verifyCode();
          });
        </script>`;
}
