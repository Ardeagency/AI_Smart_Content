---
id: OPS-014
title: 3 sensores reportan success con errores dentro (194 corridas) — el estado miente
severity: high
type: ops
status: open
auto_eligible: no
auto_eligible_reason: hay que decidir el contrato de status del sensor (que cuenta como fallo); toca el dispatcher
est_duration: short
created: 2026-09-10
owner: -
---

# OPS-014 · Sensores en verde que no traen nada

## Síntoma

**Tres sensores** cierran corridas en `status='success'` mientras sus propias
`stats` reportan errores. El caso que lo destapó, `mercadolibre_metrics`, cierra sus corridas con `status='success'`. Sus propias
`stats` dicen otra cosa:

```json
{"errors": 2, "reason": null, "skipped": false, "seller_id": "3349808262",
 "orders_30d": null, "visits_30d": 0, "revenue_30d_sampled": null,
 "questions_unanswered": null}

{"errors": 2, "reason": null, "skipped": false, "seller_id": "674839062",
 "orders_30d": null, "visits_30d": 1092, "revenue_30d_sampled": null,
 "questions_unanswered": null}
```

Se repite igual en las 4 corridas más recientes (2026-08-31 y 2026-09-01). De 5
métricas, **4 vienen `null` siempre** y sólo `visits_30d` trae número, y para un
único vendedor.

## Por qué importa

Es el patrón del **camino verde que no hizo nada**. Cualquiera que mire el panel
de sensores —o la ficha de OPS-013, o el dashboard `/dev`— ve `success` y asume
que hay datos de MercadoLibre. No los hay.

Peor: hace que el bloqueo real quede escondido. Este sensor es la razón por la que
`retail_prices` sigue en **0** (ver
[DATA-001](./DATA-001-configure-competitor-entities.md) y
[FEAT-025](./FEAT-025-mercadolibre-api-publica-fiche.md)), y su verde sugiere lo
contrario.

Un sensor que devuelve `success` con `errors > 0` **no es un sensor, es un
adorno**: no se puede alertar sobre él, no se puede confiar en él, y consume su
cuota igual.

## Hipótesis

Los `errors: 2` encajan con el 403 de la API pública de MercadoLibre —verificado
hoy: `GET api.mercadolibre.com/sites/MCO/search` → **403 forbidden**—. Lo que
falta es que el sensor **lo declare**: hoy traga la excepción, cuenta el error en
`stats` y aun así cierra en verde.

## Pasos para resolver

1. Definir el contrato: si `errors > 0` y **ninguna** métrica se pobló →
   `status='failed'`. Si algunas sí → `partial` (o `success` con `reason`
   explicando qué faltó). Hoy `reason` viene `null` incluso con 2 errores.
2. Escribir el motivo en `error_message`, que hoy está vacío para este sensor.
   El motivo **hay que escribirlo**: un contador de errores sin texto no dice qué
   se rompió.
3. ~~Revisar si el mismo patrón existe en otros sensores.~~ **Ya revisado
   (2026-09-10): existe, y es sistémico.**

   | Sensor | Corridas en verde **con errores** | Total de corridas | Máx. errores | Último |
   |---|---|---|---|---|
   | `mercadolibre_metrics` | **108** | 108 | 2 | 2026-09-01 |
   | `shopify_metrics` | **50** | 50 | 3 | 2026-09-02 |
   | `google_ads_insights` | **36** | 64 | 1 | 2026-09-02 |

   MercadoLibre y Shopify están al **100%**: *todas* sus corridas, desde siempre,
   cierran en verde con errores dentro. No es un caso raro, es su modo normal de
   funcionar. Google Ads, en cambio, falla a medias (36 de 64), que es justo el
   caso donde `partial` tendría sentido.

   Son **194 corridas** que un panel cuenta como buenas.
4. Decidir qué hacer con el sensor mientras FEAT-025 siga bloqueada: pausarlo es
   más honesto que dejarlo gastando turnos para traer `null`.

## Criterio de done

```sql
select count(*) from sensor_runs
 where status = 'success'
   and coalesce((stats->>'errors')::int, 0) > 0
   and created_at > now() - interval '7 days';
-- debe devolver 0
```

## Origen

Encontrada el 2026-09-10 verificando, durante el barrido de deuda, por qué
DATA-001 seguía con `retail_prices` en 0 pese a tener un sensor de MercadoLibre
"funcionando".
