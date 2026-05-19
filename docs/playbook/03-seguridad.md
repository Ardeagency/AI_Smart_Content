---
chapter: 03
title: Seguridad enterprise
part: III — Seguridad
estimated_reading_time: 60 min
---

# 03 · Seguridad enterprise

> "Security is not a feature. It's the floor on which features stand. If the floor breaks, features fall."
>
> Este capítulo describe el modelo de seguridad target. El producto actual cumple ~60% (P0 cerrado 2026-05-08 documenta lo hecho). El resto es lo que falta.

---

## 3.1 Threat model

### 3.1.1 Asumimos atacantes con estas capacidades

1. **Atacante externo opportunist** — scans automáticos, brute force, credentials stuffing. Volumen alto, sofisticación baja.
2. **Atacante externo dirigido** — investigado, paciente, posiblemente patrocinado (competitor, estado-nación). Sofisticación media-alta. Objetivo: datos de marca de un cliente específico.
3. **Insider malicioso** — empleado o ex-empleado con acceso parcial al sistema. Conoce la arquitectura. Objetivo: exfiltración o sabotaje.
4. **Insider negligente** — empleado bien intencionado que comete error. Mayor probabilidad. Objetivo del control: minimizar blast radius del error.
5. **Cliente malicioso** — un tenant que intenta acceder a datos de otro tenant via SQL injection, RLS bypass, auth bypass.
6. **Supply chain attack** — paquete npm comprometido, dependencia con backdoor, vendor IDE/Stripe/Supabase comprometido. Mitigación: defense in depth.

### 3.1.2 Assets a proteger (ordenados por criticidad)

| Asset | Criticidad | Por qué |
|---|---|---|
| **Datos de marca del cliente** (brand_posts, products, signals, missions) | 🔴 Critical | Confidencialidad comercial. Leak = pérdida cliente + lawsuit. |
| **Tokens de integración** (Meta, Google, Shopify) | 🔴 Critical | Acceso prolongado a cuentas del cliente. Si leaked → cliente demandado por DSAR/GDPR. |
| **Credenciales de usuarios** (passwords, MFA secrets, session tokens) | 🔴 Critical | Acceso total a cuenta. Compromiso = lateral movement. |
| **PII de usuarios finales** (emails, names, IPs en audit log) | 🟠 High | GDPR/LATAM data protection. Multas. |
| **Vera memory banks** | 🟠 High | Contiene estrategia comercial del cliente. |
| **Embeddings ai_brand_vectors** | 🟡 Medium | Reverse engineering posible pero costoso. |
| **Catálogos públicos (lexicon, trends globales)** | 🟢 Low | No sensibles per se. Worry sería disponibilidad. |
| **Código del producto** | 🟡 Medium | Disclosure debilita seguridad. Mitigación: no security by obscurity. |
| **Secrets de infra** (API keys vendor, DB passwords) | 🔴 Critical | Acceso a billing, datos cliente, infraestructura. |

### 3.1.3 Vectores de ataque conocidos a defender

- **SQL injection** → Mitigación: prepared statements, no string concatenation, RLS por defecto.
- **Auth bypass / privilege escalation** → Mitigación: JWT firmado, RBAC en RLS, fail-closed.
- **RLS bypass via SECURITY DEFINER abusivo** → Mitigación: review todas las RPC SECURITY DEFINER, log uso.
- **OAuth token exfiltration** → Mitigación: cifrado at rest (AES-256-GCM), nunca log payload completo.
- **Webhook replay** → Mitigación: ventana de timestamp + idempotency key (P0 cerrado 2026-05-08).
- **CSRF** → Mitigación: SameSite cookies, JWT en Authorization header.
- **XSS** → Mitigación: sanitization de inputs renderizados, CSP estricta.
- **Supply chain** → Mitigación: Dependabot, npm audit, package-lock.json, pin de versiones.
- **DDoS** → Mitigación: Cloudflare + rate limiting per IP per endpoint.
- **Insider exfiltration** → Mitigación: audit log inmutable, principle of least privilege, no acceso DB prod desde laptop.
- **Cliente A leyendo datos cliente B** → Mitigación: RLS estricta + aislamiento físico en data plane (capítulo 02).

---

## 3.2 Identidad y acceso

### 3.2.1 Authentication — 🔴 P0

#### Estado actual
- Email + password (Supabase Auth nativo).
- Google OAuth.
- Magic link disponible en Supabase pero no expuesto en frontend.

#### Target (Fase A)

**Multi-factor authentication (MFA) — `FEAT-020`** ✅ **DEPLOYED 2026-05-18 (commit `b9511e19`)**

- TOTP (Time-based One-Time Password) — Supabase Auth nativo, sin Twilio/SMS.
- UI enrollment + challenge en `OrganizationView` → tab Seguridad (modal QR + verify 6 dígitos).
- Política org-level: `organizations.mfa_required boolean`, RPC `set_org_mfa_required(uuid, boolean)` con check `role=owner`, VIEW `v_user_mfa_status` (`security_invoker=true`) que expone `mfa_enroll_required` por org del user. Si la org del user exige MFA y el user no tiene factor → login redirige a configuración para enroll.
- Modelo dual decidido con el usuario: opt-in default + flag per-org desde día 1 (no se esperó a Tier-1).
- Pendiente solo: prueba humana E2E con Authenticator real (5 escenarios listados en `docs/task/FEAT-020-auth-mfa.md`).

**Magic link / passwordless** ✅ **DEPLOYED 2026-05-18**
- `signInWithOtp({ email })` cableado en `SignInView` (botón "Enviar link de acceso por email").
- Template Resend en Supabase project config.

**Session policies**
- ✅ "Cerrar otras sesiones" (`signOut({ scope: 'others' })`) cableado en `OrganizationView` → tab Seguridad (2026-05-18).
- ⏳ Max session duration policy (12h owner/admin, 24h editor/viewer) — Fase B.
- ⏳ Idle timeout: 30 min sin actividad → re-auth — Fase B.
- ⏳ Force re-auth para acciones críticas: cambiar password, agregar admin, cancelar suscripción, exportar todos los datos — Fase B.
- ⏳ IP fingerprint: si la IP cambia drásticamente en una sesión, force re-auth — Fase B.

#### Target (Fase B)

**WebAuthn / Passkeys**
- Reemplazo de TOTP eventualmente.
- Supabase Auth soporta en Pro+.
- Mejor UX y más resistente a phishing.

**Single Sign-On (SSO) — SAML 2.0 + OIDC**
- Conectores: Okta, Azure AD, Google Workspace.
- Requiere Supabase Pro + SAML add-on, o implementación custom.
- Configurable por org (en `sso_configurations`).
- Trabajo estimado: 2-3 semanas.

#### Target (Fase C)

**SCIM provisioning 2.0**
- Endpoint `https://api.aismartcontent.io/scim/v2/...`.
- Soporte para Okta, Azure AD, OneLogin como IdP.
- Operaciones: create user, update user, deactivate user, list users, list groups.
- Auto-deprovisioning crítico para offboarding seguro de empleados.
- Trabajo estimado: 3-4 semanas.

### 3.2.2 Authorization — 🟠 P1

#### RBAC granular — `FEAT-022`

Roles definidos en `organization_members.role`:

| Role | Permisos |
|---|---|
| **owner** | Todo. Único que puede transferir ownership, cancelar suscripción, eliminar org. |
| **admin** | Casi todo. NO puede cambiar ownership ni billing payment method. Sí puede invitar/expulsar miembros, configurar integraciones, aprobar missions. |
| **editor** | Crear/editar brand_containers, products, missions. Aprobar missions propias. No invita ni configura billing. |
| **viewer** | Solo lectura de dashboards. No exporta data sensible. |

Permissions matrix completa en JSON column `permissions jsonb` para overrides finos. Default por role.

#### RLS policies

Patrón base por tabla con `organization_id`:

```sql
CREATE POLICY "tenant_isolation" ON {table}
  USING (organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid);
```

Para tablas con permission check:

```sql
CREATE POLICY "missions_approve" ON body_missions
  FOR UPDATE
  USING (
    organization_id = (SELECT auth.jwt() ->> 'org_id')::uuid
    AND EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid()
      AND organization_id = body_missions.organization_id
      AND role IN ('owner','admin','editor')
    )
  );
```

#### Estado actual
- 153 RLS policies aplicadas a 113 tablas.
- 13 tablas sin RLS (catálogos globales mayormente, ver `OPS-011`).

#### Target

- **13 tablas sin RLS → clasificar:** catálogos globales (OK sin RLS) vs leak potencial (debe activar). Ver `OPS-011`.
- **Audit periódico de RLS** (capítulo 04 — operaciones).
- **Tests automatizados de RLS** en vitest: para cada policy, intentar bypass con user de otra org → debe fallar.

### 3.2.3 Audit log — 🟠 P1

#### Estado actual
- `user_audit_log` tabla existe.
- Triggers escriben automáticamente en operaciones críticas.
- Datos disponibles: IP, UA, request_id, action, actor_user_id, organization_id, resource_type, resource_id, payload_summary, timestamp.

#### Target (Fase A) — `FEAT-021`

**Audit log UI visible al admin del tenant**
- Vista `/org/{org}/admin/audit` accesible solo a owner/admin.
- Filtros: action type, user, date range, resource type.
- Export CSV (con confirmación, deja entrada en audit propia).
- Retention: 12 meses por defecto, 24 meses para Enterprise, 7 años para Tier-1 si compliance lo exige.

#### Target (Fase B)

- **Inmutabilidad**: append-only + checksum chain (entry N incluye hash de entry N-1).
- **Tamper detection**: cron diario verifica integridad de la chain. Alerta si hash mismatch.
- **Forwarder a SIEM**: cliente Tier-1 puede recibir audit log streamed a su Splunk/Datadog vía webhook saliente firmado.

#### Eventos a auditar — lista mínima

```
auth.login_success
auth.login_failure
auth.logout
auth.mfa_enabled
auth.mfa_disabled
auth.password_changed
auth.session_revoked

org.created
org.updated
org.deleted
org.member_invited
org.member_added
org.member_role_changed
org.member_removed
org.ownership_transferred

billing.plan_changed
billing.credits_purchased
billing.payment_method_added
billing.payment_method_removed
billing.subscription_cancelled
billing.invoice_paid

integration.connected (provider: meta/google/shopify)
integration.disconnected
integration.token_refreshed

brand.container_created
brand.container_deleted
brand.product_imported
brand.entity_added (competitor/etc.)

mission.approved
mission.rejected
mission.iterated
mission.executed

vera.pending_action_approved
vera.pending_action_rejected

data.export_all_requested
data.deletion_all_requested
data.deletion_all_executed
```

### 3.2.4 Session management

- Sessions en Supabase Auth con refresh tokens rotating.
- Lista de sesiones activas visible al user en `/account/sessions`.
- Revoke remota: user puede matar sesión X desde otro device.
- Admin puede revocar todas las sesiones de un member (al expulsar).
- Forced logout: si el password cambia, todas las sesiones se invalidan.

---

## 3.3 Cifrado

### 3.3.1 At rest — 🟠 P1 (parcialmente cerrado)

#### Estado actual
- **AES-256-GCM** para tokens de integración (`integration_credentials.access_token_encrypted`) — P0 cerrado 2026-05-08 (`project_security_baseline`).
- Supabase Postgres tiene encryption at rest provista por AWS RDS (Supabase corre sobre AWS).
- Hetzner volumes NO encrypted by default — riesgo si Hetzner es comprometido físicamente. Habilitar LUKS encryption en disk para VMs org en Fase B.

#### Target (Fase B)

**Supabase Vault para secrets globales** — `OPS-007`
- Migrar todos los API keys vendor (Apify, OpenAI, etc.) a Vault.
- Vault rota keys automáticamente cuando se rotan.
- Postgres functions acceden via `vault.read_secret('key_name')`.

**LUKS encryption en VMs Hetzner**
- Cloud-init configura LUKS al provisionar.
- Key escrowed en Supabase Vault central.
- VM solicita key al boot via gRPC con identity attestation.

**Encryption envelope per-tenant para datos sensibles**
- Para Tier-1 con BYOK: master key del cliente cifra DEK (data encryption key) per-record.
- Trabajo significativo, solo Fase C.

#### Target (Fase C)

**HSM-backed keys para Tier-1**
- AWS CloudHSM o Hetzner equivalent.
- Mantiene compliance FIPS 140-2 si cliente lo requiere.

### 3.3.2 In transit — 🔴 P0 (mayormente cerrado)

#### Estado actual
- HTTPS everywhere (TLS 1.2+) en frontend (Netlify auto), backend (Supabase auto), Cloudflare Tunnel (auto).
- Strict-Transport-Security headers configurados en `netlify.toml`.

#### Target

**TLS 1.3 only** donde posible:
- Frontend: configurar Netlify para forzar TLS 1.3.
- Inter-service: gRPC con TLS 1.3 obligatorio.

**mTLS entre control plane y data plane (VMs)**:
- Certs auto-signed por CA interna del control plane.
- Rotation automática cada 90 días.
- VM debe presentar cert válido o gRPC rechaza.

**Certificate pinning** en clientes que aceptan API pública v1 (SDK):
- SDK verifica fingerprint del cert del servidor.
- Previene MITM via cert comprometido de CA pública.

---

## 3.4 Gestión de secretos

### 3.4.1 Secrets en infrastructure

#### Estado actual
- `.env.local` en repo frontend dev (gitignored).
- `.env` en ai-engine (gitignored).
- Netlify env vars para producción.
- Hetzner Cloud secrets accesibles via Cloud Console (admin manual).

#### Target

**Supabase Vault como source of truth para secrets sensibles**:
- API keys de vendors (Apify, OpenAI, Anthropic, KIE, Kling).
- Database passwords.
- HMAC signing keys para webhooks.
- JWT private keys.

**Rotation automatic schedule**:
| Secret type | Rotation cadence |
|---|---|
| API keys vendor (donde el vendor lo soporta) | 90 días |
| Database passwords | 180 días |
| JWT signing keys | 30 días con overlap (acepta old + new durante grace period) |
| Webhook signing keys | 365 días con overlap |
| Service account credentials | 365 días |

**Lista pública de sub-processors actualizada** (capítulo 06).

### 3.4.2 Bring Your Own Key (BYOK) — 🟡 P2 (Fase C)

Para cliente Tier-1 con requirement compliance:

**Customer-Managed Encryption Keys (CMEK)**:
- Cliente provee master key en su KMS (AWS KMS, Azure Key Vault, GCP KMS).
- AI Smart Content cifra DEK con esa master key.
- Si cliente revoca acceso a su master key → AI Smart Content no puede leer datos (irreversible exit).

**Bring Your Own API Credentials**:
- Cliente trae su cuenta Apify, su OpenAI key, su Meta App.
- Costos vendor van directo a cliente, AI Smart Content no factura por uso.
- Cliente tiene control total + audit propio de calls.

### 3.4.3 Secrets en codebase — política

- **Nunca commitear secrets** al repo. Pre-commit hook con detect-secrets.
- **No logear secrets** ni siquiera redacted. Logs van a stdout que va a Sentry/Better Stack; assume any log can leak.
- **Acceso a secrets prod** restringido a 2 personas (CTO + SRE lead). Audit log de cada acceso.
- **Local dev usa secrets de staging**, nunca prod.

---

## 3.5 Aislamiento de tenants (RLS profundo)

### 3.5.1 RLS hygiene — `OPS-011`

Las 13 tablas sin RLS al 2026-05-12 deben clasificarse:

**Tablas que pueden quedar sin RLS (catálogos globales, no sensibles):**
- `_bak_*` — backups de schema, debería borrarse.
- `classifier_blacklist` — diccionario global.
- `commercial_query_qualifiers` — diccionario.
- `country_aliases` — diccionario.
- `emerging_patterns` — observaciones globales.
- `intent_classifier_rules` — diccionario.
- `provocative_brand_exceptions` — diccionario.
- `trends_category_templates` — diccionario.

**Tablas que SÍ deben tener RLS (leak potencial):**
- `external_api_cache` — puede contener responses con context tenant-specific. **Activar RLS o documentar que se limpia cache periódicamente sin tenant context.**
- `lexicon_enrichment_runs` — runs pueden ser tenant-specific.
- `trend_query_jobs` — depends.
- `viral_predictions` — agregado global, OK sin RLS si solo expone categoría no tenant-marcas.

Trabajo: clasificar cada una con responsable + decisión documentada en `OPS-011`.

### 3.5.2 Patrón anti-bypass

Cada RPC `SECURITY DEFINER` debe:
1. Recibir `org_id` parameter explícito.
2. Verificar que `auth.uid()` es miembro de esa org:
   ```sql
   IF NOT EXISTS (
     SELECT 1 FROM organization_members
     WHERE user_id = auth.uid() AND organization_id = p_org_id
   ) THEN
     RAISE EXCEPTION 'forbidden';
   END IF;
   ```
3. NO confiar en `auth.jwt() ->> 'org_id'` solo (puede manipularse en client).

Audit periódico: listar todas las RPCs SECURITY DEFINER y verificar el pattern.

### 3.5.3 Test automatizado de RLS

vitest test suite que:
1. Crea 2 orgs con 2 users distintos.
2. User A intenta consultar tablas con `org_id = B` directamente.
3. Espera 0 filas o RLS deny.
4. User A intenta UPDATE con `org_id = B`. Espera fail.

Run en CI gate pre-deploy (`OPS-010`).

### 3.5.4 Aislamiento físico en data plane

Resumido del capítulo 02:
- Free/Creator/Team/Agency = shared Postgres central con RLS.
- Enterprise/Tier-1 = VM dedicada con Postgres local.
- Cross-VM data leak es **arquitectónicamente imposible** (no hay link entre VMs).

---

## 3.6 Webhook security

### 3.6.1 Webhooks entrantes (Meta, Shopify, etc.)

#### Validación obligatoria

1. **Signature verification**: cada vendor firma payload con HMAC. Verify before processing.
   - Meta: `X-Hub-Signature-256`.
   - Shopify: `X-Shopify-Hmac-SHA256`.
   - GA4: validation token.
2. **Replay protection** — ya cerrado P0 2026-05-08:
   - Reject si `timestamp` es >5 min de antigüedad.
   - Reject si `event_id` ya procesado en últimas 24h (idempotency).
3. **Tenant identification**: del URL path `/webhooks/meta/{org_short_id}` o del payload.
4. **Rate limit** por origin: max 100 webhooks/segundo por vendor (excede → 429).

#### Logging
- Cada webhook entry log a `integration_webhooks_log` (vendor, event_type, org_id, timestamp, status).
- NO loguear payload completo (puede tener PII).

### 3.6.2 Webhooks salientes (al cliente) — 🟠 P1 (Fase B)

#### Mecanismo

Cliente registra webhook en su account:
```
POST /api/v1/webhooks/subscriptions
  body: {
    url: "https://hooks.cliente.com/aismartcontent",
    events: ["signal.detected", "mission.completed"],
    secret: "wsec_..."
  }
```

Cuando ocurre evento:
1. Sistema construye payload JSON.
2. Firma con HMAC-SHA256 usando `secret` del subscription.
3. POST a `url` con headers:
   - `X-AISC-Signature: sha256=...`
   - `X-AISC-Timestamp: <unix>`
   - `X-AISC-Event-Id: <uuid>`
4. Retry policy: exponential backoff 1s, 5s, 30s, 5min, 1h. Max 5 intentos.
5. Si fail final → dead letter queue + email al admin del cliente.

#### Documentación obligatoria para cliente

- Ejemplo de verificación de firma en Node/Python/Go.
- Lista de event types disponibles.
- Schema JSON de cada event.
- Garantías (at-least-once delivery; cliente debe implementar idempotency).

---

## 3.7 Input validation y sanitization

### 3.7.1 Backend (RPCs, Netlify Functions)

**Validation obligatoria de cada input externo:**
- Type check (string, number, uuid, etc.).
- Length / range bounds.
- Format (regex para emails, URLs, slugs).
- Whitelist de enum values (no string libre cuando hay set conocido).

**Schemas Zod o equivalente** para Netlify Functions:
```js
const schema = z.object({
  org_id: z.string().uuid(),
  action: z.enum(['approve','reject','iterate']),
  comment: z.string().max(500).optional()
});
const input = schema.parse(req.body); // throws if invalid
```

### 3.7.2 SQL injection — prevention

- **Nunca** concatenar strings en SQL. Siempre prepared statements / parámetros.
- Para queries dinámicas (column names, table names): whitelist.
- Tests automatizados con inputs maliciosos típicos.

### 3.7.3 XSS — frontend

- Sanitization de cualquier HTML renderizado de usuarios o LLM.
- Library: `DOMPurify` para HTML user-generated o LLM-generated.
- Textareas: `textContent` no `innerHTML`.
- CSP estricta en `netlify.toml`:
  ```
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; ...
  ```
- Reducir `'unsafe-inline'` con nonces cuando posible (capítulo 04).

### 3.7.4 CSRF

- JWT en `Authorization` header (no cookies para auth).
- Si se usa cookies en algún caso: `SameSite=Strict`, `Secure`, `HttpOnly`.
- Operaciones críticas: re-auth required (capítulo 3.2.1).

---

## 3.8 Vulnerability management

### 3.8.1 Patching

**OS y dependencias:**
- Hetzner VMs: cron diario `apt update && apt upgrade -y` para security patches.
- Node/Python: Dependabot habilitado en GitHub. Auto-PR para minor/patch.
- Major updates: review manual.

**Postgres:**
- Supabase central: managed, Supabase aplica.
- VM org: cron de `pg_upgrade` con maintenance window declarado al cliente.

### 3.8.2 Dependency scanning

- **Backend**: `npm audit` + Snyk en CI gate.
- **Frontend**: igual.
- **Python (ai-engine)**: `pip-audit` o `safety`.
- **Docker images**: Trivy scan.

CI gate bloquea merge si:
- Critical vulnerabilities en deps de runtime.
- High vulnerabilities sin justificación documentada.

### 3.8.3 Penetration testing — 🟠 P1 (Fase B)

**Frecuencia:**
- Pre-Fase B: 1 pen test interno (equipo + amigos hackers).
- Fase B: 1 pen test externo anual (Cobalt, HackerOne, o boutique LatAm). ~$8K-15K.
- Fase C: 1 pen test externo anual + 1 red team exercise cada 2 años.

**Scope típico:**
- Web app (frontend + Netlify Functions).
- API pública (cuando exista en Fase B).
- Auth flows (login, MFA, SSO).
- RLS bypass attempts.
- ai-engine endpoints.
- VM org workers (Fase C).

**Output esperado:**
- Report con CVSS scores.
- Findings clasificados Critical/High/Medium/Low.
- Remediation deadline: Critical 7 días, High 30 días, Medium 90 días, Low next quarter.
- Attestation post-remediation para attach en sales conversations.

### 3.8.4 Vulnerability disclosure program — 🟡 P2

**SECURITY.md** público en repo con:
- Email contact: `security@aismartcontent.io`.
- Encrypted contact (PGP key).
- Scope (qué se acepta, qué no).
- Safe harbor commitment (no legal action si reporta de buena fe).
- Response SLA: ack en 48h, fix en 90 días para High+.

**Bug bounty** (opcional, Fase C):
- HackerOne o Bugcrowd hosted.
- Rewards: $50 Low, $500 Medium, $2K High, $5K+ Critical.

---

## 3.9 GDPR + LATAM data protection

### 3.9.1 Compliance landscape

| Jurisdicción | Ley | Aplica si |
|---|---|---|
| **EU** | GDPR | Cualquier user EU, incluso pasaje. |
| **UK** | UK GDPR + DPA 2018 | User UK. |
| **California** | CCPA / CPRA | User California, >$25M revenue. |
| **Colombia** | Ley 1581 + Decreto 1377 | Headquartered Colombia. Aplica al provider. |
| **Brasil** | LGPD | User Brasil. |
| **México** | LFPDPPP | User México. |
| **Argentina** | Ley 25.326 | User Argentina. |

### 3.9.2 Derechos de usuarios

#### Right to access (DSAR)
User puede solicitar export de todos sus datos.
- UI: `/account/data/export`.
- Trigger genera ZIP con JSON de todas las tablas con su `user_id` o `email`.
- Delivery: email link con token expiring 24h.
- Audit: deja entry en `user_audit_log`.

#### Right to deletion (right to be forgotten)
User puede solicitar deletion.
- UI: `/account/data/delete`.
- Confirmation flow con 14 días gracia.
- Función `delete_all_app_data` ya existe en repo.
- Audit: deja entry final.
- Tenant grant: si el user es owner único de una org, debe transferir antes (o se decide eliminar la org completa).

#### Right to rectification
User puede corregir datos. UI de account settings.

#### Right to data portability
Export en formato estándar (JSON/CSV).

#### Right to object / opt-out
- Marketing emails: unsubscribe link.
- Profiling/automated decision-making: opt-out en `/account/privacy`.

### 3.9.3 Consent management

#### Cookie consent — 🟡 P2 (Fase B)

- Banner inicial con opciones: Accept all / Reject all / Customize.
- Categorías: Essential (no opcional), Analytics, Marketing, Functional.
- Preference center en `/privacy/cookies`.
- Library: Cookiebot, OneTrust, o build minimal in-house.

#### Marketing consent
- Doble opt-in para newsletters.
- Granularidad: product updates vs blog posts vs webinars.

### 3.9.4 Data processing principles

- **Lawful basis** documentado per processing activity.
- **Data minimization**: solo recolectar lo necesario para la función declarada.
- **Purpose limitation**: no usar data para otros fines sin nuevo consent.
- **Storage limitation**: retention policies por tabla.
- **Accuracy**: usuarios pueden corregir.
- **Integrity & confidentiality**: este capítulo entero.
- **Accountability**: audit log + documentación de procesamiento.

### 3.9.5 Sub-processors disclosure — 🟠 P1

Lista pública en `/privacy/sub-processors`:

| Sub-processor | Función | Data shared | Jurisdiction |
|---|---|---|---|
| Supabase | DB + Auth + Storage | All app data | US (AWS) |
| Netlify | Frontend hosting + Functions | App requests + responses | US |
| Hetzner | VM hosting (data plane) | All tenant data | EU (Falkenstein/Helsinki) |
| Cloudflare | CDN + Tunnel + DDoS | Request metadata | Global |
| OpenAI | LLM API | Prompts (no PII by design) | US |
| Anthropic | LLM API | Prompts | US |
| Apify | Scraping | Target URLs/handles | EU |
| KIE / Kling | Video generation | Prompts + storyboards | China (KIE), US (Kling) |
| Stripe | Payments | Billing data | US/EU |
| Wompi/MercadoPago | Payments LatAm | Billing data | Colombia/regional |
| Resend | Transactional email | Email addresses | EU |
| Sentry | Error tracking | Error stacks + metadata | EU/US |
| Better Stack | Uptime + logs | Endpoint URLs + status | EU |

Cliente puede objetar sub-processors. Aviso 30 días antes de agregar uno nuevo (compromiso contractual via DPA).

### 3.9.6 Data Processing Agreement (DPA) — 🟠 P1

Documento legal firmable que detalla:
- Identidad de las partes (provider AI Smart Content, customer).
- Roles (controller vs processor).
- Categorías de data procesada.
- Propósitos de procesamiento.
- Sub-processors (referenciado).
- Security measures (referenciado a este capítulo).
- Data transfer mechanisms (SCCs si EU → fuera EU).
- Audit rights.
- Breach notification SLA (72h GDPR).
- Termination + data return/deletion.

Template base: usar plantilla GDPR.eu o contratar abogado para draft inicial.

### 3.9.7 Breach notification

**Política interna:**
1. Detección → ACK por security lead en <1h.
2. Containment + assessment.
3. Si confirma data breach con riesgo a users:
   - Notificación a authorities (autoridad local de protección de datos): 72h.
   - Notificación a users afectados: sin "undue delay".
   - Notificación a clientes B2B afectados (per DPA): según contrato, típico 24h.
4. Post-mortem + remediation publicado.

---

## 3.10 Logging y monitoreo de seguridad

### 3.10.1 SIEM (Security Information and Event Management)

#### Estado actual
- Logs en Sentry (planned), Supabase Logs, ai-engine local logs, Better Stack (planned).
- No hay agregación SIEM dedicada.

#### Target (Fase B)
- Logs de seguridad agregados en herramienta dedicada (Datadog Security, Elastic Security, o open-source Wazuh).
- Alerts on:
  - Multiple failed logins (>5/min para mismo user).
  - Logins from nuevas IPs.
  - Privilege escalations (role change).
  - Mass exports / deletions.
  - RLS denials inusuales.
  - Webhook signature failures.

### 3.10.2 Eventos de monitoreo continuo

```
[CRITICAL]
- Failed login >10/min same IP (brute force)
- RLS bypass attempt detected
- SECURITY DEFINER function called with unverified scope
- Token exfiltration (large query returning credentials)
- Mass deletion (>100 rows/min in sensitive tables)

[HIGH]
- New admin added
- Ownership transferred
- All-data export
- Subscription cancelled (revenue at risk + potential exit malicious)

[MEDIUM]
- Unusual API usage pattern per org
- Webhook signature failure (>3 in 1h)
- Token rotation failure

[INFO]
- Successful login from new IP/UA
- New integration connected
- Settings changes
```

---

## 3.11 Roles y responsabilidades

### Fase A (1-3 personas técnicas)

| Responsabilidad | Owner |
|---|---|
| Decisiones de seguridad | CTO / Tech Lead |
| RLS reviews | Backend lead |
| Auth flows | Frontend + Backend |
| Incident response | On-call rotation (CTO primero) |
| Vuln disclosure intake | CTO inbox |

### Fase B (4-6 personas)

| Responsabilidad | Owner |
|---|---|
| Decisiones de seguridad | CTO |
| **Security champion** (part-time role) | Senior backend dev |
| Pen test coordination | Security champion |
| Compliance docs (DPA, sub-processors) | Founder/CEO + lawyer |
| On-call rotation | 3-4 personas |

### Fase C (10+ personas)

| Responsabilidad | Owner |
|---|---|
| **CISO** (Chief Information Security Officer) full-time | New hire |
| **Security engineer** 1-2 | New hires |
| SOC 2 program management | CISO |
| Customer security questionnaires | CISO team |

---

## 3.12 Checklist de cierre por fase

### Fase A — Security floor
- [ ] MFA TOTP enabled en owner + admin (>80% rate).
- [ ] Audit log UI visible al admin del tenant.
- [ ] RLS hygiene cerrada (13 tablas clasificadas).
- [ ] RLS tests automatizados en CI.
- [ ] SECURITY.md público con email contacto.
- [ ] Privacy Policy + ToS publicados (ya están).
- [ ] DPA template draft.
- [ ] 0 secrets en codebase (verified con detect-secrets).
- [ ] CSP estricta deployed.
- [ ] HSTS + secure cookies + JWT in Authorization header.
- [ ] Session policies (timeout, idle, force re-auth para críticas).
- [ ] Webhook replay protection (✅ ya hecho).
- [ ] AES-256-GCM en integration tokens (✅ ya hecho).

### Fase B — Enterprise readiness
- [ ] SSO/SAML funcionando con 1 cliente real.
- [ ] WebAuthn / Passkeys disponible.
- [ ] Pen test externo realizado, findings remediados.
- [ ] Sub-processors list pública.
- [ ] DPA firmable con clientes.
- [ ] Audit log forward a SIEM cliente Tier-1.
- [ ] Webhooks salientes firmados (HMAC).
- [ ] BYOK opcional Tier-1.
- [ ] LUKS encryption en VMs Hetzner.
- [ ] Cookie consent + preference center.

### Fase C — Compliance formal
- [ ] SOC 2 Type 1 attestation.
- [ ] SOC 2 Type 2 attestation (después de 6 meses Type 1).
- [ ] ISO 27001 si EU clients lo piden.
- [ ] SCIM provisioning operacional.
- [ ] Bug bounty program activo.
- [ ] HSM-backed keys para Tier-1.
- [ ] CISO contratado.
- [ ] Red team exercise anual.

---

## 3.13 Lectura corta

- **Threat model**: 6 perfiles de atacante. Defender principalmente: cliente malicioso, insider negligente, atacante dirigido a un cliente específico.
- **Identidad**: MFA en Fase A, SSO en Fase B, SCIM en Fase C. RBAC granular en `organization_members.role` + `permissions jsonb`.
- **Cifrado**: AES-256-GCM at rest para tokens (ya), TLS 1.3 in transit (mayormente ya), Vault para secrets (Fase B), BYOK Fase C.
- **RLS profundo**: 153 policies hoy. 13 tablas sin RLS por clasificar (`OPS-011`). Tests automatizados de RLS en CI.
- **Webhooks**: signature verify + replay protection (✅), webhooks salientes firmados (Fase B).
- **Audit log**: 30+ event types. UI tenant en Fase A, inmutabilidad + SIEM forward en Fase B.
- **GDPR + LATAM**: DSAR + deletion + rectification + portability. Sub-processors list pública. DPA firmable.
- **Compliance**: SOC 2 Type 2 + ISO 27001 son Fase C. NO antes.
- **Vuln mgmt**: dependency scanning en CI, pen test anual desde Fase B, vuln disclosure program público.
- **Anti-patrones críticos**: secrets en codebase, RLS bypass via SECURITY DEFINER sin check, logear tokens, asumir org del JWT sin verificar membership.

---

*Capítulo siguiente: [04 · Operaciones de plataforma](./04-operaciones.md)*
