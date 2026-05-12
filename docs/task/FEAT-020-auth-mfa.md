---
id: FEAT-020
title: Auth — habilitar MFA TOTP (Supabase nativo) + magic link + session policies
severity: critical
type: feature
status: open
auto_eligible: no
auto_eligible_reason: requiere flows UI sensibles + decisión política empresa (enforce vs opt-in)
est_duration: medium
created: 2026-05-12
parent: AUDIT-003-enterprise-readiness-2026-05-12.md
---

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

## Criterio de cierre

- [ ] Un usuario puede enrolar TOTP y volver a entrar con app authenticator
- [ ] Si MFA activo, login con password solo no completa hasta verificar TOTP
- [ ] Magic link envía email y autentica
- [ ] Usuario puede ver y revocar sesiones desde UI
- [ ] Documentado en docs/security baseline

## Decisión humana pendiente

- ¿MFA opt-in (usuario decide) o enforce por org (owner exige a todos)?
- ¿WebAuthn / passkeys también, o solo TOTP en fase 1?
