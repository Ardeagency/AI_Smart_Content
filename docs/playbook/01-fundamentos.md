---
chapter: 01
title: Fundamentos del negocio y la arquitectura
part: I — Fundamentos
estimated_reading_time: 30 min
---

# 01 · Fundamentos del negocio y la arquitectura

> Este capítulo define **lo no negociable**. Si una propuesta nueva viola alguno de estos principios, no se discute la implementación — se discute si el principio sigue válido.

---

## 1.1 Los 10 principios no negociables

### Principio 1 — Vera es el moat. Todo lo demás se replica.

El pipeline de scraping (Apify), los dashboards, la generación de contenido (KIE/Kling), la integración con Meta — todo lo replica un equipo de 10 ingenieros en 6 meses. **Vera + el brand intelligence context de 10 capas + las memory banks vivas no se copian rápido.**

Implicaciones:
- Invertir desproporcionadamente en Vera (memory banks, simbiosis Vera↔humano, mejores prompts, mejores embeddings).
- **Nunca** poner a Vera a competir con ChatGPT/Claude genérico. Vera es **estratega de marca**, no asistente.
- La narrativa de venta gira alrededor de Vera, no de "una plataforma de social listening".

### Principio 2 — Los datos del cliente NUNCA viajan a infra de otro cliente.

RLS lógico es el mínimo. Aislamiento físico (VM dedicada por tenant) es lo que vendemos a Tier-1.

Implicaciones:
- Free/Creator/Team pueden compartir Postgres central (RLS suficiente).
- Agency/Enterprise/Tier-1 = data plane dedicado (VM con su Postgres).
- **Ningún** componente cross-tenant excepto Trends Engine global (que opera con datos públicos agregados, no con datos del cliente).

### Principio 3 — El control plane es solo para orquestar y meterizar.

El control plane (ai-engine + Postgres central) **no almacena datos sensibles del cliente**. No guarda brand posts, no guarda intelligence_signals, no guarda product fichas. Solo:
- Identidad de usuarios + orgs.
- Billing + plans + credits.
- API keys + webhook subscriptions.
- Audit log global (qué tenant hizo qué, sin payload sensible).
- Tokens **transitorios** durante OAuth handshake (se reenvían a la VM org y se borran).

Si un dato es sensible del negocio del cliente, vive en la VM org. Punto.

### Principio 4 — Las APIs externas pagas pasan por gateway con metering.

Apify, OpenAI, Anthropic, KIE, Kling, Meta Graph API. Toda llamada pasa por ai-engine como gateway:
1. Valida org_id del caller (JWT firmado).
2. Verifica budget restante (`credit_usage`, `plans.daily_cap`).
3. Aplica dedupe cuando aplica (queries genéricas cross-tenant).
4. Logea la call atribuible (org_id, endpoint, cost, timestamp).
5. Llama al vendor con la cuenta maestra (o BYOK del cliente Tier-1 si aplica).
6. Devuelve resultado a la VM org.

**Sin gateway, el costo se descontrola y la atribución de cost-per-tenant es imposible.** Esto ya existe parcialmente con el proxy Anthropic (`FEAT-014`, cerrado 2026-05-05) — ese patrón se extiende.

### Principio 5 — Las integraciones de cliente (Meta, Google, Shopify) ejecutan en su VM.

El OAuth handshake termina en control plane (recibe el callback), pero el **token persiste cifrado en la VM org** y las llamadas a la API del vendor se hacen **desde la VM org**.

Razones:
- Aislamiento de blast radius: ban de Meta a un cliente no tumba a otros.
- Auditabilidad: el cliente puede ver "todas mis llamadas a Meta salieron de mi VM".
- Compliance: el token nunca persiste en infra compartida.
- BYOK natural: cliente Tier-1 puede traer su propia Meta App / Google Cloud project.

### Principio 6 — Sin metering accionable, no hay business model.

Cada acción que cuesta plata (LLM call, video gen, scrape, storage, bandwidth) **debe** estar atribuible a una org con costo cuantificado. Sin esto:
- No puedes hacer usage-based pricing.
- No puedes detectar abuso.
- No puedes optimizar costo per cliente.
- No puedes cobrar overage.

El schema `credit_usage` ya existe. Hay que asegurar que **todo** consumo lo registre.

### Principio 7 — Falla por defecto a "denegar", no a "permitir".

Cuando algo no está claro (token expirado, role indefinido, query sin org_id), la respuesta es 403/4xx, no fallback a "default tenant". Esto se llama **fail-closed security**.

Casos concretos:
- RPC sin `org_id` parameter → reject, no asumir org del JWT.
- Query con `auth.uid()` NULL → reject, no devolver fila default.
- Webhook con firma inválida → drop, no procesar.
- Sensor que no puede determinar tenant → log + skip, no escribir a "primer tenant disponible".

### Principio 8 — Toda escritura sensible deja audit log.

Acciones que dejan rastro obligatorio en `user_audit_log`:
- Login/logout, password change, MFA enable/disable.
- Creación/modificación/borrado de org, members, roles.
- Conexión/desconexión de integraciones.
- Creación/borrado de brand_containers, products, intelligence_entities.
- Aprobación/rechazo de pending_actions de Vera.
- Cambio de plan, compra de credits, request de delete-all-data.

Cada entrada incluye: `actor_user_id`, `org_id`, `action`, `resource_type`, `resource_id`, `ip`, `user_agent`, `request_id`, `timestamp`, `payload_summary` (no payload completo si tiene PII).

### Principio 9 — Reglas + matemática + embeddings en background. LLM solo en chat o batch.

Documentado en memoria como `feedback_no_llm_in_background`. Los scrapers, sensores, alignment, threat-detector usan reglas + templates + matemática + embeddings (text-embedding-3-large/small). **LLM solo en:**
- Chat cara al usuario (VeraView).
- Batch deliberado y costoso (estrategia semanal, brand-indexer si aplica).

Razón: el costo de Anthropic/OpenAI escala con uso. Si cada signal nuevo dispara una llamada Claude, a 10K signals/día son $300+/día. Inviable.

### Principio 10 — El producto es soberanía de marca, no automatización.

Vera no decide sola publicaciones a producción salvo aprobación humana explícita (mission approve flow). El cliente **conserva la última palabra**. Esto:
- Reduce riesgo legal y reputacional.
- Construye confianza con la marca cliente.
- Permite cobrar más (la marca paga porque tiene control, no porque pierde control).

Implicación: el modelo simbiótico Vera↔humano (`project_simbiosis_v1`) es central, no opcional.

---

## 1.2 Modelo de negocio

### 1.2.1 Customer tiers

| Tier | MRR target | Customer profile | Modelo infra |
|---|---|---|---|
| **Free** | $0 | Trial 30 días, 1 brand_container, sin integraciones | Multi-tenant shared |
| **Creator** | $49-99 | Creators individuales, freelancers | Multi-tenant shared |
| **Team** | $299-499 | Equipos pequeños, agencias boutique, 1 marca | Multi-tenant shared |
| **Agency** | $999-2999 | Agencias mid-size, 3-10 brand_containers, multi-cliente | Multi-tenant shared con tier dedicado en gateway |
| **Enterprise** | $5K-15K | Marcas medianas LatAm (Oster Colombia, Bavaria filial), 10+ brand_containers | **VM dedicada** (data plane) |
| **Tier-1 Dedicated** | $20K-50K+ | Multinacionales (Coca-Cola FEMSA, P&G, Unilever), multi-región, BYOK, SLA contractual | VM dedicada multi-región + BYOK |

### 1.2.2 ¿Cuándo se justifica VM dedicada por cliente?

Costo Hetzner CCX23 (4 vCPU, 16GB RAM, 80GB SSD, Falkenstein): ~$40/mes + Cloudflare Tunnel + backups + monitoring ~$60/mes total.

Con margin 70%, eso requiere **mínimo $200/mes** para break-even infra. Por eso:
- Free/Creator/Team/Agency: shared infra (margin ~85-90%).
- Enterprise+: dedicado (margin 60-70%, premium price compensa).

### 1.2.3 Revenue mix proyectado

Año 1 (post-Fase A): 95% shared / 5% dedicated. Foco en validar producto.
Año 2 (post-Fase B): 70% shared / 30% dedicated. Mid-market entra.
Año 3 (post-Fase C): 40% shared / 60% dedicated. Tier-1 firmados.

Razón: el revenue por dedicated es 20-50× el shared. Aun con minoría de clientes, mayoría del MRR.

---

## 1.3 El moat — qué hace defendible a AI Smart Content

Cuando un buyer compara con Brandwatch + Jasper + Hootsuite + ChatGPT, lo que tiene que justificar el precio premium es **el moat real**, no features superficiales.

### Moat 1 — Modelo `organization` ↔ `brand_container` ↔ products multi-nivel

Documentado en `project_data_model_org_vs_brand_container`. Coca-Cola FEMSA y Coca-Cola Andina son operaciones independientes con dueños distintos, marketing distinto, productos distintos — pero comparten **brand DNA**. Brandwatch los trata como dos cuentas separadas. AI Smart Content los modela como `brand_containers` distintos bajo una `organization` "Coca-Cola Global", con products/brand_entities org-scope compartidos. **Esto es ventaja competitiva en LatAm y en multinacionales.**

### Moat 2 — Vera y el brand intelligence context multi-capa

`build_full_brand_intelligence_context` tiene 10 capas:
1. Identidad de marca (voice, principles).
2. Posicionamiento.
3. Productos + servicios + variantes.
4. Audiencias (demografía, psicografía, heatmap).
5. Histórico de campañas reales vs conceptuales.
6. Histórico de signals + vulnerabilities + missions.
7. Embeddings del corpus de marca (`ai_brand_vectors`).
8. Lexicon dimensional (160 rows en `dimension_lexicon`).
9. Brand assets, fonts, colors, rules.
10. Memory banks vivas (Vera aprende de cada conversación aprobada).

Reproducir esto requiere arquitectura compleja + tiempo de operación + dataset. **6-12 meses de ventaja** sobre cualquier nuevo entrante.

### Moat 3 — Pipeline cerrado sensor → action

Brandwatch escucha. Hootsuite publica. Jasper genera. **Ninguno cierra el ciclo.** AI Smart Content:
1. Escucha (13 sensores: Meta, GA4, YouTube, Apify, etc.).
2. Procesa (threat-detector, alignment, lexicon).
3. Genera vulnerabilidades y oportunidades.
4. Vera produce mission strategy.
5. Mission aprobada → action-executor produce contenido.
6. KIE/Kling genera video.
7. Publica (vía Meta API).
8. Mide impact (`brand_analytics_snapshots`).
9. Feedback loop a Vera.

**El ciclo cerrado es la diferenciación funcional principal.**

### Moat 4 — Soberanía: "tu Vera, en tu servidor"

Con la arquitectura federada (capítulo 02), Vera vive en infra dedicada del cliente. Eso permite:
- Data residency real (EU client → EU VM).
- BYOK (cliente trae sus credenciales).
- Exit clean (snapshot portable).
- Compliance trivial (cada VM es unidad auditable).

Brandwatch/Hootsuite/Jasper son SaaS multi-tenant 100%. **No pueden ofrecer esto sin reescribir 5 años de arquitectura.**

### Moat 5 — LatAm-first

Pensado para Colombia/México/Brasil:
- Factura electrónica DIAN integrada (Colombia).
- Wompi/MercadoPago para LatAm.
- UI en español primero.
- Equipo en Medellín (cercanía a Bavaria, Postobón, Nutresa).
- Conocimiento de marcas regionales (Tron, Pony Malta, Manaos).

Hootsuite y Brandwatch tienen mucha presencia en LatAm pero **no son LatAm-native**. AI Smart Content puede ganar el bracket "premium LatAm-first" sin competir frontalmente con los gigantes globales.

---

## 1.4 Modelo de arquitectura — vista a 10,000 pies

Detalle completo en capítulo 02. Aquí solo la decisión fundamental:

**Federated tenancy con Control Plane / Data Plane split.**

```
                ┌─────────────────────────────────┐
                │      CONTROL PLANE              │
                │      (ai-engine central)         │
                │                                  │
                │  • Auth + orgs + billing         │
                │  • Gateway APIs externas         │
                │  • Trends Engine global          │
                │  • Provisioner VMs               │
                └─────────────┬───────────────────┘
                              │
                  ┌───────────┼───────────┐
                  ▼           ▼           ▼
              ┌──────┐    ┌──────┐    ┌──────┐
              │ VM   │    │ VM   │    │ VM   │
              │ org1 │    │ org2 │    │ orgN │
              │      │    │      │    │      │
              │ Data │    │ Data │    │ Data │
              │ plane│    │ plane│    │ plane│
              └──────┘    └──────┘    └──────┘
```

**Implicaciones de diseño que viven en cada capítulo:**
- Capítulo 02 — cómo se hace técnicamente.
- Capítulo 03 — cómo se asegura.
- Capítulo 04 — cómo se opera (deploy a N VMs).
- Capítulo 05 — cómo se expone al cliente (API pública, billing).
- Capítulo 06 — cómo se certifica (SOC 2, ISO).
- Capítulo 07 — cómo se vende.
- Capítulo 08 — cuándo se construye cada parte.

---

## 1.5 Anti-patrones explícitos

Cosas que se han visto o propuesto y que **no hacemos**:

### ❌ Anti-patrón 1 — "Mover todo a microservicios"
No. El monolito modular Netlify + ai-engine funciona. La complejidad viene del split control/data plane, no de splittear ai-engine en 20 microservicios.

### ❌ Anti-patrón 2 — "Migrar a React Native / Flutter"
No hasta que haya app móvil real con product-market fit. El SPA Vanilla JS sirve hoy.

### ❌ Anti-patrón 3 — "Usar Kubernetes desde el día 1"
No. Hasta 50 tenants, Pulumi/Terraform + Ansible alcanza. K8s solo a partir de 50+ VMs simultáneas.

### ❌ Anti-patrón 4 — "Construir nuestro propio LLM"
No. Anthropic Claude Opus es 100× más capaz de lo que necesitamos. Fine-tuning eventual sobre Claude/GPT en años 3+, no antes.

### ❌ Anti-patrón 5 — "Hacer SOC 2 ya por si acaso"
No. Sin cliente que lo exija contractualmente, $30K-50K que no se traducen en revenue. Se prepara la documentación interna, no se paga auditoría.

### ❌ Anti-patrón 6 — "Self-hosted Postgres en lugar de Supabase"
**Solo para data plane.** El control plane queda en Supabase (Pro / Team plan). Cambiar a Postgres self-managed central agrega complejidad sin beneficio claro. Detalle en capítulo 02.

### ❌ Anti-patrón 7 — "Mover Vera a un LLM open source"
No. Llama 3 / Mistral son inferiores a Claude Opus para razonamiento estratégico. Se evalúa cada año, pero no se cambia por costo si afecta calidad de output (que es el moat).

### ❌ Anti-patrón 8 — "Build vs buy todo"
Hay piezas donde build pierde:
- **Stripe** → buy (no construyas billing).
- **Resend** → buy (no construyas email infra).
- **Sentry** → buy (no construyas error tracking).
- **Hetzner** → buy (no compres servidores).
- **Anthropic/OpenAI** → buy (no entrenes LLMs).
- **Vera context + agente** → build (el moat).
- **Pipeline sensor→mission** → build (el moat).
- **brand_container model** → build (la ventaja LatAm).

### ❌ Anti-patrón 9 — "Cobrar todo por seat"
No siempre. Marcas grandes tienen 100+ users pero solo 5 paying user-equivalents. Pricing híbrido:
- **Per seat** para users activos en el dashboard (creators, editors).
- **Per brand_container** para sub-marcas monitoreadas.
- **Per usage** para créditos de LLM/video/scraping.
- **Per region** para Tier-1 con multi-data residency.

### ❌ Anti-patrón 10 — "Free tier para siempre"
Free tier de 30 días, no eterno. Eterno atrae freeloaders. 30 días con feature completo permite evaluación honesta.

---

## 1.6 Métricas de éxito por fase

Cada principio se traduce en métricas. Tablero ejecutivo:

### Fase A (cierra Q3 2026)
- [ ] 1 cliente paying confirmado ($5K+/mes).
- [ ] MFA enabled rate >80% en owners + admins.
- [ ] 0 incidentes de seguridad reportados.
- [ ] Uptime medido externo ≥99.5% (no SLA, solo medición).
- [ ] Cost per active org calculable y <$50/mes para shared tier.

### Fase B (cierra Q1 2027)
- [ ] 5+ clientes paying simultáneos.
- [ ] SSO funcionando con ≥1 cliente real.
- [ ] API pública v1 con ≥1 cliente consumiendo.
- [ ] Pen test externo limpio (sin findings critical ni high).
- [ ] DPA firmado con ≥3 clientes.
- [ ] Uptime ≥99.9%.

### Fase C (cierra Q4 2027)
- [ ] 1 cliente Tier-1 firmado (>$200K/año).
- [ ] SOC 2 Type 2 attestation obtenida.
- [ ] Multi-región operacional (EU + US + LatAm).
- [ ] SCIM funcionando con cliente Okta.
- [ ] Uptime ≥99.95%.

---

## 1.7 Decisiones que esperan input humano

Antes de profundizar en capítulos siguientes, definir estas con dirección:

1. **Target cliente next 12 meses:** ¿SMB LatAm (Oster Colombia) o mid-market (Postobón)? Cambia priorización de Fase A.
2. **Pricing model definitivo:** ¿per seat, per brand_container, per usage, híbrido? Cambia diseño de billing.
3. **Geografía go-to-market:** ¿Colombia primero, LatAm, global desde el día 1? Cambia infra (multi-región o no).
4. **Equity para compliance:** ¿se prioriza SOC 2 en Fase B o se difiere a Fase C? Cambia inversión.
5. **Equipo:** ¿se contrata SRE dedicado en Fase B? Cambia plazo del split control/data plane.

Estas decisiones no las toma este libro. Las documenta para que el roadmap (capítulo 08) las incorpore.

---

## 1.8 Lectura corta

- **Vera + brand_container model + pipeline cerrado** son el moat. Defenderlo es la prioridad #1.
- **Control plane / data plane** es el modelo arquitectónico target. Detalle en capítulo 02.
- **6 tiers** (Free → Tier-1 Dedicated). Shared infra hasta Agency. Dedicado desde Enterprise.
- **Fail-closed siempre.** No se asume nada sin verificación.
- **Buy lo commodity, build el moat.** Stripe sí, Resend sí, Sentry sí. Vera no, brand context no, pipeline no.
- **Tres fases con métricas claras.** Fase A primero. No saltarse.

---

*Capítulo siguiente: [02 · Arquitectura Control Plane / Data Plane](./02-arquitectura.md)*
