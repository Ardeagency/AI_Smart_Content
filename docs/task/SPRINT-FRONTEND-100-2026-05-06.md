---
id: SPRINT-FRONTEND-100
title: Sprint Frontend 100% — exponer todo el backend con gráficos profesionales
severity: critical
type: feature
status: open
auto_eligible: no
auto_eligible_reason: requiere validación visual continua + decisiones UX
est_duration: long
created: 2026-05-06
target_delivery: 2026-05-28
owner: -
---

# Sprint Frontend 100% — De preview a vendible

> **Contexto:** la plataforma está en estado de previsualización para venta. El backend está **al 90%** (45 RPCs vivas, 5 mat-views auto-refrescándose, 30+ helpers `get_*`/`market_*`/`compute_*`, ~40 tablas con datos reales), pero el frontend solo expone ~40% de eso. **Todas las funciones ya existen y corren bien en BD** — este sprint es traducir eso a UI con gráficos profesionales.

> **Punto de partida (2026-05-06 ~10:30 Bogota):** se ejecutó refactor estructural previo del `DashboardView.js` (god-class de 2853 líneas) → core de 298 líneas (`js/views/DashboardView.js`) + 4 mixins shell en `js/views/dashboard/{MyBrands,Competence,Tendencies,Strategy}.mixin.js`. Los 4 tabs muestran "Próximamente" (`TABS_ENABLED` todo en `false`). Cada día del sprint construye su mixin desde el shell vacío y luego flipea su bandera a `true`. Esto hace D1-D3 ligeramente más exigentes (no es upgrade de código viejo, es construcción) pero arranca limpio sin deuda estructural.

---

## 1. Resumen ejecutivo

| Métrica | Hoy (2026-05-06) | Objetivo (2026-05-28) |
|---|---|---|
| Dashboards funcionales | 2/4 | **4/4 con 65+ gráficos** |
| RPCs nuevas consumidas | 0/10 | **10/10** |
| Sistemas backend con UI | 5/15 | **15/15** |
| Vistas con placeholder | 4 | **0** |
| Bugs `from('brands')`/`from('audiences')` | 14 ocurrencias | **0** |
| Páginas nuevas | 0 | **7** (Planes, Activity, Health, Tutorial, Lexicon, Brand Intelligence, NotificationBell) |
| Páginas mejoradas | 0 | **5** (Créditos, Monitoring, CommandCenter, Tasks, Vera) |
| Estado de venta | Preview | **Demo-ready end-to-end** |

**Dev estimado:** 16 días hábiles. **Entrega: jueves 28 de mayo de 2026.**

---

## 2. Inventario Supabase → UI/Gráficos

### 2.1 Dashboard 1 · Mi Marca (15 RPCs disponibles)

| RPC | Datos | Gráfico/UI propuesto |
|---|---|---|
| `dashboard_brand_kpis_strip` | KPIs core | 6 cards numéricos con delta vs período anterior |
| `dashboard_brand_alert_score` | Top 5 alertas | Lista con badges color-coded |
| `dashboard_brand_activity_history` | Timeline 30d | **Line chart** (posts/día) |
| `dashboard_brand_engagement_trend` | Engagement 30d | **Line chart dual-axis** (likes + comentarios) |
| `dashboard_brand_posting_hours` | Heatmap horario | **Heatmap 7×24** (día×hora) |
| `dashboard_brand_sentiment_activity` | Sentiment over time | **Stacked bar** (positivo/neutro/negativo) |
| `dashboard_brand_top_highlighted_posts` | Top 10 posts | Grid de cards con métricas |
| `dashboard_brand_vs_competencia` | Comparativa | **Radar chart** (5 ejes) |
| `dashboard_brand_featured_profile` | Mejor perfil | Card destacado |
| `dashboard_brand_featured_topic` | Mejor tema | Card destacado |
| `dashboard_brand_featured_hashtag` | Mejor hashtag | Card destacado |
| `dashboard_brand_featured_hour` | Mejor hora | Card destacado |
| `dashboard_brand_featured_platform` | Mejor plataforma | **Donut chart** |
| `dashboard_brand_featured_growth` | Growth metric | Card con sparkline |
| `dashboard_brand_optimization_insights` 🆕 | Insights accionables | **Lista de bullets** con icons |

### 2.2 Dashboard 2 · Competencia (12 RPCs disponibles)

| RPC | Datos | Gráfico/UI |
|---|---|---|
| `dashboard_competencia_kpis` | KPIs | 6 cards |
| `dashboard_competencia_top` | Top competidores | **Bar chart horizontal** |
| `dashboard_competencia_featured` | Destacados | Cards |
| `dashboard_competencia_distributions` | Distribuciones | **Pie/Donut** múltiples |
| `dashboard_competencia_posting_hours` | Heatmap rivales | **Heatmap 7×24** |
| `dashboard_competencia_top_posts` | Top 20 posts rivales | Grid clickeable |
| `dashboard_competencia_risk` | Top 5 amenazas | Lista con score |
| `dashboard_competencia_activity_history` | Timeline | **Multi-line chart** |
| `dashboard_competencia_comparison` | Side-by-side | **Tabla** comparativa |
| `dashboard_competencia_actor_details` | Detalle competidor | Modal expandido |
| `dashboard_competencia_actor_posts` | Posts de un competidor | Lista paginada |
| `dashboard_competencia_intelligence` 🆕 | Inteligencia ofensiva | Sección: winning combos · white space · top threats · vulnerabilidades del rival |

### 2.3 Dashboard 3 · Tendencias (5 RPCs + 6 helpers `market_*`)

| RPC/Helper | Datos | Gráfico/UI |
|---|---|---|
| `dashboard_audience_demand` 🆕 | 478 señales intent | **Heatmap intent** + tabla top 10 high-intent |
| `dashboard_targeted_trends` 🆕 | 3.730 trend signals | Tabla paginada + **Velocity scatter plot** |
| `dashboard_emerging_brands` 🆕 | 4 candidatas | Cards con botones approve/reject |
| `dashboard_market_intelligence` 🆕 | Pulso del mercado | Dashboard 4 sub-cards |
| `dashboard_tendencias` (master) | Master query | Wrapper |
| `market_topic_trends` | Topics velocity | **Bubble chart** |
| `market_tone_trends` | Tones trending | **Stacked area chart** |
| `market_format_trends` | Formats winning | **Bar chart** |
| `market_sentiment_trends` | Sentiment shift | **Line chart** |
| `market_pattern_trends` | Patrones evolución | **Heatmap pattern×time** |
| `market_lexicon_emergence` | Vocabulario nuevo | **Word cloud** |

### 2.4 Dashboard 4 · Estrategia (4 RPCs + 5 helpers `dashboard_estrategia_*`)

| RPC/Tabla | Datos | Gráfico/UI |
|---|---|---|
| `dashboard_strategy_master` 🆕 | Master query | Wrapper Dashboard 4 |
| `dashboard_strategic_recommendations` 🆕 | Propuestas Vera | **Cards expandibles** con todos los campos + botones aprobar/rechazar/iterar |
| `recommendation_learning_stats` 🆕 | Aprendizaje | 4 cards: approval rate · prediction error · top tone · drift alerts |
| `build_full_brand_intelligence_context` 🆕 | 10 capas brand | Brief expandible |
| `dashboard_estrategia_topics/hashtags/tones` | Análisis estratégico | **Charts comparativos** |
| `dashboard_estrategia_sentiments_by_brand` | Sentiment por marca | **Grouped bar chart** |
| `dashboard_estrategia_platform_comparison` | Platform comparison | **Radar chart** |

### 2.5 Mat-views auto-refresh (sin consumer hoy)

| Mat-view | Refresh | Gráfico/UI |
|---|---|---|
| `mv_dashboard_health` | 5 min | Card "Health Score" en HealthView |
| `mv_threat_level` | 5 min | Badge global en navbar (verde/amarillo/rojo) |
| `mv_signal_velocity_24h` | 15 min | Sparkline en Dashboard 3 |
| `mv_brand_format_stats` | 1h | **Donut chart** formatos |
| `mv_sentiment_breakdown` | 1h | **Donut chart** sentiment |
| `v_orphan_topics` (1.488) | 15 min | Tabla en Lexicon admin |
| `brand_pattern_performance` (121 filas) | view | **Bar chart** patrones |
| `category_pattern_performance` (31) | view | Comparativa categoría |

### 2.6 Tablas time-series para charts directos

| Tabla | Campos clave | Chart propuesto |
|---|---|---|
| `brand_metrics_daily` | day-by-day metrics | **Line chart 30/90/365d** por marca |
| `brand_health_snapshots` | bhs_score, trend_7d, trend_30d, rank_in_category | **Score gauge + sparkline + ranking badge** |
| `brand_posts_daily_stats` (48) | likes/comments/shares/views/plays/saves por día/network | **Multi-line chart por network** |
| `brand_analytics_snapshots` (50) | metrics jsonb por platform/period | Chart configurable |
| `brand_audience_heatmap` | best_hour, best_day, hour/day_engagement jsonb | **Heatmap 7×24** + best_hour highlight |
| `viral_predictions` | viral_score, velocity_per_hour | Lista con score + acción recomendada |
| `crisis_signals` | severity, crisis_score, factors | **Timeline** crisis con severidad |

### 2.7 Tablas operacionales (Activity / Health / Tasks)

| Tabla | Filas | UI propuesta |
|---|---|---|
| `system_metrics` | 76.314 | **Health page** charts (server health) |
| `sensor_runs` | 1.312 | **Timeline** dentro de Monitoring |
| `apify_runs` | 82 | Tabla en Monitoring + **bar chart de gasto** |
| `agent_queue_jobs` | 28 | **Kanban** queued/running/done en Tasks |
| `mission_runs` | 28 | **Timeline + duration histogram** |
| `body_missions` | 70 | Lista en Tasks con detalles |
| `provisioning_events` | live | **Timeline** en HealthView |
| `delivery_events` | live | **Timeline** en Activity |
| `credit_usage` | 217 | **Stacked bar** gasto por kind/día (Créditos page) |
| `intelligence_signals` | 306 | Feed en Activity Timeline |
| `dimension_lexicon` | 198 (37 pending) | Admin en /dev/lead/lexicon |
| `vera_pending_actions` | live | Inbox en Vera + Tasks |

### 2.8 Configuración (Planes y Créditos)

| Tabla | Filas | UI propuesta |
|---|---|---|
| **`plans`** | 5 (Trial $0, Starter $99, Pro $299, Business $999, Enterprise) | **Página Planes** comparativa con: precio · credits_monthly · storage_mb · max_handles · scraping_cadence_hours · scraping_daily_cap · cache_ttl_hours · features jsonb |
| **`credit_packages`** | 4 (Mini $59/500cr · Standard $159/1500+50 · Plus $479/5000+250 · Mega $1299/15000+1000) | **Tienda Créditos** con cards y CTA buy |
| `subscriptions` | 1 (business activo) | Sección "Tu plan actual" en Planes |
| `organization_credits` | credits_available + credits_total | **Gauge** + barra progreso en Créditos |
| `credit_usage` (217 filas, 3 kinds) | apify_scrape · claude_describe · migration_grant | **Tabla paginada** + chart "gasto últimos 30d" |
| `org_claude_caps` | daily/monthly cap + warn + confirm_threshold | **Sliders editables** en Configuración |

### 2.9 Inventario consolidado de visualizaciones

```
LINE CHARTS:        9      (engagement, sentiment, market trends, brand metrics, etc.)
BAR CHARTS:         8      (top competidores, formatos, gasto, comparativas)
DONUT/PIE:          6      (formatos, sentiment, platform, gasto por kind)
HEATMAPS:           4      (posting hours brand+competencia, intent, audience)
RADAR CHARTS:       2      (brand vs competencia, platform comparison)
SCATTER/BUBBLE:     2      (velocity trends, topic clusters)
STACKED AREA:       2      (tones, sentiment over time)
GROUPED BAR:        2      (sentiment by brand, comparativas)
WORD CLOUDS:        1      (lexicon emergence)
GAUGES:             3      (health score, credits, cap usage)
SPARKLINES:         12     (en cards individuales)
TIMELINES:          5      (activity, sensors, crisis, missions, delivery)
KANBAN:             1      (agent_queue_jobs)
TABLAS RICAS:       10+    (con sort, filtro, acciones)
CARDS+METRICS:      40+
                   ───
TOTAL:              ~110 visualizaciones
```

---

## 3. Páginas a crear/mejorar

### 3.1 Páginas NUEVAS

| Página | Ruta | Datos consumidos |
|---|---|---|
| **Planes** | `/org/.../plans` | `plans` (5 tiers) + `subscriptions` activa + `credit_packages` |
| **Activity Timeline** | `/org/.../activity` | `intelligence_signals` + `mission_runs` + `delivery_events` + `provisioning_events` + `vera_pending_actions` resueltas |
| **HealthView** | `/org/.../health` | `mv_dashboard_health` + `storage_usage` + `organization_credits` + `v_org_claude_usage_today` + `monitoring_triggers` + `brand_integrations` + `openclaw_instances` |
| **Tutorial system** | (overlay global) | localStorage + `profiles.tour_completed` |
| **Lexicon Admin** | `/dev/lead/lexicon` | `dimension_lexicon` (37 pending) + `v_orphan_topics` |
| **Brand Intelligence pages** | sub-vistas en `/brands/:id` | `brand_vulnerabilities` (41) + `brand_communication_patterns` (10) + `brand_health_snapshots` + `daily_briefs` + `weekly_memos` |
| **NotificationBell** | (componente global navbar) | `org_notifications` + `org_notification_user_state` |

### 3.2 Páginas a MEJORAR

| Página | Estado actual | Trabajo |
|---|---|---|
| **DashboardView** | 2/4 tabs | Activar Tendencias + Estrategia · agregar 65+ gráficos |
| **VeraView** | Chat funcional sin UX | Modal cost custom + budget indicator + activity stream + pending actions inbox |
| **CreditsView** | Desactualizada | Tienda 4 packs + ledger + chart gasto + gauge créditos |
| **MonitoringView** | 2 tabs placeholder | CRUD sensores + URL watchers + Multi-platform + chart Apify usage |
| **CommandCenterView** | Existe básico | Dashboard ejecutivo por sub-marca con TODOS los datos |
| **TasksView** | Bugs (`from('brands')`) | Reescritura: 4 tabs reales (pending/missions/queue/history) |
| **StudioView** | Placeholder "Programar — Próximamente" | Botón Programar + cron picker + lista schedules **(complejo, al final)** |

### 3.3 Componentes globales nuevos

```
NotificationBell.js              navbar persistente (badge + dropdown + per-user state)
BudgetIndicator.js               sidebar Vera (cap diario/mensual)
CostConfirmModal.js              reemplaza window.confirm()
ActivityStream.js                timeline en VeraView
PendingActionsInbox.js           inbox HITL en Vera
TutorialOverlay.js               sistema de tour SaaS
TooltipContextual.js             data-tour=true en elementos clave
ChecklistOnboarding.js           "Conecta marca → Configura competidores → Genera contenido"
EmptyState.js                    componente reutilizable
Skeleton.js                      loaders (card, table, list)
ChartLine.js / ChartBar.js / ChartDonut.js / ChartHeatmap.js / ChartRadar.js / ChartScatter.js / Gauge.js / Sparkline.js / WordCloud.js
```

---

## 4. Cronograma · 16 días hábiles + entrega

| Día | Fecha | Foco | Entregable |
|---|---|---|---|
| **D1** | mié 6-may (hoy) | Dashboards parte 1 | **Refactor estructural Dashboard ✅ (god-class → core+4 mixins)** · construir `MyBrands.mixin` desde shell con 15 charts (line, heatmap, radar, donut, sparklines) · service addition `getOptimizationInsights` · flip `TABS_ENABLED['my-brands'] = true` |
| **D2** | jue 7-may | Dashboards parte 2 | Construir `Competence.mixin` desde shell (12 charts + sección "Inteligencia Ofensiva" con `dashboard_competencia_intelligence`) · service addition `getIntelligence` · flip `TABS_ENABLED['competence'] = true` · arrancar `Tendencies.mixin` (4 sub-tabs · 11 charts: heatmap intent, scatter velocity, word cloud, bubble, stacked area, line, donut) |
| **D3** | vie 8-may | Dashboards parte 3 | Cerrar `Tendencies.mixin` y construir `Strategy.mixin` desde shell (cards Vera con aprobar/rechazar/iterar · métricas learning · panel Brand Health) · flip los 2 últimos `TABS_ENABLED` · **DASHBOARDS 4/4 COMPLETOS con 65+ charts** |
| **D4** | lun 11-may ⚡ | Vera Chat upgrade | `CostConfirmModal` custom + `BudgetIndicator` sidebar + `ActivityStream` inline + `PendingActionsInbox` — todo en 1 día. Validar primer batch vera-strategist 06:00 UTC |
| **D5** | mar 12-may | Página Planes 🆕 | Comparativa 5 planes con todos los campos (`storage_mb`, `max_handles`, `scraping_cadence_hours`, `scraping_daily_cap`, `cache_ttl_hours`, `features` jsonb) + CTA upgrade + plan actual highlight |
| **D6** | mié 13-may | Créditos optimizada | Tienda 4 packs · gauge créditos · ledger 217 filas con filtros · **chart "gasto 30d por kind"** (apify/claude/migration) · botón comprar |
| **D7** | jue 14-may | Tutorial system SaaS | Onboarding wizard primera entrada + tooltips contextuales (data-tour) + checklist progresivo "Conecta tu primera marca → Configura competidores → Genera primer contenido" + tour guiado en cada vista |
| **D8** | vie 15-may | NotificationBell + Activity Timeline | Badge global polling 60s · dropdown · estado per-user · página `/activity` con feed unificado de 5 fuentes (signals/missions/delivery/provisioning/decisions) |
| **D9** | lun 18-may | Vista Salud/Status | `/org/.../health` con 6 cards: Storage · Créditos · Vera (cap usage) · Sensores (13 tipos) · Integraciones (Meta/GA4/YouTube) · OpenClaw VM · auto-refresh 30s · bug fix storage_usage |
| **D10** | mar 19-may | Monitoring CRUD completo | Tab Sensores (pause/cadencia/run-now/historial 20 últimos) · Tab URL Watchers (CRUD + diff visual) · Tab Multi-platform Provision (form `/intelligence/add-multi-platform`) · **chart Apify usage** |
| **D11** | mié 20-may | CommandCenter mejorado | Vista ejecutiva por sub-marca: KPIs · alerts · top posts · health score · vulnerabilidades top 3 · próxima propuesta Vera · timeline reciente |
| **D12** | jue 21-may | Tasks actualizado | 4 tabs reales (Pendientes/Misiones/Cola/Historial) consumiendo `vera_pending_actions` + `body_missions` + `mission_runs` + `agent_queue_jobs`. **Purgar 14 ocurrencias `from('brands')` y `from('audiences')`** |
| **D13** | vie 22-may | Brand Intelligence + Lexicon | Sub-vistas en `/brands/:id`: Vulnerabilidades (41 filas) + Communication Patterns (10 patrones) + Health Trend chart 30/90/365d + Daily/Weekly Memo viewer · Lexicon admin `/dev/lead/lexicon` (37 pending) |
| **D14** | lun 25-may | Studio Programar | Botón Programar + cron picker visual + form completo + lista schedules activos + integración con `flow_schedules` → trigger `tr_sync_flow_cron` → pg_cron → n8n **(complejo, todo el día)** |
| **D15** | mar 26-may | Empty states + QA E2E | Empty states bonitos en TODAS las vistas + skeleton loaders · smoke test E2E completo · cleanup `.bak` files + backups `_bak_` BD |
| **D16** | mié 27-may | Demo dry-run + ajustes | Dry-run 15 min cubriendo los 4 dashboards + Vera + Monitoring + Health · ajustes finales · performance check (<1.5s en 4G) · email a piloto |
| 🎯 | **jue 28-may** | **Entrega** | **Plataforma 100% expuesta · 4 dashboards con 65+ charts · Vera UX profesional · Tutorial onboarding SaaS · 7 páginas nuevas · 5 mejoradas · datos fluyendo E2E** |

---

## 5. Detalle por bloque

### 5.1 D1-D3 · Dashboards (3 días)

**Filosofía:** todas las RPCs y mat-views ya existen. Cada chart es una llamada + render. Sin lógica de backend.

#### D1 — Mi Marca completo + service additions

```js
// MiBrandaDataService.js — agregar 1 método
async getOptimizationInsights(brandContainerId) {
  return this.sb.rpc('dashboard_brand_optimization_insights', {
    p_org_id: this.orgId,
    p_brand_container_id: brandContainerId,
    p_window_d: 30
  });
}

// CompetenciaDataService.js — agregar 1 método
async getIntelligence() {
  return this.sb.rpc('dashboard_competencia_intelligence', {
    p_org_id: this.orgId,
    p_window_d: 30
  });
}
```

**Charts a renderizar en Mi Marca:**
1. KPIs strip (6 cards)
2. Activity history line chart
3. Engagement trend dual-axis line
4. Posting hours heatmap 7×24
5. Sentiment activity stacked bar
6. Top 10 posts grid
7. Brand vs Competencia radar
8. Featured platform donut
9-14. Featured profile/topic/hashtag/hour/growth (cards)
15. Optimization insights bullets

#### D2 — Tendencias completo + Competencia upgrade

**Tendencias 4 sub-tabs:**

```
Pulso del Mercado:
  · market_tone_trends → stacked area chart
  · market_topic_trends → bubble chart
  · market_format_trends → bar chart
  · market_sentiment_trends → line chart
  · mv_brand_format_stats → donut chart
  · mv_sentiment_breakdown → donut chart

Demanda de Audiencia:
  · dashboard_audience_demand → heatmap intent
  · top 10 high-intent queries → tabla con score
  · filter: comparing/buying/learning/aspirational

Marcas Emergentes:
  · dashboard_emerging_brands → cards
  · botones approve (auto-provision multi-plataforma) / reject

Trends Capturados:
  · dashboard_targeted_trends → tabla paginada
  · velocity_score scatter plot
  · 3.730 filas con sort + filtros
```

**Competencia upgrade:**
- Sección "Inteligencia Ofensiva" con `dashboard_competencia_intelligence`: winning combos · white space · top threats · vulnerabilidades del rival

#### D3 — Estrategia completo

```
Hero card:
  · "Vera ha generado N propuestas estratégicas"
  · [Generar Ahora] (re-run vera-strategist endpoint)
  · "Próxima generación automática: lunes 06:00 UTC"

Cards de propuestas (consume dashboard_strategic_recommendations):
  · title + description
  · format · tone · topic · mood · target_persona
  · anchor_product · campaign_link
  · recommended_hour/day/network
  · copy_seed + visual_brief
  · what_to_avoid (chips rojos)
  · predicted_engagement + predicted_reach + confidence
  · rationale_commercial
  · evidence_chain (datapoints expandibles)
  · [✓ Aprobar] [✕ Rechazar+razón] [↻ Iterar+feedback]

En Producción (status='approved'):
  · Tracker hasta status='published'

Métricas de Aprendizaje (recommendation_learning_stats):
  · Approval rate 30d
  · Prediction error medio
  · Top tone/format/topic performing
  · Data drift alerts (alignment_score < 0.6)

Panel lateral Brand Health:
  · Score actual + sparkline 30d (brand_health_snapshots)
  · Top 3 vulnerabilidades (brand_vulnerabilities)
  · Top 3 fortalezas (brand_communication_patterns)
```

### 5.2 D4 · Vera Chat upgrade (1 día completo)

**4 mejoras en paralelo:**

```js
// 1. CostConfirmModal.js (reemplaza window.confirm)
// Diseño custom con: estimate, razones, promedio histórico, botones Replantear/Continuar

// 2. BudgetIndicator.js (sidebar)
// 💰 Hoy: $2.45 / $10.00 (24%)
// 📊 Mes: $45.20 / $200.00 (22%)
// Modelo: Sonnet 4.6
// Refresh cada 30s desde claude_cap_check + v_org_claude_usage_today

// 3. ActivityStream.js (inline en chat)
// Cuando Vera procesa: "🔍 Construyendo contexto...", "🔧 Buscando posts...", "✍️ Generando..."
// Subscribe a Supabase Realtime sobre ai_messages para STATUS events

// 4. PendingActionsInbox.js (sidebar/dropdown)
// Cards con vera_pending_actions
// Botones [Aprobar] [Rechazar]
// POST /internal/vera-actions/:id/approve|reject
// Auto-actualiza con Realtime
```

### 5.3 D5 · Página Planes (nueva)

```
/org/:orgIdShort/:orgNameSlug/plans

Layout:
┌─ Tu plan actual ──────────────────────────────┐
│ Business · $999/mo                             │
│ Renovación: 2026-06-15                         │
│ [Cambiar plan] [Cancelar]                      │
└────────────────────────────────────────────────┘

┌─ Compara los planes (5 columnas) ─────────────────────────┐
│           Trial    Starter   Pro     Business  Enterprise │
│ Precio    $0       $99       $299    $999      Custom     │
│ Créditos  200      1.000     3.000   10.000    Custom     │
│ Storage   1 GB     5 GB      25 GB   100 GB    1 TB       │
│ Marcas    2        5         15      50        ∞          │
│ Cadencia  12h      8h        4h      2h        Custom     │
│ Cap diario 5       25        100     400       Custom     │
│ Cache TTL 6h       4h        2h      1h        Custom     │
│ Features                                                   │
│   trial ✓                                                  │
│   custom                                          ✓        │
│           [Trial]  [Upgrade] [Upgrade] [Actual] [Contact]  │
└────────────────────────────────────────────────────────────┘

Datos: query plans WHERE is_active=true ORDER BY display_order
```

### 5.4 D6 · Créditos optimizada

```
/org/:orgIdShort/:orgNameSlug/credits

┌─ Mis Créditos ────────────────────────┐
│ 9.500 disponibles / 10.000 totales    │
│ ████████████████░ 95%                 │
│ Renovación en 38 días                 │
└────────────────────────────────────────┘

┌─ Comprar más créditos (4 cards) ──────┐
│  Mini    Standard    Plus    Mega     │
│  500     1.500+50    5.000+250 15.000+1000│
│  $59     $159        $479    $1.299   │
│  [Buy]   [Buy]       [Buy]   [Buy]    │
└────────────────────────────────────────┘

┌─ Gasto últimos 30 días (stacked bar) ──┐
│ apify_scrape    $2.08                  │
│ claude_describe $0.79                  │
│ migration_grant +9.500cr (gratis)      │
└────────────────────────────────────────┘

┌─ Historial (tabla 217 filas paginada) ─┐
│ Fecha    Tipo            Créditos USD  │
│ ...      apify_scrape    -0.12  $0.012 │
│ ...      claude_describe -0.08  $0.008 │
│ Filtros: kind, fecha desde/hasta       │
└────────────────────────────────────────┘
```

### 5.5 D7 · Tutorial system SaaS

```
3 capas de onboarding:

CAPA 1 — Wizard de bienvenida (primera entrada):
  Modal full-screen con 4 pasos:
  · Paso 1: "Bienvenido a AI Smart Content"
  · Paso 2: "Conecta tu primera marca" → CTA hacia /brand-organization
  · Paso 3: "Define competidores" → CTA hacia /monitoring
  · Paso 4: "Listo para Vera" → CTA hacia /vera
  Saltable. Guarda progreso en profiles.tour_completed_at

CAPA 2 — Checklist progresivo (always visible):
  Floating bottom-right:
  ┌──────────────────────────────┐
  │ Empezando... 2/5             │
  │ ✓ Crear cuenta               │
  │ ✓ Crear marca                │
  │ ☐ Conectar Meta              │
  │ ☐ Definir 3 competidores     │
  │ ☐ Generar primer contenido   │
  └──────────────────────────────┘
  Click en cada item → navega a la página correspondiente
  Auto-actualiza al completar

CAPA 3 — Tooltips contextuales (data-tour="key"):
  Primera vez en cada vista:
  · Dashboard: "Aquí ves la salud de tu marca en tiempo real"
  · Studio: "Ejecuta flows de IA en 1 click"
  · Vera: "Tu agente estratégica — pregúntale lo que quieras"
  · Monitoring: "Configura sensores para tus competidores"
  Dismissible. Guarda dismisses por usuario en localStorage.

Storage:
  - profiles.tour_completed_at (timestamptz)
  - localStorage.dismissed_tooltips (Set<string>)
```

### 5.6 D8 · NotificationBell + Activity Timeline

```js
// NotificationBell mixin en Navigation.js
// Badge con polling cada 60s a /notifications/me/unread-count
// Dropdown con últimas 10 desde /notifications/me
// Click marca como actioned/read según type
// Estado per-user (org_notification_user_state)

// /org/:short/:slug/activity
// Feed unificado cronológico con 5 fuentes:
//   - intelligence_signals (señales capturadas)
//   - mission_runs (misiones completadas)
//   - delivery_events (publicaciones)
//   - provisioning_events (VM creada/dormida)
//   - vera_pending_actions resueltas (decisiones)
// Filtros checkbox por tipo
// Pagination scroll infinito
```

### 5.7 D9 · HealthView (6 cards en grid 3×2)

```
1. Storage:
   used_mb / max_mb con barra (bug fix incluido — incluir bucket production-outputs)

2. Créditos:
   credits_available / credits_total + top 3 consumidores desde credit_usage

3. Vera (Anthropic):
   usd_today / cap_diario + usd_month / cap_mensual + modelo activo
   Datos: claude_cap_check + v_org_claude_usage_today

4. Sensores (13 tipos):
   Cada sensor: status + último run + next run
   Click → /monitoring

5. Integraciones API:
   🟢 Meta (Facebook+Instagram) · 🟢 GA4 · 🟡 YouTube
   Last sync timestamp por integración

6. OpenClaw VM:
   IP, sleeping=false, uptime, last_request, last_healthy_at
   Datos: openclaw_instances
```

### 5.8 D10-D13 · Monitoring/CommandCenter/Tasks/Brand Intelligence

Cada uno detallado en sus secciones del cronograma. Patrón común: consumir tablas existentes, renderizar con componentes nuevos (charts, tables, cards).

### 5.9 D14 · Studio Programar (el más complejo, último)

```
Reemplaza StudioView.js:82-92 placeholder:

Form de programación:
  · Cron picker visual con presets (daily 9am, weekly Mon, etc.)
  · Selectores: entity_ids[], campaign_ids[], audience_ids[] (multi-select)
  · aspect_ratio dropdown
  · production_count (1-10)
  · production_specifications (textarea)
  · job_name autogenerado o custom

INSERT a flow_schedules (con composition_mode=any para arrays).
Trigger tr_sync_flow_cron registra en cron.job automáticamente.
execute_scheduled_flow dispara el webhook a n8n cuando llega la hora.

Lista lateral: schedules activos del flow
  · cron · próxima ejecución · creado por · estado
  · [Pausar] [Eliminar]

⚠ Contrato BD vs repo:
  Repo: entity_id, campaign_id, audience_id (singulares)
  BD real: entity_ids[], campaign_ids[], audience_ids[] + composition_mode
  Verificar columns reales con information_schema antes de implementar
```

### 5.10 D15-D16 · QA + Demo

Smoke test E2E completo, cleanup, dry-run de demo.

---

## 6. Stack técnico

```
HTML5 SPA (vanilla JS)             ya en uso
Supabase JS SDK 2.103.2             ya en uso
Chart.js                            cargar lazy en views con charts
History API + lazy-loading scripts  ya en uso
Custom CSS modules en bundle.css    seguir patrón actual
Mixins en Object.assign(prototype)  patrón ya usado
Supabase Realtime                   ya en uso para ai_messages, extender
Netlify Functions (proxy)           ya en uso
```

**Sin dependencias nuevas excepto:**
- Cron picker (component custom o cron-builder)
- Word cloud (d3-cloud o vanilla)

---

## 7. Cómo trackear progreso

Al final de cada día actualizar la **Bitácora** (sección 9) y el frontmatter del archivo:

```yaml
status: in_progress
last_completed_day: D5
days_remaining: 11
blockers: []
```

Smoke test diario (3 min):
1. `netlify dev` local
2. Login → navegar a vista del día
3. Network tab: 0 requests con error
4. Console: 0 errores no controlados
5. Vista renderiza datos reales

---

## 8. Riesgos y dependencias

### 8.1 Lo que NO bloquea este sprint

```
🟢 BUG-003 OpenAI quota → ai_brand_vectors vacío no rompe ninguna UI
🟢 FEAT-014 anthropic-proxy → BudgetIndicator funciona con $0.00 si no hay metering
🟢 OPS-001/002/003/005/006 → no afectan UX del sprint
🟢 FEAT-012 user provisioning → cliente actual ya provisionado
🟢 Refactor Dashboard ya hecho → partimos de mixins limpios, no hay deuda estructural
```

### 8.2 Lo que sí podría bloquear

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Vera Strategist falla primer batch lunes 11/05 | Media | D4 incluye debug del prompt; data manual con INSERT si falla |
| `flow_schedules` schema (singular vs array) | Media | D14 verifica con `information_schema.columns` antes de implementar |
| RPCs nuevas devuelven shape inesperado | Baja | D1-D3 verifican shape al renderizar |
| Performance con 3.730 filas en Trends | Baja | RPC ya soporta `p_limit`, paginar server-side |

---

## 9. Bitácora del sprint

### D1 — 2026-05-06 (hoy)
- [x] **Refactor estructural Dashboard** — `DashboardView.js` 2853 → 298 líneas (core) + 4 mixins shell en `js/views/dashboard/`. App-loader actualizado. Todos los tabs en "Próximamente" temporalmente. Sintaxis OK, 0 referencias externas a métodos removidos.
- [ ] `getOptimizationInsights()` en MiBrandaDataService
- [ ] Construir `MyBrands.mixin.js` completo (15 charts) desde el shell
- [ ] Render bullets de optimization insights en Mi Marca
- [ ] Mi Marca: 15 charts profesionales completos
- [ ] Flip `TABS_ENABLED['my-brands'] = true`
- [ ] Smoke test local OK (netlify dev → /dashboard → 0 errores Network/Console)
- [ ] Push a main

> **Nota:** `getIntelligence()` y "Inteligencia ofensiva en Dashboard 2" se movieron a D2 porque Competence se construye desde shell también (no hay código viejo que upgradear). El alcance de D1 queda focalizado en Mi Marca + service addition.

**Notas:**

---

### D2 — 2026-05-07
_(actualizar al cerrar el día)_

---

### D3 — 2026-05-08
_(actualizar al cerrar el día)_

---

## 10. Definition of Done global

1. ✅ Los 4 dashboards funcionan con 65+ charts profesionales
2. ✅ Las 10 RPCs nuevas tienen consumer en frontend
3. ✅ NotificationBell visible globalmente
4. ✅ Vera Chat con UX profesional (modal + budget + stream + inbox)
5. ✅ 0 placeholders "Próximamente"
6. ✅ 0 referencias a `from('brands')` o `from('audiences')`
7. ✅ Página Planes nueva con comparativa 5 tiers
8. ✅ Créditos optimizada con tienda + chart + ledger
9. ✅ Tutorial system SaaS funcional (3 capas)
10. ✅ Activity Timeline + HealthView + CommandCenter mejorado + Tasks reescrita
11. ✅ Smoke test E2E pasa
12. ✅ Performance: cada vista <1.5s en red 4G
13. ✅ Demo dry-run aprobada
14. ✅ Email a clientes piloto enviado

**Entregable final:** `https://aismartcontent.io` 100% expuesto y demo-ready para venta.

---

## 11. Anexo: archivos del repo afectados

```
js/views/DashboardView.js                    core orquestador (refactor 2026-05-06 ✅)
js/views/dashboard/MyBrands.mixin.js         construir desde shell (D1)
js/views/dashboard/Competence.mixin.js       construir desde shell (D2)
js/views/dashboard/Tendencies.mixin.js       construir desde shell (D2-D3)
js/views/dashboard/Strategy.mixin.js         construir desde shell (D3)
js/services/MiBrandaDataService.js           agregar getOptimizationInsights()
js/services/CompetenciaDataService.js        agregar getIntelligence()
js/services/StrategiaDataService.js          REESCRIBIR a 1 RPC
js/services/TendenciasDataService.js         CREAR (nuevo)
js/views/VeraView.js                         4 mejoras
js/views/MonitoringView.js                   3 tabs CRUD
js/views/StudioView.js                       botón Programar (líneas 82-92)
js/views/TasksView.js                        REESCRIBIR (4 tabs reales) + purgar bugs
js/views/CommandCenterView.js                MEJORAR
js/views/CreditsView.js / CreditsShopView.js MEJORAR
js/views/HealthView.js                       CREAR (nuevo)
js/views/ActivityView.js                     CREAR (nuevo)
js/views/PlanesView.js                       CREAR (nuevo)
js/views/DevLeadLexiconView.js               CREAR (nuevo)
js/components/Navigation.js                  + Notifications.mixin.js
js/components/navigation/Notifications.mixin.js   CREAR (nuevo)
js/components/CostConfirmModal.js            CREAR (nuevo)
js/components/BudgetIndicator.js             CREAR (nuevo)
js/components/ActivityStream.js              CREAR (nuevo)
js/components/PendingActionsInbox.js         CREAR (nuevo)
js/components/EmptyState.js                  CREAR (nuevo)
js/components/Skeleton.js                    CREAR (nuevo)
js/components/charts/ChartLine.js            CREAR
js/components/charts/ChartBar.js             CREAR
js/components/charts/ChartDonut.js           CREAR
js/components/charts/ChartHeatmap.js         CREAR
js/components/charts/ChartRadar.js           CREAR
js/components/charts/ChartScatter.js         CREAR
js/components/charts/Gauge.js                CREAR
js/components/charts/Sparkline.js            CREAR
js/components/charts/WordCloud.js            CREAR
js/components/tutorial/TutorialOverlay.js    CREAR (nuevo)
js/components/tutorial/ChecklistOnboarding.js CREAR (nuevo)
js/components/tutorial/TooltipContextual.js  CREAR (nuevo)
js/app.js                                    registrar 4 rutas nuevas (/plans, /activity, /health, /lexicon)
css/modules/dashboard.css                    estilos charts
css/modules/notifications.css                estilos NotificationBell
css/modules/health.css                       estilos HealthView
css/modules/planes.css                       estilos PlanesView
css/modules/tutorial.css                     estilos tour
```

---

_Última actualización: 2026-05-06 10:30 Bogota — refactor Dashboard reflejado en D1, D2, sección 8.1, sección 11._
