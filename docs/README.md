# Documentación de AI Smart Content — índice maestro

> Punto de entrada único a los ~85 documentos de `docs/`. Reorganizado 2026-07-03.
> Si eres un agente/LLM nuevo: **lee la sección "Ruta de lectura" y respeta el mapa
> de vigencia** — hay docs congelados que NO reflejan el estado de hoy.

---

## Ruta de lectura (para entender la plataforma en orden)

1. **`platform/01-overview.md`** → qué es y qué problema resuelve (modelo mental en 10 min).
2. **`platform/02-architecture.md`** → las 5 capas y los 5 principios non-negotiable.
3. **`product/AUDITORIA-CMO-2026-07.md`** → **el estado VIVO** (qué funciona hoy, qué se reparó, qué falta). *Este reemplaza a `platform/09-current-state.md`, que quedó congelado en mayo.*
4. **`product/DASHBOARDS-V2-VISION.md`** → hacia dónde va el producto (los 4 dashboards).
5. **`task/INDEX.md`** → qué falta construir, por severidad.

---

## Estructura de carpetas

| Carpeta | Qué contiene | Vigencia |
|---|---|---|
| **`platform/`** | Doc canónica de la plataforma (01→10 + catálogo de sensores). Arquitectura, DB, motor, frontend, Vera, deploy. | ✅ Vigente (excepto `09`, ver abajo) |
| **`product/`** | Visión de producto viva: dashboards V2, North Star, Salud de Marca, Loop V1, Command Center, modelo de cards, auditoría CMO. | ✅ Vigente (lo más nuevo) |
| **`playbook/`** | Playbook SaaS enterprise (negocio, seguridad, compliance, GTM, roadmap). Referencia estratégica. | ✅ Vigente |
| **`reference/`** | Referencias técnicas de integración (KIE Video API, webhooks Meta, inputs de flow schedules). | ✅ Vigente |
| **`brand-dna/`** | ADN de marca de AI Smart Content (identidad, color, tono). | ✅ Vigente |
| **`task/`** | Tracker vivo de tareas y deuda. Convención: al cerrar una tarea se **borra** el archivo y su línea del `INDEX`. | ✅ Vigente |
| **`task/reference/`** | Auditorías/discovery que informan tareas pero no se ejecutan directamente. | ✅ Referencia |
| **`inputs-identificados/`** | Log de inputs de `flow_modules` (FEAT-033). | ✅ Log |
| **`notes/`** | Bitácoras de sesión históricas (por diseño se conservan). | 🗄️ Histórico |
| **`archive/`** | Docs superados/cerrados. Se conservan por trazabilidad; NO son verdad operativa. | 🗄️ Archivo |

---

## Mapa de vigencia — qué es verdad y qué no

### ✅ Fuente de verdad viva (leer primero)
- `product/AUDITORIA-CMO-2026-07.md` — estado real de la plataforma (jul-02).
- `product/DASHBOARDS-V2-VISION.md` — visión de producto; **supersede** las specs `.txt` viejas.
- `product/NORTH-STAR-PLATILLO.md` — norte: "La Apuesta que Rinde Cuentas".
- `task/INDEX.md` + `task/INTEGRACIONES-PENDIENTES.md` — deuda accionable.
- `platform/01`–`08`, `10` + `sensor-types-catalog.md` — arquitectura canónica (estable).

### ⚠️ Congelado / histórico (NO usar como estado de hoy)
- `platform/09-current-state.md` — **snapshot 2026-05-05.** Reemplazado por `product/AUDITORIA-CMO-2026-07.md`. Tiene un banner que redirige. Los conteos de tablas y la lista de "roto/vacío" ya no aplican.
- `notes/*` — logs de sesión; contexto histórico, no deuda.

### 🗄️ Archivado (superado, en `archive/`)
- `DASHBOARD-MI-MARCA.txt`, `DASHBOARD-MI-COMPETENCIA.txt`, `DASHBOARD-TENDENCIAS.txt` — specs de dashboard originales; reemplazadas por la familia `product/DASHBOARDS-V2-*`.
- `ESTADO_EXPANDIDO_2026-05-05.md` — snapshot narrativo redundante con `platform/01`–`10`; superado por la auditoría CMO.
- `shopify-bootstrap-plan.md` — DRAFT de mayo; Shopify OAuth+populator ya opera (ver `task/INTEGRACIONES-PENDIENTES.md`).
- `FEAT-041-cards-sintesis-estrategica.md` — tarea **cerrada** (motor 4/4 desplegado 2026-06-11).

---

## Colisiones de número de tarea conocidas (no renumeradas — historial)

- **FEAT-037 (×3):** `centro-de-mando-dev-deploy` (probable cerrada) · `dashboard-tier1-gap-closure` (en curso) · `tag-productions-to-strategy` (Fase 2 pendiente).
- **FEAT-036 (×2):** `kie-rate-governor-and-queue` · `billing-console` (ambas activas).

Renumerar cambiaría la identidad/historial de la tarea, por eso se documentan aquí en vez de reasignar.

---

## Reglas de mantenimiento de esta doc

1. **Un cambio de arquitectura → actualiza el doc de `platform/` relevante** y bumpea su `last_review`.
2. **El estado de hoy vive en `product/`**, no en `platform/09`. Cuando `09` quede muy atrás, se refresca su banner o se genera una nueva auditoría fechada en `product/`.
3. **Tarea cerrada → borrar** su archivo en `task/` y su línea en `INDEX.md` (o mover a `archive/` si tiene valor de referencia).
4. **Doc superado → `archive/`** (mover, no borrar: git conserva el historial igual, pero el archivo físico ayuda a la trazabilidad).
5. Si detectas drift entre un doc y la realidad, arréglalo o anótalo en el banner del doc afectado.
