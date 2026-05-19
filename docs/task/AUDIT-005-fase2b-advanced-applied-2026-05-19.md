# AUDIT-005 — Fase 2B aplicada

**Fecha:** 2026-05-19
**Contexto:** Sigue al AUDIT-005-fase2a-productivity. Esta fase añade las capacidades "dev-killer" del Builder.

## Cambios

### 1. Module sandbox (probar UN módulo aislado)
- Botón `Probar módulo` en el modal de edición de cualquier nodo del grafo.
- Modal nuevo con:
  - Selector `test` / `prod` (auto-pre-selecciona el entorno con URL disponible).
  - Textarea con payload JSON editable (con validación `aria-invalid`).
  - Botón **Rellenar con defaults del schema** (construye `{ inputs: {...} }` a partir de `defaultValue` de cada campo).
  - Botón **Vaciar**.
  - Sección de resultado: status + duración (ms) + JSON pretty del response.
- Llama al webhook del módulo con metadata estándar (`test_mode: true, sandbox_mode: true, flow_id, flow_module_id, step_order, timestamp`).
- Si la respuesta es OK y el módulo no tiene `output_schema`, **infiere** uno desde el data (`inferOutputSchemaFromData` recursivo) y lo guarda en `mod._inferredOutputSchema` para que el picker de variables lo use sin guardar todavía. También auto-rellena el textarea de output schema del modal si está vacío, con notificación.

### 2. Variables picker `{{ $modulo.output.x }}`
- Botón `{` junto a los campos URL del modal del módulo.
- Modal flotante con search + lista filtrable.
- 2 fuentes:
  - **Inputs del formulario**: `{{ $input.<key> }}` por cada campo no-estructural del schema.
  - **Outputs de módulos previos**: `{{ $<nombre_normalizado>.output.<prop> }}` por cada propiedad del `output_schema` (o solo `{{ $modN.output }}` si no hay schema).
- Inserta el token en la posición del cursor del input destino, dispara `input` event para que se persista en state.
- Solo se ofrecen módulos con `step_order < beforeIndex` (no referenciar módulos posteriores).

### 3. Modal del módulo extendido (`moduleNodeModal`)
- `Siguiente módulo`: dropdown con todos los otros módulos del flujo. Default = "Auto (siguiente por orden)" → `next_module_id = null`. Eligiendo otro crea un salto.
- `Routing rules`: textarea JSON validado. Si está mal-formado, no guarda y muestra `aria-invalid`.
- `Output schema`: textarea JSON validado (habilita las variables `{{ $modulo.output.x }}` para módulos posteriores).
- `Requiere aprobación humana`: toggle. Mapea a `flow_modules.is_human_approval_required`.
- `Probar módulo`: lanza el sandbox.

### 4. Node-map enriquecido
- Cada nodo muestra badges contextuales:
  - **Salto** (`ph-arrow-bend-up-right` + número destino) cuando `next_module_id` no apunta al siguiente por orden.
  - **Routing** (`ph-git-branch`) cuando hay `routing_rules`.
  - **Aprobación** (`ph-hand`) cuando `is_human_approval_required`.
- La línea entre nodos se marca como `dashed + opacity 0.4` cuando el módulo salta al siguiente — pista visual de que el flujo no es lineal.

## Archivos tocados

```
js/app.js                                       — lazy loader incluye BuilderAdvanced.js
js/views/DevBuilderView.js                      — modal extendido + modal sandbox + modal variables
js/views/builder/BuilderModules.js              — open/save del modal con nuevos campos + badges
js/views/builder/BuilderAdvanced.js  (NUEVO)    — sandbox + variables picker
css/modules/developer.css                       — estilos para sandbox, variables, badges, edge skipped
```

## Verificación

- ✅ Sintaxis JS (todos los archivos pasan `new Function()`).
- ✅ Lazy loader incluye `BuilderAdvanced.js` después de `BuilderProductivity.js`.
- ✅ Sandbox usa `FlowWebhookService.executeWebhook` igual que el test global (mismo timeout, retries).
- ✅ Variables picker funciona sin output_schema (cae al fallback `$mod.output`).
- ✅ El save del modal de módulo valida JSON de `routing_rules` y `output_schema` con feedback `aria-invalid` (consistente con el patrón Fase 0).
- ✅ El `next_module_id` se persiste vía la RPC `replace_flow_modules` (Fase 1) que ya lo respeta.

## NO incluye (Fase 2C / 3 / 4)

- **Branching real con handles arrastrables**: el grafo sigue siendo una lista horizontal, solo con badges. Los handles drag-to-connect requieren reescribir el node-map con SVG arbitrario (libs como dagre / reactflow no aplican porque el proyecto es vanilla JS).
- **Renderer de `routing_rules` por UI**: hoy es un textarea JSON. Falta un mini-editor `if/then/else` visual.
- **Templates engine real** (`Mustache`/`Handlebars`) en el ai-engine: el Builder ya genera los tokens correctos, pero el ai-engine debe expandirlos al ejecutar. Si no, los webhooks reciben el token literal.
- **Autocompletado in-line** mientras tipeas `{{` en un input: hoy hay que clickear el botón `{`. Un popup contextual al detectar `{{` es Fase 2C.
- **Test cases guardados** (`flow_test_cases` table): existe en BD, falta cablear "Guardar este input como test case" desde el sandbox.

Estos quedan para Fase 2C cuando se priorice el reskin completo del grafo.
