# FEAT-036 — Governor de tasa KIE + gateway de generacion unificado

**Severity: 🔴 Critical (riesgo silencioso de perdida de jobs en produccion)**
**Abierto: 2026-05-29**

## El riesgo (por que es critical)

La API de KIE (kie.ai) tiene un limite real, documentado y **POR CUENTA**:

> **20 nuevas generaciones (`createTask`) por 10 segundos = 120/min.**
> Al exceder: **HTTP 429**, y *"rejected requests will NOT enter the queue"*.

Es decir: en KIE un 429 **no es una espera, es un job PERDIDO** — el usuario ve
un error, no una cola. El limite aplica solo a `createTask`; el polling de estado
(`recordInfo`) no cuenta. La concurrencia es generosa (100+ tasks). **El cuello no
es GPU ni concurrencia: es el burst de creacion.**

Tenemos **UNA sola cuenta KIE** compartida sin coordinacion por dos caminos:

- **Path A — Frontend (Netlify), DIRECTO, sin cola.** 6 funciones llaman
  `POST api.kie.ai/api/v1/jobs/createTask` (upscale, edit, remove-bg, fix-text,
  nano-banana, kling-video). Cada pestaña dispara directo; el browser hace polling
  cada 3s.
- **Path B — ai-engine → dispatcher content-flows.** `comfy_flow_jobs` (cola
  Postgres con lock+poll+retry) → dispatcher (balanceo por queue depth en
  comfyui1/2/3) → nodos KIE_* dentro de ComfyUI. ai-engine NUNCA llama KIE directo.
- **Path C — n8n: decomisionado** (sin contenedor; reemplazado por Path B).

Resultado: 7 pestañas + un batch de autopilot pueden superar 20 `createTask`/10s
y **tirar generaciones a la basura sin que nadie lo registre**. Probablemente ya
esta pasando en picos. El rate-limiter actual (`functions/lib/rate-limiter.js`) es
in-memory per-IP/per-warm-container y el propio archivo admite que "no es
proteccion definitiva".

Limite secundario: OpenAI Vision (en edit/fix-text) tiene limites por tier
(RPM/TPM); `gpt-4o-mini` ~10x mas holgado que `gpt-4o`. Menos binding que KIE.

## Objetivo

Que ningun consumidor exceda el cupo global de KIE, y que la "velocidad" sea un
beneficio REAL de plan (prioridad de cola + concurrencia + modelo turbo), nunca
una latencia simulada ni una compra de creditos suelta. Mejor para tiers altos,
**nunca peor (ni degradacion en el tiempo) para los bajos.**

## Invariantes (la linea anti-turbia, no negociable)

1. Nunca un `sleep()`/delay artificial. La latencia siempre viene de cupo real.
2. Nunca degradar a un usuario existente con el tiempo (prohibido el "battery").
3. Capacidad reservada nunca queda ociosa (si no hay jobs del tier alto, los usa
   el bajo).
4. Velocidad atada a PLAN, no a compra a la carta de "creditos de velocidad".
5. Transparencia: posicion de cola / ETA honesto en UI.

## Plan por fases

### Fase 1 — Governor de tasa KIE (ESTA fase, detiene la perdida de jobs) ✅ en curso
- Token bucket de **una sola fila en Postgres** (`provider_rate_buckets`), atomico,
  compartido por Path A y Path B. Capacidad 18, refill 1.8/s (= 18/10s, headroom
  bajo el limite de 20).
  - **Por que Postgres y no in-process en el dispatcher:** el limite es per-CUENTA
    (global). Un bucket en memoria del dispatcher seria ciego a Path A (Netlify no
    pasa por el dispatcher). Postgres es el unico punto que ambos caminos ya tocan,
    sobrevive reinicios y es horizontalmente seguro. Menos deuda tecnica.
- RPC `kie_rate_acquire(provider, cost) -> jsonb { acquired, tokens_left, retry_after_ms }`.
- Helper `acquireKieSlot()` en `functions/lib/ai-shared.js`: consume 1 token y hace
  **wait-retry server-side** (hasta ~8s) para convertir un burst en una pequeña
  espera en vez de un 429 perdido. **Fail-open**: si la RPC no existe/falla, no
  bloquea produccion (permite desplegar el codigo ANTES de aplicar la migracion;
  la migracion activa el governor).
- Cableado en los 6 call-sites de `createTask` (5 funciones imagen + `kie-video-shared.js`).
- Pendiente Path B: el dispatcher debe llamar la misma RPC antes de disparar nodos
  KIE_* (o ai-engine antes de `/run-flow`). Hoy Path B comparte cupo sin gobernarlo.

### Fase 2 — Foreground > background (eje gratis y mas justo)
- `comfy_flow_jobs.source` ya distingue `user` vs autopilot. Los runs interactivos
  ganan a los batch. Cero cambio de pricing.

### Fase 3 — Cola unificada + prioridad por plan
- Migrar Path A (toolbar interactivo) a encolar con **prioridad foreground** en vez
  de pegarle a KIE directo (justificado: como KIE no encola en 429, esperar < fallar).
- `pollJobs()` pasa de FIFO a `order by priority desc, enqueued_at asc` + **aging**
  (anti-starvation) + cap de concurrencia por org segun plan
  (Creator 2 / Team 4 / Agency 8, borrador).
- Mover el polling del browser a server-side (hoy cada tab poll cada 3s).

### Fase 4 — Turbo por plan + ETA honesto
- Exponer variantes de modelo realmente mas rapidas (KIE turbo/destiladas) por tier.
- UI muestra posicion de cola / ETA real.

## Pendientes para cerrar la deuda
- [x] Fase 1: migracion `SQL/feat-036-kie-rate-governor.sql` aplicada via Management API
      (proyecto tsdpbqcwjckbfsdqacam, 2026-05-29). Validado: 22 llamadas -> 18 pasan,
      4 bloqueadas con retry_after_ms ~556.
- [x] Fase 1: 6 call-sites cableados + desplegados (commit 6463f55a, push a main).
- [x] (Diagnostico) 429 medidos: Path B = 0 en 7 dias (serializado, no rafaguea);
      Path A = no medible server-side (cae en logs Netlify, CLI sin login, no se
      persiste). Balance KIE sano (8430). Riesgo hoy bajo (uso bajo) pero latente.
- [x] **Fase 1 — Path B gobernado** (2026-05-29). `comfy-flow-runner.service.js` en
      ai-engine cuenta nodos KIE_* del graph y reserva esos tokens via la MISMA RPC
      `kie_rate_acquire` antes de dispatchar a ComfyUI; sin cupo tras 60s re-encola
      suave sin quemar intento; fail-open. Servicio reiniciado, arranca limpio.
      **Riesgo confirmado real:** el flow `ignis-cat01-hero-ingredientes` tiene 6
      nodos KIE; con `MAX_CONCURRENT=5` eso son hasta 30 createTask/burst > limite 20.
      → **Fase 1 CERRADA: Path A (6 funciones Netlify) + Path B comparten el cupo global.**
- [ ] Mejora observabilidad: loggear eventos de throttle (acquired=false) para por
      fin ver el burst de Path A que hoy es invisible.
- [ ] Fases 2-4 segun roadmap (foreground>background, cola unificada con prioridad
      por plan, turbo por plan).

## Refs
- Topologia y limites: memoria `project_kie_consumer_topology`.
- KIE creds: `~/.claude/arde-tools/kie/.env`; control de creditos: memoria `feedback_kie_credits_control`.
- Path B: `FEAT-033-comfy-flow-bridge.md`, dispatcher en content-flows `/opt/stacks/dispatcher/app.py`.
