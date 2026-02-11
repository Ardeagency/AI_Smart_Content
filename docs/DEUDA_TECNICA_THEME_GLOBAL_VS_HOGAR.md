# Deuda técnica: theme-global.css vs Hogar (visibilidad)

## Objetivo
Hogar debe verse correctamente (sin pantalla negra) y no depender de `living.css` ni `brands.css`. Este documento describe el análisis del fallo y la **solución aplicada**.

---

## Estado actual — RESUELTO

**Hogar ya no depende de living.css ni brands.css.** Estilos en **base.css** (sección "HOGAR (HOME) VIEW"); no existe hogar.css.

### Causa de la pantalla negra (resuelta)
1. **Animación `.view-enter`**: empieza en `opacity: 0`; el contenedor podía quedar invisible.
2. **Dependencia de `body.has-header-only`**: la visibilidad forzada podía aplicarse tarde.

### Solución aplicada
- **base.css**: `#app-container:has(.hogar-container)` → `opacity: 1 !important; visibility: visible !important; animation: none !important;` (visibilidad en cuanto el DOM tiene la vista Hogar; se cancela la animación). Respaldo con `body.has-header-only`.
- **router.js**: En `/hogar` y `/home` no se añade la clase `view-enter` al contenedor, así no se ejecuta la animación.

**Próximos pasos:** Actualizar el resto de CSS y vistas; luego reducir a base.css, app.css, style.css.

---

## 1. Cómo funcionaba Hogar antes (sin theme-global) — y por qué se veía

### 1.1 Orden de carga CSS (index.html actual)
```
base.css → app.css → landing → login → planes → navigation → hogar.css → … → living.css → … → developer.css
```

### 1.2 Dependencias antiguas de Hogar (ya eliminadas)
- **hogar.css** definía variables locales que apuntaban a **--living-*** (living.css):
  - `--hogar-bg: var(--living-bg-deep, #0A0C0F)` etc.
- Esas variables **--living-*** estaban en **living.css** en `:root`.
- **base.css** define su propio `:root`; body y #app-container usan `var(--bg-primary)` y `var(--text-primary)`.

Resultado anterior: Hogar se veía porque living.css cargaba y aportaba `--living-*`. Al usar theme-global sin living, o con otro orden, podía fallar.

---

## 2. Qué hace theme-global.css (backup en docs/backup_css/)

### 2.1 Variables en :root
- Introduce nombres “nuevos”: `--bg-main`, `--text-primary`, `--border-color`, etc., y **alias** para compatibilidad:
  - `--bg-primary: var(--bg-main)`
  - `--living-bg-deep: var(--bg-main)`  ← **aquí está el conflicto potencial**
  - `--living-text-light: var(--text-primary)`
  - etc.

### 2.2 Reglas globales (no solo variables)
- `* { box-sizing: border-box }` (y bordes 2px en inputs, cards, etc.)
- **Iconos:** `.fas`, `.far`, `[class*="icon"]` → `width/height: 16px !important` y `display: inline-flex !important`
- **Header/Footer:** `[class*="header"]` → `min-height: var(--header-height); height: var(--header-height)` (60px)
- **Hover:** `a:hover`, `.card:hover`, `input:focus`, etc. → `filter: brightness(1.06)` o `1.08`
- **:focus-visible** → outline con `var(--text-muted)`

### 2.3 Base.css cuando existía theme-global (commit 5467163)
- base.css fue **recortado**: ya no define el bloque `:root` grande; solo reset y estilos estructurales.
- body sigue usando `var(--bg-primary)` y `var(--text-primary)`, que pasan a venir **solo** de theme-global.

---

## 3. Por qué Hogar podía quedar en negro CON theme-global

### 3.1 Cascada de variables
- theme-global (primero) define `--living-bg-deep: var(--bg-main)` → `#050505`.
- living.css (después) redefine `:root { --living-bg-deep: #0A0C0F }` → en principio gana y Hogar debería seguir con un fondo visible.
- Si por **orden de carga** (ej. living.css no cargaba en /home, o se cacheaba mal) solo aplicaba theme-global, entonces `--living-bg-deep` = `#050505` y el contenedor es casi negro. No explica por sí solo texto invisible.

### 3.2 Reglas globales que afectan a Hogar
- **`.hogar-header`** coincide con `[class*="header"]` en theme-global → se le fuerza `height: 60px`. Puede cambiar el layout pero no suele ocultar todo el contenido.
- **#app-container** en app.css tiene `transition: opacity 0.3s ease` y `will-change: opacity, transform`. Si el router o la vista aplican una clase tipo `view-enter` (opacity 0 al inicio) y algo falla, el contenedor puede quedarse en opacity 0 → **pantalla negra** aunque el DOM y los colores sean correctos.

### 3.3 Conclusión del fallo
La causa más plausible es la **combinación** de:
1. **Opacity/transición** en `#app-container` (y posible uso de `view-enter`), que puede dejar el contenido invisible.
2. **Dependencia de --living-***: si en algún escenario solo theme-global definía `--living-*` y los alias apuntan a `--bg-main` / `--text-primary`, fondo y texto podrían ser tan oscuros que se perciba “todo negro” si además había un problema de contraste o herencia.

---

## 4. Qué hay que resolver para volver a usar theme-global sin romper Hogar

### 4.1 Asegurar visibilidad del contenedor de Hogar
- En **app.css**: quitar o suavizar `transition` y `will-change` en `#app-container` para la ruta /home (o en general), para que no se quede en opacity 0.
- En **hogar.css** (o en un bloque al final de theme-global): forzar visibilidad cuando la página es “solo header” (Hogar):
  - Por ejemplo: `body.has-header-only .hogar-container { visibility: visible !important; opacity: 1 !important; }` y, si hace falta, `body.has-header-only #app-container { opacity: 1 !important; }`.

### 4.2 Hacer que Hogar no dependa del orden de carga de living.css
- **Opción A (recomendada):** En **theme-global.css**, definir los alias `--living-*` con los **mismos valores** que usa living.css para fondo y texto, no solo con `var(--bg-main)` / `var(--text-primary)`:
  - Por ejemplo: `--living-bg-deep: #0A0C0F;` y `--living-text-light: #E8DDD4;` (o variables que theme-global ya tenga con esos valores).
- Así, aunque living.css no cargue o cargue después, Hogar sigue teniendo fondo y texto visibles.

### 4.3 Protección de .hogar-header (aplicada)
- En **hogar.css**, `.hogar-header` tiene `min-height: unset; height: auto` para que la regla global `[class*="header"]` de theme-global (60px) no le aplique altura fija.

### 4.4 Checklist para reintroducir theme-global.css
- [x] Hogar usa solo variables de theme-global (con fallbacks).
- [x] .hogar-header protegido de `[class*="header"]`.
- [x] Tema global unificado en base.css (sin archivo theme-global.css).
- [ ] Probar /home y vistas.
- [ ] Actualizar el resto de CSS y vistas; luego reducir a base.css, app.css, style.css.

### 4.5 Parche y theme-global.css
El parche fue eliminado. theme-global.css fue fusionado en base.css y el archivo eliminado; la exclusión de .hogar-header está en base.css.

---

## 5. Resumen

| Aspecto | Antes (Hogar dependía de living) | Ahora (Hogar listo para theme-global) |
|--------|-----------------------------------|----------------------------------------|
| Variables en hogar.css | --living-* (living.css) | --bg-main, --text-primary, etc. (theme-global) con fallbacks |
| .hogar-header | Afectado por [class*="header"] 60px | min-height: unset; height: auto en hogar.css |
| Parche | theme-global-hogar-compat-patch.css | No necesario; solución en hogar.css |

**Estado:** Hogar resuelto: visibilidad forzada con `:has(.hogar-container)` y sin animación `view-enter` en /hogar y /home. Siguiente: actualizar Living y Brands para el nuevo estilo propio.
