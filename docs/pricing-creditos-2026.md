# Créditos, costo real y planes — medición del 31/07/2026

> Todo lo que sigue está **medido contra producción**, no estimado. El detalle
> por función está en `docs/costos-por-funcion.csv`.

## 1. Lo que de verdad cuesta operar una marca

| Marca | Mes | Costo real | Eventos |
|---|---|---|---|
| WAKEUP | julio 2026 | **$120,16** | 2.192 |
| IGNIS | mayo–julio | $45–70/mes | ~400/mes |

**El plan Team cuesta $179/mes.** Con un costo de $120, el margen bruto es del
**33%** — y eso antes de infraestructura (Hetzner, Supabase, R2). Un SaaS sano
opera entre 70% y 80%.

### De dónde sale el gasto (por marca / mes)

| Función | Costo unitario | Veces/mes | Costo/mes |
|---|---|---|---|
| Scraping de perfiles | $0,082 | **382** | **$31,27** |
| Chat de Vera | $0,067 | ~200 | $13,32 |
| Producción de piezas | **$4,98** | 2 | $9,96 |
| Razonamiento de Vera | $0,329 | ~20 | $6,58 |
| Sondeo de visibilidad | **$0,690** | 4 | $2,76 |
| Visión (describir imagen) | $0,008 | 300 | $2,32 |
| Lecturas de tablero | $0,139 | 12 | $1,67 |

**La palanca no es el LLM: es la cadencia del scraping.** 382 corridas por marca
al mes son el 26% del gasto. Bajar la frecuencia a la mitad ahorra más que
cambiar de modelo.

### Lo que todavía no se mide

`trends_keywords` (SerpApi), Tavily, embeddings y los sensores de Meta propios
no escriben en el ledger. `vera_session_audit` ($2,72) y
`strategic_recommendations` ($1,18) **miden pero no cobran**. El costo real es
mayor que $120 — no sabemos cuánto, y eso es parte del problema.

## 2. Qué hacen las plataformas profesionales

**Higgsfield** ([pricing](https://www.scopeful.org/tools/higgsfield)): $15 / $39 /
$99 al mes por 200 / 1.000 / 3.000 créditos. Vende *"generación ilimitada"* en
ciertos modelos, y su letra pequeña dice que en horas pico **la velocidad baja**.
No corta: degrada. Los top-ups cuestan ~$0,05/crédito y **caducan a 90 días**.

**Social listening — nuestro verdadero mercado**
([Sprout](https://sproutsocial.com/insights/brandwatch-alternatives/),
[Brandwatch](https://www.vendr.com/marketplace/brandwatch),
[Talkwalker](https://syften.com/blog/talkwalker-vs-brandwatch/)):

| Plataforma | Precio | Modelo |
|---|---|---|
| Sprout Social | $249–499 por **usuario**/mes + listening $2–8k/año | asiento |
| Talkwalker | mediana **$27.000/año** (~$2.250/mes) | contrato |
| Brandwatch | desde $800/mes, mediana **$50.000/año** (~$4.100/mes) | volumen de menciones |

**Ninguna cobra por crédito.** Cobran por asiento o por volumen de conversación,
y **nunca muestran el costo unitario**. El cliente compra capacidad, no fichas.

> **La conclusión que importa: AISC no es caro. Es 23 veces más barato que
> Brandwatch.** Un CMO que paga $50k/año por escuchar conversaciones está
> pagando $179/mes aquí por eso *más* producción, competencia y estrategia.
> El problema no es el precio: es que el precio no cubre el costo.

## 3. El crédito: por qué 1 = $1 y qué obliga

La doctrina ya vigente (y lo que impone el trigger) es **1 crédito = 1 dólar de
costo real**. Es la decisión correcta porque es la única que sobrevive a una
plataforma con costos dispersos: LLMs múltiples, scrapers, SerpApi, Tavily,
flujos. Cualquier otra tabla de equivalencias hay que mantenerla a mano función
por función, y se desincroniza — que es exactamente lo que pasó (445 créditos de
sobrecobro).

**Pero eso obliga a recalcular los planes.** Hoy el plan Team incluye **2.500
créditos**: con 1 crédito = $1, le está prometiendo al cliente **$2.500 de costo
por $179**. Nadie los ha usado (WAKEUP consumió 120), pero el techo está firmado.

| Plan | Precio | Créditos hoy | Costo permitido hoy | Margen si los usa |
|---|---|---|---|---|
| Creator | $79 | 800 | $800 | **−912%** |
| Team | $179 | 2.500 | $2.500 | **−1.296%** |
| Agency | $499 | 8.000 | $8.000 | **−1.503%** |

## 4. Propuesta: dos planes que hacen TODO

La regla que pediste —*que se acaben los créditos solo por uso excesivo*— se
cumple si el crédito incluido cubre con holgura el uso real medido ($120/mes) y
**ninguna función queda bloqueada por plan**. Se compra capacidad, no permisos.

| | **CMO** | **CMO Scale** |
|---|---|---|
| Precio | **$499/mes** | **$1.299/mes** |
| Créditos incluidos | 150 ($150 de costo) | 450 |
| Margen sobre uso real ($120) | **76%** | 91% |
| Margen en el peor caso (tope) | 70% | 65% |
| Marcas | 1 | hasta 3 |
| Funciones | **todas** | **todas** |
| Cadencia de sensores | estándar | prioritaria |

Con el uso real de WAKEUP, el plan CMO deja **25% de holgura** antes de tocar el
límite. Un cliente solo agota créditos si dispara producción o scraping muy por
encima de lo normal — que es justo la definición de uso excesivo.

Y sigue siendo **la cuarta parte de Talkwalker**.

## 5. Prevención del desbordamiento (tres capas)

Lo que recomienda la industria en 2026 es *soft cap + degradación*, no corte
([fair use](https://newsletter.pricingsaas.com/p/fair-use),
[AI SaaS pricing](https://fungies.io/ai-saas-pricing-models-2026/)):

1. **Avisos al 75 / 90 / 100%** — ya construido hoy (`rpc_billing_check`,
   diario). Framing positivo, no amenaza.
2. **Degradación al 100%, no corte.** Es lo que hacen OpenAI (baja a un modelo
   más liviano) y Higgsfield (baja la velocidad). Aquí se traduce en: bajar la
   cadencia del scraping, usar el modelo barato para tareas de rutina y dejar
   intacto el chat y las lecturas. El cliente sigue trabajando; su plataforma se
   pone más lenta, no muda.
3. **Hard cap solo como reja de seguridad**, muy por encima del soft cap (3×) y
   por función — para que un bucle no pueda gastar $2.000 en una noche. El cap
   diario de Claude (`claude_cap_check`) ya existe: falta el equivalente para
   scraping y flujos.

**Falta también instrumentar lo que no se mide** (SerpApi, Tavily, embeddings):
un cap no puede proteger lo que no ve.
