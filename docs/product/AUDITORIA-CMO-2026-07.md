# Auditoría CMO integral + reparaciones — 2026-06-30 → 2026-07-02

> Resumen ejecutivo del arco completo: auditoría de 4 capas con ojo de CMO,
> reparaciones desplegadas, y estado final. Detalle operativo en los docs
> hermanos: NORTH-STAR-PLATILLO.md, DASHBOARDS-V2-VISION.md,
> DASHBOARDS-V2-MIMARCA-REBUILD.md, SALUD-DE-MARCA-V2-SPEC.md,
> LOOP-V1-PUENTE-PRODUCCION.md.

## La tesis raíz de la auditoría

**Órganos de clase mundial sin circulación.** En las 4 capas (DB, motor,
frontend, integraciones) el mismo patrón: arquitectura correcta construida y
luego desconectada del flujo del dato comercial. Causa: proporcionalidad de
esfuerzo invertida — se construyó lo fácil/commodity (posts→sentimiento, charts,
OAuth connects) y se esquivó lo difícil/valioso (conversiones, clientes, órdenes,
precios, loops cerrados). El valor único (el satélite que cruza todo y dice LA
JUGADA) estaba a oscuras; lo encendido era el espejo redundante de Meta.

## Hallazgos por capa (2026-06-30)

- **DB**: personas=1 (cascarón), retail_prices vacía, 51 recomendaciones sin una
  sola medida, campañas sin brief/persona/roas. Basura: vulnerabilities mecánicas
  ("Monster 2.8x"), widgets featured_*, firehose de signals.
- **Motor**: 128 tools, loops de outcome CORRIENDO pero hambrientos (nada que medir).
- **Frontend**: el mejor patrón (Action Cards de Estrategia, 16KB) enterrado bajo
  el muro de charts (Mi Marca, 133KB) que espeja a Meta.
- **Integraciones**: peaje pagado (OAuth, App Reviews) y mercancía tirada —
  Shopify orders/customers STUBS, GA4 conectado sin consumir, leads_retrieval
  pedido sin construir, reseñas ML sin ingestar.

## Reparaciones DESPLEGADAS (todas verificadas en prod)

| Fecha | Fix | Estado |
|---|---|---|
| 06-30 | Deadlock demografía de campañas (`campaign-performance` gated por persona_id) | ✅ Live |
| 06-30 | 5 sensores del dato comercial reactivados (mal-pausados "por costo Apify" — ninguno usa Apify) → demografía IG+GA4 fluyendo a personas | ✅ Verificado con dato real |
| 06-30 | Persona "Trabajadores que corren" estructurada con target → alignment 0→~0.67 | ✅ |
| 07-01 | Bug deprovisión (no destruía VM + delete violaba FK) → re-provisión limpia | ✅ Live |
| 07-01 | Ambas Veras (IGNIS+WAKEUP) re-provisionadas en VMs nuevas con skills enriquecidas (cmo-strategizing + geo-optimizing con doctrina) + maxTokens 16000 | ✅ Healthy |
| 07-01 | serverReady registra skills_installed + phase (registro confiable) | ✅ Live |
| 07-01 | **Generador de recetas `strategy-review`** — el chef escribe recomendaciones DIARIAS ancladas en dato real (doctrina CMO en el prompt); sensor auto-creado para todas las marcas | ✅ Live, verificado (3 recetas WAKEUP) |
| 07-02 | **Puente Loop V1 `recommendation-producer`** — aprobar en la cata → producción automática (camino n8n del Studio) + link determinista + fix carrera mission-generator | ✅ Live (E2E espera primera cata) |

## Estado del loop (2026-07-02)

```
Recetas diarias ✅ → Cata en app ✅ → Puente producir ✅ (LIVE)
  → Publish gateado ✅ → Link determinista ✅ → Medición ✅
```
**Falta solo el acto inaugural**: la primera cata (aprobar una receta en el tab
Estrategia de WAKEUP) dispara el primer plato 100% cocinado por la plataforma.

## Deuda documentada (en orden de prioridad CMO)

1. **Primer loop cerrado E2E** (cata → producir → publicar → medir → 1ª cuenta rendida).
2. **Mi Marca V2** (plan completo en DASHBOARDS-V2-MIMARCA-REBUILD.md): matar
   chatarra → Salud V2 → voz +/− → GA4 (quick win: conectado y sin pintar) →
   atribución con receta → capa comercial.
3. **Encender dato comercial** (stubs Shopify orders/customers, reseñas ML,
   selector de cuenta Google Ads) — ver docs/task/INTEGRACIONES-PENDIENTES.md.
4. **Contexto RICO al generador de recetas** (hoy usa el liviano; con demografía
   real + competidor + market_pulse las recetas pasan de buenas a afiladas).
5. Poda de ruido: threat-detector→vulnerabilities mecánicas, featured_*.
6. 2º horizonte (whitespace CMO): simulador de escenarios (MiroFish AGPL⚠️ +
   Meta TRIBE v2), cerebro de precio/margen, disponibilidad mental/CEPs, ESOV,
   brand equity ledger, memoria institucional.
