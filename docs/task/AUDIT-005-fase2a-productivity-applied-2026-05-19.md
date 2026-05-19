# AUDIT-005 — Fase 2A productividad PaaS aplicada

**Fecha:** 2026-05-19
**Contexto:** Sigue al AUDIT-005-fase1-bd. Esta fase añade las 4 capacidades de "feel PaaS" más visibles para devs externos.

## Cambios

### 1. Auto-save (debounced 1.5s)
- Indicador en el footer (`#builderAutosaveIndicator`) con 4 estados: `Guardando…` / `Guardado` / `Guardado hace Ns/m` / `Error` / `Pausado (errores)`.
- Refresh del label cada 30s.
- Mutex (`_isAutoSaving`) evita carreras con saves manuales.
- **Pausa automática** si hay un input con `aria-invalid="true"` (no guarda JSON corrupto).
- Toast de "Flujo guardado correctamente" suprimido para autosaves (no spamea); saves manuales siguen mostrándolo.
- Solo activo cuando el flujo ya tiene `flowId` (no autosave para flujos sin nombre / sin primer save).
- Hook `Cmd/Ctrl+S` también dispara save manual.

### 2. Undo / Redo
- Stack `_historyStack` con cap **50** snapshots.
- Snapshot debounced **600ms** desde `onFieldChange` (no satura el stack con cada tecla).
- Hash barato del state para detectar no-ops (longitud + char-sum).
- Captura: `flowData`, `inputSchema`, `flowModules`, `uiLayoutConfig`, `flowTechnicalDetailsByModule`, `selectedFieldIndex`.
- **Truncar rama futura** al hacer cambio tras un undo (comportamiento estándar).
- Botones en footer (Ctrl+Z / Ctrl+Shift+Z o Ctrl+Y) con estado `disabled` cuando no hay más historia.
- No interfiere con undo nativo de inputs de texto enfocados.

### 3. Command Palette (Cmd/Ctrl+K)
- Modal con input + lista filtrable por label / key / type.
- Navegación con flechas, Enter selecciona, Esc cierra.
- Al elegir un campo: cambia a tab Inputs, pone `selectedFieldIndex`, renderiza panel de propiedades y hace `scrollIntoView`.
- Sin dependencia de la tab activa.

### 4. Panel Issues con validación en vivo
- Botón en footer con icono + label "Issues" + badge contador (rojo si errores, naranja si solo warnings).
- Recompute debounced **400ms** desde `onFieldChange`.
- Reglas implementadas:
  - **Errores:** key sin valor, key inválida (no inicia con letra/`_`), key duplicada, flujo sin nombre, URL prod/test inválida en módulo, módulo manual con webhook sin URL.
  - **Warnings:** campo sin label (no-estructural), dropdown/radio/checkboxes sin opciones, opciones vacías, módulo sin nombre, flujo manual sin campos.
- Cada issue tiene botón "Ir →" que salta al campo/módulo problemático.

### 5. Hooks compartidos
- `P.onStateMutated()` invocado desde `BuilderInputs.onFieldChange` → snapshot + recompute issues + schedule autosave.
- `P.destroy` override: limpia timers (`_autosaveTimer`, `_snapshotTimer`, `_issuesTimer`, `_autosaveRefreshTimer`).
- `P.showNotification` wrap: suprime el toast de save success durante autosave.

## Archivos tocados

```
js/app.js                                         — lazy loader carga BuilderProductivity.js
js/views/DevBuilderView.js                        — footer: indicador + botones undo/redo/issues, modales palette/issues, hook initProductivity()
js/views/builder/BuilderInputs.js                 — onFieldChange invoca onStateMutated()
js/views/builder/BuilderProductivity.js  (NUEVO)  — toda la lógica del mixin
css/modules/developer.css                         — estilos para los 4 componentes
```

## Verificación

- ✅ Sintaxis JS (todos los archivos pasan `new Function()`).
- ✅ Lazy loader incluye el nuevo mixin después de DevBuilderView.
- ✅ Mixin solo se inicializa si `DevBuilderView` está definido (defensa).
- ✅ Footer mantiene compatibilidad con flujos existentes (`#flowStatusBadge` y `#builderFooterActions` intactos).
- ✅ Modales nuevos usan el mismo patrón que los existentes (`hidden` attr + `style.display='flex'` al abrir).

## Cosas que NO hace todavía (Fase 2B / Fase 3)

- Module sandbox (dry-run de UN módulo con input dado, sin cadena completa).
- Variables `{{ $modulo.output.x }}` con autocompletado tipo JSONPath.
- Grafo con branching real (handles arrastrables nodo↔nodo, editor visual de `routing_rules`).
- Versionado real (`flow_revisions` table + diff + rollback).
- Audit log de cambios (`user_audit_log`).
- Roles granulares (`flow_collaborators` cableado al Builder).
- Lock optimista (heartbeat por usuario).
- Cost estimator.
- Webhook health check + signature HMAC.
- Import bundle completo.
- Plantillas de flujo.

Estas son Fase 2B (UX) y Fase 4 (colaboración/telemetría) del plan original.
