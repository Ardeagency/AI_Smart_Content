---
id: FEAT-011
title: Botón "Programar" en StudioView — desbloquea cadena de schedule end-to-end
severity: high
type: feature
status: open
auto_eligible: no
auto_eligible_reason: toca UX visible (formulario de programación) y requiere validación visual
est_duration: medium
created: 2026-05-05
owner: -
---

# FEAT-011 · Botón "Programar" en StudioView

## Objetivo

Permitir al usuario programar un flujo automatizado desde Studio. Hoy la cadena BD → pg_cron → n8n **está completamente cableada**, pero **no hay botón** para hacer el INSERT en `flow_schedules`. El placeholder explícito `Resumen — Próximamente` (`StudioView.js:82-92`) bloquea toda la automatización para los usuarios.

## Contexto

Cadena verificada en BD:

```
[Frontend] StudioView → ❌ INSERT en flow_schedules (status='active')
                              ↓
[Supabase BD] tr_sync_flow_cron AFTER INSERT/UPDATE/DELETE   ✅ EXISTE
                              ↓
[Supabase BD] sync_flow_to_cron() trigger function           ✅ EXISTE
   • cron.schedule(NEW.job_name, NEW.cron_expression,
                   format('SELECT execute_scheduled_flow(%L)', NEW.id))
                              ↓
[pg_cron] dispara → execute_scheduled_flow(p_schedule_id)    ✅ EXISTE
   • Si flow.flow_category_type='scraping' → rpc_intelligence_context()
   • Si no → rpc_ai_full_brand_product_context()
   • net.http_post(webhook_url, payload)
                              ↓
[n8n] webhook ejecuta orquestación   ardeagency.app.n8n.cloud / hooks.arde.agency
```

**Solo falta el primer eslabón: el botón en frontend.**

## Inputs del formulario

Schema esperado en `flow_modules.input_schema` del primer módulo (ya documentado en `docs/AUTOMATED_FLOW_SCHEDULE_INPUTS.md`):

```json
{
  "fields": [
    { "key": "cron_expression", "input_type": "cron_schedule", "required": true },
    { "key": "entity_id", "input_type": "entity_selector", "required": false },
    { "key": "campaign_id", "input_type": "campaign_selector", "required": false },
    { "key": "audience_id", "input_type": "audience_selector", "required": false },
    { "key": "aspect_ratio", "input_type": "aspect_ratio", "options": ["1:1","9:16","16:9","4:5"], "required": true },
    { "key": "production_count", "input_type": "number", "min": 1, "max": 10, "defaultValue": 1 },
    { "key": "production_specifications", "input_type": "textarea", "required": false }
  ]
}
```

## Pasos

1. **Auditar discrepancia de schema repo vs BD** sobre `flow_schedules` columns:
   - Repo (`SQL/schema.sql`) tiene singulares: `entity_id, campaign_id, audience_id`
   - BD real tiene plurales: `entity_ids[], campaign_ids[], audience_ids[]` + `composition_mode`
   - Decidir cuál es el contrato actual (la BD probablemente).
2. Implementar panel "Resumen" en `StudioView.js:82-92` que muestre preview del schedule antes de guardar.
3. Implementar botón "Programar" que recolecte:
   - `cron_expression` desde el widget cron del form
   - `entity_ids`, `campaign_ids`, `audience_ids` (arrays) desde selectores
   - `aspect_ratio`, `production_count`, `production_specifications`
   - `metadata_config` (jsonb opcional)
   - `job_name` autogenerado: `${flow_slug}_${timestamp}` o input del usuario
4. INSERT a `flow_schedules`:
   ```js
   const { data, error } = await supabase.from('flow_schedules').insert({
     flow_id: flowId,
     user_id: currentUser.id,
     organization_id: orgId,
     brand_id: brandId,
     cron_expression,
     job_name,
     entity_ids,
     campaign_ids,
     audience_ids,
     aspect_ratio,
     production_count,
     production_specifications,
     status: 'active'
   }).select().single();
   ```
5. Verificar que `cron.job` recibe la nueva entrada vía trigger:
   ```sql
   SELECT jobid, jobname, schedule, command, active
   FROM cron.job
   WHERE jobname = '<el job_name del INSERT>';
   ```
6. Confirmar primera ejecución manual con `cron.schedule_in_database(...)` o esperando al schedule natural.
7. Mostrar toast de éxito + redirección a `TasksView` con la nueva tarea visible.

## Criterio de done

- Usuario puede crear un schedule desde Studio en 1 minuto.
- El INSERT genera fila en `flow_schedules` con `status='active'`.
- `cron.job` muestra el job correspondiente.
- Primera ejecución dispara webhook a n8n correctamente (verificar en `pg_net.http_request_queue` o logs n8n).
- TasksView lista el schedule recién creado con su próxima ejecución legible.

## Tareas relacionadas

- DATA-003 — limpiar zombie cron `production_master_autonomous_v1` antes/después.
- Verificar que workflows en n8n cloud están activos para los 4 flows autopilot.
