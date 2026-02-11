# Revisión completa CSS - AI Smart Content

**Fecha:** 11 feb 2025  
**Archivos revisados:** 23 en `css/`

---

## 1. Resumen por archivo

| Archivo | Líneas aprox. | Rol | Dependencias |
|---------|----------------|-----|--------------|
| `base.css` | ~490 | Variables globales, reset, botones, cards, formularios, modales, animaciones | — |
| `app.css` | ~370 | SPA: #app-container, estados error/loading, notificaciones, focus, print | — |
| `style.css` | ~35 | Landing (importa base, poco uso) | base.css |
| `navigation.css` | ~1340 | Header, sidebar, menú, layout body.has-sidebar | base.css |
| `landing.css` | ~410 | Fondo, header/footer, auth buttons, login modal | — |
| `login.css` | ~430 | Auth standalone (auth-card, formularios, notificaciones) | base.css |
| `brands.css` | ~860 | Dashboard marcas: fondo, cards, INFO expandido, editor color | — |
| `hogar.css` | ~410 | Selector organizaciones, org-cards premium | — |
| `living.css` | ~800 | Living: hero, historial, masonry, highlights, modal viewer | — |
| `product-detail.css` | ~280 | Ficha producto: grid, galería, inputs | — |
| `products.css` | ~510 | Listado productos: header, tabs, gallery, modal nuevo producto | — |
| `flow-catalog.css` | ~325 | Catálogo flujos: hero carousel, rows, flow cards | — |
| `studio.css` | ~310 | Studio: layout, footer créditos, sidebar flujos/input_schema | base, navigation |
| `payment-modal.css` | ~455 | Modal pago Wompi, registro, términos | base.css |
| `organization.css` | ~70 | Vista organización: tabs, contenido | — |
| `settings.css` | ~115 | Ajustes: grid tabs + contenido, formularios | — |
| `content.css` | ~120 | Contenido: grid, detalle, filtros | — |
| `campaigns.css` | ~65 | Campañas: grid, detalle, tabs | — |
| `audiences.css` | ~75 | Audiencias: grid, detalle, secciones | — |
| `planes.css` | ~410 | Suscripción: formulario, planes, confirmación email | base.css |
| `create.css` | ~175 | Crear: modo selector, wizard, editor, templates | — |
| `form-record.css` | ~430 | Formulario registro: steps, multiselect, upload | base.css |
| `developer.css` | ~5700+ | Portal PaaS: dashboard, flujos, logs, test, webhooks, builder, etc. | — |

---

## 2. Problemas detectados

### 2.1 Variables no definidas o incoherentes

- **base.css**  
  - `a:hover { color: var(--primary-light); }` — **`--primary-light` no existe** en `:root`. Debería ser algo como `--accent-yellow-hover` o definir `--primary-light`.

- **planes.css**  
  - `box-shadow: var(--shadow-warm)` en `.btn-resend-email:hover` — **`--shadow-warm` no está en base.css**. En base solo está `--shadow-yellow`. Conviene usar `--shadow-yellow` o definir `--shadow-warm`.

### 2.2 Tema claro dentro de dark theme

- **landing.css** (notificaciones del modal de login)  
  - `.notification`, `.notification-message`: `background: #ffffff`, textos `#1e293b`, `#64748b`, botones negros. Rompen el dark theme cuando el modal de login usa tema oscuro.

- **landing.css** (botón cerrar)  
  - `.close-btn:hover, .modal-close:hover { background: #f1f5f9; color: #1e293b; }` — colores claros en una UI oscura.

- **login.css**  
  - `.input-container input` usa `background: white` y `color: var(--bg-black)`. En una pantalla de login “futurista” oscura, esos inputs quedan claros; puede ser intencional pero es inconsistente con el resto de la plataforma.

- **products.css**  
  - `.product-card-image { background: #F5F5F5; }`, `.no-image` con fondos y textos claros (#9CA3AF, #6B7280). El resto de la app es oscuro.

### 2.3 Duplicación de reglas (navigation.css)

- **.nav-overlay**: definido dos veces (líneas ~324 y ~1252): primero `display: none` siempre, luego en `@media (max-width: 768px)` se usa y más abajo de nuevo con `position: fixed; inset: 0;` y `.nav-overlay.active`. Debería unificarse en un solo bloque.

- **.nav-identity-section**, **.nav-identity-card**, **.nav-footer**, **.side-navigation**, **.nav-menu**, **.nav-link**: hay bloques repetidos o muy similares (p. ej. identidad al inicio y más abajo “SIDEBAR - IDENTIDAD Y ORGANIZACIÓN”). Conviene dejar una sola definición por componente.

- **.nav-section** repetido con el mismo contenido.

### 2.4 Duplicación de variables entre archivos

- Paletas cálidas repetidas con nombres distintos:
  - **brands.css**: `--brand-warm-1` … `--brand-warm-5`, `--brand-text-light`, `--brand-text-gold`
  - **living.css**: `--living-warm-1` … `--living-warm-5`, `--living-text-light`, `--living-text-gold`
  - **hogar.css**: usa `var(--living-bg-deep)` etc., está bien alineado con living.

Recomendación: unificar en `base.css` o en un único “theme warm” (p. ej. `--warm-1` … `--warm-5`) y que brands/living/hogar solo referencien.

### 2.5 payment-modal.css y form-record.css – acento distinto

- **payment-modal.css** usa `--primary-color` como color tipo amarillo/verde (D2FE3F, “lime”) en gradientes, badges y botones. En **base.css**, `--primary-color` es `#F2F3F5` (blanco). Riesgo de que en algunas pantallas el “primary” se vea blanco y en otras verde.

- **form-record.css** usa `--primary-color` y `--border-primary` con estilo “lime” (D2FE3F). Si esos archivos se cargan sin sobrescribir `:root`, heredan el blanco de base y el diseño puede cambiar.

Recomendación: en payment y form-record usar variables específicas (p. ej. `--payment-accent`, `--form-record-accent`) o un único “brand accent” en base y no reutilizar `--primary-color` para el amarillo/verde.

### 2.6 Imports y orden de carga

- Varios archivos hacen `@import url('base.css');`: style, landing, navigation, login, studio, payment-modal, form-record, planes.  
- Quien cargue primero (p. ej. en `index.html` o en el router) define qué base tienen el resto. Si luego se carga otro CSS que redefine `:root`, puede haber inconsistencias.  
- Recomendación: cargar **base.css** una sola vez en el HTML antes que el resto; en los demás CSS evitar redefinir variables globales salvo en contenedores concretos (p. ej. `.payment-modal { --payment-accent: ... }`).

### 2.7 Breakpoints

- Se usan 480, 768, 900, 968, 1024, 1200, 1400, 1600 sin una convención única. No es un error pero dificulta mantenimiento.  
- Recomendación: definir en base algo como `--bp-sm: 480px`, `--bp-md: 768px`, `--bp-lg: 1024px`, `--bp-xl: 1200px` y usar `@media (max-width: var(--bp-md))` (o los mismos valores fijos pero documentados en un solo sitio).

### 2.8 developer.css

- Archivo muy largo (~5700+ líneas). Tiene buena estructura por secciones pero es pesado para editar y depurar.  
- Recomendación: dividir por dominio: p. ej. `developer-dashboard.css`, `developer-flows.css`, `developer-builder.css`, `developer-common.css`, y cargarlos solo en rutas de desarrollador.

### 2.9 Accesibilidad y focus

- **app.css** define `*:focus-visible { outline: 2px solid var(--accent-yellow); outline-offset: 2px; }` — bien.  
- **base.css** hace `outline: none` en inputs en `:focus`. Para teclado es mejor usar `:focus-visible` y dejar outline solo en focus-visible, no en focus por ratón.

### 2.10 Z-index

- base.css define escalera (`--z-base` … `--z-tooltip`).  
- En varios sitios se usan valores sueltos (1000, 1001, 10000, 10001, etc.). Algunos modales/overlays usan 10000.  
- Recomendación: mapear modales/overlays a `--z-modal`, `--z-modal-backdrop` y usar esas variables para evitar “guerras” de z-index.

---

## 3. Aspectos positivos

- **base.css**: variables de diseño claras (colores, sombras, espaciado, bordes, z-index), reset y tipografía base consistentes.
- **Inputs**: decisión explícita de quitar transiciones/animaciones en inputs y contenteditable (por rendimiento) está documentada y aplicada.
- **Scrollbar** personalizada en base y en algunos módulos (living, products, brands) coherente con el tema.
- **Comentarios** por secciones en la mayoría de archivos.
- **Clases de utilidad** en app.css (`.hidden`, `.invisible`, `.no-pointer`) y `.sr-only` en base.
- **Tema oscuro** unificado en la mayoría de vistas (living, brands, hogar, organization, settings, content, campaigns, audiences, create, studio, developer) usando `--living-bg-deep`, `--bg-card`, etc.
- **Responsive** considerado en todos los archivos principales, con ajustes para 768px y a veces 480px.

---

## 4. Recomendaciones prioritarias

1. **Corregir** en base: definir `--primary-light` o cambiar `a:hover` a una variable existente.
2. **Corregir** en planes: usar `--shadow-yellow` o definir `--shadow-warm` en base.
3. **Unificar notificaciones y botones del modal de login** en landing/login para que respeten el dark theme (fondo y texto coherentes con `--bg-card` y `--text-primary`).
4. **Revisar** uso de `--primary-color` en payment-modal y form-record; usar variables de acento específicas y no redefinir el “primary” global.
5. **Limpiar navigation.css**: una sola definición de `.nav-overlay`, `.nav-identity-section`, `.nav-footer`, `.side-navigation`, `.nav-menu`, `.nav-link` y eliminar duplicados.
6. **Opcional**: unificar paleta cálida (brands/living) en base o en un `theme-warm.css` compartido.
7. **Opcional**: extraer módulos de developer.css y cargarlos bajo demanda.
8. **Opcional**: documentar breakpoints y z-index en base y usarlos de forma consistente.

Si quieres, el siguiente paso puede ser aplicar las correcciones 1–5 en los archivos concretos (con diffs por archivo).
