---
id: FEAT-003
title: Tabla brand_metrics_daily + cron 00:00 UTC para snapshots
severity: medium
type: feature
status: open
created: 2026-04-29
owner: -
---

# FEAT-003 · Snapshot histórico diario

## Objetivo

Capturar diariamente el estado de las métricas clave por org/brand para permitir gráficas de evolución real (último mes, último trimestre, etc.) sin tener que recomputar agregaciones costosas en cada request.

## Schema propuesto

```sql
CREATE TABLE public.brand_metrics_daily (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  brand_container_id uuid REFERENCES public.brand_containers(id),
  snapshot_date date NOT NULL,
  posts_count int,
  posts_engagement_total numeric,
  sentiment_score numeric,        -- positivo / total
  mentions_count int,
  vulnerabilities_open int,
  vulnerabilities_critical int,
  pending_actions int,
  approved_actions_24h int,
  health_score numeric,
  threat_level text,
  metadata jsonb DEFAULT '{}'::jsonb,
  computed_at timestamptz DEFAULT now(),
  CONSTRAINT brand_metrics_daily_pkey PRIMARY KEY (id),
  CONSTRAINT brand_metrics_daily_unique UNIQUE (organization_id, brand_container_id, snapshot_date)
);

CREATE INDEX idx_bmd_org_date ON public.brand_metrics_daily(organization_id, snapshot_date DESC);
CREATE INDEX idx_bmd_brand_date ON public.brand_metrics_daily(brand_container_id, snapshot_date DESC);

ALTER TABLE public.brand_metrics_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org-scoped read" ON public.brand_metrics_daily FOR SELECT
  USING (is_developer() OR is_org_member(organization_id));
```

## Función SQL que computa el snapshot

```sql
CREATE OR REPLACE FUNCTION public.compute_brand_metrics_daily()
RETURNS int -- # filas insertadas
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ ... $$;
```

## pg_cron job

```sql
SELECT cron.schedule(
  'brand_metrics_daily_snapshot',
  '5 0 * * *',  -- 00:05 UTC todos los días
  $$ SELECT public.compute_brand_metrics_daily(); $$
);
```

## Pasos

1. Crear schema en `SQL/migrations/<date>_brand_metrics_daily.sql`.
2. Crear función `compute_brand_metrics_daily()`.
3. Programar cron.
4. Backfill: ejecutar manualmente para los últimos 30-90 días con `generate_series`:
   ```sql
   -- pseudocódigo
   FOR each_day IN generate_series(now() - 90 days, now(), '1 day') LOOP
     INSERT brand_metrics_daily computed for that day...
   END LOOP;
   ```
   (requiere lógica más cuidada porque agregaciones son históricas).

## Criterio de done

- Tabla creada con RLS.
- Función computa snapshot del día y hace UPSERT idempotente.
- Cron registrado en `cron.job` y ejecuta diariamente.
- Backfill de últimos 30 días al menos.
- Dashboards pueden consumir `brand_metrics_daily` para gráficas históricas.
