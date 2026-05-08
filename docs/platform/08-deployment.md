---
title: 08 — Deployment & operaciones
author: Shenoa — Arde Agency S.A.S.
since: 2025-09
last_review: 2026-04-29
audience: humanos del equipo + LLMs
---

# 08 · Deployment & ops

## Topología productiva

```
                    ┌────────────────────────┐
                    │  GitHub                │
                    │  Ardeagency/           │
                    │  AI_Smart_Content      │
                    │  branch: main          │
                    └─────────┬──────────────┘
                              │ push
                              ▼
   ┌──────────────────────────────────────────┐
   │  Netlify (CI/CD + CDN)                   │
   │  - Build: sed __BUILD_ID__ → COMMIT_REF  │
   │  - Deploy: estático + 28 functions       │
   │  - Domain: aismartcontent.io             │
   │  - Edge: Cloudflare CDN                  │
   └──────────────────┬───────────────────────┘
                      │
                      ▼
              user browser (SPA)
                      │
                      │ supabase-js + Netlify Functions
                      ▼
   ┌──────────────────────────────────────────┐
   │  Supabase (Postgres 17.6 managed)        │
   │  Region: us-east-1 (default)             │
   │  Project: tsdpbqcwjckbfsdqacam           │
   │  Plan: Pro (probable)                    │
   │  Realtime + Auth + Storage + Edge Funcs  │
   └──────────────────┬───────────────────────┘
                      │ pg_net.http_request
                      │ (HMAC firmado)
                      ▼
   ┌──────────────────────────────────────────┐
   │  Hetzner CCX33 (Ubuntu 22.04 ARM64)      │
   │  Hostname: ubuntu-32gb-ash-1             │
   │  Public IP: (vía Cloudflared, sin :3000) │
   │  Storage: 226G                           │
   │  RAM: 32G                                │
   │  Servicios:                              │
   │    - ai-engine.service (Express :3000)   │
   │    - cloudflared.service (vera-prod)     │
   │    - openclaw-gateway × 2 (localhost)    │
   │  Acceso SSH: alias `ai-engine`           │
   └──────────────────────────────────────────┘
```

Domain map:
- `aismartcontent.io` → Netlify (frontend + functions)
- `api.aismartcontent.io` → Cloudflared tunnel → Hetzner :3000

## Frontend: Netlify

### Auto-deploy

`main` → Netlify build → producción. Memoria del proyecto: **push=deploy**.

### `netlify.toml`

```toml
[build]
  command = "sed -i \"s/__BUILD_ID__/$COMMIT_REF/g\" index.html css/bundle.css js/app.js"
  publish = "."

[functions]
  directory = "functions"
```

`COMMIT_REF` lo expone Netlify automáticamente. El sed inyecta el SHA en archivos críticos para invalidar cache.

### Functions

`/functions/*.js` — 28 funciones lambda. Configuradas con `[functions]` directory en `netlify.toml`. Acceden a env vars desde Netlify Dashboard (no `.env` local).

Env vars de Netlify (configuradas en dashboard):
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (para functions con privilegio)
- `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN` (Meta integrations)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Google OAuth)
- `KLING_*`, `KIE_*` (proveedores de video)
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- `INTERNAL_ADMIN_TOKEN` (para llamar al ai-engine)

### Cache invalidation

Estrategia hibrida:
- `index.html`, `css/bundle.css`, `js/app.js` → sed reemplaza `__BUILD_ID__` → URLs con `?v=<COMMIT_SHA>` invalidan cache CDN.
- Otros JS lazy-loaded → `BaseView.loadScript()` agrega `?v=APP_LAZY_SCRIPT_VER` automáticamente.
- Assets (imágenes, fonts) → cache 7 días por defecto Netlify.

⚠️ **Trampa histórica**: archivos no incluidos en el sed quedaban cacheados 7 días por Cloudflare aunque el deploy aplicara. Resuelto con commit 961b5fb agregando `?v=__BUILD_ID__` a todos los `<script>` de `index.html`.

### Local dev

```bash
netlify dev   # arranca en localhost:8888 con Functions activas
```

O simplemente abrir `index.html` (sin functions, supabase-js corre desde browser).

## Backend: Hetzner

### Provisión inicial

VM CCX33 (32GB RAM, 8 vCPU, 226GB SSD) — ~€33/mes. ARM64 architecture.

**Paquetes instalados** (a inferir, no auditados todos):
- Node.js (Express + apify-client; Playwright in-house fue removido en migración Apify del 2026-04-28)
- Python3 (fail2ban, scripts)
- nginx (no detectado, probablemente no usado — Cloudflared expone :3000 directo)
- pm2 instalado pero **vacío** — todo va por systemd

### Servicios systemd

```bash
systemctl status ai-engine     # Express :3000
systemctl status cloudflared   # tunnel vera-prod
```

Ver definiciones en `04-ai-engine.md` (sección "Topología").

### SSH access

Alias en `~/.ssh/config` local:

```
Host ai-engine
  HostName <IP-de-Hetzner>
  User root
  IdentityFile ~/.ssh/<key>
```

Acceso confirmado: `ssh ai-engine 'whoami'` → `root`.

### Cloudflared tunnel

`/etc/cloudflared/config.yml` define el tunnel `vera-prod` que mapea:

```yaml
tunnel: <tunnel-uuid>
credentials-file: /root/.cloudflared/<uuid>.json

ingress:
  - hostname: api.aismartcontent.io
    service: http://localhost:3000
  - service: http_status:404
```

Beneficios:
- No exponer puertos públicos en Hetzner.
- HTTPS automático (Cloudflare TLS).
- DDoS protection.
- IP origin oculta.

### Backups y disaster recovery

**Estado actual:**
- BD: Supabase Pro incluye backups automáticos (7 días retention típicamente).
- Hetzner VM: ningún backup formal (probable). Snapshots manuales recomendados.
- Código: GitHub es el backup canónico.
- `.env` del ai-engine: **único punto de fallo** — si la VM muere, recuperar `.env` es manual.

**Recomendación pendiente:**
1. Habilitar Hetzner snapshots semanales.
2. Sync `.env` a un secret manager (1Password / Vault / Bitwarden CLI).
3. Documentar runbook de "VM destruida → bootstrap nueva en X pasos".

## Variables de entorno

### Frontend (browser-side)

Mínimas, expuestas en `js/runtime-config.js`:
- URL del ai-engine.
- Feature flags públicos.

Las API keys de Supabase (anon) las trae el cliente `supabase-js` desde `/api/supabase-config` (Netlify Function que las inyecta).

### Frontend (Netlify Functions)

Configuradas en Netlify Dashboard → Site → Environment Variables. No en `.env` local.

### Backend (ai-engine)

`/root/ai-engine/.env` (chmod 600, en disco). Lista completa en `04-ai-engine.md`.

### Local dev / Claude Code

`/Users/ardeagency/Documents/ARDE AGENCY/WEB/AI Smart Content/.env.local` — secrets para Claude Code y scripts locales:
- `SUPABASE_DATABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`.
- `SUPABASE_ACCESS_TOKEN` (Management API token, scope `sbp_*`).
- `SUPABASE_PROJECT_REF`.

`chmod 600`, gitignored.

### Repos auxiliares

`~/.claude/arde-tools/meta-api/.env` — credenciales Meta para herramientas locales de Claude.

## Runbooks

### Deploy hotfix urgente

```bash
git add <archivos>
git commit -m "fix: descripción"
git push origin main
# Netlify build ~30s-2min
# Tras build, hard-refresh browser → Cmd+Shift+R
```

Para verificar deploy aplicado:

```bash
curl -s "https://aismartcontent.io/" | grep "app.js?v=" | head -1
# Debe mostrar el SHA nuevo después del deploy
```

### Restart ai-engine sin downtime

```bash
ssh ai-engine 'systemctl restart ai-engine'
# ~2 segundos. Requests caen y vuelven.
# Verificar:
ssh ai-engine 'systemctl status ai-engine | head -5'
```

### Inspeccionar logs

```bash
# AI Engine
ssh ai-engine 'tail -200 /root/ai-engine/ai-engine.log'
ssh ai-engine 'journalctl -u ai-engine -n 100 --no-pager'

# Cloudflared
ssh ai-engine 'journalctl -u cloudflared -n 50 --no-pager'

# Netlify Functions
# → Netlify Dashboard → Functions → seleccionar function → Logs
```

### Aplicar SQL a Supabase

**Opción A — Management API (recomendado para LLMs):**

```bash
SQL=$(cat archivo.sql)
curl -s -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg q "$SQL" '{query: $q}')"
```

Corre como `postgres` (bypass RLS). Útil para DDL.

**Opción B — SQL Editor del Dashboard:**

`https://supabase.com/dashboard/project/tsdpbqcwjckbfsdqacam/sql/new`

**Opción C — `supabase` CLI** (no configurado todavía).

### Debug de signal webhook

```bash
# 1. Verificar que el trigger existe
curl Mgmt-API → SELECT tgname FROM pg_trigger WHERE tgname LIKE '%signal%';

# 2. Insertar señal de test
INSERT INTO intelligence_signals (entity_id, signal_type, content_text)
VALUES ('<entity_id>', 'mention', 'test mention');

# 3. Ver logs en ai-engine inmediatamente
ssh ai-engine 'tail -50 /root/ai-engine/ai-engine.log | grep signal-webhook'

# 4. Verificar que se creó job
SELECT * FROM agent_queue_jobs ORDER BY created_at DESC LIMIT 5;
```

### Reset de cache de Cloudflare

Cuando un deploy aplica pero el browser sigue sirviendo viejo:

1. **Hard refresh** del browser (Cmd+Shift+R) — ignora cache local.
2. Si persiste: revisar que el archivo tenga `?v=__BUILD_ID__`.
3. Último recurso: purge manual desde Netlify Dashboard → Site → Settings → Build & deploy → Post processing → Cache → Clear cache and deploy.

### Provisionar VM nueva (futuro)

Patrón implementado en `hetzner.provisioner.js`:

```js
const server = await hetzner.createServer({
  name: `aismart-org-${orgShortId}`,
  server_type: 'ccx13',
  image: 'ubuntu-22.04',
  ssh_keys: [HETZNER_SSH_KEY_ID],
  user_data: cloudInitYaml,
});
// → openclaw_instances ← INSERT { server_id, ip_address, status: 'provisioning' }
// → cloud-init script clona ai-engine + configura .env + arranca services
```

## Seguridad — superficie de ataque

| Vector | Mitigación |
|---|---|
| Brute-force SSH | fail2ban activo |
| Prompt injection a Vera | `tool-call.validator.js` injection check |
| RLS bypass | `is_org_member` consistente, RPCs `SECURITY DEFINER` con check explícito |
| Webhook spoofing | HMAC SHA-256 con `SUPABASE_WEBHOOK_SECRET` |
| Token refresh exploits | `token-refresh.service` valida expiración + refresh proactivo |
| API rate limits Meta/Google | retry con backoff en sensores |
| Secrets en logs | filtros en `request-logger.js`, nunca log full bodies |
| CSRF | JWT en localStorage + Origin check |
| XSS | Vanilla JS escape consistente, no innerHTML con user data sin sanitizar |
| File upload abuse | Storage buckets con MIME type checks; size limits |

`SECURITY.md` en raíz del repo documenta política de divulgación.

## Monitoring (recomendaciones, no implementado todo)

**Lo que sí existe:**
- `system_metrics` (70k filas) — health logs internos del ai-engine.
- `developer_logs`, `developer_notifications`, `developer_stats`.
- `sensor_runs.status` permite auditar fallas de sensores.

**Lo que falta:**
- Alertas externas (Pagerduty / OpsGenie / Slack webhook).
- Uptime monitor externo (UptimeRobot / Better Stack) sobre `/server/health`.
- Dashboard de métricas operativas (DataDog / Grafana o uno propio en `/dev/`).

**Métricas a vigilar:**
- ai-engine memory > 8GB → posible memory leak.
- ai-engine restart > 3/día → buscar crash loop en logs.
- Sensor failures > 5% sobre runs últimas 24h → alerta.
- agent_queue_jobs > 10 queued > 5 min → worker congestionado.
- Supabase: rows count growth, connection pool, slow query log (`pg_stat_statements`).

## Costos estimados (orden de magnitud)

| Servicio | Costo mensual aprox |
|---|---|
| Hetzner CCX33 ARM | €33 (~$36) |
| Supabase Pro | $25 |
| Netlify Pro | $19 (incluido en plan team) |
| Cloudflare (free) | $0 |
| Anthropic Claude (Opus) | $50-200 según uso de Vera |
| OpenAI embeddings | $1-5 |
| Decodo proxies (scrapers) | $30-100 según volumen |
| Domain + DNS | $1-2 |
| **Total estimado** | **~$160-400/mes** |

A escala (10+ orgs activas), Hetzner VMs adicionales se provisionan dinámicamente.

## Checklist de deployment correcto

Antes de declarar un cambio "live" verificar:

- [ ] Commit pushado a `main`
- [ ] Netlify build completado (verde en Dashboard)
- [ ] `aismartcontent.io` carga sin errores en consola
- [ ] Login funciona
- [ ] Dashboards cargan datos
- [ ] No hay 400/500 en Network tab
- [ ] Si el cambio toca el ai-engine: SSH + restart + tail logs
- [ ] Si el cambio agrega RPC/tabla: verificar con Mgmt API que existe en BD
- [ ] Si el cambio toca realtime: verificar que `pg_publication_tables` incluye la tabla
- [ ] Hard refresh browser (Cmd+Shift+R) post-deploy si hay frontend changes

---

*Anterior: [07 — Vera](./07-vera.md) · Siguiente: [09 — Estado actual](./09-current-state.md)*
