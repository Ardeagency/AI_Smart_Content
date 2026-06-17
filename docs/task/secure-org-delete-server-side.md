# Deuda: endurecer el borrado de organizaciones en server-side

## Contexto
`DevLeadOrgsView` (botón eliminar org) ahora exige, en el cliente:
1. Advertencia crítica.
2. Contraseña del usuario (`auth.signInWithPassword`).
3. Código de verificación enviado al correo (`auth.signInWithOtp` + `auth.verifyOtp` type `email`).

## Problema
Es una **barrera de UX en el cliente**. El borrado real sigue siendo un
`UPDATE organizations SET deleted_at` directo con la sesión del usuario, así que
un dev con acceso a consola/anon key + sesión válida puede evadir el modal y
borrar sin verificar.

## Acción pendiente (garantía dura)
- Mover el borrado a un **RPC `SECURITY DEFINER`** o **Edge Function** que:
  - Exija reautenticación reciente (AAL/`auth.jwt()` con timestamp, o nonce de
    `reauthenticate()` validado en el server).
  - Bloquee el `UPDATE deleted_at` directo desde el cliente vía **RLS**
    (revocar update de `deleted_at` al rol autenticado; solo el RPC lo aplica).
- Opcional: registrar el borrado en `user_audit_log` (ya existe baseline de
  seguridad P0) con quién/cuándo/IP.

## Dependencia de configuración
El código de verificación llega por correo solo si la plantilla de email de
Supabase (OTP/Magic Link) incluye `{{ .Token }}`. Verificar la plantilla del
proyecto; si solo trae el magic link, el usuario no verá el código de 6 dígitos.
