# Examen del CSS — AI Smart Content

**Fecha:** 23 feb 2026  
**Objetivo:** Resumen del estado actual del CSS de la plataforma.

---

## 1. Estructura actual

| Elemento | Estado |
|----------|--------|
| **Único archivo** | `css/bundle.css` (~20.107 líneas, ~420 KB) |
| **Fuentes originales** | No existen: `css/legacy/` **no está en el repo**. El bundle se generó en su día y las fuentes se eliminaron (plan Fase 4). |
| **Script de build** | `scripts/build-css.sh` concatena desde `css/legacy/` → **el build actual fallaría** porque esa carpeta no existe. |
| **Carga en app** | `index.html` enlaza solo `/css/bundle.css` (+ Font Awesome y fuentes externas). |

---

## 2. Contenido del bundle (orden de bloques)

El bundle está generado por concatenación. Cada bloque viene de un archivo indicado en comentarios:

| # | Bloque | Líneas aprox. | Contenido principal |
|---|--------|----------------|---------------------|
| 1 | **base.css** | ~398 | `:root` (tokens globales), fondos, texto, acentos, tipografía, estados, sombras, z-index, nav/sidebar, reset/body |
| 2 | **app.css** | ~266 | SPA: keyframes (spin, viewFadeIn, fadeOut, slideIn/Out), estados de vista, loader, notificaciones |
| 3 | **navigation.css** | ~2.595 | Header, sidebar, toggle, menús, layout con/sin sidebar, overlays móvil |
| 4 | **landing.css** | ~550 | Landing: hero, secciones, botones auth |
| 5 | **signin.css** | ~423 | Sign-in / login público |
| 6 | **planes.css** | ~640 | Planes, suscripción, confirmación |
| 7 | **hogar.css** | ~491 | Hogar, selector de orgs, cards |
| 8 | **brands.css** | ~1.651 | Marcas, INFO expandido, editor de color |
| 9 | **campaigns.css** | ~64 | Campañas: grid, detalle |
| 10 | **audiences.css** | ~75 | Audiencias |
| 11 | **create.css** | ~185 | Crear: wizard, editor |
| 12 | **content.css** | ~118 | Contenido: grid, detalle |
| 13 | **settings.css** | ~153 | Ajustes, tabs |
| 14 | **living.css** | ~1.448 | Living: hero, historial, masonry, viewer |
| 15 | **studio.css** | ~417 | Studio: panel, footer, sidebar flujos |
| 16 | **flow-catalog.css** | ~467 | Catálogo de flujos |
| 17 | **products.css** | ~846 | Productos, galería, modal |
| 18 | **product-detail.css** | ~305 | Ficha producto |
| 19 | **form-record.css** | ~233 | Form registro org |
| 20 | **organization.css** | ~338 | Vista organización |
| 21 | **developer.css** | ~6.826 | Portal PaaS: dashboard, flujos, logs, test, webhooks, builder, lead |
| 22 | **payment-modal.css** | ~773 | Modal pago (Wompi, términos) |
| 23 | **login.css** | ~551 | Auth standalone |
| 24 | **style.css** | ~26 | Landing minimalista (respaldo) |

Además, dentro del bundle están los bloques añadidos a mano (no vienen de legacy):

- **Loader global** (base/loader): `.loader-overlay`, `.loader-line`, keyframes de gradiente y respiración.
- **Entrance sequence**: `.entrance-overlay`, `.entrance-animation`, reveal, transiciones.

---

## 3. Métricas rápidas

| Métrica | Valor |
|---------|--------|
| **:root** | 1 solo (correcto; fuente única en base) |
| **Variables CSS (--*)** | ~209 definiciones/uso en :root y bloques |
| **!important** | 56 usos (reducidos desde 234; los que quedan suelen ser overrides/portales) |
| **Colores hex (#xxxxxx)** | ~135 usos (resto ya migrado a variables) |
| **@keyframes** | 19 declaraciones; **`spin` repetido 3 veces** (app, products, login) — el último gana en cascada |
| **@media** | 79 bloques (responsive en nav, landing, living, developer, etc.) |

---

## 4. Puntos fuertes

- **Un solo :root** en base: paleta, espaciado, radios, z-index, tipografía, estados semánticos.
- **Variables semánticas** consistentes: `--text-primary`, `--bg-card`, `--color-success`, `--accent-cta`, etc.
- **Z-index escalonado** en :root (`--z-nav-*`, `--z-modal-*`, `--z-tooltip`, etc.).
- **Tema oscuro** unificado; colores planos sustituidos por variables en las fases previas.
- **Bundle único** en producción: una sola petición CSS.

---

## 5. Riesgos y mejoras sugeridas

| Aspecto | Detalle |
|----------|--------|
| **Build** | `build-css.sh` espera `css/legacy/`; no existe → no se puede regenerar el bundle sin restaurar o recrear esas fuentes. |
| **Keyframes duplicados** | `@keyframes spin` definido 3 veces; conviene dejar una sola definición (p. ej. en app.css) y eliminar las otras. |
| **Tamaño** | ~20k líneas / ~420 KB sin minificar; para producción se puede añadir un paso de minificado (cssnano o similar). |
| **Hex restantes** | ~135 colores hex; se pueden ir sustituyendo por variables donde tenga sentido (branding, estados). |
| **developer.css** | Casi 7k líneas en un solo bloque; si en el futuro se vuelve a tener fuentes por archivo, podría dividirse por vistas (dashboard, flows, logs, builder, etc.). |

---

## 6. Resumen

El CSS está **centralizado en un único bundle**, con **:root único** y **sistema de diseño definido** en base. La deuda principal es la **falta de fuentes originales** (`css/legacy/`), lo que impide regenerar el bundle con el script actual; cualquier cambio se hace **editando directamente `bundle.css`**. Para poder volver a un flujo “editar fuentes → build”, habría que recuperar o recrear los 24 archivos en `css/legacy/` (por ejemplo desde un backup o extrayendo bloques del bundle usando los comentarios `/* ========== ... ========== */`).
