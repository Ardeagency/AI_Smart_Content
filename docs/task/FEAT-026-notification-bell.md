---
id: FEAT-026
title: NotificationBell + inbox per-user en navbar (consumir org_notifications)
severity: high
type: feature
status: open
auto_eligible: no
auto_eligible_reason: requiere decisiones de UX (orden, agrupacion, badge logic, modal vs panel)
est_duration: medium
created: 2026-05-22
related: AUDIT-001-frontend-vs-backend-2026-05-05 (origen)
owner: -
---

# FEAT-026 · NotificationBell + inbox per-user

## Sintoma / oportunidad

Backend ya escribe `org_notifications` (per-org broadcast) y `org_notification_user_state` (estado per-usuario: read/unread/dismissed). Vera persiste notificaciones via `createOrgNotification` tool desde 2026-05-21. **Frontend NO consume nada**: no hay bell icon, no hay inbox, no hay badge de unread. El usuario nunca ve lo que Vera le quiere decir fuera del chat.

## Acciones

1. **Componente `NotificationBell`** en `js/components/Navigation.js` (al lado del avatar):
   - Badge con count de unread (`org_notification_user_state.is_read=false` para `user_id=auth.uid()`)
   - Realtime subscribe a INSERT/UPDATE en `org_notifications` para la org activa
   - Click abre panel/drawer lateral con las ultimas 20 notifs

2. **Panel inbox**: cada item muestra `severity` (info/warning/critical), `title`, `body`, `created_at`, `actionUrl?` (link interno) + boton "Marcar leida" / "Dismiss"

3. **Mark-read RPC** o update directo a `org_notification_user_state` con RLS (insert si no existe, update is_read=true)

4. **Severity color coding** segun token system (no hardcodear): info=text-secondary, warning=amber, critical=danger

5. **Empty state**: "No tienes notificaciones nuevas"

## Criterio de done

- Bell visible en navbar de la app (no en `/demo`)
- Badge actualiza en realtime al insertar `org_notifications` desde Vera tool
- Click muestra panel con notifs ordenadas por `created_at DESC`
- Marcar leida → badge baja
- Dismiss → notif desaparece del panel
- `actionUrl` interno navega via `router.navigate()`

## Out of scope

- Push notifications (email/SMS/web-push) — futuro FEAT separado
- Filtros por severity — empezar simple
- Agrupacion por tipo — futuro

## Referencias

- Tabla `org_notifications` (definida en migracion del 2026-05-21)
- Tabla `org_notification_user_state` (per-user inbox state)
- Tool VERA `createOrgNotification` (en `ai-engine/src/tools/vera-feed.tools.js`)
- Origen: `AUDIT-001-frontend-vs-backend-2026-05-05.md` P1
