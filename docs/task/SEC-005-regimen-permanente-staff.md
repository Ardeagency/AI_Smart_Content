---
id: SEC-005
severity: medium
type: SEC
status: open
created: 2026-07-28
owner: ARDE
programado: despues de SEC-004
---

# Régimen permanente de operaciones: roles de staff, impersonación y test de regresión

Las reglas que evitan que la deuda de seguridad vuelva a acumularse. Se aplican
después de la migración (`SEC-004`), pero **la regla 2 aplica desde ya** a
cualquier código nuevo del panel.

## 1. Roles de staff con mínimo privilegio

Hoy `dev_role='lead'` es un **super-admin único**: ve y toca todo — orgs,
usuarios, provisioning, billing, el audit log completo. Los 2 leads actuales
tienen exactamente el mismo poder.

Separar por función, como hace cualquier SaaS serio: soporte lee, billing toca
facturas, sólo un rol puede borrar. Ya hay trabajo relacionado en
`FEAT-022-rbac-granular.md`.

## 2. Ninguna operación de staff escribe tablas desde el navegador

Toda operación privilegiada pasa por edge function con `requireLead()` y deja
rastro en `staff_audit_log`. **Esconder el botón nunca es autorización.**

El molde ya existe: `supabase/functions/admin-set-dev-role/index.ts` (creada
2026-07-28) — valida el rol en el servidor, valida los valores permitidos sin
confiar en el cliente, protege contra lock-out y contra degradar al último lead,
y audita el antes y el después.

Aplica desde ya a código nuevo. Auditar el resto del panel buscando escrituras
directas de tabla que deberían ser edge functions.

## 3. Impersonación auditada

Ya existe `lead-switch-user`. Verificar que:
- deja rastro en `staff_audit_log` (actor, objetivo, cuándo, por qué),
- el token es de vida corta,
- el cliente ve o puede consultar que hubo acceso de soporte.

Es el patrón correcto: el staff "entra como" el cliente con registro, en vez de
leer sus tablas a mano.

## 4. Test de regresión de seguridad en CI

Sin esto, todo lo cerrado el 2026-07-28 vuelve en seis meses. Un script que
simule el rol `authenticated` e intente las escaladas **conocidas**, y falle el
build si alguna pasa:

```sql
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO '{"sub":"<uid-de-prueba>","role":"authenticated"}';
  -- 1. auto-promocion a lead              → debe dar permission denied
  -- 2. escritura cruzada entre orgs        → debe afectar 0 filas
  -- 3. llamada a RPC de admin sin ser lead → debe fallar
ROLLBACK;
```

Engancharlo al CI existente (ver `OPS-010-ci-gates-staging.md` y la memoria
`reference_aisc_ci`).

## 5. `staff_audit_log` se lee

Creada el 2026-07-28 y ya recibe escrituras de `admin-set-dev-role`, pero **nadie
la mira**. Una bitácora que nadie revisa no es un control. Falta:
- vista en el panel admin migrado,
- alerta en acciones destructivas (borrar org, cambiar rol a lead, revocar acceso).

Relacionado: `SEC-004`, `FEAT-022`, `OPS-010`.

---

## Avance 2026-09-10 — la tabla ya tiene quién la escriba

**El diagnóstico del INDEX era correcto pero incompleto.** `staff_audit_log`
tenía 0 filas no porque nadie la mirara: tenía **un solo escritor**
(`admin-set-dev-role`), y la operación de staff con más alcance que existe —la
**impersonación**— no dejaba ningún rastro.

### Hecho

- `writeAudit()` y `auditContext()` extraídos a `supabase/functions/_shared/lead-auth.ts`.
  **Se borró la copia local de `admin-set-dev-role`**: extraer una función y dejar
  el bloque viejo no revienta, simplemente sigue mandando el viejo.
- `lead-switch-user` → audita `impersonate` **antes** de devolver el magic link,
  para que quede rastro aunque el navegador no complete el intercambio.
- `admin-consumers` → audita `affiliate_member` y `remove_affiliation`.
- `admin-update-brand` → las secciones se despachan dentro de `run()` y se audita
  **una vez, con el status ya conocido** (`update_brand.<section>`). Auditar antes
  del despacho registraría intentos fallidos como si fueran cambios.

### Pendiente

- **UI para leerla.** Una tabla de auditoría que nadie puede consultar no cierra
  el régimen. Va junto con la migración del panel (SEC-004).
- **Test de regresión de seguridad en CI** — sigue sin existir; hoy `ci.yml`
  corre eslint (ratchet) + vitest smoke, ninguno cubre permisos.
- `cancel-subscription` se dejó fuera a propósito: no es operación de staff (la
  hace el owner/admin de la propia org), su rastro va en `user_audit_log`.
- Rol de staff con mínimo privilegio (hoy `lead` = super-admin único): sin empezar.
