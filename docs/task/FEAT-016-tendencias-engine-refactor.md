---
id: FEAT-016
title: Refactor del motor de búsqueda de tendencias (audience_demand + targeted_trends)
severity: critical
type: refactor
status: DONE
auto_eligible: no
auto_eligible_reason: cerrado — sin trabajo pendiente
est_duration: long
created: 2026-05-06
closed: 2026-05-21
owner: -
---

# FEAT-016 · Motor de tendencias inteligente — ✅ CERRADO 2026-05-21

> **Resumen para futuras sesiones**: este archivo describe el refactor del motor
> de tendencias del 2026-05-06. La arquitectura final NO usa systemd timers —
> se cableó al scheduler unificado de ai-engine como sensor `trends_run` daily
> en `monitoring_triggers` (verificado: trigger activo, last_run 2026-05-21
> 14:11 UTC, next_run cada 24h). El "criterio de done" original de crear
> `targeted-trends.timer` quedo obsoleto: la cadencia y orquestacion la
> maneja `monitoring_triggers` (ver memoria `trends-engine-wired`).
>
> **Borrar este archivo cuando se confirme que ya no hace falta como referencia
> historica del refactor V1→V2.**

## Problema raíz

El motor de búsqueda de tendencias estaba **hardcoded** para "bebidas
energéticas" en `python-analyzer/app/audience_demand_service.py` (V1):

```python
# V1 (445 líneas) — HARDCODES
own_brand_kws = ["ignis","arde","overdrive","blackcore","afterburn"]
n_phrase = {"energetica":"bebida energ", "gaseosa":"gaseosa"}.get(n, n)
seeds_audience = ["como mantenerse despierto", "deep work",
                  "productividad freelance", "energía para trabajar"]
seeds_brand = own_brand_kws + ["redbull", "monster", "celsius"]
niche_variants = ["bebida energética","bebida energetica","bebida energizante",
                  "energizante","energy drink"]
```

Resultado: el dashboard recibía noticias como _"Energía nuclear en Europa"_
y _"Reina del Flow MLB"_ porque el motor matcheaba keywords sueltas sin
contexto de la marca. Para un cliente como Sharpie u Oster el motor
seguía buscando "deep work" y "productividad freelance".

Plus: la riqueza ya disponible en BD se ignoraba — `products` con
beneficios + casos_de_uso + diferenciadores + materiales_composicion +
caracteristicas_visuales, `audience_personas` con dolores literales
+ deseos + gatillos_compra, `campaign_briefs` con angulos_venta,
`brand_containers.palabras_clave + palabras_prohibidas` … nada de eso
entraba a las queries.

## Solución aplicada

### Archivo nuevo: `app/brand_search_context.py`

Fuente única de verdad. Lee TODA la riqueza de la BD por brand_container
y la transforma en **8 buckets de seeds** + filtros + scoring:

| Bucket | Contenido |
|---|---|
| `services` | `services.nombre + beneficios + casos_uso + entregables + metodologia` |
| `products` | `products.nombre + beneficios + casos_uso + diferenciadores` |
| `audience_voice` | `audience_personas.dolores + deseos + gatillos_compra` |
| `social_topics` | top tonos/topics de `post_patterns` (lo que vibra en redes) |
| `brand_keywords` | `brand_containers.palabras_clave` permitidas |
| `ingredients` | `products.materiales_composicion + caracteristicas_visuales + variantes` |
| `campaigns` | `campaign_briefs.angulos_venta + oferta_principal + contexto_temporal` |
| `competitors` | `intelligence_entities` configuradas |

Filtro adicional (no es bucket — es exclusión post-fetch):
- `palabras_prohibidas` → hard exclude por regex word-boundary

Scoring léxico de relevancia (sin LLM, alineado con
`feedback_no_llm_in_background`):

```
score = 0.45 × overlap(text_tokens, brand_dna_tokens)
      + 0.25 × hit(palabras_clave)
      + 0.20 × hit(beneficio/caso/dolor con ≥2 tokens)
      + 0.10 × hit(pillar_name)
```

Threshold de aceptación: `MIN_RELEVANCE = 0.20` (audience_demand)
y `MIN_RELEVANCE = 0.30` (targeted_trends, más estricto).
`vera_safe = score >= 0.45`.

### `audience_demand_service.py` (refactor)

Reescrito de 445 → 380 líneas. Cambios:
- Elimina TODOS los hardcodes
- Usa `brand_search_context.compose_seed_buckets()`
- Filtra y scorea cada result antes de persistir
- Mantiene detección de marcas emergentes (`register_emerging_brand_candidate`)
- Backup en `audience_demand_service.py.bak.20260506-refactor`

### `targeted_trends_service.py` (creado)

Mirror del audience_demand pero para Google News RSS. Reemplaza al
`trends_service.py` legacy huérfano. Mismos 8 buckets + mismo filtro
+ scoring. Maps a las CHECK constraints de la tabla:
- `keyword_origin ∈ {product, audience_persona, campaign, lexicon, own_vocabulary, niche, competitor_vocabulary}`
- `signal_intent ∈ {content_opportunity, audience_insight, competitor_move, market_data, ...}`

## Dry-runs ejecutados (2026-05-06 22:00 UTC)

### audience_demand_service v2

| Brand | Seeds | Fetched | Aceptados | Rechazados (prohibida) | Rechazados (score<0.20) | Persisted |
|---|---|---|---|---|---|---|
| Arde colombia | 38 | 526 | 288 | **3** | 235 | 100 |
| IGNIS | 38 | 559 | 345 | 0 | 214 | 88 |

Total: **+184 signals** (522 → 706). Top signals con score 0.7:
"creativos rp", "sin azucar añadida", "energía funcional", "adaptógenos",
"craft", "cinematic video", "ai production studio". Todas coherentes
con el DNA narrativo. **Cero noticias absurdas tipo "energía nuclear".**

### targeted_trends_service v2

(Pendiente — corriendo en background al 2026-05-06 22:05 UTC)

## Archivos modificados

```
ai-engine:/root/ai-engine/python-analyzer/app/
  brand_search_context.py                           CREADO (~700 líneas)
  audience_demand_service.py                        REESCRITO (445 → 380)
  audience_demand_service.py.bak.20260506-refactor  BACKUP del V1
  targeted_trends_service.py                        CREADO (~300 líneas)
```

## Configuración de timer

`audience-demand.timer` está activo y corre cada 6h. Próxima ejecución
usará la versión V2 automáticamente.

`targeted-trends` aún no tiene timer systemd configurado. Pendiente
crear `targeted-trends.timer` y `targeted-trends.service` para que se
ejecute en cadencia (sugerido: cada 6h).

## Rollback

Si el motor V2 produce calidad inferior al V1:

```bash
ssh ai-engine
cd /root/ai-engine/python-analyzer/app
mv audience_demand_service.py audience_demand_service.py.v2
mv audience_demand_service.py.bak.20260506-refactor audience_demand_service.py
# targeted_trends_service.py es nuevo — borrar para rollback completo
rm targeted_trends_service.py
# brand_search_context.py: queda huérfano pero no rompe nada
```

## Criterios de done

- [x] `brand_search_context.py` creado y testeado con 1 org real
- [x] `audience_demand_service.py` refactoreado y dry-run OK (+184 signals limpios)
- [x] `targeted_trends_service.py` creado
- [x] `targeted_trends_service.py` dry-run OK — corre via `monitoring_triggers` sensor `trends_run` (no systemd)
- [x] ~~Timer systemd `targeted-trends.timer` creado~~ → **REEMPLAZADO** por sensor `trends_run` daily en `monitoring_triggers` (cableado 2026-05-21, validado E2E)
- [x] Verificar que la próxima corrida automática genera signals coherentes — confirmado en memoria `trends-engine-wired`
- [x] Frontend Tendencias rediseñado — entregado como parte de SPRINT-FRONTEND-100

## Notas

- Memoria respetada: `feedback_no_llm_in_background` (cero LLM en motor)
- Memoria respetada: `feedback_embeddings_sancionados` (no usados aún —
  fallback léxico mientras `ai_brand_vectors` no esté poblado por BUG-003)
- Pattern de backup: `.bak.{TAG}` según convención del proyecto
