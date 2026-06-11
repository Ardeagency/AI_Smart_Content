# Modelo de cards de acción estratégicas (plan de acción del dashboard)

> Estado: **alineación de modelo — sin código todavía.** Siguiente paso tras aprobar
> este doc: maqueta en Figma → implementación.
> Fecha: 2026-06-11. Vistas afectadas: hero del Dashboard (`_buildHeroCards` en
> `js/views/DashboardView.js`) y el builder de items (`_computeActionPlanItems` en
> `js/views/dashboard/MyBrands.mixin.js`).

---

## 1. El problema (por qué las cards actuales no sirven a un CMO)

Las 4 cards (Lo que funciona / Oportunidad / Lo que te resta / Riesgo) hoy son
**analítica descriptiva disfrazada de estrategia**. Cortan el historial por un
**menú fijo de dimensiones** (tono, tema, formato, hora, día) y muestran el mejor/peor
pedazo. Resultado: micro-observaciones tácticas que no responden las preguntas reales
de un CMO.

Caso real (IGNIS, captura actual):

| La card dice | El CMO pregunta | Respuesta de la card |
|---|---|---|
| `Tono "alegre" +55% sobre tu promedio` | ¿promedio **de qué**? | no lo dice (es engagement/post) |
| `Tono "alegre"` | ¿qué es "alegre" en **mi** marca? | es un tag NLP, no una decisión mía |
| `Produce más de esto` | ¿**cómo** lo exploto? | sin acción concreta |
| `Publica a las 18h +85%` | ¿esto es una **oportunidad de marca**? | no — es una táctica de calendario |
| — | ¿a qué **objetivo** sirve? | sin anclaje |

**Ironía encontrada en el código:** la versión original razonaba por **pilares de
contenido** (estratégico). La RPC `dashboard_brand_optimization_insights` la
**sobreescribe** con mejor-tono / mejor-hora (táctico). El "enriquecimiento" degradó
la estrategia a táctica. (`MyBrands.mixin.js:250-279` pisa `214-243`.)

---

## 2. Principio rector

> **La app es un consultor estratégico, no un dashboard.**
> Cada card debe leerse como una frase de consultor: *insight → por qué te conviene →
> cómo explotarlo → con qué evidencia*. La métrica es **evidencia**, no la historia.

---

## 3. Hallazgos de data real (qué tenemos / qué falta)

Verificado en vivo contra IGNIS (`org a1000000…0001`, `brand_container a3000000…0001`).

### 3.1 Anclaje al objetivo — PARCIAL
`brand_containers` tiene los campos de anclaje, pero el más directo está **vacío**:

| Campo | IGNIS | ¿Sirve de ancla? |
|---|---|---|
| `objetivos_estrategicos` | `[]` **vacío** | ⚠️ idealmente sí, pero hoy no está poblado |
| `arquetipo` | "Creador + Mago" | ✅ poblado (Brand DNA) |
| `propuesta_valor` | texto rico (energía premium, alto rendimiento creativo) | ✅ poblado |
| `mercado_objetivo` | Colombia / LATAM / USA Latino | ✅ poblado |
| `nicho_core` | "bebida energetica" | ✅ poblado |

**Decisión a tomar (§7):** anclar al **Brand DNA** (siempre poblado) y/o exigir que
`objetivos_estrategicos` se llene, y/o derivar objetivo de la **campaña activa**.

### 3.2 Dimensiones estratégicas — YA EXISTEN (subutilizadas)

**`dashboard_mimarca_pillars`** → `TABLE(pillar, post_count, share_pct, avg_impact,
baseline_impact, lift_pct, last_post, days_since, is_orphan)`

Esto es **mezcla de contenido por pilar narrativo con lift y flag de huérfano** — el
insight más estratégico disponible. Data real IGNIS:

| Pilar | share_pct | lift_pct | n | Lectura estratégica |
|---|---|---|---|---|
| Producto | 42% | **+54%** | 31 | Caballo de batalla sano → sostener |
| Comunidad | 44% | **−20%** | 32 | Sobre-invertido y rinde bajo → replantear |
| Historia de marca | 1% | **+95%** | 1 | Huérfano de oro… pero n=1 (no apostar aún) |
| Colaboración | 5% | −59% | 4 | Resta → reducir |

**`dashboard_mimarca_what_works`** → `TABLE(dimension, kind[boost/drag], value,
post_count, avg_impact, baseline_impact, lift_pct, pos_ratio, dominant_emotion)`

- **`baseline_impact` ES el baseline explícito** (0.123 = engagement promedio de la
  marca). La card hoy lo esconde. → "vs tu promedio" deja de ser ambiguo.
- **`dominant_emotion`** liga cada dimensión a la respuesta emocional del público.
- **NO hay score de confianza estadística.** `pos_ratio` es ratio de sentimiento
  positivo, NO certeza. El único proxy de fiabilidad es `post_count`.

Data real IGNIS (lo revelador):

| dimension | kind | value | n | lift | Nota |
|---|---|---|---|---|---|
| tono | boost | celebratorio | **2** | +195% | n=2 → ruido, NO liderar con esto |
| tema | boost | evento_live | 3 | +179% | n=3 → frágil |
| tono | **drag** | **casual** | **50** | **−28%** | **n=50, fiable**: tu tono más usado te resta |
| tema | drag | partnership | 4 | −59% | muestra chica |
| formato | drag | single_image | 70 | −4% | n=70, marginal |

> El insight fiable y de alto impacto (**"tu tono casual, el que más usas en 50 posts,
> rinde −28%"**) HOY no se muestra; en su lugar sale "Publica a las 13h". Esto prueba
> el problema de altitud.

**`dashboard_mimarca_audience_effective`** → jsonb con geo + **conversiones reales
(leads)**. Es el puente a un **outcome de negocio**, no solo engagement.

### 3.3 Guardrail de calidad — NUEVO requisito
Pequeñas muestras con lift altísimo (n=2, +195%) son **ruido**. El modelo debe:
- exigir un `post_count` mínimo para que un boost/drag sea card estratégica (p. ej. n≥5);
- si el mejor boost es de muestra chica, mostrarlo como **"señal temprana / a validar"**,
  nunca como certeza;
- preferir el insight **fiable** (n alto) sobre el llamativo (lift alto, n bajo).

---

## 4. Estructura de una card estratégica

Cuatro partes. Capa **glance** (la card en el hero) + capa **detalle** (al abrir).

```
GLANCE (hero)
  [categoría natural · color]      Lo que funciona / Oportunidad / Lo que te resta / Riesgo
  INSIGHT (sujeto estratégico)     "Tu pilar Producto sostiene la marca"
  EVIDENCIA (baseline explícito)   +54% vs tu promedio · 42% de tu mezcla · 31 posts
  ACCIÓN (imperativo concreto)     Mantén el ritmo y protégelo →

DETALLE (al abrir la card)
  ¿Por qué te conviene?   liga a Brand DNA / objetivo / audiencia + emoción dominante
  ¿Cómo lo exploto?       movimiento concreto de mezcla/creativo/campaña
  Evidencia y confianza   n, lift, baseline, fiabilidad (alto n vs señal temprana)
```

### Fuente de cada campo

| Campo de la card | Fuente real | Notas |
|---|---|---|
| Categoría | bucket (§5) | color = código de categoría |
| Insight (sujeto) | `pillars.pillar` / `what_works.value`+`dimension` | en lenguaje de marca, no tag crudo |
| Evidencia: lift | `lift_pct` | siempre con baseline al lado |
| Evidencia: baseline | `baseline_impact` | "vs tu promedio de interacción" |
| Evidencia: mezcla | `pillars.share_pct` | solo aplica a pilares |
| Evidencia: muestra | `post_count` | gobierna el guardrail §3.3 |
| ¿Por qué? | `arquetipo` + `propuesta_valor` + `dominant_emotion` (+ `audience_effective` si conversión) | el anclaje estratégico |
| ¿Cómo? | derivado del tipo de señal | pilar huérfano→subir mezcla; drag→reducir/replantear; etc. |
| Riesgo | `brand_vulnerabilities` + `dashboard_brand_alert_score` | ya existente |

---

## 5. Jerarquía de selección (qué señal va a qué card)

Prioridad de fuentes: **pilares > audiencia > mezcla > táctica.** La táctica (hora/día)
deja de ser card estratégica; baja a un bloque secundario de "tips" o desaparece.

| Card | Cómo se elige (con guardrail n≥5) | Ejemplo IGNIS |
|---|---|---|
| **Lo que funciona** | pilar con lift>0 y muestra sana; preferir el de mayor `share_pct×lift` (impacto real, no solo %). | Pilar **Producto** +54%, 42% mezcla, n=31 → "tu caballo de batalla, protégelo" |
| **Oportunidad** | pilar **huérfano** (alto lift, bajo share) **con muestra suficiente**; si n bajo → "señal temprana, valida". | **Historia de marca** +95% pero n=1 → "señal temprana: prueba 3-4 posts antes de escalar" |
| **Lo que te resta** | mayor fuga **fiable**: drag de `share_pct` o `post_count` alto. | Tono **casual** −28%, n=50 → "tu tono más usado te resta, replantéalo" |
| **Riesgo** | `brand_alert_score` / vulnerabilidades. | sentimiento negativo / flags |

Esto reemplaza el "menú fijo de dimensiones" por **selección por impacto estratégico
real**.

---

## 6. Ejemplo completo: las 4 cards de IGNIS, antes → después

```
ANTES (táctico)                         DESPUÉS (estratégico, con data real)
──────────────────────────             ──────────────────────────────────────────────
LO QUE FUNCIONA                         LO QUE FUNCIONA
Tono "alegre"                           Tu pilar "Producto" sostiene la marca
+55% sobre tu promedio                  +54% vs tu promedio · 42% de tu mezcla · 31 posts
Produce más de esto →                   Es tu caballo de batalla — protégelo →

OPORTUNIDAD                             OPORTUNIDAD
Publica a las 18h                       "Historia de marca" rinde pero casi no lo usas
+85% engagement                         +95% vs tu promedio · solo 1% de tu mezcla
Aplícalo ya →                           Señal temprana — prueba 3-4 posts y mide →

LO QUE TE RESTA                         LO QUE TE RESTA
Publicar a las 13h                      Tu tono "casual" es tu mayor fuga
−59% bajo tu promedio                   −28% vs tu promedio · 50 posts (el que más usas)
Redúcelo o evítalo →                    Replantéalo: tu audiencia no conecta ahí →

RIESGO (igual)                          RIESGO
IGNIS · 3% sentimiento negativo         (sin cambio de fondo; ya es estratégico)
```

La diferencia: baseline explícito, anclaje a **mezcla/pilar/audiencia**, acción concreta,
honestidad de muestra, y se surface el insight **fiable** (casual −28% n=50) en vez del
táctico llamativo.

---

## 7. Decisiones — RESUELTAS (2026-06-11)

1. **Anclaje del "por qué" → Brand DNA.** Se ancla a `arquetipo` + `propuesta_valor` +
   `nicho_core` (siempre poblados). No se bloquea por `objetivos_estrategicos` vacío;
   si más adelante se llena, se suma como ancla preferente.
2. **Umbral de muestra → n≥5 para card "dura".** Con `post_count < 5` la card se marca
   como **"señal temprana — a validar"** y nunca se presenta como certeza. Entre dos
   candidatos, gana el de mayor fiabilidad (n alto), no el de mayor lift.
3. **Táctica (hora/día/formato) → bloque secundario "tips rápidos".** Sale del plan
   estratégico; se agrupa aparte como optimización táctica. No compite con la estrategia.
4. **Fase 1 → glance + detalle.** Se construye la card mejorada **y** la capa de detalle
   al abrir (¿por qué te conviene? / ¿cómo lo exploto? / evidencia y confianza).
5. **Outcome de negocio → incluir donde haya data.** Si `audience_effective` trae
   conversiones/leads, al menos una card habla de negocio; si no, cae a engagement con
   baseline explícito. (Refinamiento, no bloqueante.)

---

## 8. Próximos pasos
1. ~~Resolver §7~~ ✅ hecho.
2. **Maqueta en Figma** (workflow Figma-first) de glance + detalle, sobre el design
   system de la maqueta `Sj1AK4L9hQ6iuCbdlR8j2E`.
3. Implementar: reescribir `_computeActionPlanItems` (selección por pilares/impacto +
   guardrail n≥5 + anclaje Brand DNA) y `_buildHeroCards` (estructura glance nueva +
   capa de detalle); mover el override táctico de la RPC a un bloque "tips rápidos".
