---
title: 07 — Vera (la IA de la plataforma)
author: Shenoa — Arde Agency S.A.S.
since: 2025-09
last_review: 2026-04-29
audience: humanos del equipo + LLMs
---

# 07 · Vera

## Qué es Vera

**Vera** es la inteligencia artificial de AI Smart Content. No es un modelo: es un **sistema** que orquesta:

- **OpenClaw** como motor de razonamiento (con sesión, contexto, memoria).
- **Claude (Anthropic)** y **OpenAI** como modelos sub-yacentes.
- **AI Engine** (Express en Hetzner) como capa de ejecución.
- **Tools** sancionados que Vera puede invocar.
- **Policy Engine** que decide qué puede hacer y cuándo.
- **Niveles de Autonomía** que cambian su comportamiento por org.

Filosofía:

> **OpenClaw puede pensar, sugerir y pedir. AI-Engine decide, ejecuta y registra.**

Es decir, Vera nunca tiene la última palabra. Cada acción pasa por validación de schema, policy, consent, presupuesto y timeout antes de ejecutarse. La autoría queda en el AI Engine, no en el LLM.

## Niveles de autonomía

`organizations.level_of_autonomy` controla qué puede hacer Vera para esa org. Mapeado por `lib/autonomy.js`:

| Nivel | Phase | Consent mode | passTokens | Comportamiento |
|---|---|---|---|---|
| `restringido` | A | `block_all` | none | Solo lectura. Vera puede contestar preguntas, no puede invocar tools de escritura |
| `parcial` | B | `require` | read | Vera propone acciones, humano aprueba. Puede leer integraciones (Meta/Google) pero no escribir |
| `total` | C | `auto` | full | Vera ejecuta acciones de bajo riesgo automáticamente. Las críticas (precio, pauta nueva) siguen requiriendo aprobación |

Default: **`parcial`** (Phase B).

Cuando un usuario baja el nivel (e.g. `total → parcial`), Vera recibe un aviso interno la próxima request y se auto-corrige (no intentará tools fuera del nuevo phase).

Cache de level: 5 minutos en memoria (`autonomy.js`).

## Policy Engine

`lib/policy.engine.js` — antes de ejecutar cualquier acción que tenga consecuencia:

```js
checkPolicy(actionName, { orgId, userId }) → { ok: boolean, reason?: string }
```

Capas de verificación (en orden):

1. **Plan de la org** (`subscriptions.plan_type`)
2. **Rol del usuario** (`organization_members.role` o `organizations.owner_user_id`)
3. **Créditos disponibles** (`organization_credits.credits_available`) — solo si la acción tiene `creditCost > 0`

Cada `actionName` tiene reglas en `ACTION_RULES`:

```js
const ACTION_RULES = {
  triggerFlowRun:     { minPlan: "pro",    minRole: "admin", creditCost: 1 },
  createFlowSchedule: { minPlan: "starter", minRole: "admin", creditCost: 0 },
  CREATE_CAMPAIGN:    { minPlan: "basico",  minRole: "admin", creditCost: 0 },
  // ...
};
```

Tiers:
- `PLAN_TIER`: `basico=0, starter=1, pro=2, business=2, enterprise=3`
- `ROLE_TIER`: `viewer=0, member=1, admin=2, dev=2, owner=3`

Reglas de comparación: `userTier >= minTier`.

## Tool Dispatcher

`services/tool.dispatcher.js` orquesta cada llamada de tool de Vera:

```
dispatchTool(toolName, args, ctx) →
  1. validateToolCallBatch(args, schema)        ← schema + injection check
  2. checkToolBudget(session, TOOL_LIMITS)      ← presupuesto de sesión
  3. Phase check (allowlist por nivel autonomía) ← solo tools del phase
  4. checkPolicy(toolName, ctx)                  ← plan + rol + créditos
  5. Consent gate                                ← según consent mode
  6. Ejecutar handler con TOOL_TIMEOUT_MS        ← 30s por defecto
  7. Audit log a developer_logs / activity_emitter
  8. return result
```

Si falla cualquier capa: el tool **no se ejecuta** y Vera recibe un error estructurado para que pueda contestar al usuario explicando.

### Tool Budgets

`SESSION_TOOL_BUDGET=20` por default — Vera puede invocar máximo 20 tools en una sesión. Evita loops descontrolados.

`SESSION_TOKEN_BUDGET` — límite global de tokens por sesión (input+output).

`SESSION_TTL_MS=600000` (10 min) — tras inactividad la sesión se cierra y libera contexto.

## Tool Validation

`lib/tool-call.validator.js`:

- Cada tool tiene un **schema JSON** definido.
- Valida tipos, requeridos, ranges.
- Hace **injection check**: detecta intentos de prompt injection (e.g. `"ignore previous instructions"` en strings).
- Aplica límites de tamaño (no aceptar payloads enormes).

## Sessions

`lib/session.manager.js` mantiene una sesión por `(organization_id, conversation_id)`:

- Aislada del resto.
- Tracking de tokens usados, tools invocados, cost acumulado.
- Memoria short-term (últimos N turnos).
- Memoria long-term (resumen comprimido por `memory.service.maybeSummarize()`).
- Goal-state (qué intenta lograr el usuario en esta sesión).

## Memoria de Vera

`services/memory.service.js`:

- **Short-term**: últimos N mensajes literales.
- **Long-term**: resumen narrativo generado por Claude cuando los mensajes superan threshold.
- **Goal**: extraído por `intent.detector.js`, qué objetivo persigue la conversación.

Patrón:

```js
buildConversationMemory(conversationId, organizationId) → {
  shortTerm: [{ role, content }, ...],
  longTermSummary: "El usuario quiere lanzar campaña de marzo...",
  goal: "design_campaign_brief",
  pastApprovedIntents: [...]
}
```

Cuando el usuario aprueba un `pending_action` con tipo `update_persona`, ese intent queda en `pastApprovedIntents` y se inyecta a futuras conversaciones para mantener consistencia.

## Activity Emitter

`lib/activity-emitter.js` — Vera emite eventos en tiempo real al frontend (vía `user_notifications` o canal directo):

- `thinking` — Vera está pensando
- `tool_call` — Vera invocó tool X con args Y
- `tool_result` — resultado de un tool
- `error` — algo falló
- `done` — request completada

El frontend (VeraView) los muestra como una "narración" del proceso de Vera.

## Audit Logger

`lib/audit-logger.js` registra cada acción significativa:

- Tool calls (success y error)
- Aprobaciones / rechazos
- Cambios de level_of_autonomy
- Tokens consumidos
- Errores de policy

Persiste en `developer_logs` o `system_metrics`. Permite auditar: "qué hizo Vera para mi org la semana pasada y por qué".

## Cost Controller

`lib/cost.controller.js`:

```js
const TOOL_LIMITS = {
  read:  { perSession: 50, perDay: 500 },
  write: { perSession: 10, perDay: 100 },
  ai:    { perSession: 5,  perDay: 30 },
};
```

Distingue tools por categoría. Bloquea cuando se supera límite y emite evento al frontend.

## OpenClaw

OpenClaw es un sistema interno (de Arde) que envuelve a Claude/Anthropic con:

- **Personalidad** definida (Vera).
- **Workspace** persistente con archivos editables.
- **Skills** (extensiones).
- **Sandboxed browsing** (navegación headless).
- **Multi-agent** support.

Las dos instancias `openclaw-gateway` corren en `:18080` y `:18789` localhost de Hetzner. El AI Engine las invoca via `openclaw.adapter.js`:

```js
callOpenClaw({ prompt, sessionId, tools, model, timeout }) → response
```

`openclaw.registry.js` carga al arranque las `openclaw_instances` activas y mantiene el mapa `org_id → instance_url` en memoria.

`openclaw.provisioner.js` provisiona instancias nuevas cuando se crea una org.

## Tools sancionados (lista actual)

### Read-only (siempre disponibles)
- `getBrandContainer(brand_id)` — datos de la marca
- `getBrandProfile(brand_id, section?)` — perfil narrativo
- `listEntities(filters)` — entidades de inteligencia
- `searchSignals(filters)` — buscar signals
- `getRecentTrends(scope)` — tendencias
- `getPostMetrics(post_id)` — métricas de post
- `analyzePostSentiment(post_id)` — sentiment de post

### Write con consent (Phase B+)
- `updateBrandContainer(updates)` — modifica DNA de marca
- `addPalabraClave(brand_id, palabra)` — agregar keyword
- `removePalabraClave(brand_id, palabra)` — quitar keyword
- `createPendingAction(payload)` — propone acción
- `approveAction(action_id)` — aprueba (auto solo en Phase C)
- `rejectAction(action_id, reason)` — rechaza

### High-impact (siempre require approve)
- `triggerFlowRun(flow_id, inputs)` — corre un flow
- `createFlowSchedule(...)` — programa un flow
- `createCampaign(brief)` — crea campaña
- `linkBriefToCampaign(brief_id, campaign_id)`
- `runManualScrape(target)` — fuerza scraping
- `addUrlWatcher(url, label)` — agrega URL al monitor

Tools de generación (video, imagen) usan créditos:
- vía Netlify Functions: `kie-nano-banana-create.js`, `kling-video-create.js`, etc.

## Ejemplo de un turno completo de chat

User: *"¿Qué post de la competencia funcionó mejor esta semana?"*

```
[ai.service.js trace]
1. Carga conversación, memoria, goal
2. Construye contexto org: brand_container, brand_profiles, entities
3. Llama OpenClaw con system prompt + history + user message
4. OpenClaw decide: necesita searchSignals + analyzePostSentiment

5. tool_call: searchSignals({
     filters: { signal_type: 'competitor_post', last_7_days: true },
     order: 'engagement_desc', limit: 5
   })
   → dispatchTool valida schema, policy, budget → ejecuta
   → result: 5 posts ordenados por engagement

6. tool_call: analyzePostSentiment({ post_id: <top_post_id> })
   → dispatchTool valida → ejecuta
   → result: { sentiment: 'positive', emotion: 'inspiring', ... }

7. OpenClaw redacta respuesta:
   "El post de @competidor_x con 12.4k likes funcionó por el copy tipo
    pregunta retórica + UGC en formato carrusel. Sentiment positivo
    dominante: inspiración. ¿Quieres que sugiera un contenido similar
    desde tu pilar 'autenticidad'?"

8. Si user dice sí → siguiente turno → tool createPendingAction(...)
9. Vera responde con la card del Plan de Acción
10. ai_messages ← INSERT respuesta + activity events
11. Frontend recibe via realtime y renderiza
```

## Lo que Vera NO puede hacer

- Borrar registros (no hay tools de DELETE).
- Modificar `organizations` (excepto via flujo administrativo explícito).
- Gastar créditos sin aprobación del usuario (excepto en Phase C para tools de bajo costo).
- Llamar APIs externas no sancionadas.
- Saltarse el Policy Engine (toda llamada pasa por `dispatchTool`).
- Acceder a datos de otra organización (RLS + `is_org_member` doble check).
- Mantener state fuera de Supabase (toda memoria persistente está en `ai_messages`, `ai_chat_context`, etc.).

## Cuándo Vera escala a humano

Vera explícitamente delega cuando:
- Detecta una crisis de marca (severity='critical' en `brand_vulnerabilities`).
- Una acción excede los límites del plan/rol.
- El presupuesto de sesión se agota.
- Detecta intento de injection.
- Recibe un cambio de `level_of_autonomy` y debe re-evaluar.

En esos casos crea `user_notifications` con `priority='high'` y `requires_action=true`.

## Vera vs sensores: división de trabajo

| Trabajo | Quién lo hace | Por qué |
|---|---|---|
| Scrape Instagram | `apify.client` (Apify actor) | Cero LLM, cache TTL global, créditos contabilizados en `apify_runs` |
| Detectar virality del rival | `threat-detector.service` | Estadística pura |
| Generar embedding de un post | `brand-indexer.service` (OpenAI encoder) | Encoder, no razonamiento |
| Convertir pending → mission | `mission-generator.service` | Pura traducción |
| Decidir "¿qué publicamos hoy?" | **Vera** | Razonamiento contextual |
| Redactar copy de post | **Vera** (con tool generateCopy) | Generación con creatividad |
| Justificar una pending_action | **Vera** (vera_reasoning) | Lenguaje natural |
| Detectar pattern semántico en menciones | Mix: brand-indexer (vectors) + Vera (interpreta) | Encoder + razonamiento |

> **Memoria del proyecto:** "scrapers/sensores/alignment usan reglas+templates+matemática, nunca Vera. LLM solo en chat cara al usuario."

## Provisión de Vera por org

- Cada org tiene su propia `openclaw_instances` (1 fila típica) con su propio workspace.
- El registry mantiene en memoria `org_id → openclaw_url`.
- Si una org no tiene instance, se provisiona on-demand (`openclaw.provisioner`).
- Las sesiones son **aisladas por org+conversation_id**.

## Costo y consumo

- Sesión típica: ~5k-15k tokens input, ~1k-3k output.
- Embeddings: $0.13 / 1M tokens (irrisorio).
- Claude Opus: ~$15-75 per 1M input/output tokens (por modelo).
- Cada tool call con AI suma a `mission_runs.tokens_used` para tracking.

`organization_credits` y `credit_usage` registran consumo monetario interno (créditos = unidad abstracta, 1 crédito ≈ $0.01-0.05 según plan).

---

*Anterior: [06 — Flujos de datos](./06-data-flows.md) · Siguiente: [08 — Deployment & ops](./08-deployment.md)*
