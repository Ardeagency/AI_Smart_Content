---
id: FEAT-028
title: Migrar modales custom (~20 archivos) a window.Modal
severity: medium
type: refactor
status: open
auto_eligible: no
auto_eligible_reason: requiere validacion visual y de a11y por modal migrado
est_duration: long
created: 2026-05-22
related: ROADMAP-POST-OPTIMIZATION-2026-05-12 (origen)
owner: -
---

# FEAT-028 · Migrar modales custom a window.Modal

## Sintoma / problema

Existen ~20 archivos con modales implementados a mano (HTML + listeners ad-hoc para esc/backdrop/focus-trap). Cada uno:
- Duplica logica de close/escape/focus-trap
- Tiene a11y inconsistente (algunos sin `role="dialog"`, sin `aria-modal`, sin focus-return)
- Estilos divergentes (`.modal`, `.popup`, `.overlay`, mezcla de tokens)

`window.Modal.show(...)` ya existe (ver usos en `InfoPanel.mixin.js:_promptShopDomain`) y centraliza:
- Backdrop close
- ESC handler
- Focus trap + focus return
- Tokens consistentes
- Body lock

## Acciones

1. **Auditar**: `grep -rln "modal\|popup\|overlay" js/views/ js/components/` y listar modales custom (debe dar ~20)
2. **Por archivo**:
   - Reemplazar HTML inline + listeners por `window.Modal.show({ title, body, actions, onClose })`
   - Migrar estilos especificos a tokens globales (eliminar `.local-modal-x`)
   - Validar a11y: tab navigation, esc cierra, focus vuelve al trigger
3. **Borrar CSS huerfano** una vez migrados todos

## Criterio de done

- 0 modales custom restantes (`grep` muestra solo `window.Modal.show` o componentes oficiales)
- Cada modal migrado validado a mano (esc, backdrop, focus-trap, tab order)
- CSS modular limpio sin reglas duplicadas

## Estrategia

- **NO migrar todo de un commit**. Por sesion 3-5 modales con su test visual.
- Empezar por los menos complejos (confirmation simples) → modales con form complejo al final.

## Out of scope

- Reescribir el componente `window.Modal` (asumir API estable)
- Modales de librerias externas (Stripe Elements, etc.)

## Progreso

- **2026-05-26** — Migrado el modal de borrar flujo en `DevFlowsView.js` (eliminado HTML
  estatico `#deleteFlowModal` + `setupDeleteModal()`; `showDeleteModal/hideDeleteModal/
  confirmDelete` ahora usan `window.Modal.show` con fallback a `confirm()` nativo).

- **2026-05-27 — Batch 1: familia dev-lead (3 modales).** Patron de migracion de
  menor riesgo: se mueve el HTML del form a un `_modalBodyHtml()`, se construye via
  `window.Modal.show` en el open, se guarda el `close` devuelto, y se cablean
  Cancel/Save dentro del modal dinamico. **Se mantienen los mismos IDs de campo**
  para NO tocar la logica de guardado.
  - `DevLeadOrgsView.js` — `#orgsModal` (form crear/editar org). openCreate/openEdit
    + `_openModal` + `_modalBodyHtml(showOwner)`; `saveOrg`/`setFormValues` intactos.
  - `DevLeadVeraKnowledgeView.js` — `#veraKnowledgeDetailModal` (detalle read-only).
    `openDetail` arma el body y llama Modal.show; `closeDetail` usa el close guardado.
  - `DevLeadInputSchemasView.js` — `#inputSchemaModal` (form ancho input schema).
    `_openModal('...')` muestra primero y luego puebla campos; `saveTemplate` intacto;
    eliminado `setupModalHandlers`.
  - **Pendiente validacion humana** de los 3: abrir cada modal, confirmar esc/backdrop/
    focus-trap, que el form guarde (crear+editar) y que Cancel cierre.

### Restantes por migrar (conteo `grep -rIc "modal-overlay"`)

Formularios de produccion (mayor riesgo, validar guardado): `products.js` (#newProduct),
`TasksView.js` (schedule), `MonitoringView.js` (mn-modal entity+watcher),
`DevLeadCategoriesView.js`, `DevWebhooksView.js`, `DevTestView.js`, `DevBuilderView.js`
(12 ocurrencias — multiple modales), `BrandstorageView.js`, `builder/BuilderModules.js`,
`builder/BuilderProductivity.js`, `builder/BuilderAdvanced.js`, `builder/BuilderEnterprise.js`,
`components/navigation/Settings.mixin.js`, `components/Navigation.js`.
Nota: varios de los "1-2 ocurrencias" son querySelector a un modal compartido o el panel
de versiones (slide-panel), no necesariamente un modal a migrar — inspeccionar antes.

> El criterio de done (0 modales custom + validacion visual por modal) sigue abierto:
> este task NO se cierra hasta migrar todos y validarlos en browser. La lista viva de
> "que probar" de los ya migrados esta en `PENDING-HUMAN-VERIFICATION.md` no aplica aun
> porque el task no esta completo; se consolidara ahi cuando se cierre.

## Referencias

- `js/utils/modal.js` (definicion `window.Modal`)
- Ejemplo de uso correcto: `InfoPanel.mixin.js:_promptShopDomain`
- Origen: `ROADMAP-POST-OPTIMIZATION-2026-05-12.md` item 2
