---
id: BUG-003
title: brand_indexer no genera vectors — quota OpenAI agotada
severity: high
type: bug
status: open
auto_eligible: no
auto_eligible_reason: requiere subir crédito en cuenta OpenAI o cambiar facturación
est_duration: short
created: 2026-05-05
owner: -
---

# BUG-003 · brand_indexer sin vectors por quota OpenAI

## Síntoma

Las tablas `ai_brand_vectors` y `ai_global_vectors` están **completamente vacías** (0 filas en ambas) pese a que el sensor `brand_indexer` corre diariamente.

Esto rompe la búsqueda semántica que Vera podría hacer sobre el ADN de marca y bloquea features de "preparación A2A Commerce 2027" descritas en `vera-content-strategy.mb` (las marcas deben ser semánticamente legibles por máquinas).

## Contexto histórico

Originalmente reportado como BUG-002 el 2026-04-29. Cerrado parcialmente en sesión autónoma del 2026-04-30 con un fix de **reporte silencioso**: el indexer ahora marca `sensor_runs.status='failed'` con error visible en lugar de fallar en silencio. El error visible confirmó que la causa raíz es **quota agotada en OpenAI** (HTTP 429 al pedir embeddings).

La ejecución del indexer sigue funcionando estructuralmente; solo no puede pagar los embeddings.

## Costo esperado

`text-embedding-3-large` (1536-dim) cuesta ~$0.13/1M tokens. La marca demo "Arde Agency" tiene ~10K tokens de DNA combinado (brand_profiles + brand_containers + brand_entities + products). **Costo de un sync completo: ~$0.0013** (un sexto de centavo).

El indexer es idempotente vía SHA-256 en `metadata.content_hash` → solo paga embeddings nuevos cuando cambia el contenido.

## Pasos para resolver

1. Login en https://platform.openai.com/account/billing.
2. Verificar que la API key del `.env` (`OPENAI_API_KEY`) corresponde a la cuenta correcta.
3. Subir saldo o agregar método de pago.
4. Verificar que se eliminen los HTTP 429 en `sensor_runs.error_message` para `sensor_type='brand_indexer'`:
   ```sql
   SELECT created_at, status, error_message
   FROM sensor_runs
   WHERE sensor_type = 'brand_indexer'
   ORDER BY created_at DESC LIMIT 5;
   ```
5. Forzar un run manual desde ai-engine:
   ```bash
   ssh ai-engine 'cd /root/ai-engine && node test-brand-indexer.mjs'
   ```
6. Verificar que `ai_brand_vectors` recibe filas:
   ```sql
   SELECT count(*) FROM ai_brand_vectors;
   SELECT count(*) FROM ai_global_vectors;
   ```

## Criterio de done

- `ai_brand_vectors` tiene ≥ 1 fila por org con `brand_profiles` poblado.
- `sensor_runs.status='success'` en los últimos 3 runs de `brand_indexer`.
- 0 errores 429 en logs de los últimos 7 días.
