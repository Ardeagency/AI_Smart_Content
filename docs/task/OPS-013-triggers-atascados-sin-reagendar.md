---
id: OPS-013
title: 36 triggers activos se quedaron sin reagendar (7-8 dias) y 2 nunca corrieron
severity: high
type: ops
status: open
auto_eligible: no
auto_eligible_reason: hay que entender por que el planificador dejo de reagendar antes de tocar next_run_at; empujar fechas a mano tapa el sintoma
est_duration: medium
created: 2026-09-10
owner: -
---

# OPS-013 · Sensores activos que dejaron de reagendarse

## Síntoma

De **9.557** triggers con `status='active'`, **36** tienen `next_run_at` vencido
hace **más de 2 días**. No es el planificador entero: **2.227 triggers corrieron
hoy**, así que el motor está vivo. Son estos los que se cayeron del turno.

> Ojo con la métrica: `next_run_at < now()` da **6.184**, pero eso **no** es una
> anomalía — en un planificador por sondeo lo normal es que muchos estén "en
> turno". El umbral que separa la señal del ruido es **> 2 días**.

## Los 36, por sensor

| Sensor | n | Días de atraso | Último run | Estado del último run |
|---|---|---|---|---|
| `social` | 20 | 8 | 2026-09-02 | success |
| `meta_own_ads_sync` | 2 | 7-8 | 2026-09-02 | **failed** + success |
| `mercadolibre_metrics` | 2 | 8 | 2026-09-01 | success |
| **`strategic_review`** | 2 | **56** | **NUNCA** | nunca corrió |
| `tiktok_video_insights` | 2 | 8 | 2026-09-01 | success |
| `meta_ad_library_sync` | 1 | 8 | 2026-09-02 | **failed** |
| `audience_alignment_analysis` | 1 | 7 | 2026-09-02 | success |
| `meta_campaign_audience_demographics` | 1 | 7 | 2026-09-02 | success |
| `shopify_metrics` | 1 | 7 | 2026-09-02 | success |
| `meta_ads_audiences_sync` | 1 | 8 | 2026-09-01 | success |
| `brand_audience_heatmap_compute` | 1 | 7 | 2026-09-02 | success |
| `brand_indexer` | 1 | 7 | 2026-09-02 | success |
| `google_ads_insights` | 1 | 7 | 2026-09-02 | success |

## Hipótesis

Hay **tres casos distintos** y conviene no mezclarlos:

1. **El grueso (33):** último run `success` el **1-2 de septiembre** y nunca se
   volvió a agendar. Un sensor que termina bien y no deja `next_run_at` nuevo
   apunta a que **el reagendado ocurre en un camino que no se ejecutó** — por
   ejemplo, después del `return` de éxito, o en un bloque que una excepción
   posterior se saltó. Que sean 33 de golpe y en dos días consecutivos sugiere un
   evento único (reinicio, deploy, corte), no un defecto por sensor.
2. **`meta_ad_library_sync` (1) — CAUSA RAÍZ ENCONTRADA, y sigue activa:**

   ```
   meta_ad_library_sync: 0 de 3 competidores barridos
     — Paranice: apify respondió 403 | Tosh: apify respondió 403
   ```

   **Apify topó su límite mensual.** Medido contra la API de Apify el 2026-09-10:

   | | |
   |---|---|
   | Cuenta | `aismartcontent.io` · plan **STARTER** |
   | Tope | **50 USD / mes** |
   | Consumido | **50,36 USD** |
   | Ciclo | 2026-08-15 → **2026-09-14** |

   El token es válido (HTTP 200 en `/users/me`): no es credencial muerta, es
   **tope duro**. Por eso `competitor_ads` se congeló el **2026-08-21** aunque el
   sensor siguió "corriendo". Es el mismo patrón de
   `project_apify_hardlimit_silent_fail`.

   **Alcance real (medido, no supuesto):** el único sensor afectado por el 403 es
   `meta_ad_library_sync` (10 fallos desde el 09-01). `social` siguió corriendo
   con éxito hasta hoy (586 runs), así que **no** es una caída general de Apify.

   **Se destraba solo el 2026-09-14** cuando reinicie el ciclo — o antes, subiendo
   el plan. Decisión de gasto, no de código.
3. **`strategic_review` (2):** `last_run_at` es **NULL** y `next_run_at` quedó en
   **2026-07-16**. Nunca corrió, ni una vez, en 56 días. Es otro problema:
   probablemente el dispatcher no conoce ese `sensor_type`.

## Pasos para resolver

1. **No empujar `next_run_at` a mano todavía.** Eso los revive una vez y esconde
   la causa; volverían a caerse.
2. Mirar el log del dispatcher alrededor del **2026-09-01/02** para el evento común.
3. Revisar dónde se escribe `next_run_at` tras un run exitoso y si está fuera del
   camino feliz o dentro de un `try` que puede saltarse.
4. `meta_ad_library_sync`: **ya diagnosticado** (tope de Apify). Decidir si se
   sube el plan o se espera al 2026-09-14. Y **poner un aviso de cuota**: gastar
   el 100% del tope no debería descubrirse barriendo deuda tres semanas después.
5. `strategic_review`: confirmar si el dispatcher soporta ese `sensor_type`; si no,
   o se implementa o se pausa el trigger (dejarlo `active` y muerto miente).
6. **Cuando esté arreglado, poner un aviso**: un sensor activo que lleva >2 días
   sin correr debería avisar solo. Hoy nadie se entera — se descubrió barriendo
   deuda a mano.

## Criterio de done

```sql
select count(*) from monitoring_triggers
 where status = 'active' and next_run_at < now() - interval '2 days';
-- debe devolver 0
```

## Origen

Encontrada el 2026-09-10 verificando la premisa de OPS-006 durante el barrido de
deuda.
