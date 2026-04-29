---
id: FEAT-002
title: 5 matviews precomputadas para los 4 dashboards
severity: high
type: feature
status: open
created: 2026-04-29
owner: -
blocked_by: [FEAT-001]
---

# FEAT-002 · Capa precomputada (materialized views)

## Objetivo

Crear 5 materialized views que precomputen agregaciones costosas. Los RPCs `dashboard_*` solo deben hacer SELECT de matview → respuesta < 50ms en lugar de los 200-500ms que toma agregar 8-15 tablas en cada request.

## Las matviews

### 1. `mv_dashboard_health` (refresh cada 5 min)

Una fila por organización con todos los componentes del Score de Salud Global precomputados.

```sql
CREATE MATERIALIZED VIEW public.mv_dashboard_health AS
SELECT
  o.id AS organization_id,
  public.health_score(o.id) AS score,
  -- Componentes desglosados
  (SELECT count(*) FROM brand_vulnerabilities WHERE organization_id = o.id AND status = 'open' AND severity = 'critical') AS critical_open,
  (SELECT count(*) FROM brand_vulnerabilities WHERE organization_id = o.id AND status IN ('open', 'in_progress')) AS vuln_active,
  (SELECT count(*) FROM vera_pending_actions WHERE organization_id = o.id AND status = 'pending') AS pending_count,
  (SELECT max(captured_at) FROM brand_posts bp JOIN brand_containers bc ON bc.id = bp.brand_container_id WHERE bc.organization_id = o.id) AS last_post_at,
  now() AS computed_at
FROM organizations o
WHERE o.deleted_at IS NULL;

CREATE UNIQUE INDEX idx_mv_dashboard_health_org ON public.mv_dashboard_health(organization_id);
```

### 2. `mv_threat_level` (refresh cada 5 min)

```sql
CREATE MATERIALIZED VIEW public.mv_threat_level AS
SELECT
  o.id AS organization_id,
  public.threat_level(o.id) AS level,
  -- Drivers individuales
  (SELECT count(*) FROM competitor_ads WHERE organization_id = o.id AND first_seen_at > now() - interval '2 hours') AS new_ads_2h,
  (SELECT count(*) FROM retail_prices WHERE organization_id = o.id AND captured_at > now() - interval '24 hours') AS price_changes_24h,
  (SELECT count(*) FROM intelligence_signals s
   JOIN intelligence_entities e ON e.id = s.entity_id
   WHERE e.organization_id = o.id AND s.signal_type IN ('crisis', 'negative_review')
     AND s.captured_at > now() - interval '24 hours') AS crisis_signals_24h,
  now() AS computed_at
FROM organizations o WHERE o.deleted_at IS NULL;

CREATE UNIQUE INDEX idx_mv_threat_level_org ON public.mv_threat_level(organization_id);
```

### 3. `mv_signal_velocity_24h` (refresh cada 15 min)

```sql
CREATE MATERIALIZED VIEW public.mv_signal_velocity_24h AS
SELECT
  e.organization_id,
  s.signal_type,
  count(*) AS total,
  count(*) FILTER (WHERE s.captured_at > now() - interval '1 hour') AS last_1h,
  count(*) FILTER (WHERE s.captured_at > now() - interval '6 hours') AS last_6h,
  count(*) FILTER (WHERE s.captured_at > now() - interval '24 hours') AS last_24h,
  now() AS computed_at
FROM intelligence_signals s
JOIN intelligence_entities e ON e.id = s.entity_id
WHERE s.captured_at > now() - interval '24 hours'
GROUP BY e.organization_id, s.signal_type;

CREATE INDEX idx_mv_signal_vel_org ON public.mv_signal_velocity_24h(organization_id);
```

### 4. `mv_brand_format_stats` (refresh cada 1h)

Distribución de formatos por marca para el Widget 3 de Mi Marca.

```sql
CREATE MATERIALIZED VIEW public.mv_brand_format_stats AS
SELECT
  bc.organization_id,
  bp.brand_container_id,
  COALESCE((m.elem->>'type')::text, 'unknown') AS asset_type,
  count(*) AS posts,
  AVG(COALESCE((bp.metrics->>'reach')::numeric, 0)) AS avg_reach,
  AVG(COALESCE((bp.metrics->>'engagement')::numeric, 0)) AS avg_engagement,
  now() AS computed_at
FROM brand_posts bp
JOIN brand_containers bc ON bc.id = bp.brand_container_id
LEFT JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(bp.media_assets) = 'array' THEN bp.media_assets ELSE '[]'::jsonb END
) AS m(elem) ON true
WHERE bp.post_source = 'own'
  AND bp.captured_at > now() - interval '30 days'
GROUP BY bc.organization_id, bp.brand_container_id, asset_type;

CREATE INDEX idx_mv_format_org ON public.mv_brand_format_stats(organization_id);
```

### 5. `mv_sentiment_breakdown` (refresh cada 1h)

```sql
CREATE MATERIALIZED VIEW public.mv_sentiment_breakdown AS
SELECT
  bc.organization_id,
  bp.brand_container_id,
  count(*) FILTER (WHERE bp.sentiment->>'overall' = 'positive') AS positivo,
  count(*) FILTER (WHERE bp.sentiment->>'overall' = 'negative') AS negativo,
  count(*) FILTER (WHERE bp.sentiment->>'overall' = 'neutral')  AS neutro,
  count(*) AS total,
  now() AS computed_at
FROM brand_posts bp
JOIN brand_containers bc ON bc.id = bp.brand_container_id
WHERE bp.captured_at > now() - interval '30 days'
GROUP BY bc.organization_id, bp.brand_container_id;

CREATE INDEX idx_mv_sentiment_org ON public.mv_sentiment_breakdown(organization_id);
```

## Pasos para resolver

1. Resolver primero [FEAT-001](./FEAT-001-scoring-functions-sql.md) (las funciones de scoring).
2. Crear `SQL/functions/mv_dashboard_health.sql` con la matview.
3. Crear las otras 4 matviews en archivos separados.
4. Aplicar todas via Management API.
5. Refresh inicial de cada una:
   ```sql
   REFRESH MATERIALIZED VIEW public.mv_dashboard_health;
   ```
6. Configurar pg_cron (ver [FEAT-004](./FEAT-004-pg-cron-refresh-jobs.md)).

## Criterio de done

- Las 5 matviews existen en `pg_matviews`.
- Cada una tiene índice unique (para refresh `CONCURRENTLY`).
- `SELECT FROM mv_dashboard_health WHERE organization_id = '<org>'` devuelve 1 fila con score.
- Refresh `CONCURRENTLY` funciona sin lock.
- Documentado en `09-current-state.md` (mover de "pendiente" a "funciona").
