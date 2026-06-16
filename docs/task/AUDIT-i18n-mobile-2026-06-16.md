# Auditoría Frontend — Idioma (i18n) y Formato Móvil

**Fecha:** 2026-06-16
**Alcance:** Frontend completo de AI Smart Content (console.aismartcontent.io), rama `main`.
**Ejes:** (1) cobertura i18n ES/EN, (2) responsive/móvil.
**Método:** auditoría vista por vista de `js/views/` + `js/components/Navigation.js` contra el catálogo `js/i18n/en.js`.
**Nota:** este documento es solo diagnóstico. No se modificó código.

---

## Modelo i18n (recordatorio)

"Español como clave": `window.__('texto ES')` devuelve el español si locale=es, o la traducción de `js/i18n/en.js` si locale=en. **Cualquier string visible NO envuelto en `__()` jamás se traduce.** El catálogo `en.js` está sano (~1041 claves); el problema es masivamente strings sin envolver, no traducciones faltantes. No existe `es.js`.

---

## Hallazgos i18n — vistas con CERO cobertura (CRÍTICO)

Estas vistas no tienen ni un `__()`. Toda su UI queda en español en modo EN:

| Vista | Líneas | Severidad | Notas |
|---|---|---|---|
| `StudioView.js` | 2502 | CRÍTICO | Estudio de generación: toda la UI + todos los toasts `_notify()` hardcoded. |
| `VideoView.js` | 2833 | CRÍTICO | Mayor superficie sin traducir. Mezcla ES + inglés bare (tampoco localiza a ES). |
| `VeraView.js` | 4174 | CRÍTICO | Chat insignia de Vera: composer, bienvenida, historial, biblioteca, panel de artefacto, clarify, confirm de alto costo, progreso, errores de subida. |
| `OrganizationView.js` | 2085 | CRÍTICO | Config/admin: 11 tabs, 3 modales, todos los toasts/confirms/banners, facturación. Fechas fijadas a `es-ES`. |

## Hallazgos i18n — cobertura parcial (ALTO / MEDIO)

| Vista | `__()` | Severidad | Gaps principales |
|---|---|---|---|
| `CommandCenterView.js` | 10 | ALTO | Todo `renderHTML()` + labels de `_renderCampaigns()` bare (~90% sin traducir). Fechas `es-ES`. |
| `BrandstorageView.js` (+InfoPanel.mixin) | 35 | ALTO | Tiles, empty states, aria-labels, UI OAuth conectar/desconectar, 4 `alert()`. **Clave envuelta pero AUSENTE de en.js: `'Elegir cuenta'`.** 3 mixins referenciados no están en disco (riesgo sin auditar). |
| `ProductsView.js` | 79 | ALTO | ~25 strings sin envolver: plantilla list/empty, tarjeta de variante, labels de formulario, 2 confirms. |
| `BrandOrganizationView.js` | 9 | ALTO | Títulos de tarjetas, 2 botones `Subir archivo`, ~12 aria-labels, fechas `es-ES`. |
| `DemoEntryView.js` | 0 | MEDIO-ALTO | Splash público del demo IGNIS (primera pantalla del prospecto): título, status, todos los errores. |
| `BrandIntegrationCallbackView.js` | 0 | MEDIO | Callback OAuth: spinner, page-picker, éxito, error. Typo `Integracion conectada`/`se conecto` (sin tildes). |
| `FlowCatalogView.js` | 51 | MEDIO | ~Mitad del marketplace: vista categoría, badges de tarjeta, "usos", empty states, detalle de flow. |
| `ProductionView.js` | 28 | MEDIO | **`__('Publicar')` envuelto pero AUSENTE de en.js** (L233/235). Modal de preview/edit bare. Fechas `es-ES`. |
| `ProductsListView.js` | 77 | MEDIO | Toasts compuestos/pluralizados que evaden `__()` (L876-883), 2 `alert()`, botón Volver. |
| `ServicesView.js` | 57 | MEDIO | Flujo de generación OpenAI (toasts/hints L535-618), botón Volver. |
| `PlacesView.js` | 85 | BAJO-MEDIO | `Volver` (L427), `URL del lugar` (L440), hint pluralizado (L510). |
| `TasksView.js` | 136 | BAJO-MEDIO | Botones de detalle (Volver/Duplicar/Eliminar/Guardar/Pausar — existen en catálogo pero sin envolver), toasts, confirms, `Últimas ejecuciones`, empty del calendario. |
| `CharactersView.js` | 55 | BAJO | Solo literales de placeholder/seed de BD. |
| `DashboardView.js` | 94 | BAJO | Conector `de` hardcoded en el héroe (L509/772). **Los 4 mixins de dashboard NO se auditaron** (probable deuda propia). |

## Hallazgos i18n — limpias

`SignInView`, `VerificationView`, `CambiarContrasenaView`, `MonitoringView` (144), `ExecutionHistoryView`, `CreateView` (29), `CreationProcessView` (13). Todas con claves verificadas en en.js.

## Hallazgo i18n estructural — Navegación en inglés permanente

`js/components/Navigation.js` envuelve labels con `__(item.label)`, **pero las claves fuente están en inglés** (`'Dashboard'`, `'Identity'`, `'Workspace'`, `'Create'`, `'Products'`, `'Services'`, `'Sets'`, `'Characters'`, `'Monitoring'`, `'Production'`, `'Tasks'`, `'Video'`, `'Flows'`…). Como el modelo es español-como-clave y no hay `es.js`, **el menú lateral completo se muestra en inglés también en modo español.** Viola el modelo. (Severidad: ALTO — es chrome global, visible en todas las pantallas.)

## Caso especial — `PlanesView.js` (bug inverso)

0 `__()`, pero hardcoded en **inglés** (`PLANS`, `Monthly`, `Current plan`, `credits / month`…) → queda en inglés en modo ES. Página de pricing/conversión, no traducible en ninguna dirección. Tiene además un error mezclado en español (L413). Severidad: ALTO.

## Claves envueltas AUSENTES de en.js (verificadas)

- `'Publicar'` — ProductionView L233/235
- `'Elegir cuenta'` — Brandstorage/InfoPanel.mixin L156

(`'Volver'` y `'Guardar'` SÍ están en catálogo, pero donde se usan sin envolver no traducen igual.)

---

## Hallazgos móvil

**Chrome global OK:** viewport configurado; `navigation.css` tiene hamburguesa + drawer (`translateX(-100%)`→`0`) en `@media (max-width:768px)`. La nav sí colapsa en móvil.

**Concern de accesibilidad:** el viewport usa `maximum-scale=1.0, user-scalable=no` → bloquea el zoom de pinza (penalización WCAG; intencional para sensación app-like, pero anotado).

### Riesgos de overflow reales

| Vista | Problema | Severidad |
|---|---|---|
| `CreditsShopView` | Tablas `.credits-table` (4-5 col) **sin `overflow-x:auto`**; gráfico `.credits-chart-bars` de 30-90 columnas sin scroll → barras sub-pixel. `credits.css` solo tiene 1 media query. | ALTO |
| `OrganizationView` | `<table class="org-billing-table">` inline `width:100%`, sin regla CSS ni wrapper scroll → 5 columnas se desbordan en móvil. | MEDIO |
| `TasksView` (calendario `.cal2-*`) | Grid fijo de 7 columnas-día con `overflow:visible` (sin scroll horizontal); en ≤760px las columnas se aplastan a ~44px mientras los event cards quedan a 108px → contenido recortado. | MEDIO |

### Superficies fundamentalmente desktop-only (no usables en teléfono)

Vistas de canvas de nodos / drag-drop / edición con pincel — reflujo parcial pero el workflow núcleo asume ratón + pantalla ancha:

- `CommandCenterView` — canvas de nodos pan/zoom + biblioteca flotante. Solo 1 `@media` (afecta el panel, no el canvas). **No usable en móvil.**
- `StudioView` — editor de máscara con pincel/borrador, selector de imágenes drag, sidebars fijos. 2 `@media`. Desktop-first.
- `VideoView` — Director Console + storyboard + cinematografía. 10 `@media` (el más trabajado) pero igual desktop-first.
- `ProductionView` — la galería/historial es reflowable y aceptable en móvil; el modal de edición con máscara es desktop-first.

> Recomendación: tratar estas 3-4 vistas como desktop-only de forma explícita (mensaje "abre en escritorio" en pantallas estrechas) en vez de intentar hacerlas táctiles.

### Móvil OK (responsive verificado)

`SignInView`/`Verification`/`CambiarContrasena` (auth.css), `VeraView` (drawer + panel artefacto al 100% en ≤880px), `MonitoringView` (kanban colapsa 4→2→1), `ExecutionHistoryView`, `FlowCatalogView`, `DashboardView` shell (47 media queries en insight.css), `BrandOrganizationView`, `CharactersView`, `PlacesView`, `ProductsView`, `ProductsListView`, `ServicesView`, `BrandstorageView`, `CreationProcessView`, `PlanesView` (grid colapsa a 1fr).

**Patrón recurrente `max-width + margin:auto` en raíz:** presente en `planes.css` (duplicado, L8 y L356), `credits.css`, `services.css`, `products.css`, `cancel-page` — todos mitigados por padding móvil (no recortan activamente hoy), pero coinciden con la regresión histórica. Normalizar.

---

## Priorización sugerida

**P0 (i18n, alta visibilidad, EN roto):**
1. Navegación en inglés permanente (chrome global).
2. VeraView (vista insignia, 0 cobertura).
3. PlanesView (pricing, bug inverso).
4. OrganizationView (config completa).
5. Claves ausentes `Publicar` + `Elegir cuenta` (fix de 2 líneas en en.js).

**P0 (móvil):**
6. CreditsShopView tablas + gráfico sin scroll.

**P1:** StudioView/VideoView i18n (alto esfuerzo, pero desktop-first reduce urgencia); marcar canvases como desktop-only; tabla billing Organization; calendario Tasks.

**P2:** resto de gaps parciales (Products/Services/Places/FlowCatalog/Brandstorage), mixins de dashboard sin auditar, toasts pluralizados, fechas `es-ES` fijas, viewport `user-scalable=no`.
