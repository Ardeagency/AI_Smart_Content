---
id: FEAT-006
title: Crear dashboard_competencia/tendencias/estrategia + v2 de mi_marca
severity: medium
type: feature
status: open
created: 2026-04-29
owner: -
blocked_by: [FEAT-002]
---

# FEAT-006 · RPCs de dashboard restantes

## Estado actual

| RPC | Estado |
|---|---|
| `dashboard_mi_marca` | ✅ v1 aplicada (lee tablas directo). Falta v2 que lea matviews |
| `dashboard_competencia` | 🚧 pendiente |
| `dashboard_tendencias` | 🚧 pendiente |
| `dashboard_estrategia` | 🚧 pendiente |

## Patrón canónico

Todas siguen la firma:

```sql
CREATE OR REPLACE FUNCTION public.dashboard_X(
  p_org_id   uuid,
  p_window_d int    DEFAULT 30,
  p_sections text[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_is_member boolean; v_is_owner boolean; v_result jsonb := '{}'::jsonb;
BEGIN
  SELECT public.is_org_member(p_org_id) INTO v_is_member;
  SELECT (owner_user_id = auth.uid()) INTO v_is_owner FROM public.organizations WHERE id = p_org_id;
  IF NOT (COALESCE(v_is_member,false) OR COALESCE(v_is_owner,false)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- ... build sections desde matviews y tablas core ...

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_X(uuid, int, text[]) TO authenticated;
```

## Secciones por dashboard

Ver specs originales en `/docs/`:

### `dashboard_competencia` (12 widgets)

Secciones: `precios` (SKU vs SKU, stock crítico, bundles), `narrativa` (temas ganadores rival, engagement real, lanzamientos), `vulnerabilidades` (reviews negativas, crisis rival), `inversion` (ads, influencers, share of voice, retailer perf).

Fuente: `competitor_ads`, `retail_prices` (filtrado is_competitor o entity_id rival), `brand_posts` con `is_competitor=true`, `intelligence_signals` por tipos rival.

### `dashboard_tendencias` (9 widgets)

Secciones: `senales_emergentes` (niche, audios, content gaps), `contexto_real` (eventos, sentiment global), `algoritmico` (algorithm shifts, keyword velocity), `estetica` (visual trends, narrative hooks).

Fuente: `trend_topics`, `intelligence_signals` (signal_types: trend, audio_trend, world_event, sentiment_shift, algorithm_change, keyword_surge, aesthetic_trend, narrative_hook), `visual_references`.

### `dashboard_estrategia` (sintetizador)

Secciones: `barra_estado` (`mv_dashboard_health` + `mv_threat_level`), `plan_hoy/semana/mes` (de `vera_pending_actions` filtrado por `expires_at`), `panel_contexto` (lookup por `source_signal_id`), `calendario` (de `flow_schedules`), `briefing` (último `body_missions` de tipo `daily_briefing`), `historial` (mission_runs).

### `dashboard_mi_marca` v2

Reemplazar las queries de tabla con SELECT desde matviews. Performance: <50ms.

## Pasos

1. Resolver primero [FEAT-002](./FEAT-002-materialized-views-precomputed-layer.md).
2. Crear los 4 archivos `SQL/functions/dashboard_*.sql`.
3. Aplicar y probar cada uno con la org real.
4. Documentar payload returnado en cada RPC con un comentario de ejemplo de output.

## Criterio de done

- Las 4 RPCs en `pg_proc` con `prosecdef=true`.
- Llamadas como `auth user` válido devuelven jsonb con todas las secciones.
- Llamadas sin auth válida devuelven `forbidden`.
- Performance: cada RPC < 100ms con datos reales.
