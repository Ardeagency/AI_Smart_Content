---
id: SEC-004
severity: medium
type: SEC
status: open
created: 2026-07-28
owner: ARDE
programado: esta semana, despues de SEC-001 y SEC-002
---

# Migrar el panel /dev a repo propio, detrás de un identity-aware proxy

## Qué se migra

El portal `/dev/*` completo: **22 vistas** (`DevBaseView`, `Dev*`, `DevLead*`,
`js/views/builder/`), ~26.000 líneas de JS y ~15.700 de CSS
(`css/modules/developer.css`, `dev-shared.css`), montado en `js/app.js:510-538`.

**Salen las 22.** El criterio no es por funcionalidad (flows/LLM sí, orgs/users
no) sino por **actor y alcance**:

- **Producto** = acotado al que llama; RLS lo puede defender.
- **Back-office** = cruza tenants por definición; ninguna RLS lo defiende, porque
  su trabajo es justamente saltarse el aislamiento.

En producción hay **3 perfiles: 2 `lead` y 1 usuario normal**. El "developer" de
AISC no es una persona cliente — son ARDE. Así que el builder de flujos y el
entrenamiento del LLM tampoco son producto: son herramientas internas con otro
nombre. No queda una versión reducida del panel en console.

Si algún día se vende la construcción de flujos a clientes, se construye
superficie de producto nueva acotada por org — no se recicla la herramienta de
staff.

## Decisiones ya tomadas

- **Stack:** copia fiel (SPA vanilla, sin build, mismo Netlify). No reescritura:
  26k líneas rehechas es riesgo de regresión, no una migración.
- **Código compartido** (`BaseView`, `authService`, `Navigation`, `Modal`,
  `InputRegistry`, `FlowWebhookService`, tokens CSS): **copia propia en el repo
  nuevo**. Ni paquete npm ni submódulo — mantendrían justo el vínculo que se
  quiere cortar.

## Pasos

1. Repo `AISC-Admin`, copia fiel, deploy propio.
2. **Cloudflare Access (o equivalente) delante del dominio admin.** Esto es la
   frontera de verdad: el proxy exige SSO + MFA **antes de servir un byte de
   HTML**, así que un anónimo no llega ni a ver el login. Sin esto, el repo
   aparte es sólo reducción de reconocimiento.
3. Sesión y cookies en origen distinto — nada en `.aismartcontent.io` que valga
   en los dos sitios.
4. Verificar en vivo con los 2 leads.
5. **Sólo entonces** borrar `/dev/*` de console (vistas, CSS, rutas de
   `js/app.js`, entradas de `Navigation.js` y `DevSidebarEnhancements.js`).

## Orden respecto al resto

**`SEC-001` y `SEC-002` van ANTES.** Mover el panel con el canal directo a
Supabase aún sin auditar sería mudar la puerta dejando la pared abierta: el
atacante no necesita el panel, le basta `curl` con la anon key.

Lo que la migración sí gana: saca 26k líneas de código de operaciones internas
del navegador de cada usuario — nombres de tablas, de RPCs, rutas y lógica de
provisioning. Es reconocimiento que hoy se regala. Defensa en profundidad, no
frontera.

Relacionado: `SEC-001`, `SEC-002`, `SEC-003`, `SEC-005`.

---

## Estado real 2026-09-10 — se destrabó el orden, y lo que falta no es código

### El prerequisito ya se cumplió

La ficha decía **"va DESPUÉS de SEC-001 y SEC-002"**. Ambas están:
SEC-001 cerrada (las 11 RPCs auditadas) y SEC-002 con el núcleo cerrado —
33 → 0 funciones que escriben sin guarda ejecutables sin sesión. Ya se puede
avanzar sin "mudar la puerta dejando la pared abierta".

### La copia está completa

| | console | AISC-Admin |
|---|---|---|
| Vistas `Dev*.js` | 19 | **19** |
| Archivos `views/builder/` | 7 | **7** |
| Rutas `/dev` en `app.js` | 21 | 22 |

No falta migrar código. Falta **la frontera**.

### Hecho hoy en console

- ✅ `ALLOWED_ORIGINS` de `functions/lib/ai-shared.js` ahora incluye
  `https://admin.aismartcontent.io`. Era el punto 3 de `docs/MIGRACION.md`: sin
  esto los 2 botones "Conectar tienda" de Crear organización fallan por CORS en
  cuanto se opere desde admin.
- ✅ `scripts/build-minify.mjs` derivaba `ROOT` de `import.meta.url.pathname`,
  que devuelve la ruta **percent-encoded**: con el espacio de `ARDE AGENCY/`
  llega como `%20` y el build muere con ENOENT. En Netlify no se nota (allí la
  ruta no tiene espacios), en local sí. Ya estaba arreglado en AISC-Admin; ahora
  también aquí (`fileURLToPath`).
- ✅ **Encontrado al probar ese build en una copia aislada:** 2 archivos NO se
  minificaban desde hacía tiempo — `MonitoringView.js` y `CompGrid.mixin.js` usan
  literales BigInt (`0n`, `64n`), que son ES2020, y el script pedía
  `target: 'es2019'`, que esbuild **no puede rebajar**. El script conserva el
  original cuando falla, así que el aviso pasaba desapercibido y esos 2 archivos
  **ya viajaban a producción con ES2020 sin rebajar, y encima sin minificar**: el
  target declarado era una ficción. Alineado a `es2020`. Resultado: 0 avisos,
  JS 5,05MB → 3,48MB (antes 4,85 → 3,41 porque se saltaba esos dos).

### Hecho hoy en AISC-Admin

- ✅ El **XSS de `escapeHtml` también se había copiado** allá, en 3 archivos, dos
  de ellos del propio panel (`SwitchUserController`, `DevSidebarEnhancements`).
  Corregido y desplegado (commit `8f34a9d`).
  **Lección para esta migración:** "copia fiel sin npm ni submódulo" corta el
  vínculo a propósito, pero también significa que **un arreglo de seguridad en un
  repo NO llega al otro**. Cualquier fix de seguridad hay que barrerlo en los dos
  a mano, y conviene dejarlo escrito en `docs/MIGRACION.md`.

### Bloqueado por acceso humano (no por trabajo)

1. **DNS** `admin CNAME aisc-admin.netlify.app` (DNS only, nube gris).
   ⛔ **El token de Cloudflare de `~/.claude/arde-tools/cloudflare/.env` sigue
   INVÁLIDO** — verificado hoy contra `/user/tokens/verify`: `Invalid API Token`.
   Hay que regenerarlo o hacerlo desde el panel de Cloudflare.
2. **Cloudflare Access delante del dominio.** Es *la frontera de verdad*; el repo
   aparte sólo reduce reconocimiento. Mismo bloqueo de token + configuración humana.
3. **`INTERNAL_WEBHOOK_SECRET`** falta en las variables de Netlify de `aisc-admin`.
4. **Prueba en vivo con los 2 leads** (ojo `/dev/test`,
   `/dev/provisioning/create-org`, `/dev/lead/team`).

### Y sólo entonces: borrar `/dev/*` de console

Recordar la deuda que eso destapa: `sanitizeReturnTo()` en console rechaza URLs
absolutas a propósito, así que hoy el OAuth de tiendas aterriza en
`console.aismartcontent.io/dev/lead/orgs`. **Funciona hoy y se rompe el día que se
borre `/dev` de console.**
