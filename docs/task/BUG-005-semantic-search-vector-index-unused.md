---
id: BUG-005
title: Indice vectorial ai_brand_vectors_embedding_idx nunca escaneado — verificar busqueda semantica
severity: low
type: bug
status: open
auto_eligible: no
auto_eligible_reason: requiere decidir si la feature de busqueda semantica debe estar activa (producto) + posible tuning de pgvector
est_duration: medium
created: 2026-06-03
---

## Sintoma

`ai_brand_vectors_embedding_idx` (2 MB) tiene `idx_scan = 0` pese a que la tabla
`ai_brand_vectors` tiene 69 filas y existen 2 RPCs que la consumen
(`match_ai_brand_vectors`, `match_ai_brand_vectors_with_filter`). Detectado en
re-auditoria AUDIT-005 (2026-06-03).

## Evidencia

```sql
select (select count(*) from ai_brand_vectors) filas, ui.idx_scan, sz
from pg_stat_user_indexes ui where ui.indexrelname='ai_brand_vectors_embedding_idx';
-- filas=69, idx_scan=0, sz=2056 kB
```

`searchIntelligence` (VERA v3) usa `match_ai_brand_vectors` con fallback ILIKE
(ver memoria `project_vera_v3_fase_b_bloque3`).

## Hipotesis (2, no excluyentes)

1. **Tabla muy chica:** con 69 filas el planner elige seq-scan; un indice ivfflat
   se ignora hasta tener miles de filas (y necesita `lists` tuning + `ANALYZE`).
   Si es asi, el `idx_scan=0` es **esperado y correcto**, no un bug — el indice
   "despierta" cuando crezca el corpus. Accion: no dropear, documentar.
2. **Los RPCs no se llaman:** searchIntelligence cae siempre al fallback ILIKE
   (o la feature no se ejercita). Eso si seria un bug silencioso de la busqueda
   semantica de Vera.

## Pasos para resolver

1. Confirmar si `match_ai_brand_vectors*` se invoca en runtime (grep ai-engine +
   logs de Vera; o `pg_stat_user_functions` para esos 2 procs).
2. Inspeccionar el tipo de indice (`ivfflat` vs `hnsw`) y su definicion:
   `select indexdef from pg_indexes where indexname='ai_brand_vectors_embedding_idx';`
3. Si es ivfflat sobre 69 filas -> documentar como esperado (cerrar tarea), o
   migrar a `hnsw` (mejor en datasets chicos, no requiere `lists`).
4. Si los RPCs nunca se llaman -> abrir el thread de "busqueda semantica de Vera
   no cableada en el camino caliente" (fallback ILIKE permanente).

## Criterio de done

- Decidido y documentado: el indice esta sano-pero-dormido (corpus chico) **o**
  se identifico por que la busqueda semantica no lo usa y se corrigio/abrio tarea.
- `pg_stat_user_functions` muestra llamadas a `match_ai_brand_vectors*` cuando se
  ejercita la busqueda, **o** se confirma que el fallback ILIKE es intencional.
</content>
