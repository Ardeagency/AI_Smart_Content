# FEAT-033 — Puente de orquestacion ComfyUI multi-tenant (ai-engine <> content-flows)

**Fecha:** 2026-05-25
**Estado:** diseño aprobado, build pendiente
**Reemplaza:** la idea de ComfyDeploy (descartado — cerro a clientes nuevos) y el adapter HTTP de FEAT-032 (descartado — era el enfoque n8n, no ComfyUI real).

---

## 1. Objetivo

Ejecutar flows ComfyUI **reales** (nodos `KIE_*` del pack `gateway/ComfyUI-Kie-API`) de forma **multi-tenant y concurrente**, integrados a la base de datos existente. **ai-engine es el puente central**; content-flows es solo el musculo de ejecucion.

Dos entradas, un solo motor:
- **Usuario** → `flow_schedules` → `execute_scheduled_flow` → webhook a ai-engine.
- **VERA** → tool `runContentFlow` → mismo motor.

## 2. Arquitectura

```
Usuario (frontend) ─┐
                    ├─▶ ai-engine [COLA Postgres + dispatcher + tenant] ─▶ content-flows [pool ComfyUI #1..#N] ─▶ kie.ai
VERA (tool) ────────┘                                                              │
                                                                          rpc_ingest_flow_output ─▶ runs_outputs (RLS, org_id)
```

### Aislamiento (ya existe — NO se construye)
- `organization_id` en `flow_schedules` / `flow_runs` / `runs_outputs` + **RLS activo**.
- `rpc_build_flow_context(schedule_id)` → inputs de ESA org (productos, refs de marca).
- `rpc_ingest_flow_output(schedule_id, payload)` → outputs org-scoped.
- Creditos por org (`use_credits`).

### Concurrencia (lo nuevo) — reusa el patron de `job-worker.service.js`
- **Cola durable:** tabla `comfy_flow_jobs` (mismo patron que `agent_queue_jobs`: queued/assigned/completed/failed, lock atomico, stale-recovery, reintentos con finalidad).
- **Pool:** N contenedores ComfyUI en content-flows (docker compose replicas), cada uno su cola, puertos 8188..818N.
- **Dispatcher:** poller en ai-engine que claim-ea jobs y manda al worker **menos ocupado** (consulta `/queue` de cada worker = PICK_LOWEST).
- Barato: flows = wrappers HTTP a kie.ai → workers I/O-bound (~2-3GB RAM, CPU ~0). Escala por RAM, no GPU.

## 3. Componentes a construir

| # | Pieza | Donde | Nota |
|---|---|---|---|
| 1 | Tabla `comfy_flow_jobs` (migracion) | Supabase | clon del esquema `agent_queue_jobs` + cols: org_id, flow_slug, schedule_id, inputs jsonb, worker_url, attempts |
| 2 | `comfy-flow-runner.service.js` | ai-engine | poller + dispatcher + pool client; reusa logica de `job-worker.service.js` |
| 3 | Webhook `POST /webhooks/comfy/run` | ai-engine | entrada usuario: encola job (NO ejecuta inline) |
| 4 | Tool `runContentFlow` | ai-engine `flow.tools.js` | entrada VERA: encola job; respeta [[reference-vera-v3]] |
| 5 | Pool de workers (docker compose) | content-flows | `comfyui` → N replicas; healthcheck |
| 6 | Resolver de inputs por tenant | ai-engine | LoadImage.widgets → URLs firmadas del bucket de la org; placeholders [VARIANTE] etc |

## 4. Ciclo de un run

1. Entrada (webhook o tool) inserta row en `comfy_flow_jobs` (status=queued, org_id, flow_slug, inputs).
2. Poller `tryLockJob` → assigned, elige worker libre del pool.
3. Resuelve contexto: `rpc_build_flow_context` + sustituye LoadImage/placeholders con datos de la org.
4. Normaliza flow JSON (UI→API), POST a `http://worker:8188/prompt`.
5. Polling al worker (`/history/{id}`) hasta completar.
6. Outputs → `rpc_ingest_flow_output(schedule_id, payload)` (storage_path/URLs).
7. `markJobCompleted` / `markJobFailed` (reintenta hasta max attempts).

## 5. Seguridad / no romper produccion

- **Feature-flag** `COMFY_BRIDGE_ENABLED` — inerte hasta activar; NO toca los 3 flows n8n vivos (`execution_type=webhook`). El comfy usa `execution_type=comfy`.
- **KIE key** sacada del runtime mientras el tunel este expuesto; re-inyectar al activar (ver [[reference-kie-credentials]] — no disparar gen sin pre-aprobacion, creditos limitados).
- **Sin Redis** — cero infra nueva en el SPOF [[project-aiengine-multitenant]].
- VERA en pausa de tooling [[project-vera-paused-tooling-phase]]: la tool se construye pero NO se prueba con LLM real / usuarios sin permiso.

## 6. Plan de prueba SIN quemar creditos

1. Nodos cargan ✅ (ya verificado, flow IGNIS valida).
2. Plumbing: encolar job dummy → dispatcher elige worker → (mock kie / sin key) → verifica claim/lock/stale/retry.
3. E2E real: solo con (a) las 5 imagenes de referencia de IGNIS, (b) KIE key re-inyectada, (c) pre-aprobacion explicita del usuario.

## 7. Pendientes externos (bloquean E2E, no el build)
- 5 imagenes de referencia de IGNIS (no existen aun).
- Definir N inicial de workers (sugerido: 3 en CPX41 16GB).
