---
id: FEAT-001
title: Funciones SQL puras de scoring (health, threat, velocity)
severity: high
type: feature
status: open
auto_eligible: yes
auto_eligible_reason: SQL puro STABLE, idempotente; verificable con SELECT en rango esperado
est_duration: medium
created: 2026-04-29
owner: -
---

# FEAT-001 · Funciones SQL puras de scoring

## Objetivo

Crear funciones SQL **inmutables/estables** que computen los 3 scores núcleo de la plataforma:

1. `health_score(p_org_id uuid) → numeric` — Score de Salud Global del Dashboard de Estrategia.
2. `threat_level(p_org_id uuid) → text` — Nivel de Amenaza Competitiva (`bajo/medio/alto/crítico`).
3. `mention_velocity(p_entity_id uuid, p_hours int) → numeric` — Aceleración de menciones de una entity en X horas.

## Por qué SQL puro

- Reusable desde matviews (`mv_dashboard_health` las llama).
- Reusable desde RPCs (`dashboard_estrategia` las llama).
- Reusable desde el ai-engine (Vera puede pedir contextos vía SQL).
- Performance: Postgres optimiza calls inline, sin round-trip a JS.

## Especificaciones

### `health_score(org)`

Fórmula del spec (`dashboard_estrategia_spec`):

```
health = (tone_coherence * 0.25)
       + ((1 - vulnerabilidades_criticas_ratio) * 0.30)
       + (stock_disponible_ratio * 0.20)
       + (acciones_aprobadas_a_tiempo_ratio * 0.25)
       × 100  → escala 0-100
```

Inputs (todos org-scoped):
- `tone_coherence`: AVG de `brand_content_analysis.tone_coherence_score` últimos 30d.
- `vulnerabilidades_criticas_ratio`: count(severity='critical' AND status='open') / count(total open) — invertido.
- `stock_disponible_ratio`: count(stock_status='in_stock') / count(*) en `retail_prices` última captura.
- `acciones_aprobadas_a_tiempo`: count(status='executed' AND executed_at <= expires_at) / count(*) últimas 30d.

### `threat_level(org)`

Fórmula:
```
threat_score = ads_nuevos_2h * 0.40
             + cambios_precio_stock_24h * 0.35
             + crisis_o_mencion_masiva * 0.25
```

Mapeo:
- `< 30` → `bajo`
- `30-60` → `medio`
- `60-85` → `alto`
- `>= 85` → `critico`

### `mention_velocity(entity, hours)`

```
velocity = (mentions_in_last_h_hours - mentions_in_prev_h_hours) / mentions_in_prev_h_hours
         (signed, normalized to [-1, +∞))
```

## Implementación sugerida

```sql
CREATE OR REPLACE FUNCTION public.health_score(p_org_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tone numeric;
  v_vuln_ratio numeric;
  v_stock_ratio numeric;
  v_action_ratio numeric;
  v_total numeric;
BEGIN
  -- 1. Tone coherence avg (30d)
  SELECT COALESCE(AVG(tone_coherence_score), 0.5) INTO v_tone
  FROM brand_content_analysis bca
  JOIN brand_containers bc ON bc.id = bca.brand_container_id
  WHERE bc.organization_id = p_org_id
    AND bca.analyzed_at >= now() - interval '30 days';

  -- 2. Vulnerabilities ratio (open total → critical proporción)
  SELECT
    1 - COALESCE(
      count(*) FILTER (WHERE severity = 'critical')::numeric /
      NULLIF(count(*) FILTER (WHERE status IN ('open', 'in_progress'))::numeric, 0),
      0
    )
  INTO v_vuln_ratio
  FROM brand_vulnerabilities
  WHERE organization_id = p_org_id;

  -- 3. Stock ratio (última captura por SKU)
  WITH latest AS (
    SELECT DISTINCT ON (retailer, sku) retailer, sku, stock_status
    FROM retail_prices
    WHERE organization_id = p_org_id
    ORDER BY retailer, sku, captured_at DESC
  )
  SELECT COALESCE(
    count(*) FILTER (WHERE stock_status = 'in_stock')::numeric / NULLIF(count(*)::numeric, 0),
    1.0
  ) INTO v_stock_ratio
  FROM latest;

  -- 4. Action approval timeliness (30d)
  SELECT COALESCE(
    count(*) FILTER (WHERE status = 'executed' AND executed_at <= expires_at)::numeric /
    NULLIF(count(*)::numeric, 0),
    0.5
  ) INTO v_action_ratio
  FROM vera_pending_actions
  WHERE organization_id = p_org_id
    AND created_at >= now() - interval '30 days';

  v_total := (v_tone * 0.25 + v_vuln_ratio * 0.30 + v_stock_ratio * 0.20 + v_action_ratio * 0.25) * 100;
  RETURN ROUND(v_total, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.health_score(uuid) TO authenticated;
COMMENT ON FUNCTION public.health_score(uuid) IS 'Score de Salud Global 0-100 (tone 25% + vuln 30% + stock 20% + actions 25%)';
```

Análogos para `threat_level` y `mention_velocity`.

## Pasos para resolver

1. Crear archivo `SQL/functions/scoring_health_score.sql` con la función.
2. Crear `SQL/functions/scoring_threat_level.sql`.
3. Crear `SQL/functions/scoring_mention_velocity.sql`.
4. Aplicar via Management API.
5. Probar con la org de Arde:
   ```sql
   SELECT public.health_score('a1000000-0000-0000-0000-000000000001');
   SELECT public.threat_level('a1000000-0000-0000-0000-000000000001');
   ```
6. Verificar valores razonables (0-100, etc.).

## Criterio de done

- Las 3 funciones existen en `pg_proc` con `prosecdef=true` y son `STABLE`.
- Devuelven valores en rango esperado.
- Documentadas con `COMMENT ON FUNCTION ...` legible.
- Las matviews de [FEAT-002](./FEAT-002-materialized-views-precomputed-layer.md) las usan.
