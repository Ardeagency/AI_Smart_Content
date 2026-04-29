---
id: BUG-001
title: Body missions tipo competitor_signal_analysis colgadas desde 27/4
severity: critical
type: bug
status: open
created: 2026-04-29
owner: -
---

# BUG-001 · Body missions colgadas

## Síntoma

13 filas en `body_missions` con `status='pending'` desde **2026-04-27**, principalmente con `mission_type` ∈ `competitor_signal_analysis`, `execute_update_persona`. Ningún `mission_run` asociado se ha completado para estos tipos desde **2026-04-21** (8 días).

El pipeline upstream está sano: `intelligence_signals` entran, `vera_pending_actions` se aprueban, `mission-generator` corre cada 5 min y sí crea las `body_missions` correspondientes. **El problema es río abajo**: el `action-executor` o el `job-worker` no procesa estos tipos.

## Evidencia

```sql
-- 13 misiones pending con tipo competitor_signal_analysis
SELECT id, mission_type, status, created_at
FROM body_missions
WHERE status = 'pending'
ORDER BY created_at DESC LIMIT 20;

-- Última mission_run completada
SELECT max(completed_at) FROM mission_runs WHERE status = 'completed';
-- → 2026-04-21T10:36:14
```

Backups visibles en disco que apuntan a cambios recientes en el dispatcher:
- `services/action-executor.service.js` (sin .bak observado, pero archivos relacionados sí)
- `services/agent.manager.js.bak.20260428-droplegacy`
- `services/tool.dispatcher.js.bak.20260428-align`
- `services/tool.dispatcher.js.bak.20260428-brandcontent`
- `controllers/internal.controller.js.bak.20260428-events`

## Hipótesis

Algún cambio del 28/4 en `tool.dispatcher.js` o `agent.manager.js` (drop-legacy / align / brandcontent) eliminó o renombró el handler de `competitor_signal_analysis` y `execute_update_persona`. El dispatcher recibe la mission, no encuentra handler, y el flujo muere silenciosamente sin marcar fallo.

Alternativamente: el handler existe pero está depende de algún state que cambió (e.g. ya no espera signals con cierto `signal_type`).

## Pasos para resolver

1. SSH al ai-engine y comparar:
   ```bash
   ssh ai-engine '
     diff /root/ai-engine/src/services/tool.dispatcher.js \
          /root/ai-engine/src/services/tool.dispatcher.js.bak.20260428-align
   '
   ```
2. Buscar referencias al mission_type:
   ```bash
   ssh ai-engine 'grep -rn "competitor_signal_analysis\|execute_update_persona" /root/ai-engine/src/ | grep -v ".bak"'
   ```
3. Inspeccionar logs del 27-29/4 con foco en estos tipos:
   ```bash
   ssh ai-engine 'grep -E "competitor_signal_analysis|update_persona" /root/ai-engine/ai-engine.log | tail -60'
   ```
4. Identificar dónde rompió el dispatch (handler missing / lookup falla / etc.).
5. Reparar o restaurar el handler.
6. Restart `ai-engine` y probar manualmente con una de las missions colgadas:
   ```sql
   UPDATE body_missions SET status='pending' WHERE id = '<one_id>';
   ```

## Criterio de done

- Después de fix, todas las 13 missions colgadas pasan a `status='completed'` o `failed` (con razón clara) en menos de 30 min.
- Query de verificación devuelve 0:
  ```sql
  SELECT count(*) FROM body_missions
  WHERE status = 'pending' AND created_at < now() - interval '15 minutes';
  ```
- `mission_runs.completed_at` registra runs nuevos para `competitor_signal_analysis`.
- Documentar la causa raíz en este archivo antes de borrarlo (commit message + nota en `09-current-state.md`).
