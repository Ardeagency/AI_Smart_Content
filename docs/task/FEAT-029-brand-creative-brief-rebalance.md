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

## Fase 2 — Pendiente (proximo turno)

### UI del INFO panel

1. Campo `creative_brief` editable en el panel (textarea con counter `0/280`).
2. Max-chars hint en `propuesta_valor` (recomendar <=300 chars).
3. Max-items hint en `palabras_clave` (<=12), `palabras_prohibidas` (<=12),
   `objetivos_estrategicos` (<=5).
4. Helper text en cada seccion: "Esto es **inspiracion**, no instruccion.
   Los LLM creativos lo usan como contexto, no como vocabulario obligatorio."
5. Warning visual cuando el field excede el limite recomendado.

### Tooling

1. Generador de `creative_brief` con LLM cheap (gpt-4o-mini) que destile
   propuesta_valor + arquetipo + tono en 280 chars. Disponible como
   accion "Sugerir brief".
2. Validacion server-side en `saveBrandContainerFieldById` para detectar
   sobre-saturacion y avisar.

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
