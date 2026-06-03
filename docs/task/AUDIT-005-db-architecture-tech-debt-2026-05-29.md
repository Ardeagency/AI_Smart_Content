# AUDIT-005 — Deuda tecnica de arquitectura de base de datos

**Fecha:** 2026-05-29
**Proyecto Supabase:** `tsdpbqcwjckbfsdqacam` (AI Smart Content / ai-engine)
**Estado:** DOCUMENTADO — no aplicado. El usuario termina su iteracion en curso y luego re-auditamos antes de corregir.

## Veredicto general

Arquitectura **solida**. RLS casi universal (166/167 tablas), todas las tablas de negocio con PK, integridad referencial declarada con FKs reales, base chica (mayor tabla 60MB). Nada roto ni peligroso. Lo encontrado es **deuda de higiene por migraciones repetidas** que no chequearon lo existente.

### Snapshot del schema (2026-05-29)
- Tablas (public): 167
- Vistas: 15 / Funciones: 249 / Triggers: 72 / Indices: 549 / Extensiones: 10

---

## 🔴 Seguridad (prioridad 1)

### S1. 56 funciones `SECURITY DEFINER` sin `search_path` fijo
Lint clasico de Supabase. Definer sin `SET search_path` es secuestrable si un atacante crea objetos en un schema que precede en el path.
Ejemplos: `build_full_brand_intelligence_context`, casi todas las `dashboard_*`, `approve_strategic_recommendation`, `apply_trends_template`, `bind_comfy_flow`.
**Fix:** `ALTER FUNCTION <fn>(<args>) SET search_path = public, pg_temp;` (masivo, generable por script).

### S2. 170 de 249 funciones (68%) son `SECURITY DEFINER`
Proporcion muy alta. Cada definer corre con permisos del owner saltando RLS. Revisar cuales realmente *necesitan* definer vs poder pasar a `INVOKER`.

### S3. 23 vistas/matviews sin `security_invoker=on`
Corren con permisos del creador, no del caller -> saltan el RLS del que consulta. Critico en multi-tenant para las org-scoped:
`v_org_billing`, `v_org_credits_display`, `v_org_credit_burn_30d`, `v_org_provisioning_status`, `v_org_server_status`, `v_org_claude_usage_today`.
Si se exponen via Data API a un usuario final, podria ver datos de otra org.
**Nota:** las `mv_*` son materialized views y no soportan `security_invoker` — inherente, no es bug.
**Fix vistas normales:** `ALTER VIEW <v> SET (security_invoker = on);`

---

## 🟡 Rendimiento / indices (prioridad 2)

### P1. 15 pares de indices DUPLICADOS (mismas columnas, distinto nombre)
Sintoma de migraciones que no chequearon lo existente. Cada par: dropear uno.

| Tabla | Indices duplicados |
|---|---|
| retail_prices | idx_retail_prices_org / idx_retail_prices_organization_id |
| url_watchers | idx_url_watchers_org / idx_url_watchers_organization_id |
| competitor_ads | idx_competitor_ads_org / idx_competitor_ads_organization_id |
| campaigns | idx_campaigns_brand / idx_campaigns_brand_container |
| campaigns | idx_campaigns_platform / idx_campaigns_platform_origin |
| flow_runs | idx_flow_runs_brand / idx_flow_runs_brand_id |
| flow_runs | idx_flow_runs_n8n_exec / unique_n8n_execution_id |
| intelligence_signals | idx_intelligence_signals_captured / _captured_at |
| system_metrics | system_metrics_time_idx / idx_system_metrics_captured_at |
| openclaw_instances | openclaw_instances_organization_id_key / openclaw_instances_org_idx |
| openclaw_instances | idx_openclaw_instances_agent_id / openclaw_instances_agent_id_idx |
| content_flows | idx_content_flows_slug / content_flows_slug_key |
| brand_analytics_snapshots | idx_brand_analytics_snapshots_period / idx_brand_analytics_period |
| organization_invitations | idx_org_invitations_token / organization_invitations_token_key |
| brand_health_snapshots | brand_health_snapshots_..._key / bhs_brand_idx |

(Al dropear, conservar el que respalda un UNIQUE/PK constraint; dropear el indice "suelto".)

### P2. ~17 indices NUNCA usados (idx_scan=0)
Los caros: `system_metrics` (2 indices ~8MB, uno ademas duplicado), `ai_brand_vectors_embedding_idx` (2MB — **el indice vectorial nunca se escanea; verificar si la busqueda semantica esta cableada**), varios GIN en `brand_posts` (topics/hashtags/flags/mentions), `ai_messages_metadata_gin`, `runs_outputs` idx_runs_outputs_models.
Revisar uno por uno; idx_scan=0 puede ser feature poco usada, no necesariamente muerta.

### P3. ~98 FKs sin indice de cobertura
A escala actual (DB chica) no duele, pero golpea joins y `ON DELETE`. Priorizar tablas calientes:
`sensor_runs` (3 FKs), `runs_outputs`, `intelligence_signals`, `intelligence_entities`, `monitoring_triggers` (3 FKs), `system_ai_outputs` (7 FKs).
Las de `created_by`/`user_id` son menos urgentes.

---

## 🟢 Limpieza (prioridad 3, bajo riesgo)

### L1. 4 tablas backup huerfanas (sin PK, sin RLS)
`_bak_stuck_actions_2026_05_05`, `_bak_stuck_missions_2026_05_05`, `content_subcategories_bak_20260527`, `content_subcategory_categories_bak_20260527`. Si ya cumplieron, dropear.

### L2. ~43 tablas vacias en public
Mezcla. **Legitimas (feature pendiente):** canvas_*, stripe_*/wompi_customers (esperando credenciales), mfa/oauth (cubierto por auth), brand_places/place_images (recien creadas).
**Posibles muertas a revisar:** demo_*, developer_*, flow_collaborators, flow_test_cases, real_world_signals, crisis_signals, audience_demand_signals, similar_products_detected.

### L3. Inconsistencia naming `org` vs `organization_id`
Origen de los duplicados de P1. No rompe nada, ensucia. Estandarizar a `organization_id`.

---

## Lo que esta BIEN (no tocar)
- RLS en 166/167 tablas (solo `provider_rate_buckets` sin RLS, 1 fila de config).
- Todas las tablas de negocio con PK.
- Bloat controlado, autovacuum corriendo.
- FKs declaradas en todo el modelo (integridad real).
- Schema unificado runs_outputs/system_ai_outputs ya trabajado.

---

## Como re-auditar (queries reproducibles)

Helper: `~/.claude/arde-tools/supabase/runsql.sh` (lee `.env`, hace POST al Management API). Uso: `echo "SQL" | runsql.sh`.

```sql
-- Snapshot
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS tables,
  (SELECT count(*) FROM information_schema.views WHERE table_schema='public') AS views,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS functions,
  (SELECT count(*) FROM pg_indexes WHERE schemaname='public') AS indexes;

-- S1: definer sin search_path
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%');

-- S3: vistas sin security_invoker
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('v','m')
AND NOT EXISTS (SELECT 1 FROM unnest(c.reloptions) o WHERE o LIKE 'security_invoker=%');

-- P1: indices duplicados
SELECT indrelid::regclass::text, array_agg(indexrelid::regclass::text)
FROM pg_index pi
WHERE indrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r')
GROUP BY indrelid, indkey, indclass, indexprs::text, indpred::text HAVING count(*)>1;

-- P2: indices nunca usados
SELECT ui.relname, ui.indexrelname, pg_size_pretty(pg_relation_size(ui.indexrelid)) sz, ui.idx_scan
FROM pg_stat_user_indexes ui JOIN pg_index i ON i.indexrelid=ui.indexrelid
WHERE NOT i.indisunique AND NOT i.indisprimary AND ui.idx_scan=0
AND pg_relation_size(ui.indexrelid)>16384 ORDER BY 3 DESC;

-- P3: FKs sin indice
SELECT conrelid::regclass::text, conname FROM pg_constraint c
WHERE contype='f' AND connamespace='public'::regnamespace
AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid AND (c.conkey::int[]) <@ (i.indkey::int[]));

-- RLS off / RLS sin policies
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
```

## Plan al re-auditar
Aplicar como bloques separados, cada uno con aprobacion del usuario:
1. **Seguridad** (S1 search_path + S3 security_invoker en vistas org)
2. **Indices** (P1 dropear duplicados + P2 revisar/dropear no usados + P3 crear FK indices calientes)
3. **Limpieza** (L1 backups + L2 revisar vacias + L3 naming)
