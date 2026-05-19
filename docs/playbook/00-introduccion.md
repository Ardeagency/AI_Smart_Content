---
chapter: 00
title: Introducción
part: I — Fundamentos
estimated_reading_time: 15 min
---

# 00 · Introducción

## ¿Por qué este libro?

AI Smart Content nació en septiembre 2025 como una plataforma de **inteligencia comercial y generación autónoma de contenido**. Hoy, en mayo 2026, tiene los componentes técnicos correctos:

- 134 tablas Postgres, 199 funciones, 153 RLS policies, 8 mat-views.
- pgvector + brand intelligence multi-capa.
- ai-engine con Vera (Claude Opus 4.7), pipeline `sensor → signal → vulnerability → mission → action`.
- Frontend SPA de 40 vistas, 30 Netlify Functions, 13 sensores.
- Auth + storage + integraciones Meta, Google, Shopify, YouTube, KIE.
- Seguridad P0 cerrada (AES-256-GCM tokens, audit log, webhook replay).

**Pero NO está armado todavía como un SaaS profesional vendible a una marca tipo Coca-Cola, Postobón o Oster Internacional.** Le faltan piezas críticas:

- Pasarela de pago (Stripe es placeholder).
- Identidad enterprise (sin MFA, sin SSO/SAML, sin SCIM).
- Aislamiento real multi-tenant (ai-engine es SPOF compartido).
- CI/CD con gates y staging.
- API pública versionada con SDK y webhooks salientes.
- Compliance formal (DPA, SOC 2, ISO 27001).
- Observabilidad y SLA medibles.
- Customer Success operacional.

Este libro **describe paso a paso** cómo construir cada una de esas piezas. No es un wish-list, ni una auditoría, ni un manifesto. Es un **manual de construcción ejecutable**.

---

## ¿Qué es AI Smart Content como producto?

La narrativa pública (README.md):

> "Una arquitectura de **Marca Viva** que integra escucha social profunda, análisis de competencia y creación instantánea de activos digitales."

La narrativa interna (operacional):

> "**Infraestructura de marca premium con un agente IA (Vera) que vive en servidor dedicado por cliente, observa el mercado en tiempo real con sensores propios y produce respuestas alineadas al ADN de la marca, todo bajo control auditable del cliente.**"

La diferencia importa.

Si vendes "una herramienta de social listening + generación de contenido" compites con Hootsuite ($300/mes) y Jasper ($50/mes). Pierdes en precio y nadie compra Vera porque "ya tienen ChatGPT".

Si vendes "**la infraestructura que reemplaza al equipo de inteligencia de marca**, con un agente IA que vive en tu nube, en tu región, con tus datos sin compartir, observando 24/7, decidiendo cuándo responder, produciendo el contenido y midiendo el resultado", compites con **agencias** (donde una de marca te cobra $30K-$200K/mes) y **equipos internos** (donde un Brand Manager + Analyst + Editor cuestan $250K+/año). Ganas porque eres **10× más barato y nunca duermes**.

**Este libro construye lo segundo.**

---

## ¿Para quién es este libro?

Para todos los que trabajan en AI Smart Content — humanos y agentes IA.

| Rol | Por qué le importa |
|---|---|
| **Founders / Dirección** | Define qué construyes y con qué prioridad. Compromete el roadmap. |
| **CTO / Tech Lead** | Es el plano arquitectónico. Cada decisión técnica se mide contra este libro. |
| **Devs Backend** | Define qué corre en control plane vs data plane. Cómo se versionan migraciones. Cómo se loguea audit. |
| **Devs Frontend** | Define qué vistas exponen qué backend. Cómo se autentica. Cómo se notifica al usuario. |
| **SRE / DevOps** | Define cómo se despliega a N VMs, cómo se monitorea, cómo se recupera de falla. |
| **Security** | Define el threat model, los controles, el audit, el cifrado. |
| **Producto** | Define los tiers, el onboarding, qué vende y a quién. |
| **Customer Success** | Define el playbook de soporte, el SLA, el escalamiento. |
| **Sales** | Define qué se promete por tier, qué se prueba con datos, cómo se cierra Tier-1. |
| **Marketing** | Define el posicionamiento, el moat, el battle card vs incumbents. |
| **LLMs en el repo** | Define los principios que NO pueden violar al sugerir cambios. |

---

## ¿Qué NO es este libro?

Para evitar malentendidos:

- **NO es documentación del producto actual.** Para eso usar `docs/platform/`.
- **NO es la lista de tareas.** Para eso usar `docs/task/INDEX.md`.
- **NO es un audit en el sentido tradicional.** Los audits documentan gaps; este libro **resuelve** los gaps.
- **NO es un manual de uso para clientes.** Eso vendrá como `help.aismartcontent.io`.
- **NO es generic SaaS advice.** Cada recomendación está atada a la realidad del repo, el stack y el mercado objetivo (LatAm + global Tier-1).
- **NO es definitivo.** Es la versión 1.0 al 2026-05-13. Se actualiza trimestralmente.
- **NO se debe leer en orden secuencial obligatorio.** Cada capítulo se aguanta solo. La primera lectura sí conviene secuencial.

---

## El recorrido — tres horizontes

El libro asume tres horizontes temporales, alineados con `AUDIT-004`:

```
┌─────────────────────────────────────────────────────────────┐
│  FASE A — "Vendible a Oster Colombia"                       │
│  8-12 semanas · MRR target $5K-15K · Inversión $0-5K        │
│  ─────────────────────────────────────────────────────────  │
│  Cliente: marcas medianas LatAm, agencias boutique          │
│  Bloqueo: Stripe + MFA + staging + audit log UI             │
│  Modelo: multi-tenant compartido + RLS                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  FASE B — "Vendible a Postobón / Bavaria / Oster Intl"      │
│  3-6 meses adicionales · $30-100K/año/cliente · Inv $15-40K │
│  ─────────────────────────────────────────────────────────  │
│  Cliente: mid-market regional, retailers grandes            │
│  Bloqueo: rediseño ai-engine multi-tenant + SSO + API v1    │
│  Modelo: control plane + data plane híbrido empieza         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  FASE C — "Vendible a Coca-Cola / multinacional"            │
│  12+ meses · >$200K/año/cliente · Inversión $80-150K         │
│  ─────────────────────────────────────────────────────────  │
│  Cliente: Tier-1, multinacionales, RFPs corporativos        │
│  Bloqueo: SOC 2 Type 2 + multi-region + BYOK + SCIM         │
│  Modelo: control plane + data plane completo, VM por cliente │
└─────────────────────────────────────────────────────────────┘
```

**Cada capítulo identifica qué corresponde a cada fase.** Las prioridades están etiquetadas:

- 🔴 **P0** — bloqueante de Fase A
- 🟠 **P1** — bloqueante de Fase B
- 🟡 **P2** — bloqueante de Fase C
- 🟢 **P3** — opcional / nice-to-have

---

## Glosario inicial

Definiciones que se repetirán a lo largo del libro. Glosario completo en `apendices/glossary.md`.

| Término | Definición |
|---|---|
| **Control Plane** | ai-engine + Postgres central. Gestiona auth, billing, integraciones, orquestación. Una sola instancia redundante. |
| **Data Plane** | VM dedicada por tenant con Postgres + Vera + workers + storage locales. Tantas instancias como tenants. |
| **Tenant** | Una organización cliente. En el schema actual: una fila de `organizations`. |
| **brand_container** | Sub-marca regional/lineal dentro de una organización. Ej.: Coca-Cola Andina, Coca-Cola FEMSA bajo la org "Coca-Cola Global". |
| **Vera** | El agente estratégico IA. Claude Opus 4.7 con memory banks por tenant. |
| **Tier-1** | Cliente que paga >$50K/año. Coca-Cola, Unilever, P&G, FEMSA. |
| **Mid-market** | Cliente $5K-50K/año. Postobón, Bavaria, Oster Internacional. |
| **SMB** | Cliente <$5K/año. Marcas locales, agencias boutique. |
| **BYOK** | Bring Your Own Key — el cliente trae sus credenciales (Apify, OpenAI, Meta App) en vez de usar las del SaaS. |
| **DPA** | Data Processing Agreement — contrato firmable entre proveedor y cliente para GDPR. |
| **SLA** | Service Level Agreement — contrato de uptime/performance medible. |
| **SLO** | Service Level Objective — meta interna que respalda el SLA contractual. |
| **SOC 2** | Compliance audit emitido por CPA firm (Vanta/Drata gestionan la plataforma). Type 1 = "controles existen". Type 2 = "controles operan consistente 6+ meses". |
| **RLS** | Row Level Security — feature de Postgres que filtra filas por tenant. |
| **SPOF** | Single Point Of Failure — un componente cuya caída tumba todo el sistema. |

---

## Cómo se actualiza este libro

- **Trimestralmente:** revisión completa. Se mueven items entre fases. Se agregan capítulos si surge un dominio nuevo.
- **Cuando cambia algo estructural:** ej., se firma primer cliente Tier-1, se decide migrar de Hetzner a otra nube, se contrata un security officer. Esto detona revisión del capítulo afectado.
- **Versionado:** cada cambio mayor incrementa la versión en el README. Los cambios se trackean en git (no se sobreescribe el libro).
- **Responsable:** el CTO / Tech Lead es el dueño formal. Cualquiera del equipo puede proponer cambios vía PR.

---

## Empezar a leer

Si es tu primera lectura:

1. Lee este capítulo (00) y los **principios** del capítulo 01 — eso son ~30 min.
2. Salta al capítulo 08 (Roadmap) para ver qué se está construyendo ahora — ~20 min.
3. Vuelve al capítulo correspondiente a tu rol (ver tabla en el README).

Si vas con prisa:

- Lee capítulo 01 (principios) y capítulo 08 (roadmap). Total ~50 min. Tienes la foto.

Si eres un LLM:

- Lee este capítulo + capítulo 01 (fundamentos) + capítulo 02 (arquitectura) + capítulo 03 (seguridad). Estos cuatro contienen las reglas no negociables. Cuando sugieras un cambio, **valida contra ellas**.

---

*Capítulo siguiente: [01 · Fundamentos del negocio y la arquitectura](./01-fundamentos.md)*
