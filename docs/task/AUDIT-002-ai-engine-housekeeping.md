---
id: AUDIT-002
title: Auditoría ai-engine — bug histórico enum + repo sin commits + archivos .bak
severity: medium
type: ops
status: open
auto_eligible: no
auto_eligible_reason: requiere SSH + decisiones de versionado del código del ai-engine
est_duration: medium
created: 2026-05-08
target_delivery: -
owner: -
related:
  - SSH: `ssh ai-engine` (Hetzner CCX33, Ubuntu 22.04)
  - reference_server_ai_engine.md (memory)
  - origen: investigación de "The Minimal Snowboard sin imagen" (frontend OK,
    Shopify origen sin imagen — no era bug del flow)
---

# AUDIT-002 · Housekeeping del ai-engine

> **Contexto:** durante la investigación de un producto Shopify sin imagen
> ("The Minimal Snowboard") se confirmó que el frontend, el populator y el
> bootstrap están sanos: el producto no tiene imagen en la dev store de
> origen. Pero al investigar se descubrieron tres deudas técnicas en el
> ai-engine que vale la pena documentar para resolverlas dedicadamente.

## 1. Resumen de hallazgos

### 🟡 H1 · Bug histórico del enum `tipo_producto_enum`

Los logs del 2026-05-08 17:17:42–17:17:45 muestran 17 productos fallando con:

```
shopify-populator: product 1510575XXXXXX failed:
invalid input value for enum tipo_producto_enum: "fisico"
```

El enum válido (`SELECT enumlabel FROM pg_enum...`) NO incluye `"fisico"`.
El código actual de `mapShopifyProductType` (en
`src/services/populators/shopify.populator.js:236-282`) usa `"otro"` como
default y no contiene la cadena `"fisico"` en ningún lado.

**Conclusión:** el bug existía en una versión previa del código (hoy ya
arreglado). El segundo sync de las 17:21:01 recuperó los productos
fallidos. Pero hubo un período de inconsistencia entre las 17:17 y 17:21
donde 17 productos quedaron orphaned en `external_resource_map` sin
contraparte en `public.products`.

**A revisar:**
- ¿Hay rows en `external_resource_map` con `internal_id IS NULL` para esos
  shopify_ids? (orphans residuales)
- ¿El sync periódico los recoge en cada pasada o quedaron stuck?
- ¿Hay test/regresión que evite que `tipo_producto: "fisico"` vuelva a salir?

### 🔴 H2 · Repo ai-engine sin commits

```bash
ssh ai-engine "cd ~/ai-engine && git log"
# fatal: your current branch 'master' does not have any commits yet
```

El código del ai-engine vive **sin historial git**. Cualquier cambio que
hagamos (incluido el cleanup de los .bak) es destructivo sin red de
seguridad.

**A hacer:**
1. Verificar `.gitignore` (existe, 270 bytes) — confirmar que ignora
   `.env`, `.env.bak.*`, `node_modules/`, `*.pid`, `*.log`.
2. `git add -A && git commit -m "initial: ai-engine snapshot 2026-05-08"`.
3. Configurar `git remote add origin <url>` si decidimos versionar fuera
   del servidor (GitHub privado de Ardeagency).
4. Establecer convención de commits (Conventional Commits + Co-Authored-By).

⚠️ **Cuidado:** existen archivos `.env`, `.env.bak.*`, `ai-engine.log`,
`ai-engine.pid` en `~/ai-engine/`. Verificar `.gitignore` ANTES del
primer commit para no exponer secretos.

### 🟢 H3 · Archivos `.bak` en `src/`

Encontrados en `~/ai-engine/`:

```
./src/index.js.bak.before-shopify
./src/index.js.bak.shopify-routes-removed
./src/services/job-worker.service.js.bak.before-shopify-phase2
./.env.bak.before-shopify-20260507_110042
./.env.bak.before-shopify-cleanup-20260507_144134
```

Patrón: backups manuales antes de cambios destructivos. Después de tener
historial git (H2), estos sobran.

**A hacer:**
- Después de aplicar H2: `find ~/ai-engine -name "*.bak.*" -delete`.
- Antes de H2: dejarlos como están (única red de seguridad actual).

## 2. Cómo conectarse

```bash
ssh ai-engine
cd ~/ai-engine
systemctl status ai-engine             # estado del service
journalctl -u ai-engine --since '1h'   # logs recientes
```

Credenciales Supabase del ai-engine en `~/ai-engine/.env`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` (nota: NO `SERVICE_ROLE_KEY` como en otros repos)
- `SUPABASE_ANON_KEY`
- `SHOPIFY_API_VERSION` (default `2026-04`)

Para desencriptar tokens cifrados (`enc_v1:...`) usar
`src/lib/integration-token-vault.js` → `decryptToken(stored)`.

## 3. Pasos en orden recomendado

1. **H2 primero** (red de seguridad antes de tocar nada):
   - Revisar `.gitignore`.
   - `git add -A && git commit -m "initial"`.
   - Decidir si va a un remote (Ardeagency/ai-engine privado) o queda local.

2. **H1 después** (bug histórico):
   - Query a `external_resource_map` para detectar orphans.
   - Si los hay: re-encolar `shopify_sync_products` para recuperarlos, o
     decidir purga. Documentar la decisión.
   - Agregar test/check que valide `mapShopifyProductType` retorna solo
     valores del enum.

3. **H3 al final** (cleanup cosmetic):
   - `find ~/ai-engine -name "*.bak.*" -delete`.

## 4. Definition of Done

- [ ] H2: `git log` en ai-engine devuelve al menos 1 commit. `.env` y
      `.env.bak.*` NO trackeados.
- [ ] H1: query confirma 0 orphans en `external_resource_map`. Test de
      regresión del mapper agregado.
- [ ] H3: `find ~/ai-engine -name "*.bak.*"` devuelve vacío.
- [ ] Bitácora actualizada al final.

## 5. Bitácora

### 2026-05-08 — investigación inicial

- Descubrimiento durante diagnóstico de "The Minimal Snowboard sin imagen".
- Verificado vía Shopify Admin API directo: el producto SÍ no tiene
  imagen en origen (no era bug). Frontend y populator OK.
- Hallazgos secundarios (este ticket) documentados.

### 2026-05-12 — H2 + H3 cerrados

- **H2 ✅** Commit inicial `aef6701` en `~/ai-engine` con 202 archivos
  (35.817 líneas). `.gitignore` ampliado: `.env.bak*`, `*.bak`,
  `**/.venv/`, `**/__pycache__/`, `backups/`. Verificado: 0 secrets en
  el repo (`.env.example` confirmado como template con placeholders).
  Remote no configurado — decisión pospuesta.
- **H3 ✅** 21 archivos `.bak` eliminados (más de los 5 documentados):
  2 `.env.bak.before-shopify-*`, 18 `src/*.bak.*` de deploys previos
  (entrega-a, entrega-b, bug001, feat014, feat015, ops006, markdown-fix,
  before-shopify-phase2, before-multiplatform-populators, shopify-routes-removed,
  before-shopify, entrega-a5), 1 `backups/cloudflare-tunnel-credentials.json.bak`
  (duplicado — credencial viva confirmada en `/root/.cloudflared/909ec77e-*.json`
  + `/etc/cloudflared/config.yml`, servicio cloudflared corriendo 3 semanas).
  Servicio `ai-engine` sigue active post-cleanup.
- **H1 ⏳ pendiente** — orphans en `external_resource_map` por bug
  histórico `tipo_producto_enum: "fisico"` del 2026-05-08 17:17. Falta
  query + decisión re-encolar/purgar + test de regresión del mapper.

---

_Última actualización: 2026-05-12 — H2 y H3 cerrados, solo queda H1._
