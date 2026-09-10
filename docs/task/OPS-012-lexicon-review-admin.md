---
id: OPS-012
title: UI de revision/aprobacion de lexicon (dimension_lexicon + enrich_lexicon_proposal)
severity: medium
type: ops
status: open
auto_eligible: no
auto_eligible_reason: requiere admin/developer logueado para curar el lexicon (no automatizable)
est_duration: medium
created: 2026-05-22
related: AUDIT-001-frontend-vs-backend-2026-05-05 (origen)
owner: -
---

# OPS-012 · UI de revision de lexicon

## Sintoma / oportunidad

Backend ya tiene:
- `dimension_lexicon`: vocabulario controlado por dimension (tono, topic, formato, etc.)
- `enrich_lexicon_proposal`: workflow para proponer terminos nuevos detectados por scrapers/Vera

**Frontend NO tiene UI para curar**: las propuestas se acumulan en BD sin que nadie las apruebe/rechace, y el vocabulario sigue sin enriquecerse → analisis de signals queda con vocabulario obsoleto.

## Acciones

1. **Vista admin `/dev/lexicon`** (gated por `is_developer()`):
   - Tabs por dimension: tono / topic / formato / pillar / etc.
   - Lista de terminos vigentes (`dimension_lexicon`) con count de usos
   - Tab "Propuestas pendientes" con items de `enrich_lexicon_proposal` (status='pending')
   - Por cada propuesta: termino + ejemplos detectados + boton aprobar / rechazar / editar y aprobar

2. **Aprobacion** inserta en `dimension_lexicon` + marca propuesta `status='approved'`. Rechazo marca `status='rejected'` con razon

3. **Realtime** (opcional): suscribir a `enrich_lexicon_proposal` INSERT para badge "N propuestas nuevas"

## Criterio de done

- Ruta `/dev/lexicon` accesible solo developers
- Listado de propuestas pendientes funciona
- Aprobar/rechazar persiste cambios y refresca la lista
- Si se quiere demo: agregar 3-5 propuestas dummy para testing

## Out of scope

- Bulk approve/reject — empezar uno por uno
- Sugerencias automaticas de variantes — futuro
- Estadisticas de impacto del lexicon en signals — futuro

## Referencias

- Tabla `dimension_lexicon` (vocabulario controlado)
- Tabla `enrich_lexicon_proposal` (workflow review)
- Origen: `AUDIT-001-frontend-vs-backend-2026-05-05.md` P4

---

## Revisado 2026-09-10 — choca con SEC-004, decidir antes de construir

Medido: `dimension_lexicon` tiene **215 filas**, `enrich_lexicon_proposal`
**no existe** en la base, y `DevLeadLexiconView.js` sigue siendo un shell
("Próximamente"). La ficha es exacta.

**Pero construirla hoy contradice a [SEC-004](./SEC-004-migrar-panel-dev-a-repo-propio.md):**
esa tarea quiere sacar las 19 vistas `/dev/*` de `console` a `AISC-Admin` detrás
de Cloudflare Access. Añadir una vista dev número 20 es sumarle trabajo a la
migración que estamos por hacer, y además nace en el lado inseguro.

Además el orden ya se cumplió: SEC-004 decía ir *después* de SEC-001 y SEC-002,
y las dos ya están (SEC-001 cerrada, SEC-002 con el núcleo cerrado el 2026-09-10).

**Decisión pendiente:** construir `/dev/lexicon` en `AISC-Admin` (no en console),
o dejar OPS-012 congelada hasta que SEC-004 termine. No construirla en console.
