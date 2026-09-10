# FEAT-037 · Centro de mando (/dev) — pasos de despliegue y deuda

Rediseño del dashboard `/dev` (Figma node 283:841). Frontend ya en `main`
(auto-deploy Netlify). Quedan **3 pasos fuera del repo** + 1 deuda de datos.

## 1. Aplicar RPCs a Supabase (prod) — REQUERIDO para que aparezcan datos
Archivo local (gitignored, igual que el resto de `SQL/`):
`SQL/functions/dev_dashboard_v2.sql`

Crea 4 funciones `SECURITY DEFINER` gated a `is_developer()` / `is_lead()`:
- `dev_dashboard_indicators()` — gauges + barras de eficiencia + carga del motor.
- `dev_dashboard_scrapers(p_days int)` — estado por plataforma (monitoring_triggers
  + sensor_runs) + serie diaria para el área-chart.
- `dev_dashboard_finops()` — tenants, consumo de créditos (7d/30d, por operación,
  por org), MRR (subscriptions), uso de créditos plataforma.
- `dev_dashboard_signals()` — scrapers caídos, tokens OAuth por expirar, cola saturada.

Reusa las RPC v1 ya desplegadas: `dev_dashboard_kpis`, `dev_dashboard_top_flows`,
`dev_dashboard_attention`, helper `is_lead()`.

Aplicar vía Supabase Management API (token en `~/.claude/arde-tools/supabase/.env`)
o el SQL editor. Idempotente (`CREATE OR REPLACE`).

## 2. Desplegar `/health` en ai-engine — para el panel "Motor ai-engine"
Editado en el mirror local `~/ai-engine-mirror/src/index.js`: nueva ruta
`GET /health` (estado + uptime + versión, CORS abierto solo ahí, sin DB).
Hay que llevar el cambio al server prod (`ssh ai-engine`) y reiniciar el proceso.

## 3. Exponer la URL del motor al frontend (Netlify)
El panel mide latencia contra `${window.AI_ENGINE_BASE_URL}/health`. Si la env no
está, el panel se degrada a "No configurado" (no rompe). Definir
`AI_ENGINE_BASE_URL` (sin barra final) vía snippet/inyección como ya se hace para Vera.

## Deuda de datos (no bloqueante)
- **Costo de IA en USD por proveedor (Claude/OpenAI/Apify/Tavily)** NO está
  instrumentado. El mockup lo mostraba; en su lugar el donut "Consumo IA" muestra
  **créditos por operación** (real, desde `credit_usage.operation_type`). Para el
  desglose USD real habría que registrar costo por proveedor en cada llamada del
  motor (nueva columna/tabla de cost-tracking). Eliminar esta nota al instrumentarlo.
- **Margen** real requeriría costo USD vs ingreso; mientras tanto se muestra
  "Uso de créditos plataforma" (headroom) + MRR de `subscriptions`.

## Verificación post-deploy
- Probar como **lead**: todos los paneles con datos.
- Probar como **dev no-lead**: paneles globales muestran "requiere rol lead",
  KPIs/top-flows/atención degradan a vista propia (`my_*`).
- Probar **anon crudo** contra las RPC: deben dar `forbidden` (42501), nunca data.

---

## Medido 2026-09-10 — el paso REQUERIDO está hecho; faltan los otros dos

El INDEX la daba por *"probable cerrada"*. No lo está, pero le falta menos de lo
que parecía.

| Paso | Estado real |
|---|---|
| **1. RPCs en prod** (el marcado *REQUERIDO*) | ✅ **HECHO.** Las 7 existen y son `SECURITY DEFINER`: `dev_dashboard_indicators`, `_scrapers`, `_finops`, `_signals`, `_kpis`, `_top_flows`, `_attention` |
| **2. `/health` en ai-engine** | ❌ **NO desplegado.** `GET https://api.aismartcontent.io/health` → **404 `Cannot GET /health`**. El cambio vivía en el mirror local y **nunca llegó a prod** |
| **3. `AI_ENGINE_BASE_URL` al frontend** | ❌ **No expuesta.** `/.netlify/functions/supabase-config` sólo devuelve `url`, `anonKey`, `metaAppId`, `metaApiVersion`. El panel degrada a "No configurado" (por diseño, no rompe) |
| **Verificación: anon crudo contra las RPC** | ✅ **PASA.** `dev_dashboard_finops`, `_indicators` y `_signals` devuelven **`42501 forbidden`** con la llave pública |

**Lección del paso 2:** el mirror local del ai-engine estaba al día y producción
no. Editar el mirror **no** es desplegar. Cualquier cosa que dependa del motor hay
que verificarla con un `curl` contra `api.aismartcontent.io`, no leyendo el mirror.

La **deuda de datos** (costo IA en USD por proveedor sin instrumentar) sigue
igual y sigue sin ser bloqueante.
