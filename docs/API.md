# CROAgent — API Endpoints

Base URL: `/api/v1`

---

## POST /audit

Solicita una auditoría CRO para una URL.

**Request:**
```json
{
  "email": "usuario@ejemplo.com",
  "url": "https://ejemplo.com"
}
```

**Response 201 (Auditoría iniciada):**
```json
{
  "auditId": "aud_abc123",
  "status": "pending",
  "message": "Auditoría iniciada. Recibirás el informe en unos minutos."
}
```

**Response 409 (URL ya analizada):**
```json
{
  "error": "Esta URL ya ha sido analizada",
  "code": "URL_ALREADY_AUDITED"
}
```

**Response 400 (Validación):**
```json
{
  "error": "Email inválido",
  "code": "INVALID_EMAIL"
}
```

---

## GET /audit/:id

Consulta el estado de una auditoría.

**Response 200:**
```json
{
  "auditId": "aud_abc123",
  "status": "analyzing",
  "message": "Analizando la página..."
}
```

---

## GET /audit/:id/report

Obtiene el informe completo de una auditoría finalizada.

**Response 200:**
```json
{
  "auditId": "aud_abc123",
  "url": "https://ejemplo.com",
  "globalScore": 62,
  "scores": {
    "visualHierarchy": { "value": 55, "label": "fair" },
    "uxHeuristics": { "value": 70, "label": "good" },
    "copyMessaging": { "value": 45, "label": "poor" },
    "trustSignals": { "value": 65, "label": "fair" },
    "mobileExperience": { "value": 72, "label": "good" },
    "performance": { "value": 80, "label": "good" }
  },
  "executiveSummary": "La web presenta una propuesta de valor poco clara...",
  "quickWins": [
    {
      "rank": 1,
      "title": "CTA principal poco visible",
      "problem": "El botón de acción principal tiene bajo contraste...",
      "recommendation": "Aumentar tamaño a 48px, color de alto contraste...",
      "impact": "high",
      "effort": "low",
      "category": "visualHierarchy",
      "priorityScore": 9.5
    }
  ],
  "mockups": [
    {
      "title": "Hero section mejorada",
      "description": "Propuesta con CTA prominente y propuesta de valor clara",
      "htmlContent": "<div style='...'>...</div>",
      "relatedQuickWin": 1
    }
  ],
  "categoryDetails": [],
  "generatedAt": "2026-03-31T10:30:00Z"
}
```

**Response 202 (Aún procesando):**
```json
{
  "error": "La auditoría aún está en proceso",
  "code": "AUDIT_IN_PROGRESS"
}
```

---

## GET /health

Health check del servicio.

**Response 200:**
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```
