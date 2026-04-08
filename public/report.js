// PanCROcio Report — shared client-side JS extracted from report-generator.ts
// Reads localised labels and audit URL from window.PANCROCIO_REPORT (set inline in the HTML).

(function () {
  var cfg = window.PANCROCIO_REPORT || {};
  var sendingLabel = cfg.sendingLabel || 'Sending...';
  var retryLabel = cfg.retryLabel || 'Retry';
  var errorAlert = cfg.errorAlert || 'Error sending. Please try again.';
  var auditUrl = cfg.auditUrl || '';

  function openMobileForm() {
    document.getElementById('mobileOverlay').style.display = 'block';
    document.getElementById('mobilePopup').style.display = 'block';
    setTimeout(function () {
      document.getElementById('mobileOverlay').classList.add('open');
      document.getElementById('mobilePopup').classList.add('open');
    }, 10);
  }

  function closeMobileForm() {
    document.getElementById('mobileOverlay').classList.remove('open');
    document.getElementById('mobilePopup').classList.remove('open');
    setTimeout(function () {
      document.getElementById('mobileOverlay').style.display = 'none';
      document.getElementById('mobilePopup').style.display = 'none';
    }, 300);
  }

  function handleContactSubmit(e, formId) {
    e.preventDefault();
    var form = document.getElementById(formId);
    var data = new FormData(form);
    var userMessage = data.get('message') || '';
    // Prepend the audited URL to the message so the sales team has context.
    // The /api/contact endpoint uses Zod strict and rejects unknown fields,
    // so we cannot add `auditUrl` or `source` as separate keys.
    var contextLine = auditUrl ? '[PanCROcio Audit: ' + auditUrl + ']\n\n' : '';
    var payload = {
      name: data.get('name'),
      email: data.get('email'),
      message: contextLine + userMessage,
      privacy: true,
    };

    var btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = sendingLabel;

    fetch('https://www.weareboost.online/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Error');
        form.style.display = 'none';
        document.getElementById(formId + 'Success').style.display = 'block';
        if (formId === 'mobileForm') {
          document.getElementById('mobileBubble').style.display = 'none';
        }
        // Match the GTM event NewBoostSite fires on success.
        if (window.dataLayer) {
          window.dataLayer.push({
            event: 'form_submit',
            form_name: 'pancrocio-report',
            form_page: window.location.pathname,
            form_language: document.documentElement.lang || 'es',
          });
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = retryLabel;
        alert(errorAlert);
      });
    return false;
  }

  // Expose to inline onclick/onsubmit handlers in the report HTML.
  window.openMobileForm = openMobileForm;
  window.closeMobileForm = closeMobileForm;
  window.handleContactSubmit = handleContactSubmit;
})();
