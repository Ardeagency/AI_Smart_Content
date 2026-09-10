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

---

## Medido 2026-09-10 contra la config viva de Auth

```
disable_signup                     False   <- el registro sigue abierto
external_anonymous_users_enabled   True
password_min_length                6       <- débil
security_captcha_enabled           False
mfa_totp_enroll_enabled            True    <- la maquinaria SÍ está
```

| Medida | Valor |
|---|---|
| Usuarios en toda la base | **3** |
| Perfiles con `dev_role` | 2 |
| De esos, con MFA verificado | **0** |
| Factores MFA verificados en TODA la base | **0** |
| Usuarios anónimos creados alguna vez | **0** |
| Organizaciones con `mfa_required` | 0 |

**Lectura honesta del riesgo:** el registro abierto es real, pero con 3 usuarios
en total y 0 sesiones anónimas creadas nunca, no ha sido explotado. Es un hueco
de perímetro, no un incidente.

## Por qué NO se cerró el registro en esta pasada

`disable_signup = true` **rompe dos caminos vivos**, y por eso la ficha decía
"antes ver de qué depende `SecretSignupView`":

- `js/views/SecretSignupView.js:895` → `supabase.auth.signUp()`
- `js/views/DemoEntryView.js:78` → cae a `POST /auth/v1/signup`

Cerrarlo es una **decisión de producto**, no un ajuste de seguridad: obliga a
mover el alta a invitación/creación por admin, que es justo lo que
[FEAT-012](./FEAT-012-user-provisioning-end-to-end.md) tiene sin decidir
(invitation-only vs autoservicio). **Las dos fichas se resuelven juntas o
ninguna.**

## Lo que sí se puede hacer sin romper nada

1. `password_min_length` 6 → 12. No rompe cuentas existentes.
2. Captcha: requiere dar de alta un proveedor (hCaptcha/Turnstile) — acceso externo.
3. MFA a los 2 leads: **acción humana obligatoria** — hay que escanear el QR del
   TOTP. Ningún agente puede hacerlo por ellos. La maquinaria (FEAT-020) ya existe.
