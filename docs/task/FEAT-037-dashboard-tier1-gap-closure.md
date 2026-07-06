---
id: FEAT-037
title: Dashboard Tier-1 gap closure (cableado de RPCs huerfanas + capacidades de plataforma)
severity: high
type: feature
status: in_progress
auto_eligible: no
auto_eligible_reason: UX visible + decisiones de diseno; requiere validacion humana en browser
est_duration: long
created: 2026-06-03
owner: -
---

## Sintoma

El data layer del dashboard esta sobre-construido respecto al frontend: hay
**73 RPCs `dashboard_*`** en produccion (`tsdpbqcwjckbfsdqacam`) pero la UI solo
cablea ~33. Quedan ~33 RPCs huerfanas (sin contar las monoliticas legacy) y
faltan capacidades de plataforma que son table-stakes / diferenciadores Tier-1
en un producto brand-intelligence (Sprout Social / Brandwatch / Similarweb).

## Evidencia

Inventario (2026-06-03):

- BD: `select proname from pg_proc where proname like 'dashboard_%'` → 73.
- Frontend wired: `grep -rhoE "rpc\('dashboard" js` → 33 distintas.
- Frontend: vanilla JS, patron mixin sobre `DashboardView.prototype`
  (`js/views/dashboard/{MyBrands,Competence,Tendencies,Strategy}.mixin.js`),
  servicios en `js/services/*DataService.js`, cache+SWR via `window.apiClient`,
  realtime en 8 tablas, viz = SVG custom + barras CSS (Chart.js cargado sin uso).

### RPCs huerfanas de alto valor (dato ya existe, falta UI)

| RPC | Capacidad Tier-1 | Retorno verificado |
|---|---|---|
| `dashboard_brand_vs_competencia` | Benchmark mi-marca vs competencia | jsonb `{brand:{posts,engagement,avg_engagement_per_post,positive_posts}, competencia:{...}}` |
| `dashboard_competencia_comparison` | Share-of-voice por rival | table (entity_id, entity_name, platform, total_posts, total_engagement, engagement_pct, avg_engagement_per_post, description) |
| `dashboard_brand_alert_score` | Base de sistema de alertas | (p_limit) |
| `dashboard_brand_optimization_insights` | Insights prescriptivos | (p_brand_container_id, p_window_d) |
| `dashboard_brand_kpis_strip`, `_engagement_trend`, `_posting_hours`, `_top_highlighted_posts`, `_sentiment_activity` | Vista Mi Marca mas rica | timestamptz + brand_container_ids[] |
| `dashboard_estrategia_{topics,hashtags,platform_comparison,sentiments_by_brand}` | Tab Estrategia profundo | timestamptz + post_source |
| `dashboard_competencia_{top_posts,distributions,posting_hours,activity_history,actor_details}` | Drill-down de competidor completo | timestamptz + entity_ids[] |

### Legacy a borrar (no cablear)

`dashboard_mi_marca`, `dashboard_competencia`, `dashboard_estrategia`,
`dashboard_tendencias` (monoliticas) y `dashboard_mi_marca_v2`: superadas por las
granulares por-seccion. Candidatas a `DROP FUNCTION` tras confirmar 0 referencias.

## Brechas de plataforma (no hay dato ni UI)

Table-stakes faltantes: indicador de frescura ("datos al {ts}"), deltas
periodo-vs-periodo en KPIs, export CSV/PDF, empty/error states diseñados,
verificacion WCAG/keyboard-nav.

Tier-1 faltantes: alertas+digests (email/Slack), reportes programados,
anotaciones de eventos en charts, vistas guardadas.

Tier-2/3 (donde Vera ya empuja): anomaly feed (reglas, NO LLM — ver
feedback_no_llm_in_background), NLQ via Vera, white-label + export PPTX (tier
Agency).

## Plan por fases

### Fase 1 — Quick wins (cableado puro, dato ya existe) [HECHO 2026-06-03]
1. [x] **Benchmark Mi Marca vs Competencia**: cableado `dashboard_brand_vs_competencia`
   + `dashboard_competencia_comparison` como bloque en el tab Competencia
   (head-to-head + share-of-voice por rival). Diferenciador Tier-1 #1.
2. [x] **Indicador de frescura** global: RPC nueva `dashboard_data_freshness`
   (own_posts / competitor_posts / latest) + chip "Datos al {fecha}" en los 4
   tabs (verde fresco / ambar si >3 dias).
3. [x] **Deltas periodo-vs-periodo** en el KPI strip de Competencia (ventana
   actual vs previa de igual longitud; solo se muestra con rango acotado).
   Tendencias usa KPIs de velocidad (ya temporales) → no aplica delta.

### Fase 2 — Profundidad (cablear resto de huerfanas)
4. [x] **Drill-down de competidor completo** [HECHO 2026-07-06]. El drawer de
   detalle de rival (`_openCompetitorDetail` en `Competence.mixin.js`) pasó de
   "lista de posts" a **perfil**: distribuciones (plataforma/sentimiento/tono,
   `dashboard_competencia_distributions`), mejores horas (`_posting_hours`,
   reusa `_buildPostingHeatmap`), actividad reciente (`_activity_history`) +
   posts. Service: `CompetenciaDataService.loadActorProfile()` (3 RPCs en
   `Promise.allSettled`, degrada por sección). CSS monocromo `comp-prof-*`/
   `comp-dist-*`/`comp-act-*` en `insight.css`. `top_posts` NO se dobló: ya lo
   cubre `dashboard_competencia_actor_posts` (loadActorPosts) en el mismo drawer.
   Verificado contra datos IGNIS (Red Bull 190 posts, etc.; `tone` viene en 0 →
   el bloque se omite solo). **Falta QA visual en browser** (PENDING-HUMAN).
   Pendientes de este item como superficies APARTE (no drill-down): `featured`
   (rival destacado, card en el tab) y `search` (buscador de competidores).
5. Tab Estrategia con `hashtags/platform_comparison/sentiments_by_brand`.
6. Mi Marca enriquecido (`kpis_strip`, `platform_health`, `comment_risk`,
   `featured_platform`, `featured_campaign_ad`, `featured_profile_details`,
   `alert_score`).
7. Cleanup: `DROP` de las 5 RPCs legacy monoliticas + el overload viejo de
   `dashboard_mimarca_health` (sin `p_platforms`) tras confirmar 0 refs.

### Fase 3 — Capacidades de plataforma
8. Export PDF/CSV (reusar pipeline HTML deck -> PDF documentado en memoria).
9. Reportes programados (email) + alertas (`brand_alert_score`).
10. Anomaly feed por reglas. NLQ via Vera. White-label Agency.

## Criterio de done (Fase 1)

- `grep -rl dashboard_brand_vs_competencia js` devuelve >=1 archivo (cableado).
- El tab Competencia renderiza un bloque "Mi Marca vs Competencia" con datos
  reales de IGNIS sin errores en consola.
- Cada tab muestra indicador de frescura.
- KPI strips muestran delta vs periodo previo.
- Verificacion humana en browser (PENDING-HUMAN-VERIFICATION).
</content>
</invoke>
