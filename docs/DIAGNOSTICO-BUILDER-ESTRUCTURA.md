# Diagnóstico: Estructura de la página Builder

**Vista:** `DevBuilderView.js` — ruta `/dev/builder`  
**Estilos:** `css/bundle.css` (bloques Builder ~12740–13400, 13620–13795, 14778–15030)  
**Fecha:** Marzo 2025

---

## ✅ Cambios aplicados (corrección de problemas)

### Ronda 1 (consistencia interna)
- **Padding unificado:** `.technical-tab-main` usa `var(--spacing-xl)` como el resto de tabs.
- **Variable única max-width:** `--builder-form-max-width`; `.builder-config-fullwidth` y `.builder-settings-form` la usan.
- **Espaciado en variables:** px sustituidos por `--spacing-*` en config, ficha, canvas, footer, sidebars, settings-section/field, inputs, flow-type-picker, technical-tab-main, etc.
- **Settings section acotada:** Estilos solo en `.builder-main .settings-section`; global `.settings-section` intacta para otras vistas.

### Ronda 2 (por qué seguías viendo todo igual — correcciones visuales)

La primera ronda **no tocaba** por qué “todo es negro” ni el ancho. Causas y cambios:

1. **Inputs sin bordes / todo negro**  
   En Builder, `--bg-primary` y `--bg-card` seguían siendo **#000** y los inputs usan `background: var(--bg-primary)`. Resultado: inputs negros sobre fondo negro, bordes #212126 casi invisibles.  
   - **Cambio:** En `#app-container:has(.builder-footer)` se definen `--builder-input-bg: var(--dev-bg-surface)` y `--builder-input-border: rgba(255,255,255,0.12)`. Dentro de Builder, `--bg-card` pasa a `var(--dev-bg-surface)` para dar superficie. Inputs, textareas y selects en `.builder-main` usan `--builder-input-bg` y `--builder-input-border`; mismo criterio para `.flow-url-input` y `.flow-type-picker`. Focus con borde cian y sombra suave.

2. **Sin jerarquía visual en Configuración**  
   El formulario era solo un grid sin contenedor visual.  
   - **Cambio:** `.builder-main .builder-settings-form.builder-config-grid` tiene ahora `background: var(--bg-card)`, borde, `border-radius` y padding (panel tipo card). Igual para `.builder-main .builder-settings-form.builder-config-fullwidth` en Módulos.

3. **Contenido empujado a la izquierda / espacio vacío a la derecha**  
   `--builder-form-max-width: 720px` limitaba el ancho y dejaba mucho hueco.  
   - **Cambio:** `--builder-form-max-width: min(100%, 1280px)` para que el formulario use el ancho disponible hasta 1280px.

4. **Canvas del tab Inputs**  
   Mismo problema de fondo negro.  
   - **Cambio:** `.builder-main .builder-canvas` usa `background: var(--bg-card)` y borde con `--builder-input-border`. Estados drag-active/drag-over con más contraste.

5. **Tab Inputs: 3 columnas y manual vs automatizado**  
   **Aplicado (ronda 3):**  
   - **Grid en modo automatizado:** Antes se usaban 2 columnas (`1fr 280px`) con 3 hijos en el DOM (componentes, canvas, propiedades), por lo que el tercer hijo pasaba a una segunda fila. Ahora se mantienen 3 columnas con la primera a ancho 0: `grid-template-columns: 0 1fr 280px`, de modo que el canvas y propiedades ocupan la fila correctamente.  
   - **Media queries:** Mismo criterio en 1200px (`0 1fr 240px`), 992px (`0 1fr`) y 768px (`1fr`).  
   - **Canvas estable:** `.builder-canvas-wrapper` con `min-width: 0` y `flex: 1 1 0` en tab Inputs para que la columna central no colapse.  
   - **Señal visual automatizado:** La clase `.builder-canvas--automated` se añade al canvas en flujos automatizados (borde sólido y tono cian) para distinguirlo del modo manual.

---

## Resumen ejecutivo

La página Builder sufre **inconsistencias claras** en:

1. **Unidades de espaciado** (mezcla de `rem`/variables y `px` fijos).
2. **Padding/margin** distintos entre tabs (Configuración vs Módulos vs Inputs vs Ficha).
3. **Contenedores y max-width** duplicados o contradictorios.
4. **Cards y secciones** con valores fijos en px frente al design system en rem.
5. **Inputs y formularios** con estilos coherentes pero anclados a valores fijos (16px, 10px, 12px).

El resultado es una interfaz que se siente **irregular** entre pestañas y que se desvía del sistema de diseño (variables `--spacing-*`, `--radius-*`).

---

## 1. Estructura general del Builder

```
#builderTabsHeader (.builder-tabs-header)     → pestañas
.builder-main (grid 260px 1fr 280px)          → contenedor principal
  ├── .builder-sidebar.builder-components     → panel izquierdo (componentes)
  ├── .builder-canvas-wrapper                 → área central (contenido por tab)
  │     └── .builder-tab-content               → cada tab (Settings, Technical, Inputs, Ficha)
  └── .builder-sidebar.builder-properties      → panel derecho (propiedades)
.builder-footer                                → mensaje + estado + acciones
```

- **Grid:** En tab “Inputs” activo: `260px 1fr 280px`. En otros tabs: `1fr`. En automated + Inputs: `1fr 280px`.  
- **Media queries:** 1200px → `220px 1fr 240px`; 992px → `200px 1fr` (oculta propiedades); 768px → `1fr` (oculta componentes).  
- No hay **padding** en `.builder-main` ni en `.builder-canvas-wrapper`; todo el “aire” depende del contenido de cada tab.

---

## 2. Paddings y márgenes por zona

### 2.1 Header de pestañas

| Elemento | Estilo | Valor |
|----------|--------|--------|
| `.builder-tabs-header` | padding | **no definido** (solo borde, fondo, z-index) |
| `.builder-tabs` | padding | `var(--spacing-md) var(--spacing-lg)` → 1rem 1.5rem |
| `.builder-tab` | padding | `var(--spacing-sm) var(--spacing-md)` → 0.5rem 1rem |

**Problema:** El header en sí no tiene padding; solo el contenedor interno `.builder-tabs`. Si se añaden más elementos al header, el espaciado puede ser inconsistente.

### 2.2 Contenido de tabs (área central)

| Tab | Contenedor que lleva padding | Valor | Observación |
|-----|------------------------------|--------|-------------|
| **Configuración** | `.builder-tab-content` | `var(--spacing-xl)` = **2rem** | Único padding del tab |
| **Módulos** | `.builder-tab-content.builder-tab-technical.active` | **padding: 0** | Se anula el padding del tab |
| **Módulos** | `.technical-tab-main` | `var(--spacing-lg, 20px)` = **1.5rem** | Padding real del contenido |
| **Inputs** | `.builder-tab-content` | `var(--spacing-xl)` = **2rem** | Mismo que Configuración |
| **Ficha** | `.builder-tab-content` | `var(--spacing-xl)` = **2rem** | Mismo que Configuración |

**Problemas:**

- **Inconsistencia entre tabs:** Configuración / Inputs / Ficha usan **2rem** de padding en el tab; Módulos usa **0** en el tab y **1.5rem** en `.technical-tab-main`. El “borde” del contenido no está alineado entre pestañas.
- Mezcla de **variable con fallback en px** (`var(--spacing-lg, 20px)`) en Technical; el resto usa solo variables.

### 2.3 Formulario de configuración (tab Configuración)

| Elemento | Estilo | Valor |
|----------|--------|--------|
| `.builder-config-grid` | gap (entre filas) | `var(--spacing-lg)` = 1.5rem |
| `.builder-config-row` | gap | `var(--spacing-md)` = 1rem |
| `.builder-config-cell--catalog` | padding-bottom | **6px** (fijo) |
| `.builder-config-grid .field-help.block` | margin-top | 0 |

**Problemas:**

- **6px** en `.builder-config-cell--catalog` rompe la escala del design system (debería ser algo como `var(--spacing-xs)` = 0.25rem = 4px o `var(--spacing-sm)` = 8px).

### 2.4 Secciones y cards (Módulos, Technical, Ficha)

| Elemento | Padding | Margin | Observación |
|----------|--------|--------|-------------|
| `.settings-section` (Builder) | **20px** | **margin-bottom: 20px** | Valores fijos, no variables |
| `.settings-section` (global, ~7200) | 1.5rem 1.75rem | — | Otra definición anterior; puede haber cascada |
| `.builder-sidebar-header` | **16px** | — | Fijo |
| `.builder-components-header` | **16px** + gap 12px | — | Mezcla 16px con gap en rem implícito |
| `.builder-panel-right-header` | `var(--spacing-md, 1rem) var(--spacing-lg, 1.25rem)` | — | Variables con fallback |
| `.builder-panel-right-body` | `var(--spacing-md, 1rem)` | — | Coherente con variables |
| `.ficha-body` | **20px** | — | Fijo |
| `.ficha-sidebar` | **16px** | — | Fijo |

**Problemas:**

- **Duplicación de `.settings-section`:** Una versión usa `--settings-card`, `--settings-radius`, padding en rem; la otra (Builder) usa `--dev-bg-card`, `--radius-md`, **20px** y **margin-bottom: 20px**. La que “gana” en Builder es la segunda; la primera puede afectar a otras vistas. Nomenclatura o alcance (scope) deberían dejar claro cuál aplica al Builder.
- Uso sistemático de **20px y 16px** en lugar de `var(--spacing-lg)` (1.5rem = 24px) y `var(--spacing-md)` (1rem = 16px). 20px no tiene equivalente directo en la escala actual (--spacing-lg = 24px en 16px base).

### 2.5 Canvas (tab Inputs)

| Elemento | Estilo | Valor |
|----------|--------|--------|
| `.builder-canvas` | min-height | 400px |
| `.builder-canvas` | border-radius | `var(--radius-md)` |
| `.canvas-empty-state` | padding | **60px 20px** (fijo) |
| `.canvas-empty-state i` | margin-bottom | **16px** |
| `.canvas-empty-state h4` | margin | 0 0 **8px** 0 |
| `.canvas-fields` | padding | **16px** (fijo) |
| `.canvas-field` | margin-bottom | **12px** |
| `.canvas-field-remove` | top/right | **8px** |

**Problemas:**

- Todo en **px** (60, 20, 16, 8, 12). Debería usarse la escala del design system (`--spacing-xl`, `--spacing-lg`, `--spacing-md`, `--spacing-sm`) para mantener consistencia y facilitar cambios globales.

### 2.6 Footer

| Elemento | Estilo | Valor |
|----------|--------|--------|
| `.builder-footer` | padding | `var(--spacing-md) var(--spacing-xl)` |
| `.builder-footer` | gap | `var(--spacing-md)` |
| `.builder-footer-actions` | gap | **8px** (fijo) |
| `.btn-builder-footer` | padding | `var(--spacing-sm) var(--spacing-md)` |

Solo el **gap de 8px** en acciones es fijo; el resto está en variables.

---

## 3. Contenedores y max-width

| Clase | max-width | Uso |
|-------|-----------|-----|
| `.builder-config-fullwidth` | **720px** | Tab Módulos: formulario ancho completo “controlado” |
| `.builder-settings-form` | **700px** | Definido más abajo en el CSS; aplica a **todos** los formularios del Builder que usen esta clase |

En el HTML:

- Tab **Configuración:** `builder-settings-form builder-config-grid` → no usa `builder-config-fullwidth`; el ancho efectivo lo da solo `.builder-settings-form` → **700px**.
- Tab **Módulos:** `builder-settings-form builder-config-fullwidth` → ambas clases; por cascada gana `.builder-settings-form` → **700px**, no 720px.

**Problemas:**

- **Contradicción 720 vs 700:** Dos definiciones de “ancho máximo” del formulario (720 en fullwidth, 700 en settings-form). El resultado real es siempre 700px donde se use `.builder-settings-form`.
- **.builder-config-grid** tiene `width: 100%; max-width: 100%` y no limita; el límite viene de `.builder-settings-form` cuando ambas van juntas. Poco claro qué responsabilidad tiene cada clase.

Recomendación: un solo concepto de “contenedor máximo del formulario” (una sola clase o variable) con un único valor (por ejemplo 720px o 700px) y usar variables CSS si se quiere cambiar en un solo sitio.

---

## 4. Inputs y campos de formulario

| Elemento | Estilo | Valor |
|----------|--------|--------|
| `.settings-field` | margin-bottom | **16px** (fijo) |
| `.settings-field label` | margin-bottom | **6px** (fijo) |
| `.settings-field input[type="text"]`, etc. | padding | **10px 12px** (fijo) |
| `.builder-components-search` | padding | **8px 12px 8px 36px** (fijo) |
| `.flow-url-input` | padding | **10px 12px** (duplicado respecto a .settings-field) |

**Problemas:**

- **16px, 6px, 10px, 12px, 8px** deberían mapearse a variables (`--spacing-md`, `--spacing-sm`, `--spacing-xs`) para alineación con el resto de la app y con el design system.
- Duplicación de estilos de input (`.settings-field input` vs `.flow-url-input`); conviene un único bloque base para inputs del Builder.

---

## 5. Cards y bordes

- **Canvas fields:** `.canvas-field` usa `var(--bg-card)`, `var(--border-color)`, `var(--radius-sm)` → coherente con variables.
- **Ficha:** `.ficha-card`, `.ficha-sidebar` usan `var(--bg-card)`, `var(--border-color)`, `var(--radius-md)` → coherente.
- **Settings section:** usa `var(--radius-md)`, pero padding/margin en **20px**.
- **.builder-canvas:** `border-radius: var(--radius-md)`; bordes en variables. Bien.

El problema no es tanto el uso de variables en cards como la **mezcla con px** en espaciado interno y entre bloques.

---

## 6. Resumen de problemas por categoría

### Paddings / margins

- Tab **Configuración / Inputs / Ficha:** padding del contenido = `var(--spacing-xl)` (2rem).  
- Tab **Módulos:** padding del contenido = 0 en el tab + `var(--spacing-lg)` en `.technical-tab-main` (1.5rem).  
- **Efecto:** El “inicio” del contenido no está alineado entre tabs; Módulos queda más pegado al borde que el resto.
- Uso excesivo de **px** (6, 8, 10, 12, 16, 20, 60) en lugar de `--spacing-*` o `--radius-*`.

### Contenedores

- **max-width** duplicado: 720px (builder-config-fullwidth) vs 700px (builder-settings-form); en la práctica siempre 700px donde se usa `.builder-settings-form`.
- Responsabilidad poco clara entre `.builder-config-grid`, `.builder-config-fullwidth` y `.builder-settings-form`.

### Cards y secciones

- **.settings-section** definida dos veces (global vs Builder); en Builder: padding y margin en **20px** en vez de variables.
- Sidebars y paneles: mezcla de **16px** fijos y `var(--spacing-md)` / `var(--spacing-lg)`.

### Inputs

- Estilos de input correctos en conjunto, pero con **10px 12px**, **6px**, **16px** fijos; y duplicación con `.flow-url-input`.

---

## 7. Recomendaciones prioritarias

1. **Unificar padding del área de contenido de todos los tabs**  
   Mismo valor (por ejemplo `var(--spacing-xl)`) tanto en `.builder-tab-content` como en el contenido interno del tab Módulos (p. ej. `.technical-tab-main`), o un único contenedor con clase común que lleve el padding en todos los tabs.

2. **Sustituir px por variables de espaciado**  
   - 6px → `var(--spacing-xs)` (4px) o definir `--spacing-2xs` si se quiere 6px.  
   - 8px → `var(--spacing-sm)`.  
   - 12px → `var(--spacing-md)` (16px) o `var(--spacing-sm)` (8px); definir escala si hace falta.  
   - 16px → `var(--spacing-md)`.  
   - 20px → `var(--spacing-lg)` (24px) o nueva variable si se quiere exactamente 20px.  
   - 60px → p. ej. `var(--spacing-2xl)` o `var(--spacing-3xl)` según la escala.

3. **Un solo max-width para formularios del Builder**  
   Una sola clase o variable (p. ej. `--builder-form-max-width: 720px`) y aplicarla en un único contenedor; eliminar la duplicación 720/700.

4. **Unificar o acotar `.settings-section`**  
   Una sola definición para el Builder (o una clase específica `.builder-settings-section`) con padding/margin en variables, y evitar que la versión “global” interfiera en dev/Builder si no aplica.

5. **Inputs: una base común**  
   Un bloque base para inputs del Builder (padding, border-radius, focus) y que `.flow-url-input` y el resto hereden o reutilicen esas variables/clases, sin duplicar valores en px.

6. **Documentar la estructura**  
   Dejar en comentarios o en un doc corto qué clase es la que da el “contenedor con padding” en cada tab (por ejemplo: “En todos los tabs el contenedor con padding es .builder-tab-content, salvo en Módulos donde es .technical-tab-main”) para evitar nuevos desajustes.

---

## 8. Archivos implicados

| Archivo | Qué revisar |
|---------|----------------|
| `css/bundle.css` | Bloques Builder (~12740–13400, 13620–13795, 14778–15030); `.settings-section` (líneas ~7200 y ~14784); `.builder-settings-form` y `.builder-config-fullwidth`. |
| `js/views/DevBuilderView.js` | Estructura HTML (clases en header, main, tabs, canvas, footer); no añadir nuevas clases de espaciado sin alinearlas con el design system. |

Con estos cambios, la página Builder quedaría alineada con una **escala de espaciado única**, **contenedores y max-width claros** y **comportamiento visual consistente** entre todas las pestañas.
