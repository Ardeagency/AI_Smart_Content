# Plan de consolidación CSS → base.css único

**Objetivo:** Pasar de 24 archivos CSS y 21 enlazados en `index.html` a **un único CSS priorizado** (`css/base.css`) para toda la plataforma, sin eliminar archivos hasta completar la migración.

**Fecha del análisis:** 23 feb 2025

---

## 1. Inventario de archivos CSS

| # | Archivo | Líneas | En index.html | @import | :root | Rol principal |
|---|---------|--------|---------------|--------|-------|----------------|
| 1 | **base.css** | 111 | ✅ | — | ✅ | Paleta, reset, tokens, body. **PRIORITARIO.** |
| 2 | app.css | 412 | ✅ | — | — | SPA: #app-container, estados, notificaciones, focus, print |
| 3 | landing.css | 550 | ✅ | — | — | Landing: fondo, header/footer, auth buttons |
| 4 | signin.css | 423 | ✅ | ✅ base | — | Sign-in / login público |
| 5 | planes.css | 640 | ✅ | ✅ base | — | Suscripción, formulario planes, confirmación email |
| 6 | navigation.css | 2739 | ✅ | ✅ base | ✅ | Header, sidebar, menú, layout body.has-sidebar |
| 7 | hogar.css | 491 | ✅ | — | — | Selector orgs, org-cards, home/hogar |
| 8 | brands.css | 1666 | ✅ | — | ✅ | Dashboard marcas, INFO expandido, editor color |
| 9 | campaigns.css | 64 | ✅ | — | — | Campañas: grid, detalle, tabs |
| 10 | audiences.css | 75 | ✅ | — | — | Audiencias: grid, detalle |
| 11 | create.css | 185 | ✅ | — | — | Crear: wizard, editor, templates |
| 12 | content.css | 118 | ✅ | — | — | Contenido: grid, detalle, filtros |
| 13 | settings.css | 153 | ✅ | — | — | Ajustes: tabs, formularios |
| 14 | living.css | 1476 | ✅ | — | ✅ | Living: hero, historial, masonry, modal viewer |
| 15 | studio.css | 418 | ✅ | ✅ base, nav | — | Studio: layout, footer, sidebar flujos |
| 16 | flow-catalog.css | 467 | ✅ | — | — | Catálogo flujos: hero, rows, flow cards |
| 17 | products.css | 846 | ✅ | — | — | Listado productos, gallery, modal nuevo |
| 18 | product-detail.css | 305 | ✅ | — | — | Ficha producto: grid, galería, inputs |
| 19 | form-record.css | 233 | ✅ | ✅ base | — | Form registro org: steps, multiselect, upload |
| 20 | organization.css | 338 | ✅ | — | — | Vista organización: tabs |
| 21 | developer.css | 6725 | ✅ | — | ✅ | Portal PaaS: dashboard, flujos, logs, test, webhooks, builder |
| 22 | payment-modal.css | 774 | ❌ | ✅ base | — | Modal pago Wompi, registro, términos |
| 23 | login.css | 583 | ❌ | ✅ base | ✅ | Auth standalone (auth-card, formularios) |
| 24 | style.css | 33 | ❌ | ✅ base | — | Landing minimalista (respaldo) |

**Total líneas (aprox.):** ~19.824  
**Cargados en index.html:** 21 archivos (falta payment-modal.css, login.css, style.css).

---

## 2. Dependencias y conflictos

### 2.1 Orden de carga actual (index.html)

```
base.css → app.css → landing → signin → planes → navigation → hogar → brands →
campaigns → audiences → create → content → settings → living → studio →
flow-catalog → products → product-detail → form-record → organization → developer.css
```

- **base.css** se carga primero y define `:root` global.
- Varios archivos hacen **@import url('base.css')**: studio, navigation, form-record, signin, planes, payment-modal, login, style. Eso puede provocar que base se evalúe dos veces en algunos contextos (cuando el navegador procesa el @import dentro de otro CSS).
- Quien **redefine :root** después pisa variables globales: **navigation.css**, **living.css**, **brands.css**, **developer.css**, **login.css**.

### 2.2 Archivos que redefinen `:root`

| Archivo | Variables que añade/sobrescribe |
|---------|---------------------------------|
| base.css | Paleta principal (--bg-*, --text-*, --accent-*, --shadow-*, tokens) |
| navigation.css | --nav-width, --nav-width-collapsed, --sidebar-*, --app-header-height |
| living.css | --living-warm-1..5, --living-text-*, --living-bg-*, --living-shadow-*, --living-spacing-* |
| brands.css | --brand-warm-1..5, --brand-text-* (misma paleta numérica que living) |
| developer.css | --dev-primary, --dev-bg-card, --dev-border, etc.; usa --living-bg-* |
| login.css | --bg-primary: var(--bg-primary) (redundante) |

**Riesgo:** living.css y brands.css definen la misma paleta cálida con nombres distintos (--living-warm-* vs --brand-warm-*). developer.css depende de --living-bg-deep, --living-bg-card (living.css). Si se cambia el orden o se fusiona mal, developer puede perder estilo.

### 2.3 Conflictos ya documentados (REVISION_CSS_PLATAFORMA.md)

- **--primary-color:** en base es texto/claro (#D4D1D8). En payment-modal.css y form-record.css se usa como acento “lime” (D2FE3F). Riesgo de que botones/acentos cambien según orden de carga.
- **--shadow-warm:** usada en planes.css, no definida en base (solo --shadow-yellow).
- **--primary-light:** referenciada en base (p. ej. en `a:hover`); ya está definida en base como alias.
- Duplicación de reglas en **navigation.css** (.nav-overlay, .nav-identity-section, etc.).
- Tema claro dentro de dark: landing (notificaciones, close button), login (inputs), products (product-card-image, .no-image).
- Z-index sueltos (10000, 10001) frente a escalera en base (--z-modal, --z-modal-backdrop).

### 2.4 CSS no enlazados en index.html

- **payment-modal.css:** el modal de pago (payment-modal.js) usa clases `.payment-modal`, `.payment-overlay`. Si el CSS no se carga, el modal puede verse roto. **Acción:** incluir en el bundle único o cargar condicionalmente cuando se abra el modal.
- **login.css:** ruta `/login` usa SignInView; en index se carga signin.css. Revisar si login.css es legacy o se usa en otra ruta.
- **style.css:** respaldo landing; muy pequeño. Puede fusionarse en landing o en base.

---

## 3. Mapa vista → CSS utilizado

| Vista / Ruta | Archivos CSS que la afectan |
|--------------|-----------------------------|
| / (Landing) | base, app, landing, signin, planes, navigation, hogar, brands, … (todos; solo landing + navigation visibles) |
| /login, /signin | signin.css, base, app, landing, navigation (oculto) |
| /planes | planes.css, base, app, … |
| /home, /hogar | hogar.css, navigation, living (variables), base, app |
| /org/:id/… (brand, products, etc.) | navigation, brands, products, product-detail, campaigns, audiences, content, create, settings, organization, base, app |
| /living | living.css, navigation, base, app |
| /studio, /studio/catalog | studio.css, flow-catalog.css, navigation, base, app |
| /dev/* | developer.css, navigation, base, app (developer usa --living-*) |
| Form registro org | form-record.css, base |
| Modal pago | payment-modal.css (no en index) |

Hoy **todas las hojas se cargan en todas las rutas**; no hay carga por ruta. Un único base.css unificado seguiría cargándose una vez en todas las rutas.

---

## 4. Plan de acciones (consolidación en base.css)

### Fase 0: Preparación — ✅ COMPLETADA (23 feb 2025)

1. ✅ **Variables globales documentadas** — nombres canónicos decididos: --warm-1..5 (canónicas), --living-warm-* / --brand-warm-* / --dev-* como aliases.

2. ✅ **Variables faltantes añadidas a base.css** — --shadow-warm, breakpoints (--bp-sm..2xl), variables de navegación (--nav-*, --sidebar-*, --app-header-height).

3. ✅ **Paleta cálida unificada** — :root de living.css, brands.css, developer.css, navigation.css y login.css eliminados; todas sus variables ahora viven en base.css :root.

4. ✅ **@import url('base.css') eliminados** — quitados de: studio, navigation, form-record, signin, planes, payment-modal, login, style. base.css se carga solo desde index.html.

### Fase 1: base.css como única fuente de verdad (variables + reset + global)

5. **Ampliar base.css por secciones (sin borrar archivos)**
   - Mantener en base.css: :root (paleta + tokens), reset mínimo, body, y opcionalmente utilidades (.sr-only, etc.).
   - Ir moviendo a base.css, en bloques comentados por origen:
     - **Desde app.css:** solo lo que sea realmente global (p. ej. #app-container mínimo, #navigation-container). Dejar en app.css lo que sea “comportamiento SPA” (animaciones view-enter, error-container, etc.) hasta Fase 2.
     - **Desde navigation.css:** ninguna regla aún; solo asegurar que las variables de nav estén en base.
   - Objetivo: que ningún otro archivo redefina `:root`; solo base.css define :root.

6. **Corregir conflictos de --primary-color y acentos**
   - En payment-modal.css y form-record.css: dejar de usar --primary-color para el verde/lime; usar variables locales (p. ej. --payment-accent, --form-record-accent) definidas en el propio archivo o en base como --accent-cta o similar.
   - Documentar en base.css que --primary-color es solo texto/principal, no acento de botón.

### Fase 2: Un solo archivo físico (opción A) o un solo bundle (opción B)

**Opción A – Un único base.css grande**

7. **Concatenar en orden en base.css**
   - Orden sugerido: base actual → app (global) → navigation → landing → signin → planes → hogar → brands → campaigns → audiences → create → content → settings → living → studio → flow-catalog → products → product-detail → form-record → organization → developer → payment-modal.
   - Cada bloque precedido de comentario `/* ========== DESDE app.css ========== */`, etc.
   - Eliminar duplicados (reset, body, :root repetidos); dejar un solo :root al inicio.
   - Quitar todos los `<link>` de CSS del index excepto base.css (y externos: Font Awesome, fuentes).

8. **Minificación y caché**
   - Generar base.min.css para producción (opcional) y servir con cache largo.
   - Mantener base.css como fuente; minificado como paso de build.

**Opción B – Un solo “bundle” generado por build**

7. Mismo orden de concatenación pero en un paso de build (script o herramienta) que genere `base.bundle.css` desde los 24 archivos, con base.css primero y sin @import.
8. index.html solo enlaza `base.bundle.css` (o base.min.css). Los archivos individuales se mantienen para edición; no se referencian en HTML.

### Fase 3: Limpieza posterior

9. **Eliminar duplicados dentro del único CSS**
   - navigation.css: unificar .nav-overlay, .nav-identity-section, etc., en una sola definición cada uno.
   - Revisar reglas repetidas en otros bloques.

10. **Tema oscuro consistente**
    - Revisar landing, login, products: sustituir fondos/textos claros (#ffffff, #1e293b, #F5F5F5, etc.) por variables de base (--bg-card, --text-primary, etc.) donde corresponda.

11. **Z-index**
    - Reemplazar valores sueltos (10000, 10001) por --z-modal, --z-modal-backdrop, etc., definidos en base.

12. **Archivos no enlazados**
    - Si payment-modal.css se incorpora al bundle, añadir su contenido al único CSS (o al build).
    - Decidir si login.css y style.css se fusionan en landing/signin o se eliminan una vez migrado.

### Fase 4: No eliminar hasta validar

- **No eliminar** los CSS actuales hasta que el único CSS (base.css o base.bundle.css) esté en producción y todas las rutas se hayan comprobado (Landing, Login, Planes, Hogar, Brands, Products, Living, Studio, Catálogo, Dev, Form registro, Modal pago).
- Dejar los archivos en el repo como referencia o moverlos a una carpeta `css/legacy/` o `docs/backup_css/` hasta cerrar la migración.

---

## 5. Orden recomendado de ejecución (resumen)

1. Fase 0: preparar base.css (variables faltantes, paleta unificada, quitar @import en otros).
2. Fase 1: base como única fuente de :root y variables; corregir --primary-color en payment/form-record.
3. Elegir Opción A (un archivo manual) u Opción B (bundle por build).
4. Fase 2: generar el único CSS (base.css ampliado o base.bundle.css) y dejar un solo `<link>` en index.html.
5. Fase 3: limpieza de duplicados, tema oscuro y z-index.
6. Fase 4: validar en todas las vistas; después archivar o eliminar el resto de CSS.

---

## 6. Riesgos y mitigación

| Riesgo | Mitigación |
|--------|------------|
| Regresiones visuales al fusionar | Hacer la fusión por fases; probar cada vista tras cada bloque incorporado. |
| Especificidad distinta al cambiar orden | Mantener el orden de bloques definido; usar nombres de clase únicos por vista (ya en gran parte así). |
| developer.css depende de --living-* | Definir --living-bg-deep, --living-bg-card, etc., en base.css (o al inicio del bloque “living” dentro del único archivo) antes del bloque developer. |
| Modal de pago sin estilos | Incluir payment-modal.css en el único CSS o cargarlo dinámicamente al abrir el modal hasta que esté en el bundle. |
| Tamaño del único CSS (~20k líneas) | Minificar en producción; considerar en el futuro code-splitting por ruta (avanzado). |

---

## 7. Referencias

- `docs/REVISION_CSS_PLATAFORMA.md` – Revisión previa y problemas detectados.
- `docs/DEUDA_TECNICA_THEME_GLOBAL_VS_HOGAR.md` – Hogar y theme global.
- `docs/ESTILO_PLATAFORMA_CSS.md` – Estilo y variables por componente.
- `index.html` – Listado actual de `<link rel="stylesheet">`.

Este plan no elimina ningún CSS; solo define los pasos para que **base.css** (o un bundle generado a partir de base) sea el **único CSS** de la plataforma y se priorice sobre el resto hasta completar la migración.
