/* Scan&Boost Admin — All tab logic */
let adminKey = localStorage.getItem('scanboost_admin_key') || '';
    const CAT_LABELS = { visualHierarchy:'Visual Hierarchy', uxHeuristics:'UX Heuristics', copyMessaging:'Copy & Messaging', trustSignals:'Trust Signals', mobileExperience:'Mobile Experience', performance:'Performance' };

    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function fmtMs(ms) { return ms >= 1000 ? (ms/1000).toFixed(1)+'s' : ms+'ms'; }
    function barColor(v) { return v >= 80 ? '#22c55e' : v >= 60 ? '#84cc16' : v >= 40 ? '#EC5F29' : '#dc2626'; }

    function switchTab(name) {
      document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', t.textContent.toLowerCase().includes(name.slice(0,4))));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-' + name).classList.add('active');
      if (name === 'analytics' && !window._analyticsLoaded) loadAnalytics();
      if (name === 'performance' && !window._perfLoaded) loadTimings();
      if (name === 'errors' && !window._errorsLoaded) loadErrors();
      if (name === 'backups' && !window._backupsLoaded) loadBackups();
      if (name === 'batch') checkBatchStatus();
      if (name === 'audits' && !window._auditsLoaded) loadBatchAudits();
      if (name === 'emails' && !window._emailsLoaded) loadEmails();
    }

    function login() {
      adminKey = document.getElementById('keyInput').value.trim();
      if (!adminKey) return;
      localStorage.setItem('scanboost_admin_key', adminKey);
      fetchApi('leads').then(data => {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        renderLeads(data);
      }).catch(() => {
        document.getElementById('loginError').style.display = 'block';
        localStorage.removeItem('scanboost_admin_key');
      });
    }
    document.getElementById('keyInput').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

    function fetchApi(endpoint) {
      return fetch('/api/v1/admin/' + endpoint + '?key=' + encodeURIComponent(adminKey))
        .then(r => { if (!r.ok) throw new Error('Unauthorized'); return r.json(); });
    }

    // ── LEADS ──
    function loadLeads() { fetchApi('leads').then(renderLeads); }
    function renderLeads(data) {
      const s = data.stats || {};
      document.getElementById('leadsStats').innerHTML = `
        <div class="stat-card highlight"><div class="number">${s.total||0}</div><div class="label">Total Leads</div></div>
        <div class="stat-card"><div class="number">${s.verified||0}</div><div class="label">Verificados</div></div>
        <div class="stat-card"><div class="number">${s.completed||0}</div><div class="label">Auditorias</div></div>
        <div class="stat-card"><div class="number">${s.total ? Math.round((s.verified/s.total)*100) : 0}%</div><div class="label">Tasa verificacion</div></div>`;
      window._allLeads = data.leads || [];
      renderTable(window._allLeads);
    }
    function renderTable(leads) {
      const tbody = document.getElementById('leadsBody');
      document.getElementById('emptyLeads').style.display = leads.length ? 'none' : 'block';
      tbody.innerHTML = leads.map(l => {
        const sc = l.global_score, scCls = sc>=80?'score-good':sc>=60?'score-ok':'score-bad';
        const st = l.audit_status==='completed'?'<span class="badge-ok">OK</span>':l.audit_status==='failed'?'<span class="badge-no">Fail</span>':'<span class="badge-pending">'+(l.audit_status||'...')+'</span>';
        const v = l.email_verified?'<span class="badge-ok">Si</span>':'<span class="badge-no">No</span>';
        const d = l.created_at ? new Date(l.created_at).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '-';
        const rpt = l.audit_id&&l.audit_status==='completed'?'<a href="/api/v1/audit/'+l.audit_id+'/report" target="_blank" style="color:#EC5F29">Ver</a>':'-';
        return '<tr><td>'+esc(l.email||'')+'</td><td class="url-cell"><a href="'+esc(l.url||'')+'" target="_blank">'+esc(l.url||'')+'</a></td><td><span class="score '+scCls+'">'+(sc!=null?sc:'-')+'</span></td><td>'+st+'</td><td>'+v+'</td><td class="date-cell">'+d+'</td><td>'+rpt+'</td></tr>';
      }).join('');
    }
    function filterTable() {
      const q = document.getElementById('searchInput').value.toLowerCase();
      renderTable((window._allLeads||[]).filter(l => (l.email||'').toLowerCase().includes(q)||(l.url||'').toLowerCase().includes(q)));
    }
    function purgeData() {
      if (!confirm('Borrar TODOS los datos?')) return;
      fetch('/api/v1/admin/purge?key='+encodeURIComponent(adminKey),{method:'POST'}).then(()=>loadLeads());
    }

    // ── ANALYTICS ──
    function loadAnalytics() {
      fetchApi('analytics').then(data => {
        window._analyticsLoaded = true;
        const tf = data.severityDistribution.reduce((s,d)=>s+d.count,0);
        document.getElementById('analyticsKpis').innerHTML = `
          <div class="stat-card"><div class="number">${data.totalAudits}</div><div class="label">Auditorias</div></div>
          <div class="stat-card highlight"><div class="number">${data.avgGlobalScore}</div><div class="label">Score medio</div></div>
          <div class="stat-card"><div class="number">${tf}</div><div class="label">Findings totales</div></div>
          <div class="stat-card"><div class="number">${data.topFindings.length}</div><div class="label">Errores unicos</div></div>`;

        const sevMap = {}; data.severityDistribution.forEach(s => sevMap[s.severity]=s.count);
        document.getElementById('sevGrid').innerHTML = `
          <div class="sev-card sev-critical"><div class="count">${sevMap.critical||0}</div><div class="label">Critical</div></div>
          <div class="sev-card sev-warning"><div class="count">${sevMap.warning||0}</div><div class="label">Warning</div></div>
          <div class="sev-card sev-info"><div class="count">${sevMap.info||0}</div><div class="label">Info</div></div>`;

        document.getElementById('topFindings').innerHTML = data.topFindings.length === 0
          ? '<div class="empty">Sin datos</div>'
          : data.topFindings.slice(0,10).map((f,i) => `
            <div class="finding-row">
              <div class="finding-rank ${i<3?'top3':''}">${i+1}</div>
              <div class="finding-info">
                <div class="finding-title">${esc(f.title)}</div>
                <div class="finding-meta"><span class="badge-${f.severity}">${f.severity}</span> ${CAT_LABELS[f.category]||f.category}</div>
              </div>
              <div class="finding-count">${f.count}<small>x</small></div>
            </div>`).join('');

        document.getElementById('catStats').innerHTML = data.categoryStats.length === 0
          ? '<div class="empty">Sin datos</div>'
          : data.categoryStats.map(c => `
            <div class="cat-row">
              <div class="cat-name">${CAT_LABELS[c.category]||c.category}</div>
              <div class="cat-bar-wrap"><div class="cat-bar" style="width:${Math.max(c.avgScore,5)}%;background:${barColor(c.avgScore)}">${c.avgScore}</div></div>
            </div>`).join('');
      });
    }

    // ── PERFORMANCE ──
    function loadTimings() {
      fetchApi('timings').then(data => {
        window._perfLoaded = true;
        document.getElementById('perfStats').innerHTML = `
          <div class="stat-card highlight"><div class="number">${fmtMs(data.avgTotal)}</div><div class="label">Tiempo medio total</div></div>
          <div class="stat-card"><div class="number">${fmtMs(data.avgScrape)}</div><div class="label">Scraping</div></div>
          <div class="stat-card"><div class="number">${fmtMs(data.avgPipeline)}</div><div class="label">Pipeline IA</div></div>
          <div class="stat-card"><div class="number">${fmtMs(data.avgTranslation)}</div><div class="label">Traduccion</div></div>
          <div class="stat-card"><div class="number">${fmtMs(data.avgReport)}</div><div class="label">Report</div></div>
          <div class="stat-card"><div class="number">${data.count}</div><div class="label">Total mediciones</div></div>`;

        const maxMs = Math.max(data.avgScrape, data.avgPipeline, data.avgTranslation, data.avgReport, 1);
        const phases = [
          { label: 'Scraping', ms: data.avgScrape, color: '#3b82f6' },
          { label: 'Pipeline IA', ms: data.avgPipeline, color: '#EC5F29' },
          { label: 'Traduccion', ms: data.avgTranslation, color: '#8b5cf6' },
          { label: 'Report', ms: data.avgReport, color: '#22c55e' },
        ];
        document.getElementById('timingBars').innerHTML = phases.map(p => `
          <div class="timing-row">
            <div class="timing-label">${p.label}</div>
            <div class="timing-bar-wrap"><div class="timing-bar" style="width:${Math.max((p.ms/maxMs)*100,5)}%;background:${p.color}">${fmtMs(p.ms)}</div></div>
          </div>`).join('');

        document.getElementById('timingBody').innerHTML = data.recent.map(t => {
          const u = t.url.replace(/^https?:\/\//,'').slice(0,30);
          const d = new Date(t.created_at).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
          return `<tr><td class="url-cell">${esc(u)}</td><td><strong>${fmtMs(t.total_ms)}</strong></td><td>${fmtMs(t.scrape_ms)}</td><td>${fmtMs(t.pipeline_ms)}</td><td>${fmtMs(t.translation_ms)}</td><td>${fmtMs(t.report_ms)}</td><td class="date-cell">${d}</td></tr>`;
        }).join('') || '<tr><td colspan="7" class="empty">Sin datos</td></tr>';
      });
    }

    // ── ERRORS ──
    function loadErrors() {
      fetchApi('errors').then(data => {
        window._errorsLoaded = true;
        document.getElementById('errorStats').innerHTML = (data.stats||[]).map(s =>
          `<div class="stat-card"><div class="number">${s.count}</div><div class="label">${esc(s.phase)}</div></div>`
        ).join('') || '<div class="stat-card"><div class="number">0</div><div class="label">Errores</div></div>';

        const errors = data.errors || [];
        document.getElementById('emptyErrors').style.display = errors.length ? 'none' : 'block';
        document.getElementById('errorBody').innerHTML = errors.map(e => {
          const d = new Date(e.created_at).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
          const u = (e.url||'').replace(/^https?:\/\//,'').slice(0,25);
          return `<tr><td><span class="badge-no">${esc(e.phase)}</span></td><td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.error_message)}</td><td class="url-cell">${esc(u)}</td><td class="date-cell">${d}</td><td><button onclick="deleteError(${e.id})" style="padding:4px 12px;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;background:#fef2f2;color:#dc2626;transition:all 0.2s;">Eliminar</button></td></tr>`;
        }).join('');
      });
    }

    function deleteError(id) {
      fetch('/api/v1/admin/errors/' + id + '?key=' + encodeURIComponent(adminKey), { method: 'DELETE' })
        .then(r => r.json())
        .then(() => { window._errorsLoaded = false; loadErrors(); });
    }

    // ── BACKUPS ──
    function loadBackups() {
      fetchApi('backups').then(data => {
        window._backupsLoaded = true;
        const backups = data.backups || [];
        document.getElementById('emptyBackups').style.display = backups.length ? 'none' : 'block';
        document.getElementById('backupBody').innerHTML = backups.map(b => {
          const sizeKb = (b.size / 1024).toFixed(0);
          return `<tr>
            <td style="font-family:monospace;font-size:12px">${esc(b.filename)}</td>
            <td>${sizeKb} KB</td>
            <td class="date-cell">${esc(b.date)}</td>
            <td style="display:flex;gap:6px;">
              <a href="/api/v1/admin/backups/download?key=${encodeURIComponent(adminKey)}&file=${encodeURIComponent(b.filename)}" style="display:inline-block;padding:6px 14px;border-radius:10px;text-decoration:none;font-size:11px;font-weight:600;background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;box-shadow:0 2px 6px rgba(59,130,246,0.25);">Descargar</a>
              <button onclick="restoreBackup('${b.filename}')" style="padding:6px 14px;border:none;border-radius:10px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;box-shadow:0 2px 6px rgba(245,158,11,0.25);">Restaurar</button>
            </td>
          </tr>`;
        }).join('') || '';
      });
    }
    function createBackupNow() {
      const status = document.getElementById('backupStatus');
      status.style.display = 'block';
      status.style.background = '#eff6ff';
      status.style.color = '#2563eb';
      status.textContent = 'Creando backup...';
      fetch('/api/v1/admin/backups/create?key=' + encodeURIComponent(adminKey), { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          status.style.background = '#dcfce7';
          status.style.color = '#16a34a';
          status.textContent = 'Backup creado: ' + data.filename;
          loadBackups();
          setTimeout(() => { status.style.display = 'none'; }, 5000);
        })
        .catch(() => {
          status.style.background = '#fef2f2';
          status.style.color = '#dc2626';
          status.textContent = 'Error al crear backup';
        });
    }
    function restoreBackup(filename) {
      if (!confirm('Restaurar este backup? Se creara una copia de seguridad del estado actual antes de restaurar.')) return;
      const status = document.getElementById('backupStatus');
      status.style.display = 'block';
      status.style.background = '#fff7ed';
      status.style.color = '#d97706';
      status.textContent = 'Restaurando backup...';
      fetch('/api/v1/admin/backups/restore?key=' + encodeURIComponent(adminKey) + '&file=' + encodeURIComponent(filename), { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.ok) {
            status.style.background = '#dcfce7';
            status.style.color = '#16a34a';
            status.textContent = 'Restaurado: ' + data.message;
            loadBackups();
          } else {
            status.style.background = '#fef2f2';
            status.style.color = '#dc2626';
            status.textContent = 'Error: ' + data.message;
          }
          setTimeout(() => { status.style.display = 'none'; }, 5000);
        })
        .catch(() => {
          status.style.background = '#fef2f2';
          status.style.color = '#dc2626';
          status.textContent = 'Error al restaurar';
        });
    }
    function downloadLiveDb() {
      window.location.href = '/api/v1/admin/backups/download?key=' + encodeURIComponent(adminKey);
    }

    // ── MIS AUDITORIAS (batch) ──
    function loadBatchAudits() {
      fetchApi('batch/audits').then(data => {
        window._auditsLoaded = true;
        const audits = data.audits || [];
        const completed = audits.filter(a => a.audit_status === 'completed').length;
        document.getElementById('auditsStats').innerHTML = `
          <div class="stat-card"><div class="number">${audits.length}</div><div class="label">Total</div></div>
          <div class="stat-card highlight"><div class="number">${completed}</div><div class="label">Completadas</div></div>
          <div class="stat-card"><div class="number">${audits.length - completed}</div><div class="label">Pendientes/Fallidas</div></div>`;
        window._allAudits = audits;
        renderAuditsTable(audits);
      });
    }
    function renderAuditsTable(audits) {
      const tbody = document.getElementById('auditsBody');
      document.getElementById('emptyAudits').style.display = audits.length ? 'none' : 'block';
      tbody.innerHTML = audits.map(a => {
        const sc = a.global_score, scCls = sc>=80?'score-good':sc>=60?'score-ok':'score-bad';
        const st = a.audit_status==='completed'?'<span class="badge-ok">OK</span>':a.audit_status==='failed'?'<span class="badge-no">Fail</span>':'<span class="badge-pending">'+(a.audit_status||'...')+'</span>';
        const d = a.created_at ? new Date(a.created_at).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '-';
        const rpt = a.audit_id&&a.audit_status==='completed'?'<a href="/api/v1/audit/'+a.audit_id+'/report" target="_blank" style="color:#EC5F29">Ver</a>':'-';
        const u = (a.url||'').replace(/^https?:\/\//,'');
        return '<tr><td class="url-cell"><a href="'+esc(a.url||'')+'" target="_blank">'+esc(u)+'</a></td><td><span class="score '+scCls+'">'+(sc!=null?sc:'-')+'</span></td><td>'+st+'</td><td class="date-cell">'+d+'</td><td>'+rpt+'</td></tr>';
      }).join('');
    }
    function filterAuditsTable() {
      const q = document.getElementById('auditsSearch').value.toLowerCase();
      renderAuditsTable((window._allAudits||[]).filter(a => (a.url||'').toLowerCase().includes(q)));
    }

    // ── BATCH ──
    function loadCsv(input) {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        const text = e.target.result;
        // Extract URLs from CSV: find anything that looks like http(s)://...
        const urls = text.match(/https?:\/\/[^\s,;"'<>]+/gi) || [];
        const unique = [...new Set(urls)];
        const textarea = document.getElementById('batchUrls');
        const existing = textarea.value.trim();
        textarea.value = (existing ? existing + '\n' : '') + unique.join('\n');
        document.getElementById('csvInfo').textContent = unique.length + ' URLs extraidas de ' + file.name;
      };
      reader.readAsText(file);
      input.value = ''; // allow re-upload same file
    }
    function launchBatch() {
      const email = document.getElementById('batchEmail').value.trim();
      const lang = document.getElementById('batchLang').value;
      const raw = document.getElementById('batchUrls').value.trim();
      if (!email || !raw) return showBatchStatus('Rellena email y URLs', '#fef2f2', '#dc2626');
      const urls = raw.split('\n').map(u => u.trim()).filter(u => u.length > 0);
      if (urls.length === 0) return showBatchStatus('No hay URLs validas', '#fef2f2', '#dc2626');
      showBatchStatus('Enviando...', '#eff6ff', '#2563eb');
      fetch('/api/v1/admin/batch?key=' + encodeURIComponent(adminKey), {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ urls, email, lang })
      }).then(r => r.json()).then(data => {
        if (data.ok) {
          showBatchStatus(data.message, '#dcfce7', '#16a34a');
          renderBatchJobs(data.jobs);
        } else {
          showBatchStatus(data.error, '#fef2f2', '#dc2626');
        }
      }).catch(() => showBatchStatus('Error de conexion', '#fef2f2', '#dc2626'));
    }
    function checkBatchStatus() {
      fetchApi('batch/status').then(data => {
        if (data.queueLength === 0 && !data.running) {
          showBatchStatus('Cola vacia — no hay auditorias pendientes', '#f3f4f6', '#070F2D');
        } else {
          showBatchStatus(`${data.queueLength} en cola, ${data.running ? 'procesando...' : 'parado'}`, '#fff7ed', '#d97706');
          if (data.items.length > 0) renderBatchJobs(data.items);
        }
      });
    }
    function renderBatchJobs(jobs) {
      const el = document.getElementById('batchResults');
      el.style.display = 'block';
      document.getElementById('batchBody').innerHTML = jobs.map(j =>
        `<tr><td class="url-cell">${esc(j.url)}</td><td style="font-family:monospace;font-size:11px">${j.auditId.slice(0,8)}...</td><td><span class="badge-pending">En cola</span></td></tr>`
      ).join('');
    }
    function showBatchStatus(msg, bg, color) {
      const el = document.getElementById('batchStatus');
      el.style.display = 'block'; el.style.background = bg; el.style.color = color;
      el.textContent = msg;
    }

    // ─── CAMPAIGNS TAB ───
    const TOOLS_BASE = 'https://boost-sales-tools-production.up.railway.app';
    const ICP_PRESETS = {
      'es-ecommerce-mid': { name: 'ES Ecommerce Mid-Market', locations: 'spain', employees: '11,50 / 51,200', keywords: 'ecommerce, shopify, woocommerce, tienda online', revMin: 500000, revMax: 50000000, variant: 'A', max: 15 },
      'es-d2c-small': { name: 'ES D2C Pequeñas', locations: 'spain', employees: '1,10 / 11,50', keywords: 'direct to consumer, d2c, marca propia, dnvb', revMin: 100000, revMax: 5000000, variant: 'B', max: 10 },
      'latam-ecommerce': { name: 'LATAM Ecommerce', locations: 'mexico, colombia, argentina', employees: '11,50 / 51,200', keywords: 'ecommerce, tienda online, comercio electronico', revMin: 500000, revMax: 50000000, variant: 'A', max: 10 },
      'dach-fashion': { name: 'DACH Fashion', locations: 'germany, austria, switzerland', employees: '11,50 / 51,200', keywords: 'fashion, apparel, shopify, mode', revMin: 1000000, revMax: 100000000, variant: 'C', max: 10 },
      'es-saas-growth': { name: 'ES SaaS', locations: 'spain', employees: '11,50 / 51,200', keywords: 'saas, software as a service, plataforma', revMin: 500000, revMax: 20000000, variant: 'B', max: 10 },
      'es-hospitality': { name: 'ES Hospitality', locations: 'spain', employees: '11,50 / 51,200 / 201,500', keywords: 'hotel, hospitality, reservas, booking directo, turismo', revMin: 1000000, revMax: 100000000, variant: 'A', max: 10 },
    };

    function loadPreset() {
      const id = document.getElementById('campPreset').value;
      const p = ICP_PRESETS[id];
      if (!p) return;
      document.getElementById('campName').value = p.name + ' ' + new Date().toISOString().slice(0,10);
      document.getElementById('campLocations').value = p.locations;
      document.getElementById('campEmployees').value = p.employees;
      document.getElementById('campKeywords').value = p.keywords;
      document.getElementById('campRevMin').value = p.revMin;
      document.getElementById('campRevMax').value = p.revMax;
      document.getElementById('campVariant').value = p.variant;
      document.getElementById('campMaxLeads').value = p.max;
    }

    let campContacts = []; // Parsed from CSV or Apollo

    function parseCsvContacts() {
      const fileInput = document.getElementById('campCsvFile');
      const file = fileInput.files && fileInput.files[0];
      if (!file) { alert('Selecciona un archivo CSV'); return; }
      const reader = new FileReader();
      reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) { alert('CSV vacío'); return; }
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        const contacts = [];
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const row = {};
          headers.forEach((h, j) => { row[h] = vals[j] || ''; });
          // Map common Apollo CSV headers
          const contact = {
            name: row['first name'] || row['name'] || row['first_name'] || '',
            lastName: row['last name'] || row['last_name'] || '',
            email: row['email'] || row['email address'] || '',
            title: row['title'] || row['job title'] || '',
            company: row['company'] || row['company name'] || row['organization name'] || '',
            domain: row['website'] || row['company domain'] || row['domain'] || '',
            phone: row['phone'] || row['phone number'] || row['mobile phone'] || '',
            linkedin: row['linkedin'] || row['linkedin url'] || row['person linkedin url'] || '',
            country: row['country'] || row['company country'] || '',
          };
          if (contact.email || contact.domain) contacts.push(contact);
        }
        campContacts = contacts;
        document.getElementById('campCsvStatus').textContent = contacts.length + ' contactos cargados';
        renderCampaignResults(contacts.map(c => ({
          name: (c.name + ' ' + c.lastName).trim() || c.company,
          domain: c.domain,
          country: c.country,
          headcount: null,
        })), true);
      };
      reader.readAsText(file);
    }

    function loadInClickup() {
      if (campContacts.length === 0) { alert('Primero carga contactos (CSV o Preview Apollo)'); return; }
      showCampStatus('Cargando ' + campContacts.length + ' contactos en ClickUp (dedup check)...', '#fff7ed', '#d97706');
      fetch('/api/v1/admin/campaigns/load-clickup?key=' + encodeURIComponent(adminKey), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: campContacts, campaignName: document.getElementById('campName').value || 'Campaign' }),
      }).then(r => r.json()).then(data => {
        if (data.error) { showCampStatus('Error: ' + data.error, '#fef2f2', '#dc2626'); return; }
        showCampStatus(`ClickUp: ${data.created || 0} creados, ${data.existing || 0} ya existían, ${data.skipped || 0} skipped`, '#dcfce7', '#16a34a');
        if (data.results) renderCampaignResults(data.results, false);
      }).catch(e => showCampStatus('Error: ' + e.message, '#fef2f2', '#dc2626'));
    }

    function loadBatch() {
      if (campContacts.length === 0) { alert('Primero carga contactos'); return; }
      const websites = campContacts.map(c => c.domain ? 'https://www.' + c.domain.replace(/^(https?:\/\/)?(www\.)?/, '') : '').filter(Boolean);
      if (websites.length === 0) { alert('Ningún contacto tiene dominio web'); return; }
      showCampStatus('Lanzando ' + websites.length + ' auditorías en Scan&Boost...', '#fff7ed', '#d97706');
      fetch('/api/v1/admin/campaigns/load-batch?key=' + encodeURIComponent(adminKey), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websites }),
      }).then(r => r.json()).then(data => {
        if (data.error) { showCampStatus('Error: ' + data.error, '#fef2f2', '#dc2626'); return; }
        showCampStatus(`Batch: ${data.queued || 0} auditorías en cola, ${data.cached || 0} cacheadas`, '#dcfce7', '#16a34a');
      }).catch(e => showCampStatus('Error: ' + e.message, '#fef2f2', '#dc2626'));
    }

    function prepareEmails() {
      if (campContacts.length === 0) { alert('Primero carga contactos'); return; }
      const variant = document.getElementById('campVariant').value;
      const name = document.getElementById('campName').value || 'Campaign';
      showCampStatus('Preparando emails personalizados (requiere auditoría)...', '#fff7ed', '#d97706');
      fetch('/api/v1/admin/campaigns/prepare-emails?key=' + encodeURIComponent(adminKey), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: campContacts, campaignName: name, variant }),
      }).then(r => r.json()).then(data => {
        if (data.error) { showCampStatus('Error: ' + data.error, '#fef2f2', '#dc2626'); return; }
        showCampStatus(`Emails: ${data.drafted || 0} drafts creados, ${data.skipped || 0} sin auditoría. Ve al tab Emails para revisar.`, '#dcfce7', '#16a34a');
      }).catch(e => showCampStatus('Error: ' + e.message, '#fef2f2', '#dc2626'));
    }

    function getCampaignPayload(dryRun) {
      const locations = document.getElementById('campLocations').value.split(',').map(s => s.trim()).filter(Boolean);
      const empRaw = document.getElementById('campEmployees').value.split('/').map(s => s.trim()).filter(Boolean);
      const keywords = document.getElementById('campKeywords').value.split(',').map(s => s.trim()).filter(Boolean);
      const revMin = parseInt(document.getElementById('campRevMin').value) || undefined;
      const revMax = parseInt(document.getElementById('campRevMax').value) || undefined;
      return {
        name: document.getElementById('campName').value || 'Campaign ' + new Date().toISOString().slice(0,10),
        filters: {
          locations: locations.length ? locations : undefined,
          employeesRanges: empRaw.length ? empRaw : undefined,
          keywords: keywords.length ? keywords : undefined,
          revenueMin: revMin,
          revenueMax: revMax,
        },
        maxLeads: parseInt(document.getElementById('campMaxLeads').value) || 10,
        emailVariant: document.getElementById('campVariant').value,
        dryRun,
      };
    }

    function showCampStatus(msg, bg, color) {
      const el = document.getElementById('campStatus');
      el.style.display = 'block';
      el.style.background = bg;
      el.style.color = color;
      el.textContent = msg;
    }

    function previewCampaign() {
      showCampStatus('Buscando empresas en Apollo...', '#f3f4f6', '#070F2D');
      const payload = getCampaignPayload(true);
      fetch('/api/v1/admin/campaigns/preview?key=' + encodeURIComponent(adminKey), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }).then(r => r.json()).then(data => {
        if (data.error) { showCampStatus('Error: ' + (data.detail || data.error), '#fef2f2', '#dc2626'); return; }
        showCampStatus(`${data.totalFound} empresas encontradas, mostrando ${data.showing}`, '#dcfce7', '#16a34a');
        renderCampaignResults(data.companies || [], true);
      }).catch(e => showCampStatus('Error: ' + e.message, '#fef2f2', '#dc2626'));
    }

    function launchCampaign(dryRun) {
      const mode = dryRun ? 'Dry run' : 'REAL';
      showCampStatus(mode + ' en curso... puede tardar varios minutos', '#fff7ed', '#d97706');
      const payload = getCampaignPayload(dryRun);
      fetch('/api/v1/admin/campaigns/launch?key=' + encodeURIComponent(adminKey), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }).then(r => r.json()).then(data => {
        if (data.error) { showCampStatus('Error: ' + (data.detail || data.error), '#fef2f2', '#dc2626'); return; }
        const sent = data.emailsSent || 0;
        showCampStatus(`${mode} completado. ${data.processed || 0} procesados, ${sent} emails enviados.`, sent > 0 ? '#dcfce7' : '#f3f4f6', sent > 0 ? '#16a34a' : '#070F2D');
        renderCampaignResults(data.results || [], false);
      }).catch(e => showCampStatus('Error: ' + e.message, '#fef2f2', '#dc2626'));
    }

    function renderCampaignResults(results, isPreview) {
      const card = document.getElementById('campResultsCard');
      card.style.display = 'block';
      document.getElementById('campResultsTitle').textContent = isPreview ? 'Preview de empresas' : 'Resultados de campaña';
      const tbody = document.getElementById('campResultBody');
      if (isPreview) {
        document.getElementById('campResultStats').innerHTML = '';
        tbody.innerHTML = results.map(c => `<tr>
          <td>${esc(c.name || '?')}</td>
          <td>${esc(c.domain || '-')}</td>
          <td>${esc(c.country || '-')}</td>
          <td>${c.headcount || '-'}</td>
          <td>-</td><td>-</td><td>-</td>
        </tr>`).join('');
      } else {
        const sent = results.filter(r => r.emailSent).length;
        const created = results.filter(r => r.leadCreated).length;
        const skipped = results.filter(r => r.skippedReason).length;
        document.getElementById('campResultStats').innerHTML = `
          <div class="stat-card"><div style="font-size:28px;font-weight:800">${results.length}</div><div style="color:#9ca3af;font-size:13px">Procesados</div></div>
          <div class="stat-card"><div style="font-size:28px;font-weight:800;color:#22c55e">${created}</div><div style="color:#9ca3af;font-size:13px">Leads creados</div></div>
          <div class="stat-card"><div style="font-size:28px;font-weight:800;color:#2563eb">${sent}</div><div style="color:#9ca3af;font-size:13px">Emails enviados</div></div>
          <div class="stat-card"><div style="font-size:28px;font-weight:800;color:#dc2626">${skipped}</div><div style="color:#9ca3af;font-size:13px">Skipped</div></div>
        `;
        tbody.innerHTML = results.map(r => {
          const c = r.company || {};
          const leadBadge = r.leadCreated ? '<span class="badge-ok">OK</span>' : (r.skippedReason ? '<span class="badge-no">' + esc(r.skippedReason.slice(0,20)) + '</span>' : '-');
          const emailBadge = r.emailSent ? '<span class="badge-ok">Sent</span>' : '<span class="badge-pending">No</span>';
          return `<tr>
            <td>${esc(c.name || '?')}</td>
            <td>${esc(c.domain || '-')}</td>
            <td>${esc(c.country || '-')}</td>
            <td>${c.headcount || '-'}</td>
            <td>${leadBadge}</td>
            <td>${r.auditScore != null ? r.auditScore + '/100' : '-'}</td>
            <td>${emailBadge}</td>
          </tr>`;
        }).join('');
      }
    }

    // ─── EMAIL TAB ───
    function loadEmails() {
      // Load drafts pipeline
      fetchApi('drafts').then(data => {
        const drafts = data.drafts || [];
        const stats = data.stats || {};
        const tbody = document.getElementById('draftBody');
        if (drafts.length === 0) {
          tbody.innerHTML = '';
          document.getElementById('emptyDrafts').style.display = 'block';
        } else {
          document.getElementById('emptyDrafts').style.display = 'none';
          tbody.innerHTML = drafts.map(d => {
            const statusBadge = d.status === 'draft' ? 'pending' : d.status === 'pending' ? 'info' : d.status === 'sent' ? 'ok' : 'no';
            const actions = [];
            if (d.status === 'draft') {
              actions.push(`<button class="btn-secondary" style="padding:4px 10px;font-size:11px;" onclick="previewDraft('${esc(d.id)}')">Ver</button>`);
              actions.push(`<button class="btn-primary" style="padding:4px 10px;font-size:11px;" onclick="approveDraft('${esc(d.id)}')">Aprobar</button>`);
              actions.push(`<button class="btn-danger" style="padding:4px 10px;font-size:11px;" onclick="rejectDraft('${esc(d.id)}')">Rechazar</button>`);
            } else if (d.status === 'pending') {
              actions.push(`<button class="btn-secondary" style="padding:4px 10px;font-size:11px;" onclick="previewDraft('${esc(d.id)}')">Ver</button>`);
              actions.push(`<button class="btn-primary" style="padding:4px 10px;font-size:11px;background:linear-gradient(135deg,#22c55e,#16a34a);" onclick="sendDraft('${esc(d.id)}')">Enviar</button>`);
            } else if (d.status === 'sent') {
              actions.push(`<button class="btn-secondary" style="padding:4px 10px;font-size:11px;" onclick="previewDraft('${esc(d.id)}')">Ver</button>`);
            }
            return `<tr>
              <td><span class="badge-${statusBadge}">${esc(d.status)}</span></td>
              <td>${esc(d.to_email || '?')}</td>
              <td>${esc((d.subject || '').slice(0,40))}</td>
              <td>${d.audit_score != null ? d.audit_score + '/100' : '-'}</td>
              <td>${esc(d.campaign_name || '-')}</td>
              <td>${d.created_at ? new Date(d.created_at).toLocaleString('es-ES') : '-'}</td>
              <td style="display:flex;gap:4px;">${actions.join('')}</td>
            </tr>`;
          }).join('');
        }
      }).catch(() => {});

      // Load sent emails from Resend
      fetchApi('emails').then(data => {
        window._emailsLoaded = true;
        const emails = data.emails || [];
        const stats = data.stats || {};
        document.getElementById('emailStats').innerHTML = `
          <div class="stat-card"><div style="font-size:28px;font-weight:800">${stats.total || 0}</div><div style="color:#9ca3af;font-size:13px">Total enviados</div></div>
          <div class="stat-card"><div style="font-size:28px;font-weight:800;color:#22c55e">${stats.delivered || 0}</div><div style="color:#9ca3af;font-size:13px">Entregados</div></div>
          <div class="stat-card"><div style="font-size:28px;font-weight:800;color:#2563eb">${stats.opened || 0}</div><div style="color:#9ca3af;font-size:13px">Abiertos</div></div>
          <div class="stat-card"><div style="font-size:28px;font-weight:800;color:#EC5F29">${stats.clicked || 0}</div><div style="color:#9ca3af;font-size:13px">Clicks</div></div>
          <div class="stat-card"><div style="font-size:28px;font-weight:800;color:#dc2626">${stats.bounced || 0}</div><div style="color:#9ca3af;font-size:13px">Rebotados</div></div>
          <div class="stat-card"><div style="font-size:28px;font-weight:800;color:#070F2D">${stats.openRate || 0}%</div><div style="color:#9ca3af;font-size:13px">Open Rate</div></div>
        `;
        const tbody = document.getElementById('emailBody');
        if (emails.length === 0) {
          tbody.innerHTML = '';
          document.getElementById('emptyEmails').style.display = 'block';
          return;
        }
        document.getElementById('emptyEmails').style.display = 'none';
        tbody.innerHTML = emails.map(e => {
          const to = Array.isArray(e.to) ? e.to.join(', ') : (e.to || '?');
          const status = e.last_event || 'queued';
          const badge = status === 'delivered' ? 'ok' : status === 'opened' ? 'info' : status === 'clicked' ? 'info' : status === 'bounced' ? 'no' : 'pending';
          const campaign = (e.tags && e.tags.campaign) || '-';
          const date = e.created_at ? new Date(e.created_at).toLocaleString('es-ES') : '-';
          return `<tr style="cursor:pointer" onclick="previewEmail('${esc(e.id)}')">
            <td>${esc(to)}</td>
            <td>${esc(e.subject || '-')}</td>
            <td><span class="badge-${badge}">${esc(status)}</span></td>
            <td>${esc(campaign)}</td>
            <td>${date}</td>
          </tr>`;
        }).join('');
      }).catch(err => {
        document.getElementById('emailStats').innerHTML = `<div class="stat-card" style="color:#dc2626">Error cargando emails: ${esc(err.message || String(err))}</div>`;
      });
    }

    function approveDraft(id) {
      fetchApi('drafts/' + id + '/approve', { method: 'POST' }).then(() => { loadEmails(); });
    }
    function rejectDraft(id) {
      if (!confirm('¿Rechazar este email? No se enviará.')) return;
      fetchApi('drafts/' + id + '/reject', { method: 'POST' }).then(() => { loadEmails(); });
    }
    function sendDraft(id) {
      if (!confirm('¿Enviar este email ahora?')) return;
      fetchApi('drafts/' + id + '/send', { method: 'POST' }).then(data => {
        if (data.ok) alert('Enviado: ' + (data.emailId || ''));
        else alert('Error: ' + JSON.stringify(data));
        loadEmails();
      });
    }
    function sendAllPending() {
      fetchApi('drafts/send-all-pending', { method: 'POST' }).then(data => {
        alert(`Enviados: ${data.sent}, Fallidos: ${data.failed}`);
        loadEmails();
      });
    }
    function previewDraft(id) {
      fetchApi('drafts/' + id).then(data => {
        const d = data.draft || data;
        const card = document.getElementById('emailPreviewCard');
        card.style.display = 'block';
        document.getElementById('emailPreviewTitle').textContent = 'Draft: ' + (d.subject || id);
        document.getElementById('emailPreviewMeta').innerHTML = `
          <strong>To:</strong> ${esc(d.to_email || '?')} (${esc(d.to_name || '')})<br>
          <strong>Subject:</strong> ${esc(d.subject || '-')}<br>
          <strong>Status:</strong> <span class="badge-${d.status === 'draft' ? 'pending' : d.status === 'sent' ? 'ok' : 'info'}">${esc(d.status || '?')}</span><br>
          <strong>Campaign:</strong> ${esc(d.campaign_name || '-')} | <strong>Score:</strong> ${d.audit_score != null ? d.audit_score + '/100' : '-'}
        `;
        document.getElementById('emailPreviewFrame').srcdoc = d.html || '<p>Sin contenido HTML</p>';
        card.scrollIntoView({ behavior: 'smooth' });
      });
    }

    function previewEmail(emailId) {
      fetchApi('emails/' + emailId).then(data => {
        const email = data.email || data;
        const card = document.getElementById('emailPreviewCard');
        card.style.display = 'block';
        document.getElementById('emailPreviewTitle').textContent = 'Vista previa: ' + (email.subject || emailId);
        const to = Array.isArray(email.to) ? email.to.join(', ') : (email.to || '?');
        const events = (email.events || []).map(ev => `<span class="badge-${ev.type === 'opened' ? 'info' : ev.type === 'delivered' ? 'ok' : ev.type === 'bounced' ? 'no' : 'pending'}">${esc(ev.type)} ${new Date(ev.created_at).toLocaleString('es-ES')}</span>`).join(' ');
        document.getElementById('emailPreviewMeta').innerHTML = `
          <strong>To:</strong> ${esc(to)}<br>
          <strong>From:</strong> ${esc(email.from || '-')}<br>
          <strong>Subject:</strong> ${esc(email.subject || '-')}<br>
          <strong>Status:</strong> ${esc(email.last_event || 'unknown')}<br>
          ${events ? '<strong>Events:</strong> ' + events : ''}
        `;
        const frame = document.getElementById('emailPreviewFrame');
        const htmlContent = email.html || ('<pre style="padding:16px;font-family:monospace;white-space:pre-wrap">' + esc(email.text || 'Sin contenido') + '</pre>');
        frame.srcdoc = htmlContent;
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }).catch(err => {
        alert('Error cargando email: ' + (err.message || String(err)));
      });
    }

    // Auto-login if key stored
    if (adminKey) {
      fetchApi('leads').then(data => {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        renderLeads(data);
      }).catch(() => {
        localStorage.removeItem('scanboost_admin_key');
        document.getElementById('loginScreen').style.display = 'flex';
      });
    }