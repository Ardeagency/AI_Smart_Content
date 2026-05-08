---
id: FEAT-014
title: Anthropic proxy — metering + cap por org (deploy pendiente en VM piloto)
severity: high
type: ops
status: open
auto_eligible: no
auto_eligible_reason: requiere SSH humano a la VM remota del piloto
est_duration: short
created: 2026-05-05
updated: 2026-05-05
owner: -
---

# FEAT-014 · Anthropic proxy con metering + cap por org

## Por qué

OpenClaw es third-party y autónomo. Sin medición intermedia, no sabíamos cuántos tokens consume cada org y no podíamos parar a un agente que se quedara pensando en círculos. Single source of truth para cuánto cuesta Vera por org.

## Qué quedó implementado (2026-05-05)

### Schema BD ✅
- Tabla `public.org_claude_caps(organization_id, daily_usd_cap, monthly_usd_cap, warn_threshold)`. Defaults: $10/día, $200/mes, warn al 80%. RLS solo lectura para miembros de la org.
- Vista `public.v_org_claude_usage_today(organization_id, usd_today, calls_today, input_tokens_today, output_tokens_today)`.
- RPC `public.claude_cap_check(p_org_id)` — devuelve `{blocked, warn, usd_today, usd_month, daily_cap, monthly_cap, warn_threshold}`. Auth: `service_role` (proxy) o `is_org_member` (frontend). Funciona ya: probado con la org `a1000000-...`.

### Proxy (per-VM)
Archivos en `/root/ai-engine/anthropic-proxy/` (staged en ai-engine; también copiados localmente en `/tmp/proxy-impl/`):
- `server.js` (~280 líneas) — proxy Node nativo escuchando `127.0.0.1:8788`. Forward 1:1 de `/v1/messages` a `api.anthropic.com`. Pre-flight cap check via RPC. Post-response: parsea `usage` (JSON o SSE), calcula USD según pricing del modelo, INSERT en `credit_usage` con `kind='vera_chat'` (alineado con el ledger existente — el RPC suma también `claude_describe` que ya generaba el python-analyzer). Falla-abierta si Supabase no responde.
- `anthropic-proxy.service` — systemd unit, ordena `Before=openclaw-bridge.service`.
- `setup-existing-vm.sh` — script idempotente para la VM piloto.

### Pricing embedded
USD por millón de tokens, mayo 2026:

| Modelo | Input | Output | Cache read | Cache write |
|---|---|---|---|---|
| claude-opus-4-x | 15.00 | 75.00 | 1.50 | 18.75 |
| claude-sonnet-4-x | 3.00 | 15.00 | 0.30 | 3.75 |
| claude-haiku-4-x | 1.00 | 5.00 | 0.10 | 1.25 |
| claude-3-5-sonnet | 3.00 | 15.00 | 0.30 | 3.75 |
| claude-3-5-haiku | 0.80 | 4.00 | 0.08 | 1.00 |
| claude-3-opus | 15.00 | 75.00 | 1.50 | 18.75 |

Fallback si modelo no matchea: pricing de Sonnet.

### Provisioner ✅
`hetzner.provisioner.js` editado para que **toda VM nueva** se provisione con:
- `/opt/anthropic-proxy/server.js` (embebido como base64 en cloud-init).
- `/opt/anthropic-proxy/.env` con `ORGANIZATION_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_PROXY_PORT=8788`.
- `/etc/systemd/system/anthropic-proxy.service` arrancado antes que `openclaw-bridge`.
- `/opt/openclaw-bridge/.env` con `ANTHROPIC_BASE_URL=http://127.0.0.1:8788` para que OpenClaw envíe todo el tráfico de Anthropic por el proxy.
- `npm install @supabase/supabase-js` en el setup.sh.
- Health check del proxy antes de seguir.

Backup en server: `hetzner.provisioner.js.bak.feat014`.

ai-engine reiniciado limpio post-deploy.

## Pendiente humano — deploy en VM piloto existente

La única VM viva (`88.99.174.96`, org `a1000000-...`) fue provisionada antes de este cambio. Necesita el proxy instalado manualmente (5 minutos):

```bash
# 1. Subir archivos del proxy a la VM (desde tu Mac, usando tu SSH key personal)
scp /tmp/proxy-impl/server.js \
    /tmp/proxy-impl/anthropic-proxy.service \
    /tmp/proxy-impl/setup-existing-vm.sh \
    root@88.99.174.96:/tmp/

# 2. SSH y ejecutar setup
ssh root@88.99.174.96
mkdir -p /opt/anthropic-proxy
cp /tmp/server.js /opt/anthropic-proxy/server.js
cp /tmp/anthropic-proxy.service /etc/systemd/system/
bash /tmp/setup-existing-vm.sh
# El script pide SUPABASE_URL y SUPABASE_SERVICE_KEY (cópialos del .env del ai-engine)
```

El script:
- Crea `/opt/anthropic-proxy/.env` con ORGANIZATION_ID heredado del bridge.
- `npm install` de las deps del proxy.
- `systemctl enable + start anthropic-proxy`.
- Health check en `/__proxy_health`.
- Edita `/opt/openclaw-bridge/.env` para añadir `ANTHROPIC_BASE_URL=http://127.0.0.1:8788`.
- Reinicia `openclaw-bridge` y mata el `openclaw-gateway` (re-arranca al primer request).

## Verificar que funciona

Después del deploy, mandar un mensaje real desde Vera (ver BUG-004), luego:

```sql
-- Debería tener al menos una fila ~30 segundos después.
SELECT created_at, source_id AS model, usd_cost, metadata->>'input_tokens' AS in_t, metadata->>'output_tokens' AS out_t
FROM credit_usage
WHERE kind = 'vera_chat' AND source_table = 'anthropic_proxy'
  AND organization_id = 'a1000000-0000-0000-0000-000000000001'
ORDER BY created_at DESC LIMIT 5;

-- Resumen del día.
SELECT * FROM v_org_claude_usage_today
WHERE organization_id = 'a1000000-0000-0000-0000-000000000001';

-- Estado de cap.
SELECT public.claude_cap_check('a1000000-0000-0000-0000-000000000001'::uuid);
```

Si `usd_today > 0` post-mensaje → ✅ Vera ya está midiendo y puede aplicar el cap.

## Cap por defecto

Hoy: **$10/día y $200/mes por org, warn al 80%**. Cualquier mensaje cuando se excede → 429 con mensaje "Cap diario alcanzado" que OpenClaw devuelve al usuario.

Para cambiar el cap de una org concreta:
```sql
UPDATE public.org_claude_caps
SET daily_usd_cap = 50, monthly_usd_cap = 1000, warn_threshold = 0.85, updated_at = now()
WHERE organization_id = '...';
```

Nuevas orgs: heredan el default de la tabla. Para tener defaults por plan, agregar trigger BEFORE INSERT en `organizations` que cree la fila correspondiente con cap basado en `plan`.

## Fase 3 — Notifications automáticas ✅ APLICADO 2026-05-05

Trigger `tr_credit_usage_claude_alert AFTER INSERT ON credit_usage` con función `fn_credit_usage_claude_alert()`:

- Filtra por `kind IN ('vera_chat','claude_describe')` y descarta filas <$0.001 para no saturar.
- Llama `claude_cap_check(NEW.organization_id)`. Si `warn=true` o `blocked=true`:
  - Resuelve `owner_user_id` desde `organizations`.
  - **Warn (≥80%):** `type='warning'`, título `Vera al 85% del cap diario — 2026-05-05`, mensaje con consumo actual.
  - **Blocked (≥100%):** `type='error'`, título `Cap diario de Vera alcanzado — 2026-05-05`, mensaje con instrucción.
  - INSERT en `user_notifications` solo si NO existe una con el mismo `(user_id, title)` en las últimas 24h (idempotente).
- `EXCEPTION WHEN OTHERS THEN RETURN NEW` — el trigger nunca rompe el INSERT principal.

**Verificado en Supabase**: insertando filas de prueba ($8.50 y luego $5.00) se generaron 2 notifications (warning al 85%, error al 135%). Datos de prueba limpiados después.

Para cambiar el threshold de warn de una org: `UPDATE org_claude_caps SET warn_threshold = 0.70 WHERE organization_id = '...';`.

## Criterio de done

- VM piloto tiene `anthropic-proxy.service` activo (systemd) y `/__proxy_health` responde 200.
- `journalctl -u anthropic-proxy -n 50` muestra "listening on 127.0.0.1:8788".
- 1 mensaje real de Vera produce ≥1 fila en `credit_usage WHERE kind='vera_chat' AND source_table='anthropic_proxy'` con `usd_cost > 0` y `metadata.input_tokens + output_tokens > 0`.
- `claude_cap_check` devuelve `usd_today` con la suma esperada.
- Si fuerzas un mensaje muy grande para llegar al cap diario, devuelve 429 con mensaje claro.
