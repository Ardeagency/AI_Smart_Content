# Integraciones — Estado y pendientes (planificado pero NO funciona aún)

> Lista viva de lo que cada integración YA hace vs lo que está **planificado pero todavía NO funciona**.
> Convención: ✅ funciona · 🟡 parcial/stub · 🔲 planificado, NO construido · 🔒 bloqueado por aprobación externa.
> Borrar cada ítem cuando se resuelva. Última actualización: 2026-06-16.

---

## Patrón común a TODAS las integraciones (cross-cutting)

- 🔲 **Botón humano "actualizar ficha / publicar" (write gateado, SEO/GEO).** Los scopes de escritura ya se piden, pero **el botón y su backend NO existen** en ninguna integración. Vera propone → el usuario aplica. Pendiente en ML, Shopify, Amazon, YouTube, Google Ads, Meta, X, TikTok. Ver `project_integration_write_policy`.
- 🔲 **Selector de cuenta por marca.** En integraciones multi-cuenta (Google Ads, ad accounts de Meta) NO debe jalarse todo lo accesible; el usuario elige qué cuenta es de la marca (patrón page-picker de Meta). Hoy Google Ads jala TODO. Ver `feedback_no_auto_pull_all_accounts`.
- 🔲 **Webhooks / sync en vivo.** Salvo Shopify (que sí registra webhooks), las demás hacen pull bajo demanda; falta push en vivo (ML, X, TikTok).
- 🔒 **Verificaciones / App Reviews de producción** (detalle por plataforma abajo).
- 🔒 **Seguridad — rotar secretos que se vieron en chat:** ML Secret Key, X (Bearer + OAuth2 secret) y **TikTok (Client Secret de Production Y de Sandbox)** deben regenerarse una vez validado todo.

---

## Mercado Libre
**✅ Funciona:** OAuth 2.0 connect (sin PKCE, confidencial) · populator real (importa productos + imágenes + descripciones a `products`, dedupe) · refresh del token de 6h (rota) · validado E2E en producción.

**Pendiente:**
- 🔲 **Webhooks** (tópicos Items/Prices/Catalog/Promotions) para sync en vivo → falta `api-webhooks-meli.js`.
- 🔲 **Write-back "actualizar ficha"** (optimizar publicación, scope `write` ya concedido).
- 🔲 Probar import con un seller **con publicaciones reales** (la cuenta de prueba estaba vacía).
- 🔒 Rotar el Secret Key (se vio en chat).

---

## Shopify
**✅ Funciona:** OAuth connect · populator de productos (a `products`, dedupe + imágenes) · registro de webhooks · sync de metadata de tienda.

**Pendiente (subjobs hoy son STUB):**
- 🟡 `shopify_sync_collections`, `shopify_sync_pages_blogs`, `shopify_sync_themes`, `shopify_sync_orders`, `shopify_sync_customers` → **stubs**, no traen data real.
- 🟡 `vera_analysis_shopify_seo_geo`, `vera_analysis_shopify_brand_voice`, `vera_analysis_shopify_imagery_arde`, `vera_analysis_shopify_conversion_gaps` → **stubs**.
- 🔲 **Write-back "actualizar ficha"** de producto (SEO/GEO).

---

## Google
**Scopes recortados al mínimo:** `analytics.readonly`, `youtube`, `yt-analytics.readonly`, `adwords` (+ identidad). Business Profile **diferido** (ICP B2B + gate de aprobación manual).

**✅ Funciona:** OAuth connect · refresh del token · **GA4** (read) · **YouTube** (listar videos) · **Google Ads consumer** (campañas por cliente → `campaigns`; API habilitada en proyecto 187497419189; validado contra AOKII).

**Pendiente:**
- 🔲 **Selector de cuenta de Google Ads** (CRÍTICO — hoy jala TODO el portafolio accesible del MCC; debe dejar elegir la cuenta de la marca).
- 🔲 **YouTube write-back**: actualizar título/descripción de videos (scope `youtube` ya cubre) — botón gateado, no construido.
- 🔲 **YouTube publish** de videos generados (scope `youtube` cubre upload) — no construido.
- 🔲 **Google Ads optimización gateada** (optimizar keywords/campañas, botón humano).
- 🔲 **YouTube Analytics** (yt-analytics.readonly) — confirmar si hay vista que lo consume.
- 🔒 Confirmar/elevar el **Developer Token a Standard** (Basic solo cubre cuentas bajo el MCC de ARDE; multi-cliente real necesita Standard).
- 🔒 **Verificación del OAuth consent screen** (scopes sensibles: demo en video por scope) — no enviada.
- ⏸️ **Business Profile** (reseñas/local/GEO) — diferido; requiere formulario de acceso aprobado por Google.

---

## Meta (Facebook / Instagram)
**✅ Funciona:** OAuth connect (short→long-lived token) · page picker · populator de **campañas + audiencias** (a `campaigns`/`audience_segments`) · flujo de publicación (`api-social-publish`).

**Set de permisos elegido:** ads_read, ads_management, business_management, instagram_basic, instagram_content_publish, instagram_manage_insights, leads_retrieval, pages_manage_posts, pages_read_engagement, pages_read_user_content, pages_show_list (+ public_profile, email). Eliminados: instagram_manage_comments, instagram_manage_messages, pages_manage_engagement.

**Pendiente:**
- 🔲 **Alinear el código** (`api-integrations-facebook-start.js` scopes) al set elegido + desplegar.
- 🔲 **Selector de cuenta de Ads** (mismo problema multi-cuenta que Google) — verificar/construir.
- 🔲 **ads_management** (optimización de campañas gateada) — permiso pedido, feature no construida.
- 🔲 **leads_retrieval** (perfilar quién convierte → adaptar contenido; NO es CRM, es análisis de audiencia) — feature no construida.
- 🔲 **pages_read_user_content** (análisis de comentarios vía API) — hoy lo cubre el scraper; feature de integración no construida.
- 🔒 **Business Verification** (cuello de botella, ~10+ días) + **App Review por permiso** (screencast + 1 llamada real por permiso). Por **fases**: primero los permisos con feature viva; los "no habilitados aún" después de construir su módulo.

---

## X (Twitter)
**✅ Funciona:** OAuth 2.0 connect (PKCE) · populator (tweets propios → `brand_posts` network=`x`, alimenta el pipeline de sentimiento) · refresh del token de 2h (rota). Tier confirmado: **Pay Per Use** (necesario para leer).

**Pendiente:**
- 🔲 **Validar E2E** (conectar una marca; requiere que el callback `https://console.aismartcontent.io/brand-integration-callback` esté registrado en el app de X).
- 🔲 **Publicar gateado** (scope `tweet.write` concedido) — feature no construida.
- 🔲 **Leer menciones / monitoreo de marca** (hoy solo trae posts propios).
- 🔲 **Suscripciones/webhooks** (menciones en vivo) — omitido a propósito.
- 🔒 Rotar Bearer + OAuth2 secret (se vieron en chat).

---

## TikTok
**✅ Funciona (construido 2026-06-16):** OAuth 2.0 connect (PKCE) por marca (`api-integrations-tiktok-start` + rama en `exchange`/`disconnect`) · UI en el catálogo "Integraciones" (ícono `fa-tiktok`) · refresh del token de 24h (rota `refresh_token`; background `token-refresh.service` cada 6h si vence en <12h; flag `TIKTOK_ENV` sandbox/production elige el par de credenciales) · **populator** (`tiktok-rest.js` lazy-refresh + `tiktok.populator.js`: videos propios → `brand_posts` network=`tiktok`, post_source=`own`, `ai_analyzed_at=NULL` → alimenta el pipeline de sentimiento existente) + **bootstrap encolado al conectar** (`tiktok_initial_bootstrap`). App id TikTok `7650485490868570132`.

**Pendiente (capa "act" + análisis dedicado — conectar/leer ≠ actuar):**
- 🔲 **Tools de lectura dedicadas de Vera**: el sentimiento ya recoge los `brand_posts` de TikTok, pero ningún tool surfacea stats/perfil/videos de TikTok a Vera de forma específica (estilo `getMetaPosts`). Cablear en `social.tools`/`integration-data.tools` con `getIntegrationToken(..., 'tiktok')`.
- 🟡 **Publicar = STUB**: en `api-social-publish.js` tiktok está en `STUB_PLATFORMS` → responde `not_implemented` ("Próximamente"). Falta construir el upload a **borrador** (Content Posting API, `video.upload`).
- 🔲 **Análisis/insights** propios de TikTok (engagement, stats) — nada construido; depende del populator.
- 🔲 **Validar E2E** — requiere del lado config: redirect URI `https://console.aismartcontent.io/brand-integration-callback` registrado en TikTok Login Kit (sandbox), `TIKTOK_CLIENT_KEY`/`SECRET` (sandbox) en Netlify, y **Target Users** agregados en el sandbox.
- 🔒 **`video.publish`** (publicación directa pública) bloqueado hasta pasar la **auditoría de Content Posting API** (Production). En sandbox solo borrador.
- 🔒 **App Review de Production** (demo-video por scope) + cambiar a credenciales de producción + `TIKTOK_ENV=production`.
- 🔒 Rotar el Client Secret (Production y Sandbox se vieron en chat).

---

## Amazon (SP-API)
**🟡 Solo STUB** (`amazon.populator.js`). Cuenta de Seller en verificación.

**Pendiente:**
- 🔲 **Toda la integración SP-API** (region North America / México) — no construida.
- 🔲 **Dossier `api-onboarding`** antes de cablear (costo/limites/PII/aprobación).
- 🔒 Cuenta Seller **Professional** (~USD 39.99/mes) para registro de developer + **aprobación de app por Amazon**.
- 🔲 Populator de catálogo (productos + imágenes) replicando el patrón ML.

---

## Login social (Supabase)
- ✅ **X / Twitter (OAuth 2.0)** habilitado en Supabase (Client ID/Secret) — guardado, funcional. Distinto de la API de datos.
