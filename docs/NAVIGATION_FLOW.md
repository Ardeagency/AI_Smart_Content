# Flujo de navegación del proyecto AI Smart Content

Documento que describe **todo** el flujo de navegación de la SPA: arranque, router, navegación lateral, vistas y puntos de uso.

---

## 0. Arquitectura: User Space + Workspace

### Home = User Control Gateway (no es dashboard de datos)

- **Función única:** que el usuario decida (1) entrar a una organización o (2) administrar su identidad personal.
- **Reglas de Home:**  
  - Nunca carga contexto organización (`clearWorkspaceContext()` al entrar).  
  - Nunca muestra módulos del producto.  
  - Es el único lugar donde se ven TODAS las organizaciones del usuario.  
  - Siempre existe aunque el usuario tenga solo 1 organización.

### Niveles de navegación

- **Nivel 1 — User Space** (sin contexto org):  
  `/home`, `/account/profile`, `/account/security`, `/account/preferences`, `/invitations`, `/org/new`, `/login`, `/plans`, `/onboarding`, `/`.
- **Nivel 2 — Workspace** (organización activa):  
  `/org/:orgId/living`, `/org/:orgId/brand`, … (header + sidebar persistentes).

### Reglas

- `/org/:orgId` redirige a `/org/:orgId/living` (excepto `/org/new`, que es User Space).
- Al entrar a `/org/:orgId/*` se valida org; si falla → redirect `/home`.
- Cambio de organización en el sidebar → `/org/:newOrgId/living`.
- **Header en workspace:** Organization switcher + User menu (Ir a Home, Perfil, Cerrar sesión). El usuario siempre puede volver a `/home`.

---

## 1. Entrada y arranque

### 1.1 Carga del HTML (`index.html`)

- **Contenedores:**
  - `#appInitialLoading`: pantalla de carga inicial (logo + spinner).
  - `#navigation-container`: donde se renderiza el sidebar (persistente).
  - `#app-container`: donde se inyectan las vistas (dinámico).

  - **Orden de scripts:**
  1. Supabase CDN  
  2. `app-loader.js` — carga config de Supabase y loading  
  3. `BaseView.js`  
  4. `router.js`  
  5. Servicios (SupabaseService, AuthService, AppState, **workspace-context.js**)  
  6. Utilidades (Performance, ErrorHandler, session-utils)  
  7. Vistas (Landing, Planes, FormRecord, Hogar, Brands, Campaigns, Audiences, Create, Settings, Living, Products, …)  
  8. **WorkspaceLayout.js**, **Navigation.js**  
  9. `products.js`, `app.js`

### 1.2 App Loader (`app-loader.js`)

- En `DOMContentLoaded` (o de inmediato si el DOM ya está listo) ejecuta `init()`.
- Carga la config de Supabase vía `/.netlify/functions/supabase-config`.
- Crea `window.supabase` y dispara `supabaseConfigReady`.
- Solo crea/muestra su propio loading screen si **no** está en `/`, `/index.html` (para no duplicar el de `index.html`).

### 1.3 Inicialización de la app (`app.js`)

- **Cuándo:** `DOMContentLoaded` o, si el DOM ya está listo, de inmediato.
- **Qué hace:** `initializeApp()` → `window.app = new App()`, `app.init()`.
- **Dentro de `init()`:**
  1. `initSupabase()` — espera a `appLoader.waitFor()` si existe.
  2. `initRouter()` — usa `window.router` ya creado por `router.js`.
  3. `registerRoutes()` — registra todas las rutas (ver sección 3).
  4. `setTimeout(200ms)` → `router.handleRoute()` para resolver la ruta inicial.

---

## 2. Router (`router.js`)

### 2.1 Inicialización

- Crea `window.router` (instancia global).
- En `init()`:
  - `popstate`: al usar atrás/adelante del navegador → `handleRoute()`.
  - `load`: al cargar la página → `handleRoute()`.
  - Si `document.readyState === 'complete'`, llama a `handleRoute()` también.

### 2.2 API principal

- **`register(path, viewLoader, options)`**
  - `path`: ej. `'/'`, `'/login'`, `'/brands/:brandId'`.
  - `viewLoader`: clase de la vista (o función que devuelve la clase, para lazy).
  - `options`: `{ requiresAuth, redirectIfAuth }`.

- **`navigate(path, replace)`**
  - Normaliza `path` (añade `/` si hace falta).
  - `replace === true` → `history.replaceState`, si no → `history.pushState`.
  - Llama a `handleRoute()` de inmediato.

- **`handleRoute()`** (núcleo):
  1. Lee **solo** `window.location.pathname` (no usa query string para matchear).
  2. Normaliza: vacío o `index.html` → `'/'`.
  3. Busca ruta exacta en `this.routes[path]`.
  4. Si no hay, busca rutas dinámicas (patrones con `:id`, etc.).
  5. Si no hay ruta → usa `/404` si está registrada; si no, redirige a `'/'` con `replace`.
  6. **Auth:** si `requiresAuth` y no autenticado → `navigate('/login', true)`.
  7. **Redirect si autenticado:** si `redirectIfAuth` y autenticado → `navigate('/home', true)`.
  8. **Ruta workspace** (`/org/:orgId/...`): valida org con `workspaceContext.loadOrganizationContext(orgId)`; monta `WorkspaceLayout` si no está montado; contenedor de la vista = `#workspace-content`. **Ruta root:** desmonta WorkspaceLayout si estaba montado; contenedor = `#app-container`.
  9. Resuelve la clase de vista (directa o lazy).
  10. Crea nueva instancia, asigna `routeParams` y `view.container = container`.
  11. `await this.currentView.render()`, `updateNavigation()`, dispara `routechange`.

- **Autenticación:** `checkAuthentication()` usa, en orden: `authService.isAuthenticated()`, `supabaseService.getClient()` + `getUser()`, o `window.supabase.auth.getUser()`.

---

## 3. Rutas registradas (`app.js` → `registerRoutes()`)

### User Space (layout mínimo, sin sidebar workspace)

| Ruta | Vista | Auth | Notas |
|------|--------|------|--------|
| `/` | LandingView | pública | |
| `/login` | LandingView | pública | redirectIfAuth → `/home` |
| `/home` | HogarView | requiere auth | **User Control Gateway**: organizaciones, perfil, crear org, invitaciones |
| `/hogar` | HogarView | requiere auth | Alias |
| `/account/profile` | AccountView | requiere auth | Perfil usuario |
| `/account/security` | AccountView | requiere auth | Seguridad |
| `/account/preferences` | AccountView | requiere auth | Preferencias |
| `/account/:tab` | AccountView | requiere auth | Dinámico |
| `/invitations` | InvitationsView | requiere auth | Invitaciones pendientes |
| `/org/new` | OrgNewView | requiere auth | Crear organización |
| `/plans` | PlanesView | pública | |
| `/planes` | PlanesView | pública | Alias |
| `/onboarding` | FormRecordView | requiere auth | |

### Workspace (`/org/:orgId/*` — header + sidebar persistentes)

| Ruta | Vista | Auth |
|------|--------|------|
| `/org/:orgId/living` | LivingView | requiere auth |
| `/org/:orgId/brand` | BrandsView | requiere auth |
| `/org/:orgId/brand/:brandId` | BrandsView | requiere auth |
| `/org/:orgId/entities` | ProductsView | requiere auth |
| `/org/:orgId/entities/:productId` | ProductsView | requiere auth |
| `/org/:orgId/production` | CreateView | requiere auth |
| `/org/:orgId/audiences` | AudiencesView | requiere auth |
| `/org/:orgId/audiences/:audienceId` | AudiencesView | requiere auth |
| `/org/:orgId/marketing` | CampaignsView | requiere auth |
| `/org/:orgId/marketing/:campaignId` | CampaignsView | requiere auth |
| `/org/:orgId/settings` | SettingsView | requiere auth |

- `/org/:orgId` (sin módulo) redirige a `/org/:orgId/living`.  
- 404 → botón "Ir al Inicio" navega a `/home`.

Rutas legacy eliminadas (ya no existen como rutas globales):

| Antes | Ahora |
|-------|--------|
| `/products` | `/org/:orgId/entities` |
| `/brands` | `/org/:orgId/brand` |
| `/living` | `/org/:orgId/living` |
| `/campaigns` | `/org/:orgId/marketing` |
| `/audiences` | `/org/:orgId/audiences` |
| `/settings` | `/org/:orgId/settings` |
| `/create` | `/org/:orgId/production` |

---

## 4. Componente de navegación (`js/components/Navigation.js`)

### 4.1 Cuándo se muestra el sidebar

- **Función:** `shouldShowNavigation()`.
- **Lógica:** solo en rutas **workspace** → `path.match(/^\/org\/[^/]+\/.+/)`. En root (`/`, `/login`, `/home`, `/plans`, `/onboarding`) no hay sidebar (el layout root no incluye `#navigation-container`).

### 4.2 Cuándo se renderiza

- El sidebar se renderiza **solo dentro del WorkspaceLayout**: el router, al montar el layout, llama a `navigation.render()`. `render()` exige `appState.getCurrentOrgId()` y pinta enlaces `/org/:orgId/:module`.

### 4.3 Contenido del menú (links con `data-route`)

- Todos los enlaces son **/org/:orgId/:module**: Living, Marca, Entidades (Productos), Producción, Audiencias, Marketing. Se construyen con `getNavigationHTML(orgId)`.

### 4.4 Navegación programática desde el sidebar

- Dropdown organización:
  - "Create new organization" → `router.navigate('/home')`.
  - "Administrar organización" → `router.navigate(\`/org/${orgId}/settings\`)`.
  - Al **cambiar de organización** → `switchOrganization(orgId)` actualiza estado y navega a `/org/:newOrgId/living`.
- Logout → `router.navigate('/login', true)`.

---

## 5. Vista base y renderizado (`js/views/BaseView.js`)

### 5.1 Ciclo de una vista

- **`render()`** (llamado por el router):
  1. `showLoading()` (spinner en `#app-container`).
  2. Obtiene HTML: `renderHTML()` de la subclase o `loadTemplate()` si hay `templatePath`.
  3. `container.innerHTML = html`.
  4. **`updateLinksForRouter()`**: todos los `a[href^="#"]` y `a[href^="/"]` reciben listener de click → `preventDefault` y `router.navigate(path)` (path normalizado con `/`). Así los enlaces internos son SPA.
  5. `onEnter()` (hook de la subclase).
  6. `init()` (hook de la subclase).
  7. `updateHeader()` (avatar, dropdown usuario, etc.).
  8. `initialized = true`, `hideLoading()`.

### 5.2 Header común

- `getHeaderHTML(section, activeObject, organizationName)` genera el header con toggle del sidebar, contexto y usuario.
- `updateHeader()` / `setupHeaderUserDropdown()`: perfil → `router.navigate('/settings?tab=profile')`, logout → `router.navigate('/login', true)` o `location.href = '/login.html'`.

---

## 6. Puntos donde se dispara navegación en el proyecto

Resumen de **quién** navega y **cómo** (router vs `window.location`):

- **Router (`router.navigate`):**
  - App (404 → `/`).
  - Navigation (links del menú, organización, logout).
  - BaseView (links actualizados por `updateLinksForRouter`, perfil, logout).
  - LandingView (post-login → `result.redirectRoute` o `/products`).
  - HogarView, LivingView, FormRecordView (redirect login, o a `/living`/`/products`/`/studio`).
  - BrandsView, ProductsView, CampaignsView, AudiencesView, CreateView, ContentView, SettingsView, StudioView (redirect a `/login` si no auth).
  - ProductsView, products.js (detalle producto, login).
  - living.js (historial vacío → `/production`; otro CTA → `/products`).
  - session-utils (redirect si no autorizado).
  - AuthService (logout → `/login`).

- **Full page (`window.location.href`):**
  - auth-guard: `login.html`, `form-record.html`.
  - login.js: `redirectUrl` o `form-record.html`.
  - landing.js: `/products.html`.
  - form-record.js, studio.js, payment-modal.js, planes.js: variantes de `login.html`, `form-record.html`, `onboarding-new.html`, etc.

---

## 7. Netlify y SPA

En `netlify.toml`:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Todas las rutas sirven `index.html`. El router lee `location.pathname` al cargar o al hacer `pushState`/`popstate`, así que rutas como `/living`, `/products/123` funcionan al recargar.

---

## 8. Inconsistencias y recomendaciones

1. **Ruta `/organization`:** OrganizationView existe pero no está en `index.html` ni en `registerRoutes()`. Los enlaces del dropdown de organización llevan a 404 o a `/`.  
   **Recomendación:** Añadir script de `OrganizationView` en `index.html` y registrar `/organization` en `app.js`.

2. **Rutas del menú sin vista:** `/services`, `/sedes`, `/posts`, `/reels`, `/cine` no tienen ruta ni vista.  
   **Recomendación:** Registrar vistas placeholder o eliminar/deshabilitar esos items hasta que existan.

3. **Ruta `/production`:** Usada en `living.js`; no existe en el router.  
   **Recomendación:** Registrar una vista (p. ej. Producción) o cambiar el CTA a una ruta existente (p. ej. `/content` o `/create`).

4. **Mezcla router vs `location.href`:** Varios flujos (login, auth-guard, form-record, landing, payment) usan `window.location.href` a `.html` o rutas sin `.html`, lo que provoca recarga completa y posible inconsistencia con la SPA.  
   **Recomendación:** Unificar a `router.navigate()` cuando la app ya esté cargada (p. ej. post-login, post-verificación).

5. **Query string:** El router no usa `location.search`. Rutas como `/settings?tab=profile` o `/organization?action=create` matchean por path; las vistas pueden leer `window.location.search` si lo necesitan.

6. **`js/navigation.js` (NavigationManager):** Es un segundo sistema de navegación que no se carga en `index.html`; el que se usa es `js/components/Navigation.js`.  
   **Recomendación:** Considerar eliminar o integrar `navigation.js` si no se usa en otra parte.

---

## 9. Diagrama resumido del flujo

```
Usuario abre / o /living
        │
        ▼
index.html carga → scripts en orden
        │
        ├─ app-loader: Supabase + loading (si no es landing)
        ├─ router: window.router, listeners popstate/load
        ├─ vistas + Navigation.js
        └─ app.js: registerRoutes(), setTimeout → handleRoute()
        │
        ▼
handleRoute()
  path = location.pathname
  requiereAuth? → no auth → navigate('/login', true)
  redirectIfAuth? (solo /login) → auth → navigate('/hogar', true)
  container vacío → new ViewClass() → view.render()
        │
        ▼
BaseView.render()
  loading → html → container.innerHTML → updateLinksForRouter()
  → onEnter() → init() → updateHeader()
        │
        ▼
router.updateNavigation() + evento 'routechange'
        │
        ▼
Navigation: si shouldShowNavigation() → render() sidebar
            si no (/, /login, /planes) → no sidebar o limpiar
        │
Clic en nav-link / enlace interno
        │
        ▼
preventDefault → router.navigate(ruta) → handleRoute() (repite desde arriba)
```

Con este documento se tiene una visión completa del flujo de navegación del proyecto y de los puntos a alinear (organization, rutas faltantes, uso único del router).
