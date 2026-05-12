---
id: BUG-007
title: Color picker duplicado en `input-registry.js` — mismos bugs que ya fixeamos en el mixin
severity: medium
type: tech-debt
status: open
auto_eligible: no
auto_eligible_reason: requiere decisión estructural (extraer a componente compartido vs duplicar fix)
est_duration: medium
created: 2026-05-12
owner: -
---

# BUG-007 · `input-registry.js:1201` duplica el color picker del mixin

## Síntoma

Existen **dos implementaciones del modal de color** que comparten clases CSS (`.color-editor-*`) pero código JS distinto:

1. `js/views/brand-mixins/ColorEditor.mixin.js` — usado por BrandstorageView / BrandOrganizationView. **Ya fue arreglado el 2026-05-12** (commit `a43df94`): orbit, pointer events, hex parser tolerante, ARIA + teclado.
2. `js/input-registry.js:1201` (`openColorPickerModal`) — usado por los pickers de color dentro de formularios genéricos (flows, prompts, etc.). **Sigue con los bugs originales del mixin pre-fix.**

## Bugs heredados en `input-registry.js`

Reproduce los mismos 6 bugs que arreglamos en el mixin:

| # | Línea aprox. | Bug |
|---|---|---|
| 1 | 1266–1315 | `mousedown`/`mousemove`/`mouseup` sin `pointerdown` → roto en touch (móvil/iPad/stylus) |
| 2 | 1207, 1234 | `hueHandle.style.transform = 'rotate(${h}deg)'` sobre el handle propio (no orbita) |
| 3 | 1290 | Click en SL bubblea al aro (sin `stopPropagation`) |
| 4 | 1319 | Hex input acepta solo `/^[A-F0-9]{6}$/` (sin shorthand `#abc`, sin `#`) |
| 5 | toda la fn | Sin `role="slider"`, sin `aria-valuenow`, sin teclado |
| 6 | 1202 | Default hardcoded `#6E3DE9` (morado random) si no llega initialHex |

## Plan recomendado (estructural, no parche)

Extraer un componente compartido y consumirlo desde ambos sitios:

**Opción A (preferida) — Promover el mixin a componente puro:**

1. Mover el cuerpo de `openColorEditor` del mixin a una factory pura:
   ```js
   // js/components/ColorPickerModal.js
   export function openColorPickerModal({ initialHex, onApply, container }) { ... }
   ```
2. Sin dependencias de `this.supabase` / `this.brandData` (esas viven en wrappers).
3. El mixin queda como wrapper fino que llama al componente y maneja persistencia (`createColor`/`updateColor`).
4. `input-registry.js` reemplaza su `openColorPickerModal` por una llamada al componente compartido.
5. Eliminar el código duplicado de `input-registry.js:1192-1330`.

**Opción B (parche rápido) — Copiar las correcciones:**

Aplicar uno por uno los mismos 6 fixes del commit `a43df94` a `input-registry.js`. Más rápido pero deja la duplicación viva → cualquier fix futuro tiene que hacerse 2 veces.

## Esfuerzo

- Opción A: ~1h (extracción + tests manuales en ambos sitios)
- Opción B: ~30 min (copy-paste de la lógica del mixin)

## Validación al cerrar

- Probar el picker en /flows (donde se renderiza desde `input-registry`) en desktop + móvil.
- Probar el picker en /brand-organization en desktop + móvil.
- Confirmar que ambos comparten el mismo bundle de CSS y el mismo comportamiento.
- Eliminar este archivo.
