# Extensions para flow Hero Cinematografico

3 archivos que extienden el sistema actual (PFA) con vocabulario Arde de video. **Ninguno aplicado todavia.** Para revisar antes de ejecutar.

## Orden de aplicacion (cuando confirmes)

| # | Archivo | Que hace | Donde se aplica | Reversible |
|---|---|---|---|---|
| 1 | `01-brand-dna-movement-spec.md` | Documentacion del shape extendido de visual_dna | No requiere apply (solo doc) | N/A |
| 2 | `02-rag-chunks-arde-movement.sql` | 13 INSERT en `ai_global_vectors` (creative knowledge) | Supabase via Management API | Si (DELETE WHERE source_path LIKE 'arde/...') |
| 3 | `03-ignis-seed-movement.sql` | UPDATE brand_containers de IGNIS con movement_pool, action_palette, variant_personalities | Supabase via Management API | Si (UPDATE con valores previos) |

## Por que estan separados

- **(1)** es documentacion: explica el shape. No toca BD.
- **(2)** es la base de conocimiento del Motion Director. Los chunks son **brand-agnosticos** (vocabulario Arde general). Una vez insertados, sirven para CUALQUIER cliente.
- **(3)** es **especifico de IGNIS**. Cuando agregues Papermate, Postobon, etc., creas un seed equivalente para cada brand.

## Validacion despues de aplicar 02

```sql
SELECT source_path, COUNT(*)
FROM ai_global_vectors
WHERE source_path LIKE 'arde/movement-vocabulary/%'
   OR source_path LIKE 'arde/video-patterns/%'
GROUP BY source_path
ORDER BY source_path;
```

Esperado: 13 rows totales (5 camera moves + 5 actions + 3 video patterns).

## Validacion despues de aplicar 03

```sql
SELECT
  name,
  visual_dna->'movement_pool' AS movement_pool,
  jsonb_array_length(visual_dna->'action_palette') AS action_count,
  visual_dna->'variant_personalities'->>'AFTERBURN' AS afterburn_json
FROM brand_containers
WHERE name ILIKE 'IGNIS%';
```

Esperado: 1 row con `movement_pool=["push-in","dolly in","orbit-arc"]`, `action_count=7`, y AFTERBURN con su mapeo.

## Siguiente paso (cuando estos 3 archivos esten revisados)

Construir el workflow n8n "Hero Cinematografico Multi-Variante" que usa estas extensiones. Plan ya documentado en `docs/task/FEAT-032-DISCOVERY-PFA-vs-SAUL.md` parte 3.
