---
appendix: C
title: Glosario
referenced_from: todos los capítulos
---

# Apéndice C — Glosario

> Términos técnicos, comerciales, y específicos de AI Smart Content usados a lo largo del libro. Ordenados alfabéticamente.

---

## A

**AE (Account Executive)** — Rol de ventas que owns deals desde qualification hasta close. Fase B+.

**ABM (Account-Based Marketing)** — Estrategia de marketing focused en cuentas específicas de alto valor.

**ACK (Acknowledge)** — Action de reconocer un alerta / incidente / notificación. "On-call acks page en 5min".

**ai-engine** — El servidor central que orquesta sensores, jobs, Vera. Corre en Hetzner CCX33 hoy; será control plane en arquitectura federada.

**Apify** — Plataforma SaaS de scraping. Vendor externo. Acceso vía gateway en ai-engine.

**ARR (Annual Recurring Revenue)** — Suma de subscriptions activas anualizadas. KPI principal.

**Audit log** — Registro inmutable de acciones realizadas en el sistema. Tabla `user_audit_log`.

---

## B

**Battle card** — Documento de sales con argumentos vs competidor específico.

**brand_container** — Sub-marca regional/de línea dentro de una organización. Ej.: "Coca-Cola Andina" bajo "Coca-Cola Global". Modelo único de AI Smart Content vs incumbents.

**brand intelligence context** — Las 10 capas que Vera consulta para tomar decisiones estratégicas. Función `build_full_brand_intelligence_context`.

**brand_indexer** — Sensor que genera embeddings del corpus de marca para Vera.

**BYOK (Bring Your Own Key)** — El cliente trae sus credenciales (Apify, OpenAI, Meta App) o su master encryption key.

---

## C

**CAC (Customer Acquisition Cost)** — Costo total de adquirir un nuevo cliente (sales + marketing). KPI clave de unit economics.

**CAIQ (Consensus Assessments Initiative Questionnaire)** — Cuestionario CSA para vendor security assessment.

**Canary deploy** — Estrategia de release que deploya a un subset pequeño primero, valida, luego expande.

**CISO (Chief Information Security Officer)** — Senior role de seguridad. Hire Fase C.

**CMEK (Customer-Managed Encryption Keys)** — Cliente controla las keys que cifran sus datos. BYOK variant.

**Control Plane** — En arquitectura federada: la capa central (ai-engine + Postgres central) que gestiona auth, billing, orquestación. **No** almacena datos sensibles del cliente.

**CRDB / CRR (Cross-Region Replication / Resilience)** — Replicación de datos entre regiones para DR y compliance.

**CSAT (Customer Satisfaction)** — Métrica de satisfacción del cliente.

**CSM (Customer Success Manager)** — Rol que owns la relación post-sale, onboarding, expansion, renewal.

**CSP (Content Security Policy)** — Header HTTP que restringe qué scripts/recursos puede cargar la página.

---

## D

**Data Plane** — En arquitectura federada: la capa donde viven los datos del cliente. VM dedicada por tenant (Enterprise+) o Postgres compartido con RLS (Free/Creator/Team/Agency).

**DEK (Data Encryption Key)** — Key que cifra datos específicos. Típicamente cifrada por una master key (envelope pattern).

**DKIM/SPF/DMARC** — Estándares anti-spoofing para email. Configurar para Resend.

**DPA (Data Processing Agreement)** — Contrato entre processor (AI Smart Content) y controller (customer) bajo GDPR.

**DPIA (Data Protection Impact Assessment)** — Evaluación de riesgos de privacidad para nuevos data processing activities.

**DPO (Data Protection Officer)** — Rol obligatorio bajo GDPR para algunos casos. Brasil = Encarregado. Colombia = Encargado del Tratamiento.

**DSAR (Data Subject Access Request)** — Solicitud de un usuario para acceder/exportar/eliminar sus datos.

**Dunning** — Proceso de cobro tras pago fallido (emails, in-app warnings, suspension).

---

## E

**E&O (Errors & Omissions)** — Tipo de insurance que cubre errores profesionales en service delivery.

**Edge function** — Función serverless que corre en CDN edge (Netlify Edge, Cloudflare Workers). Lower latency que regular function.

**Embeddings** — Representaciones vectoriales de texto. text-embedding-3-large/small son los usados. Sancionados como background OK (memory: `feedback_embeddings_sancionados`).

**Enterprise (tier)** — Cliente que paga $5K-15K/mes. VM dedicada, SSO, dedicated CSM. Capítulo 05.5.

---

## F

**Fail-closed** — Principio de seguridad: cuando algo no está claro, denegar acceso. Opuesto a fail-open.

**FinOps** — Discipline de optimización de costo en cloud / SaaS.

**FIPS 140-2** — Estándar US para módulos criptográficos. Level 3 requiere HSM.

---

## G

**Gateway** — En la arquitectura: capa que proxies llamadas a vendors externos (Apify, OpenAI, etc.) con metering, dedupe, atribución. Vive en control plane.

**GDPR (General Data Protection Regulation)** — Ley EU de protección de datos. Aplica a cualquier user EU.

**GRC (Governance, Risk, Compliance)** — Disciplina cross-functional.

**GRR (Gross Revenue Retention)** — % de revenue retenido sin contar expansion. Target >90%.

---

## H

**HMAC (Hash-based Message Authentication Code)** — Firma criptográfica usada en webhooks (verify origin + integrity).

**HSM (Hardware Security Module)** — Hardware dedicado para operaciones criptográficas. Used en compliance alta.

**HSTS (HTTP Strict Transport Security)** — Header que fuerza HTTPS futuras conexiones.

---

## I

**IC (Incident Commander)** — Rol durante incidente: coordina equipo, comunica, decide.

**ICP (Ideal Customer Profile)** — Perfil del cliente ideal. Capítulo 07.2.

**IGNIS** — Org demo principal de AI Smart Content. Ficticia pero es la vitrina (memoria: `project_ignis_es_ficticia`). UUID `a1000000-...0001`.

**Integration credentials** — Tokens OAuth del cliente para Meta/Google/Shopify. Cifrados AES-256-GCM at rest.

**ISMS (Information Security Management System)** — Marco que certifica ISO 27001.

---

## J

**JWT (JSON Web Token)** — Token de auth firmado. Usado en dual-token approach (cp_token + dp_token).

---

## K

**KIE / Kling** — Vendors de generación de video AI. KIE = principal usado hoy.

**KMS (Key Management Service)** — Servicio para gestionar encryption keys. AWS KMS, Azure Key Vault, GCP KMS.

**KR (Key Result)** — En framework OKR: medible que demuestra progreso hacia un Objective.

---

## L

**LGPD (Lei Geral de Proteção de Dados)** — Ley Brasil de protección de datos. Similar a GDPR.

**LLM (Large Language Model)** — Modelo de lenguaje (Claude, GPT, Gemini). Vera usa Claude Opus 4.7.

**LOI (Letter of Intent)** — Carta de intención firmada por cliente, no contrato final pero indica seriousness.

**LTV (Lifetime Value)** — Revenue total esperado de un cliente a lo largo de su vida. Target LTV >3× CAC.

**LUKS** — Linux Unified Key Setup. Disk encryption en Linux. Configurar en VMs Hetzner Fase B.

---

## M

**Mat-view (Materialized View)** — Vista precomputada Postgres. Refresh manual o por cron. AI Smart Content tiene 8.

**MFA (Multi-Factor Authentication)** — Auth con segundo factor (TOTP, WebAuthn, SMS, etc.).

**Mid-market** — Cliente $5K-50K/año. Postobón, Bavaria, Oster Internacional class.

**MQL (Marketing Qualified Lead)** — Lead que pasó criterios de marketing (form fill, content download, etc.).

**MRR (Monthly Recurring Revenue)** — KPI principal. ARR / 12.

**MSA (Master Service Agreement)** — Contrato master enterprise. Firmed once, Order Forms per renewal.

**mTLS (Mutual TLS)** — TLS con certificados both sides (client + server). Used inter-service.

---

## N

**NDA (Non-Disclosure Agreement)** — Contrato de confidencialidad.

**Netlify Functions** — Serverless functions de Netlify. AI Smart Content tiene 30.

**NRR (Net Revenue Retention)** — % de revenue retenido + expansion. Target >110%.

---

## O

**OAuth** — Protocol de auth delegada. Used para Meta/Google/Shopify integrations.

**OKR (Objectives and Key Results)** — Framework de goal setting. Capítulo 08.5.2.

**OpenAPI** — Especificación de API REST (formerly Swagger). Genera docs automáticas.

**OTEL (OpenTelemetry)** — Estándar open source para tracing/metrics/logs.

**Owner / Admin / Editor / Viewer** — Los 4 roles base en RBAC. Capítulo 03.2.2.

---

## P

**P0/P1/P2/P3** — Priority levels usados en el libro: P0 bloqueante Fase A, P1 Fase B, P2 Fase C, P3 nice-to-have.

**Passkey** — Implementación de WebAuthn. Reemplaza passwords con biometric/device-bound credentials.

**Pen test (Penetration Test)** — Test de seguridad ofensivo simulando atacante.

**PG (Postgres)** — Base de datos relacional.

**pgvector** — Extensión Postgres para embeddings/vector search. AI Smart Content usa.

**PII (Personally Identifiable Information)** — Datos que identifican a un individuo.

**PITR (Point-in-Time Recovery)** — Backup tipo que permite restore a momento específico.

**PMF (Product-Market Fit)** — Estado donde el producto satisface el mercado consistently. Pre-PMF no escalar.

**POC (Proof of Concept)** — Implementación piloto para validar fit.

**Postgres self-hosted** — Postgres no managed (no Supabase). Más control, más overhead. Fase C eval para data plane.

**Provisioner** — Servicio que crea/destruye VMs vía Hetzner Cloud API.

---

## Q

**QBR (Quarterly Business Review)** — Reunión formal trimestral con cliente Enterprise/Tier-1.

**Quota** — Límite de uso (Apify scrapes/día, OpenAI tokens/mes, etc.).

---

## R

**RBAC (Role-Based Access Control)** — Modelo de permisos basado en roles. AI Smart Content usa 4 roles.

**Resend** — Vendor de email transaccional. En deps del repo.

**RLS (Row Level Security)** — Feature Postgres que filtra filas por contexto. AI Smart Content tiene 153 policies.

**RPC (Remote Procedure Call)** — Función Postgres llamable desde frontend vía Supabase.

**RPO (Recovery Point Objective)** — Max data loss aceptable en disaster. Target Tier-1: <5min.

**RTO (Recovery Time Objective)** — Max time hasta recover de disaster. Target Tier-1: <30min.

**RUM (Real User Monitoring)** — Monitoring de UX real (no synthetic). Web Vitals samples.

---

## S

**SAML 2.0** — Estándar SSO. Used por Okta, Azure AD enterprise.

**SCIM (System for Cross-domain Identity Management)** — Estándar para provisioning automático de users desde IdP. Tier-1 requirement.

**SDR (Sales Development Rep)** — Rol que qualifies inbound + light outbound. Pre-AE.

**SE (Sales Engineer)** — Rol técnico en sales. Acompaña AE en demos técnicos, POCs.

**Sensor** — Componente del pipeline que captura data del mundo. 13 sensores documentados.

**SIEM (Security Information and Event Management)** — Herramienta de aggregated security logging + alerting.

**SIG Lite (Shared Assessments)** — Cuestionario de security para vendor assessment. ~300 preguntas.

**SLA (Service Level Agreement)** — Contrato con cliente sobre uptime/performance.

**SLI (Service Level Indicator)** — Metric que medimos.

**SLO (Service Level Objective)** — Goal interno sobre SLI. Más estricto que SLA.

**SMB (Small / Medium Business)** — Cliente <$5K/año.

**SOC 2 (Service Organization Control 2)** — Compliance framework. Type 1 = controls exist. Type 2 = operate 6+ meses.

**SPOF (Single Point Of Failure)** — Componente cuya falla tumba todo. ai-engine actual es SPOF multi-tenant.

**SQL injection** — Vulnerability donde inputs maliciosos modifican queries SQL.

**SSO (Single Sign-On)** — Login centralizado via IdP (Okta, Azure AD).

**Stripe** — Vendor de payments. Global usage. AI Smart Content lo integrará Fase A.

**Supabase** — BaaS (Backend-as-a-Service) sobre Postgres. AI Smart Content lo usa para auth + DB + storage.

---

## T

**Tenant** — Organización cliente. 1 row en `organizations`.

**Tier-1** — Cliente >$50K/año. Multinational (Coca-Cola, Unilever, P&G).

**TOTP (Time-based One-Time Password)** — MFA method usando códigos rotativos (Google Authenticator, Authy).

**Trends Engine** — Subsistema de AI Smart Content que detecta tendencias globales. Único componente legítimamente cross-tenant.

---

## U

**Unit economics** — Análisis de revenue vs cost a nivel cliente individual. LTV/CAC ratio clave.

**Uptime** — % de tiempo que el servicio está disponible. SLO interno > SLA contractual.

---

## V

**Vault (Supabase)** — Extension Postgres para gestión de secrets. Habilitada pero no usada productivamente todavía.

**Vera** — El agente strategist IA. Claude Opus 4.7 con memory banks per-tenant. El moat principal.

**vera_pending_actions** — Tabla donde Vera deja propuestas esperando aprobación humana.

**VM (Virtual Machine)** — En la arquitectura: máquina dedicada por tenant Enterprise+. Hetzner CCX23/33.

**Vulnerability disclosure program** — Política pública para reportar vulnerabilities.

---

## W

**Wompi** — Pasarela de pago Bancolombia. Used para Colombia (factura electrónica DIAN integrada).

**Warm pool** — VMs pre-provisionadas esperando asignación. Reduce onboarding de 5-10min a <60s.

**WebAuthn** — Estándar para auth con device-bound credentials (passkeys, security keys).

**Webhook entrante** — POST request que vendors (Meta, Shopify) envían al sistema cuando ocurre evento.

**Webhook saliente** — POST request que el sistema envía al cliente cuando ocurre evento. Fase B.

**Workspace switcher** — UI para cambiar entre orgs si user es member en multiple. Fase B.

---

## X

(empty)

---

## Y

(empty)

---

## Z

**Zero trust** — Modelo de seguridad: no asume confianza por network position. Cada request validate identity + authorization.

---

## Acrónimos varios LatAm

| Acrónimo | Expansión | Significado |
|---|---|---|
| DIAN | Dirección de Impuestos y Aduanas Nacionales | Tax authority Colombia. Factura electrónica obligatoria B2B. |
| ANDI | Asociación Nacional de Industriales | Trade association Colombia. |
| ColombiaTech | Tech ecosystem Colombia | Eventos + networking. |
| Bavaria | Cervecería | Cliente target Fase B. |
| Postobón | Bebidas | Cliente target Fase B. |
| Nutresa | Alimentos | Cliente target Fase B. |
| FEMSA | Bebidas multinational | Cliente target Fase C. |
| INAI | Instituto Nacional de Transparencia (México) | Data protection authority México. |
| LFPDPPP | Ley Federal de Protección de Datos Personales en Posesión de los Particulares | Ley México. |

---

*Fin del libro. Volver al [README](../README.md).*
