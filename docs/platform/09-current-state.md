---
title: 09 — Estado actual de la plataforma
author: Shenoa — Arde Agency S.A.S.
since: 2025-09
last_review: 2026-04-29
audience: humanos del equipo + LLMs
status: refrescar al menos cada 2 semanas
---

# 09 · Estado actual

> Este documento es **el snapshot** del estado de la plataforma a la fecha de `last_review`. Sirve para entender en 5 minutos qué funciona, qué está vacío y qué está roto. Si llegas como agente/LLM nuevo, lee primero esto antes de proponer cambios.

## Resumen ejecutivo

✅ **Pipeline de captura:** funciona. Los sensores Meta/GA4 corren diarios sin errores.
✅ **Pipeline de detección:** funciona. `threat-detector` corre, `mission-generator` corre cada 5 min.
✅ **Pipeline de aprobación:** funciona. `vera_pending_actions` se crea, se puede aprobar via UI/RPC.
✅ **Embeddings infrastructure:** instalada (`pgvector`, RPCs, brand-indexer corre).
✅ **Frontend SPA:** funciona. Auth, navigation, los 4 tabs cargan.

🟡 **Parcial:**
- Frontend tiene 2 services (`MiBrandaDataService`, `StrategiaDataService`); faltan los de Competencia y Tendencias.
- `dashboard_mi_marca` RPC v1 aplicada, falta v2 (sobre matviews) y las otras 3 RPCs.
- Realtime habilitado en 4 tablas; falta extender a las otras 7-8 críticas.

🔴 **Roto / vacío:**
- 13 `body_missions` colgadas tipo `competitor_signal_analysis` desde 27/4 (worker cambió y no procesa este tipo).
- `ai_brand_vectors` y `ai_global_vectors` vacíos (indexer corre pero no produce vectors).
- `competitor_ads`, `retail_prices`, `url_watchers`, `visual_references` vacíos (faltan `intelligence_entities` competidoras configuradas).
- `body_missions` recientes nunca se ejecutan en `mission_runs` (último completed: 2026-04-21).
- 5 tablas con `organization_id NULL` para todas las filas (necesita backfill).

## Frontend — qué funciona y qué falta

### Funciona
- Login flow (Supabase Auth, magic link y password).
- Navigation (sidebar `Navigation.js` + 3 mixins).
- Routing SPA con `/org/:orgIdShort/:orgNameSlug/...`.
- Dashboard tabs UI (skeletons + render).
- Cache busting con `?v=__BUILD_ID__` (post-fix commit 961b5fb).
- Resolución de `orgIdShort` → UUID en `DashboardView` (post-fix commit d3bbf07).
- `MiBrandaDataService` con queries scoped correctamente vía `entity_id` para `intelligence_signals`.

### Pendiente

| Tarea | Owner | Notas |
|---|---|---|
| `CompetenciaDataService.js` | — | Espejo de `MiBrandaDataService` para Mi Competencia |
| `TendenciasDataService.js` | — | Para Tendencias |
| Refactor de services para llamar 1 RPC en lugar de N queries | — | Bloque 4 del plan maestro |
| Suscripciones realtime en dashboards | — | `vera_pending_actions`, `brand_vulnerabilities`, etc. |
| Vista de admin/org del estado de sensores | — | Útil para debug. Lee `monitoring_triggers` + `sensor_runs` |

## Base de datos — estado real (a 2026-04-29)

### Tablas con datos saludables

| Tabla | Filas | Comentario |
|---|---|---|
| `system_metrics` | 70,160 | logs/health del ai-engine |
| `trend_topics` | 639 | tendencias capturadas |
| `sensor_runs` | 329 | 100% success |
| `brand_posts` | 166 | última captura: hoy 13:59 |
| `brand_content_analysis` | 166 | 1:1 con posts |
| `intelligence_signals` | 110 | última: hoy 15:22 |
| `body_missions` | 66 | 13 colgadas desde 27/4 (ver "roto") |
| `mission_runs` | 34 | último completed: 21/4 |
| `agent_queue_jobs` | 34 | 33 completed, 1 failed |
| `vera_pending_actions` | 4 | 1 executing, 2 pending, 1 executed |
| `brand_vulnerabilities` | 10 | mix de severidades |
| `intelligence_entities` | 7 | pocas — explica vacíos |
| `monitoring_triggers` | 17 | 13 active |

### Tablas vacías por configuración

Estas tablas existen pero no tienen filas porque falta configurar las `intelligence_entities` correspondientes:

- `competitor_ads` (0) — necesita entities de tipo competitor
- `retail_prices` (0) — necesita entities de tipo retail/marketplace
- `url_watchers` (0) — necesita URLs configuradas
- `visual_references` (0) — necesita seed inicial
- `product_variants` (0) — productos no tienen variantes definidas

### Tablas vacías por feature no usada

- `ai_brand_vectors`, `ai_global_vectors` (0) — indexer corre pero no escribe (debug)
- `audience_segments` (0) — feature de segmentos no usada todavía
- `brand_assets`, `brand_fonts`, `brand_places`, `brand_rules` (0) — opcionales
- `business_unit_products`, `flow_collaborators`, `flow_runs`, `flow_test_cases` (0)
- `developer_logs`, `developer_notifications`, `developer_stats` (0)
- `external_api_cache` (0)
- `runs_inputs`, `runs_outputs` (0)
- `services`, `subscriptions` (0) — billing no activado todavía
- `system_ai_outputs` (0)
- `user_business_units`, `user_flow_favorites` (0)
- `contact_leads`, `contact_lead_notes` (0) — CRM no activado
- `credit_usage` (0) — créditos no consumidos aún
- `organization_invitations`, `organization_features` (0)

### `organization_id` NULL — backfill pendiente

Tablas con la columna `organization_id uuid` pero filas con NULL:

| Tabla | Por qué tiene NULL | Cómo arreglar |
|---|---|---|
| `brand_vulnerabilities` | jobs viejos no escribieron | UPDATE desde `entity_id` → `intelligence_entities.organization_id` |
| `body_missions` | jobs viejos | UPDATE desde `brand_container_id` → `brand_containers.organization_id` |
| `trend_topics` | scrapers viejos | UPDATE desde `brand_container_id` |
| `brand_analytics_snapshots` | sensores viejos | UPDATE desde `brand_container_id` |
| `flow_schedules` | aún no usado | N/A hasta que se use |

Plan: trigger `BEFORE INSERT` en cada tabla que rellene `organization_id` automáticamente desde la FK si viene NULL.

## AI Engine — estado real

### Funciona
- `ai-engine.service` up con uptime varía (último restart: ~2h antes de 2026-04-29).
- `cloudflared.service` up 16+ días.
- `openclaw-gateway` × 2 corriendo desde 16-19 días.
- Scheduler interno corre.
- 9 sensores brand-wide ejecutándose con cadencia correcta.
- Webhook handler recibe y procesa signals.
- Job worker procesa jobs (cuando son tipos soportados).

### Roto / atención

#### Bug 1 — Body missions colgadas (PRIORITARIO)
**Síntoma:** 13 `body_missions` recientes en `status='pending'` con tipos:
- `competitor_signal_analysis` (mayoría)
- `execute_update_persona`

Última `mission_run` completada: **2026-04-21**. Es decir, hace 8 días que el dispatcher no procesa estos tipos.

**Hipótesis:** algún cambio en `tool.dispatcher.js` o `action-executor.service.js` rompió la ruta. Hay archivos `.bak.20260428-droplegacy`, `.bak.20260428-events`, `.bak.20260428-norm` que podrían tener pistas.

**Cómo investigar:**
```bash
ssh ai-engine '
  # Ver qué tipos de mission acepta el executor
  grep -n "mission_type\|missionType" /root/ai-engine/src/services/action-executor.service.js
  # Ver el último diff
  diff /root/ai-engine/src/services/action-executor.service.js /root/ai-engine/src/services/action-executor.service.js.bak.* 2>/dev/null
  # Ver logs de últimos intentos
  grep -i "competitor_signal_analysis\|update_persona" /root/ai-engine/ai-engine.log | tail -50
'
```

#### Bug 2 — Indexer no produce vectors
**Síntoma:** `brand_indexer` corre con `success` en `sensor_runs`, pero `ai_brand_vectors` y `ai_global_vectors` siguen en 0.

**Hipótesis:**
- La org no tiene suficiente texto en `brand_profiles` (solo 5 filas) o `brand_containers` (4 filas) para que el indexer produzca embeddings.
- Bug silencioso en el flow `getTextsToIndex → embed → upsert` (no levanta error pero no escribe).

**Cómo investigar:**
```bash
ssh ai-engine '
  # Logs específicos del indexer
  grep -i "brand-indexer\|indexBrand\|embedding" /root/ai-engine/ai-engine.log | tail -30
  # Test manual
  cd /root/ai-engine && node test-brand-indexer.mjs 2>&1 | head -30
'
```

#### Bug 3 — Tablas vacías esperando entities
**Síntoma:** `competitor_ads`, `retail_prices`, `url_watchers` vacías pese a sensores corriendo.

**Causa:** solo 7 `intelligence_entities` total, ninguna (probablemente) configurada como competidor o marketplace target.

**Cómo arreglar:**
```sql
-- Inspeccionar las 7 entities
SELECT id, name, domain, target_identifier, metadata
FROM intelligence_entities;

-- Agregar competidores reales:
INSERT INTO intelligence_entities (
  brand_container_id, organization_id, name, domain, target_identifier
) VALUES
  ('<brand_id>', '<org_id>', 'Competidor X', 'social', '@competidor_x'),
  ('<brand_id>', '<org_id>', 'Competidor Y - Amazon', 'marketplace', 'B0XXXXXXXX');
```

Trigger `fn_intelligence_entities_after_insert` debería provisionar sensores per-entity automáticamente.

## Realtime — estado actual

### Activo
- `vera_pending_actions`
- `ai_messages`
- `ai_conversations`
- `user_notifications`

### Falta agregar (para que el dashboard sea reactivo)
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.brand_vulnerabilities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.intelligence_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.body_missions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.retail_prices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.competitor_ads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trend_topics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.monitoring_triggers;
```

## Capa precomputada — pendiente

Solo existe `v_orphan_topics`. Las siguientes matviews están en el plan pero no implementadas:

```
mv_dashboard_health         (refresh 5 min)
mv_threat_level             (refresh 5 min)
mv_signal_velocity_24h      (refresh 15 min)
mv_brand_format_stats       (refresh 1 h)
mv_sentiment_breakdown      (refresh 1 h)
brand_metrics_daily         (cron 00:00 UTC, tabla regular con snapshots)
```

Tampoco existen funciones SQL puras de scoring:
- `health_score(org)`
- `threat_level(org)`
- `mention_velocity(entity, h)`

Estas serían las primeras a construir cuando se ataque el Bloque 2 del plan maestro.

## Capa de lectura (RPCs por dashboard)

| RPC | Estado |
|---|---|
| `dashboard_mi_marca(p_org_id, p_window_d, p_sections)` | ✅ aplicada (v1, lee tablas directas — futura v2 sobre matviews) |
| `dashboard_competencia(...)` | 🚧 pendiente |
| `dashboard_tendencias(...)` | 🚧 pendiente |
| `dashboard_estrategia(...)` | 🚧 pendiente |

`dashboard_mi_marca` v1 fue aplicada vía Mgmt API el 2026-04-29. Probada con `is_org_member` check (devolvió `forbidden` cuando se invocó como `postgres`, comportamiento correcto).

Para usarla desde el frontend:

```js
const { data, error } = await supabase.rpc('dashboard_mi_marca', {
  p_org_id: orgUuid,
  p_window_d: 30,
  p_sections: null  // null = todas las secciones
});
// data = { header, operatividad, identidad, comercial, social, diagnostico }
```

## Deuda técnica

### Alta prioridad
1. **Reparar competitor_signal_analysis dispatcher** (Bug 1).
2. **Configurar intelligence_entities competidoras** (Bug 3).
3. **Backfill organization_id NULL** en 5 tablas.
4. **Frontend `?v=__BUILD_ID__` audit** — verificar que ninguno quedó sin cache-bust.

### Media prioridad
5. **Implementar matviews precomputadas** (5 matviews + cron jobs).
6. **Crear las 3 RPCs de dashboard restantes**.
7. **Refactor MiBrandaDataService → 1 RPC**.
8. **Crear los 2 services frontend faltantes** (Competencia, Tendencias).
9. **Extender realtime a 7 tablas más**.
10. **Debug brand-indexer** para que produzca vectors.

### Baja prioridad
11. Limpiar archivos `.bak.*` con > 30 días.
12. Configurar Hetzner snapshots semanales.
13. Configurar uptime monitor externo.
14. Migrar Netlify Functions pesadas a Supabase Edge Functions (opcional).
15. Configurar `supabase` CLI con migraciones versionadas.
16. Documentar todos los `monitoring_triggers.sensor_type` con su payload schema.
17. Tests automatizados (no hay test suite).

## Cómo medir progreso

Cada vez que se cierre un item:
1. Actualizar este doc (mover de "pendiente" a "funciona", o quitar de "roto").
2. Commit con mensaje claro.
3. Si afecta arquitectura: actualizar también `02-architecture.md` o el doc relevante.
4. Bumpear `last_review` en frontmatter.

## Cambios recientes (changelog)

### 2026-04-29
- Inventario completo de BD y AI Engine documentado.
- Fix: `DashboardView` resuelve UUID completo en lugar de `orgIdShort` (commit `d3bbf07`).
- Fix: `MiBrandaDataService` scoping correcto de `intelligence_signals` via `entity_id` (commit `d3bbf07`).
- Fix: cache-bust `?v=__BUILD_ID__` agregado a todos los `<script>` de `index.html` y a `BaseView.loadScript()` (commit `961b5fb`).
- Aplicado: RPC `dashboard_mi_marca` v1 a Supabase via Management API.
- Documentación: creada esta carpeta `docs/platform/`.

### Anteriores (pre 2026-04-29)
- Ver `git log` para historial detallado.

---

*Anterior: [08 — Deployment & ops](./08-deployment.md) · Siguiente: [10 — Extender la plataforma](./10-extending.md)*
