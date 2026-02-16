# Análisis del sistema PaaS para desarrolladores

## 1. Páginas existentes (rutas `/dev/*`)

| Ruta | Vista | Descripción |
|------|--------|-------------|
| `/dev/dashboard` | DevDashboardView | Dashboard con métricas, flujos recientes, logs |
| `/dev/flows` | DevFlowsView | Lista y gestión de flujos de IA |
| `/dev/flows/:flowId` | DevFlowsView | Detalle/edición de un flujo |
| `/dev/builder` | DevBuilderView | Constructor visual de flujos |
| `/dev/builder/:flowId` | DevBuilderView | Editar flujo existente en el builder |
| `/dev/test` | DevTestView | Probar flujos y ver ejecuciones |
| `/dev/runs` | DevTestView | Misma vista que Test (alias) |
| `/dev/test/:flowId` | DevTestView | Test con flujo preseleccionado |
| `/dev/logs` | DevLogsView | Logs y debug de flujos |
| `/dev/webhooks` | DevWebhooksView | Gestión de webhooks |
| `/dev/lead/flows` | DevLeadAllFlowsView | Todos los flujos (Lead: ver/editar/eliminar todos) |
| `/dev/lead/team` | DevLeadTeamView | Equipo (solo Lead) |
| `/dev/lead/categories` | DevLeadCategoriesView | Categorías (solo Lead) |
| `/dev/lead/input-schemas` | DevLeadInputSchemasView | Input Schemas (solo Lead) |
| `/dev/lead/ai-vectors` | DevLeadVectorsView | Base de conocimientos IA (solo Lead) |
| `/dev/lead/references` | DevLeadReferencesView | Referencias visuales (solo Lead) |

**Rol Lead:** Solo `profiles.dev_role = 'lead'` ve el menú Lead y accede a estas rutas. El enum `developer_role_type` debe incluir `'lead'`.

**Total:** 6 vistas PaaS + 5 vistas Lead.

---

## 2. Páginas que se pueden simplificar

### 2.1 Unificar `/dev/test` y `/dev/runs`
- Ambas rutas usan **DevTestView**.
- **Recomendación:** Dejar una sola ruta canónica (por ejemplo `/dev/test`) y redirigir `/dev/runs` → `/dev/test`, o eliminar `/dev/runs` del router y del menú si no se enlaza en ningún sitio.

### 2.2 ~~Placeholders: Colaboradores, Marketplace, Documentación~~ (hecho)
- Eliminadas rutas y enlaces del menú: Colaboradores, Marketplace, Documentación (los flujos no se venden).

### 2.3 Código duplicado en vistas PaaS
- **onEnter:** Parte de las vistas usa `authService.checkAccess(true)` + forzar `navigation.render()` en modo developer; otras usan `authService.isAuthenticated()` + `navigation.switchMode('developer')`. Conviene unificar:
  - Un solo método de “asegurar modo desarrollador” (sin redirigir).
  - Misma comprobación de acceso (p. ej. siempre `checkAccess(true)` para consistencia con el resto de la app).

### 2.4 Templates inexistentes
- **DevDashboardView**, **DevFlowsView** y **DevLogsView** tienen `templatePath` a `dev/dashboard.html`, `dev/flows.html`, `dev/logs.html`.
- Esos archivos **no existen** en `templates/`. Las vistas sobrescriben `renderHTML()` y no usan el template, así que no hay error en runtime, pero el `templatePath` sobra y puede inducir a error.
- **Recomendación:** Poner `this.templatePath = null` en esas tres vistas o eliminar la propiedad.

---

## 3. Conflictos y errores detectados

### 3.1 Bug crítico: redirección al entrar a Builder, Test y Webhooks
- **Dónde:** `DevBuilderView`, `DevTestView`, `DevWebhooksView` en `onEnter()` llaman a `window.navigation.switchMode('developer')`.
- **Qué hace `switchMode('developer')`:** Guarda el modo en `localStorage` y ejecuta `window.router.navigate('/dev/dashboard')`.
- **Efecto:** Al navegar a `/dev/builder`, `/dev/test` o `/dev/webhooks`, el usuario es **redirigido siempre a /dev/dashboard**. Es imposible quedarse en Builder, Test o Webhooks.
- **Solución:** No usar `switchMode()` para “asegurar que el sidebar esté en modo desarrollador”. Usar el mismo patrón que en DevDashboardView, DevFlowsView y DevLogsView: comprobar `navigation.currentMode !== 'developer'` y en ese caso forzar `navigation.render()` (sin llamar a `navigate`).

### 3.2 Inconsistencia de autenticación en vistas PaaS
- **DevDashboardView, DevFlowsView, DevLogsView:** `authService.checkAccess(true)` y redirección a `/login` si falla.
- **DevBuilderView, DevTestView, DevWebhooksView:** `authService.isAuthenticated()` y `router.navigate('/login')` (sin `replace`).
- **Recomendación:** Usar en todas `checkAccess(true)` y, al redirigir a login, usar `replace: true` para no dejar la ruta protegida en el historial.

### 3.3 Menú vs rutas
- El sidebar incluye enlaces a `/dev/collaborators`, `/dev/marketplace`, `/dev/docs` con títulos específicos, pero las rutas muestran contenido distinto (Dashboard o Flows). Es un conflicto de expectativas del usuario; debe corregirse como en el apartado 2.2.

---

## 4. Resumen de acciones recomendadas

| Prioridad | Acción |
|-----------|--------|
| Alta | Corregir el bug de redirección en DevBuilderView, DevTestView y DevWebhooksView (no usar `switchMode` en `onEnter`; alinear con el patrón de Dashboard/Flows/Logs). |
| Alta | Unificar autenticación en todas las vistas PaaS (`checkAccess(true)` y mismo manejo de redirección a login). |
| Media | Unificar `/dev/test` y `/dev/runs` (una ruta canónica o redirección). |
| ~~Media~~ | ~~Ocultar Colaboradores, Marketplace, Documentación~~ → Eliminados. |
| Baja | Poner `templatePath = null` (o eliminar) en DevDashboardView, DevFlowsView y DevLogsView. |

Este documento refleja el estado del análisis en la fecha indicada. Tras aplicar las correcciones, conviene actualizar el doc o marcar las acciones realizadas.
