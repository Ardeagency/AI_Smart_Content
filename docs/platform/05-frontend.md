---
title: 05 — Frontend (SPA Vanilla JS)
author: Shenoa — Arde Agency S.A.S.
since: 2025-09
last_review: 2026-04-29
audience: humanos del equipo + LLMs
---

# 05 · Frontend

## Stack

- **Vanilla JavaScript ES modules** — sin framework (sin React, Vue, Svelte).
- **Hosting:** Netlify (auto-deploy desde `main` → `aismartcontent.io`).
- **Cliente Supabase:** `@supabase/supabase-js` v2 (CDN o npm).
- **Charts:** Chart.js 4.4.3 (CDN, lazy-loaded).
- **CSS:** sin framework, vanilla con bundle propio (`css/bundle.css`).
- **Auth:** Supabase Auth (email/password + magic link) — JWTs en localStorage.

Decisión de diseño: **sin framework** para mantener el bundle ligero, control total sobre el ciclo de vida y compatibilidad sin compilación. La SPA funciona abriendo `index.html` directo.

## Estructura del repo (`/`)

```
/
├── index.html              ← SPA shell (carga scripts, define <base>)
├── css/                    ← bundle.css + módulos
├── js/
│   ├── app.js              ← App principal: rutas, init
│   ├── app-loader.js       ← splash + warmup
│   ├── runtime-config.js   ← URL del ai-engine, etc.
│   ├── router.js           ← SPA router con orgIdShort/orgNameSlug
│   ├── org-url.js          ← helpers /org/:short/:slug/...
│   ├── session-utils.js
│   ├── input-registry.js
│   ├── flags-data.js
│   ├── living.js
│   ├── products.js
│   ├── views/
│   │   ├── BaseView.js                    ← clase padre
│   │   ├── DashboardView.js               ← 4 tabs (los dashboards)
│   │   ├── BrandOrganizationView.js
│   │   ├── BrandstorageView.js
│   │   ├── CommandCenterView.js
│   │   ├── ContentView.js / CreateView.js / StudioView.js / ProductionView.js
│   │   ├── CreditsView.js / CreditsShopView.js
│   │   ├── HogarView.js / IdentitiesView.js / OrganizationView.js
│   │   ├── PlanesView.js / TasksView.js / VeraView.js / VideoView.js
│   │   ├── SignInView.js                  ← login
│   │   ├── PrivacyPolicyView.js / TermsOfServiceView.js / DataDeletionView.js
│   │   ├── PublicBaseView.js              ← shell páginas legales
│   │   ├── DevBaseView.js / DevDashboardView.js / DevFlowsView.js / etc.  ← /dev/...
│   │   ├── BrandIntegrationCallbackView.js
│   │   ├── FormRecordView.js / ProductsView.js / FlowCatalogView.js
│   │   └── CambiarContrasenaView.js
│   ├── services/
│   │   ├── SupabaseService.js             ← getClient() lazy + cached
│   │   ├── AuthService.js                 ← login, signOut, getCurrentUser
│   │   ├── AppState.js                    ← estado global (selectedOrgId, etc.)
│   │   ├── OrgBrandTheme.js               ← aplica colors/fonts de la org
│   │   ├── MiBrandaDataService.js         ← capa de datos Mi Marca
│   │   ├── StrategiaDataService.js        ← capa de datos Estrategia
│   │   └── FlowWebhookService.js
│   ├── components/
│   │   ├── Navigation.js + mixins (Flyouts, Credits, Settings)
│   │   ├── PublicLayout.js
│   │   ├── brand-mixins/, brand-organization/, brandstorage/, builder/
│   │   └── navigation/
│   ├── utils/
│   └── config/
├── functions/              ← Netlify Functions (28)
│   ├── api-ai-action.js / api-ai-context.js / api-ai-engine-chat.js
│   ├── api-ai-task-event.js
│   ├── api-brand-analytics-ga4.js / api-brand-analyze-posts.js
│   ├── api-brand-posts-meta.js / api-brand-sync-meta.js
│   ├── api-brand-videos-youtube.js
│   ├── api-insights-fetch.js / api-insights-mybrand.js / api-insights-snapshots-list.js
│   ├── api-integrations-disconnect.js / api-integrations-exchange.js
│   ├── api-integrations-facebook-start.js / api-integrations-google-start.js
│   ├── api-webhooks-meta.js
│   ├── kie-nano-banana-create.js
│   ├── kie-video-download.js
│   ├── kling-video-create.js / kling-video-status.js / kling-video.js
│   ├── openai-cine-prompt.js / openai-prompt.js
│   ├── supabase-config.js
│   └── lib/
├── docs/                   ← documentación (este folder)
├── recursos/               ← assets estáticos (logos, icons, banners)
├── SQL/                    ← schema, migrations, functions (espejo de Supabase)
├── netlify.toml
├── README.md / SECURITY.md
└── index.html
```

## El ciclo de vida de una request del usuario

```
1. Usuario abre https://aismartcontent.io/org/000000000001/arde-agency/dashboard
2. Netlify CDN sirve index.html
3. index.html carga (en orden, defer):
   - js/runtime-config.js?v=__BUILD_ID__
   - js/app-loader.js
   - js/views/BaseView.js
   - js/router.js
   - js/utils/{modal,brand-colors}.js
   - js/services/{MiBrandaDataService,SupabaseService,AuthService,OrgBrandTheme,AppState}.js
   - js/org-url.js, session-utils.js
   - js/components/Navigation.js + mixins
   - js/app.js?v=__BUILD_ID__
4. app.js define App class y rutas:
   r.register('/org/:orgIdShort/:orgNameSlug/dashboard', dashboardLoader, auth);
5. router.js parsea URL → routeParams = { orgIdShort, orgNameSlug }
6. router.js llama resolveOrgIdFromShortAndSlug() → routeParams.orgId = UUID completo
7. router carga DashboardView, llama onEnter() → render()
8. DashboardView resuelve org_id y brand_container_id (vía AuthService)
9. DashboardView instancia MiBrandaDataService (lazy-loaded vía BaseView.loadScript)
10. service.loadAll() ejecuta queries paralelas (Promise.allSettled)
11. DashboardView renderiza widgets con datos
```

## El bug clásico de URL → BD: `orgIdShort` vs `orgId`

**Importante para todo nuevo View:**

Las URLs son `/org/{orgIdShort}/{nameSlug}/...` donde `orgIdShort` = últimos 12 caracteres del UUID sin guiones. **No es un UUID válido**. Pasarlo a una query Supabase con `.eq('organization_id', orgIdShort)` causa **400 Bad Request**.

El router resuelve el UUID completo en `routeParams.orgId`. Cualquier View debe leer:

```js
this._orgId = this.routeParams?.orgId
           || window.currentOrgId
           || window.appState?.get('selectedOrganizationId')
           || localStorage.getItem('selectedOrganizationId')
           || null;

const isUuid = (v) => typeof v === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

if (!isUuid(this._orgId)) {
  // resolver localmente o abortar
}
```

`org-url.js` exporta los helpers: `getOrgShortId(uuid)`, `getOrgSlug(name)`, `getOrgPathPrefix(uuid, name)`, `resolveOrgIdFromShortAndSlug(short, slug)`.

## Routing (router.js)

`router.js` implementa un SPA router con:

- `register(path, viewLoader, authRequired)` — registra una ruta
- Soporta `:param` en el path
- Resuelve `:orgIdShort/:orgNameSlug` automáticamente a `routeParams.orgId`
- `handleRoute()` carga la View correspondiente y llama `onEnter() → render() → onLeave()` apropiadamente
- Patrón `legacyRouteRedirectView` para rutas obsoletas

Rutas definidas en `app.js`:

```
/                                                 → home pública
/login, /signin                                   → SignInView
/cambiar-contrasena                               → CambiarContrasenaView
/privacy-policy, /terms-of-service, /data-deletion → vistas legales
/org/:orgIdShort/:orgNameSlug/dashboard           → DashboardView
/org/:orgIdShort/:orgNameSlug/brand[/:brandId]    → BrandView
/org/:orgIdShort/:orgNameSlug/production          → ProductionView (Studio)
/org/:orgIdShort/:orgNameSlug/tasks[/:taskId]     → TasksView
/dev/...                                          → vistas de developer
/insight, /historial, /living                     → redirects
```

## BaseView — el contrato común

Todos los views heredan de `BaseView`. Provee:

- `onEnter()` — antes de render (auth check, prep)
- `render()` — pinta el HTML
- `renderHTML()` — devuelve string HTML (cuando otro view embebe)
- `onLeave()` — cleanup (charts, timers)
- `updateHeaderContext(title, subtitle, orgName)` — actualiza header
- `loadScript(src, globalVar?, timeout?)` — carga script lazy con cache-bust automático (usa `APP_LAZY_SCRIPT_VER` definido en app.js)

Ejemplo de View típico:

```js
class MyView extends BaseView {
  constructor() {
    super();
    this._supabase = null;
    this._orgId = null;
  }

  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    await this._initDataLayer();
  }

  async _initDataLayer() {
    if (window.supabaseService) this._supabase = await window.supabaseService.getClient();
    this._orgId = this.routeParams?.orgId || window.currentOrgId || ...;
  }

  async render() {
    await super.render();
    // ... pintar HTML, instanciar services, fetch data
  }

  onLeave() {
    // cleanup (charts, intervals, listeners)
  }
}
```

## Cache busting (importante)

Los scripts en `index.html` y los lazy-loaded vía `loadScript()` deben tener `?v=__BUILD_ID__`.

`netlify.toml` ejecuta en cada deploy:

```toml
[build]
  command = "sed -i \"s/__BUILD_ID__/$COMMIT_REF/g\" index.html css/bundle.css js/app.js"
```

`__BUILD_ID__` se reemplaza por el SHA del commit. Esto invalida el cache de Cloudflare CDN automáticamente porque la URL cambia.

`BaseView.loadScript()` agrega `?v=APP_LAZY_SCRIPT_VER` automáticamente (definido en `app.js`).

⚠️ **Bug detectado y corregido (commit 961b5fb):** algunos `<script>` en `index.html` no tenían `?v=__BUILD_ID__` (notablemente `MiBrandaDataService.js`). Cloudflare cacheaba la versión vieja por 7 días post-deploy. Solución: agregar `?v=__BUILD_ID__` a TODOS los scripts del SPA.

## Servicios — la capa de datos

Patrón: cada dashboard/feature complejo tiene un `*DataService.js` que:

1. Recibe el cliente Supabase y orgId en `init(supabase, orgId)`.
2. Carga IDs base (`containerIds`, `entityIds`).
3. Expone métodos `loadXxx()` que devuelven `{ data, isEmpty, error }`.
4. Tiene `loadAll()` que paraleliza con `Promise.allSettled`.

### `MiBrandaDataService.js` (existente)

20 widgets del Dashboard Mi Marca. ~15 queries paralelas. **Pendiente refactor** para usar `dashboard_mi_marca(p_org_id)` en lugar de queries individuales.

### `StrategiaDataService.js` (existente)

Cubre Estrategia: status bar (health/threat), pending actions, calendar, mission history. ~10 queries.

### Servicios pendientes

- `CompetenciaDataService.js`
- `TendenciasDataService.js`

## Realtime (subscripciones)

Hoy las únicas subscripciones realtime activas son:
- Chat con Vera: `ai_messages` y `ai_conversations` (en `VeraView`).
- Notificaciones: `user_notifications`.

**Plan extender a:**
- `vera_pending_actions` → Estrategia (ya está habilitado, falta consumir).
- `brand_vulnerabilities` → Mi Marca (alerta de crisis).
- `intelligence_signals` → Tendencias (mentions live).
- `body_missions` → Estrategia (status de misiones).

Patrón:

```js
const channel = supabase
  .channel(`vpa-${orgId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'vera_pending_actions',
    filter: `organization_id=eq.${orgId}`
  }, (payload) => {
    this._handleVpaChange(payload);
  })
  .subscribe();

// onLeave:
channel.unsubscribe();
```

## AppState

`js/services/AppState.js` mantiene estado global mínimo:

- `selectedOrganizationId` — UUID de la org activa
- `currentUser` — datos del user logueado
- `currentBrandContainerId` — brand_container activo

Sincroniza con `localStorage`. No es Redux — es un `Map` con `set/get/subscribe`.

## Auth flow

1. Usuario entra a `/login` → `SignInView`.
2. Submit → `supabase.auth.signInWithPassword({ email, password })`.
3. Supabase devuelve JWT + refresh token, los guarda en localStorage.
4. `AuthService.checkAccess(requireAuth=true)` valida.
5. Tras login: redirect a `getDefaultUserRoute()` que típicamente es `/org/{shortId}/{slug}/dashboard`.

`session-utils.js` provee helpers para extraer `auth.uid()` del JWT.

## Netlify Functions (28)

Vivien en `/functions/`. Se invocan desde el frontend cuando se requiere:

- Acceso a service_role (no exponer al cliente).
- Llamada a APIs externas con secrets server-side.
- Procesos largos (>10s) — pero Netlify limita a 10s/26s, para más usar ai-engine.

Ejemplos:
- `api-ai-engine-chat.js` — proxy al ai-engine para chat
- `api-brand-sync-meta.js` — sync con Meta API
- `api-integrations-{facebook,google}-start.js` — OAuth start
- `kling-video-*.js`, `kie-*.js`, `openai-*.js` — proxies a APIs de generación de video/imagen

## Cómo agregar un dashboard nuevo (resumen)

1. Crear `js/services/MyDashboardDataService.js` con `init` + `loadAll`.
2. Crear `js/views/MyDashboardView.js` extendiendo `BaseView`.
3. Registrar ruta en `app.js`.
4. Agregar `<script src="js/services/MyDashboardDataService.js?v=__BUILD_ID__" defer>` en `index.html` (o usar `loadScript` lazy).
5. Si el dashboard requiere agregar columnas/datos a la BD: definir RPC en `SQL/functions/dashboard_*.sql` y aplicarla con la Management API.
6. Push → Netlify deploy → live.

Detalle en `10-extending.md`.

---

*Anterior: [04 — AI Engine](./04-ai-engine.md) · Siguiente: [06 — Flujos de datos](./06-data-flows.md)*
