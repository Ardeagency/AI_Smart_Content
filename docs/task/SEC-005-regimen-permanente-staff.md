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
