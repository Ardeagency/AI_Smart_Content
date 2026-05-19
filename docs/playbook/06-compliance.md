---
chapter: 06
title: Compliance y Trust
part: VI — Compliance y Trust
estimated_reading_time: 35 min
---

# 06 · Compliance y Trust

> Compliance no es ético opcional — es **arancel de entrada** para Tier-1. Sin SOC 2 no pasas procurement en una multinacional. Sin DPA firmable no firmas EU. Sin ISO 27001 muchos enterprise budget owners no aprueban el gasto.
>
> Pero la trampa típica: invertir $50K-100K en compliance que no se traduce en revenue. Este capítulo explica **cuándo** invertir en cada uno, **por qué**, y **cómo evitar gastos prematuros**.

---

## 6.1 Marco general

### 6.1.1 La pirámide de compliance

```
                    Tier-1 Enterprise
                  (Coca-Cola, Unilever)
                  ─────────────────────
                  • ISO 27001
                  • SOC 2 Type 2
                  • Pen test recent
                  • CSA STAR
                  • Country-specific (HIPAA si health, PCI si direct payments)

                Mid-market Enterprise
              (Postobón, Bavaria, Oster Intl)
              ──────────────────────────────
              • SOC 2 Type 1 → Type 2
              • Pen test report
              • DPA + sub-processors list
              • Vulnerability disclosure program
              • Business continuity plan documentado

            Mid-market regional / Agency
            ────────────────────────────
            • Privacy Policy + ToS
            • DPA template firmable
            • Security questionnaire pre-respondida (SIG Lite / CAIQ)
            • Cookie consent
            • Sub-processors list pública

          SMB / Self-serve
          ────────────────
          • Privacy Policy + ToS (✅ ya está)
          • Data deletion endpoint (✅ ya existe)
          • Cookie banner básico
          • Public security contact (SECURITY.md ✅)
```

### 6.1.2 Regla maestra

**Compliance se persigue cuando hay LOI firmada de un cliente que lo exige contractualmente, no antes.**

Excepciones:
1. Si compliance básico (Privacy + DPA template) destraba ventas, hacerlo Fase A.
2. Si pen test detecta gaps reales que ya deberían arreglarse, valida la inversión.
3. Si el costo de demorar (perder ventana competitiva) > costo del compliance, hacerlo.

---

## 6.2 SOC 2

### 6.2.1 Qué es

System and Organization Controls 2 — framework de la AICPA (American Institute of CPAs). No es ley, es estándar de industria muy aceptado.

Cinco **trust service criteria**:
- **Security** (obligatorio).
- **Availability** (opcional, casi siempre incluido).
- **Processing integrity** (opcional).
- **Confidentiality** (opcional, recomendado para SaaS B2B).
- **Privacy** (opcional).

Para AI Smart Content target: **Security + Availability + Confidentiality + Privacy** (cuatro).

### 6.2.2 Type 1 vs Type 2

| Aspecto | Type 1 | Type 2 |
|---|---|---|
| **Qué certifica** | "Controles existen at a point in time" | "Controles operan consistente sobre un período (≥6 meses)" |
| **Tiempo** | 2-3 meses preparación + 1 mes auditoría | 6+ meses observación + 1 mes auditoría |
| **Costo total** | $20K-40K | $40K-70K |
| **Validez** | 12 meses | 12 meses |
| **Cuándo perseguir** | Primer cliente Enterprise lo exige | Cliente Tier-1 lo exige (Type 1 no es suficiente) |

### 6.2.3 Camino realista para AI Smart Content

```
Q3 2026 (Fase A late) — Preparación interna
─────────────────────────────────────────
- Asset inventory documentado
- Vendor risk assessments (sub-processors)
- Access control policy documentado
- Change management policy
- Incident response plan documentado
- Sin contratar auditor todavía

Q1 2027 (Fase B early) — Si primer Enterprise LOI llega
─────────────────────────────────────────
- Contratar Vanta o Drata ($15K-25K/año platform)
- Onboarding 4-8 semanas con CTO
- Connect AWS/Hetzner/Supabase/Stripe/etc. para auto-evidence
- Cierre de gaps detectados por platform

Q3 2027 (Fase B late) — Auditoría Type 1
─────────────────────────────────────────
- Contratar auditor (CPA firm certified)
- Costo auditoría: $15K-30K
- Duración: 4-8 semanas
- Resultado: SOC 2 Type 1 attestation

Q1 2028 (Fase C early) — Observación Type 2
─────────────────────────────────────────
- 6 meses operando con controles
- Vanta/Drata continuously evidencing
- Quarterly internal review

Q3 2028 (Fase C) — Auditoría Type 2
─────────────────────────────────────────
- Mismo auditor o nuevo
- Costo: $20K-40K
- Resultado: SOC 2 Type 2 attestation
- Ahora vendible a Coca-Cola
```

### 6.2.4 Vanta vs Drata vs build-it-yourself

**Vanta** ($15K-30K/año):
- Plataforma SOC 2 más conocida.
- Auto-evidence collection.
- Vendor management.
- Auditor marketplace.

**Drata** ($15K-25K/año):
- Competidor directo.
- Más moderno UI.
- Integraciones más amplias.

**Build-it-yourself**:
- 200+ horas de trabajo CTO.
- No vale a menos que sea muy específico.
- Solo si ya tienes equipo compliance grande.

**Recomendación**: Vanta o Drata. Mejor Drata por costo + roadmap.

### 6.2.5 Lista mínima de controles SOC 2

Los **clave** que se evalúan:

**Security (CC1-9):**
- Access control con least privilege.
- MFA obligatorio para admin.
- Onboarding/offboarding de empleados documentado.
- Background checks de personnel sensitive.
- Encryption at rest + in transit.
- Vulnerability scanning regular.
- Patch management.
- Pen test anual.
- Incident response plan + tabletop exercise.
- Logging + monitoring.

**Availability:**
- SLA definido.
- Backup + DR plan + restore testing.
- Capacity planning.
- Status page público.

**Confidentiality:**
- Data classification.
- Confidential data marked + protected.
- NDA con empleados + contractors + sub-processors.
- Data retention + disposal policy.

**Privacy:**
- Privacy notice publicado.
- Consent mechanisms.
- Data subject rights process.
- Cross-border transfer mechanisms.

### 6.2.6 Errores comunes a evitar

1. **Empezar SOC 2 sin tener controles operando.** Vanta detecta gaps pero no los arregla.
2. **Buscar Type 2 directo.** Inviable. Type 1 primero, observación, luego Type 2.
3. **Auditor cheap.** Hay CPA firms con $5K auditorías que no son acreditadas. Verificar AICPA listing.
4. **No mantener post-cert.** Cert vence 12 meses. Mantenimiento continuo.
5. **Pensar que SOC 2 reemplaza pen test.** No. Son complementarios.

---

## 6.3 ISO 27001

### 6.3.1 Qué es

International Standard for Information Security Management Systems (ISMS). Más prescriptivo que SOC 2.

**Diferencias vs SOC 2:**
- ISO es internacional, SOC 2 más US-centric (aunque aceptado globalmente).
- ISO certifica el ISMS (sistema de gestión), SOC 2 evalúa controles operativos.
- ISO toma más tiempo + esfuerzo.

### 6.3.2 Cuándo perseguir

- Cliente EU (Alemania, Francia, UK típico) lo exige.
- Cliente US con stack global puede exigirlo en lugar de SOC 2.
- Generalmente Fase C, después de SOC 2.

### 6.3.3 Costos

- Consultoría: $20K-40K para preparación.
- Auditoría: $15K-25K.
- Maintenance: $10K-15K/año.
- Total año 1: $50K-80K.

### 6.3.4 Recomendación

**Solo si cliente lo exige.** Si tienes SOC 2 Type 2, muchos EU clients aceptan. No invertir double.

---

## 6.4 Privacy Policy + Terms of Service

### 6.4.1 Estado actual
- ✅ `PrivacyPolicyView.js` existe (`/privacy`).
- ✅ `TermsOfServiceView.js` existe (`/terms`).
- ✅ `DataDeletionView.js` existe.

### 6.4.2 Target Fase A

**Privacy Policy debe cubrir:**
- Quiénes somos (Arde Agency S.A.S., Colombia).
- Qué data colectamos (categorías).
- Por qué (lawful basis).
- Cómo se procesa.
- Con quién se comparte (sub-processors).
- Cuánto retenemos.
- Derechos del usuario (acceso, deletion, portability, rectification).
- Cross-border transfer mechanisms.
- Cómo contactarnos (DPO email).
- Última actualización + change log.

**Terms of Service debe cubrir:**
- Definitions.
- Account creation.
- Acceptable use.
- Intellectual property (cliente owns su content, AI Smart Content owns plataforma).
- Service availability (SLA reference).
- Termination.
- Limitation of liability.
- Indemnification.
- Governing law (Colombia base, jurisdiction client country if Tier-1).
- Dispute resolution.

**Action items:**
- Review legal por abogado colombiano + abogado especialista LGPD/GDPR (Brasil + EU).
- Versionado: políticas archivadas por fecha. User notified si cambios materiales.

---

## 6.5 Data Processing Agreement (DPA) — 🟠 P1

### 6.5.1 Qué es

Contrato entre AI Smart Content (processor) y customer (controller) que define cómo se procesa data del customer bajo GDPR Art. 28 y leyes equivalentes.

**Obligatorio para:**
- Cualquier customer EU/UK.
- Customer regulado (banking, health, etc.).
- Generalmente lo piden todos los Enterprise B2B.

### 6.5.2 Template

Drafts disponibles:
- **GDPR.eu DPA template** (gratis).
- **EDPB clauses** (oficiales).
- **Vanta template** (incluido en plataforma).

Customizaciones AI Smart Content:
- Identidad partes.
- Sub-processors list (referencia URL pública).
- Security measures (referencia a este libro o doc resumido).
- SCCs (Standard Contractual Clauses) si transferencia EU → fuera EU.
- Breach notification SLA: 72h.
- Data return/deletion en termination.
- Audit rights del customer.

### 6.5.3 Flujo de firma

Hoy: ad-hoc, email back-and-forth.

Target Fase A:
- DPA estándar publicado en `/dpa` (`pdf` downloadable).
- Click-to-sign en DocuSign / HelloSign / PandaDoc al firmar Enterprise contract.
- Self-serve aceptación: customer marca checkbox en signup (para Free/Creator/Team).

Target Fase B:
- DPA portal: customer puede editar campos no-críticos (notification contacts, SCCs).
- E-sign tracking.

---

## 6.6 Sub-processors

### 6.6.1 Lista actual

Documentada en capítulo 03.9.5. Mantener en `/privacy/sub-processors` URL pública.

### 6.6.2 Política de cambios

- **Aviso 30 días** antes de agregar nuevo sub-processor (compromiso DPA).
- Email a billing contact + in-app banner.
- Customer puede objetar dentro de los 30 días (terminar contrato sin penalty).
- Histórico de cambios visible.

### 6.6.3 Vendor assessment

Antes de agregar sub-processor nuevo:
- Verificar compliance certifications (SOC 2 / ISO 27001 ideal).
- Verificar DPA propio del vendor (cadena de DPAs).
- Verificar data residency.
- Verificar incident response track record.
- Verificar financial stability (no startup en bankruptcy risk).

Documentar en internal vendor risk register.

---

## 6.7 Cookie consent — 🟡 P2

### 6.7.1 Requisito

- **EU/UK**: ePrivacy Directive + GDPR. Consent prior to non-essential cookies.
- **Brasil**: LGPD lo trata similar a GDPR.
- **California**: CCPA permite "Do Not Sell" link.
- **Colombia**: Ley 1581 no requiere explícito, pero best practice incluirlo.

### 6.7.2 Implementación

**Banner inicial:**
```
Usamos cookies esenciales para que la plataforma funcione, y cookies
opcionales para analytics y marketing.

[Aceptar todo] [Rechazar opcionales] [Personalizar]
```

**Categorías:**
- **Essential** (no opt-out): auth session, CSRF token, preferences UI.
- **Analytics** (opt-in): Sentry RUM, Plausible / GA4.
- **Marketing** (opt-in): re-targeting si se usa Meta Pixel.
- **Functional** (opt-in): chat widget, video embeds.

**Library:**
- Cookiebot (~$10/mo).
- OneTrust (enterprise).
- Build minimal in-house (~2 días dev).

### 6.7.3 Preference center

`/privacy/cookies`:
- Toggle por categoría.
- Effective immediate.
- Reset all to defaults.
- View current settings.

---

## 6.8 Vulnerability Disclosure Program

### 6.8.1 SECURITY.md público — 🔴 P0

Ya existe `SECURITY.md`. Verificar contiene:

```markdown
# Security at AI Smart Content

If you find a vulnerability, please email security@aismartcontent.io.

## Scope (what we accept reports for)
- aismartcontent.io domains
- console.aismartcontent.io app
- api.aismartcontent.io (when launched)
- Mobile apps (when launched)

## Out of scope
- DoS attacks
- Social engineering
- Physical attacks
- Vulnerabilities requiring physical access

## PGP key
{fingerprint}
{key URL}

## Safe harbor
We commit to not pursuing legal action against researchers who:
- Report in good faith
- Avoid causing damage
- Give us reasonable time to fix (90 days for high+)
- Don't access/exfiltrate data beyond proof of concept

## Response SLA
- ACK in 48 hours
- Triage in 5 business days
- Fix High+ in 90 days
- Fix Critical in 14 days

## Hall of fame
{list of researchers credited}
```

### 6.8.2 Bug bounty — 🟡 P2 (Fase C)

Cuando alcance la escala:

**HackerOne** o **Bugcrowd** managed:
- Costo: 20-30% del payout total + monthly fee.
- Pros: triage outsourced, researcher pool grande.
- Cons: costo, ruido de duplicados.

**Self-hosted**:
- Costo: solo payout + tiempo triage.
- Pros: control directo.
- Cons: triage manual time-consuming.

**Reward structure típico:**
- Critical: $5K-$15K.
- High: $1K-$5K.
- Medium: $300-$1K.
- Low: $50-$300.

---

## 6.9 HIPAA / PCI / regulación específica

### 6.9.1 HIPAA
- **No aplica** a AI Smart Content por dominio (no procesa Protected Health Information).
- Solo aplicaría si cliente farmaceutico maneja patient data — improbable.

### 6.9.2 PCI DSS
- **No aplica directamente** — no almacenamos card data (Stripe lo hace).
- Verificar que Stripe Connect Standard mantiene cardholder data fuera de scope.
- Si en algún momento se procesa card data directo → PCI Level 4 mínimo (más pequeño).

### 6.9.3 LGPD Brasil
- Aplica a customers Brasil.
- Similar a GDPR.
- Cubierto si DPA + privacy policy + DSAR/deletion están alineados.
- Designar DPO Brasil específico si cliente lo exige (Encarregado).

### 6.9.4 LFPDPPP México
- Aplica a customers México.
- Aviso de Privacidad obligatorio (similar a Privacy Notice).
- Identify INAI lawful basis.

### 6.9.5 Otras regulaciones LatAm
- **Argentina**: Ley 25.326. Similar a GDPR.
- **Chile**: en transición a nuevo marco LGPD-like.
- **Perú**: Ley 29733.
- **Colombia**: Ley 1581 + Decreto 1377 (cubierto, Arde Agency es colombiana).

Estrategia: GDPR as floor (most strict), otras leyes se cubren automáticamente.

---

## 6.10 Insurance

### 6.10.1 Cyber Liability Insurance

**Qué cubre:**
- Data breach response (notification, forensics, credit monitoring).
- Regulatory fines (donde insurable).
- Lawsuit defense.
- Business interruption.

**Cuándo contratar:**
- Fase B: cuando primer cliente Enterprise firma.
- Coverage típico: $1M-$5M.
- Cost: $5K-$15K/año en LatAm para SaaS small.

**Providers:**
- Internacional: Chubb, AIG, Beazley.
- LatAm: Mapfre, Liberty, SBS Seguros (Colombia).

### 6.10.2 Errors & Omissions (E&O) / Professional Liability

Cubre claims por errors en service.
- Cost: $3K-$8K/año.
- Recomendado Fase B.

### 6.10.3 Tech General Liability

Cubre property damage, bodily injury (improbable software, pero requerido por contratos enterprise).
- Cost: $1K-$3K/año.

---

## 6.11 Trust Center

### 6.11.1 Qué es

Página pública con toda la documentación de trust en un solo lugar.

URL: `trust.aismartcontent.io`.

### 6.11.2 Secciones

```
[Security]
- Security overview
- SOC 2 attestation download (NDA-gated o pública)
- ISO 27001 cert (cuando aplique)
- Pen test latest report (NDA-gated)
- Architecture diagrams
- Encryption details
- Access control overview
- Incident response

[Privacy]
- Privacy Notice
- DPA template
- Sub-processors list
- DSAR request form
- Data deletion form
- Cookie preferences

[Compliance]
- Compliance certifications
- Audit reports (downloadable NDA-gated)
- Regulatory filings

[Status]
- Status page link
- Uptime history
- Incident history

[Resources]
- Security whitepaper
- Compliance FAQ
- Security questionnaire pre-respondida (SIG Lite, CAIQ)
- Contact security
```

### 6.11.3 Beneficios

- Acelera procurement (sales no responde questionnaires repetidos).
- Demuestra madurez (Tier-1 buyers buscan esto).
- Reduce custom contract negotiations.

Tooling: SafeBase ($300/mo), Vanta Trust Center (incluido), o build custom (1 sprint).

---

## 6.12 Security questionnaire pre-respondida

### 6.12.1 Frameworks comunes

- **SIG Lite** (Shared Assessments) — ~300 preguntas.
- **CAIQ** (Cloud Security Alliance Consensus Assessments Initiative Questionnaire) — ~250 preguntas.
- **VSAQ** (Vendor Security Alignment Questionnaire) — Google's open source.
- **Custom per customer** — Coca-Cola tiene su propio template, así Procter & Gamble.

### 6.12.2 Estrategia

- Respond SIG Lite once → reuse 70-80% para customer-specific.
- Mantener un master answer doc actualizado.
- Sales team puede acceder rápidamente.

### 6.12.3 Tools

- Vanta Trust Center: customers can request access, see pre-filled answers.
- Drata equivalent.
- Conveyor (Whistic) — dedicated tool, ~$1K-3K/mes.

---

## 6.13 Audit y revisión

### 6.13.1 Internal audit cadence

| Frecuencia | Actividad |
|---|---|
| **Weekly** | Review security alerts + incidents |
| **Monthly** | Vendor risk update, access review |
| **Quarterly** | Policy review, control testing |
| **Annually** | External pen test, DR drill, SOC 2 renewal |

### 6.13.2 Continuous compliance

Con Vanta/Drata:
- Auto-evidence collection.
- Drift detection (control was passing, now failing).
- Alert al security champion.
- Ticket creado en GitHub Issues / Linear.

---

## 6.14 Roadmap compliance

```
Fase A (8-12 semanas)
─────────────────────
- Privacy Policy review legal (✅ base, hacer review)
- ToS review legal
- DPA template draft
- Cookie consent banner básico
- SECURITY.md publicado (✅ existe, verificar contenido)
- DSAR + deletion endpoint (✅ delete_all_app_data existe)

Fase B (3-6 meses)
──────────────────
- Vanta/Drata onboarding
- Sub-processors list pública
- DPA portal click-to-sign
- Vulnerability disclosure program formal
- Pen test interno
- Cyber insurance contratado
- DPO designado (Colombia + Brasil si aplica)
- Trust center público beta

Fase B late / Fase C early (Q1 2027)
────────────────────────────────────
- SOC 2 Type 1 auditoría
- Pen test externo anual
- Trust center público full
- Security questionnaire pre-respondida

Fase C (12 meses+)
──────────────────
- SOC 2 Type 2 attestation
- ISO 27001 (si EU client lo exige)
- Bug bounty program
- Multi-jurisdiction DPO presence
- Compliance team scaling
```

---

## 6.15 Anti-patrones

### ❌ "SOC 2 antes de revenue"
$50K-100K gastados sin revenue que lo justifique. Mata cash. **No antes de LOI firmada.**

### ❌ "Compliance theater"
Tener certificados pero controles no operan. Tarde o temprano breach + lawsuit. **Controles primero, certificación después.**

### ❌ "Privacy Policy copiada de Hootsuite"
Genera inconsistencia con realidad del producto. Riesgo legal alto. **Review legal por abogado.**

### ❌ "DPA template sin SCCs"
Para clientes EU sin SCCs (Standard Contractual Clauses) es no-go post Schrems II. **Incluir SCCs Modulo 2 o equivalente.**

### ❌ "Compliance es responsabilidad solo del CTO"
Compliance involucra Legal, RRHH (background checks), Finance (vendor management), Sales (contract review). **Cross-functional ownership.**

### ❌ "Esperar a que el cliente pregunte"
Si esperas a security questionnaire, alargas sales cycle 4-8 semanas. **Trust center público adelanta.**

### ❌ "Compliance es estático"
Threats evolucionan, vendors cambian, leyes cambian. **Annual review minimum, quarterly mejor.**

---

## 6.16 Lectura corta

- **Pirámide**: SMB → Privacy + DPA template. Mid-market → SOC 2 Type 1. Tier-1 → SOC 2 Type 2 + ISO 27001.
- **Regla maestra**: persiguir compliance solo con LOI que lo exija. NO antes.
- **SOC 2 path**: Vanta/Drata Q1 2027 → Type 1 Q3 2027 → Type 2 Q3 2028. ~$50K-100K total.
- **DPA**: firmable click-to-sign Fase A. Crítico para Enterprise.
- **Sub-processors list pública** Fase A. Política aviso 30 días.
- **Cookie consent** Fase B (P2). Banner + preference center.
- **Vulnerability disclosure program** público Fase A. Bug bounty Fase C.
- **Cyber insurance** Fase B con primer Enterprise.
- **Trust center público** Fase B/C: acelera sales con buyers Tier-1.
- **Anti-patrones**: SOC 2 sin revenue, privacy copiada, DPA sin SCCs.

---

*Capítulo siguiente: [07 · Go-to-Market y escalado](./07-go-to-market.md)*
