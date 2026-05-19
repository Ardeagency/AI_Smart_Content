---
id: FEAT-020
title: Auth — MFA TOTP (Supabase nativo) + magic link + session policies
severity: critical
type: feature
status: deployed_pending_user_e2e
auto_eligible: no
auto_eligible_reason: requiere flows UI sensibles + decisión política empresa (enforce vs opt-in)
est_duration: medium
created: 2026-05-12
updated: 2026-05-19
deployed_commit: b9511e19
parent: AUDIT-003-enterprise-readiness-2026-05-12.md
---

## Estado (2026-05-19)

**Código en producción** vía commit `b9511e19` (2026-05-18). Migration Supabase aplicada via Management API (gitignored): `organizations.mfa_required boolean default false`, RPC `set_org_mfa_required(uuid, boolean)` con check `role=owner`, VIEW `v_user_mfa_status` con `security_invoker=true`.

**Decisiones cerradas con el usuario**:
- Modelo dual: opt-in por usuario + flag `mfa_required` per-org disponible desde día 1.
- Solo TOTP en fase 1. WebAuthn/passkeys → fase 2.
- TOTP es nativo Supabase Auth — no requiere Twilio ni SMS provider.

**Lo único que queda**: prueba humana E2E en browser real (los 5 escenarios listados abajo). Hasta que el user confirme, el task sigue abierto.

# Auth empresarial mínimo

## Contexto

Hoy:
- Auth: email/password + Google OAuth (Supabase Auth, 2 providers, 1 user — IGNIS demo)
- Sin MFA
- Sin magic link
- Sin políticas de sesión (timeout, IP allowlist, revoke remoto)

Cualquier security questionnaire B2B pregunta por MFA. Sin esto **no se vende a empresa con compliance**.

## Scope

### Fase 1 — TOTP MFA (Supabase nativo)
- Activar factors TOTP en Supabase Auth (project settings).
- UI nueva en `CambiarContrasenaView` (o `OrganizationView` → tab "Seguridad" nuevo):
  - Listar factors enrolados (`auth.mfa_factors`).
  - Enroll: mostrar QR (`supabase.auth.mfa.enroll`), verificar challenge, confirmar.
  - Unenroll con confirmación.
- Login flow:
  - Tras password OK con factor activo → step "código 6 dígitos".
  - `supabase.auth.mfa.challenge` + `supabase.auth.mfa.verify`.
- Política org-level: columna `organization_members.mfa_required boolean` (opcional fase 2) — owner puede forzar MFA a todos los miembros.

### Fase 2 — Magic link
- `signInWithOtp({ email })` como alternativa a password.
- Plantilla email via Resend (ya en deps).
- UI: en `SignInView` agregar botón "Enviar link de acceso".

### Fase 3 — Session policies
- Lista de sesiones activas (`auth.sessions`) por usuario → UI "Cerrar otras sesiones".
- Timeout de inactividad configurable (default 30 días Supabase, ¿bajar a 7 para roles admin?).
- IP allowlist por org (jsonb en `organizations` o tabla nueva `organization_ip_allowlist`) — fuera de scope mínimo.

## Criterio de cierre — pruebas E2E pendientes en browser real

- [ ] En `OrganizationView` → Seguridad → "Activar 2FA". Escanear QR con Google Authenticator. Tipear código. Confirmar 2FA activa.
- [ ] Cerrar sesión. Login con email+password. Debe aparecer step MFA. Tipear código. Debe entrar.
- [ ] "Enviar link de acceso por email" en `SignInView` → email llega → link entra sin password.
- [ ] (Solo owner) Activar switch "Exigir 2FA a todos los miembros". Segundo user sin factor → al login redirige a config.
- [ ] "Cerrar todas las otras sesiones" debe revocar globales.

## Decisión humana pendiente

- Ya cerradas en sesión 2026-05-18 (ver memoria `project_feat020_mfa_2026_05_18.md`).
