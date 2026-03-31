# CROAgent — Database Schema (SQLite)

## Tabla: leads

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | TEXT | PRIMARY KEY |
| email | TEXT | NOT NULL |
| url | TEXT | NOT NULL |
| created_at | TEXT | NOT NULL (ISO 8601) |
| audit_id | TEXT | REFERENCES audits(id) |

**Índices:** `idx_leads_email` en `email`

---

## Tabla: audits

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | TEXT | PRIMARY KEY |
| lead_id | TEXT | NOT NULL, REFERENCES leads(id) |
| url | TEXT | NOT NULL |
| normalized_url | TEXT | NOT NULL, UNIQUE |
| status | TEXT | NOT NULL, DEFAULT 'pending' |
| global_score | INTEGER | NULL |
| scores_json | TEXT | NULL (JSON) |
| quick_wins_json | TEXT | NULL (JSON) |
| mockups_json | TEXT | NULL (JSON) |
| report_json | TEXT | NULL (JSON) |
| created_at | TEXT | NOT NULL (ISO 8601) |
| completed_at | TEXT | NULL (ISO 8601) |

**Índices:** `idx_audits_normalized_url` UNIQUE en `normalized_url`

---

## Notas

- `normalized_url` es la clave para evitar duplicados (RN-01, RN-02)
- Los campos JSON almacenan los resultados estructurados de los agentes
- No se almacenan screenshots ni HTML raw después de completar la auditoría (privacidad)
- SQLite elegido por simplicidad; migrable a PostgreSQL si escala
