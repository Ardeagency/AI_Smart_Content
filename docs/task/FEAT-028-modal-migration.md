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

- **2026-05-27 — 11 modales ad-hoc migrados (5 batches).** Patron de menor riesgo:
  el HTML del form se mueve a un body (mismos IDs de campo => logica de guardado
  intacta), se construye via `window.Modal.show` en el open, se guarda el `close`
  devuelto y se cablean Cancel/Save dentro del modal dinamico. Eliminado el HTML
  estatico + listeners ad-hoc de cada uno.
  - **Batch 1 (dev-lead):** `DevLeadOrgsView` #orgsModal, `DevLeadVeraKnowledgeView`
    #veraKnowledgeDetailModal (read-only), `DevLeadInputSchemasView` #inputSchemaModal.
  - **Batch 2 (produccion):** `products.js` #newProduct, `TasksView` taskEdit (schedule),
    `MonitoringView` mn-modal entity + watcher (2; se conservan clases mn-form/mn-btn).
  - **Batch 3:** `BrandstorageView` #brandPlaceModal + #brandEntityModal (2).
  - **Batch 4:** `DevLeadCategoriesView` #categoryModal + #subcategoryModal (2;
    cover upload preservado).
  - (Pre-existente 2026-05-26: `DevFlowsView` #deleteFlowModal.)
  - **Pendiente validacion humana** de los 11: abrir cada uno, confirmar esc/backdrop/
    focus-trap, que el form guarde (crear+editar) y que Cancel cierre.

### Diferidos con justificacion (NO migrar a ciegas)

Son modales que NO encajan en el patron de bajo riesgo y requieren sesion dedicada
CON validacion en browser:

- **Persistentes-toggle con estado interno** (se construyen una vez y se muestran/ocultan
  con `display`, con logica embebida): `DevWebhooksView` (#webhookModal con test-panel +
  flow-selector, #healthCheckModal, #deleteWebhookModal), `DevTestView` (#saveTestCaseModal,
  #runDetailModal, #expandResponseModal). Migrarlos = cambio de lifecycle (toggle ->
  create/destroy) + re-arquitectura del estado. Alto riesgo en tooling dev de 1300-2000 lineas.
- **`DevBuilderView`** (6+ modales: moduleNode, test, versions, sandbox, variables,
  commandPalette). Varios YA tienen `role="dialog"`/`aria-modal`. Command-palette y sandbox
  son UX no-estandar. Es el flow builder (herramienta core); requiere su propia sesion.
- **`Settings.mixin` #userSettingsModal** y **`Navigation` #notificationsModal**: persistentes,
  ya tienen role/aria-modal/ESC/overlay-close; son chrome global (alto blast radius). Solo
  les falta focus-trap. Ganancia marginal vs riesgo de refactor de lifecycle.
- **Paneles slide / no-dialogos:** `BuilderEnterprise` (panel de versiones), `BuilderProductivity`
  (command palette + issues panel), `BuilderAdvanced` (sandbox). No son modales-form.
- **Falso positivo:** `BuilderModules:322` es un `querySelector('.modal-overlay')` sobre un
  modal existente, no una definicion.

> Criterio de done (0 modales custom ad-hoc + validacion visual) — los 11 ad-hoc estan
> migrados; los diferidos arriba quedan documentados con su razon. Cuando se validen en
> browser, consolidar el "que probar" en `PENDING-HUMAN-VERIFICATION.md` y, si se decide
> cerrar el alcance a "solo ad-hoc", borrar este doc.

## Referencias

- `js/utils/modal.js` (definicion `window.Modal`)
- Ejemplo de uso correcto: `InfoPanel.mixin.js:_promptShopDomain`
- Origen: `ROADMAP-POST-OPTIMIZATION-2026-05-12.md` item 2
