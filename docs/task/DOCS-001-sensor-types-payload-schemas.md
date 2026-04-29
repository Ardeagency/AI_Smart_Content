---
id: DOCS-001
title: Documentar todos los sensor_type con su payload schema
severity: low
type: docs
status: open
auto_eligible: yes
auto_eligible_reason: leer handlers en ai-engine + escribir doc; sin afectar runtime
est_duration: medium
created: 2026-04-29
owner: -
---

# DOCS-001 · Schemas de sensor_type

## Síntoma

`monitoring_triggers.config jsonb` contiene parámetros específicos por `sensor_type`, pero **no hay un catálogo** que documente qué keys espera cada tipo. Esto genera fricción cuando se quiere agregar un sensor nuevo o debuggear uno existente.

## Acción

Crear `docs/platform/sensor-types-catalog.md` con un schema por tipo:

### Plantilla por sensor

```markdown
## `meta_audience_demographics`

**Cadencia:** daily
**Scope:** brand-wide
**Handler:** `services/social-scraper.service.js → handleMetaAudienceDemographics()`

**`config` payload:**
\```json
{
  "page_id": "string (FB Page ID)",
  "ig_user_id": "string (IG Business Account ID)",
  "metrics": ["audience_gender_age", "audience_locale", "audience_country"]
}
\```

**Outputs:**
- `brand_audience_heatmap` (UPSERT)
- `sensor_runs` con `status` + `metadata` con counts

**Errores típicos:**
- 401 Token expirado → `token-refresh.service` lo arregla en próximo ciclo
- 4 (#10) Application does not have permission → reconfigurar OAuth scopes
```

## Sensores a documentar

Brand-wide:
- `meta_audience_demographics`
- `ga4_audience_demographics`
- `meta_ads_audiences_sync`
- `audience_alignment_analysis`
- `brand_audience_heatmap_compute`
- `mission_generation`
- `brand_indexer`
- `threat_detection`
- `meta_ad_library_sync`

Per-entity:
- `meta_page_insights`
- `meta_posts`
- `social`
- `ga4_analytics`

## Pasos

1. Para cada sensor, leer el handler en `ai-engine/src/services/`.
2. Documentar `config` esperado, output, errores.
3. Push.

## Criterio de done

- Archivo creado con 13+ sensores documentados.
- Cada nuevo sensor que se agregue (FEAT-NN) se documenta también aquí.
