# Análisis de redundancias en el CSS

**Fecha:** 25 feb 2025  
**Archivo analizado:** `css/bundle-v1.css` (legacy, ~20.355 líneas). **Bundle activo:** `css/bundle.css` (v2 unificado).  
**Objetivo:** Identificar estilos duplicados, redundantes e innecesarios para poder reducir el bundle y unificar criterios.

---

## 1. Resumen ejecutivo

| Categoría | Cantidad aproximada | Acción recomendada |
|-----------|---------------------|---------------------|
| **Modales / overlays** | **≥ 8 variantes** | Unificar en 1 sistema de modal (clases base + modificadores) |
| **Botones (hover/variantes)** | **≥ 15 variantes** además de `.btn-*` base | Unificar en `.btn`, `.btn-primary`, `.btn-secondary`, etc. y eliminar duplicados por vista |
| **Botón cerrar modal** | **≥ 6 definiciones** de `.modal-close` / `close-btn` | Una sola clase `.modal-close` (o `.btn-close`) |
| **Formularios** | **`.form-group` definido ≥ 6 veces** | Una sola definición en base; vistas solo ajustan margen si hace falta |
| **Animaciones modales** | **3 keyframes** muy similares (`modalSlideIn`, `livingViewerIn`, `fadeInUp`) | Un solo keyframe tipo `modalIn` y reutilizarlo |
| **Overlays** | Varios (loader, entrance, nav, campaign-drawer, featured-card, flow-card, image, login, hogar, new-product, org, dev-lead, color-editor, living-viewer) | Un patrón overlay + contenido; variantes por contexto con modificadores |

**Estimación:** Se pueden eliminar o consolidar del orden de **2.000–4.000 líneas** (10–20% del bundle) sin perder funcionalidad, unificando modales, botones, formularios y overlays.

---

## 2. Modales y ventanas emergentes

Hay **más de 8 sistemas de modal/overlay** con estilos repetidos:

| Origen / clase | Líneas aprox. | Comentario |
|----------------|---------------|------------|
| `.login-modal` + `.login-card` | ~3916–4010 | Modal login con su propio overlay y card |
| `.hogar-container .modal-overlay` / `.modal-content` / `.modal-header` / `.modal-close` / `.modal-body` | ~5430–5475 | Modal hogar: repite overlay, content, header, close, body |
| `.new-product-modal` + `.modal-overlay` / `.modal-content` / `.modal-header` / `.modal-close` / `.modal-body` | ~11277–11365 | Mismo patrón que hogar, con otro z-index y bordes |
| `.org-modal` + `.modal-content` / `.modal-header` / `.modal-close` | ~12215–12275 | Modal organización; otra vez overlay + content + header + close |
| `.modal` (developer) + `.modal-content` / `.modal-content.modal-lg` | ~13397–13497 | Modal genérico developer con variante lg |
| `#modals-portal .modal .modal-overlay` / `.modal-content` | ~16702–16725 | Portal de modales; redefinición de overlay y content |
| `.dev-lead-modal` + overlay, content, header, close, body, footer | ~16727–16806 | Modal “lead” con mismo patrón |
| `.living-viewer-modal` + `.living-viewer-backdrop` / `.living-viewer-container` | ~9315–9365 | Modal previsualización; nombres distintos pero misma idea |
| `.color-editor-modal` | ~6310–6330 | Modal editor de color (overlay + panel) |
| `.campaign-drawer-overlay` | ~7397–7410 | Drawer/overlay campañas |

**Patrón repetido en casi todos:**

- Overlay: `position: fixed` (o absolute dentro de contenedor), `inset: 0` o top/left/right/bottom 0, `background` oscuro, `z-index` alto.
- Content: centrado (flex o transform), `max-width`, `max-height: 90vh`, `background: var(--bg-card)`, `border`, `border-radius: var(--radius-md)`.
- Header: `display: flex`, `justify-content: space-between`, `padding`, `border-bottom`.
- Close: botón sin borde o con borde sutil, hover con cambio de color/fondo.
- Body: `padding`, `overflow-y: auto`.

**Recomendación:** Definir en **base.css** (o en un único `modals.css`) un sistema único:

- `.modal-overlay` (o `.modal-backdrop`) — una sola definición.
- `.modal-content` — una sola definición; variantes con `.modal-content--sm`, `.modal-content--lg`.
- `.modal-header`, `.modal-body`, `.modal-footer`, `.modal-close` — una sola vez.
- Los módulos (login, hogar, products, org, developer, living, campaigns, color-editor) **solo** usan esas clases y, si acaso, añaden **modificadores** (ej. `.modal--login .modal-content { max-width: 420px; }`).  
Con esto se eliminan **varios cientos de líneas** de definiciones duplicadas de modal.

---

## 3. Botones y hover

### 3.1 Botón base y variantes canónicas (base.css)

Ya existen: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-outline`, `.btn-icon`, tamaños `.btn-xs`, `.btn-sm`, `.btn-lg`, `.btn-xl`, `.btn-block`.

### 3.2 Redefiniciones y variantes duplicadas

- **`.btn-ghost`** definido de nuevo en **campaigns.css** (~7613–7615): mismo significado que base, con valores ligeramente distintos (`sidebar-hover` vs `white-8`). Debería usarse solo la de base.
- **`.btn-sm`** redefinido en campaigns (~7615): `padding: 0.35rem 0.65rem; font-size: 0.8125rem` — puede ser un modificador único en base si hace falta.
- **Signin:** `.signin-container .btn`, `.signin-container .btn-primary`, hover y disabled (~4403–4429) — se pueden reducir a usar las clases base y a lo sumo 1–2 reglas de contexto (ej. ancho o margen).
- **Hogar:** `.hogar-container .btn-primary`, `.hogar-container .btn-secondary` (~5506–5520) — mismo comentario.
- **Error actions:** `.error-actions .btn-primary`, `.btn-secondary` y hovers (~3655–3670) — redundante con base.
- **Settings:** `.settings-form .btn-primary` y estados (~8167–8186).
- **Form record:** `.form-record-container .btn`, `.btn-primary`, `.btn-secondary` y hovers (~11897–11943).
- **Products:** `.btn-add-product`, `.btn-image-action`, `.btn-order`, `.btn-remove-image`, `.btn-logout` con hovers (~10678–11256) — varios podrían ser `.btn-primary` / `.btn-secondary` / `.btn-ghost` + una clase de utilidad (ej. `.btn-add-product` solo para icono o texto).
- **Builder:** `.btn-builder-primary`, `.btn-builder-secondary`, `.btn-builder-icon`, `.btn-builder-danger`, `.btn-builder-footer` y muchas variantes (~13522–14031) — se puede mapear a `.btn-primary`, `.btn-secondary`, `.btn-icon`, `.btn-danger` + modificadores (ej. `.btn-builder-footer`) para layout, sin redefinir colores/hover.
- **Login / notification:** `.btn.btn-accent`, `.notification-btn` (~4146–4160) — unificar con `.btn-primary` o una sola variante “accent”.
- **Otros:** `.btn-resend-email`, `.btn-back-login`, `.btn-logout`, etc. — revisar si pueden ser `.btn-primary` / `.btn-secondary` / `.btn-ghost` con una clase de nombre (ej. `.btn-resend-email` solo para identificación en JS).

**Recomendación:** Mantener **una sola familia** de botones en base (`.btn` + variantes). En el resto de CSS:

- Quitar todas las redefiniciones de `.btn-ghost`, `.btn-sm`, `.btn-primary`, `.btn-secondary` que solo repiten hover/color.
- Sustituir estilos “custom” de botón por clases base + modificadores (tamaño, ancho) o por una sola clase semántica que solo ajuste lo mínimo (ej. icono, margen).

Con eso se eliminan fácilmente **varias decenas de reglas** y se evita que en el futuro se sigan duplicando estilos de botón.

---

## 4. Botón “cerrar” (modal-close / close-btn)

Definiciones encontradas:

- **login/signin:** `.close-btn, .modal-close` (~3977–3996) — base común.
- **hogar:** `.hogar-container .modal-close` (~5466).
- **products:** `.modal-close` y `.modal-close:hover` (~11341–11359) — distinto hover (bg-tertiary, error-color).
- **org:** `.org-modal .modal-close` y hover (~12255–12266).
- **dev-lead:** `.dev-lead-modal .modal-close` y hover (~16781–16792).
- **info-close-btn** (~6072–6089) — otro “cerrar” con estilo propio.

**Recomendación:** Una sola clase `.modal-close` (o `.btn-close`) en base con estilo neutro (transparente, hover sutil). Si un modal concreto necesita “cerrar en rojo”, usar un modificador (ej. `.modal-close--danger`). Eliminar las 5–6 redefiniciones por vista.

---

## 5. Formularios (form-group, form-input, form-label)

- **`.form-group`** aparece definido **al menos 6 veces**:
  - base.css (~494): `margin-bottom: var(--spacing-md)`.
  - login (~4006): `display: flex; flex-direction: column; gap: 0.5rem` (redefine y amplía).
  - planes (~5017): mismo `display: flex; flex-direction: column; gap`.
  - hogar (~5478): `margin-bottom: 1rem`.
  - settings (~8126): `margin-bottom: 1rem`.
  - products (~11010): de nuevo `display: flex; flex-direction: column; gap`.
  - org (~12060): `margin-bottom: 1rem`.
  - dev-lead (~16809): `margin-bottom: 16px`.
  - payment-modal (~19224): `margin-bottom: 1.25rem`.
  - login (otro bloque, ~19889): `margin-bottom: 20px`.

Una sola definición en base (incluyendo `display: flex`, `flex-direction: column`, `gap`) y, donde haga falta, solo override de `margin-bottom` en el contenedor (ej. `.settings-form .form-group { margin-bottom: 1rem; }`) reduciría muchas líneas.

- **`.form-label`** y **`.form-input`** se redefinen en login, org, dev-lead, payment-modal (padding, border, font-size). Lo ideal es que base sea la referencia y solo se sobrescriba en contenedores muy concretos (ej. `.login-card .form-input`) cuando sea necesario.

**Recomendación:** Un único bloque `.form-group`, `.form-label`, `.form-input`, `.form-select`, `.form-hint` en base; el resto solo ajustes de contexto (márgenes, max-width). Eliminación estimada: **~50–100 líneas** de duplicados de formulario.

---

## 6. Animaciones (keyframes)

Keyframes relacionados con aparición de modales/overlays:

- `modalSlideIn` (~3952): opacity + translateY + scale.
- `livingViewerIn` (~9361): opacity + scale.
- `fadeInUp` (~20268): seguramente muy similar.

**Recomendación:** Un solo keyframe, por ejemplo `modalIn`, con la misma idea (opacity 0→1, transform scale/translate suave). Todas las modales y notificaciones que usan `modalSlideIn` o `livingViewerIn` pueden usar `modalIn`. Esto ahorra pocas líneas pero unifica criterio y evita animaciones distintas para el mismo tipo de patrón.

---

## 7. Otros patrones repetidos

- **Border-radius:** ~100 usos de `border-radius: Npx` o `var(--radius-*)`. Revisar que no haya valores “sueltos” (ej. `8px` vs `var(--radius-sm)`) y unificar a variables.
- **Transiciones:** ~100 usos de `transition`. La mayoría deberían usar `var(--transition)` o `var(--transition-fast)`; eliminar transiciones inline repetidas.
- **Padding repetidos:** ~60 usos de `1.5rem`, `1.25rem`, `0.75rem` — donde sea posible, usar variables de espaciado (`--spacing-*`) para mantener consistencia y reducir “magic numbers”.
- **Cards:** Más de 111 referencias a `.card` / `.card-*`. Verificar que no haya cards “custom” que repitan exactamente el mismo estilo que `.card`, `.card-interactive`, `.card-elevated` de base.

---

## 8. Plan de acción sugerido (prioridad)

1. **Alta:** Unificar modales en un único sistema (clases base + modificadores) y eliminar las 8+ variantes. Mayor impacto en líneas y mantenibilidad.
2. **Alta:** Eliminar redefiniciones de `.modal-close` y usar una sola clase (o `.btn-close`) con modificadores si hace falta.
3. **Alta:** Consolidar `.form-group` (y form-label/input) en base y quitar las 6+ redefiniciones.
4. **Media:** Unificar botones: quitar `.btn-ghost`/`.btn-sm` duplicados y mapear botones “custom” a variantes base.
5. **Media:** Unificar animaciones de modal en un solo keyframe.
6. **Baja:** Revisar border-radius, transition y padding para usar variables y reducir redundancia.

---

## 9. Nota sobre el build

El comentario al inicio del bundle indica:

```text
NO editar manualmente; editar los archivos individuales
y regenerar con: bash scripts/build-css.sh
```

Por tanto, los cambios deben hacerse en los CSS fuente (base.css, navigation.css, signin.css, hogar.css, products, developer.css, etc.) y luego volver a ejecutar el script de build. Conviene hacer la unificación de modales y formularios en **base.css** (o en un archivo nuevo incluido en el build) y luego ir eliminando bloques duplicados de cada vista en sus respectivos `.css`.

---

## 10. Bundle v2 como bundle activo

**`css/bundle.css`** es ahora el bundle **activo** (estilo unificado v2). El antiguo bundle se guardó como **`css/bundle-v1.css`** (legacy/backup).

- **Design system al inicio de `bundle.css`:** un solo `:root`, dos estilos de botón (`.btn-primary` / `.btn-secondary`), un solo modal y un solo sistema de formularios.
- **index.html** sigue enlazando `/css/bundle.css`; no hace falta cambiar nada para usar el nuevo estilo.
- **Rollback:** si hubiera que volver al estilo anterior, renombrar `bundle.css` → `bundle-v2.css`, `bundle-v1.css` → `bundle.css`.
- **build-css.sh** genera `bundle-v1.css` (desde `css/legacy/`), no sobrescribe `bundle.css`.
- **Ajustes posteriores:** se añadieron al bundle activo (1) la secuencia de entrada completa (`.entrance-animation`, `.entrance-reveal-box`, `.entrance-logo`, etc.) que faltaba por haberse saltado el bloque de app.css al construir v2, y (2) todas las variables `:root` que usan developer, living y brands (aliases `--dev-*`, `--living-*`, `--brand-*`, opacidades, sombras, etc.) para que toda la plataforma mantenga el mismo estilo visual.

---

*Documento generado a partir del análisis del bundle legacy (ahora bundle-v1.css).*
