# PERF-001 — Limpieza y optimizacion de rendimiento

**Creado: 2026-06-01** · Rama: `perf/cleanup-optimization`

Diagnostico de por que la plataforma se siente lenta/pesada + plan de limpieza.
Origen: auditoria de CSS/animaciones, runtime y codigo muerto (3 analisis cruzados).

Causa raiz: el JS esta bien (lazy-load, lifecycle disciplinado, sin leaks graves).
El peso esta en (1) el CSS que se descarga entero en cada carga, (2) el costo de
paint del glass/animaciones, (3) unos pocos bugs de runtime concretos.

---

## CIERRE 2026-06-02 — sprint de perf completado (todo en produccion)

Desplegado a main: barra de progreso de navegacion (no overlay), prefetch JS+CSS on
hover, route-split CSS (command-center/insight/monitoring + **developer.css 351KB**
con dev-shared.css global para clases no-dev), skeleton-first en inicios de pagina,
carga premium de imagenes (fade-in, sin render por pedazos), microinteracciones
(btn:active, modal fade, sidebar sync, easing tokens), fix de leaks (living.js modal
observers + FlowCatalog carrusel), fix delete produccion (system_ai_outputs), galerias
justified (revertido el grid cuadrado por decision del usuario).

### F4 (dividir monolitos + BaseDataService) — RESUELTO sin ejecutar, con rationale
- **BaseDataService: MOOT.** El cleanup de codigo muerto borro 4 de 6 DataServices
  (Competencia, MiBranda, Strategia, Tendencias). Quedan solo Campanas + Monitoring;
  una clase base para 2 no aporta.
- **Dividir monolitos (CanvasStore 5296, living.js 4945, VeraView 3923): NO se hace en
  el sprint de perf.** Son archivos lazy-loaded (parse una vez, cacheado) -> dividirlos
  da CERO beneficio de rendimiento; es puramente mantenibilidad, y reescribir archivos
  de 5000 lineas interconectados es alto riesgo de regresion. Queda como tarea de
  mantenibilidad futura (rama dedicada + pruebas), NO de perf.

Items menores aun abiertos (bajo impacto, opcionales): `.card` glass->solido (433 usos,
cambio visual amplio), z-index magic numbers->tokens, consolidar 13 keyframes spin/
pulse/shimmer, consolidar escapeHtml (item de seguridad: subclases no escapan comillas).

### Auditoria navegacion/transiciones (2026-06-02)
ARREGLADO (commit a6c14f5f): C1 deteccion org<->dev por prevPath real (no body.route-dev);
M1 umbral barra 180->350ms (no solape con view-transition); B2 leak #veraLibModal en
VeraView.onLeave; B3 cierre de paneles de header (Actividad/Notif/flyout) en routechange.

DIFERIDO (riesgoso, NO tocar a ciegas — requiere QA en rama):
- **A1 doble pintado en vistas cacheable**: router.js:~443 hace `container.innerHTML =
  cached.html` y luego BaseView.render() (:67) re-pinta incondicionalmente. 12 de 14
  vistas cacheable IGNORAN `_restoredFromCache` y re-pintan todo encima del cache. Dentro
  de view-transition NO hay flash visible; en fallback (Firefox/reduce-motion) si parpadea
  + reflow desperdiciado. OJO: el instant-restore es LOAD-BEARING para PlanesView (early-
  return en _restoredFromCache) y DashboardView; quitarlo a secas las rompe. Fix correcto:
  gate en BaseView.render() + hook refreshFromCache() por vista, o migrar las 12. No trivial.
- **M3 flash de 1 frame del fondo en org<->dev**: `route-dev` se togglea sincrono dentro
  de doRender (VT callback) pero `org-brand-context` lo gestiona OrgBrandTheme async fuera
  de la VT -> ventana de 1 frame con ambas clases. Fix: aplicar/limpiar org-brand-context
  dentro de doRender (o resolver el theme antes de startViewTransition).
- B4 comentarios obsoletos en bundle.css (~757 background-attachment, ~844 viewFadeIn).

---

## ✅ HECHO (en esta rama, pendiente QA en deploy preview)

### Perf global CSS (`css/bundle.css`) — preserva el look
- `--glass-blur` 24px->14px y `saturate` 140->120. backdrop-filter en 240+ sitios;
  el radio del blur domina el costo de la convolucion. Baja el paint en scroll/hover.
- Loader global: `animation: none` cuando el overlay esta `--hidden`/`--gone`.
  Antes animaba `background-position` (paint por frame) estando invisible.
- `--transition`: quitado `box-shadow` (paint no compositable; usado en 115+ sitios).

### Bugs de runtime
- `js/components/DevSidebarEnhancements.js`: MutationObserver acotado a
  `#navigation-container` (antes observaba `document.body` subtree -> el callback con
  `querySelector` corria en CADA mutacion DOM de toda la app).
- `js/views/VeraView.js`: `_cancelAsyncWait()` en `onLeave()` mata ticker(5s) +
  polling(6s) + canal realtime al navegar fuera mid-respuesta (antes seguian
  golpeando Supabase hasta 12 min en background).
- `js/views/commandcenter/Canvas.mixin.js`: `_updateEdgeGeometry` cachea
  `getBoundingClientRect` por frame + separa fase lectura/escritura (elimina el
  forced synchronous layout por-arista en drag/pan).

### Codigo muerto (-825 lineas + 2 cargas)
- Borrados: `CompetenciaDataService.js`, `StrategiaDataService.js` (huerfanos totales,
  nunca cargados), `MiBrandaDataService.js`, `TendenciasDataService.js` (cargados pero
  nunca instanciados — sus tabs del dashboard estan en stub "coming soon"),
  `js/views/brand-organization/InfoPanel.mixin.js` (nunca cargado por el router; ambos
  loaders de marca usan `brandstorage/InfoPanel.mixin.js`).
- Retiradas las cargas de MiBranda (`index.html`) y Tendencias (`app.js` dashboardLoader).
- NOTA INDEX: la seccion historica del `INDEX.md` (2026-05-27) afirma que FEAT-007/008
  estan COMPLETED porque esos services "rinden". Es falso: estaban huerfanos. Esta
  limpieza lo corrige. `CampanasDataService` SI se usa (MyBrands.mixin.js:115) — se mantiene.

### CSS route-split (infra + modulos namespaced)
- Nuevo `App._loadCss(href)` en `js/app.js`: inyecta `<link>` del modulo ANTES del
  `<link>` de bundle.css (preserva la cascada: modulos antes que reglas propias) y
  resuelve en `onload` (evita FOUC). `_lazy(global, deps, cssHrefs)` carga CSS+JS en paralelo.
- Route-split aplicado (todos namespaced, verificados SEGURO, sin riesgo de cascada):
  - `command-center.css` (108KB) -> `/command-center`.
  - `insight.css` (80KB) -> dashboardLoader + monitoringLoader.
  - `monitoring.css` (24KB) -> monitoringLoader.
  Total ~212KB fuera del bundle global para rutas que no los usan.

### Navegacion: barra de progreso en vez de overlay full-screen
- `bundle.css` `.route-progress` (barra NProgress fina arriba) + `index.html` `#routeProgress`
  + `app-loader.js` showProgress/hideProgress (min-display 400ms) + `router.js` usa
  progress en navegacion (umbral 180ms). El overlay full-screen queda solo para boot/ops largas.
  Patron pro SaaS: la vista anterior sigue visible, la navegacion se percibe instantanea.

---

## ⏳ PENDIENTE — route-split del resto del CSS (requiere QA visual por ruta)

Por que QA: hoy los `@import` van ANTES de las reglas propias de bundle.css. Mover un
modulo a `<link>` por ruta puede invertir la cascada para clases genericas que el modulo
redefine (ej. developer.css redefine `.btn`). El `insertBefore(bundle.css)` preserva el
invariante modulo-antes-de-bundle, pero el orden RELATIVO entre modulos cambia. Hay que
QA en deploy preview antes de merge.

### Recomendado: convertir `@import` -> `<link>` paralelos (prerrequisito limpio)
Quitar TODOS los `@import` de bundle.css y ponerlos como `<link>` en index.html en el
MISMO orden, con bundle.css (solo reglas propias) como ULTIMO `<link>`. Preserva la
cascada exacta y elimina la capa de serializacion del `@import`. Despues, cada modulo
route-split se omite del set global y se inyecta via `_loadCss`.

### Mapa de inyeccion verificado (que modulo va en que loader)
- **developer.css (351KB)** -> todos los `/dev/*` loaders. EL MAS DELICADO (NO hacer a
  ciegas): NO esta namespaced — redefine genericas (`.btn`, `.app-header`, `.actions-cell`,
  `.btn-primary`...). Dos requisitos:
  1. **Preservar posicion de cascada**: hoy es `@import` #14 (gana a modulos #1-13, pierde
     contra #15-24 + reglas propias de bundle). Si se inyecta antes de bundle.css pierde
     contra TODOS -> inversion que cambia el estilo de botones en /dev. Solucion: hacer
     primero el `@import`->`<link>` y route-loadearlo con `_loadCss` posicionando el `<link>`
     ANTES de `payment-modal.css` (su vecino #15 original). Requiere generalizar `_loadCss`
     a aceptar un selector ancla.
  2. **Mover clases filtradas que usa codigo NO-dev** (sino rompen fuera de /dev). Rangos
     exactos en `css/modules/developer.css`:
     - `switchuser-*` (bloque contiguo lineas **13987-14200**) + `user-dropdown-item--accent`
       (**13975-13984**) -> `navigation.css`. Las disparan SwitchUserController.js + Navigation.js (globales).
     - `image-selector-*` (**3461-3641**), `input-dropdown-wrap` (**3084-3120**), `input-stepper-*`
       (**5179-5219**) -> `studio.css`. Las usa StudioView.js.
     - `btn-link` (**7965-7975**) -> bundle.css. La usa OrganizationView.js.
     - OJO: `modern-input` NO tiene definicion standalone en developer.css (solo compuestos
       `select.modern-input`); su base esta en otro modulo. Verificar antes de mover.
  QA obligatorio en preview: portal `/dev/*` completo (botones, headers, builder) + widgets
  de Studio (stepper numerico, carrusel image-selector, dropdowns). Mayor win: rutas role-gated.
- **video.css (169KB)** -> esta MAL NOMBRADO: contiene toda la UI de chat de VeraView
  (`.vera-*`, `.gpt-*`). Partir en `video.css` (-> `/video`) + `vera.css` (-> `/vera`).
- **living.css (72KB)** -> extraer `living-masonry-*` + `living-filter*` a un mini-modulo
  global (los usan Places/Products/Dashboard); el resto (`pmodal-*`) a `/production` + `/studio`.
- **brands.css (112KB)** -> brandViewLoader + brandStorageViewLoader (ambos) +
  `/brand-integration-callback` (`.bic-*`) + studioLoader (`.color-swatch*`).
- **insight.css (80KB)** -> dashboardLoader + monitoringLoader. (Tiene CSS muerto:
  ~150 `.td-*` + 46 `.imd-*` sin consumidor JS — borrar.)
- **flow-catalog.css (52KB)** -> catalogLoader + devBuilderLoader + devFlowsLoader
  (la base `.flow-card-*` la usan DevBuilder/DevFlows; developer.css solo tiene overrides).
- **content-management.css (48KB)** -> tasksLoader + CreateView loader (`.create-*`,
  `.wizard-*`) + execHistoryLoader/catalogLoader (`.task-card-badge*`) + brand loaders (`.info-section`).
- **organization.css (48KB)** -> NO-SEGURO tal cual: `.page-content`/`.btn-ghost`/`.btn-danger`
  los usa hasta `js/app.js`. PRE-REQ: extraer esas 3 a bundle.css/ui-primitives, luego scopear.
- **products.css (36KB)** -> productsLoader. SEGURO.
- **monitoring.css (24KB)** -> monitoringLoader. SEGURO.

Ahorro estimado en login/rutas no-dev: de ~1.4MB a ~250-400KB de CSS.

---

## ⏳ PENDIENTE — otros (riesgo de cambio de comportamiento, requiere QA)

### Seguridad: consolidar `escapeHtml` (11 overrides en subclases de BaseView)
NO es no-op: las subclases usan DOM (`textContent`->`innerHTML`, NO escapa `"` ni `'`);
`BaseView.escapeHtml` usa regex y SI escapa comillas. Migrar a la heredada es mas seguro
en contextos de atributo (`<div title="${escapeHtml(x)}">`). Archivos: ProductsView,
ProductsListView, FlowCatalogView, TasksView, StudioView, PlacesView, BrandstorageView,
DevBaseView, BrandOrganizationView, ServicesView, ExecutionHistoryView. QA: verificar que
nada parsee el output esperando comillas sin escapar.

### `.card` glass -> solido (regla del proyecto: glass solo en botones)
`.card` (bundle.css:613, usado 433 veces) y `.card-info` (brands.css, con `overflow:hidden`
que ROMPE el blur) violan la regla "cards = bg #141517 + border #242424". Cambio visual
amplio -> requiere QA. `.card-info` ademas es bug real (blur clipeado).

### Consolidar keyframes (13 spin / 10 pulse / 5 shimmer identicos)
Cada modulo define su propio `@keyframes` con nombre distinto pero animacion identica.
Unificar a 1 `spin`/`pulse`/`shimmer` en bundle.css y migrar referencias. QA: ninguna
referencia por nombre debe quedar colgando.

### Pausar animaciones infinite fuera de viewport
command-center.css (~5 pulsos box-shadow infinite) y video.css (15 cinematicas infinite)
repintan aunque no esten visibles. Gatear con IntersectionObserver + `animation-play-state: paused`.
Migrar los pulsos de `box-shadow` a `transform: scale()`/`opacity` (compositable).

### z-index: migrar magic numbers a tokens
Ya existen `--z-modal`/`--z-modal-backdrop`/`--z-popover`/`--z-notification`. Migrar los
sueltos (`9999`, `10000`, `10050`, `10060`, `10100`) a esos tokens. 222 declaraciones totales.

### Monolitos a dividir
`commandcenter/CanvasStore.js` (5296 lineas), `living.js` (4945), `VeraView.js` (3923).
Y `BaseDataService` para el boilerplate compartido de los DataServices (`_ok/_err/_unwrap/
_resolveWindow/loadAll`) — hacer DESPUES de la limpieza de los muertos (ya hecha).

### Otros hardcodes a tokenizar
92 `backdrop-filter: blur(Npx)` hardcodeados -> `var(--glass-blur)` (para tunear central).
331 `!important` (sintoma de guerras de especificidad por el orden de @import).
