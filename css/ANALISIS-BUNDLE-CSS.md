# Diagnóstico de css/bundle.css (post-limpieza)

**Archivo:** `css/bundle.css` (~18.658 líneas)  
**Fecha:** 26 Febrero 2026  
**Estado anterior:** ~20.288 líneas — se eliminaron **1.630 líneas** de código muerto

---

## Estructura actual (31 secciones)

| # | Sección | Línea inicio | Líneas aprox. |
|---|---------|-------------|---------------|
| 1 | Design System V2 — Tokens | 12 | 182 |
| 2 | Reset | 194 | 17 |
| 3 | Botones | 211 | 93 |
| 4 | Modal | 304 | 129 |
| 5 | Formularios | 433 | 62 |
| 6 | Cards | 495 | 18 |
| 7 | Badges | 513 | 17 |
| 8 | Utilidades | 530 | 12 |
| 9 | App Container | 542 | 26 |
| 10 | App — Transiciones, loader, notificaciones | 568 | 152 |
| 11 | navigation.css | 720 | 1.710 |
| 12 | landing.css | 3.358 | 509 |
| 13 | signin.css | 3.867 | 456 |
| 14 | brands.css | 4.323 | 1.843 |
| 15 | campaigns.css | 6.166 | 354 |
| 16 | audiences.css | 6.520 | 79 |
| 17 | create.css | 6.599 | 189 |
| 18 | content.css | 6.788 | 124 |
| 19 | settings.css | 6.912 | 157 |
| 20 | living.css | 7.069 | 1.573 |
| 21 | studio.css | 8.642 | 421 |
| 22 | flow-catalog.css | 9.063 | 550 |
| 23 | products.css | 9.613 | 800 |
| 24 | product-detail.css | 10.413 | 309 |
| 25 | organization.css | 10.722 | 339 |
| 26 | developer.css | 11.061 | 6.780 |
| 27 | payment-modal.css | 17.841 | 817 |

---

## Eliminado en esta limpieza ✅

| Sección eliminada | Líneas | Razón |
|-------------------|--------|-------|
| `planes.css` | ~686 | Ruta no registrada en router |
| `hogar.css` | ~316 | Ruta solo redirige a defaultView |
| `form-record.css` | ~109 | Página `form_org` eliminada |
| `login.css` | ~482 | Código muerto, reemplazada por `signin.css` |
| Variable `--planes-dark` | 1 | Sin uso |
| Layout hogar-específico | 4 | `.hogar-container` eliminado |
| Checkbox duplicado (login) | ~55 | Copia muerta; payment-modal scopeada |
| `.form-row` duplicados (2) | ~12 | Payment-modal y login redundantes |

---

## 1. Código muerto todavía presente

### 1.1 Bloque `login-modal` / `login-card` en landing.css (~265 líneas)
**Líneas:** ~3598–3863

Incluye: `.login-modal`, `.login-card`, `@keyframes modalSlideIn`, `.login-header`, `.login-form`, `.form-group` (duplicado global #2), `.login-card .form-input`, `.login-card .submit-btn`, `.submit-btn`, bloque "Notification Messages" (`.notification`, `.notification-message`, `.notification-title`, `.notification-text`, `.notification-btn`, `.btn-accent`), y responsive `.login-card`.

**Verificación:** Ninguno de estos selectores existe en HTML ni JS. El sistema de login actual usa `signin.css` con clases `.signin-*`.

**Excepción importante:** Dentro de este bloque, `.close-btn` y `.modal-close` (líneas 3660–3681) **SÍ se usan** en `payment-modal.js` y `CampaignsView.js`. Deben mantenerse o moverse.

**Acción:** Eliminar todo el bloque excepto `.close-btn` / `.modal-close` (moverlos al sistema base de modales).

### 1.2 Bloque `login-modal` en sistema base (Modal section)
**Líneas:** ~395–411

`.login-modal` aparece en la lista de modales del sistema base (`display: none; position: fixed`). Como `.login-modal` ya no se usa, su referencia aquí también es muerta.

**Acción:** Eliminar `.login-modal` del grupo de selectores.

---

## 2. Código duplicado

### 2.1 `.form-group` definido 4 veces como global
| Ubicación | Línea | Propiedades |
|-----------|-------|-------------|
| FORMULARIOS (base) | 434 | `margin-bottom: var(--spacing-md); display: flex; flex-direction: column; gap: 0.35rem` |
| landing.css (muerto) | 3689 | `display: flex; flex-direction: column; gap: 0.5rem` |
| flow-catalog.css | 10006 | `display: flex; flex-direction: column; gap: 0.5rem` |
| payment-modal.css | 18039 | `margin-bottom: 1.25rem` |

La definición base (línea 434) debería ser la única global. Las demás son sobrescrituras innecesarias o deberían estar scopeadas (`.payment-modal .form-group`, etc.).

**Acción:**
- Eliminar la de landing.css (está dentro del bloque muerto login-card)
- Evaluar si flow-catalog y payment-modal necesitan override o bastan con la base

### 2.2 `.form-group label` definido múltiples veces
- Línea 10012: global `.form-group label` (flow-catalog)
- Varias scoped (settings, org, dev-lead-modal) — estas están bien

**Acción:** La definición global en flow-catalog podría moverse a la base si aplica a todas las vistas.

---

## 3. Variables CSS

### 3.1 Alias redundantes en `:root`
```css
--success-color: var(--color-success);   /* 22 usos de --success-color */
--warning-color: var(--color-warning);   /* vs 41 usos de --color-* directo */
--error-color: var(--color-error);
--info-color: var(--color-info);
```

Dos nombres para lo mismo. Unificar a `--color-success` etc. eliminaría 4 variables y simplificaría 22 referencias.

**Prioridad:** Baja — funcional, solo mantenimiento.

---

## 4. Prefijos de vendor

**~100 apariciones** de `-webkit-`, `-moz-`, `-ms-`.

| Prefijo | Ejemplo | ¿Necesario? |
|---------|---------|-------------|
| `-webkit-backdrop-filter` | Glass effects | Sí (Safari) |
| `-webkit-font-smoothing` | Anti-aliasing | Sí |
| `-webkit-line-clamp` | Text truncation | Sí |
| `-webkit-box-orient` | Flexbox legacy | Sí (para line-clamp) |
| `-ms-overflow-style` | IE scrollbar | No (IE deprecated) |
| `-moz-*` varios | Firefox | Revisar caso por caso |

**Acción:** Eliminar prefijos `-ms-*` (IE ya no se soporta). Los `-webkit-` son mayormente necesarios.

---

## 5. `!important` — 64 usos

Distribuidos por:
- Navigation: overrides de sidebar collapse
- Brands: forzar estilos de background
- Developer: overrides de modales/formularios
- Utilidades generales

**Acción:** Revisión gradual — algunos son necesarios por especificidad de JS inline styles, otros podrían sustituirse por mejor cascada.

---

## 6. Valores "mágicos" de `border-radius`

**11 ocurrencias** de `border-radius: 8px` o `12px` hardcodeados, principalmente en `campaigns.css`:
- `campaigns.css`: 9 ocurrencias (8px y 12px)
- `developer.css`: 2 ocurrencias (8px, para split-buttons)

El design system define `--radius-sm` (4px), `--radius-md` (8px), `--radius-lg` (12px). Usar variables mejora consistencia.

**Acción:** Reemplazar `8px` → `var(--radius-md)`, `12px` → `var(--radius-lg)`.

---

## 7. Animaciones (@keyframes)

**12 keyframes** definidos, todos con al menos una referencia en CSS:

| Keyframe | Usado por | Estado |
|----------|-----------|--------|
| `modalIn` | `.modal-content` | ✅ Activo |
| `spin` | Spinners | ✅ Activo |
| `viewFadeIn` / `viewFadeOut` | View transitions | ✅ Activo |
| `loader-gradient-cycle` | Loader | ✅ Activo |
| `landing-fade-in` | Landing elements | ✅ Activo |
| `landing-fade-in-center` | Landing CTA | ✅ Activo |
| `modalSlideIn` | `.login-card` (muerto), `.notification` (muerto) | ❌ Muerto |
| `brands-card-fade-in` | Brand cards | ✅ Activo |
| `living-skeleton-shimmer` | Living skeleton | ✅ Activo |
| `livingViewerIn` | Living viewer | ✅ Activo |
| `product-view-spin` | Product detail | ✅ Activo |

**Acción:** Eliminar `modalSlideIn` junto con el bloque muerto de landing.css.

---

## 8. Media queries

**67 `@media` queries** repartidas por todo el archivo. La mayoría están correctamente scopeadas dentro de cada sección. Breakpoints utilizados:

| Breakpoint | Uso |
|-----------|-----|
| `1440px` | Navigation wide |
| `1200px` | Brands, products grid |
| `1024px` | Navigation collapse, general layout |
| `900px` | Campaigns, products |
| `768px` | Mobile-first general |
| `600px` | Form-row collapse |
| `480px` | Small mobile adjustments |

Sin inconsistencias notables.

---

## Resumen de prioridades pendientes

| Prioridad | Problema | Líneas recuperables | Acción |
|-----------|----------|--------------------:|--------|
| **Alta** | Bloque muerto login-modal/notification en landing.css | ~245 | Eliminar (mover `.close-btn`/`.modal-close` a base) |
| **Media** | `.form-group` global duplicado (3 extras) | ~15 | Consolidar a 1 definición base |
| **Media** | `.login-modal` en grupo base de modales | ~3 | Eliminar del grupo |
| **Baja** | Variables alias `--success-color` etc. | — | Unificar a `--color-*` |
| **Baja** | Valores mágicos `border-radius` | — | Usar variables del design system |
| **Baja** | Prefijos `-ms-*` innecesarios | ~5 | Eliminar |
| **Baja** | `!important` (64 usos) | — | Revisión gradual |

### Potencial de reducción adicional: ~265 líneas más

---

## Métricas comparativas

| Métrica | Antes | Después | Cambio |
|---------|------:|--------:|-------:|
| Líneas totales | 20.288 | 18.658 | **-8.0%** |
| Secciones | 31 | 27 | -4 |
| `!important` | 66 | 64 | -2 |
| Prefijos vendor | ~100 | ~100 | — |
| `.form-group` globales | 5 | 4 | -1 |
| `.form-row` globales | 4 | 1 | -3 |
| Checkbox duplicados | 2 | 1 (scopeado) | -1 |
| Keyframes muertos | 2 | 1 | -1 |
| Variables alias redundantes | 4 | 4 | — |
