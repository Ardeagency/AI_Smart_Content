# Borrado seguro de organizaciones

## Estado: enforcement server-side HECHO (2026-06-17)

El hueco de bypass quedó cerrado. Migración en `SQL/secure_org_delete.sql`
(SQL/ gitignored), aplicada vía Management API.

### Lo que se hizo
- **RPC `soft_delete_organization(p_org_id)`** (`SECURITY DEFINER`): única vía de
  soft-delete. Exige `is_lead()` server-side, marca `deleted_at`, audita en
  `user_audit_log` (`action = organization.soft_delete`).
- **Trigger `trg_guard_org_soft_delete`**: bloquea cualquier `UPDATE` directo de
  `deleted_at` que no venga del RPC (verificado: `BLOCKED_OK`). Ya no es evadible
  desde consola/anon key.
- **Cliente** (`DevLeadOrgsView`): el gate de UX (advertencia crítica + contraseña
  via `signInWithPassword` + código por correo via `signInWithOtp`/`verifyOtp`)
  ahora llama al RPC en vez del `UPDATE` directo.

## Residual (opcional, menor)

1. **Reautenticación criptográfica en el server**: el RPC confía en que el cliente
   reautenticó (password + OTP). Una prueba dura de "reauth reciente" requeriría
   MFA/AAL (`auth.jwt()->>'aal' = 'aal2'`) o un nonce de `reauthenticate()` validado
   server-side. Hoy no hay MFA configurado para devs. Defensa actual: rol Lead +
   path único + auditoría.

2. **Plantilla de email Supabase**: el código de 6 dígitos llega solo si la
   plantilla (OTP/Magic Link) incluye `{{ .Token }}`. Verificar la config del
   proyecto; si solo trae el magic link, el usuario no verá el código.
