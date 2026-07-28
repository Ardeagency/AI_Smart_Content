---
id: SEC-003
severity: high
type: SEC
status: open
created: 2026-07-28
owner: ARDE
programado: esta semana, al terminar el dashboard
---

# Cerrar el perímetro de identidad: signup abierto y MFA para staff

## Contexto

El registro está **abierto** en producción. Verificado el 2026-07-28 contra
`/v1/projects/{ref}/config/auth`:

```
disable_signup                    = False
external_email_enabled            = True
external_anonymous_users_enabled  = True
external_google_enabled           = True
mailer_autoconfirm                = False
```

La plataforma no tiene página de registro en la UI, pero **eso es irrelevante**:
el endpoint existe. Un `supabase.auth.signUp()` desde la consola del navegador,
con la anon key que está en el bundle por diseño, crea una cuenta.

Ése fue el **paso 1** de la cadena de ataque que se demostró: registrarse →
auto-promoverse a lead → entrar a todo el back-office con `curl`. El paso 2 ya
está cerrado (ver `SEC-002`); el paso 1 sigue abierto.

## Tareas

**1. `disable_signup = true`.**
Antes hay que ver de qué depende `SecretSignupView` / `SecretSignupContinueView`
y la edge function `signup-self-finalize`. Si el alta legítima es por invitación
o por provisioning (`provision-user-*`), cerrarlo no tiene coste. Si el signup
secreto depende del endpoint abierto, hay que moverlo a una edge function con
token de invitación antes de cerrar.

**2. Acotar sesiones anónimas.**
`external_anonymous_users_enabled = True` — lo usa el demo (`DemoEntryView`).
Revisar exactamente qué puede leer y escribir una sesión anónima. Las policies
`demo_block_*` (ya RESTRICTIVE) son la barrera actual; verificar que cubren todo
lo sensible y no sólo las 8 tablas donde se corrigieron.

**3. MFA obligatorio para todo perfil con `dev_role`.**
Es lo que falta para que una contraseña filtrada de un lead no sea el juego
entero. Hoy hay 2 leads (`info@` y `diseno@`), ambos con acceso total.
Ya existe trabajo empezado: ver `project_feat020_mfa` y `project_security_baseline`
(P1 SSO/MFA).

## Por qué no se hizo ya

Parado a propósito: tocar auth mientras se termina el dashboard puede dejar fuera
al perfil `info@ardeagency.com`, que es la cuenta con la que se desarrolla y se
testea. Se retoma al cerrar el dashboard.

Relacionado: `SEC-001`, `SEC-002`, `SEC-004`.
