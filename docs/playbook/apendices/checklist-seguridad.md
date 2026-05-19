---
appendix: A
title: Checklist completo de seguridad
referenced_from: capítulo 03
---

# Apéndice A — Checklist completo de seguridad

> Checklist consolidado de todos los controles de seguridad referenciados en el libro, organizados por fase y por dominio. Marcar items según se cierran.

---

## A.1 Por fase

### Fase A — Security floor

#### Authentication
- [ ] MFA TOTP habilitado en Supabase Auth
- [ ] UI de enrollment MFA en `/account/security/mfa`
- [ ] UI de challenge MFA en login flow
- [ ] Recovery codes generados al enrollar
- [ ] Política: MFA obligatorio para owner+admin
- [ ] MFA enabled rate >80% medible
- [ ] Magic link disponible en signin
- [ ] Session policies: max 12h owner/admin, idle 30min
- [ ] Force re-auth para: cambiar password, agregar admin, cancel sub, export all

#### Authorization
- [ ] RLS policies revisadas en 113 tablas
- [ ] 13 tablas sin RLS clasificadas (catálogo legítimo vs leak)
- [ ] vitest test de RLS isolation en CI
- [ ] RPCs SECURITY DEFINER tienen check de membership

#### Audit
- [ ] `user_audit_log` poblándose con IP/UA/request_id
- [ ] Trigger en operaciones críticas (login, member change, billing, integration, brand, mission)
- [ ] UI `/org/admin/audit` accesible owner+admin
- [ ] Filtros funcionan: action, user, date, resource
- [ ] Export CSV deja audit own
- [ ] Retention policy 12 meses

#### Cifrado
- [ ] AES-256-GCM en `integration_credentials.access_token_encrypted` (✅ ya)
- [ ] HTTPS/TLS 1.2+ everywhere (✅)
- [ ] HSTS header configurado (✅ verificar netlify.toml)
- [ ] Secure cookies + SameSite=Strict para session

#### Secretos
- [ ] Pre-commit hook con detect-secrets
- [ ] 0 secrets en codebase verificado
- [ ] Secrets prod accesibles solo a 2 personas
- [ ] Audit log de acceso a secrets

#### Webhooks
- [ ] Signature verification Meta (✅)
- [ ] Signature verification Shopify (✅)
- [ ] Replay protection con timestamp + event_id (✅ P0 2026-05-08)
- [ ] `integration_webhooks_log` no contiene payload completo

#### Vulnerability mgmt
- [ ] SECURITY.md público con email + PGP + scope + SLA
- [ ] Dependabot habilitado
- [ ] `npm audit` en CI con block en high+
- [ ] detect-secrets en CI
- [ ] CSP estricta deployed (revisar netlify.toml)

#### Privacy
- [ ] Privacy Policy review legal
- [ ] ToS review legal
- [ ] DPA template draft
- [ ] Cookie consent banner básico
- [ ] DSAR endpoint `/api/data/export`
- [ ] `delete_all_app_data` función (✅ existe)
- [ ] DPO contact email configurado

#### Sub-processors
- [ ] Lista pública en `/privacy/sub-processors`
- [ ] Política aviso 30 días para nuevos

---

### Fase B — Enterprise readiness

#### SSO
- [ ] SAML 2.0 / OIDC habilitado (Supabase Pro+ add-on)
- [ ] UI de configuración por org `/org/admin/security/sso`
- [ ] Conector Okta tested
- [ ] Conector Azure AD tested
- [ ] Conector Google Workspace tested
- [ ] Funcionando con ≥1 cliente real

#### WebAuthn / Passkeys
- [ ] WebAuthn habilitado
- [ ] Enrollment flow
- [ ] Login flow con passkey

#### RBAC
- [ ] Roles definidos: owner, admin, editor, viewer
- [ ] Permission matrix documentada
- [ ] UI de assign role en `/org/admin/members`
- [ ] Transfer ownership con doble confirmación
- [ ] `permissions jsonb` override fino

#### Vault / secret rotation
- [ ] Supabase Vault enabled
- [ ] API keys vendor migradas a Vault
- [ ] JWT signing keys rotation 30 días
- [ ] Webhook signing keys con overlap

#### LUKS / encryption VM
- [ ] LUKS habilitado en VMs Hetzner via cloud-init
- [ ] Key escrowed en Vault central
- [ ] VM solicita key al boot vía gRPC

#### Pen test
- [ ] Pen test interno completado
- [ ] Pen test externo contratado (Cobalt/HackerOne/boutique)
- [ ] Findings remediados (Critical 7d, High 30d, Med 90d)
- [ ] Attestation post-remediation disponible

#### Webhooks salientes
- [ ] API endpoints `/api/v1/webhooks/subscriptions`
- [ ] HMAC signing
- [ ] Retry policy exponential backoff
- [ ] Dead letter queue
- [ ] Documentación cliente: verify signature

#### Audit log avanzado
- [ ] Immutabilidad: hash chain en entries
- [ ] Cron diario verifica integridad
- [ ] SIEM forward configurable Tier-1

#### Cookie consent
- [ ] Banner inicial con Accept/Reject/Customize
- [ ] Preference center en `/privacy/cookies`
- [ ] Categorías: Essential, Analytics, Marketing, Functional

#### Insurance
- [ ] Cyber Liability Insurance ($1M-5M coverage)
- [ ] E&O / Professional Liability
- [ ] Tech General Liability

#### Trust center
- [ ] `trust.aismartcontent.io` deployed
- [ ] Security overview público
- [ ] Compliance certifications (cuando aplique)
- [ ] Sub-processors list
- [ ] Security questionnaire pre-respondida (SIG Lite, CAIQ)
- [ ] Status page link

#### Vulnerability disclosure
- [ ] SECURITY.md actualizado con safe harbor commitment
- [ ] PGP key publicada
- [ ] Hall of fame de researchers

---

### Fase C — Compliance formal

#### SOC 2
- [ ] Vanta / Drata onboarded
- [ ] Asset inventory completado
- [ ] Vendor risk assessments
- [ ] Access control policy documentado
- [ ] Change management policy
- [ ] Incident response plan documentado
- [ ] Tabletop exercise anual
- [ ] SOC 2 Type 1 attestation obtained
- [ ] SOC 2 Type 2 attestation obtained (6+ meses Type 1)
- [ ] Anual renewal

#### ISO 27001 (si aplica)
- [ ] ISMS documentado
- [ ] Risk register
- [ ] Statement of Applicability (SoA)
- [ ] Internal audit
- [ ] Certification audit
- [ ] Annual surveillance audits

#### SCIM
- [ ] Endpoint `/scim/v2/...` operacional
- [ ] Connector Okta certified
- [ ] Connector Azure AD certified
- [ ] Auto-provisioning + deprovisioning

#### BYOK
- [ ] AWS KMS integration
- [ ] Azure Key Vault integration
- [ ] GCP KMS integration
- [ ] DEK envelope encryption per-record
- [ ] Customer-controlled rotation

#### HSM
- [ ] AWS CloudHSM option for Tier-1
- [ ] FIPS 140-2 Level 3

#### Bug bounty
- [ ] HackerOne / Bugcrowd activo
- [ ] Reward structure definida
- [ ] Triage SLA

#### CISO
- [ ] CISO contratado
- [ ] Security team 2-3 engineers
- [ ] Security awareness training trimestral

---

## A.2 Por dominio

### Identity & Access Management

```
[Authentication]
- Multi-factor authentication (TOTP, WebAuthn)
- Passwordless options (magic link, OAuth, SSO)
- Session management con timeout
- Force re-auth en operaciones críticas
- Account lockout post-N failed attempts
- Password policy (length, complexity, no reuse)

[Authorization]
- RBAC con 4 roles base
- ABAC para permission fino
- RLS policies en 100% tablas tenant-scoped
- Principle of least privilege

[Identity providers]
- Email + password
- Google OAuth
- SAML 2.0
- OIDC
- SCIM provisioning (Fase C)
```

### Data Protection

```
[At rest]
- Database encryption (Supabase managed)
- Application-level AES-256-GCM tokens
- LUKS volume encryption VMs (Fase B)
- BYOK envelope encryption Tier-1 (Fase C)

[In transit]
- TLS 1.2+ everywhere
- TLS 1.3 preferred
- mTLS internal services
- Certificate pinning SDK clients

[In use]
- No log secrets/PII
- Memory clearing after sensitive ops
- HSM-backed key operations Tier-1
```

### Network Security

```
[Perimeter]
- Cloudflare WAF + DDoS protection
- Rate limiting per IP per endpoint
- Geographic restrictions configurable

[Internal]
- Private networks Hetzner
- Cloudflare Tunnel para VMs (no IP pública directa)
- mTLS gRPC

[Egress]
- Allowlist de destinations
- Anomaly detection en outbound traffic
- DLP scanning para Tier-1
```

### Logging & Monitoring

```
[Audit log]
- user_audit_log poblándose
- 30+ event types capturados
- Inmutabilidad con hash chain (Fase B)
- Retention 12mo / 24mo / 7yr según tier

[Security logging]
- Failed logins
- Privilege escalations
- RLS denials
- Webhook signature failures
- Mass exports/deletions
- Anomalous API usage

[SIEM]
- Logs agregados (Datadog Security / Elastic / Wazuh)
- Alerts on suspicious patterns
- 90 días hot, 1 año cold

[Detection]
- Brute force detection
- Account takeover detection
- Data exfiltration patterns
- Insider threat indicators
```

### Vulnerability Management

```
[Scanning]
- Dependabot weekly
- npm audit en CI
- detect-secrets en CI
- Snyk / equivalent
- Docker images scanned (Trivy)

[Patching]
- OS patches: cron daily
- Critical CVEs: 14 días
- High CVEs: 30 días
- Medium: 90 días

[Testing]
- Pen test anual externo
- Internal pen test trimestral (Fase C)
- Bug bounty (Fase C)
- Red team exercise bi-annual (Fase C)
```

### Incident Response

```
[Preparation]
- IR plan documentado
- Roles definidos (IC, communicator, technical lead)
- Runbooks por escenario
- War room setup (Slack channel + Zoom)

[Detection]
- Alerts triggered por SLI/SLO violations
- Security alerts (SIEM)
- Customer reports
- Third-party intelligence

[Response]
- ACK <5min
- Triage <15min P1
- Containment ASAP
- Eradication
- Recovery
- Post-mortem blameless

[Communication]
- Internal: #incidents
- Customers: status page + email
- Authorities: 72h GDPR breach
- Public: post-mortem si >30min P1
```

### Vendor Management

```
[Onboarding]
- Security questionnaire
- SOC 2 / ISO cert review
- DPA signed
- Data residency confirmed
- Add to sub-processors list

[Ongoing]
- Annual review
- Update sub-processors list
- Monitor vendor incidents
- Re-assess if material changes

[Offboarding]
- Data return / deletion
- Access revocation
- Remove from sub-processors list
```

### Compliance

```
[Privacy]
- GDPR (EU)
- CCPA/CPRA (California)
- LGPD (Brasil)
- Ley 1581 (Colombia)
- LFPDPPP (México)
- UK DPA 2018

[Frameworks]
- SOC 2 Type 2
- ISO 27001
- (Future: HIPAA si health, PCI si direct payments)

[Operational]
- Privacy Policy
- Terms of Service
- DPA template
- Sub-processors list
- Cookie consent
- Cookie preference center
```

---

## A.3 Self-assessment scoring

Score actual vs target Fase A / B / C:

| Domain | Fase A target | Fase B target | Fase C target | Current |
|---|---|---|---|---|
| Authentication | 90% | 100% | 100% | ~60% |
| Authorization | 95% | 100% | 100% | ~80% |
| Audit Logging | 80% | 100% | 100% | ~60% |
| Encryption at Rest | 90% | 100% | 100% | ~75% |
| Encryption in Transit | 100% | 100% | 100% | ~90% |
| Secret Management | 80% | 100% | 100% | ~40% |
| Webhook Security | 100% | 100% | 100% | ~90% |
| Vuln Mgmt | 70% | 100% | 100% | ~30% |
| Privacy / GDPR | 70% | 100% | 100% | ~50% |
| Sub-processors | 100% | 100% | 100% | 0% |
| Compliance (SOC 2) | n/a | Type 1 | Type 2 | 0% |
| Incident Response | 60% | 100% | 100% | ~30% |

Update mensualmente.

---

*Apéndice anterior: ninguno · Apéndice siguiente: [B · Checklist operaciones](./checklist-operaciones.md)*
