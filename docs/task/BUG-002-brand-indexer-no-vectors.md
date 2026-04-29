---
id: BUG-002
title: brand_indexer corre sin errores pero ai_*_vectors siguen vacíos
severity: high
type: bug
status: open
created: 2026-04-29
owner: -
---

# BUG-002 · Brand indexer no produce vectores

## Síntoma

`brand_indexer` aparece en `monitoring_triggers` con `status='active'`, corre diariamente, y sus `sensor_runs` registran `status='success'`. Sin embargo:

```sql
SELECT count(*) FROM ai_brand_vectors;   -- 0
SELECT count(*) FROM ai_global_vectors;  -- 0
```

Las RPCs `match_ai_brand_vectors` y `match_ai_global_vectors` ya existen pero están sin datos para buscar.

## Evidencia

- Última corrida: `2026-04-29 20:34:28` con `status='success'`.
- Cero filas en ambas tablas de vectores.
- `pgvector 0.8.0` instalado correctamente.
- `OPENAI_API_KEY` está en `.env` del ai-engine (verificado en lista de variables).

## Hipótesis

Tres posibilidades en orden de probabilidad:

1. **Falta input**: la org única (Arde) tiene poco contenido en `brand_profiles` (5 filas), `brand_containers.verbal_dna/visual_dna` quizás minimalistas. El indexer evalúa `getTextsToIndex(brandId)`, encuentra textos vacíos/cortos y termina sin procesar nada — pero registra `success` porque "no había qué hacer".

2. **Bug silencioso en upsert**: el handler genera embeddings (llamada a OpenAI exitosa) pero el INSERT a `ai_brand_vectors` falla por RLS o constraint, y el catch no propaga el error.

3. **content_hash check incorrecto**: el indexer cachea por SHA-256 pero la comparación SHA está rota → siempre cree que ya está indexado y omite el upsert.

## Pasos para resolver

1. Inspeccionar contenido real en BD:
   ```sql
   SELECT count(*), avg(char_length(content)) FROM brand_profiles;
   SELECT verbal_dna, visual_dna, propuesta_valor, palabras_clave
     FROM brand_containers WHERE organization_id = 'a1000000-...';
   ```
2. Correr el indexer en modo verbose:
   ```bash
   ssh ai-engine '
     cd /root/ai-engine
     DEBUG=brand-indexer node test-brand-indexer.mjs 2>&1 | head -80
   '
   ```
3. Verificar la lógica del flow:
   ```bash
   ssh ai-engine '
     grep -nE "getTextsToIndex|content_hash|upsert|insert" \
       /root/ai-engine/src/services/brand-indexer.service.js | head -30
   '
   ```
4. Si es hipótesis 1 (falta input) → no es bug, sino feature/data: documentar y mover a DOCS-NN o cerrar con resolución "esperado, requiere más contenido en brand_profiles".
5. Si es hipótesis 2 (RLS) → revisar policies de `ai_brand_vectors` y `ai_global_vectors`.
6. Si es hipótesis 3 (hash) → arreglar el cálculo / comparación.

## Criterio de done

- `SELECT count(*) FROM ai_brand_vectors WHERE organization_id = '<org>'` devuelve > 0.
- Re-ejecución del indexer sin cambios en input deja count igual (idempotencia ok).
- `match_ai_brand_vectors(<query_embedding>, <brand_id>, 5)` devuelve resultados ordenados por similitud.
