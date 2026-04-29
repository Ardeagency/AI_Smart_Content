---
title: 01 — Visión general de AI Smart Content
author: Shenoa — Arde Agency S.A.S.
since: 2025-09 · 7 meses de diseño
last_review: 2026-04-29
audience: humanos del equipo + LLMs
---

# 01 · Visión general

## Qué es AI Smart Content

AI Smart Content es una **plataforma de inteligencia de marca**: captura señales del mundo (lo que dice la audiencia, lo que hace la competencia, lo que pasa en el nicho), las cruza con la marca propia, y produce **acciones priorizadas** que un humano puede aprobar con un click.

No es:
- Una herramienta de scheduling de posts.
- Un dashboard "bonito" sobre métricas de redes sociales.
- Un chatbot que conversa.

Sí es:
- Un sistema operativo para equipos de marketing que quieren ser proactivos.
- Una plataforma multi-tenant donde cada org tiene su propio cerebro (Vera) y su propio sandbox de scrapers (OpenClaw).
- Una capa de inteligencia que **convierte señales en decisiones**, no en gráficos.

## El problema que resuelve

Los equipos de marketing modernos viven con tres dolores recurrentes:

1. **Información fragmentada.** Meta Insights por un lado, Google Analytics por otro, scraping manual de la competencia, monitoreo de menciones, reviews, etc. Nadie cruza todo.
2. **Reactividad.** Las crisis se descubren cuando explotan. Las oportunidades se aprovechan cuando ya saturaron. La competencia se enfrenta tarde.
3. **Costo cognitivo.** Decidir qué publicar hoy implica abrir 7 herramientas, leer 50 datos y hacer juicio. Cada día, todos los días.

AI Smart Content resuelve esto con una arquitectura de **4 dashboards + 1 cerebro**:

| Dashboard | Pregunta que responde |
|---|---|
| **Mi Marca** | ¿Cómo está mi salud orgánica, mi coherencia de tono, mis puntos ciegos? |
| **Mi Competencia** | ¿Qué están haciendo los rivales hoy, dónde son vulnerables, qué puedo aprovechar? |
| **Tendencias** | ¿Qué está vibrando en el mundo y mi nicho que aún no he tocado? |
| **Estrategia** | Dado lo de los otros 3, ¿qué hago hoy / esta semana / este mes? |

El cerebro (Vera) cruza las señales de los 3 primeros y escribe las acciones del 4°. El humano aprueba.

## Quién la usa

**Cliente final:** equipos de marketing de marcas medianas y grandes. La primera marca implementada es ARDE Agency misma (org id `a1000000-0000-0000-0000-000000000001`) como dogfood.

**Operadores internos:** desarrolladores de Arde con rol `dev` que tienen acceso al panel `/dev/...` para gestionar flows, plantillas y debug.

**Agentes (LLMs):** Vera y Claude tienen acceso a la base, lectura del estado y un set de tools que pueden invocar bajo control del policy engine.

## Modelo de negocio (alto nivel)

- **Niveles de autonomía** por organización (`organizations.level_of_autonomy`):
  - `restringido` — Vera observa, no actúa. Phase A.
  - `parcial` — Vera propone, humano aprueba. Phase B (default).
  - `total` — Vera puede ejecutar acciones de bajo riesgo sin aprobación. Phase C.
- **Créditos** (`organization_credits`) — cada acción ejecutable cuesta 1+ créditos. Recargables vía `subscriptions`.
- **Features por plan** (`organization_features`) — gates de capacidades.

Detalle en `07-vera.md` (sección Policy Engine) y `09-current-state.md`.

## Stack tecnológico (resumen)

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend: Vanilla JS SPA (sin framework)                    │
│ Hosting:  Netlify (auto-deploy desde main → aismartcontent.io)│
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTPS · supabase-js · Netlify Functions
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ Base de datos: Supabase (Postgres 17.6)                     │
│ - 84 tablas, 105 RLS policies, 61 RPCs, 24 triggers         │
│ - Extensiones: pg_cron, pgvector, pg_net, supabase_vault    │
│ - Realtime activo en 4 tablas críticas                       │
│ - Storage: 8 buckets (4 privados, 4 públicos)                │
└──────────────────┬──────────────────────────────────────────┘
                   │ Database Webhook (HMAC) → INSERT signal
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ AI Engine: Express en Hetzner CCX33 (Ubuntu 22.04)          │
│ - /root/ai-engine — 12 services, 8 routes, scheduler propio │
│ - OpenClaw gateway × 2 instancias (browsers headless)        │
│ - Cloudflared tunnel: vera-prod → api.aismartcontent.io      │
└──────────────────┬──────────────────────────────────────────┘
                   │ tools API (Claude/OpenClaw)
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ LLMs: Claude (Anthropic) + OpenAI embeddings                │
│ - Claude Opus/Sonnet — chat con Vera, razonamiento          │
│ - OpenAI text-embedding-3-large — encoder background          │
└─────────────────────────────────────────────────────────────┘
```

## Lo que hace que sea **viva**

A diferencia de un dashboard tradicional que muestra datos al pedírselos, esta plataforma:

1. **Captura sola** — `social-scraper.service` corre cada 10 min, los sensores diarios actualizan demografía y heatmaps.
2. **Detecta sola** — `threat-detector.service` agrupa anomalías estadísticas (`competitor_virality`, `own_engagement_drop`, `negative_sentiment_spike`) sin LLM.
3. **Propone sola** — los signals + thresholds disparan inserts en `vera_pending_actions` con scoring de prioridad.
4. **Ejecuta sola** (cuando hay autonomía) — `mission_generator` cada 5 min convierte aprobadas en `body_missions`, el `job_worker` las ejecuta.
5. **Aprende sola** — `brand_indexer` con embeddings deja la base lista para búsqueda semántica y similarity matching.

El humano interviene en 2 momentos:
- **Configurar** la marca, sus pilares, sus competidores, su autonomía.
- **Aprobar / rechazar** acciones de medio-alto riesgo en el dashboard de Estrategia.

Todo lo demás está automatizado.

## Lectura sugerida según rol

| Si eres... | Lee primero |
|---|---|
| Desarrollador frontend | `02-architecture.md` → `05-frontend.md` |
| Backend / Vera dev | `02-architecture.md` → `04-ai-engine.md` → `07-vera.md` |
| DBA / data | `03-database.md` → `06-data-flows.md` |
| Product / negocio | este overview → `09-current-state.md` |
| LLM externo (Claude, etc) | `02-architecture.md` y luego lo que toque la tarea |

---

*Sigue: [02 — Arquitectura](./02-architecture.md)*
