---
id: DATA-003
title: brand_posts.media_assets->>'media_type' se guarda en DOS capitalizaciones
severity: medium
type: data
status: open
auto_eligible: yes
auto_eligible_reason: UPDATE de normalizacion + alinear un normalizador; sin UX ni decision de negocio
est_duration: short
created: 2026-09-10
owner: -
---

# DATA-003 · `media_type` convive en MAYÚSCULAS y minúsculas

## Síntoma

En `brand_posts.media_assets->>'media_type'` el mismo valor aparece escrito de dos
formas, sobre los 341 posts propios:

```
VIDEO           18      video             5
CAROUSEL_ALBUM  22      carousel_album    5
IMAGE            9      image             2
(sin media_type) 45
```

## Causa

Hay **dos caminos de escritura que no acuerdan el formato**:

- `functions/api-brand-posts-meta.js:69` normaliza a minúsculas:
  `media_type: (m.media_type || 'IMAGE').toLowerCase()`
- El otro camino (ai-engine / sync) guarda lo que manda el Graph de Meta, que es
  **MAYÚSCULAS** (`IMAGE`, `VIDEO`, `CAROUSEL_ALBUM`).

## Por qué importa

Es el mismo patrón que ya mordió con `campaigns.status` (minúscula) contra
`brand_ads.status` (MAYÚSCULA). Cualquier consulta o `filter` que compare literal
acierta con la mitad de las filas y **no falla**: devuelve menos, en silencio.

Hoy **no hay bug activo**: el único comparador literal del repo,
`functions/api-brand-sync-meta.js:351`
(`['VIDEO','REEL'].includes(m.media_type)`), opera sobre datos **recién traídos
del Graph**, que siempre vienen en mayúsculas. El riesgo es la próxima consulta
que lea de la BD.

## Pasos para resolver

1. Decidir la forma canónica. Propuesta: **minúsculas**, que es lo que ya hace el
   normalizador del frontend y evita gritar en la UI.
2. `UPDATE` de normalización sobre `brand_posts.media_assets` (jsonb_set con
   `lower()`), sólo donde la llave exista.
3. Alinear el camino del ai-engine para que escriba igual.
4. Añadir la normalización en el punto de entrada, no en cada lectura.

## Criterio de done

```sql
select distinct media_assets->>'media_type' from brand_posts
where media_assets ? 'media_type';
-- debe devolver solo formas en minusculas, sin duplicados por capitalizacion
```

## Origen

Encontrada el 2026-09-10 midiendo el residuo de
[`DEBT-vision-coverage-posts-propios`](./DEBT-vision-coverage-posts-propios.md).
