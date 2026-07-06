# Configuración de Webhooks Meta (Facebook + Instagram)

## URLs del webhook

| Ruta | Función |
|------|---------|
| `https://aismartcontent.io/api/webhooks/meta` | Facebook Pages |
| `https://aismartcontent.io/api/webhooks/instagram` | Instagram Business (misma función) |

Ambas rutas apuntan a `functions/api-webhooks-meta.js`.

---

## Variables de entorno requeridas (Netlify Dashboard)

```
META_APP_ID              = tu App ID de Meta Developers
META_APP_SECRET          = tu App Secret de Meta Developers
META_WEBHOOK_VERIFY_TOKEN = token aleatorio seguro (mínimo 32 chars)
                           Ejemplo: openssl rand -hex 32
```

---

## Configuración en Meta Developers Console

### 1. Crear/verificar el webhook

1. Ve a **Meta Developers → Tu App → Webhooks**
2. En **Page Object** → Add Subscription URL:
   - **Callback URL**: `https://aismartcontent.io/api/webhooks/meta`
   - **Verify Token**: el valor de `META_WEBHOOK_VERIFY_TOKEN`
3. Marcar los campos (Fields) a suscribir:

### 2. Campos requeridos — Facebook Pages (object: page)

| Campo | Por qué |
|-------|---------|
| `feed` | Nuevos posts, engagement (likes, comentarios, shares) |
| `mention` | Menciones de la página |
| `page` | Cambios en datos de página (fan_count, etc.) |

### 3. Campos requeridos — Instagram (object: instagram)

| Campo | Por qué |
|-------|---------|
| `mentions` | Menciones de la cuenta IG |
| `comments` | Comentarios en posts |
| `story_insights` | Métricas de stories disponibles |
| `media` | Nuevo post publicado |

### 4. Permisos OAuth requeridos en la App

```
pages_show_list
pages_read_engagement
pages_read_user_content       ← posts y comentarios orgánicos
pages_manage_metadata         ← OBLIGATORIO para suscribirse a webhooks
instagram_basic
instagram_manage_insights     ← webhooks Instagram Business
read_insights
```

> ⚠️ `ads_read` NO es necesario para contenido orgánico.
> Si tu app solo lo tiene, los webhooks de `feed` pueden no funcionar.

---

## Cómo funciona el flujo completo

```
Meta publica evento
        ↓
POST /api/webhooks/meta
        ↓
1. Verificar firma HMAC-SHA256 (X-Hub-Signature-256)
        ↓
2. Identificar brand afectado:
   - Facebook: busca por metadata.selected_page_id = page_id
   - Instagram: busca en metadata.pages[].instagram_business_account.id
        ↓
3. Marcar brand_analytics_snapshots.computed_at = epoch pasado
   → computed_at viejo → isStale() = true
        ↓
4. Supabase Realtime notifica al frontend (brand_analytics_snapshots cambió)
        ↓
5. Frontend detecta cambio → llama a /api/insights/mybrand → ve stale:true
        ↓
6. Frontend dispara /api/brand/sync-meta en background
        ↓
7. sync-meta llama a Meta Graph API → actualiza brand_posts + snapshots
        ↓
8. Supabase Realtime notifica de nuevo → frontend re-renderiza con datos frescos
```

---

## Testing del webhook

### Verificar que el handshake funciona
```bash
curl "https://aismartcontent.io/api/webhooks/meta?\
hub.mode=subscribe&\
hub.verify_token=TU_TOKEN&\
hub.challenge=test123"
# Debe responder: test123
```

### Simular un evento de feed desde Meta Developer Console
En Meta Developers → Webhooks → Test → Feed → Send Test Event

El log de Netlify Functions debe mostrar:
```
[webhook] page PAGE_ID: feed add post → stale
[webhook] marked stale: 1 brand(s) — reason: feed.add.post
```

---

## Troubleshooting

| Síntoma | Causa | Solución |
|---------|-------|----------|
| 403 en handshake | `META_WEBHOOK_VERIFY_TOKEN` no coincide | Verificar env var en Netlify |
| 401 en eventos POST | `META_APP_SECRET` incorrecto | Verificar env var en Netlify |
| Handshake OK pero no llegan eventos | App no tiene los permisos correctos | Añadir `pages_manage_metadata` |
| Llegan eventos pero no actualiza UI | `brand_analytics_snapshots` no tiene registro para ese brand | Ejecutar un sync manual primero |
| IG events ignorados | IG account ID no está en metadata | Reconectar Meta en Marcas |
