# CROAgent — Product Requirements Document

## Visión
Herramienta automática de auditoría CRO que analiza cualquier URL y genera un informe accionable con quickwins de conversión y mockups de mejora. Funciona como lead magnet: una auditoría gratuita por URL a cambio del email del usuario.

## Usuarios
- **Usuario final**: Propietario de web/ecommerce que quiere mejorar su conversión
- **Operador**: Equipo que usa CROAgent para captar leads cualificados

## Flujo Principal

```
1. Usuario introduce email + URL en el formulario
2. Sistema valida email y URL
3. Sistema verifica que la URL no ha sido analizada previamente
4. Si ya existe → muestra mensaje "Esta URL ya ha sido analizada"
5. Si es nueva → registra lead y lanza auditoría
6. Scraper captura HTML completo + screenshot (above the fold + full page)
7. Pipeline de agentes analiza en paralelo:
   a. Gemini: análisis visual (screenshots) → jerarquía, CTAs, layout
   b. Gemini: análisis UX heurístico (HTML + screenshots) → Nielsen, accesibilidad
   c. Gemini: análisis de trust signals → social proof, garantías, sellos
   d. Groq: análisis de copy → headlines, propuesta de valor, CTAs texto
   e. Gemini: análisis mobile (screenshot mobile)
8. Performance Agent ejecuta Lighthouse básico (local)
9. Synthesis Agent consolida resultados → scoring + quickwins priorizados
10. Mockup Agent genera propuestas visuales HTML de las top mejoras
11. Sistema genera informe HTML/PDF
12. Usuario recibe/visualiza el informe
```

## Reglas de Negocio

| Regla | Descripción |
|-------|-------------|
| RN-01 | Cada URL se normaliza (sin trailing slash, sin query params de tracking) antes de verificar unicidad |
| RN-02 | Una URL solo puede ser analizada una vez en todo el sistema |
| RN-03 | El email es obligatorio y debe ser válido |
| RN-04 | El informe se genera en máximo 3 minutos |
| RN-05 | Si un agente falla, el informe se genera con los datos disponibles (degradación graceful) |
| RN-06 | Los screenshots se toman en viewport desktop (1440x900) y mobile (375x812) |
| RN-07 | El HTML scrapeado se limita a 500KB para no exceder contextos |
| RN-08 | El scoring global es media ponderada de las categorías |

## Categorías de Análisis

| Categoría | Peso | Agente | LLM |
|-----------|------|--------|-----|
| Jerarquía Visual | 20% | Visual Hierarchy Agent | Gemini |
| UX Heurísticas | 20% | UX Heuristics Agent | Gemini |
| Copy & Messaging | 20% | Copy Agent | Groq |
| Trust & Social Proof | 15% | Trust Agent | Gemini |
| Mobile Experience | 15% | Mobile Agent | Gemini |
| Performance | 10% | Performance Agent | Lighthouse |

## Estructura del Informe

1. **Header**: URL analizada, fecha, scoring global (0-100)
2. **Resumen ejecutivo**: 3 líneas sobre el estado general
3. **Scoring por categoría**: Gráfico radar con las 6 categorías
4. **Top 5 QuickWins**: Ordenados por impacto/esfuerzo, con:
   - Problema detectado
   - Recomendación concreta
   - Impacto estimado (alto/medio/bajo)
   - Esfuerzo estimado (alto/medio/bajo)
5. **Mockups**: 2-3 propuestas visuales HTML de las mejoras más impactantes
6. **Detalle por categoría**: Hallazgos completos de cada agente
7. **Footer**: CTA para contratar auditoría completa (upsell)

## Requisitos No Funcionales

- **Coste**: $0 en LLMs (tiers gratuitos de Gemini y Groq)
- **Tiempo de respuesta**: < 3 minutos por auditoría
- **Concurrencia**: Soportar al menos 5 auditorías simultáneas
- **Privacidad**: No almacenar HTML/screenshots después de generar el informe
- **Disponibilidad**: Las URLs de análisis son públicas, no se requiere auth para el scraping
