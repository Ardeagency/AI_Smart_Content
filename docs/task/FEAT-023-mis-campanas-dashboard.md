---
id: FEAT-023
title: Dashboard "Mis Campañas" — la joya escondida (qué copys de Vera SÍ funcionaron)
type: feature
severity: high
auto_eligible: no
estimate: long
owner: —
created: 2026-05-14
---

# FEAT-023 — Dashboard "Mis Campañas"

## Problema

Vera genera decenas de copys por campaña (`runs_outputs.generated_copy` con
`creative_rationale`, `prompt_used`, vinculado a `campaign_id` y `brief_id`).
La competencia tiene `competitor_ads` con `copy_text` analizado. Los briefs
tienen `tono_modificador`, `angulos_venta`, `oferta_principal`. Pero **ninguna
RPC del dashboard cruza estos datos**. El cliente Tier-1 nunca ve:

- Qué copys de Vera ganaron y por qué.
- Si el brief estratégico se cumplió o se desvió.
- Qué hacen sus competidores en ads activos hoy.

Es la información más diferenciadora que tenemos y está enterrada en BD.

## Pipeline actual (verificado contra `SQL/schema.sql`)

| Tabla | Estado | Lo que falta |
|---|---|---|
| `campaigns` | Tiene `cached_impressions/clicks/spend/conversions/roas/ctr`, `external_campaign_id`, `external_adset_id`, `integration_id` | Sin `cached_*` poblado en vivo; sin breakdown ad-level |
| `campaign_briefs` | Tiene `objetivos_estrategicos`, `angulos_venta`, `oferta_principal`, `tono_modificador`, `contexto_temporal`, `cta` | Nada que comparar — falta outcome |
| `brand_analytics_snapshots` | Tabla viva con `period_type`, `metrics` jsonb, indexada por `campaign_id` | Sin RPC que la lea; índice único es campaign-level (no admite ad-level) |
| `runs_outputs` | Tiene `generated_copy`, `generated_hashtags`, `creative_rationale`, `prompt_used`, `campaign_id`, `brief_id`, `persona_id` | **Sin link a `external_ad_id`** → no se puede atribuir performance a copy específico |
| `competitor_ads` | Tiene `copy_text`, `creative_url`, `estimated_spend_range`, `targeting` | Sin RPC que extraiga patrones (tono, hooks, ofertas dominantes) |
| `flow_runs` | Tiene `campaign_id`, `brief_id` | Sin `external_ad_id` tampoco |
| `brand_integrations` | OAuth activo, `access_token`, `external_account_id` (Multi-platform populator Phase 2B) | Solo inbound (productos); no hay outbound (publicación de ads) |

## Fase B1 — MVP (con datos ya existentes)

Objetivo: levantar el tab con valor real **sin migración**, usando solo lo que
ya hay en BD. No hay atribución per-copy aún, pero sí se ve "campaña X
generó Y resultados, Vera produjo estos copys para ella, el brief decía Z".

### Nuevas RPCs (todas SECURITY DEFINER + `is_org_member` check)

1. **`dashboard_campaign_list`** — listado base
   - In: `p_org_id`, `p_date_from`, `p_date_to`, `p_status text[] DEFAULT NULL`, `p_brand_container_ids uuid[] DEFAULT NULL`
   - Out: RETURNS TABLE con `campaign_id`, `nombre_campana`, `status`, `platform`, `brand_container_id`, `brand_name`, `starts_at`, `ends_at`, `cached_impressions/clicks/spend/roas/ctr/conversions`, `outputs_count` (count de `runs_outputs`), `brief_id`, `brief_nombre`

2. **`dashboard_campaign_kpis_strip`** — KPIs agregados del periodo
   - In: misma firma que list + filtro campaign_ids opcional
   - Out: jsonb con `total_campaigns`, `active_campaigns`, `total_spend`, `total_impressions`, `total_clicks`, `total_conversions`, `weighted_avg_ctr`, `weighted_avg_roas`, `total_outputs_generated`, `total_copies_generated`

3. **`dashboard_campaign_copies_universe`** — todos los copys que Vera produjo
   - In: `p_org_id`, `p_campaign_id uuid DEFAULT NULL` (NULL = todos), `p_date_from`, `p_date_to`, `p_limit DEFAULT 100`
   - Out: TABLE `output_id`, `campaign_id`, `campaign_nombre`, `brief_id`, `output_type`, `generated_copy`, `generated_hashtags`, `creative_rationale`, `created_at`
   - Ranking por `LENGTH(generated_copy)` o por orden temporal (sin métrica real todavía — eso es B2)

4. **`dashboard_campaign_brief_vs_outcome`** — brief estratégico vs resultados
   - In: `p_org_id`, `p_brief_id uuid` (o `p_campaign_id`)
   - Out: jsonb con `brief` (objetivos, ángulos, tono, oferta, CTA), `campaigns_using_brief` (array), `aggregated_results` (impressions, clicks, conversions, ROAS sumados), `outputs_produced` (count + sample de copys), `coverage_score` (heurística: ¿la oferta del brief aparece en los copys? hit-rate de palabras clave)

5. **`dashboard_campaign_competitor_ads_pulse`** — pulso de ads de competencia
   - In: `p_org_id`, `p_brand_container_ids uuid[] DEFAULT NULL`, `p_date_from`, `p_date_to`, `p_limit DEFAULT 20`
   - Out: TABLE `ad_id`, `entity_id`, `entity_name`, `platform`, `copy_text`, `creative_url`, `first_seen_at`, `last_seen_at`, `days_active`, `estimated_spend_range`
   - Bonus: cálculo cliente de "hooks dominantes" (n-gramas de `copy_text`)

### Frontend (mixin nuevo)

- Tab nuevo en `DashboardView.TABS_ENABLED`: `'campaigns': true`
- Botón en `_buildShell()` (entre Tendencias y Estrategia, o como 5ª pill)
- Mixin `js/views/dashboard/Campaigns.mixin.js` con `_renderCampaigns(body)`
- Service `js/services/CampanasDataService.js` que llama las 5 RPCs en paralelo (mismo patrón que `MiBrandaDataService`)
- Realtime sub adicional en `DashboardView._subscribeRealtime()` para `campaigns`, `runs_outputs`, `competitor_ads`

### Cards del tab (modelo "Vera detectó → evidencia → acción")

1. **KPI strip** — 4 KPIs: spend total, ROAS ponderado, copys generados, conversiones
2. **Tus campañas activas** — tabla densa con sparklines de spend, ROAS, status
3. **Universo de copys de Vera** — feed visual de copys generados (la joya, aunque sin métrica de ganadores en B1)
4. **Brief vs realidad** — para la campaña seleccionada: brief original (chips de tono/oferta/ángulos) contra resultados reales + coverage_score
5. **Competencia activa hoy** — top 10 ads activos de los competidores con copy + spend estimado + días activo
6. **Vera está viendo (campañas)** — `intelligence_signals` filtrado por `campaign_id`

## Fase B2 — Atribución per-copy (la joya completa)

Una vez B1 valida UX, agregar atribución real.

### Migraciones

1. **`ALTER TABLE runs_outputs`** — agregar columnas:
   - `external_ad_id text` — id del ad en la plataforma destino
   - `external_platform text` — meta_facebook / meta_instagram / google_ads / etc
   - `published_at timestamptz`
   - `last_metrics_sync_at timestamptz`
   - Índice parcial `(external_ad_id) WHERE external_ad_id IS NOT NULL`

2. **Nueva tabla `ad_insights_daily`** — time-series ad-level:
   ```sql
   CREATE TABLE public.ad_insights_daily (
     id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
     organization_id uuid NOT NULL REFERENCES organizations(id),
     brand_container_id uuid NOT NULL REFERENCES brand_containers(id),
     campaign_id uuid NOT NULL REFERENCES campaigns(id),
     external_ad_id text NOT NULL,
     external_adset_id text,
     platform text NOT NULL,
     date date NOT NULL,
     impressions bigint DEFAULT 0,
     clicks bigint DEFAULT 0,
     spend numeric(12,2) DEFAULT 0,
     conversions bigint DEFAULT 0,
     ctr numeric,
     cpc numeric,
     cpm numeric,
     roas numeric,
     raw_payload jsonb,
     synced_at timestamptz DEFAULT now(),
     UNIQUE(campaign_id, external_ad_id, date, platform)
   );
   ```

3. **RLS** + auto-fill `organization_id` trigger (mismo patrón que el resto).

### ai-engine sync job

- Nuevo job en ai-engine: `sync-meta-ad-insights.service.js`
- Pull diario vía Meta Marketing API `/insights?level=ad&breakdowns=...&date_preset=last_7d`
- Upsert en `ad_insights_daily` por `(campaign_id, external_ad_id, date, platform)`
- Mismo job actualiza `campaigns.cached_*` (rollup)

### Nueva RPC

6. **`dashboard_campaign_winning_copies`** — el card que justifica el precio Tier-1
   - In: `p_org_id`, `p_date_from`, `p_date_to`, `p_campaign_id DEFAULT NULL`, `p_metric text DEFAULT 'roas'`, `p_limit DEFAULT 10`
   - Out: TABLE `output_id`, `campaign_id`, `campaign_nombre`, `external_ad_id`, `generated_copy`, `creative_rationale`,
     `total_impressions`, `total_clicks`, `total_spend`, `total_conversions`, `roas`, `ctr`, `rank_by_metric`, `vs_campaign_avg_lift_pct`
   - JOIN sobre `runs_outputs` × `ad_insights_daily` (por `external_ad_id`)

### Frontend B2

- Card #3 "Universo de copys" se convierte en "Copys ganadores" (ranking real)
- Drill-down por copy: ver `creative_rationale` + métricas reales + brief que lo originó
- Comparador: 2 copys lado a lado con sus métricas

## Decisiones tomadas 2026-05-14

- **D1 — Ubicación**: "Mis Campañas" es **sección DENTRO del tab Mi Marca**, no tab separado.
  Mi Marca = pulse orgánico + sección Campañas en el mismo mixin.
- **D2 — Orden**: B1 primero. Mi Marca (sección orgánica) después.
- **D3 — Plataformas B2**: solo Meta (Instagram + Facebook). Google Ads / TikTok / LinkedIn pospuestos.
- **D4 — Copys en B1**: card "Universo de copys de Vera" **escondido hasta B2**.
  B1 entrega 4 cards sólidos, B2 estrena ranking real de copys ganadores.
- **D5 — ai-engine primero**: descubierto que la BD está vacía en lo que importa.
  `campaigns.cached_*` todos NULL en las 6 campañas imported; 0 copys en `runs_outputs`;
  0 competitor_ads. Los 55 snapshots son de página orgánica, no de ads.
  → Antes de tocar el frontend, ai-engine debe sincronizar insights Meta. Sin esto,
  el dashboard se entrega vacío con buen empty state pero sin valor demostrable.

## Estado real verificado en IGNIS (2026-05-14)

| Tabla | Filas IGNIS | Observación |
|---|---|---|
| `campaigns` | 7 | 6 imported (cached_* NULL), 1 conceptual (cached_* = 0) |
| `campaign_briefs` | 3 | Muy ricos: SHIP IT OVERDRIVE, DISAPPEAR BLACK CORE, etc. |
| `brand_analytics_snapshots` | 55 | Todos `campaign_id=NULL`. Métricas de página orgánica (75 followers, ER 0.00%) |
| `runs_outputs.generated_copy` | 0 | Vera no ha escrito copys aún |
| `competitor_ads` | 0 | OPS-006 (Meta Ad Library pausado) |
| `brand_integrations.platform='facebook'` | 1 | ✅ Activa, last_sync 2026-05-08 (solo metadata, no insights) |

## Orden de ejecución revisado

1. **T1** — auditar populator Meta en ai-engine
2. **T2** — diseñar migración `ad_insights_daily` + ALTER `runs_outputs`
3. **T3** — implementar `sync-meta-ad-insights.service.js` en ai-engine
4. **T4** — aplicar migración + backfill 7 campañas IGNIS
5. **T5** — programar cron diario (ventana 23:00-03:00 Bogotá)
6. **T6** — *(después)* frontend B1: 4 RPCs + sección dentro de MyBrands.mixin.js

## Criterios de done

**B1:**
- 5 RPCs en `SQL/functions/dashboard_campaigns.sql`
- Migración registrada y aplicada vía Management API
- Tab visible y funcional en /dashboard#campaigns
- `CampanasDataService` con loadAll() paralelo + cache 60s
- Realtime sub a `campaigns`, `runs_outputs`, `competitor_ads`
- Test smoke en `test/rpcs.test.js`

**B2:**
- Migración `ad_insights_daily` aplicada
- `runs_outputs` ampliada con external_ad_id
- Job ai-engine `sync-meta-ad-insights` corriendo (cron diario 03:00 Bogota)
- RPC `dashboard_campaign_winning_copies` con JOIN real
- Card "Copys ganadores" con ranking por ROAS/CTR + lift vs promedio campaña
