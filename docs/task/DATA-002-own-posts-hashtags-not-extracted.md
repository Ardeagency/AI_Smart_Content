---
id: DATA-002
title: Posts propios no capturan hashtags — dashboard_estrategia_hashtags queda muerta para own
severity: medium
type: data
status: open
auto_eligible: no
auto_eligible_reason: requiere tocar la ingesta de posts propios (Netlify api-brand-sync-meta + sensor meta_posts de ai-engine) y re-backfill
created: 2026-07-06
owner: -
related:
  - FEAT-037 Fase 2 #5 (bloqueada en parte por esto)
  - FEAT-040 (ingesta de posts/comentarios propios)
---

## Sintoma

`brand_posts.hashtags` esta **vacio en el 100% de los posts propios** (250/250
`post_source='own'` con `array_length(hashtags,1)` nulo, en TODAS las orgs).
Solo los posts de competidores lo pueblan (62/605, via Apify). Detectado
2026-07-06 al intentar cablear FEAT-037 #5.

```sql
select post_source, count(*),
       count(*) filter (where hashtags is not null and array_length(hashtags,1)>0) con_hashtags
from brand_posts group by post_source;
-- own: 250 total, 0 con_hashtags
-- competitor: 605 total, 62 con_hashtags
```

## Impacto

La RPC `dashboard_estrategia_hashtags` filtra por `post_source` y, para `'own'`,
devuelve SIEMPRE vacio. Cualquier widget "Hashtags que funcionan" en Mi Marca
seria UI permanentemente muerta → por eso NO se cableo en FEAT-037 #5 (se revirtio
el intento). El dato de competidores si existe, asi que un widget de hashtags de
COMPETENCIA si tendria datos (alternativa).

## Causa (a confirmar)

La ingesta de posts propios NO extrae hashtags del texto:
- Netlify `functions/api-brand-sync-meta.js` (`fetchFbPosts`/`fetchIgMedia`) trae
  el post pero no parsea `#tags` del caption a `hashtags[]`.
- Sensor `meta_posts` de ai-engine (social-scraper.service.js, branch propio):
  idem, no puebla `hashtags`.
- Los competidores SI porque Apify devuelve `hashtags` estructurado.

## Pasos para resolver

1. En la ingesta de own (Netlify y/o ai-engine): extraer `#\w+` del caption/mensaje
   a `brand_posts.hashtags` (regex simple, deterministica — sin LLM). Normalizar
   `lower(trim())` como ya hace la RPC.
2. Backfill: `UPDATE brand_posts SET hashtags = <regexp_matches del texto>` para los
   own existentes con contenido.
3. Verificar que `dashboard_estrategia_hashtags(..., p_post_source=>'own')` devuelve
   filas y recablear el widget en Mi Marca (mirror de "Temas favoritos").

## Criterio de done

- Posts propios nuevos guardan `hashtags[]` extraidos del texto.
- Backfill aplicado a los own historicos con contenido.
- `dashboard_estrategia_hashtags` devuelve datos para `own` → widget cableado.
