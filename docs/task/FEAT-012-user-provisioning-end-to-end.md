---
id: FEAT-012
title: Provisioning de usuarios end-to-end (función backend + email + onboarding)
severity: high
type: feature
status: open
auto_eligible: no
auto_eligible_reason: requiere decisión de producto (invitation-only vs autoservicio) y configuración de email sender
est_duration: long
created: 2026-05-05
owner: -
---

# FEAT-012 · Provisioning de usuarios end-to-end

## Objetivo

Hoy la creación de usuarios está rota. La UI de wizard del developer lead existe (`DevLeadUserProvisioningView.js`) pero invoca **3 endpoints backend que no existen**: `admin-create-user`, `lead-provision-user`, `dev-create-user`. Resultado: ninguna cuenta nueva se puede crear.

La BD ya está preparada:

| Pieza | Estado |
|---|---|
| Tabla `auth.users` (Supabase Auth) | ✅ |
| Tabla `profiles` con schema completo (`id, email, full_name, role, is_developer, dev_role, dev_rank, default_view_mode, plan_type, form_verified`) | ✅ |
| Tabla `organization_members` con `permissions jsonb` | ✅ |
| Tabla `organization_invitations` con schema completo (`token, expires_at, accepted_at, status`) | ✅ — 0 filas |
| Tabla `plans` con 5 tiers (Trial, Starter, Pro, Business, Enterprise) | ✅ |
| Tabla `organization_credits` | ✅ |
| `resend ^6.12.0` en `package.json` del ai-engine | ✅ — sin uso |

**Solo falta el código que orqueste todo esto.**

## Decisión de producto requerida

Antes de implementar, decidir el modelo:

### Opción A — Invitation-only (manual)

El developer lead invita usuarios desde `DevLeadUserProvisioningView`. El usuario invitado recibe email con token, pone contraseña, entra. Cero signup público.

### Opción B — Autoservicio con trial

Cualquiera entra a `/signup`, da email + password, recibe email de verificación, entra a onboarding wizard que crea su primera org + le asigna `plan_type='trial'` con 200 créditos por 14 días.

### Opción C — Solicitud → aprobación

`SignInView.js:70-189` ya tiene el formulario "Solicitar acceso" que escribe a `contact_leads`. Un staff de ARDE revisa, aprueba, y se dispara la creación. Híbrido entre A y B.

## Pasos para resolver (válido para A, B o C)

### Paso 1 — Función de provisioning

Crear **`POST /internal/users/provision`** en ai-engine (preferido sobre Netlify Function por tener Service Role + Resend ya disponibles):

```js
// /root/ai-engine/src/routes/internal.routes.js
router.post('/users/provision', authMiddleware, async (req, res) => {
  const { email, full_name, password, platform_role, organization_id, role, send_invite } = req.body;

  // 1. Crear user en auth
  const { data: user, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: password ?? generateRandomPassword(),
    email_confirm: !send_invite, // si se invita, requiere verificación; si no, ya está confirmado
    user_metadata: { full_name }
  });
  if (authError) return res.status(400).json({ error: authError.message });

  // 2. Crear profile
  await supabase.from('profiles').insert({
    id: user.id, email, full_name,
    role: platform_role ?? 'member',
    plan_type: 'trial',
    form_verified: false
  });

  // 3. Vincular a org si aplica
  if (organization_id) {
    await supabase.from('organization_members').insert({
      organization_id, user_id: user.id, role: role ?? 'member'
    });
  }

  // 4. Si send_invite: crear fila en organization_invitations + enviar email con Resend
  if (send_invite && organization_id) {
    const token = crypto.randomBytes(32).toString('hex');
    await supabase.from('organization_invitations').insert({
      organization_id, email, role, invited_by: req.user.id,
      token, expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
      status: 'pending'
    });
    await sendInviteEmail(email, token, organization_id);
  }

  res.json({ ok: true, user_id: user.id });
});
```

### Paso 2 — Email sender con Resend

Configurar `RESEND_API_KEY` en `.env` del ai-engine y crear `sendInviteEmail()`:

```js
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInviteEmail(toEmail, token, orgId) {
  const url = `https://aismartcontent.io/login?invite=${token}&org=${orgId}`;
  await resend.emails.send({
    from: 'AI Smart Content <noreply@arde.agency>',
    to: toEmail,
    subject: 'Bienvenido a AI Smart Content',
    html: `<p>Has sido invitado. <a href="${url}">Activar cuenta</a></p>`
  });
}
```

### Paso 3 — DevLeadUserProvisioningView

Cambiar las 3 llamadas a endpoints inexistentes por la nueva:

```js
// js/views/DevLeadUserProvisioningView.js (línea ~369)
const response = await fetch(`${AI_ENGINE_URL}/internal/users/provision`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'authorization': `Bearer ${INTERNAL_TOKEN}`
  },
  body: JSON.stringify(formData)
});
```

### Paso 4 (solo Opción B/C) — Onboarding wizard post-signup

Crear `OnboardingView.js` que:
1. Asigna `plan_type='trial'` y créditos iniciales.
2. Pide nombre de la primera marca → crea `brand_containers` row.
3. Sugiere conectar Meta/Google (links a OAuth flows existentes).
4. Tras submit → redirige a `/org/{shortId}/{slug}/dashboard`.

### Paso 5 (solo Opción B) — Endpoint público de signup

Crear `POST /api/auth/signup` (Netlify Function o `/auth/signup` en ai-engine sin auth):

```js
// Permite signup público con email + password
// Crea profile, org propia (owner=user), assigns trial plan
```

## Criterio de done

- Wizard del developer lead funciona end-to-end: 1 clic → cuenta creada + email enviado.
- Si Opción B: cualquier visitante puede crear cuenta en `/signup` con email verification.
- Tabla `organization_invitations` recibe filas cuando se envía invite.
- Email de invitación llega a inbox real (probar con cuenta personal).
- Login del usuario nuevo funciona y entra a su org/dashboard.
- 0 filas en `organization_invitations` con `status='pending' AND expires_at < now()` (cleanup automático).

## Tareas relacionadas

- BUG-004 — verificar VeraView para que el usuario nuevo pueda usar Vera.
- DOCS-002 — actualizar documentación de auth flows.
