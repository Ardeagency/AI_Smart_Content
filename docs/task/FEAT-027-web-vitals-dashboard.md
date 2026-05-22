---
id: FEAT-027
title: Web Vitals Dashboard UI (LCP/CLS/FCP/INP/TTFB p75 + p95)
severity: low
type: feature
status: open
auto_eligible: no
auto_eligible_reason: requiere decisiones de UX (filtros, charts, time ranges)
est_duration: short
created: 2026-05-22
related: ROADMAP-POST-OPTIMIZATION-2026-05-12 (origen)
owner: -
---

# FEAT-027 · Web Vitals Dashboard UI

## Sintoma / oportunidad

Modulo `js/utils/webvitals.js` (commit `7883799a`) ya envia samples de **LCP/CLS/FCP/INP/TTFB** a `public.frontend_errors` con `ctx->>'source' = 'webvital'`. Tras los 32 commits de optimizacion (perf+a11y+observabilidad+SEO del 2026-05-12) **no tenemos forma facil de validar empiricamente** que las metricas mejoraron.

Hoy responder "el LCP bajo tras el critical CSS?" requiere entrar al SQL Editor de Supabase. Eso desincentiva el monitoreo y deja regresiones futuras invisibles.

## Acciones

1. **Vista `/dev/web-vitals`** (gated por `is_developer()`)
2. **RPC `dashboard_web_vitals(p_days int, p_route text default null)`** que retorna percentiles:
   ```sql
   PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (s->>'value')::numeric) AS p75,
   PERCENTILE_CONT(0.95) WITHIN GROUP (...) AS p95,
   COUNT(*) AS samples
   FROM frontend_errors, LATERAL jsonb_array_elements(ctx->'samples') s
   WHERE ctx->>'source' = 'webvital'
     AND s->>'name' = $metric
     AND created_at > now() - (p_days || ' days')::interval
   GROUP BY metric_name
   ```
3. **UI**: cards por metrica (5 cards: LCP/CLS/FCP/INP/TTFB) con p75 + p95 + sample count + color segun threshold Google (good/needs-improvement/poor)
4. **Filtros**: time range (7d/30d/90d) + route (opcional)
5. **Trend chart**: serie temporal de p75 dia a dia (sparkline o ECharts line)

## Criterio de done

- Ruta `/dev/web-vitals` carga en <2s
- 5 cards muestran metricas correctas con thresholds Google
- Filtro time range refresca data
- Stakeholders no-tecnicos pueden leer "esta verde" sin SQL

## Referencias

- `js/utils/webvitals.js` (modulo que recolecta samples)
- Tabla `frontend_errors` con `ctx->>'source' = 'webvital'`
- Origen: `ROADMAP-POST-OPTIMIZATION-2026-05-12.md` item 1
