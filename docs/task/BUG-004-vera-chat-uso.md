---
id: BUG-004
title: VeraView — verificar end-to-end con un mensaje real (no es un bug técnico)
severity: low
type: test
status: open
auto_eligible: no
auto_eligible_reason: requiere prueba interactiva en browser real con cuenta autenticada
est_duration: short
created: 2026-05-05
updated: 2026-05-05
owner: -
---

# BUG-004 · Verificar VeraView end-to-end

## Actualización 2026-05-05 — diagnóstico backend

Auditado todo el backend sin tocar browser. **No se encontró bug técnico.**

### Por qué la versión original del task se equivocó

Reportaba que `openclaw_instances.request_count = 0` y `last_request_at = NULL` desde el provisioning del 13/4. Eso se leía como "VeraView nunca recibió un request real".

**Realidad:** esos campos NO se incrementan en cada `/chat`. Sólo se actualizan en `openclaw.provisioner.js` (al provisionar/redeployar) y en `openclaw.registry.js` (al reconstruir el registry). No son contadores de uso. La fuente de verdad real es `ai_messages`.

### Lo que sí está confirmado funcionando

| Componente | Estado | Evidencia |
|---|---|---|
| Proxy `/api/ai/engine-chat` (Netlify Function) | ✅ vivo | `curl POST` → `400 organization_id requerido` (handler responde) |
| `VeraView.js` accesible vía CDN | ✅ 200 OK | `curl HEAD` |
| Ruta `/vera` registrada | ✅ | `Navigation.js:288, 1586` |
| `chat.controller.js` lógica | ✅ | guarda user msg → responde `processing` < 1s → fire-and-forget `processAndSaveReply` |
| Realtime de `ai_messages` y `ai_conversations` | ✅ | `pg_publication_tables` los lista |
| Servicio `ai-engine` corriendo | ✅ | systemd active, scraper completa ciclos |
| Último flujo completo confirmado | ✅ 2026-04-30 | user "prueba 2" → assistant "PONG" en `ai_messages` |

### Hipótesis correcta

**Hipótesis #5 del archivo original**: solo es falta de uso. El último mensaje de contenido real fue el 2026-04-13 ("ADN de marca IGNIS"). El 30-04 alguien hizo un ping → PONG. No hay bug, hay 22 días sin que un usuario abra el chat de Vera.

## Acción pendiente — humano (browser)

1. Login en `https://aismartcontent.io` con la cuenta del piloto.
2. Navegar a `/org/{shortId}/{slug}/vera`.
3. Network tab abierto. Escribir un mensaje real (no "ping"): ej. *"¿Cómo está mi marca esta semana?"*.
4. Verificar:
   - POST a `/api/ai/engine-chat` responde 200 con `{conversation_id, status:'processing'}`.
   - Aparece nueva fila en `ai_messages` con `role='user'`.
   - En 5-30s, llega respuesta `role='assistant'` vía Supabase Realtime (sin reload).

## Si la prueba falla

Solo entonces volver a abrir el bug con el síntoma específico (network code, payload, error en consola).

## Mejora opcional (no bloquea esta task)

`openclaw.adapter.js:_callRemoteOpenClaw` podría agregar `UPDATE openclaw_instances SET request_count = request_count + 1, last_request_at = now()` después de cada fetch exitoso al org-server. Eso convertiría esos campos en métricas reales de uso. ~5 líneas. Si se hace, queda como mejora separada.

## Criterio de done

- 1 mensaje real (no ping) escrito desde browser autenticado.
- Respuesta de Vera renderizada en UI sin reload.
- Si todo funcionó: comunicar a clientes piloto que el chat está vivo y cerrar este task.
