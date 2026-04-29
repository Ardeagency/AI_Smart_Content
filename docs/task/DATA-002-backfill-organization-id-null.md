---
id: DATA-002
title: 5 tablas con organization_id NULL en filas viejas
severity: high
type: data
status: open
created: 2026-04-29
owner: -
---

# DATA-002 · Backfill de organization_id NULL

## Síntoma

5 tablas tienen la columna `organization_id uuid` pero filas con `NULL`. Esto significa que jobs viejos no escribieron el campo y las queries que filtran por org **no las ven**:

```sql
SELECT 'brand_vulnerabilities' AS tbl, count(*) AS null_org FROM brand_vulnerabilities WHERE organization_id IS NULL
UNION ALL SELECT 'body_missions',           count(*) FROM body_missions           WHERE organization_id IS NULL
UNION ALL SELECT 'trend_topics',            count(*) FROM trend_topics            WHERE organization_id IS NULL
UNION ALL SELECT 'brand_analytics_snapshots', count(*) FROM brand_analytics_snapshots WHERE organization_id IS NULL
UNION ALL SELECT 'flow_schedules',          count(*) FROM flow_schedules          WHERE organization_id IS NULL;
```

Resultado en muestra (al menos 1 row con NULL en cada una). Los dashboards filtran por `organization_id` → estas filas son invisibles para el usuario propietario.

## Evidencia

Cada tabla tiene FK a un padre que sí lleva `organization_id`:

| Tabla | FK que resuelve la org |
|---|---|
| `brand_vulnerabilities` | `entity_id` → `intelligence_entities.organization_id` o `brand_container_id` → `brand_containers.organization_id` |
| `body_missions` | `brand_container_id` → `brand_containers.organization_id` |
| `trend_topics` | `brand_container_id` → `brand_containers.organization_id` |
| `brand_analytics_snapshots` | `brand_container_id` → `brand_containers.organization_id` |
| `flow_schedules` | tiene `organization_id` directamente; vacío hasta que se use |

## Pasos para resolver

### 1. Backfill de filas existentes

```sql
-- brand_vulnerabilities
UPDATE brand_vulnerabilities bv
SET organization_id = COALESCE(
      (SELECT bc.organization_id FROM brand_containers bc WHERE bc.id = bv.brand_container_id),
      (SELECT ie.organization_id FROM intelligence_entities ie WHERE ie.id = bv.entity_id)
    )
WHERE bv.organization_id IS NULL;

-- body_missions
UPDATE body_missions bm
SET organization_id = (SELECT bc.organization_id FROM brand_containers bc WHERE bc.id = bm.brand_container_id)
WHERE bm.organization_id IS NULL AND bm.brand_container_id IS NOT NULL;

-- trend_topics
UPDATE trend_topics tt
SET organization_id = (SELECT bc.organization_id FROM brand_containers bc WHERE bc.id = tt.brand_container_id)
WHERE tt.organization_id IS NULL AND tt.brand_container_id IS NOT NULL;

-- brand_analytics_snapshots
UPDATE brand_analytics_snapshots bas
SET organization_id = (SELECT bc.organization_id FROM brand_containers bc WHERE bc.id = bas.brand_container_id)
WHERE bas.organization_id IS NULL AND bas.brand_container_id IS NOT NULL;
```

### 2. Trigger para evitar nuevos NULL

Ver tarea relacionada [FEAT-010-organization-id-auto-fill-triggers](./FEAT-010-organization-id-auto-fill-triggers.md).

## Criterio de done

```sql
-- Todas estas queries deben devolver 0
SELECT count(*) FROM brand_vulnerabilities WHERE organization_id IS NULL;
SELECT count(*) FROM body_missions WHERE organization_id IS NULL;
SELECT count(*) FROM trend_topics WHERE organization_id IS NULL;
SELECT count(*) FROM brand_analytics_snapshots WHERE organization_id IS NULL;
```

Las filas backfilleadas aparecen en los dashboards de su org correspondiente.
