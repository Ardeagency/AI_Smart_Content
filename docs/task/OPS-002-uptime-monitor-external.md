---
id: OPS-002
title: Uptime monitor externo (Better Stack / UptimeRobot)
severity: low
type: ops
status: open
auto_eligible: no
auto_eligible_reason: requiere registrarse en servicio externo con cuenta del usuario
est_duration: short
created: 2026-04-29
owner: -
---

# OPS-002 · Uptime monitor externo

## Síntoma / riesgo

Si el ai-engine, cloudflared o aismartcontent.io caen, no hay alerta proactiva. Hoy se descubre cuando un usuario reporta o se nota error en consola.

## Acción

Configurar monitor externo (alguno de):

- **UptimeRobot** (free 50 monitores, 5 min interval): `https://uptimerobot.com`
- **Better Stack** (free tier con 10 monitores, 30s interval): `https://betterstack.com`
- **Cronitor** (free tier 5 monitores)

Endpoints a vigilar:
- `https://aismartcontent.io/` — frontend
- `https://api.aismartcontent.io/server/health` — ai-engine
- `https://api.aismartcontent.io/webhooks/run-scraper` (con auth) — pipeline activo

Notificaciones a `info@ardeagency.com` cuando:
- Status code != 200 dos veces consecutivas.
- Latencia > 3s en 3 checks.

## Criterio de done

- 3 monitores configurados.
- Email de prueba recibido.
- Documentar URL del dashboard de monitor en `docs/platform/08-deployment.md`.
