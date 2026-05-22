# Auditoría Frontend vs Backend — 2026-05-05

> **Status (2026-05-22):** ⚠️ Documento HISTORICO. La auditoria identifico 5
> areas no consumidas. Estado actual de cada una:
>
> | Area auditada | Cubierta hoy por |
> |---|---|
> | P0: Activar TendenciasView + EstrategiaView | ✅ Scope de [SPRINT-FRONTEND-100](./SPRINT-FRONTEND-100-2026-05-06.md) (martes 26/05) |
> | P1: NotificationBell + inbox `org_notifications` | ⚠️ **NO COVERED** — crear task formal `FEAT-026-notification-bell` |
> | P2: Multi-platform provision UI | ⚠️ Parcial: backend `populator` cerrado (memoria `multiplatform-populator`); falta UI de aprobacion para emerging brands |
> | P3: Servicios mejorados (Mi Marca/Competencia con nuevas RPCs) | ⚠️ Cubierto parcial por [FEAT-007](./FEAT-007-frontend-services-refactor.md) (refactor) y [FEAT-008](./FEAT-008-frontend-new-services.md) |
> | P4: Lexicon review (admin) | ⚠️ **NO COVERED** — crear task formal `OPS-012-lexicon-review-admin` o decidir si scope futuro |
>
> **Accion**: cuando se cierren las 2 areas "NO COVERED" (con task formal o
> decision explicita de descarte), borrar este archivo. Por ahora se mantiene
> como referencia historica del gap.

**Estado original (2026-05-05):** El frontend está **masivamente desfasado** respecto al backend. Se construyeron **31 migraciones SQL nuevas (v23-v53)**, **6 servicios Python nuevos** y **30+ endpoints FastAPI nuevos** que el frontend NO consume.

---

## 1. Resumen ejecutivo

| Capa | Frontend | Backend | Gap |
|---|---|---|---|
| Dashboard 1 (Mi Marca) | Llama 13 RPCs viejas | RPCs migradas a `post_patterns` | ⚠️ funciona pero no aprovecha mejoras |
| Dashboard 2 (Competencia) | Llama 11 RPCs viejas | RPCs migradas + nuevo `dashboard_competencia_intelligence` | ⚠️ funciona pero pierde inteligencia ofensiva |
| Dashboard 3 (Tendencias) | **TAB DESHABILITADA** (`tendencies: false`) | **3 sistemas completos**: `audience_demand_signals`, `targeted_trend_signals`, `emerging_brand_candidates` + `vera_content_signals` view | ❌ NO consumido |
| Dashboard 4 (Estrategia) | **TAB DESHABILITADA** (`strategy: false`) | Sistema completo: `vera_strategist` con Opus 4.7, `strategic_recommendations`, workflow approve/reject/iterate | ❌ NO consumido |
| Notificaciones org | No existe UI | `org_notifications` + `org_notification_user_state` (per-user inbox) | ❌ NO consumido |
| Multi-platform provision | No existe UI | `/intelligence/add-multi-platform`, brand groups, emerging brands approve flow | ❌ NO consumido |
| Aprobación lexicon | No existe UI | `dimension_lexicon`, `enrich_lexicon_proposal`, review workflow | ❌ NO consumido |
| Estado integraciones API | UI de conexión OAuth | 13 sensores activos pulleando data REAL (Meta + GA4 + audiencias) | ⚠️ no se ve estado |

---

## 2. Detalle de discrepancias

### 2.1 Tabs deshabilitados en `DashboardView.js`

```js
// Línea 13-18 de js/views/DashboardView.js
static TABS_ENABLED = {
  'my-brands':  true,
  'competence': true,
  'tendencies': false,   // ❌ DEBE activarse + reescribirse
  'strategy':   false,   // ❌ DEBE activarse + crearse
};
```

### 2.2 Servicios viejos a auditar/migrar

| Service | Estado actual | Acción requerida |
|---|---|---|
| `MiBrandaDataService.js` | Llama 13 RPCs `dashboard_brand_*` | Funciona; agregar llamada a `dashboard_brand_optimization_insights` (nuevo) |
| `CompetenciaDataService.js` | Llama 11 RPCs viejas | Funciona; **CRÍTICO: agregar `dashboard_competencia_intelligence`** (winning combos, gap explotables) |
| `StrategiaDataService.js` | Lee tablas raw (`vera_pending_actions`, `brand_vulnerabilities`, etc.) | **REESCRIBIR**: usar `dashboard_strategy_master` |
| `MonitoringDataService.js` | CRUD de `intelligence_entities` + `monitoring_triggers` | OK; agregar UI para multi-platform provision |

---

## 3. Backend nuevo que el frontend NO consume

### 3.1 RPCs migradas (Sept 2026)
Estas están vivas en BD. Los services viejos siguen funcionando pero podrían aprovechar versiones más limpias:

```
dashboard_brand_optimization_insights      ← NEW (insights accionables)
dashboard_competencia_intelligence         ← NEW (winning combos, white space)
dashboard_market_intelligence              ← NEW (tone/topic/format trends del ecosistema)
dashboard_targeted_trends                   ← NEW (smart query trends por origen)
dashboard_audience_demand                   ← NEW (intent del consumidor)
dashboard_emerging_brands                   ← NEW (marcas emergentes pending review)
dashboard_strategy_master                   ← NEW (Dashboard 4 master)
dashboard_strategic_recommendations         ← NEW (lista propuestas Vera)
recommendation_learning_stats               ← NEW (approval rate, prediction error)
build_full_brand_intelligence_context       ← NEW (10 capas para Vera)
```

### 3.2 Tablas nuevas sin UI

```
audience_demand_signals      (200+ rows)   — Google Suggest + YT + Trending search
targeted_trend_signals       (3,730 rows)  — Smart query Google News (vera_safe filtered)
emerging_brand_candidates    (4 rows)      — Marcas detectadas pending approval
strategic_recommendations    (4 rows)      — Propuestas Vera workflow
org_notifications            (2 rows)      — Notificaciones org (cualquier miembro ve)
org_notification_user_state              — Estado lectura per-user
dimension_lexicon            (160 rows)    — Vocabulario aprendido (16 approved, 37 proposed)
brand_communication_patterns (10 rows)    — Vulnerabilidades + fortalezas
trends_category_templates    (10 rows)    — Templates pre-armados (bebidas, moda, food, tech...)
provocative_brand_exceptions (6 rows)     — Liquid Death etc. preservadas como competitor_move
country_aliases              (60 rows)    — Mapper Colombia→CO, Latinoamérica→[CO,MX,AR,...]
trends_category_templates    (10 rows)
```

### 3.3 Endpoints FastAPI nuevos (ai-engine `:8001`)

```
POST  /strategy/synthesize           — Genera batch Vera
POST  /strategy/regenerate           — Regenera con feedback
POST  /strategy/approve
POST  /strategy/reject
POST  /strategy/iterate
POST  /strategy/mark-published
GET   /strategy/recommendations/{brand_id}
GET   /strategy/learning-stats/{brand_id}
GET   /strategy/context/{brand_id}
GET   /strategy/dashboard/{brand_id}

POST  /intelligence/add-multi-platform   — 1 handle → N entities
GET   /intelligence/brand-groups/{brand_id}
POST  /intelligence/deactivate-entity
POST  /intelligence/reactivate-entity

GET   /emerging-brands/{org_id}
POST  /emerging-brands/approve            — auto-provision multi-platform
POST  /emerging-brands/reject

GET   /audience-demand/dashboard/{brand_id}

GET   /notifications/me                   — inbox per-user
GET   /notifications/me/unread-count      — badge UI
POST  /notifications/mark                 — read|actioned|dismissed per-user
```

### 3.4 Crons systemd activos en ai-engine

| Cron | Frecuencia | Propósito |
|---|---|---|
| `audience-demand.timer` | 6h | Pull Google Suggest + YT + Trending RSS + TikTok |
| `vera-strategist.timer` | Lunes 06:00 UTC | Genera batch semanal de propuestas Opus 4.7 |
| `vera-outcomes.timer` | Diario 03:00 UTC | Mide engagement real vs predicción |
| `targeted-trends.timer` (REMOVIDO) | — | Reemplazado por audience-demand |
| `trends-refresh.timer` (REMOVIDO) | — | Reemplazado por audience-demand |

13 sensores de monitoring ya activos pulleando data REAL:
- `meta_audience_demographics` — edad/género/ubicación de fans IG/FB
- `meta_ads_audiences_sync` — audiencias custom de Meta Ads
- `ga4_audience_demographics` — demografía web GA4
- `meta_page_insights`, `meta_posts`, `meta_ad_library_sync`
- `ga4_analytics`, `audience_alignment_analysis`
- `brand_audience_heatmap_compute` — best_hour real
- `social` (17 triggers) — scrapers Apify
- `threat_detection`, `mission_generation`, `brand_indexer`

---

## 4. Plan de actualización del frontend (priorizado)

### P0 — Activar lo que ya existe en backend
1. Flip `TABS_ENABLED.tendencies = true` y `TABS_ENABLED.strategy = true` en `DashboardView.js`
2. Crear `TendenciasView.js` con tabs:
   - "Marcas Emergentes" → consume `/emerging-brands/{org_id}` + UI approve/reject 1-click
   - "Demanda Audiencia" → consume `/audience-demand/dashboard/{brand_id}` (high intent + watch intent + trending)
   - "Trends Capturados" → consume vera_content_signals view
3. Crear `EstrategiaView.js` (Dashboard 4) con:
   - Cards de propuestas pending (`GET /strategy/recommendations/{brand_id}?status=pending`)
   - Botones Aprobar | Rechazar (con razón) | Iterar (con feedback)
   - Sección "Producción" con propuestas approved
   - Sección "Métricas" con learning_stats (approval rate, prediction error)
   - Sección "Data Drift Alerts" (alignment_score < 0.6)

### P1 — Notificaciones org
4. Componente `NotificationBell.js` en navbar con:
   - Badge con `GET /notifications/me/unread-count`
   - Dropdown con `GET /notifications/me?state=unread`
   - Click marca como `actioned` y navega a `action_url`
   - Estado per-user (Juan marcando NO afecta a María)

### P2 — Multi-platform provision
5. En `MonitoringView.js` agregar botón "Añadir competidor multi-plataforma":
   - Form: handle base + nombre + tipo + checkboxes plataformas + handle_overrides JSON
   - Llama `POST /intelligence/add-multi-platform`
   - Muestra en lista con vista de "brand groups" agrupada

### P3 — Mejoras de servicios existentes
6. `CompetenciaDataService` agregar método `getIntelligence()` → llama `dashboard_competencia_intelligence`
   - Mostrar en UI: winning combos del sector, top threats, vulnerabilidades de competencia, white space gaps
7. `MiBrandaDataService` agregar `getOptimizationInsights()` → llama `dashboard_brand_optimization_insights`
   - Mostrar bullets de "qué hacer bien/mal/optimizar"

### P4 — Lexicon review (admin)
8. Vista admin para revisar `dimension_lexicon WHERE status='proposed'` con approve/reject

---

## 5. Estimación de esfuerzo

| # | Componente | Estimado |
|---|---|---|
| 1 | TendenciasView completa | 2 días |
| 2 | EstrategiaView (Dashboard 4) — la más importante | 3 días |
| 3 | NotificationBell + integración global | 1 día |
| 4 | Multi-platform provision UI | 1 día |
| 5 | Service additions (intelligence, optimization_insights) | 0.5 días |
| 6 | Lexicon admin view | 0.5 días |
| **Total** | | **~8 días dev** |

---

## 6. Lo que justifica esta inversión

Sin frontend actualizado, todo el backend (13 sensores, Vera Strategist con Opus, audience demand intelligence, emerging brand discovery) es **invisible para el cliente**. El usuario paga $999/mes Business pero solo ve datos viejos.

Con el update:
- Vera entrega 5 propuestas accionables/semana visible en UI
- Cliente aprueba/itera con 1 click
- Data drift, marcas emergentes, intent comercial: alertas proactivas
- Notificaciones colaborativas para todo el equipo de la org

**Sin esta capa de UI, AISmartContent es un backend brillante sin producto vendible.**
