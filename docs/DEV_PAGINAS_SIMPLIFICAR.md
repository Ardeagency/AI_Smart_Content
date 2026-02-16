# Páginas de desarrollador (/dev) – inventario para simplificar

Listado de **todas las páginas** bajo `/dev` con rutas, vistas, tamaño y problemas detectados (duplicaciones, código residual, posibles errores de render).

---

## 1. Inventario de páginas y rutas

| # | Ruta | Vista (archivo) | Líneas | Notas |
|---|------|-----------------|--------|--------|
| 1 | `/dev/dashboard` | `DevDashboardView.js` | 712 | Dashboard principal |
| 2 | `/dev/flows` | `DevFlowsView.js` | 594 | Mis flujos (lista/grid) |
| 3 | `/dev/flows/:flowId` | `DevFlowsView.js` | (misma) | Mismo controlador |
| 4 | `/dev/builder` | `DevBuilderView.js` | **3109** | Builder de flujos (muy grande) |
| 5 | `/dev/builder/:flowId` | `DevBuilderView.js` | (misma) | Mismo controlador |
| 6 | `/dev/test` | `DevTestView.js` | **1749** | Test de flujos |
| 7 | `/dev/runs` | `DevTestView.js` | (misma) | Redirige a Test |
| 8 | `/dev/test/:flowId` | `DevTestView.js` | (misma) | Mismo controlador |
| 9 | `/dev/logs` | `DevLogsView.js` | 672 | Logs |
| 10 | `/dev/webhooks` | `DevWebhooksView.js` | 1220 | Webhooks |
| 11 | `/dev/lead/team` | `DevLeadTeamView.js` | 46 | Equipo (placeholder) |
| 12 | `/dev/lead/flows` | `DevLeadAllFlowsView.js` | 261 | Todos los flujos (Lead) |
| 13 | `/dev/lead/categories` | `DevLeadCategoriesView.js` | 483 | Categorías/subcategorías |
| 14 | `/dev/lead/input-schemas` | `DevLeadInputSchemasView.js` | 323 | Input Schemas |
| 15 | `/dev/lead/ai-vectors` | `DevLeadVectorsView.js` | 301 | Base conocimientos IA |
| 16 | `/dev/lead/references` | `DevLeadReferencesView.js` | 173 | Referencias visuales |

**Total archivos de vista:** 13 archivos, ~9.643 líneas (sin contar duplicados de ruta).

---

## 2. Código residual y posibles errores

### 2.1 `templatePath` a plantillas que no existen

Tres vistas definen `this.templatePath` a archivos **que no existen** en `templates/`:

- **DevDashboardView**: `this.templatePath = 'dev/dashboard.html'`  
  → No existe `templates/dev/dashboard.html`. La vista usa `renderHTML()` inline, así que **nunca** se llama `loadTemplate()`. Código muerto.
- **DevFlowsView**: `this.templatePath = 'dev/flows.html'`  
  → No existe `templates/dev/flows.html`. Igual: `renderHTML()` está sobrescrito, `templatePath` no se usa.
- **DevLogsView**: `this.templatePath = 'dev/logs.html'`  
  → No existe `templates/dev/logs.html`. Mismo caso.

**Riesgo:** Si en el futuro algo llamara `loadTemplate()` (por ejemplo por herencia o refactor), se produciría un **404** y pantalla de error.  
**Acción:** Eliminar `this.templatePath` en estas tres vistas (o asegurar que solo se use `renderHTML()` y no `loadTemplate()`).

---

### 2.2 `onEnter()` duplicado en todas las vistas dev

Todas las vistas dev repiten el mismo patrón:

1. `await window.authService.checkAccess(true)`
2. Si no autenticado → `window.router.navigate('/login', true)` y `return`
3. (Solo Lead) En vistas `/dev/lead/*`: si no es lead → `navigate('/dev/dashboard', true)` y `return`
4. Ajustar `window.navigation.currentMode = 'developer'`, `initialized = false`, `await window.navigation.render()`

**Archivos afectados:** Los 13 archivos de vistas Dev (con pequeñas variantes en Builder y en Lead).

**Acción:** Extraer a un método común, por ejemplo en una clase base `DevBaseView` que extienda `BaseView`, o un mixin/helper `ensureDevAuthAndNav()` que todas llamen desde `onEnter()`.

---

### 2.3 Utilidades duplicadas: `escapeHtml`, `esc`, `truncate`, `truncateText`

- **escapeHtml**: definido por separado en  
  `DevLeadInputSchemasView`, `DevLeadAllFlowsView`, `DevLeadReferencesView`, `DevLeadCategoriesView`, `DevFlowsView`, `DevDashboardView`, `DevLogsView` (misma lógica en todos).
- **esc** (mismo propósito que escapeHtml): solo en `DevLeadVectorsView`.
- **truncate** / **truncateText**:  
  - `truncate(text, max)` en `DevLeadAllFlowsView`  
  - `truncateText(text, maxLength)` en `DevFlowsView`, `DevDashboardView`, `DevLogsView`  
  - `truncateUrl` local en `DevWebhooksView`  
  - truncado manual en `DevTestView`.

**Acción:** Un solo `escapeHtml` y un solo `truncateText` en `BaseView` (o en `DevBaseView`) y usarlos en todas las vistas dev. En `DevLeadVectorsView` reemplazar `esc` por ese `escapeHtml`.

---

### 2.4 Layout y estructura HTML duplicada (vistas Lead)

Las vistas **DevLead\*** comparten la misma estructura:

- Contenedor: `dev-lead-container`, `dev-lead-*-container`
- Header: `dev-lead-header`, `dev-header-content`, `dev-header-title`, `dev-header-subtitle`
- Toolbar: `dev-lead-toolbar` (en la mayoría)
- Contenido: `dev-lead-content`, `dev-lead-table-wrap`, `dev-lead-table`, `dev-lead-empty`
- Modales: `modal dev-lead-modal`

**Archivos:**  
`DevLeadAllFlowsView`, `DevLeadCategoriesView`, `DevLeadInputSchemasView`, `DevLeadReferencesView`, `DevLeadVectorsView`, `DevLeadTeamView`.

**Acción:** Crear un helper o componente reutilizable, por ejemplo `renderDevLeadPage({ title, subtitle, icon, tableId, emptyId, toolbar, children })` que devuelva el HTML común, y que cada vista solo inyecte su tabla y botones. Reduce duplicación y evita inconsistencias de clase o estructura que puedan causar errores de estilo o de DOM.

---

### 2.5 Notificaciones

- **DevLeadVectorsView** implementa su propio `showNotification()` con `dev-lead-notification` y fallback si no existe `super.showNotification`.
- Otras vistas (p. ej. Builder, Test, Webhooks) usan patrones similares con `innerHTML` en un elemento de notificación.

**Acción:** Un único sistema de notificaciones (por ejemplo en `BaseView` o en un módulo `NotificationService`) y que todas las vistas dev lo usen.

---

### 2.6 Vistas muy grandes (candidatas a dividir o refactor)

- **DevBuilderView.js** (~3109 líneas): muchas responsabilidades (formularios, canvas, preview, guardado, test inline). Candidato a dividir en sub-vistas o módulos (por ejemplo: BuilderCanvas, BuilderPreview, BuilderTestForm).
- **DevTestView.js** (~1749 líneas): test de flujos, historial de runs, casos de prueba, logs. Candidato a extraer “TestRunner”, “RunHistory”, “FlowCases” a módulos o sub-vistas.
- **DevWebhooksView.js** (~1220 líneas): lista, formulario, test de webhook. Candidato a extraer formulario y panel de test a componentes reutilizables.

No es obligatorio dividir ya, pero al “simplificar” conviene tenerlas como objetivo para evitar más crecimiento en un solo archivo.

---

## 3. Resumen de acciones recomendadas

| Prioridad | Acción | Afecta | Estado |
|-----------|--------|--------|--------|
| Alta | Eliminar `templatePath` residual en DevDashboardView, DevFlowsView, DevLogsView | 3 archivos | ✅ Hecho |
| Alta | Centralizar `onEnter()` dev (auth + nav) en DevBaseView o helper | 13 archivos | ✅ Hecho (DevBaseView) |
| Alta | Unificar `escapeHtml`/`esc` y `truncate`/`truncateText` en BaseView o DevBaseView | 8+ archivos | ✅ Hecho (DevBaseView) |
| Media | Crear layout común para páginas Lead (helper/componente) | 6 vistas Lead | Pendiente |
| Media | Unificar notificaciones en una sola implementación | Varias vistas | ✅ Hecho (DevBaseView.showNotification) |
| Baja | Refactorizar DevBuilderView, DevTestView, DevWebhooksView en módulos más pequeños | 3 archivos | Pendiente |

---

## 4. Orden sugerido para trabajar

1. **Inventario y limpieza rápida:** quitar `templatePath` en las 3 vistas que apuntan a `dev/*.html`.
2. **DevBaseView:** crear clase base que extienda `BaseView` con `onEnter()` común, `escapeHtml` y `truncateText`; hacer que todas las vistas dev extiendan `DevBaseView` y eliminar métodos duplicados.
3. **Layout Lead:** implementar helper/componente para el layout común de `/dev/lead/*` y refactorizar las 6 vistas para usarlo.
4. **Notificaciones:** unificar en un solo punto y reemplazar usos en vistas dev.
5. **Refactors mayores:** si se quiere seguir simplificando, dividir DevBuilderView, DevTestView y DevWebhooksView en módulos o sub-vistas.

---

## 5. Perfil de desarrollador Lead (sidebar e identidad)

El **perfil del desarrollador** (incluido el lead) **no es una página propia** bajo `/dev`, sino la **tarjeta de identidad** en el sidebar y la visibilidad del menú **Lead**.

### 5.1 Dónde se muestra

| Ubicación | Archivo | Qué muestra |
|-----------|---------|-------------|
| **Sidebar modo developer** | `js/components/Navigation.js` | Tarjeta superior: icono/avatar (`#navDevIcon`), nombre (`#navDevName`), rol y rank (`#navDevTier`). Rellenada por `loadDeveloperInfo()`. |
| **Sección Lead** | Mismo | Bloque `#navLeadSection` (submenú Lead con Todos los flujos, Equipo, Categorías, etc.). Solo visible si `profile.dev_role === 'lead'`. |
| **Header** | Mismo | Menú usuario (chevron) con Configuración y Cerrar sesión; Configuración lleva a `/settings` (donde está la pestaña perfil). |

### 5.2 Datos del perfil

- **Origen:** tabla `profiles` (Supabase).
- **Campos usados en el sidebar:** `full_name`, `email`, `dev_rank`, `dev_role`, `avatar_url`.
- **Carga:** `Navigation.loadDeveloperInfo()` (llamado tras `render()` cuando `config.mode === 'developer'`).

### 5.3 Código implicado

- **HTML del sidebar dev:** `getDeveloperNavigationHTML()` (líneas ~352-468): define `navIdentityCard` con clase `dev-identity`, `navDevIcon`, `navDevName`, `navDevTier`, y el bloque `navLeadSection` con `style="display: none;"`.
- **Rellenar datos:** `loadDeveloperInfo()` (líneas ~997-1055): consulta `profiles`, escribe nombre/tier, muestra iniciales en `navDevIcon`, muestra `navLeadSection` si `dev_role === 'lead'`, y actualiza `navRunsCount` y `navRatingValue`.

### 5.4 Posibles mejoras y riesgos

| Punto | Detalle | Recomendación |
|-------|---------|----------------|
| **avatar_url sin escapar** | `iconWrap.innerHTML = \`<img ... src="${profile.avatar_url}" ...>\``. Si `avatar_url` pudiera contener comillas o script, hay riesgo de XSS. | Escapar `profile.avatar_url` (p. ej. con un helper `escapeAttr()` o usar `setAttribute` en un elemento creado por DOM). |
| **Tarjeta no clickable en modo dev** | En modo usuario, la tarjeta de identidad abre el dropdown de organizaciones. En modo developer no existe `navOrgDropdown`, así que la tarjeta no hace nada al clicar. | Opcional: hacer que el clic en la tarjeta dev lleve a `/settings?tab=profile` para editar perfil (misma UX que “ir a configuración”). |
| **Formato role/rank** | `role` y `rank` se formatean con `replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())` en línea. | Opcional: extraer a una función `formatDevTier(profile)` para reutilizar y simplificar `loadDeveloperInfo`. |
| **Vista Equipo (Lead)** | `DevLeadTeamView` es un placeholder (“En construcción”). Es la única “página” Lead que no tiene funcionalidad real. | Cuando se implemente Equipo, reutilizar el mismo patrón de datos (profiles / dev_role) que usa el sidebar. |

### 5.5 Resumen

- El perfil del desarrollador lead se muestra en la **tarjeta de identidad del sidebar** y en la **visibilidad del menú Lead**.
- No hay ruta `/dev/profile`; la edición de perfil es `/settings` (y pestaña `profile` desde el header).
- Para mejorar: escapar `avatar_url`, opcionalmente hacer la tarjeta clickable a configuración/perfil, y extraer el formateo de tier a una función si se reutiliza.

Con esto quedan identificadas **todas las páginas** que conviene simplificar, los **tipos de duplicación y código residual** que pueden estar contribuyendo a errores en la plataforma, y el **perfil de desarrollador lead** (sidebar e identidad) con puntos a mejorar.
