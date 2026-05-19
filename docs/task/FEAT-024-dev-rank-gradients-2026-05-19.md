# FEAT-024 — Gradientes por rango de developer

**Fecha:** 2026-05-19
**Equivalente a:** `OrgBrandTheme` (gradiente dinámico con colores de la org), pero la paleta es FIJA de la plataforma y la selección depende del rank del developer.

## 6 gradientes prefab (paleta fija Frame 83)

Definidos en `css/bundle.css :root`. Cada rank tiene horizontal (135°) + vertical (180°).

| Rank | Colores | Gradiente |
|---|---|---|
| **rookie** | verde lima → verde | `#9acc00 → #00d614` |
| **junior** | azul → cyan | `#0018ee → #00e7ff` |
| **builder** | rojo → naranja → amarillo | `#ff0000 → #ff6500 → #ffe500` (= brand-gradient-1) |
| **expert** | lima → verde → cyan | `#9acc00 → #00d614 → #00e7ff` (= brand-gradient-2) |
| **master** | azul → violeta → magenta | `#0018ee → #5b00ea → #900090` (= brand-gradient-3) |
| **legend** | toda la paleta | `#ff0000 → #ff6500 → #ffe500 → #9acc00 → #00d614 → #00e7ff → #0018ee → #5b00ea → #900090` (= brand-gradient) |

Sinónimos normalizados por `DevRankTheme.normalizeRank()`:
- `lead`, `admin` → `legend`
- `senior` → `master`
- `mid`, `intermediate` → `expert`
- `beginner` → `junior`
- desconocido → `rookie` (fallback seguro)

## Service: `js/services/DevRankTheme.js`

Análogo a `OrgBrandTheme`. API pública en `window.DevRankTheme`:

```js
applyDevRankTheme(userId?)   // lee profiles.dev_rank y setea --dev-gradient-dynamic
clearDevRankTheme()
applyRank(rank)              // preview manual sin BD (útil para admin de rangos)
normalizeRank(raw)
invalidate(userId)           // borra cache apiClient
```

Setea en `:root`:
- `--dev-gradient-dynamic` (horizontal)
- `--dev-gradient-dynamic-vertical` (vertical)
- `--dev-rank-label` (string entre comillas para usar en `content:`)

Y en `<body>`:
- Clase `dev-rank-context` (presente solo si se aplicó un rank)
- Clase `dev-rank-{rookie|junior|builder|expert|master|legend}` (granular)

Cache 10 min vía `apiClient` con `staleWhileRevalidate`. Invalidación manual disponible.

## Hook en router

`js/router.js` aplica/limpia el tema en cada cambio de ruta:

```js
if (window.DevRankTheme) {
  const isDev = path.startsWith('/dev');
  if (isDev && currentUserId && appliedUserId !== currentUserId) {
    window._devRankThemeAppliedUserId = currentUserId;
    window.DevRankTheme.applyDevRankTheme(currentUserId);
  } else if (!isDev) {
    window._devRankThemeAppliedUserId = null;
    window.DevRankTheme.clearDevRankTheme();
  }
}
```

Idempotente — solo dispara la primera vez que se entra a `/dev/*`.

## Aplicación visual en sidebar dev

`css/modules/navigation.css` — usa `var(--dev-gradient-dynamic, transparent)` en:

1. **Trazo bajo el título "DEVELOPER"** (`.nav-dev-workspace-header::after`)
   - 2px de altura, ancho 100% del header padding interno.
   - Equivalente al trazo arcoiris bajo el pill Vera (que usa `--brand-gradient-dynamic`).

2. **Badge de rank debajo del título** (`.nav-dev-title::after`)
   - Lee `var(--dev-rank-label)` con `content: var(...)`.
   - Texto coloreado con el gradient mediante `background-clip: text`.
   - 10px, uppercase, letterspaced 2px.

3. **Trazo bajo el primary pill activo** (`+ Flow` / `+ User`)
   - Aparece solo en `.active`.
   - 2px, color gradient del rank.

4. **Glow del logo Arde en el footer**
   - Borrón gaussiano (`filter: blur(6px)`) con el gradient del rank, opacity 0.18.
   - Premia visualmente la identidad del developer.

5. **Borde activo de menu items**
   - `.nav-link.active::before` ahora usa el gradient vertical del rank en vez del color de marca.

Todos los efectos son **defensivos**: si `--dev-gradient-dynamic` no está setado (usuario no developer o aún sin rank), los pseudos quedan `transparent` o `display:none` por el guard `body:not(.dev-rank-context)`.

## Colapsado

En modo colapsado del sidebar:
- Trazo y badge del header se ocultan (no caben).
- Glow del logo se mantiene (sigue visible).
- Trazo bajo primary pills se mantiene como acento (pero los pills ahora son 40×40 cuadrados).

## Casos límite

- **Usuario sin `dev_rank` ni `dev_role`** → fallback `rookie`.
- **Usuario `is_developer=false`** → `clearDevRankTheme()` ejecuta y el sidebar dev queda sin gradient (transparente).
- **Cambio de rank desde admin** → llamar `DevRankTheme.invalidate(userId)` para limpiar el cache.
- **Cambio de usuario en sesión activa** (raro) → el router detecta y re-aplica.

## Archivos tocados

```
+ js/services/DevRankTheme.js               (nuevo)
~ index.html                                 (carga DevRankTheme.js después de OrgBrandTheme)
~ js/router.js                               (hook análogo a OrgBrandTheme)
~ css/bundle.css                             (12 variables --dev-gradient-{rank}{,-vertical} en :root)
~ css/modules/navigation.css                 (uso del gradient en 5 puntos del sidebar dev)
```

## Cómo probar manualmente

En la consola del browser, en `/dev/*`:

```js
// Aplicar rank manualmente (sin BD)
DevRankTheme.applyRank('legend')   // todo el arcoíris
DevRankTheme.applyRank('rookie')   // verde-verde
DevRankTheme.applyRank('master')   // morados

// Lectura desde BD del current user
DevRankTheme.applyDevRankTheme()

// Limpiar
DevRankTheme.clearDevRankTheme()
```

## Próximos pasos (no incluidos)

- **CHECK constraint en `profiles.dev_rank`** que limite a los 6 valores canónicos (hoy es texto libre).
- **UI para que un Lead asigne ranks** en `/dev/lead/team` (vista de gestión de equipo).
- **Logros que suban de rank** automáticamente (ej. publicar 10 flujos → master) — sistema gamificado opcional.
- **Trazos dinámicos en el resto de vistas dev** (DevDashboardView, DevFlowsView headers) si se quiere más presencia visual.
