# AUDIT-005 — Builder PaaS Readiness

**Fecha:** 2026-05-19
**Página:** `/dev/builder` (DevBuilderView)
**Objetivo:** Convertir el Builder en una herramienta de calidad PaaS profesional para desarrolladores externos (paridad con n8n / Retool / Make / Zapier en lo esencial).

---

## 1. Cómo funciona hoy (mapa rápido)

### Archivos
- `js/views/DevBuilderView.js` (1.409 líneas) — controlador principal, render del HTML, ciclo de vida, listeners, tabs.
- `js/views/builder/BuilderInputs.js` (2.056) — canvas, drag&drop, panel de propiedades, generador de form preview.
- `js/views/builder/BuilderModules.js` (322) — grafo de módulos (node-map), panel "Detalles técnicos" por módulo.
- `js/views/builder/BuilderPersistence.js` (773) — load/save/publish/duplicate/export/runTest/delete.
- `css/modules/developer.css` (7.943) — todo el styling.
- `js/input-registry.js` — registro central de tipos de inputs (la fuente de verdad de render para el catálogo/studio; el Builder lo usa para preview).

### Modelo de datos (Supabase, tabla por tabla)
- `content_flows` — flujo (nombre, descripción, status, owner, version, token_cost, output_type, flow_category_type, execution_mode, show_in_catalog, ui_layout_config, flow_image_url, slug, builder_version, likes_count, saves_count, run_count, is_active).
- `flow_modules` — grafo de ejecución 1..N. Primer módulo lleva `input_schema = { fields: [...] }`. Cada nodo: name, step_order, execution_type, webhook_url_test/prod, output_schema, routing_rules, is_human_approval_required, next_module_id.
- `flow_technical_details` — 1-a-1 con `flow_modules` (UNIQUE en `flow_module_id`). Plataforma, ids/URLs del editor, credenciales, salud, telemetría.
- `content_categories` / `content_subcategories` — taxonomía.
- `ui_component_templates` — catálogo de componentes arrastrables (con `template_level`, `for_flow_type`).
- Storage `images_flows` — portadas, paths `{flow_id}/{file}` o `temp_{user_id}/{file}`.

### Flujo del usuario (4 tabs en el header de la app, movidos por `moveBuilderTabsToAppHeader`)

1. **Configuración** — portada, "Mostrar en catálogo", versión, créditos, nombre/descripción, tipo de flujo (Manual/System/Autopilot/Scraping; los dos últimos lead-only), categoría/subcategoría, output_type.
2. **Módulos** — node-map horizontal con cada módulo. Doble clic abre modal para nombre/tipo/URLs. Panel lateral "Detalles técnicos" cambia plataforma/credentials/salud por módulo.
3. **Inputs** — sidebar izquierdo con paleta de 25+ componentes (string/dropdown/chips/radio/checkbox/range/flags/colores/aspect_ratio/scope_picker/entity_selector/image_selector/structural). Canvas central con drag&drop, reorder, duplicar, eliminar. Sidebar derecho con propiedades del campo seleccionado.
4. **Ficha del Flujo** — preview de la card del catálogo + preview del formulario completo.

### Footer
Badge de estado + botones según `status` y rol:
- `draft` → Guardar + (Lead: Publicar / Dev: Solicitar revisión).
- `checking` → (Lead: Aprobar y publicar / Rechazar).
- `published` → Actualizar + (Lead: Despublicar).
- Probar siempre visible.

### Persistencia (resumen)
- `saveFlow()`: upsert en `content_flows` + delete-and-rebuild de `flow_modules` huérfanos + insert/update modules + upsert `flow_technical_details` por módulo.
- `runTest()`: invoca el webhook `_test` (fallback `_prod`) vía `FlowWebhookService` con `{ inputs, test_mode: true, flow_id, timestamp }`.
- `publishFlow()` (Lead): valida schema no vacío, URLs https, set status='published', save.
- `requestReview()` (Dev): set status='checking'.
- `confirmDelete()`: borra tech_details → modules → flow (cascade manual).

---

## 2. Bugs encontrados (priorizados por severidad)

Convención: **P0** = rompe/corrompe datos, **P1** = funcional pero degradado, **P2** = consistencia/UX, **P3** = pulido.

### P0 — Rompe o corrompe

| # | Bug | Archivo:línea | Diagnóstico | Fix |
|---|---|---|---|---|
| P0-1 | Sin warning de cambios no guardados al salir/navegar. `hasUnsavedChanges` se setea pero nunca se lee. | `DevBuilderView.js` ciclo de vida | Cualquier clic en sidebar/cierre de pestaña → trabajo perdido. | Añadir `window.addEventListener('beforeunload', e => { if (this.hasUnsavedChanges) e.preventDefault() })` + hook en router. |
| P0-2 | `saveTechnicalDetails` borra **todos** los `flow_modules` con un `for` no transaccional cuando `keepIds=[]`. Si falla a mitad, el flujo queda inconsistente. | `BuilderPersistence.js:299-313` | Cliente JS sin transacciones; cualquier 503 deja datos colgados. | Crear RPC `pg` `replace_flow_modules(flow_id, modules jsonb, tech jsonb)` que haga todo en una sola TX. Mientras tanto: `Promise.all` + retry con backoff. |
| P0-3 | `selectedFieldIndex > index` después de `deleteField` usa comparación con `null`. Si `selectedFieldIndex=null`, `null > index` es `false`, OK, pero el chequeo posterior reasigna mal cuando hay structurals seleccionados con index 0. | `BuilderInputs.js:506-508` | Selección queda desincronizada después de borrar. | Reescribir: `if (this.selectedFieldIndex == null) return; if (this.selectedFieldIndex === index) this.selectedFieldIndex = null; else if (this.selectedFieldIndex > index) this.selectedFieldIndex--;` |
| P0-4 | `flow_modules.next_module_id` siempre se guarda como `null` en `saveTechnicalDetails` (línea 330 hardcoded `next_module_id: null` en insert; update lo recupera pero el primer save lo aplasta). El "grafo" nunca se construye en BD. | `BuilderPersistence.js:330, 358` | El grafo solo existe en memoria (orden por `step_order`); cualquier ejecución multi-step con bifurcación falla. | Después del primer pass de inserts (que asigna ids), hacer un segundo pass que setea `next_module_id` al id del siguiente módulo por `step_order`. |
| P0-5 | `loadFlow` consulta `flow_technical_details` con `.in('flow_module_id', moduleIds)` sin chequear errores; un fallo en RLS deja `flowTechnicalDetailsByModule={}` sin avisar. Los developers que no son `is_developer()` real ven panel técnico vacío y sobrescriben con defaults al guardar. | `BuilderPersistence.js:91-95` | RLS "Tech details" es `is_developer()` only — un dev sin flag verdadero pisa la config técnica con valores default. | Capturar `error`; si presente: bloquear edición técnica con banner "No tienes permisos para editar detalles técnicos". |
| P0-6 | `addField` parte la inmutabilidad: `...baseSchema, input_type: baseSchema.input_type || baseSchema.type || 'text'`. Pero objetos anidados (`options`, `flags_category`, etc.) se comparten por referencia entre plantilla y campo. Editar `options` del campo muta la plantilla en memoria. | `BuilderInputs.js:182-206` | Si el usuario arrastra dos veces el mismo componente, las opciones se cruzan. | `JSON.parse(JSON.stringify(baseSchema))` deep clone antes del spread. |
| P0-7 | `propKey` permite duplicados después de un cambio inválido (revierte el `value`, pero deja el `field.key` viejo). Si el usuario renombra rápido a otro key duplicado, el `change` listener no dispara — bypass de la validación. | `BuilderInputs.js:1371-1381` | `keys` duplicados en `input_schema.fields` → backend toma el primero, el otro se pierde. | Validar también en `blur` y en `input` con debounce; reflejar error visual. |

### P1 — Funcional pero degradado

| # | Bug | Archivo:línea | Diagnóstico | Fix |
|---|---|---|---|---|
| P1-1 | `content_flows.updated_at` **no existe en BD**. No hay trigger ni columna. Imposible saber cuándo se modificó un flujo. | `SQL/schema.sql:608-636` | Listados ordenados por fecha de modificación son falsos (caen a `created_at`). | Migration: `ALTER TABLE content_flows ADD COLUMN updated_at timestamptz DEFAULT now()` + trigger `BEFORE UPDATE SET NEW.updated_at = now()`. Repetir en `flow_modules`. |
| P1-2 | `content_flows.slug` UNIQUE en BD pero el Builder **nunca lo setea**. Inserts pueden chocar si en el futuro algún backfill lo activa. | `BuilderPersistence.js:saveFlow` | Race futura. | Generar slug con `slugify(name) + '-' + shortHash` en el primer save; mantenerlo en updates. |
| P1-3 | `content_flows.is_active` (DEFAULT true) jamás se setea. Despublicar (`unpublishFlow`) solo cambia status, no `is_active`. El catálogo público mira `is_active`. | `BuilderPersistence.js:517` | Flujos despublicados podrían seguir mostrándose dependiendo de la query del catálogo. | Despublicar también debe `is_active = false`. Publicar lo activa. |
| P1-4 | `content_flows.input_schema` (legacy) ya no existe en el schema actual; el fallback en `loadFlow` lee `flow.input_schema?.fields` que será siempre `undefined`. Dead code que confunde. | `BuilderPersistence.js:120-124` | Mantiene una rama imposible. | Borrar el bloque. |
| P1-5 | `ui_component_templates.template_level` y `for_flow_type` se ignoran. El Builder muestra los 27 componentes a todos los tipos de flujo, incluso los marcados como `shell`/`domain` que no aplican. | `DevBuilderView.js:640-650` | UX ruidosa; componentes que el dev no debería ver. | Filtrar `for_flow_type IS NULL OR for_flow_type = this.flowData.flow_category_type` y agrupar por `template_level`. |
| P1-6 | "Probar" usa solo el webhook del **primer módulo** y dispara con `test_mode: true`. Para flujos multi-step nunca se prueba el grafo completo desde el Builder. | `BuilderPersistence.js:644-665` | Un dev no puede validar la cadena. | RPC `dispatch_flow_test_run` o entrypoint en ai-engine que respete `flow_modules` + `next_module_id`. |
| P1-7 | `runTest()` no respeta `is_required` en `defaultValue` de chips/colores/range (no recoge esos tipos en `formData`). Solo lee `value` de inputs nativos. | `BuilderPersistence.js:620-642` | Datos enviados al webhook están incompletos para tipos custom. | Usar `InputRegistry.collectValues(container, schema)` (función a crear); evitar reimplementar el read en el Builder. |
| P1-8 | `flowImageInput` acepta `image/*,video/*` pero el preview en `flow_card-placeholder` no maneja videos en el catálogo (`flow-card` solo renderiza `<img>`). El upload acepta pero la UX downstream rompe. | `DevBuilderView.js:148, renderFichaFlowCard:789-791` | Subir un mp4 deja la card sin imagen en catálogo. | Validar en `uploadImage`: si `video/*` y el catálogo no lo soporta, rechazar o convertir a poster JPG. |
| P1-9 | `selectedFieldIndex` no se preserva al cambiar de tab Inputs↔Ficha. El panel de propiedades se resetea visualmente y el usuario pierde foco. | `DevBuilderView.js:1080-1095` | Pérdida de contexto. | Persistir `selectedFieldIndex` y re-aplicar `.selected` al volver a Inputs. |
| P1-10 | `keydown Delete/Backspace` solo borra el campo seleccionado **si** estás en pestaña Inputs, pero el listener se registra en `document` durante `init()`. Si abres un input modal (Test, Delete, Module node), Delete dispara igual (lo bloquea por `isTextInput` pero no por `modal abierto`). Edge: input `range` con foco no es textInput → Backspace borra el campo. | `DevBuilderView.js:1050-1060` | Borrados accidentales. | Añadir check: `if (document.querySelector('.modal[style*="flex"]')) return;` |
| P1-11 | `JSON inválido en valor por defecto` se notifica pero no marca el textarea como error; el usuario pierde su input al volver a renderizar. | `BuilderInputs.js:1519-1545` | Frustración + datos perdidos. | Mantener el `raw` en el textarea y poner `aria-invalid="true"` + borde rojo. |
| P1-12 | `propKey.replace(/[^a-z0-9_]/g, '')` permite arrancar con número. Las plataformas n8n/Make tratan keys como nombres de variable y muchos lenguajes rompen con `1foo`. | `BuilderInputs.js:1373` | Webhooks reciben `inputs: { "1foo": "x" }` — válido JSON, pero rompe templates. | Regex `^[a-z][a-z0-9_]*$` y avisar si arranca con número. |
| P1-13 | `renderTechnicalModulesList` re-crea el DOM completo en cada drag. No hay diffing; pierde el foco si el usuario está escribiendo en un input. | `BuilderModules.js:19-62` | Microbloqueos. | Render incremental o uso de `<input>`s controlados en lugar de re-renderizar. |
| P1-14 | `uploadImage` con archivos nombrados con espacios o caracteres especiales: `fileName = ${Date.now()}_${rand}.${ext}` solo conserva la ext, sin sanitizar — OK. Pero `flowSlug = this.flowId || temp_${this.userId}` y si `userId=null` queda `temp_undefined/...`. | `DevBuilderView.js:1292-1295` | Path corrupto, asset huérfano. | Bloquear upload si `!this.userId`. |
| P1-15 | `setupSettingsListeners` setea `flowTokenCost` con `>=0` pero el min en el input es 0. Permite 0 créditos → flujo gratis sin protección. | `DevBuilderView.js:1102, 162` | Bypass de monetización (a veces deseado para system flows, pero sin gating). | Min real desde `flow_category_type`: system permite 0, manual mínimo 1. |
| P1-16 | `RLS "Tech details" ON public.flow_technical_details FOR ALL TO authenticated USING (public.is_developer())` — un developer puede leer/escribir tech_details de **cualquier** flujo, no solo los suyos. | `SQL/security_RLS.sql:171-172` | Information leak entre devs. | Endurecer: `is_developer() AND can_access_flow((SELECT content_flow_id FROM flow_modules WHERE id = flow_module_id))`. |
| P1-17 | `openModuleNodeModal` deja un `_moduleNodeModalIndex` en instancia que nunca se limpia si cierras con ESC (no hay listener ESC) → próximo Save dispara contra el viejo. | `BuilderModules.js:68-90` | Ediciones aplicadas al módulo equivocado. | `keydown Escape` → `closeModuleNodeModal`. |
| P1-18 | `applyFlowTypeUI` muta `inputSchema = JSON.parse(JSON.stringify(DEFAULT_SCHEDULE_SCHEMA.fields))` si pasas a autopilot. **No pide confirmación** si ya había campos. Datos del usuario pueden sobrescribirse en silencio. | `DevBuilderView.js:863-866` | Pérdida de schema al cambiar tipo. | Confirm modal: "¿Reemplazar campos actuales por el schema de programación?". |
| P1-19 | `flow_category_type=system` setea `show_in_catalog=false` siempre, pero la lógica está en `applyFlowTypeUI` (UI), no en `saveFlow`. Un dev astuto puede toggle el checkbox antes del save y publicar un system en catálogo. | `DevBuilderView.js:894-898` | Bypass. | Enforce en `saveFlow`: `if (flow_category_type === 'system') flowPayload.show_in_catalog = false`. |
| P1-20 | `publishFlow` valida URL test/prod **del primer módulo**, no de los módulos siguientes. Pubilcar con módulo 2 sin webhook → ejecución falla en runtime. | `BuilderPersistence.js:413-430` | Flujo "publicado" no ejecutable. | Iterar `this.flowModules` y validar TODOS los webhooks. |

### P2 — Consistencia / UX

| # | Bug | Archivo:línea | Diagnóstico | Fix |
|---|---|---|---|---|
| P2-1 | "Versión" es un input libre. El usuario puede poner `"hola"` y se guarda. No es semver. | `DevBuilderView.js:157-158` | No sirve para versionado real. | Validar `/^\d+\.\d+\.\d+$/` o usar UI con +major / +minor / +patch. |
| P2-2 | El badge de estado tiene 4 valores (`draft/checking/testing/published`) pero "testing" no aparece en ningún flujo de transición. Solo `draft → checking → published` y `published → draft`. | `DevBuilderView.js:912-921, BuilderPersistence.js` | "Testing" es código muerto. | Quitar la opción o cablear un estado real. |
| P2-3 | Auto-save inexistente. El usuario debe presionar "Guardar". Builders modernos guardan cada N segundos o en blur. | `DevBuilderView.js` | UX 2010. | Debounced save (mantener flag `isAutoSaving`, mostrar "guardando…" en footer). |
| P2-4 | Sin undo/redo. Hacer un cambio mal → fix manual o recargar (perdiendo todo lo demás). | global | Crítico en builders. | Stack `history.push(JSON.stringify(state))` cap 50; `Ctrl+Z` / `Ctrl+Y`. |
| P2-5 | Sin búsqueda en el canvas (solo en la paleta de componentes). Schemas con 30+ campos → scroll infinito. | `BuilderInputs.js` | UX. | `Cmd/Ctrl+K` para saltar a un campo por label/key. |
| P2-6 | Schema preview (JSON) renderiza `#jsonSchemaPreview code` pero el `<pre>` no existe en `renderHTML()`. La función `updateJsonPreview` falla silenciosamente. | `BuilderInputs.js:2000-2006`, `DevBuilderView.js renderHTML` | Función dead-code visual. | Decidir: añadir un panel JSON (recomendado) o eliminar `updateJsonPreview`. |
| P2-7 | `setupTechnicalListeners` usa selectores `#webhookMethod`, `#platformName`, `#editorUrl` que no existen en el HTML (los IDs reales son `techDetailsWebhookMethod`, etc.). Listeners no se enganchan. | `DevBuilderView.js:1172-1185` | Lógica muerta. | Borrar el bloque (ya cubierto por `setupTechnicalDetailsPanel`). |
| P2-8 | `flow_card-placeholder` muestra icono fontawesome (`fa-image`), pero el resto del Builder usa Phosphor (`ph ph-image`). Dos librerías de iconos mezcladas. | `DevBuilderView.js:737-744, 791` | Inconsistencia visual. | Estandarizar en Phosphor; emparejar mapping output_type→ícono. |
| P2-9 | "Solicitar revisión" no notifica a los Leads. `developer_notifications` solo se crea en `rejectFlow`. | `BuilderPersistence.js:443-464` | Leads no se enteran. | Insert en `developer_notifications` con `recipient_user_id` de cada Lead. |
| P2-10 | El panel de propiedades se redibuja completo (`renderPropertiesPanel`) en cada `change` del tipo. Se pierde foco/scroll del panel. | `BuilderInputs.js:1443` | Microflickers. | Diffing parcial: solo refrescar `renderTypeSpecificProperties` y los listeners. |
| P2-11 | `runTest` envía `flow_id: this.flowId`. Si el flujo es nuevo (no guardado) → `null`. El webhook recibe `flow_id: null`. | `BuilderPersistence.js:664-693` | Trazabilidad rota. | Forzar `saveFlow` antes de `runTest` cuando `!this.flowId`. |
| P2-12 | "Exportar flujo" exporta a JSON pero no incluye `flow_modules` ni `flow_technical_details`. Solo schema. Es exportación incompleta. | `BuilderPersistence.js:576-601` | Imposible reimportar. | Exportar bundle completo `{ flow, modules, tech }`. Importar pendiente. |
| P2-13 | El nombre del flujo permite vacíos en cualquier tab que no sea Configuración. El badge actualiza "Borrador" sin nombre. | `DevBuilderView.js:206-210` (validación solo en save) | Confusión. | Header del Builder muestra siempre el nombre (o "Sin título") con CTA inline. |
| P2-14 | `flow_image_url` con video: el preview en Configuración usa `<video muted playsinline>` pero sin `autoplay loop` → frame negro. | `DevBuilderView.js:982-987` | Vista muerta. | Añadir `autoplay loop`. |
| P2-15 | "Colores" hardcodea 6 colores defaults si no hay options. Pero `propColoresMax` permite 12 — se puede meter 12 colores y solo se renderizan los primeros 6 si el default schema sobrescribe. | `BuilderInputs.js:1108, 1426-1428` | Inconsistencia. | Mantener defaults solo si options está realmente vacío y respetar el `max_selections` del field. |
| P2-16 | `propStringMode` cambia entre short/long, pero al cambiar a "long" → `prompt`, luego de vuelta a "short" → siempre cae a `text`, perdiendo el flag `html_type=url`. | `BuilderInputs.js:1558-1610` | Pérdida de config sutil. | Preservar `html_type` cuando aplique al cambiar de modo. |
| P2-17 | `next_module_id` no es editable desde la UI. El módulo 1 nunca puede saltarse al 3. Solo grafo lineal. | UI Módulos | Limita features prometidas (routing_rules existen en BD). | Drag de un handle "salida" a otro nodo (estilo n8n). |
| P2-18 | `getFlowPublicUrl` arma `${origin}${pathname}/#/studio?flow=...`. Si el path tiene trailing slash, queda `//#/studio`. | `DevBuilderView.js:696-701` | URL rota en algunos despliegues. | Normalizar `pathname.replace(/\/+$/, '')`. |
| P2-19 | `confirmDelete` no avisa cuántos módulos/tech_details borrará. "Esta acción no se puede deshacer" sin contexto. | `DevBuilderView.js:443-454` | UX pobre. | Mostrar resumen: "Se eliminarán 3 módulos y 2 detalles técnicos". |
| P2-20 | `propDoubleSlider` chequea/setea `value_start/value_end` pero los campos asociados no aparecen en el render del canvas (`renderInputPreview` solo dibuja un `<input type=text disabled>`). | `BuilderInputs.js:1710-1730, 339-355` | Preview no refleja config real. | Delegar todos los previews a `InputRegistry.renderPreview(field)` (ya hay fallback). |
| P2-21 | `applyTabLayout('ficha')` llama `renderFicha()` pero `renderFicha` no actualiza si los `subcategorías`/`categorías` no cargaron aún (race con `init`). | `DevBuilderView.js:715-734` | Card vacía la primera vez. | Esperar a `Promise.all([loadCategories(), loadSubcategories(), loadComponentTemplates()])`. |
| P2-22 | `setupModalListeners` no captura `Escape` para cerrar modales (Test, Delete, Module). | `DevBuilderView.js:1187-1239` | UX. | `document.addEventListener('keydown', e => { if (e.key === 'Escape') close all visible modals })`. |
| P2-23 | `flow-status-badge` y `builder-status-badge` (CSS) son duplicados — solo se usa la primera. | `css/modules/developer.css:449-481` | Cruft. | Borrar `.builder-status-badge`. |
| P2-24 | Notificaciones tipo toast: `setTimeout(() => notification.remove(), 3000)` siempre 3s, incluso para errors largos. | `DevBuilderView.js:1386-1405` | Errores que el usuario no alcanza a leer. | 3s success, 6s error/warning, sticky con close para error con texto largo. |
| P2-25 | `copySchema` existe pero no hay UI que lo dispare. Función huérfana. | `BuilderPersistence.js:603-610` | Dead code. | Botón "Copiar schema" en tab Ficha o en JSON preview. |

### P3 — Pulido

| # | Bug | Archivo | Fix |
|---|---|---|---|
| P3-1 | Mensajes en español duros (no i18n). | global | i18n key-based; al menos extraer a `strings.builder.*`. |
| P3-2 | No hay loader visible mientras `loadFlow` corre. | `BuilderPersistence.js` | Skeleton en cada tab. |
| P3-3 | `propMaxLength` sin live-counter al escribir. | `BuilderInputs.js:898-902` | Mostrar `0 / 255` debajo del input en preview. |
| P3-4 | Tooltip de "Doble clic para editar" en `module-node` (`title=`) — sería más descubrible con icono lápiz al hover. | `BuilderModules.js:39` | Icono ✏️ visible on hover. |
| P3-5 | Sin atajos visibles. | global | "?" abre cheatsheet de atajos. |
| P3-6 | `console.error` en producción. | múltiple | Reemplazar con un `BuilderLogger.error(scope, err)` y enviar a `developer_logs`. |
| P3-7 | `confirm()` nativo en `unpublishFlow` y `prompt()` en `rejectFlow`. | `BuilderPersistence.js:489-519` | Reemplazar por modales del proyecto. |

---

## 3. Auditoría CSS (resumen de hallazgos del agente Explore)

67 hallazgos en `css/modules/developer.css`. Los críticos:

- **P1** — Hardcoded colors/rgba en lugar de tokens (≈26 sitios). Ejemplos: `.btn-builder-danger { color: white }`, `.flow-cover-actions { background: rgba(0,0,0,0.35) }`, `.module-edge-path { stroke: #b1b1b7 }`, `.preview-submit { color: #000000 }`. **Fix**: extraer a `--text-on-critical`, `--overlay-dark`, `--edge-stroke`, `--text-on-primary`.
- **P1** — Glass aplicado a **containers** en vez de botones (5 sitios): `.flow-cover-container`, `.flow-type-tabs`, `.builder-components-search`, `.technical-module-name`, `.toggle-switch`. Anti-patrón documentado en memoria del proyecto. **Fix**: `bg-card` + `border-divider`.
- **P1** — Selectores frágiles `#app-container:has(.builder-footer)` (60+ reglas anidadas). Cualquier renombrado/movimiento del footer rompe todo el modo Builder. **Fix**: agregar clase `.app-builder-mode` a `#app-container` al entrar al Builder y usar esa.
- **P2** — Z-index sin escala consistente: `200`, `1000`, `1000` (modal y notification mismo valor → colisión). **Fix**: variables `--z-panel`, `--z-modal`, `--z-toast`.
- **P2** — Faltan `:focus-visible` en TODOS los botones del Builder (`btn-builder-*`, `.builder-tab`, `.component-item`, `.field-action-btn`, `.module-node-remove`). Accesibilidad rota para usuarios de teclado.
- **P2** — `overflow-y` duplicado/conflictivo en `.json-preview` y `.image-selector-carousel-track`.
- **P2** — `.builder-properties { display: none }` en media queries conflictúa con `hidden` attr en HTML.

---

## 4. Lo que falta para nivel PaaS (gap vs n8n / Retool / Zapier)

Las funciones siguientes son el delta para que un developer externo pueda construir flujos serios:

### A. Capacidades core ausentes

1. **Versionado real**: snapshot por save (tabla `flow_revisions`), diff visual entre versiones, rollback un click. Hoy `version` es texto libre.
2. **Auto-save** con indicador "Guardando…/Guardado hace 12s".
3. **Undo/Redo** (Cmd+Z) con historial in-memory.
4. **Borradores separados de publicado**: editar un flujo publicado debería crear un draft (la versión live no se ve afectada hasta re-publicar).
5. **Search en canvas**: Cmd+K para saltar a un campo.
6. **Multi-cursor / multi-edit**: seleccionar varios campos para borrar/mover juntos.
7. **Atajos de teclado** documentados: Ctrl+S guardar, Ctrl+D duplicar campo, Ctrl+/ comentar (descripción), Delete borrar, Cmd+K palette, ? cheatsheet.
8. **Validación de schema en tiempo real**: panel lateral "Issues" tipo VS Code con todos los errores (key duplicada, opciones vacías, webhook inválido, etc.).
9. **Dry-run / Inspector**: ejecutar el flujo con datos de prueba y ver el JSON de input/output por módulo, igual que n8n.
10. **Module sandbox**: ejecutar **un solo módulo** con un input dado, sin tener que hacer toda la cadena.
11. **Variables y referencias** entre módulos: `{{ $modulo1.output.titulo }}` con autocompletado tipo JSONPath.
12. **Grafo con branching real**: handles arrastrables nodo↔nodo, `next_module_id` editable visualmente, `routing_rules` con UI (no solo JSON). La columna existe en BD, falta UI.
13. **Test cases guardados**: `flow_test_cases` existe en schema pero el Builder no la usa. Permitir guardar inputs de prueba y correrlos todos.
14. **Webhook signature**: firma HMAC compartida con el endpoint receptor (anti-spoof). Genera secret en `flow_technical_details.credential_id` y muestra header `X-Flow-Signature`.
15. **Logs en vivo**: panel inferior con stream de últimas ejecuciones (`flow_runs`) filtradas por flow_id.
16. **Cost estimator**: muestra estimación de créditos por ejecución según componentes (image_selector + LLM ⇒ "≈ 5 créditos").

### B. Permisos / colaboración

17. **Roles granulares**: hoy "is Lead vs no". Falta editor / reviewer / viewer por flujo (`flow_collaborators` ya existe en BD).
18. **Comentarios inline** en campos/módulos (para review).
19. **Lock optimista**: si dos devs editan el mismo flow, último gana sin aviso. Mostrar "Pedro está editando".

### C. Confiabilidad / observabilidad

20. **Transacciones BD**: las RPCs `replace_flow_modules` (ya recomendada en P0-2) deben aplicar TODA la persistencia atómica.
21. **Health check del webhook**: botón "Verificar webhook" que hace OPTIONS o GET → actualiza `is_healthy`.
22. **Métricas por módulo**: `avg_execution_time_ms` existe en BD pero solo se ve en el form; debería mostrarse como badge en el node-map.
23. **Audit log**: cada cambio del flow (campo agregado, schema renombrado) en `user_audit_log`. Crítico para SOC2.

### D. DX

24. **JSON schema editor visible** con copy + paste (con `updateJsonPreview` ya hay arnés, hay que cablearlo).
25. **Import bundle** (.json export → import).
26. **Plantillas de flujo**: "Crear desde plantilla" (similar a n8n templates).
27. **Documentación contextual**: cada tipo de input con `?` que abre side-panel con `docs/inputs/<type>.md`.
28. **Empty states reales** con CTAs ("Aún no tienes módulos. ¿Quieres empezar con un webhook?").

### E. Visual / UX

29. **Modo enfoque** (esconder sidebars con `[`).
30. **Theming dark/light** (ya el resto de la app es dark; ofrecer al menos un toggle "preview ficha en light").
31. **Mobile/tablet**: hoy el Builder no es usable bajo 1024px. Definir si se soporta o se bloquea con "Abre el Builder en desktop".
32. **Reorder con teclado**: subir/bajar campos con Alt+↑/↓.

---

## 5. Plan de reparación priorizado

Ordenado por **ROI** (impacto / esfuerzo). Cada fase es una rama y un PR.

### Fase 0 — Salvavidas (1–2 días)
- [ ] P0-1 beforeunload warning
- [ ] P0-3 fix selectedFieldIndex
- [ ] P0-6 deep clone en addField
- [ ] P0-7 validación key duplicada robusta
- [ ] P1-9 preservar selección entre tabs
- [ ] P1-10 ignorar Delete en modales abiertos
- [ ] P1-11 mantener JSON inválido visible
- [ ] P2-22 Escape cierra modales
- [ ] P2-21 race en renderFicha
- [ ] P2-7 borrar setupTechnicalListeners muerto

Resultado: la cantidad de "qué raro, perdí mi trabajo" cae a cero.

### Fase 1 — Datos correctos (3–5 días)
- [ ] P1-1 migration: `updated_at` + trigger en `content_flows` y `flow_modules`
- [ ] P0-2 RPC `replace_flow_modules` transaccional
- [ ] P0-4 setear `next_module_id` correctamente
- [ ] P1-2 slug autogenerado
- [ ] P1-3 `is_active` sync con publish/unpublish
- [ ] P1-4 borrar legacy input_schema fallback
- [ ] P1-16 RLS endurecida en `flow_technical_details`
- [ ] P1-19 enforce server-side de `show_in_catalog=false` para system flows
- [ ] P1-20 validar webhooks de TODOS los módulos al publicar

Resultado: BD coherente, RLS segura, multi-step funciona.

### Fase 2 — UX PaaS (5–8 días)
- [ ] Auto-save con indicador
- [ ] Undo/Redo (Ctrl+Z / Y)
- [ ] Cmd+K search en canvas
- [ ] Atajos documentados (cheatsheet con `?`)
- [ ] Panel "Issues" con validación en vivo
- [ ] Reescritura visual del module graph: handles arrastrables, edición de `next_module_id`, UI de `routing_rules`
- [ ] Dry-run por módulo (Module sandbox)
- [ ] Logs en vivo (`flow_runs` filtrado)
- [ ] Variables `{{ $module.output.key }}` con autocompletar

Resultado: el Builder se siente como n8n / Retool.

### Fase 3 — Pulido CSS + Accesibilidad (3–4 días)
- [ ] Reemplazar 26 hardcoded colors por tokens
- [ ] Quitar glass de los 5 containers identificados
- [ ] Sustituir `:has(.builder-footer)` por `.app-builder-mode`
- [ ] Escala de z-index con vars
- [ ] `:focus-visible` en todos los botones del Builder
- [ ] WCAG AA contrast check en chips y badges
- [ ] Media queries para `.builder-config-layout` y `.technical-tab-layout` en tablet

### Fase 4 — Colaboración y telemetría (1 semana)
- [ ] `flow_revisions` + diff visual + rollback
- [ ] Audit log de cambios al flow
- [ ] Comentarios inline
- [ ] Roles granulares (`flow_collaborators` cableado al Builder)
- [ ] Lock optimista (heartbeat por usuario)
- [ ] Cost estimator
- [ ] Webhook health check + signature HMAC

### Fase 5 — Templates & Import/Export (3 días)
- [ ] Export bundle completo (flow + modules + tech)
- [ ] Import bundle con validación
- [ ] Plantillas de flujo desde catálogo curado

---

## 6. Próximos pasos sugeridos

1. **Aprobar este plan**.
2. Abrir Fase 0 como un PR único; cada bug es ≤ 30 líneas de cambio.
3. Lanzar Fase 1 como migration + cambios coordinados (la migration añade `updated_at`, el code start to use it).
4. Fase 2 se puede agendar en la ventana autónoma (23:00–03:00) por sub-PRs (auto-save, undo, search son independientes).
5. Antes de Fase 4, validar con un dev externo en sandbox (puede ser uno del DevLead pool) para no over-engineerar.

---

## 7. Apéndice — Métodos huérfanos / dead code detectado

- `DevBuilderView.setupTechnicalListeners` (selectores que no existen).
- `BuilderPersistence.copySchema` (sin trigger UI).
- `BuilderPersistence.duplicateFlow` (sin botón en el footer).
- `updateJsonPreview` (no hay `#jsonSchemaPreview` en HTML).
- CSS `.builder-status-badge` (duplicado de `.flow-status-badge`).
- Canvas state `canvasAutomatedState` (siempre `display:none` por nueva regla "automated usa misma UI").
- `status === 'testing'` en `updateStatusBadge` (sin transición que lo asigne).
