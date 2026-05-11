---
id: FEAT-018
title: Notificaciones — modelo rico (título · etiqueta · detalles · urgencia · resumen · subject · checklist · acciones)
severity: high
type: feature
status: in_progress
auto_eligible: no
est_duration: long
created: 2026-05-11
target_delivery: 2026-05-18
owner: -
related:
  - commit 8043751 (Fase 0a: bell consume org_notifications via RPCs)
  - commit d5891fe (Fase 0b: _resolveActionUrl prefija /org/{short}/{slug})
---

# FEAT-018 · Notificaciones — modelo rico

> **Contexto:** las notificaciones hoy son comentarios planos
> ("Vera analizó X cosa"). El usuario necesita un modelo estructurado:
> título, etiqueta, descripción detallada del plan de acción de Vera,
> urgencia, resumen, acciones, estado de tarea y checklist de sub-tareas.
> Además, la notificación debe llevar al usuario humano al recurso real
> (producto, campaña, audiencia, flujo, identity, producción) en vez de
> a dashboards genéricos, ya que Vera opera autónoma y el humano audita
> sus decisiones.

## 1. Modelo de datos

### 1.1 Anatomía de una notificación

```
┌─ HEADER ───────────────────────────────────────────────┐
│ [ETIQUETA · CATEGORÍA]  [URGENCIA]      hace 2 horas   │
├─ HERO ────────────────────────────────────────────────┤
│ TÍTULO  (corto, accionable)                            │
│ RESUMEN (TL;DR, 1 línea)                               │
├─ DETALLES (expandible) ───────────────────────────────┤
│ BODY (markdown · plan de acción completo de Vera)      │
├─ SUBJECT (referencia al objeto) ──────────────────────┤
│ [thumb] tipo · label                       →           │
├─ CHECKLIST (sub-tareas paso a paso) ──────────────────┤
│ ☐ paso 1                                               │
│ ☐ paso 2                                               │
│ Estado: X de N completadas                             │
├─ ACCIONES ────────────────────────────────────────────┤
│ [Primaria]  [Secundaria]  [Terciaria]                  │
└────────────────────────────────────────────────────────┘
```

### 1.2 Mapeo a BD (`org_notifications`)

| Campo de la card | Columna BD | Tipo | Notas |
|---|---|---|---|
| Título | `title` | text | Headline corto |
| Etiqueta | `metadata.label` | text | "VERA · ACCIÓN", "SISTEMA · INTEGRACIÓN", etc. Vocabulario controlado, ver §1.3. |
| Urgencia | `severity` | text | `info`\|`opportunity`\|`warning`\|`critical`\|`success` |
| Resumen | `metadata.summary` | text | TL;DR, 1-2 líneas |
| Detalles | `body` | text | Markdown · plan de acción de Vera completo |
| Subject | `metadata.subject` | jsonb | `{type, id, label, preview_url?, related_ids?}` |
| Checklist | `metadata.checklist` | jsonb[] | `[{id, label, optional?}]` |
| Estado tarea | `status` | text | `pending`\|`in_progress`\|`completed`\|`dismissed` |
| Acciones | `metadata.actions` | jsonb[] | `[{label, kind, target, params?, primary?, icon?}]` |
| Vera ctx | `metadata.vera` | jsonb | `{confidence, reasoning, before?, after?, tokens?}` |

**Decisión clave:** todo lo nuevo va en `metadata` (jsonb). Cero DDL inicial.
Cuando algún campo lo justifique (queries por categoría, índices), se promueve a columna.

### 1.3 Vocabulario controlado de `label`

Forma `CATEGORÍA · TIPO`. Etiqueta visible como chip pequeño.

| Etiqueta | Cuándo |
|---|---|
| `VERA · ACCIÓN` | Vera ejecutó una acción autónoma que requiere auditoría |
| `VERA · PROPUESTA` | Vera propone una acción pendiente de aprobación humana |
| `VERA · INSIGHT` | Vera detectó algo (oportunidad, riesgo, patrón) sin acción inmediata |
| `SISTEMA · INTEGRACIÓN` | Conexión/sync de plataforma (Shopify, Meta, Google) |
| `SISTEMA · ALERTA` | Threshold/healthcheck (créditos, storage, cap Vera) |
| `MERCADO · TENDENCIA` | Trend detectado, lexicon emergente, brand emergente |
| `COMPETENCIA · MOVIMIENTO` | Competidor publicó algo relevante |
| `MARCA · CAMBIO` | Algo cambió en una marca propia (post viral, crisis, etc.) |

### 1.4 Subject types y mapeo a rutas

| `subject.type` | Ruta destino (relativa al org prefix) |
|---|---|
| `product` | `/identities/product-detail/{entityId}/{productId}` |
| `campaign` | `/brand/campaign/{campaignId}` |
| `audience` | `/brand/audience/{audienceId}` |
| `flow` | `/studio/flows/{flowId}` |
| `identity` | `/identities` |
| `production` | `/production-detail/{runId}` |
| `entity` (competidor) | `/monitoring?entity={entityId}` |
| `brand_container` | `/brand-storage/{containerId}` |
| `recommendation_batch` | `/dashboard#strategy` |
| `trend_batch` | `/dashboard#tendencies` |
| `emerging_brand_batch` | `/monitoring?tab=emerging` |

Helper `_buildSubjectUrl(subject)` en `Navigation.js` aplica este mapeo.

### 1.5 Action kinds

| `kind` | Comportamiento |
|---|---|
| `navigate` | `router.navigate(target)` después de resolver con `_resolveActionUrl` |
| `external` | `window.open(target, '_blank')` para URLs http(s) |
| `rpc` | Llama `supabase.rpc(target, params)` + refresca notif + dispatch `notifications-updated` |
| `modal` | Abre modal contextual con id `target` (ej. `iterate_feedback`, `delete_confirm`) |

## 2. Ejemplo: las 3 notifs actuales reformateadas

### Notif 1 · Tendencias detectadas

```json
{
  "title": "5 oportunidades de tendencia detectadas",
  "body": "## Análisis del motor de tendencias\n\nEsta semana se detectaron **5 trends con velocity score > 1.5**:\n\n1. **cold-weather-gear** (velocity 2.3) — picos en búsquedas de snowboard...\n2. **k-pop-fashion** (velocity 1.8) — crossover con streetwear...\n3. **micro-luxury** (velocity 1.6)\n4. **utility-tech** (velocity 1.5)\n5. **slow-mornings** (velocity 1.5)\n\nVera ya generó briefs accionables para cada uno con propuesta de contenido, formato, tono y hora óptima.",
  "severity": "opportunity",
  "status": "pending",
  "metadata": {
    "label": "MERCADO · TENDENCIA",
    "summary": "5 trends con velocity >1.5 esta semana, briefs accionables listos",
    "subject": {
      "type": "trend_batch",
      "id": "d3ad57ba-6aac-4b0e-a87c-4f405037100a",
      "label": "Batch del 8-may · 5 trends"
    },
    "checklist": [
      { "id": "review", "label": "Revisar los 5 briefs propuestos" },
      { "id": "select", "label": "Seleccionar 1-2 para producción" },
      { "id": "schedule", "label": "Agendar fecha de publicación", "optional": true },
      { "id": "approve", "label": "Aprobar para flujo de producción" }
    ],
    "actions": [
      { "label": "Revisar briefs", "kind": "navigate", "target": "/dashboard#tendencies", "primary": true },
      { "label": "Descartar batch", "kind": "rpc", "target": "reject_trend_batch", "params": { "batch_id": "d3ad57ba-..." } }
    ],
    "vera": { "confidence": 0.82, "items_count": 5, "tokens": 4200 }
  }
}
```

### Notif 2 · Propuestas estratégicas

```json
{
  "title": "Vera generó 3 propuestas estratégicas",
  "body": "## Análisis semanal\n\nVera analizó tu data + mercado + competencia y propone **3 acciones priorizadas**:\n\n### 1. Lanzar campaña 'After Hours' (confidence 0.91)\n...\n### 2. Reformatear copy de Snowboard Pro (confidence 0.78)\n...\n### 3. Pausar campaña de Snowboard Minimal (confidence 0.85)\n...",
  "severity": "opportunity",
  "status": "pending",
  "metadata": {
    "label": "VERA · PROPUESTA",
    "summary": "3 acciones priorizadas con data + mercado + competencia",
    "subject": {
      "type": "recommendation_batch",
      "id": "a3000000-0000-0000-0000-000000000001",
      "label": "Semana 19-2026 · 3 propuestas"
    },
    "checklist": [
      { "id": "read", "label": "Leer cada propuesta y su evidencia" },
      { "id": "decide", "label": "Decidir aprobar / rechazar / iterar" },
      { "id": "execute", "label": "Las aprobadas pasan a producción automática" }
    ],
    "actions": [
      { "label": "Revisar propuestas", "kind": "navigate", "target": "/dashboard#strategy", "primary": true },
      { "label": "Aprobar todas", "kind": "rpc", "target": "approve_all_recommendations", "params": { "batch_id": "a3000000-..." } }
    ]
  }
}
```

### Notif 3 · Marcas emergentes

```json
{
  "title": "4 marcas emergentes detectadas",
  "body": "Top 4 brands detectadas con frecuencia creciente en búsquedas relacionadas a tu sector:\n\n- **nos** (mentions/week: 142)\n- **alani** (mentions/week: 98)\n- **boost** (mentions/week: 87)\n- **raptor** (mentions/week: 71)\n\nAprobar = empezar a monitorearlas (scrape diario + auto-análisis).",
  "severity": "opportunity",
  "status": "pending",
  "metadata": {
    "label": "MERCADO · TENDENCIA",
    "summary": "nos, alani, boost, raptor apareciendo en búsquedas del sector",
    "subject": {
      "type": "emerging_brand_batch",
      "id": "emerg-2026-05-05",
      "label": "Detección 5-may · 4 marcas"
    },
    "checklist": [
      { "id": "review", "label": "Revisar evidencia (mentions, contexto)" },
      { "id": "approve_each", "label": "Aprobar individualmente las que apliquen" },
      { "id": "configure", "label": "Configurar cadencia de monitoreo" }
    ],
    "actions": [
      { "label": "Revisar y aprobar", "kind": "navigate", "target": "/monitoring?tab=emerging", "primary": true },
      { "label": "Aprobar todas", "kind": "rpc", "target": "approve_all_emerging", "params": { "batch_id": "emerg-2026-05-05" } },
      { "label": "Ignorar", "kind": "rpc", "target": "dismiss_emerging_batch", "params": { "batch_id": "emerg-2026-05-05" } }
    ]
  }
}
```

## 3. Plan en fases

| Fase | Trabajo | Estado |
|---|---|---|
| **0a** | NotificationBell consume RPCs nuevas (`list_my_org_notifications`, etc) | ✅ commit `8043751` |
| **0b** | `_resolveActionUrl` prefija `/org/{short}/{slug}` | ✅ commit `d5891fe` |
| **1A** | Spec del modelo rico (este doc) | 🟢 ESTE TURNO |
| **1B** | Frontend: card rica + render + CSS + checklist con localStorage | 🟢 ESTE TURNO |
| **1C** | Backfill SQL para las 3 notifs actuales con `metadata.{label, summary, subject, checklist, actions}` | 🟢 ESTE TURNO |
| **1D** | `_buildSubjectUrl(subject)` helper + integración en card | 🟢 ESTE TURNO |
| **1E** | `_runAction(action)` ejecutor unificado de navigate/external/rpc/modal | 🟢 ESTE TURNO |
| **2A** | DDL: `org_notification_user_state` + columna `checklist_progress jsonb DEFAULT '{}'` | ✅ 2026-05-11 |
| **2B** | RPC `mark_org_notification_checklist_step(notif_id, step_id, done)` + GRANT authenticated | ✅ 2026-05-11 |
| **2C** | `list_my_org_notifications` extendida con `my_checklist_progress` en el output | ✅ 2026-05-11 |
| **2D** | Frontend: cache `_checklistCache` Map + toggle optimista + RPC en background con revert si falla | ✅ 2026-05-11 |
| **3A** | Backend (ai-engine): productores escriben `metadata` rico desde el origen | 🔴 requiere SSH ai-engine |
| **3B** | Mapeo automático de Vera → notif (cuando Vera ejecuta una acción autónoma, dispara una notif con su plan) | 🔴 backend |

## 4. Definition of Done (Fase 1)

- [ ] Card rica renderiza correctamente las 3 notifs de Arde Agency.
- [ ] Click en subject card navega al recurso real (`_buildSubjectUrl`).
- [ ] Click en acción `kind: navigate` resuelve org prefix y navega.
- [ ] Click en acción `kind: external` abre `_blank`.
- [ ] Click en acción `kind: rpc` ejecuta la RPC + dispatch `notifications-updated` + cierra la card si la RPC reporta éxito.
- [ ] Checkboxes locales (localStorage) marcan progreso. Persiste entre sesiones del browser.
- [ ] Estado de tarea muestra "X de N completadas" basado en checklist + checkboxes locales.
- [ ] Notifs legacy (sin `metadata.{summary, subject, ...}`) caen al render plano sin romper.
- [ ] Backfill aplicado: las 3 notifs actuales muestran el modelo rico.

## 5. Bitácora

### 2026-05-11

- Spec creada con vocabulario controlado de etiquetas y mapeo de subject types.
- Comienzo de Fase 1B + 1C + 1D + 1E en este turno.

---

_Última actualización: 2026-05-11_
