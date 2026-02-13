# Revisión: renderizado de objetos "inputs"

Documento de revisión del flujo de renderizado de los inputs en el sistema de creación de formularios (Builder, Studio, Test, Preview).

---

## 1. Arquitectura general

- **Fuente de verdad del tipo:** `field.input_type` o `field.type` (resuelto en `input-registry.js` → `getInputType()`).
- **Renderizado central:** `js/input-registry.js` expone:
  - **`renderPreview(field)`** → HTML del control en modo solo lectura (canvas del Builder).
  - **`renderFormField(field, opts)`** → HTML del control editable (sin wrapper).
  - **`renderFormFieldWithWrapper(field, opts)`** → Control + wrapper + label opcional + helper opcional (una sola llamada para formularios).
  - **`isStructural(field)`** / **`hasOwnLabel(field)`** → Utilidades para no duplicar lógica en vistas.

Las vistas de **formulario** (Studio, Builder Preview/Test, DevTestView) usan **`renderFormFieldWithWrapper`**; solo el canvas del Builder usa `renderPreview`. Fallback manual solo cuando `InputRegistry` no está cargado.

---

## 2. Dónde se usa cada uno

| Lugar | Función | Uso |
|-------|---------|-----|
| **Builder – Canvas (tab Inputs)** | `InputRegistry.renderPreview(field)` | Cada campo en el canvas: solo el control (disabled). El label/tipo/required van en el header del `.canvas-field`. |
| **Builder – Modal Preview** | `InputRegistry.renderFormFieldWithWrapper(field, { idPrefix: 'preview_', wrapperClass: 'preview-field ' + widthClass, showLabel, showHelper, showRequired, helperClass: 'helper-text' })` | Formulario de vista previa con una sola llamada. |
| **Builder – Modal Test** | `InputRegistry.renderFormFieldWithWrapper(field, { idPrefix: 'test_', wrapperClass: 'test-field', showLabel, showHelper, showRequired })` | Formulario de prueba; estructurales devuelven `''`. |
| **Studio** | `InputRegistry.renderFormFieldWithWrapper(fieldNorm, { idPrefix: 'studio-', wrapperClass: 'studio-field', showLabel, showHelper, showRequired })` | Formulario del flujo; incluye descripción (helper). Checkbox/switch no duplican label (hasOwnLabel). |
| **DevTestView** | `InputRegistry.renderFormFieldWithWrapper(field, { idPrefix: 'input_', wrapperClass: 'form-field', showLabel, showHelper, showRequired })` | Formulario de prueba en vista Dev Test. |

---

## 3. Flujo detallado por contexto

### 3.1 Canvas del Builder (tab Inputs)

- **Método:** `DevBuilderView.renderCanvasField(field, index)` → dentro llama a `renderInputPreview(field)`.
- **Preview:** `renderInputPreview` usa `InputRegistry.renderPreview(field)`; si no hay Registry, devuelve un `<input type="text" class="preview-input" disabled>` genérico.
- **Estructura del bloque:**
  - `.canvas-field` (con header: label, tipo, required, acciones).
  - `.canvas-field-preview` → aquí va **solo** el HTML del control (preview).
- El Registry devuelve controles **disabled** en preview (atributo `disabled` en inputs/select/textarea).

### 3.2 Modal Preview del Builder

- **Método:** `DevBuilderView.generateFormPreview()`.
- **Render:** Una llamada a `InputRegistry.renderFormFieldWithWrapper(field, { idPrefix: 'preview_', wrapperClass: 'preview-field ' + widthClass, showLabel: showLabels, showHelper: showHelperText, showRequired: true, disabled: false, helperClass: 'helper-text' })`.
- Estructurales devuelven `''` desde el Registry (sin bloque en el HTML).

### 3.3 Modal Test del Builder

- **Método:** `DevBuilderView.generateTestForm()`.
- **Render:** `InputRegistry.renderFormFieldWithWrapper(field, { idPrefix: 'test_', wrapperClass: 'test-field', showLabel, showHelper, showRequired })` por cada campo. Los estructurales devuelven `''`. Fallback: filtro por tipo y HTML manual si no hay Registry.

### 3.4 Studio

- **Método:** `StudioView.renderFormField(field)`.
- **Normalización:** `fieldNorm = { ...field, key: name, required }` con `name = field.name || field.key || field.id || 'field'`.
- **Render:** `InputRegistry.renderFormFieldWithWrapper(fieldNorm, { idPrefix: 'studio-', wrapperClass: 'studio-field', showLabel: true, showHelper: true, showRequired: true })`. Checkbox/switch no reciben label externo (el Registry usa `hasOwnLabel`). Se muestra `field.description` como helper.

### 3.5 DevTestView (página Probar)

- **Método:** `DevTestView.renderInputField(field)`.
- **Render:** `InputRegistry.renderFormFieldWithWrapper(field, { idPrefix: 'input_', wrapperClass: 'form-field', showLabel, showHelper, showRequired })`.
- **Fallback:** Si no hay Registry, `switch` por tipo (text, textarea, select, number, checkbox, radio, range) y HTML manual.
- Estructurales devuelven `''`.

---

## 4. Contrato del Input Registry

- **renderPreview(field):**
  - Recibe: objeto con al menos `input_type` o `type`, y según tipo: `placeholder`, `options`, `rows`, `min`, `max`, `defaultValue`, `label`, `key`.
  - Devuelve: string HTML de **un solo elemento** (input, textarea, select o div con contenido), siempre **disabled** en preview.
  - No incluye label ni contenedor; eso lo pone la vista.

- **renderFormField(field, opts):**
  - **opts:** `idPrefix`, `namePrefix`, `disabled`, `required` (override). Algunas vistas pasan `mode` (solo informativo, el Registry no lo usa hoy).
  - Devuelve: string HTML del **control** (input/textarea/select/label+input para checkbox/switch/radio). Incluye `id` y `name` según `opts` y `field.key`.
  - No incluye wrapper ni label externo ni helper; eso lo pone la vista.
  - Para tipos estructurales devuelve `''`.

- **Identificación:** El `id` del control es `(opts.idPrefix || '') + (field.key || 'field')`. Las vistas que ponen `<label for="...">` deben usar ese mismo id (por ejemplo `studio-${name}` con `name === field.key`).

---

## 5. Posibles inconsistencias o mejoras

1. **Checkbox / Switch en Studio:**  
   El Registry ya devuelve un `<label class="checkbox-label">` (o switch) que envuelve el input. Studio además envuelve todo en `<label for="studio-...">`. Funciona, pero se muestra el label dos veces (uno del wrapper de Studio y otro dentro del HTML del Registry). Valorar mostrar solo uno en tipos checkbox/switch.

2. **Helper/description:**  
   Studio no muestra `field.description`; DevTestView y Builder Test sí. Si se quiere UX uniforme, se podría añadir el mismo bloque de ayuda en Studio.

3. **Fallback sin InputRegistry:**  
   DevBuilderView (preview/test), StudioView y DevTestView tienen fallback. Si el script del Registry siempre se carga antes, el fallback es defensivo; si no, el orden de carga debe garantizar que `InputRegistry` exista antes de renderizar formularios.

4. **Prefijos de id:**  
   - Builder Preview no pasa `idPrefix` → el control queda con `id = key` (sin prefijo).  
   - Builder Test usa `test_`, Studio usa `studio-`, DevTest usa `input_`. Está bien para no colisionar entre vistas.

5. **Campo `type` vs `input_type`:**  
   El Registry unifica con `getInputType(field)` (usa `input_type` o `type`). Las vistas que filtran estructurales usan a veces `field.type`, otras `field.input_type`; conviene usar la misma convención (p. ej. siempre leer `field.input_type || field.type`) para no dejar de filtrar un estructural si solo viene `type`.

---

## 6. Resumen de archivos implicados

| Archivo | Responsabilidad |
|---------|------------------|
| `js/input-registry.js` | Tipos, `renderPreview`, `renderFormField`, `wrapFormField`, `renderFormFieldWithWrapper`, `isStructural`, `hasOwnLabel`, `getInputType`, `getPropertyFamily`, `getDefaultTemplates`. |
| `js/views/DevBuilderView.js` | Canvas (renderCanvasField, renderInputPreview), Preview (generateFormPreview) y Test (generateTestForm) usan Registry; getPropertyFamily en propiedades. |
| `js/views/StudioView.js` | renderFlowForm → renderFormField usa renderFormFieldWithWrapper (o fallback manual). |
| `js/views/DevTestView.js` | renderInputsForm → renderInputField usa renderFormFieldWithWrapper (o fallback por tipo). |
