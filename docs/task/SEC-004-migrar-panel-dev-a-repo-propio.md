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
