# FEAT-029 — Rebalance creativo del brand context para LLM

## Problema observado (2026-05-22, IGNIS)

Las 4 piezas de producto generadas para IGNIS salieron casi identicas:
mismas latas con label "OVERDRIVE/BLACK CORE/AFTERBURN" pegado literal,
mismos verbos como copy ("CIERRAS", "OPERAS", "DECIDES", "EJECUTAS"
— todos del `verbo_rotacion_pool`), misma estetica negra cinematica
exacta al `default_scene_anchor`. El LLM **ejecuto el brief, no creo**.

**Causa raiz:** el brand spec se convirtio en blueprint. Payload entregado
al LLM creativo por sub-marca: ~3500 chars de JSON crudo
(`verbal_dna` 771 + `visual_dna` 2515 + `palabras_clave` 25 items
+ `verbo_rotacion_pool` 15 verbos + `default_scene_anchor` con
backdrop/surface/lighting predefinidos). Los LLM con system prompts
cargados de specs detallados generan output muy literal.

## Fase 1 — Cerrada 2026-05-22

### A. IGNIS limpiado en BD

| Campo | Antes | Despues |
|---|---|---|
| `verbal_dna` | 771 chars | 367 chars |
| `visual_dna` | 2515 chars | 455 chars |
| `verbo_rotacion_pool` / `verbos_inspiracion` | 15 | 6 |
| `palabras_clave` | 25 | 10 |
| `palabras_prohibidas` | 19 | 10 |
| `sub_nichos` | "OVERDRIVE — Velocidad calculada", etc. (con labels largos) | "OVERDRIVE", "BLACK CORE", "AFTERBURN" (nombres limpios) |
| `creative_brief` (nuevo) | — | 229 chars |

**Total payload sub-marca: -69% (~3500 → ~1100 chars).**

### B. Schema BD

Migracion `SQL/migrations/2026_05_22_brand_creative_brief.sql`:
- Nueva columna `brand_containers.creative_brief text` con COMMENT explicativo.
- Idea: sintesis editable (~280 chars) que reemplaza el dump completo en
  el prompt al LLM. Si null → fallback a `propuesta_valor` truncado.

### C. `context.builder.js` (ai-engine)

`active_brand` ahora expone 3 buckets explicitos:

```js
active_brand = {
  ...bc,                  // crudo (para herramientas que lo necesiten)
  brand_identity,         // shape legacy (consumidores viejos)
  creative_brief,         // string corto → system prompt principal
  hard_constraints,       // { paleta, never, palabras_prohibidas, formato, tipografia_prohibido }
  soft_inspiration,       // { tono, pilares, manifiesto, tagline, verbos_inspiracion, estetica, preferred_moods, signature_hints }
}
```

- `hard_constraints` se inyectan como REGLAS en el system prompt.
- `soft_inspiration` se inyectan envuelto en "contexto, no instruccion".
- `creative_brief` es la inspiracion principal corta.
- El JSON crudo de `verbal_dna`/`visual_dna` ya no se entrega como dump.

Smoke test post-deploy contra IGNIS: pasa, todos los buckets pueblan correctamente.

## Fase 2 — Parcialmente cerrada 2026-05-22

### Cerrado: UI del INFO panel (counters + caps)

| Item | Estado | Commit |
|---|---|---|
| Counter X/Y vivo en footer de cada field (warn/over states) | LIVE pre-Fase2 (preservado) | — |
| Caps bajados en schema (10 fields) | DONE | `aaded354` |
| Banner "inspiracion no instruccion" en aside | DESCARTADO por usuario | `f8968fd0` |
| Hints inline por field (en brand-schema.js) | DESCARTADO por usuario | `f8968fd0` |
| IGNIS data limpia (paleta + formato + palabras vaciadas) | DONE via Supabase PATCH | (no commit, BD) |

**Decision clave:** el usuario rechazo banner y hints — el counter X/Y comunica
el limite sin texto adicional. No agregar mensajes guia en futuros panels.

**Caps nuevos en `js/config/brand-schema.js`:**

| Field | Antes | Despues |
|---|---|---|
| creative_brief | 280 ch | 200 ch |
| propuesta_valor | 300 ch | 200 ch |
| mision_vision | 400 ch | 250 ch |
| arquetipo | 60 ch | 40 ch |
| idiomas_contenido | 4 items | 3 |
| mercado_objetivo | 6 items | 4 |
| sub_nichos | 5 items | 3 |
| palabras_clave | 12 items | 6 |
| palabras_prohibidas | 12 items | 6 |
| objetivos_estrategicos | 5 items | 3 |

**Limpieza IGNIS (brand_containers `a3000000-...0001`):**
- `palabras_clave`: 8 items → `[]`
- `palabras_prohibidas`: 10 items → `[]`
- `visual_dna.paleta`: borrada (acentos #E63329/#FF6B00/#F5F5F5 + dominante #0A0A0A)
- `verbal_dna.formato`: borrado (emojis_principal, signos_exclamacion, max_palabras_oracion 14)
- Resto de visual_dna/verbal_dna intacto (never, estetica, preferred_moods,
  signature_hints / tono, pilares, tagline, verbos_inspiracion).

### Pendiente Fase 2b — Para proxima sesion

**Tooling (no UI):**

1. **Generador de `creative_brief` con LLM cheap (gpt-4o-mini).** Destila
   propuesta_valor + arquetipo + tono en <=200 chars. Disponible como accion
   "Sugerir brief" en el panel INFO. Costo objetivo: ~0.005 cred por brief
   (comparable a [[service-fiche-openai]]).
2. **Validacion server-side en `saveBrandContainerFieldById`** para enforce
   los caps al guardar (no solo warning visual). Hoy el counter se pone rojo
   pero el guardado pasa. Decision pendiente: enforce hard o soft?
3. **Migrar otras orgs reales que excedan los caps nuevos.** Query:
   ```sql
   SELECT id, nombre_marca,
          jsonb_array_length(palabras_clave) AS pc,
          jsonb_array_length(palabras_prohibidas) AS pp,
          length(creative_brief) AS cb_chars,
          length(propuesta_valor) AS pv_chars
   FROM brand_containers
   WHERE jsonb_array_length(palabras_clave) > 6
      OR jsonb_array_length(palabras_prohibidas) > 6
      OR length(creative_brief) > 200
      OR length(propuesta_valor) > 200;
   ```
   IGNIS ya quedo bajo cap (esta vacia). Otros orgs reales hoy se ven con
   counter en rojo pero data intacta.

**Validacion visual post-deploy (manual):**

- Refrescar console.aismartcontent.io → org IGNIS → abrir panel INFO de la
  card de organizacion + de cualquier sub-marca.
- Confirmar: cero banner, cero hints, counters X/Y visibles en cada field
  con maxItems/maxChars, paleta vacia en visual_dna, formato vacio en
  verbal_dna, palabras_clave y palabras_prohibidas vacias.

**Generar 4 piezas nuevas para IGNIS y comparar contra las 4 originales
(2026-05-22)** para medir el impacto real del cleanup. Metricas:
- % de copy que usa verbos fuera del `verbos_inspiracion` pool (esperado >50%).
- Cuantas piezas usan label completo de sub_nichos en producto (esperado: 0).
- Diversidad visual de backdrop/lighting (esperado: alta).

## Fase 3 — Pendiente (turno futuro)

### Schema redesign formal

Hoy los 3 buckets (`creative_brief` / `hard_constraints` / `soft_inspiration`)
se construyen on-the-fly en `context.builder.js`. Sostenibilidad media:
cada cambio de mapping requiere editar el builder.

Propuesta: promover los buckets a columnas nativas:
- `brand_containers.hard_constraints jsonb`
- `brand_containers.soft_inspiration jsonb`

Migracion:
1. Aplicar ALTER TABLE.
2. Backfill desde `verbal_dna` + `visual_dna` con queries SQL deterministas
   (los buckets actuales del builder son el blueprint).
3. Actualizar `context.builder.js` para leer las columnas directas.
4. Marcar `verbal_dna`/`visual_dna` como deprecated (no eliminar — mantener
   compat con vera-brain-feed / brand-indexer que aun los necesiten crudos).

### Validacion del impacto

Generar 4 piezas nuevas para IGNIS post-fix y comparar con las 4 originales:
- Cuantas usan el label completo de sub_nichos en latas? (esperado: 0)
- Cuantas usan verbos fuera del pool? (esperado: >50% del copy)
- Variacion de backdrop/surface/lighting? (esperado: alta diversidad)

Si la mejora es marginal, hay que revisar tambien n8n workflows: probablemente
tienen sus propios system prompts hardcodeados que leen los campos crudos
desde la BD (saltandose `context.builder.js`).

## Archivos tocados (Fase 1)

- `SQL/migrations/2026_05_22_brand_creative_brief.sql` (nuevo, aplicado)
- ai-engine: `src/services/context.builder.js` (deployed + restart OK)
- BD: brand_containers row de IGNIS limpiada via Management API

## Archivos tocados (Fase 2 — 2026-05-22)

- `js/views/brandstorage/InfoPanel.mixin.js` — banner helper eliminado +
  render del hint por field eliminado.
- `js/config/brand-schema.js` — props `hint:` borradas; caps bajados en 10 fields.
- `css/modules/brands.css` — clases `.info-brand-helper` y `.info-brand-hint`
  eliminadas; `info-brand-field-footer` simplificado a solo-counter.
- BD: brand_containers IGNIS — `palabras_clave[]`, `palabras_prohibidas[]`,
  `visual_dna.paleta` borrada, `verbal_dna.formato` borrado (via PATCH REST).

## Como retomar en una sesion futura

1. Leer este archivo + la memoria [[feat029-brand-brief-fase1]].
2. Decidir prioridad entre los 3 items de Fase 2b (generador de brief,
   validacion server-side, migracion otros orgs). El generador es el unico
   user-facing — los otros dos son housekeeping.
3. Para Fase 3 (schema redesign): el plan ya esta abajo, esperar a tener
   evidencia de que `context.builder.js` se vuelve mantenimiento pesado
   antes de promover los buckets a columnas. Hoy aun es manejable.
