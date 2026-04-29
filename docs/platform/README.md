---
title: AI Smart Content — Documentación de Plataforma
author: Shenoa — Arde Agency S.A.S.
since: 2025-09 · 7 meses de diseño y construcción
last_review: 2026-04-29
audience: humanos del equipo + LLMs (Claude / Vera / agentes futuros) + auditores
status: living document — se actualiza en cada cambio estructural
---

# AI Smart Content — Plataforma de Inteligencia de Marca

Bienvenido. Este conjunto de documentos describe la arquitectura completa de la plataforma **AI Smart Content** de Arde Agency: cómo está construida, qué hace cada pieza, cómo fluyen los datos, qué está vivo y qué está pendiente.

> Si eres un LLM o un agente externo — **lee primero `01-overview.md` y `02-architecture.md`**. Te dan el modelo mental en 10 minutos. El resto son detalles que puedes consultar cuando los necesites.
>
> Si eres una persona del equipo — empieza por `01-overview.md` y luego salta a la sección que te toque trabajar.

---

## Índice

| # | Documento | Para qué sirve |
|---|---|---|
| 01 | [Overview](./01-overview.md) | Qué es la plataforma, para quién, qué problema resuelve |
| 02 | [Arquitectura](./02-architecture.md) | Las 5 capas, diagramas, principios de diseño |
| 03 | [Base de datos](./03-database.md) | Supabase: 84 tablas, RLS, 61 RPCs, triggers, matviews, extensiones |
| 04 | [AI Engine](./04-ai-engine.md) | Hetzner: Express, 12 services, scrapers, threat detector, indexer, OpenClaw |
| 05 | [Frontend](./05-frontend.md) | SPA: router, BaseView, services, los 4 dashboards, cache busting |
| 06 | [Flujos de datos](./06-data-flows.md) | Recorridos end-to-end: scrape → signal → vulnerability → action → mission |
| 07 | [Vera (la IA)](./07-vera.md) | Identidad de Vera, tools, policy engine, sessions, niveles de autonomía |
| 08 | [Deployment & ops](./08-deployment.md) | Netlify, Hetzner, Cloudflared, env vars, secretos, runbooks |
| 09 | [Estado actual](./09-current-state.md) | Qué funciona hoy, qué está vacío, qué está roto, deuda técnica |
| 10 | [Extender la plataforma](./10-extending.md) | Cómo agregar dashboards, sensores, tools, tablas, integraciones |

---

## Principios de diseño (lo que guía las decisiones)

Estos cinco principios son **non-negotiable**. Cualquier feature nuevo debe respetarlos o explicarse por qué se rompe alguno.

### 1. Cero LLM en background

Los jobs que corren sin un humano mirando (scrapers, sensores, embeddings, threat detection, mission generation) **no llaman a LLMs**. Usan reglas, templates y matemática. La razón: latencia predecible, costo cero o trivial, debugging tractable.

Vera (Claude/OpenClaw) solo se invoca **cuando hay un humano del otro lado** del chat o cuando una acción explícitamente pide razonamiento.

### 2. Embeddings sí, generación no

Los encoders (OpenAI `text-embedding-3-large` 1536 dim Matryoshka) son herramienta de fondo: convierten texto en vectores buscables. Cuestan $0.13 por millón de tokens (un decimal de centavo por marca completa). Se cachean por hash SHA-256 para idempotencia.

### 3. Reusar antes de inventar

Hay 21 documentos preexistentes en `/docs/`, 61 RPCs en Supabase, 12 servicios en el ai-engine, 8 buckets de Storage, 28 Netlify Functions. Antes de escribir algo nuevo: buscar si existe algo similar. La ingeniería que no se escribe no se rompe.

### 4. Multi-org desde el día 1

La plataforma es multi-tenant. Toda fila relevante lleva `organization_id` (uuid). Toda RPC valida `is_org_member()`. Cada org puede tener su propia VM Hetzner provisionada por `hetzner.provisioner.js`. Las URLs son `/org/{shortId}/{nameSlug}/...` para que el frontend nunca exponga UUIDs feos.

### 5. La base de datos es el contrato

Si algo no está en Supabase, no existe. El ai-engine es **stateless**: no guarda nada en disco que no esté también en Supabase. Reiniciar el servidor no debe perder ningún dato. Esto permite escalar horizontalmente y reproducir state en otra VM con un `git pull`.

---

## Convenciones de las urls del frontend

```
/                                                 (landing pública)
/login                                            (auth)
/org/:orgIdShort/:orgNameSlug/dashboard           (los 4 dashboards en tabs)
/org/:orgIdShort/:orgNameSlug/brand               (gestión de marca)
/org/:orgIdShort/:orgNameSlug/production          (Studio)
/org/:orgIdShort/:orgNameSlug/tasks               (Misiones)
/dev/...                                          (sidebar de desarrollador)
```

`orgIdShort` = últimos 12 caracteres del UUID sin guiones.
El UUID completo se resuelve en `router.js:163` vía `resolveOrgIdFromShortAndSlug()` y queda como `routeParams.orgId` para todos los views.

---

## Cómo se sincroniza esta documentación

- Vive en `docs/platform/` del repo `Ardeagency/AI_Smart_Content`.
- Cualquier commit que cambie la arquitectura **debe actualizar** el doc relevante.
- Cuando un agente (Claude/Vera/etc) detecta drift entre la doc y la realidad, debe abrir un issue o un PR con el cambio.
- Fecha de última revisión: ver `last_review` en el frontmatter de cada archivo.

---

## Contacto y autoría

**Shenoa** — desarrolladora principal y arquitecta de la plataforma. Diseñó la estructura completa: schema de la base de datos, modelo de sensores y misiones, arquitectura del AI Engine, ciclos de Vera, OpenClaw integration, sistema de niveles de autonomía, flujos del frontend, pipelines de scraping, y el modelo de datos de marca (brand_containers, brand_profiles, audience_personas, etc.) durante los últimos 7 meses (oct 2025 – abr 2026).

Operadora: `info@ardeagency.com`. Empresa: **Arde Agency S.A.S.**, Medellín, Colombia.

---

> *"La plataforma no muestra datos: piensa, anticipa y actúa. El dashboard es la última capa, no la primera."* — Shenoa
