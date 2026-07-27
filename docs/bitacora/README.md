---
title: Bitácora de construcción — AI Smart Content
autor: Claude (Arde Agency S.A.S.)
fecha_corte: 2026-07-27
audiencia: equipo ARDE + LLMs/agentes que trabajen sobre la plataforma + auditores
estado: documento vivo
---

# Bitácora de construcción

Este es el **registro de lo que se ha construido** en AI Smart Content: la consola,
el `ai-engine`, Vera, la base de datos, las integraciones y la doctrina de producto
que gobierna las decisiones.

No es un manual de arquitectura — para eso está [`../platform/`](../platform/), que
describe *cómo está hecha* la plataforma. Esta bitácora responde otra pregunta:
**qué se hizo, cuándo, por qué, qué quedó vivo y qué quedó pendiente.** Es la
memoria de ingeniería del proyecto, escrita para que alguien (persona o agente)
que llegue nuevo entienda el estado real sin tener que arqueología de 4.000 commits.

---

## Índice

| # | Documento | Qué contiene |
|---|---|---|
| 01 | [Mapa del sistema](./01-mapa-del-sistema.md) | Las piezas, dónde vive cada una, quién hace qué, vocabulario del producto |
| 02 | [Frontend — la consola](./02-frontend-console.md) | SPA, vistas, dashboards, i18n, auditorías, sistema visual |
| 03 | [ai-engine](./03-ai-engine.md) | El motor: servicios, scrapers, sensores, python-analyzer, endurecimiento |
| 04 | [Vera](./04-vera.md) | El cerebro: protocolo v3, tools, autonomía, cerebro de razonamiento, lecturas de dashboard |
| 05 | [Datos — Supabase](./05-datos-supabase.md) | Modelo de datos, RPCs, métricas, retención, teardown del clasificador, auditorías |
| 06 | [Integraciones y sensores](./06-integraciones-y-sensores.md) | Meta, Google, TikTok, Shopify, Mercado Libre, X, Apify, KIE, R2, tendencias |
| 07 | [Doctrina de producto](./07-doctrina-de-producto.md) | Las reglas que gobiernan qué se construye y cómo se nombra |
| 08 | [Cronología](./08-cronologia.md) | Línea de tiempo mes a mes, de septiembre 2025 a julio 2026 |
| 09 | [Deuda abierta](./09-deuda-abierta.md) | Lo que falta, ordenado por severidad, con puntero al archivo de tarea |

---

## Cómo se escribió esto (y cuánto confiar en cada dato)

Tres fuentes, en orden de autoridad:

1. **Código y servidores vivos** — inventario del repo `Ardeagency/AI_Smart_Content`
   y del servidor `ai-engine` (systemd, `ls` de servicios, timers, contadores de
   arranque). Todo lo marcado *verificado 2026-07-27* se leyó del sistema real ese día.
2. **Historial de git** — 4.072 commits en el frontend (2025-09-16 → 2026-07-27) y
   101 en `ai-engine` (2026-05 → 2026-07-24).
3. **Memoria de trabajo acumulada** — 316 notas de sesión con decisiones, causas raíz
   y gotchas. De ahí salen las fechas y los *por qué*.

**Advertencia honesta:** los datos con fecha reflejan lo que era cierto ese día.
Donde hay riesgo de que algo haya cambiado, la fecha está escrita al lado. Antes de
actuar sobre un dato de hace meses, verifíquelo contra el sistema.

---

## Reglas de mantenimiento

- **La deuda técnica vive en `docs/task/`**, un archivo por tarea; al resolverla se
  borra el archivo. Esta bitácora sólo la resume y apunta ahí.
- **Lo del producto se documenta en el repo del producto.** Si una decisión afecta a
  la plataforma, va aquí o en `docs/product/`, no en cuadernos privados.
- Cuando un capítulo quede desactualizado por un cambio estructural, actualícelo en
  el mismo commit del cambio.
- **Nunca escribir secretos aquí** (claves, tokens, llaves maestras). Las credenciales
  viven en `.env` de cada entorno y en `~/.claude/arde-tools/`; los documentos sólo
  nombran la variable, jamás su valor.
