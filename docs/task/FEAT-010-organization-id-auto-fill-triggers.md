---
id: FEAT-010
title: Triggers BEFORE INSERT que rellenen organization_id desde FK
severity: medium
type: feature
status: open
created: 2026-04-29
owner: -
---

# FEAT-010 · Auto-fill de organization_id

## Objetivo

Evitar que vuelvan a aparecer filas con `organization_id NULL` (problema de [DATA-002](./DATA-002-backfill-organization-id-null.md)).

Las tablas que tienen `organization_id` pero también una FK a un padre que ya lo tiene deben **autocompletar** el campo si viene NULL en INSERT.

## Tablas afectadas

| Tabla | FK que provee organization_id |
|---|---|
| `body_missions` | `brand_container_id` → `brand_containers` |
| `brand_vulnerabilities` | `brand_container_id` → `brand_containers` o `entity_id` → `intelligence_entities` |
| `trend_topics` | `brand_container_id` → `brand_containers` |
| `brand_analytics_snapshots` | `brand_container_id` → `brand_containers` |
| `brand_audience_heatmap` | `brand_container_id` → `brand_containers` |
| `brand_content_analysis` | `brand_container_id` → `brand_containers` |
| `brand_narrative_pillars` | `brand_container_id` → `brand_containers` |
| `competitor_ads` | `entity_id` → `intelligence_entities` |
| `retail_prices` | `entity_id` → `intelligence_entities` |
| `url_watchers` | `entity_id` → `intelligence_entities` o `brand_container_id` |

## Patrón de trigger

```sql
CREATE OR REPLACE FUNCTION public.fn_auto_fill_org_from_brand_container()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.brand_container_id IS NOT NULL THEN
    SELECT bc.organization_id INTO NEW.organization_id
    FROM public.brand_containers bc
    WHERE bc.id = NEW.brand_container_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_auto_fill_org_from_entity()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.entity_id IS NOT NULL THEN
    SELECT ie.organization_id INTO NEW.organization_id
    FROM public.intelligence_entities ie
    WHERE ie.id = NEW.entity_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Aplicar a las tablas
CREATE TRIGGER trg_body_missions_autofill_org
  BEFORE INSERT ON public.body_missions
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_fill_org_from_brand_container();

CREATE TRIGGER trg_brand_vulnerabilities_autofill_org
  BEFORE INSERT ON public.brand_vulnerabilities
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_fill_org_from_brand_container();
-- (si falla por brand_container_id NULL, el trigger no setea nada y queda NULL → check fallaría)

CREATE TRIGGER trg_brand_vulnerabilities_autofill_org_from_entity
  BEFORE INSERT ON public.brand_vulnerabilities
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_fill_org_from_entity();

CREATE TRIGGER trg_trend_topics_autofill_org
  BEFORE INSERT ON public.trend_topics
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_fill_org_from_brand_container();

CREATE TRIGGER trg_brand_analytics_snapshots_autofill_org
  BEFORE INSERT ON public.brand_analytics_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_fill_org_from_brand_container();

CREATE TRIGGER trg_competitor_ads_autofill_org
  BEFORE INSERT ON public.competitor_ads
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_fill_org_from_entity();

CREATE TRIGGER trg_retail_prices_autofill_org
  BEFORE INSERT ON public.retail_prices
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_fill_org_from_entity();

CREATE TRIGGER trg_url_watchers_autofill_org
  BEFORE INSERT ON public.url_watchers
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_fill_org_from_entity();
```

## Pasos

1. Crear `SQL/migrations/<date>_autofill_organization_id_triggers.sql`.
2. Aplicar via Mgmt API.
3. Verificar:
   ```sql
   SELECT tgname FROM pg_trigger WHERE tgname LIKE '%autofill_org%';
   ```
4. Test: insertar fila sin `organization_id` y verificar que se rellena automáticamente.

## Criterio de done

- 8+ triggers creados.
- Test de INSERT con `organization_id` omitido → fila final tiene el valor correcto.
- Combinado con [DATA-002](./DATA-002-backfill-organization-id-null.md), las 5 tablas históricas quedan sin NULL.
