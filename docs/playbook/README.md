---
title: AI Smart Content — Playbook para SaaS profesional y seguro
subtitle: Manual de construcción para llegar de SMB a marcas Tier-1 (Coca-Cola, Postobón, Oster Internacional)
version: 1.0
last_review: 2026-05-13
author: Arde Agency S.A.S.
audience: equipo técnico + producto + dirección + LLMs trabajando en el repo
---

# AI Smart Content — Playbook para SaaS profesional y seguro

> **Por qué existe este documento.**
> AI Smart Content tiene los componentes correctos (199 funciones Postgres, 153 RLS policies, Vera, brand intelligence multi-capa, pipeline cerrado sensor → mission → action), pero **no está armado todavía como un SaaS profesional vendible a marcas Tier-1**. Este libro describe paso a paso cómo llegar.
>
> No es un audit más. Es **el manual de construcción** que vamos a seguir durante los próximos 12-18 meses.

---

## Cómo está organizado

El libro tiene **8 partes** + **3 apéndices**. Cada parte es un capítulo independiente que puede leerse solo, pero está pensado para leerse en orden la primera vez.

### Parte I — Fundamentos
- [00 · Introducción](./00-introduccion.md) — qué es, qué problema resuelve, qué es y qué NO es este libro.
- [01 · Fundamentos del negocio y la arquitectura](./01-fundamentos.md) — los 10 principios no negociables, target customer tiers, el moat real.

### Parte II — Arquitectura técnica
- [02 · Arquitectura federada Control Plane / Data Plane](./02-arquitectura.md) — split central/VM, ai-engine como gateway con metering, Postgres distribuido, sync gRPC.

### Parte III — Seguridad
- [03 · Seguridad enterprise](./03-seguridad.md) — threat model, identidad (MFA/SSO/SAML/SCIM/RBAC), cifrado, secretos, RLS, audit log, webhooks, vulnerability mgmt, GDPR / LATAM.

### Parte IV — Operaciones
- [04 · Operaciones de plataforma](./04-operaciones.md) — multi-region, CI/CD distribuido, migrations, observabilidad, SLA, DR, on-call, FinOps.

### Parte V — Producto enterprise
- [05 · Producto enterprise](./05-producto-enterprise.md) — onboarding, Customer Success, API pública v1, SDK, billing (Stripe + Wompi + tax), plans.

### Parte VI — Compliance y Trust
- [06 · Compliance y Trust](./06-compliance.md) — SOC 2, ISO 27001, DPA, sub-processors, cookie consent, vulnerability disclosure, insurance.

### Parte VII — Go-to-Market
- [07 · Go-to-Market y escalado](./07-go-to-market.md) — pricing strategy, sales motion Tier-1, procurement readiness, battle cards.

### Parte VIII — Ejecución
- [08 · Roadmap ejecutable](./08-roadmap-ejecutable.md) — Fase A (semanas), Fase B (meses), Fase C (trimestres), métricas, decisiones pendientes.

### Apéndices
- [A · Checklist completo de seguridad](./apendices/checklist-seguridad.md)
- [B · Checklist completo de operaciones](./apendices/checklist-operaciones.md)
- [C · Glosario](./apendices/glossary.md)

---

## Audiencia

| Rol | Capítulos críticos | Tiempo lectura |
|---|---|---|
| **Dirección / Founders** | 00, 01, 07, 08 | 1.5h |
| **CTO / Tech Lead** | Todos | 6-8h |
| **Devs Backend** | 02, 03, 04, apéndices A+B | 3h |
| **Devs Frontend** | 00, 01, 05 | 1.5h |
| **SRE / DevOps** | 02, 04, 06, apéndice B | 3h |
| **Security** | 03, 06, apéndice A | 2h |
| **Producto** | 00, 01, 05, 07 | 2h |
| **Customer Success / Soporte** | 00, 05, 07 | 1.5h |
| **LLMs trabajando en repo** | 00, 01, 02, 03, 08 | scan |

---

## Cómo usar este libro

1. **Lectura inicial:** alguien del equipo lo lee completo (~6-8h) y resume al resto.
2. **Onboarding:** todo nuevo dev senior lee parte I + capítulo según rol antes del primer commit.
3. **Decisión técnica:** ante cualquier propuesta arquitectónica nueva, validar contra los principios del capítulo 01 y el split del capítulo 02.
4. **Revisión trimestral:** el libro se actualiza cada trimestre o cuando hay cambio estructural. Las versiones quedan en git.
5. **Trabajo con LLMs:** los agentes IA que asistan en el repo deben referenciar este libro antes de proponer cambios arquitectónicos.

---

## Estado del libro vs estado del producto

> **Importante.** Este libro describe el estado **target**. El producto actual NO cumple todo lo escrito aquí. La diferencia es deliberada — el libro es el plano, no el inventario.

Para conocer el estado **actual** del producto consultar:
- `docs/platform/09-current-state.md` — snapshot vivo.
- `docs/task/INDEX.md` — tareas activas.
- `docs/task/AUDIT-003-enterprise-readiness-2026-05-12.md` — auditoría enterprise.
- `docs/task/AUDIT-004-premium-saas-tier1-brands-2026-05-13.md` — análisis Tier-1.

Este playbook **toma como insumo** esos documentos y los traduce en un manual ejecutable.

---

## Versionado

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0 | 2026-05-13 | Versión inicial. Establece estructura completa de 8 partes + 3 apéndices. |

---

## Convenciones

- **🔴 P0** — bloqueante para Fase A (vendible a Oster).
- **🟠 P1** — bloqueante para Fase B (vendible a Postobón).
- **🟡 P2** — bloqueante para Fase C (vendible a Coca-Cola).
- **🟢 P3** — opcional / nice-to-have.
- **Control Plane** — ai-engine central + Postgres central.
- **Data Plane** — VM dedicada por tenant con Postgres + Vera + workers locales.
- **Tier-1** — cliente >$50K/año (Coca-Cola, FEMSA, Unilever, P&G…).
- **Mid-market** — cliente $5K-50K/año (Postobón, Bavaria, Oster Internacional…).
- **SMB** — cliente <$5K/año (Oster Colombia, agencias boutique, marcas locales…).

---

*Arde Agency S.A.S. — Medellín, Colombia · 2026*
