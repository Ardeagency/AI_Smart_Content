---
title: Shopify Integration — Bootstrap Plan
status: DRAFT — review before implementation
created: 2026-05-07
related_migration: SQL/migrations/2026_05_07_shopify_integration.sql
---

# Shopify Bootstrap Plan

Plan de orquestación para el sync inicial post-OAuth de una tienda Shopify, modelado como jobs en `agent_queue_jobs` (sin tabla nueva).

---

## 1. Pipeline general

```
[OAuth callback exitoso]
        │
        ▼
INSERT brand_integrations (platform='shopify', shop_domain=..., bootstrap_status='pending')
        │
        ▼
ai-engine: registra webhooks Shopify via API (8 topics + 3 GDPR)
        │
        ▼
INSERT agent_queue_jobs (job_type='mission', payload.mission_type='shopify_initial_bootstrap')
        │
        ▼
[Job worker pickea el job]
        │
        ├──── UPDATE brand_integrations SET bootstrap_status='running', bootstrap_started_at=now()
        │
        ├──── Encola N subjobs (children) en orden + paralelo
        │     payload.parent_job_id = <id del padre>
        │
        ▼
[Subjobs se ejecutan]
        │
        ▼
[Cuando todos los subjobs status='completed']
        │
        ├──── UPDATE brand_integrations SET bootstrap_status='completed', bootstrap_completed_at=now()
        ├──── INSERT user_notifications (type='success', "Tu tienda está lista")
        └──── Resultado: vera_pending_actions con propuestas concretas (batch_id común)
```

---

## 2. Subjobs (en orden de dependencia)

Todos `job_type='mission'` con `payload.mission_type` específico:

### Fase 1 — Sync de datos (paralelizable)

| # | mission_type | Fuente Shopify | Destino interno | Estimado tienda mediana |
|---|---|---|---|---|
| 1 | `shopify_sync_shop_metadata` | `GET /admin/api/2024-10/shop.json` | `brand_integrations.metadata.shopify_plan_name`, `shopify_country`, `currency`, `timezone`, etc. **Detecta Plus para ajustar rate limiter (D6).** | <5 s |
| 2 | `shopify_sync_products` | GraphQL bulk operation `productsCreate` query | `products` + `product_variants` + `product_images` + `external_resource_map` | 30-60 s para 500 productos |
| 3 | `shopify_sync_collections` | GraphQL `collections` con productos | `external_resource_map` (internal_table='collections') *— ver §6* | 10-20 s |
| 4 | `shopify_sync_pages_blogs` | REST `/pages.json` + `/blogs.json` + `/articles.json` | `external_resource_map` (read-only para análisis brand voice) | 5-15 s |
| 5 | `shopify_sync_themes` | GraphQL `themes` (read-only) | metadata para análisis Vera | <5 s |
| 6 | `shopify_sync_orders` | GraphQL bulk operation, últimos **90 días** | `external_resource_map` (analytics raw) + agrega a `brand_metrics_daily` | 1-4 min para 15K órdenes |
| 7 | `shopify_sync_customers` | GraphQL bulk operation | input para `audience_personas` y `audience_segments` (vía Vera analysis) | 30-90 s para 5K customers |

**Dependencias:**
- (1) primero (descubre plan, locale, currency).
- (2-7) en paralelo después de (1), cada uno limita su rate independiente.

### Fase 2 — Análisis Vera (secuencial post-fase 1)

| # | mission_type | Input | Output |
|---|---|---|---|
| 8 | `vera_analysis_shopify_seo_geo` | products.title, descripción, meta tags, urls | `vera_pending_actions` `update_shopify_product_seo` (1 por producto con gap detectado) |
| 9 | `vera_analysis_shopify_brand_voice` | pages, blog articles, product descriptions vs `brand_profiles.verbal_dna` | `vera_pending_actions` `update_shopify_product` o `update_shopify_blog_post` |
| 10 | `vera_analysis_shopify_imagery_arde` | product_images vs ARDE Method criteria | `vera_pending_actions` `regenerate_shopify_product_image` |
| 11 | `vera_analysis_shopify_conversion_gaps` | productos sin descripción / variantes sin imagen / collections vacías / blog posts <500 palabras | `vera_pending_actions` mix de tipos |
| 12 | `vera_propose_priority_actions` | agrega resultados de 8-11, prioriza | UPDATE `vera_pending_actions.priority` (1-10) + agrupa con `batch_id` común |

**Salida final:** Una lista de propuestas accionables con `batch_id` común que el frontend puede mostrar agrupadas como "Tu primera oleada de optimización".

---

## 3. Rate limits

### Shopify standard
- **REST**: 40 leaky bucket / segundo, 80 burst.
- **GraphQL**: cost-based 1000 puntos/min (~50 queries/min de costo medio).

### Shopify Plus
- **REST**: 80 leaky bucket.
- **GraphQL**: 4000 puntos/min.

### Estrategia
- **GraphQL bulk operations** para `products` y `customers` (1 query async que devuelve el dataset completo via JSONL). Bypassa el cost-based normal — solo paga el dispatch y la lectura del file.
- **REST** solo para puntuales (shop, themes count, etc.).
- **Detectar plan**: en subjob 1 se lee `shop.plan_display_name`. Si contiene "Plus" → ajustar límites del rate limiter para esa integration.
- **Backoff exponencial** ante `429 Too Many Requests` o GraphQL `THROTTLED`: retry con jitter 1s, 2s, 4s, 8s.

---

## 4. Idempotencia y reanudación

### Por subjob
- Cada subjob tiene `attempts` y `max_attempts` (heredado de `agent_queue_jobs`).
- `external_resource_map` tiene UNIQUE constraint `(brand_integration_id, internal_table, internal_id)` y `(brand_integration_id, external_platform, external_id)` → INSERT con `ON CONFLICT DO UPDATE` permite reintentar sin duplicar.
- Cada subjob persiste su cursor (`payload.cursor`, `payload.last_seen_id`) entre intentos para reanudar donde quedó.

### Falla a la mitad del bootstrap
1. Worker detecta error → marca subjob `failed` con `error_message`.
2. Si `attempts < max_attempts` → re-encola con backoff.
3. Si `attempts >= max_attempts`:
   - Marca el job padre `bootstrap_status='partial'`.
   - INSERT `user_notifications` (type='warning', "Sincronización parcial — X de N pasos completados").
   - El usuario puede triggerear "Reintentar sync" → encola un nuevo job que skipea subjobs ya `completed_at`.

### Re-OAuth (re-instala app) — D8 confirmado: UPDATE preservando id
- En el callback, si ya existe `brand_integrations` para `(brand_container_id, platform='shopify', shop_domain=X)`:
  - **UPDATE** en vez de INSERT, manteniendo el `id`.
  - **Apenda** un objeto a `metadata.reconnection_history`:
    ```json
    {
      "at": "2026-05-07T15:30:00Z",
      "previous_scope": ["read_products", ...],
      "new_scope": ["read_products", "write_products", ...],
      "previous_token_expires_at": null,
      "trigger": "user_reinstall" | "scope_change" | "token_revoked"
    }
    ```
  - Re-bootstrap solo si: (a) usuario lo pide explícitamente, o (b) `new_scope` añade scopes que requieren nuevo sync (ej. agregar `read_orders` después).
- `external_resource_map.brand_integration_id` se preserva intacto. No hay orfandad.

---

## 5. Estimación tienda mediana (500 productos, 10K órdenes, 5K customers)

| Fase | Duración esperada | Costo créditos |
|---|---|---|
| Webhooks register (8+3) | 5 s | 0 |
| Subjob 1 (shop metadata) | 2 s | 0 |
| Subjob 2 (products bulk) | 30-60 s | ~5 cr |
| Subjob 3 (collections) | 10-20 s | ~1 cr |
| Subjob 4 (pages/blogs) | 5-15 s | ~1 cr |
| Subjob 5 (themes) | 2 s | 0 |
| Subjob 6 (orders bulk) | 1-3 min | ~10 cr |
| Subjob 7 (customers bulk) | 30-90 s | ~5 cr |
| **Subtotal sync** | **~5 min** | **~22 cr** *(`shopify_initial_sync`)* |
| Subjob 8-11 (Vera SEO/voice/imagery/gaps) | 5-10 min | depende del plan Anthropic; típico tienda mediana ~$1.50-3.00 USD ≈ 30-60 cr *(`vera_chat`)* |
| Subjob 12 (priorización) | <1 min | ~2 cr |
| **TOTAL** | **~10-15 min** | **~50-80 créditos** |

**Tienda Plus grande (5K productos, 100K órdenes):** ~30-45 min, ~250-400 créditos.

---

## 6. Detalles técnicos críticos

### Mapping de `products` Shopify → `products` interno
| Shopify field | Interno |
|---|---|
| `id` | → `external_resource_map.external_id` |
| `title` | → `products.nombre_producto` |
| `description_html` | → `products.descripcion_producto` |
| `vendor` | → metadata |
| `product_type` | → `products.tipo_producto` (con normalización del enum) |
| `tags` | → `products.metadata.shopify_tags` |
| `handle` | → `external_resource_map.external_handle` |
| `online_store_url` | → `external_resource_map.external_url` + `products.url_producto` |
| `variants[]` | → `product_variants[]` (por variant) |
| `images[]` | → `product_images[]` |

### Collections: ¿tabla nueva o solo mapping?
La tabla `collections` no existe internamente. **Recomendación:** guardar collections solo en `external_resource_map` (`internal_table='shopify_collection'`, `internal_id=NULL` excepcionalmente, con metadata jsonb). Si en el futuro queremos collections como entidad de primera clase, crear tabla separada.

**Decisión D9** — confirmar este enfoque.

### Webhooks que se registran post-OAuth (vía Shopify API)
```
products/create, products/update, products/delete
orders/create, orders/updated, orders/cancelled
customers/create, customers/update, customers/delete
[GDPR obligatorios — Shopify los registra automáticamente al instalar la app]
```

URL pattern para todos: `https://api.aismartcontent.io/webhooks/shopify/{topic}`.

Lista resultante guardada en `brand_integrations.metadata.webhooks_registered` (jsonb array de `{topic, webhook_id, address}`).

### GDPR webhooks (los 3 obligatorios)
**Deben responder 200 en <30s.** Estrategia:
1. ai-engine recibe webhook GDPR.
2. Verifica HMAC (sino → 401).
3. INSERT en `integration_webhooks_log` con `is_gdpr_request=true`.
4. **Responde 200 inmediatamente.**
5. Procesa async en background:
   - `customers/data_request` → encola job `gdpr_export_customer_data` que recopila datos del customer y los envía al `data_request_url` del payload.
   - `customers/redact` → encola job `gdpr_redact_customer` que borra/anonimiza `external_resource_map` y registros derivados.
   - `shop/redact` → encola job `gdpr_redact_shop` que borra TODA la integration + `external_resource_map` + datos derivados (esto sí dispara `disconnect_shopify_integration` flow).
6. UPDATE `integration_webhooks_log SET processed=true, processed_at=now(), gdpr_action_taken=...`

---

## 7. Disconnect flow — D7 confirmado: preservar 90 días

Cuando el usuario desconecta o Shopify hace `app/uninstalled`:

1. `brand_integrations.is_active = false`
2. `brand_integrations.metadata.disconnected_at = now()` (timestamp ISO)
3. Cancelar webhooks registrados (`DELETE /admin/api/.../webhooks/{id}.json` por cada uno)
4. `external_resource_map`: **preservar** rows intactas (no marcar individualmente — la integración ya está flagged como inactive).
5. INSERT `user_notifications` (type='info', "Shopify desconectado. Tus datos se conservan 90 días por si reconectas.")

### Política de purga (job cron separado, no en este sprint)
- Job diario que ejecuta:
  ```sql
  DELETE FROM external_resource_map
  WHERE brand_integration_id IN (
    SELECT id FROM brand_integrations
    WHERE is_active = false
      AND platform = 'shopify'
      AND (metadata->>'disconnected_at')::timestamptz < now() - interval '90 days'
  );
  -- Y luego DELETE FROM brand_integrations donde aplique
  ```
- Si el usuario reconnecta antes de los 90 días → flujo D8 (UPDATE, preservar id, append a reconnection_history).

---

## 8. Multi-tenant edge cases

- **Mismo shop_domain en 2 orgs distintas**: el UNIQUE en `idx_brand_integrations_shop_domain` lo bloquea globalmente. **Decisión D5** — ¿permitir? Si una org instala la app y otra org instala desde el mismo Shopify store, ¿qué prevalece?
- **N tiendas por org**: permitido. La tabla acepta múltiples filas con `(brand_container_id, platform='shopify')` distintas combinaciones siempre que `shop_domain` difiera.

---

## 9. Decisiones de Shenoa pendientes

Ver sección §4 del documento principal de propuesta.
