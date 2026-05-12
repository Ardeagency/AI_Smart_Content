---
id: BUG-006
title: Frontend pide columnas de `campaign_briefs` directo a `campaigns` (400 Bad Request)
severity: high
type: bug
status: partial
auto_eligible: yes
auto_eligible_reason: refactor mecánico — usar embed PostgREST `campaign_briefs(...)` vía FK `campaigns.brief_id` o query separada
est_duration: small
created: 2026-05-12
owner: -
---

# BUG-006 · `campaigns` no tiene `contexto_temporal` / `objetivos_estrategicos` / `tono_modificador` / `audience_id`

## Síntoma

PostgREST devuelve 400 cuando el frontend pide al endpoint `campaigns` cuatro columnas que **no existen** en esa tabla:

- `contexto_temporal`, `objetivos_estrategicos`, `tono_modificador` → viven en `campaign_briefs`
- `audience_id` → no existe; el FK real es `campaigns.persona_id` → `audience_personas.id`

Error visible en consola: `GET /rest/v1/campaigns?select=...&brand_container_id=in.(...) 400`.

## Modelo correcto (verificado contra schema vivo 2026-05-12)

```
campaigns
├── id, brand_container_id, organization_id, created_by
├── brief_id          ──► campaign_briefs.id
├── persona_id        ──► audience_personas.id
├── nombre_campana, descripcion_interna
├── platform, status, starts_at, ends_at, platform_objective
├── cta, cta_url, budget_*, external_*, cached_*, source, metadata, real_demographics, match_scores
└── created_at, updated_at

campaign_briefs
├── id, organization_id, brand_container_id, created_by
├── nombre, descripcion_interna, objetivo_comercial
├── objetivos_estrategicos (text[])
├── tono_modificador (text[])
├── contexto_temporal (text[])
├── angulos_venta (text[]), oferta_principal (text[])
├── cta, cta_url, status, is_conceptual_only
└── created_at, updated_at
```

## Sitios afectados

### 1. `js/views/BrandOrganizationView.js:431` — ✅ FIXED (2026-05-12)

El select pedía las 4 columnas inexistentes, pero `this.brandCampaigns` resultante **nunca se lee** dentro del archivo (código muerto). Alineado al patrón válido de `BrandstorageView.js:385`:

```js
.select('id, brand_container_id, nombre_campana, descripcion_interna, platform, status, starts_at, ends_at, platform_objective, persona_id, brief_id, created_at')
```

### 2. `js/views/VideoView.js:988` — 🔴 PENDIENTE (datos sí se usan)

```js
this.supabase.from('campaigns')
  .select('id, nombre_campana, descripcion_interna, audience_id, contexto_temporal, objetivos_estrategicos, tono_modificador')
  .eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50)
```

El resultado se inyecta en línea 1400 como contexto de campaña al endpoint `openai-cine-prompt`. **Borrar los campos perdería contexto del LLM**, así que el fix correcto es traerlos desde `campaign_briefs` vía embed PostgREST o segunda query.

**Fix sugerido (embed):**

```js
.select(`
  id, nombre_campana, descripcion_interna, persona_id, brief_id, created_at,
  campaign_briefs:brief_id ( contexto_temporal, objetivos_estrategicos, tono_modificador )
`)
```

> Requiere que la FK `campaigns.brief_id → campaign_briefs.id` esté declarada para que PostgREST resuelva el embed. Verificar con:
> ```sql
> SELECT conname FROM pg_constraint
> WHERE conrelid = 'campaigns'::regclass AND confrelid = 'campaign_briefs'::regclass;
> ```

Luego en línea 1400 mapear: `c.campaign_briefs?.contexto_temporal` etc. (campos vienen aplanados en un objeto anidado).

### 3. `functions/openai-cine-prompt.js:59,68-71` — ⚠️ backend consumer

Lee `campaign.contexto_temporal`, `campaign.objetivos_estrategicos`, `campaign.tono_modificador` del body que envía el frontend. Si el frontend manda el objeto plano (post-fix opción A), funciona igual; si manda anidado (`campaign_briefs.contexto_temporal`), hay que adaptar el backend. **Recomendado:** que el frontend aplane antes de mandar, para no tocar la function.

## Plan de cierre

1. Verificar FK `campaigns.brief_id` existe (query SQL arriba).
2. Si existe: aplicar fix con embed en `VideoView.js:988`, aplanar en mapping de línea 1400.
3. Si no existe: hacer dos queries (campaigns por bcId, briefs por brief_ids) y unir en JS.
4. Probar Studio → generar video con campaña asignada y validar que prompt incluye `Contexto temporal:` / `Tono:` / `Objetivos estratégicos:`.
5. Eliminar este archivo.
