---
id: FEAT-004
title: pg_cron jobs para refresh de matviews (5/15/60 min)
severity: medium
type: feature
status: open
auto_eligible: yes
auto_eligible_reason: 6 cron.schedule(...) calls; verificable con SELECT cron.job
est_duration: short
created: 2026-04-29
owner: -
blocked_by: [FEAT-002]
---

# FEAT-004 · Cron jobs de refresh

## Objetivo

Automatizar el refresh de las matviews con `pg_cron` (ya instalado, versión 1.6.4).

## Cadencias propuestas

| Matview | Schedule | Comentario |
|---|---|---|
| `mv_dashboard_health` | `*/5 * * * *` (cada 5 min) | Score se recalcula |
| `mv_threat_level` | `*/5 * * * *` | Amenaza se recalcula |
| `mv_signal_velocity_24h` | `*/15 * * * *` | Rolling 24h |
| `mv_brand_format_stats` | `0 * * * *` (cada hora) | Distribución no cambia tan rápido |
| `mv_sentiment_breakdown` | `0 * * * *` | Idem |
| `v_orphan_topics` (matview existente) | `*/15 * * * *` | Refresh continuo, hoy es manual |

## Comando

```sql
SELECT cron.schedule(
  'refresh_mv_dashboard_health',
  '*/5 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_dashboard_health; $$
);
SELECT cron.schedule(
  'refresh_mv_threat_level',
  '*/5 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_threat_level; $$
);
SELECT cron.schedule(
  'refresh_mv_signal_velocity_24h',
  '*/15 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_signal_velocity_24h; $$
);
SELECT cron.schedule(
  'refresh_mv_brand_format_stats',
  '0 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_brand_format_stats; $$
);
SELECT cron.schedule(
  'refresh_mv_sentiment_breakdown',
  '0 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_sentiment_breakdown; $$
);
SELECT cron.schedule(
  'refresh_v_orphan_topics',
  '*/15 * * * *',
  $$ REFRESH MATERIALIZED VIEW public.v_orphan_topics; $$
);
```

## Pasos

1. Crear `SQL/cron/refresh_matviews.sql`.
2. Aplicar via Mgmt API.
3. Verificar:
   ```sql
   SELECT jobid, schedule, jobname, active FROM cron.job;
   ```
4. Esperar 15 min y verificar `cron.job_run_details` para ver ejecuciones exitosas.

## Criterio de done

- 6 cron jobs creados, todos `active=true`.
- `cron.job_run_details` muestra ejecuciones con `status='succeeded'`.
- `computed_at` de cada matview se actualiza según cadencia.
- No aparecen errores `concurrent refresh requires unique index` (si pasa: faltó UNIQUE INDEX).
