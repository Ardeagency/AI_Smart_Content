# AUDIT-005 — Fase 2C + Fase 3 + Fase 4 aplicadas

**Fecha:** 2026-05-19
**Contexto:** Cierra el plan AUDIT-005. Esta entrega bundlea las 3 fases finales en una sola iteración.

---

## Fase 2C — Branching gráfico

Drag-to-connect entre handles de los nodos del flow.

### Cambios
- `BuilderGraph.js` (nuevo mixin) — hook al `setupTechnicalModulesListeners` que activa los handles `.module-node-handle--right` como zonas drag.
- SVG overlay (`.module-graph-overlay`) sobre el flexbox de nodos con bezier paths para CADA `next_module_id` explícito (skip la conexión lineal default).
- Drag-line preview con bezier discontinuo durante el drag.
- Drop target highlight (border-color + scale).
- Click en path → muestra botón `×` para desconectar.
- `ResizeObserver` y `scroll` re-pintan el overlay automáticamente.
- Marker `<marker id="module-graph-arrow">` con flecha al final de cada path.

### Cómo se usa
1. En la tab Módulos, **arrastrar** desde el handle naranja a la derecha del nodo A.
2. Soltar sobre el nodo B → se crea `flowModules[A].next_module_id = B.id`.
3. La línea bezier aparece encima del flexbox. La línea lineal entre A y A+1 se vuelve dashed (badge "→N" ya existente desde Fase 2B refuerza visualmente).
4. Hover sobre el path → aparece `×` para deshacer.

### Limitación
- Si el módulo destino no tiene `id` real (todavía no se guardó por primera vez), se rechaza con notificación.
- Si arrastras al nodo siguiente por orden → se trata como "auto" (next_module_id = null).

---

## Fase 3 — CSS cleanup

Resuelve los hallazgos críticos del audit inicial sin cambiar visuals.

### Tokens nuevos en `:root` (bundle.css)
- `--builder-accent: #e09145` (warm orange específico del builder).
- `--builder-accent-soft: rgba(224, 145, 69, 0.2)` (focus).
- `--builder-accent-tint: rgba(224, 145, 69, 0.1)` (badges).
- `--builder-accent-bg: rgba(224, 145, 69, 0.08)` (chips).
- `--text-on-primary: #000000`, `--text-on-critical: #ffffff`.
- `--overlay-dark: rgba(0, 0, 0, 0.35)`.
- `--edge-stroke: #b1b1b7` (module-edge-path).
- `--border-light-soft: rgba(255, 255, 255, 0.25)`.
- `--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.08)`.
- **Escala z-index**: `--z-panel: 100`, `--z-dropdown: 200`, `--z-modal: 1000`, `--z-toast: 1100`.

### Reemplazos aplicados
- `color: white` (×2), `color: #ffffff`, `color: #000000` (varios) → tokens.
- `background: rgba(0, 0, 0, 0.35)` → `var(--overlay-dark)`.
- `stroke: #b1b1b7` → `var(--edge-stroke)`.
- `border: 1px solid rgba(255, 255, 255, 0.25)` (×2) → `var(--border-light-soft)`.
- `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08)` → `var(--shadow-sm)`.
- `z-index: 1000` en notification → `var(--z-toast)`.
- `z-index: 1000` en modal overlay → `var(--z-modal)`.
- `var(--accent-warm, #e09145)` en Fase 2A/2B/2C → `var(--builder-accent)` (el accent-warm del root es gris).

### Selector `:has(.builder-footer)` (frágil) → migración blue-green
- Cada regla `#app-container:has(.builder-footer)` se duplicó con `#app-container.app-builder-mode` (selector twin con coma).
- `DevBuilderView.moveBuilderTabsToAppHeader()` añade la clase `app-builder-mode` al `#app-container` cuando entra al builder.
- `DevBuilderView.destroy()` la remueve al salir.
- El `:has()` sigue funcionando como fallback. Cuando se sienta seguro, se puede borrar.

### `:focus-visible` global
- `.btn-builder-primary`, `.btn-builder-secondary`, `.btn-builder-icon`, `.btn-builder-danger`, `.btn-builder-footer`, `.builder-tab`, `.component-item`, `.field-action-btn`, `.module-node-remove`, `.canvas-field-remove`, `.flow-cover-btn`, `.flow-type-tab` → outline accent + offset 2px.

### NO incluye (Fase 3.2 si se quiere)
- Glass en containers (5 sitios) sin migrar a `bg-card` — los visuals actuales dependen del glass; cambio cosmético opt-in.
- WCAG AA contrast audit detallado sobre chips/badges.
- Media queries para `.builder-config-layout` y `.technical-tab-layout` en tablet (768px).

---

## Fase 4 — Versionado + Audit log + Cost + HMAC

### 4.1 Versionado (`flow_revisions`)

**BD nueva:**
```sql
CREATE TABLE public.flow_revisions (
  id uuid PK, content_flow_id uuid FK, version_label text,
  snapshot jsonb, author_id uuid, change_summary text, created_at timestamptz
);
CREATE POLICY "Flow revisions access" ON flow_revisions
USING (public.can_access_flow(content_flow_id));

CREATE FUNCTION public.create_flow_revision(p_flow_id, p_label, p_summary)
RETURNS uuid SECURITY DEFINER;
```

**Cliente:**
- Cada `saveFlow()` **manual** (no autosave) crea una revisión via RPC `create_flow_revision`.
- Botón `Versiones` en footer → modal con lista de las últimas 50.
- Cada item: label (formato `1.0.0-20260519143052`), tiempo relativo, summary opcional, botón `Restaurar`.
- `Restaurar` pide confirmación, crea una revisión del estado actual ("Antes de restaurar"), luego aplica el snapshot al state in-memory (con `next_module_id=null` para reinsertar limpio al guardar).

### 4.2 Audit log (`user_audit_log`)

La tabla ya existe (security baseline). El builder ahora la usa best-effort:
- Cada `publishFlow`, `unpublishFlow`, `requestReview`, `approveAndPublish`, `rejectFlow`, `saveFlow` (manual), `restoreRevision` inserta una fila con:
  - `user_id`, `action` (`flow.publishFlow`, `flow.saved`, `flow.revision.restored`, ...), `resource_type='content_flow'`, `resource_id=flowId`, `metadata={status,...}`.
- Si el insert falla (RLS / columnas no coinciden), se loguea como warn y no rompe el flow.

### 4.3 Cost estimator

Badge en footer: `≈ N créditos` (lee `flow_data.token_cost`).
- Tooltip muestra estimación interna basada en componentes:
  - LLM (prompt_input, prompt_system, textarea): peso 3.
  - Image gen (output=image): 5.
  - Video gen: 12.
  - Audio gen: 4.
  - Inputs simples: 0.1.
  - Cada módulo extra: +1 (+3 si execution_type=ai_direct).
- Badge cambia a color warning si la estimación interna difiere ≥3 del coste declarado.
- Se recalcula en cada `onStateMutated`.

### 4.4 Webhook signature secret (HMAC-SHA256)

**BD nueva:**
```sql
ALTER TABLE flow_technical_details ADD COLUMN webhook_signature_secret text;
```

**Cliente:**
- Campo nuevo en el panel "Detalles técnicos" por módulo.
- Botón `Generar` produce 32 bytes random en base64url via `crypto.getRandomValues`.
- Botón `Copiar` al portapapeles.
- Se persiste en el payload de la RPC `replace_flow_modules` (que también fue actualizada para aceptar el campo).
- `loadFlow` lo recupera y lo muestra en el panel.

**Cómo verificarlo en tu endpoint** (documentación para devs):
```js
// El builder ya documenta el contrato en el field-help:
// X-Flow-Signature: sha256=<HMAC(secret, body)>
// Verificación ejemplo en n8n / Make / código custom:
const crypto = require('crypto');
const sig = req.headers['x-flow-signature'];
const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(req.body).digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('invalid signature');
```

⚠️ **Pendiente runtime (ai-engine):** el Builder define el secret y lo persiste, pero el **ai-engine debe firmar cada request** con el secret correspondiente al módulo y enviar el header `X-Flow-Signature`. Si no, los devs no podrán validar. Esta integración queda como tarea separada del ai-engine (no aplica este PR).

---

## Archivos tocados

```
BD (Management API):
  + flow_revisions (table + RLS policy)
  + create_flow_revision (RPC)
  + flow_technical_details.webhook_signature_secret (column)
  ~ replace_flow_modules (RPC actualizada para signature_secret + next_module_id explicit)

JS:
  + js/views/builder/BuilderGraph.js        (Fase 2C)
  + js/views/builder/BuilderEnterprise.js   (Fase 4)
  ~ js/views/DevBuilderView.js              (footer extendido, modal versiones, modal del módulo extendido, app-builder-mode class)
  ~ js/views/builder/BuilderModules.js      (open/save modal con nuevos campos + badges + interactive handles)
  ~ js/views/builder/BuilderPersistence.js  (load/save signature_secret)
  ~ js/app.js                               (lazy loader + 2 mixins)

CSS:
  ~ css/bundle.css                          (tokens nuevos en :root)
  ~ css/modules/developer.css               (token replacements, :focus-visible, app-builder-mode blue-green, graph overlay, versions, signature row, cost badge)
```

## Verificación

- ✅ Sintaxis JS (8 archivos del builder + app.js pasan).
- ✅ Lazy loader carga `BuilderGraph` y `BuilderEnterprise` después de `BuilderProductivity` y `BuilderAdvanced`.
- ✅ Migration BD aplicada y verificada (`flow_revisions` table existe, `webhook_signature_secret` column existe).
- ✅ RPC `replace_flow_modules` actualizada y respeta `next_module_id` explícito del payload (no solo el linear derivado del orden).
- ✅ RPC `create_flow_revision` definida y con `GRANT EXECUTE`.

## Estado final del Builder vs PaaS de mercado

| Capacidad | n8n | Zapier | Builder ASC |
|---|---|---|---|
| Drag & drop fields | ✅ | ✅ | ✅ |
| Auto-save | ✅ | ✅ | ✅ Fase 2A |
| Undo/Redo | ✅ | ✅ | ✅ Fase 2A |
| Command palette | ✅ | — | ✅ Fase 2A |
| Validation panel | ✅ | — | ✅ Fase 2A |
| Module sandbox | ✅ | ✅ | ✅ Fase 2B |
| Variables `{{ $mod.x }}` | ✅ | ✅ | ✅ Fase 2B |
| **Branching gráfico** (drag) | ✅ | ✅ | ✅ Fase 2C |
| **Versionado / rollback** | ✅ | — | ✅ Fase 4 |
| **Audit log** | ✅ | — | ✅ Fase 4 |
| **Cost estimator** | — | — | ✅ Fase 4 |
| **Webhook signature** | ✅ | ✅ | ✅ Fase 4 (UI + BD) |
| Comentarios inline | — | — | ⏳ futuro |
| Roles granulares (flow_collaborators cableado) | — | — | ⏳ futuro |
| Lock optimista (heartbeat) | — | — | ⏳ futuro |

---

## Próximos pasos sugeridos (no incluidos)

1. **ai-engine: firmar requests con HMAC** — el Builder ya tiene el secret guardado, falta que el runner lo lea de `flow_technical_details.webhook_signature_secret` y firme cada call al webhook con `X-Flow-Signature: sha256=...`.
2. **ai-engine: expandir variables `{{ $modulo.output.x }}`** en runtime — el Builder genera los tokens, falta el motor de templates en el ai-engine.
3. **Comentarios inline en campos/módulos** — schema nuevo `flow_comments(flow_id, anchor, body, author_id)` + UI.
4. **`flow_collaborators` cableado al builder** — UI para invitar/permisos por rol (editor/reviewer/viewer).
5. **Lock optimista** — heartbeat cada 30s con `flow_locks(flow_id, user_id, expires_at)` + banner "Pedro está editando".
6. **Plantillas de flujo** — `flow_templates` curado, "Crear desde plantilla" en `/dev/flows`.
7. **Import/Export bundle completo** — `BuilderPersistence.exportFlow` ya existe pero exporta solo schema; ampliar a flow + modules + tech + revisions.
