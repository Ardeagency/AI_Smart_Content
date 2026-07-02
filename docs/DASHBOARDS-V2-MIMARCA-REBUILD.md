# Mi Marca V2 — Diagnóstico CMO + Plan de reconstrucción

> Diagnóstico 2026-07-02, con la visión de `DASHBOARDS-V2-VISION.md` como vara.
> Fuente del inventario: `js/views/dashboard/MyBrands.mixin.js` (~14 bloques) +
> screenshots reales de IGNIS y WAKEUP. Salud de marca: spec aparte (task #11).
> Regla: se matan CARDS de la UI; los RPCs quedan (Vera + historial).

## A. El examen — las 5 preguntas de la visión vs lo que responde hoy

| # | Pregunta de la visión | Estado hoy |
|---|---|---|
| 1 | ¿Qué me funciona YA — y por qué + receta? | 🟡 A medias: cards causales dicen el QUÉ, no el POR QUÉ ni el cómo reusarlo |
| 2 | ¿Mis puntos débiles? | 🟡 A medias: "te resta"/"riesgo" existen; la Salud que resume está rota (task #11) |
| 3 | ¿Qué dice mi audiencia, + y −? | 🟡 A medias: recepción por post + comentarios; falta agregado "qué AMAN / qué ODIAN" |
| 4 | ¿Atribución con receta? (post → +32 seguidores → causa → reúsalo así) | ❌ NO EXISTE |
| 5 | ¿Capa comercial? (ventas, reseñas, recompra, GA4, YouTube) | ❌ CERO — dashboard 100% social |

**Veredicto global: responde ~1.5 de 5.** Hoy es un social-listening propio con
adornos, no el autodiagnóstico. Los cimientos buenos existen pero están
enterrados bajo chatarra. Balance: de ~14 bloques, 0 sobreviven tal cual,
4 se elevan, 3 se transforman, ~6 se matan (≈45% chatarra), 4 se construyen.

## B. Veredicto card por card

### 🟢 MANTENER Y ELEVAR (4)
| Card (builder) | Upgrade requerido |
|---|---|
| 4 cards causales (`_buildActionPlanSection`/`_buildCausalCard`) | Añadir la CAUSA ("funcionó por el hook X + keyword Y") y CTA que dispare acción real (crear producción), no solo link |
| Recepción del público (`_buildReceptionSection`) | Conectarla al rollup +/− (ver Construir #2) |
| Análisis de comentarios (`_buildCommentsSection`) | Elevar a "3 temas que aman / 3 que odian" con evidencia clickeable |
| Pilares de contenido (`_buildPillarsSection`) | Guardrail n≥5: "rinde +270%" con 4 posts = píldora "señal temprana", no fórmula |

### 🟠 TRANSFORMAR (3)
| Card | Se convierte en |
|---|---|
| Salud de marca (`_buildHealthGauge`/`Alerts`/`Components`/`Tasks`) | Signos vitales + relato + gate de pulso — **spec completa en task #11** (5 signos: PULSO gate, RESONANCIA, CRECIMIENTO, SHARE OF VOICE, DISTINTIVIDAD n≥10; sin defaults 0.5; relato antes del número; fixtures IGNIS≤20 / WAKEUP−IGNIS≥30) |
| Top 3 publicaciones (`_buildTopPostsSection`) | De trofeo a RECETA: por qué funcionó + qué reusar (embrión de la atribución) |
| Tonos/Temas (`_buildToneTopicSection`) | UNA frase causal de brecha de mezcla ("usas Casual, te funciona Comunidad") — ya existe como card causal; donuts y mini-cards fuera |

### 🔴 MATAR de la UI (~6 — RPCs quedan)
| Card | Razón |
|---|---|
| Historial de actividad (`_buildActivitySection`/`Sparkline`/`Banner` chart) | Orden directa de la fundadora. "Cuántos posts hice" no decide nada |
| KPI strip (923 eng / 92 posts / 6% consistencia) | Números sin veredicto; denominador roto (322 semanas = histórico scrapeado desde 2021) |
| Patrón de horas (`_buildPostingHeatmap`) | Numerito; que Vera lo use para programar — el cliente no lo necesita ver |
| Tendencia engagement/crecimiento (`_buildLongitudinalSection`) | Ejes rotos en producción (20000%/−10000%); redundante con Meta |
| Actividad de sentimientos (chart temporal) | Redundante con Recepción + Comentarios |
| Alertas chips (Cadencia 2 / Coherencia 46) | Números crudos de la fórmula rota; renacen DENTRO del relato de salud |

Nota: `_buildSwotCard` — si su fuente es `brand_vulnerabilities` (ruido mecánico
"Monster 2.8x", ver auditoría DB), matar hasta que la fuente sea real.

### 🔵 CONSTRUIR (4 — la mitad de la visión que no existe)
1. **ATRIBUCIÓN CON RECETA** (el corazón): correlacionar post ↔ delta de
   seguidores/alcance/ventas del día + extraer causa (hook, copy, keyword,
   formato) + botón "reúsalo" que dispare producción.
   *Data ya fluye: `brand_posts_daily_stats` + meta page insights.*
2. **VOZ AGREGADA +/−**: rollup temático de comentarios — "3 temas que aman /
   3 que odian", cada uno clickeable a los comentarios que lo prueban.
   *Data ya existe: `brand_post_comments` con sentiment analizado.*
3. **CAPA COMERCIAL**: ventas/AOV/recompra (Shopify), reseñas+estrellas (ML),
   tráfico/conversiones (**GA4 — la integración YA funciona y nadie la pinta =
   quick win #1**), YouTube. *Depende de encender stubs (auditoría task #4:
   shopify_sync_orders/customers stub, reseñas ML sin ingestar).*
4. **EL EVENTO QUE ENSEÑA**: feed de eventos comerciales de aprendizaje —
   "este cliente recompró 3 veces y dejó esta reseña" → alimenta personas.

## C. Orden de construcción (ROI × dependencias)

1. **Matar la chatarra** — puro frontend, 1 pasada; la señal sube de inmediato.
2. **Salud rediseñada** — task #11, spec lista; el número más visible por fin
   cuenta su historia.
3. **Voz agregada +/−** — data ya existe.
4. **GA4 al dashboard** — integración viva sin pintar; primer dato comercial.
5. **Atribución con receta** — construible con data actual; corazón de la visión.
6. **Capa comercial ML/Shopify** — tras encender los stubs (task #4).

## D. Test de aceptación de cada card nueva

*"¿Esto lo diría un equipo de marketing profesional en la reunión mensual con el
cliente?"* — si es un número sin veredicto, causa ni acción → no entra.
