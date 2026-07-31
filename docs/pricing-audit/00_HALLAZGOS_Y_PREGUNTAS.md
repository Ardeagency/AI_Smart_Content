# Auditoría de costos — hallazgos, evidencia y preguntas bloqueantes

**Fecha:** 31/07/2026 · **Fases entregadas:** 1, 2 (parcial) y 3 · **Fases 4–10:** bloqueadas, ver el final.

Este documento cumple la instrucción de entregar hallazgos **antes** de proponer
precios. Ninguna cifra de aquí es inventada: cada una lleva su fuente y su nivel
de confianza.

---

## 1. El hallazgo que cambia todo: la infraestructura

Hasta hoy el costo por cliente se estimaba solo con el ledger (~$120/mes). **La
infraestructura nunca se había medido.** Leída de la API de Hetzner:

| Servidor | Tipo | Recursos | EUR/mes | Naturaleza |
|---|---|---|---|---|
| ai-engine | ccx33 | 8 vCPU · 32 GB · 240 GB | **165,99** | fijo compartido |
| content-flows | cpx41 | 8 vCPU · 16 GB · 240 GB | **141,49** | fijo compartido |
| vera-…-ignis | cx23 | 2 vCPU · 4 GB | 6,49 | **por organización** |
| vera-…-org | cx23 | 2 vCPU · 4 GB | 6,49 | **por organización** |
| | | **TOTAL** | **320,46** | |

*Confirmado — fuente: `GET api.hetzner.cloud/v1/servers`, 31/07/2026.*

**Costo fijo mensual de plataforma (todos los proveedores):**

| Proveedor | Plan | USD/mes | Confianza | Fuente |
|---|---|---|---|---|
| Hetzner (2 servidores compartidos) | ccx33 + cpx41 | ~333 | Confirmado | API Hetzner (EUR 307,48 → USD) |
| Apify | **STARTER** | 29 | Confirmado | `GET api.apify.com/v2/users/me` |
| Supabase | **FREE** | 0 | Confirmado | `GET api.supabase.com/v1/organizations` |
| Cloudflare R2 | free tier | 0 | Confirmado | API R2: 800,96 MB de 10 GB |
| SerpApi | free | 0 | Confirmado | código: 250 consultas/mes |
| Netlify | por confirmar | ? | **Pendiente** | — |
| **TOTAL FIJO** | | **~362** | | |

**Costo variable por organización:** VM dedicada **USD 7/mes** (EUR 6,49) + el
consumo del ledger.

### La cuenta que hay que mirar de frente

Con **2 clientes** hoy:

```
Fijo repartido       362 / 2  =  181,00
VM dedicada                  =    7,00
Consumo medido (WAKEUP jul)  =  120,16
                               ────────
COSTO REAL POR CLIENTE         308,16 USD/mes
Plan Team cobra                179,00 USD/mes
                               ────────
PÉRDIDA POR CLIENTE           −129,16 USD/mes
```

*Calculado — el consumo variable es Confirmado (`credit_usage`); el reparto del
fijo depende del número de clientes.*

**El fijo se diluye rápido**: a 10 clientes son $36/cliente, a 25 son $14. El
problema no es la infraestructura a escala — es el precio actual con pocos
clientes.

---

## 2. Dos riesgos de continuidad, no de costo

**Supabase está en plan FREE** con la plataforma en producción. La base pesa
234 MB de los 500 MB del free tier (**47%**), y ese plan no garantiza backups
ni soporte, y pausa proyectos inactivos. *Confirmado.* **Esto es un riesgo de
pérdida de datos del cliente, no una línea de costo.**

**Apify STARTER va al 78%**: $22,77 consumidos de $29 incluidos en el ciclo
15/07–14/08, **con solo 2 clientes**. *Confirmado (API de Apify).* Con 3
clientes se rompe el plan.

---

## 3. El `$4,98` de los flujos: no era un costo

El prompt pedía verificarlo. **No representa el costo del proveedor.**

Evidencia (`credit_usage` cruzado con `content_flows`): el flujo *Minimalismo 3D*
tiene `token_cost = 50` créditos; se descontaron **50 créditos** del saldo
(`metadata.original_credits_delta = −50`), pero `usd_cost` se grabó como **5,00**
— exactamente `créditos ÷ 10`, la misma tasa fantasma de 1 crédito = $0,10 que
usaba el cobro de sesiones de Vera. El trigger de normalización luego reescribió
el delta a −5,00.

**Conclusión:** los $4,98 son un **precio comercial interno mal convertido**, no
un costo. Los 7 registros dan el mismo número porque **todos son del mismo
flujo**. El **costo real de una producción —GPU de ComfyDeploy/KIE, modelos
intermedios, reintentos— nunca se ha medido.** Y es, presuntamente, la función
más cara del producto.

*Confirmado como error de conversión · Costo real: **No determinado**.*

---

## 4. Estado de la instrumentación

De **62 funciones** que generan gasto (inventario en `docs/costos-plataforma-completo.csv`):

| Estado | Nº | Qué significa |
|---|---|---|
| Instrumentadas | 25 | miden y cobran |
| Parciales | 7 | **miden y no cobran** |
| Sin instrumentar | 30 | gastan a ciegas |

Las ciegas que más pesan: **Tavily**, **embeddings de OpenAI**, **grounded-llm**
(reparte entre GPT-4o, Gemini y Perplexity), **KIE.ai**, los populators y el
Brand DNA generator.

**Fugas ya corregidas hoy** (documentadas en
`project_creditos_wakeup_libro_vs_saldo`): 2.223 de 2.238 registros escribían
costo sin descontar saldo; 484 filas entraban con signo positivo; y un markup
fantasma (Apify ×2, sesiones ×10) provocó 445 créditos de sobrecobro en WAKEUP y
870 en IGNIS, ya devueltos.

---

## 5. Costos por unidad ya confirmados

| Unidad | Costo/mes | Confianza |
|---|---|---|
| Perfil monitoreado (Instagram) | $2,23 | Calculado sobre costo unitario medido |
| Perfil monitoreado (Facebook) | $3,84 | Calculado |
| Perfil monitoreado (promedio real) | $2,60 | **Confirmado** (2 caminos de medición coinciden) |
| Almacenamiento por marca | $0,006 | Confirmado (API de R2) |
| VM dedicada por organización | $7,00 | Confirmado (API de Hetzner) |
| Chat de Vera (por respuesta) | $0,0666 | Confirmado (482 eventos) |
| Sondeo de visibilidad | $0,6899 | Confirmado |
| Producción de una pieza | **No determinado** | el $4,98 es precio, no costo |

---

## 6. Preguntas bloqueantes

Sin estas respuestas **no se puede cerrar el modelo ni fijar precios**:

### Costos que no puedo ver desde el sistema
1. **Netlify**: ¿qué plan y cuánto se paga al mes?
2. **Anthropic / OpenAI / Gemini / Perplexity**: ¿cuánto se facturó realmente el
   último mes en cada cuenta? El ledger mide *estimaciones* por token, no la
   factura. Necesito el importe real para calibrar.
3. **KIE.ai y ComfyDeploy**: ¿plan contratado, créditos incluidos y consumo?
   Es la pieza que falta para costear producción.
4. **Higgsfield**: ¿hay contrato enterprise vigente? ¿entra al producto?
5. **Dominios, correo, observabilidad**: ¿algún costo mensual más que no aparezca
   en el código?

### Operación humana (COGS que hoy no está en ningún cálculo)
6. ¿Cuántas **horas de persona** consume al mes atender una organización
   (onboarding, configuración de sensores, revisión de piezas, soporte)?
7. ¿Cuál es el **costo por hora** que debo usar?
8. ¿El onboarding es un proyecto puntual o se reparte en el mes?

### Decisiones de negocio
9. **¿Cuántas organizaciones se esperan a 6 y 12 meses?** El fijo de $362 se
   diluye con el volumen, y el precio depende de esa curva.
10. ¿La VM dedicada por organización es obligatoria o solo para algunos planes?
    Son $7/mes por cliente y define si hay un plan sin infraestructura dedicada.
11. ¿Se venden producciones dentro del plan o como servicio aparte? Sin el costo
    real de GPU no se puede incluir con seguridad.

---

## 7. Qué falta para terminar la auditoría

| Fase | Estado | Qué la bloquea |
|---|---|---|
| 1 · Arquitectura | ✅ Entregada | — |
| 2 · Inventario de costos | ⚠️ Parcial | facturas reales de LLM, KIE, Netlify |
| 3 · Fugas | ✅ Entregada | — |
| 4 · Unidad económica | 🔜 Lista para hacerse | — |
| 5 · Perfiles P50–P95 | ⛔ | **solo hay 2 clientes**: no hay muestra para percentiles reales; habrá que usar supuestos marcados |
| 6 · Modelo financiero | ⛔ | preguntas 1–8 |
| 7 · Validación de $2.500 | ⛔ | costo de producción + horas humanas |
| 8 · Dos planes | ⛔ | fase 6 y 7 |
| 9 · Riesgos y controles | 🔜 Lista para hacerse | — |
| 10 · Recomendación | ⛔ | todas las anteriores |

**Advertencia metodológica:** con dos organizaciones (una de ellas ficticia, IGNIS)
no existe base estadística para P75/P90/P95. Cualquier percentil que produzca
será un **supuesto editable**, no un dato — y así irá marcado.

---

## 8. Adelanto sobre los $2.500

Todavía **no es una recomendación** —falta el costo de producción y el humano—
pero el orden de magnitud ya se puede acotar con lo confirmado:

Con 10 organizaciones y consumo tipo WAKEUP: fijo repartido $36 + VM $7 +
variable $120 = **$163/mes de COGS técnico por cliente**. A $2.500 eso daría
**93% de margen bruto** antes de costo humano.

El costo humano es, casi con certeza, **el que decide** si $2.500 es correcto:
20 horas/mes a $25/h son $500 y bajan el margen al 73%. Por eso las preguntas
6–8 son las más importantes de esta lista.

*Ese cálculo es un adelanto, no la validación de la Fase 7.*
