# Plan de consolidacion CSS - base.css unico

**Objetivo:** Pasar de 24 archivos CSS y 21 enlazados en `index.html` a **un unico CSS priorizado** (`css/base.css`) para toda la plataforma, sin eliminar archivos hasta completar la migracion.

**Fecha del analisis:** 23 feb 2025

---

## 1. Inventario de archivos CSS

| # | Archivo | Lineas | En index.html | Rol principal |
|---|---------|--------|---------------|----------------|
| 1 | **base.css** | 195+ | SI | Paleta, reset, tokens, body, containers, utilidades. **PRIORITARIO.** |
| 2 | app.css | ~240 | SI | SPA: animaciones, estados vista, notificaciones |
| 3 | landing.css | 550 | SI | Landing: fondo, header/footer, auth buttons |
| 4 | signin.css | 423 | SI | Sign-in / login publico |
| 5 | planes.css | 640 | SI | Suscripcion, formulario planes, confirmacion email |
| 6 | navigation.css | 2717 | SI | Header, sidebar, menu, layout body.has-sidebar |
| 7 | hogar.css | 491 | SI | Selector orgs, org-cards, home/hogar |
| 8 | brands.css | 1652 | SI | Dashboard marcas, INFO expandido, editor color |
| 9 | campaigns.css | 64 | SI | Campannas: grid, detalle, tabs |
| 10 | audiences.css | 75 | SI | Audiencias: grid, detalle |
| 11 | create.css | 185 | SI | Crear: wizard, editor, templates |
| 12 | content.css | 118 | SI | Contenido: grid, detalle, filtros |
| 13 | settings.css | 153 | SI | Ajustes: tabs, formularios |
| 14 | living.css | 1450 | SI | Living: hero, historial, masonry, modal viewer |
| 15 | studio.css | 418 | SI | Studio: layout, footer, sidebar flujos |
| 16 | flow-catalog.css | 467 | SI | Catalogo flujos: hero, rows, flow cards |
| 17 | products.css | 846 | SI | Listado productos, gallery, modal nuevo |
| 18 | product-detail.css | 305 | SI | Ficha producto: grid, galeria, inputs |
| 19 | form-record.css | 233 | SI | Form registro org: steps, multiselect, upload |
| 20 | organization.css | 338 | SI | Vista organizacion: tabs |
| 21 | developer.css | 6706 | SI | Portal PaaS: dashboard, flujos, logs, test, webhooks, builder |
| 22 | payment-modal.css | 774 | NO | Modal pago Wompi, registro, terminos |
| 23 | login.css | 583 | NO | Auth standalone (auth-card, formularios) |
| 24 | style.css | 33 | NO | Landing minimalista (respaldo) |

---

## 2. Estado actual del sistema CSS

- **Un solo :root** en toda la plataforma (solo en `base.css`)
- **Cero @import** en todos los CSS
- **Cero var(--primary-color)** usado como acento de boton (corregido a --accent-cta)
- base.css se carga una sola vez desde `index.html` (primera posicion)

---

## 3. Plan de acciones (consolidacion en base.css)

### Fase 0: Preparacion -- COMPLETADA (23 feb 2025)

1. Variables globales documentadas -- nombres canonicos: --warm-1..5, --living-warm-*, --brand-warm-*, --dev-* como aliases.
2. Variables faltantes annadidas a base.css -- --shadow-warm, breakpoints (--bp-sm..2xl), nav/sidebar vars.
3. Paleta calida unificada -- :root eliminado de living, brands, developer, navigation, login.
4. @import url('base.css') eliminados de 8 archivos.

### Fase 1: base.css como unica fuente de verdad -- COMPLETADA (23 feb 2025)

5. Estilos globales movidos de app.css a base.css -- #app-container, #navigation-container, utilidades (.hidden, .invisible, .no-pointer, .sr-only), *:focus-visible, scrollbar, print. app.css reducido a solo SPA (animaciones, loading, notificaciones).
6. Conflictos --primary-color corregidos -- Nuevas vars: --accent-cta/hover/dark, --primary-dark. payment-modal.css (13 usos) y products.css (8 usos) migrados a --accent-cta.

### Fase 2: Bundle unico -- COMPLETADA (23 feb 2025)

**Opcion A -- Un unico base.css grande**

7. **Concatenar en orden en base.css**
   - Orden sugerido: base actual -> app -> navigation -> landing -> signin -> planes -> hogar -> brands -> campaigns -> audiences -> create -> content -> settings -> living -> studio -> flow-catalog -> products -> product-detail -> form-record -> organization -> developer -> payment-modal.
   - Cada bloque precedido de comentario `/* ========== DESDE app.css ========== */`, etc.
   - Eliminar duplicados (reset, body); dejar un solo :root al inicio.
   - Quitar todos los `<link>` de CSS del index excepto base.css (y externos: Font Awesome, fuentes).

8. **Minificacion y cache**
   - Generar base.min.css para produccion (opcional).
   - Mantener base.css como fuente; minificado como paso de build.

**Opcion B -- Un solo "bundle" generado por build**

7. Mismo orden de concatenacion pero en un paso de build que genere `base.bundle.css`.
8. index.html solo enlaza `base.bundle.css`. Los archivos individuales se mantienen para edicion.

### Fase 3: Limpieza posterior -- COMPLETADA (23 feb 2026)

9. **Duplicados eliminados en navigation.css** -- .nav-overlay (3→1), .nav-identity-section (2→1), .nav-identity-card (2→1), .nav-footer (3→2 contextuales), .side-navigation (2→1), .nav-menu (2→1), .nav-section exacto, .nav-dev-stat i exacto.
10. **Tema oscuro consistente** -- Colores claros (#ffffff, #1e293b, #64748b, #f1f5f9, white) reemplazados por var(--bg-card), var(--bg-hover), var(--bg-secondary), var(--text-primary), var(--text-secondary), var(--text-muted), var(--border-color) en landing.css, login.css, payment-modal.css, navigation.css.
11. **Z-index centralizado** -- Escala redefinida en base.css: --z-nav-overlay(800), --z-nav-sidebar(850), --z-sticky(999), --z-fixed(1000), --z-nav-mobile-overlay(1001), --z-nav-mobile-sidebar(1002), --z-modal-backdrop(10000), --z-modal(10001), --z-popover(10002), --z-notification(10000). Reemplazados en app.css, navigation.css, payment-modal.css, hogar.css, brands.css, developer.css, landing.css.
12. **Archivos no enlazados** -- payment-modal.css, login.css y style.css ya incluidos en bundle.css. Los 24 archivos individuales se mantienen para edicion; el bundle se regenera con build-css.sh.

### Fase 4: No eliminar hasta validar

- **No eliminar** los CSS actuales hasta que el unico CSS este en produccion y todas las rutas se hayan comprobado.
- Dejar los archivos en el repo como referencia o moverlos a `css/legacy/` hasta cerrar la migracion.

---

## 4. Riesgos y mitigacion

| Riesgo | Mitigacion |
|--------|------------|
| Regresiones visuales al fusionar | Hacer la fusion por fases; probar cada vista tras cada bloque incorporado. |
| Especificidad distinta al cambiar orden | Mantener el orden de bloques definido; usar nombres de clase unicos por vista. |
| developer.css depende de --living-* | Ya resuelto: --living-* definidas en base.css :root. |
| Modal de pago sin estilos | Incluir payment-modal.css en el unico CSS o cargarlo dinamicamente. |
| Tamanno del unico CSS (~20k lineas) | Minificar en produccion; considerar code-splitting por ruta (avanzado). |

---

## 5. Referencias

- `docs/REVISION_CSS_PLATAFORMA.md` -- Revision previa y problemas detectados.
- `docs/DEUDA_TECNICA_THEME_GLOBAL_VS_HOGAR.md` -- Hogar y theme global.
- `docs/ESTILO_PLATAFORMA_CSS.md` -- Estilo y variables por componente.
- `index.html` -- Listado actual de `<link rel="stylesheet">`.
