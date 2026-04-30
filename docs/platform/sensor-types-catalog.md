# Catálogo de `sensor_type`

Documenta los 13 `sensor_type` activos en `monitoring_triggers`. Cada uno representa un job periódico que consume integraciones externas o computa derivados internos.

> **Despachador central:** `ai-engine/src/services/social-scraper.service.js` (switch alrededor de la línea 1144 — `sensorType === "..."`).
> Cada handler escribe un `sensor_runs` row con `status` + `stats`. Si el handler `throw`-ea, el catch externo marca `status='failed'` con `error_message`.

---

## Brand-wide (un trigger por marca, sin `entity_id`)

### `brand_indexer`

**Cadencia:** daily
**Handler:** `services/brand-indexer.service.js → runBrandIndexer()`
**Despacho:** `social-scraper.service.js:1220`

**`config` payload:** sin parámetros de runtime — el indexer descubre fuentes desde tablas. `auto_created_by` es metadata.

**Inputs (lee):** `brand_profiles`, `brand_containers` (verbal_dna, visual_dna, propuesta_valor, palabras_clave, …), `brand_entities`, `products`, `services`.

**Outputs (escribe):** `ai_brand_vectors` (embeddings text-embedding-3-large @ 1536d, idempotente por SHA-256 en `metadata.content_hash`).

**Stats:** `chunks_indexed`, `chunks_unchanged`, `embed_errors`, `db_errors`, `breakdown` (counts por bucket), `error` (si todos los embeds fallan).

**Errores típicos:**
- `embeddings_failed_all (... 429: You exceeded your current quota)` → quota OpenAI agotada. El sensor_run se marca `failed` (después del fix de BUG-002).
- `OPENAI_API_KEY no configurada` → `.env` del ai-engine.

---

### `mission_generation`

**Cadencia:** typically daily
**Handler:** `services/mission-generator.service.js → generateMissionsForBrand()`
**Despacho:** `social-scraper.service.js:1213`

**`config` payload:** ninguno.

**Outputs:** `body_missions` (filas con `mission_type`, `status='queued'|'completed'`, `payload` jsonb).

**Stats:** `missions_generated`, `skipped_existing`.

---

### `threat_detection`

**Cadencia:** continua (typically hourly)
**Handler:** `services/threat-detector.service.js → runThreatDetection()`
**Despacho:** `social-scraper.service.js:1234`

**`config` payload:** ninguno (todas las heurísticas leen de tablas).

**Detectores:** `competitor_virality`, `own_engagement_drop`, `negative_sentiment_spike`.

**Outputs:** `brand_vulnerabilities` (severity, status='open'), `intelligence_signals` (signal_type='crisis|negative_review'), opcionalmente `vera_pending_actions`.

**Stats:** `total_detected`, contadores por detector.

---

### `meta_ad_library_sync`

**Cadencia:** daily
**Handler:** `services/social-scraper.service.js → runMetaAdLibrarySync()`
**Despacho:** `social-scraper.service.js:1243`

**`config` payload:** ninguno (descubre competidores desde `intelligence_entities`).

**Outputs:** `competitor_ads` (insert/update por `ad_archive_id`).

**Stats:** `competitors_searched`, `ads_inserted`, `ads_updated`, `ads_filtered_out`.

**Errores típicos:** rate limit Meta Graph API → reintento próxima ventana.

---

### `meta_audience_demographics`

**Cadencia:** daily
**Handler:** `getMetaAudienceDemographics()` + `persistAudienceDemographics(...,"meta")`
**Despacho:** `social-scraper.service.js:1166`

**`config` payload:** ninguno (resuelve `page_id` / `ig_user_id` desde la integración OAuth de la org).

**Outputs:** `brand_audience_personas` (UPSERT por persona).

**Stats:** `sources`, `total_audience`, `personas_updated`.

**Errores:** 401 token expirado → `token-refresh.service` lo arregla en próximo ciclo. (#10) Application does not have permission → reconfigurar OAuth scopes.

---

### `ga4_audience_demographics`

**Cadencia:** daily
**Handler:** `getGa4AudienceDemographics()` + `persistAudienceDemographics(...,"ga4")`
**Despacho:** `social-scraper.service.js:1175`

**`config` payload:** ninguno.

**Outputs:** `brand_audience_personas`.

**Stats:** `sources`, `total_audience`, `personas_updated`.

---

### `meta_ads_audiences_sync`

**Cadencia:** daily/weekly
**Handler:** `getMetaAdsAudiences()` + `persistAudienceSegments()`
**Despacho:** `social-scraper.service.js:1184`

**`config` payload:** ninguno (resuelve ad account desde la integración).

**Outputs:** segmentos custom/saved → tablas de audience segments.

**Stats:** `ad_account`, `custom_count`, `saved_count`, `upserted`.

---

### `audience_alignment_analysis`

**Cadencia:** weekly
**Handler:** `services/audience-alignment.service.js → runAlignmentForBrand()`
**Despacho:** `social-scraper.service.js:1194`

**`config` payload:** ninguno.

**Outputs:** scores por persona; cuando `score < 0.5` puede crear `vera_pending_actions`.

**Stats:** `personas_analyzed`, `low_alignment`, `pending_actions`, `skipped`.

---

### `brand_audience_heatmap_compute`

**Cadencia:** daily
**Handler:** `runHeatmapCompute()`
**Despacho:** `social-scraper.service.js:1205`

**`config` payload:** ninguno (usa últimos 365 días de `brand_posts`).

**Outputs:** `brand_audience_heatmap` (UPSERT por platform).

**Stats:** `networks_updated`, `posts_analyzed`, `window_days=365`.

---

## Per-entity (un trigger por `intelligence_entities.id`)

### `meta_page_insights`

**Cadencia:** monthly (o más frecuente si la marca lo configura)
**Handler:** `getMetaPageInsights()` + `persistAnalyticsSnapshot("facebook","monthly")`
**Despacho:** `social-scraper.service.js:1144`

**`config` payload:** ninguno (toma `entity.target_identifier` como page_id).

**Outputs:** `brand_analytics_snapshots` (insert por periodo).

**Stats:** `platform`, `fans`, `engagements`.

---

### `meta_posts`

**Cadencia:** daily/weekly
**Handler:** `getMetaPosts({limit:25})` + `persistOwnPosts()`
**Despacho:** `social-scraper.service.js:1153`

**`config` payload:** ninguno.

**Outputs:** `brand_posts` (post_source='own', `is_competitor=false`), opcionalmente `intelligence_signals`.

**Stats:** `posts_found`, `new_signals`.

---

### `ga4_analytics`

**Cadencia:** monthly
**Handler:** `getGoogleAnalytics({range:"30d"})` + `persistAnalyticsSnapshot("google_analytics","monthly")`
**Despacho:** `social-scraper.service.js:1158`

**`config` payload:** ninguno (entity define la propiedad GA4).

**Outputs:** `brand_analytics_snapshots`.

**Stats:** `sessions`, `users`.

---

### `social`

**Estado:** legacy / placeholder. Existen triggers con este `sensor_type` pero **no hay handler activo** en `social-scraper.service.js` para él. Se omite en la corrida (entra al else implícito y termina sin escribir nada).

**Acción recomendada:** auditar qué entities lo usan y migrar a `meta_posts` / `meta_page_insights` específicos, o eliminar.

---

## Cómo agregar un sensor nuevo

1. Implementar handler en `services/<algo>.service.js` exportando una función con firma `(brandContainerId, organizationId, opts?) → { stats fields }`.
2. Agregar caso en el switch de `social-scraper.service.js` (~ línea 1144) construyendo `stats`.
3. Insertar trigger en `monitoring_triggers` con `sensor_type` nuevo, `cadence`, `cadence_value`.
4. Agregar entrada en este catálogo siguiendo el template (handler, config, outputs, errores típicos).
5. Si requiere realtime visible: extender `supabase_realtime` publication (ver FEAT-005).

---

## Outputs cruzados

| Tabla destino | Sensores que escriben |
|---|---|
| `ai_brand_vectors` | brand_indexer |
| `body_missions` | mission_generation |
| `brand_vulnerabilities` | threat_detection |
| `intelligence_signals` | threat_detection, meta_posts (opcional) |
| `vera_pending_actions` | audience_alignment_analysis, threat_detection |
| `competitor_ads` | meta_ad_library_sync |
| `brand_audience_personas` | meta_audience_demographics, ga4_audience_demographics |
| `brand_audience_heatmap` | brand_audience_heatmap_compute |
| `brand_analytics_snapshots` | meta_page_insights, ga4_analytics |
| `brand_posts` | meta_posts |
