# 09 — Deuda abierta

Estado al **2026-07-27**. Ordenado por severidad. El detalle operativo de cada tarea
vive en `docs/task/`; aquí está el mapa y el porqué.

> **Regla:** cuando una deuda se cierra, se borra su archivo en `docs/task/`, su línea
> en `docs/task/INDEX.md` y su mención aquí.

---

## 🔴 Bloqueadores

### 1. Ningún agente OpenClaw sano → los tableros no se llenan

**Este es el hueco real entre "código listo" y "producto visible".** El productor de
`cards.v2` está desplegado y es correcto, pero al momento de desplegarlo ninguna
organización tenía un agente sano (todos detenidos). El guard corta antes de gastar,
así que **ninguna sesión agéntica —Mi Marca, diagnóstico ni Competencia— produce
lecturas en vivo.**

Sumado: las sesiones automáticas sólo corren para WAKEUP; el planificador nunca
dispara IGNIS, que sí tiene org-server sano.

→ Ver [04-vera](./04-vera.md) §8.

### 2. El ai-engine tiene 65 archivos sin commitear

Verificado en el servidor. El último commit es del 2026-07-24. **Git no es hoy la
fuente de verdad del motor.** Esto ya causó una pérdida real de trabajo: dos sesiones
concurrentes se pisaron y una borró el registro de una herramienta ajena.

Riesgo agravado: el auto-reparador hace rollback restaurando archivos; si el estado en
git no coincide con producción, un rollback puede borrar código vivo. La auditoría de
julio ya encontró tres servicios *sin trackear* que el código vivo importaba.

### 3. La clave de servicio de Supabase viaja en cada VM de organización

La clave que **bypassa la RLS de todos los tenants** se escribe en el `.env` de cada
VM aprovisionada. Comprometer una sola VM sería comprometer a todas las organizaciones.
Es el hallazgo de seguridad de mayor severidad que sigue abierto.

---

## 🟠 Alto

### 4. Sin tests ni linter en el ai-engine

33.000 líneas que ejecutan acciones autónomas contra datos de producción, sin tests,
sin eslint y sin verificación de tipos. El `package.json` apunta a un directorio de
tests que no existe. Tampoco hay configuración central: 98 variables de entorno, y el
cliente de base se construye con `undefined` si faltan.

### 5. Los cuatro tabs siguen vacíos

Sólo Mi Marca y Competencia tienen rejilla; **Tendencias está casi vacío y Estrategia
en blanco**. Para Estrategia hay que decidir primero qué cards viven ahí — no es un
problema de implementación sino de producto. La jerarquía aprobada sólo tiene piloto en
Mi Marca; falta replicarla a los otros tres.

### 6. Teardown del clasificador a medias

Quedan **15 funciones** usando `post_patterns`, cuatro vistas materializadas con cron
que romperían al dropear la tabla, y una docena de tablas del subsistema pendientes de
DROP. La migración está a mitad de camino: funciona, pero el código muerto sigue ahí y
bloquea la limpieza final.

→ Ver [05-datos-supabase](./05-datos-supabase.md) §4.

### 7. La card de audiencia está ciega por la plataforma, no por Vera

Los datos demográficos existen y están frescos, pero la tool que lee audiencias los
deja fuera del `select`, y la tool que sí los trae **no está registrada** en el
dispatcher. Es un arreglo pequeño con impacto visible directo.

### 8. Retailers sin populator

Vigilar precios de retailers propios y de competencia es un **requerimiento explícito
de cliente**. La tabla existe y está vacía.

---

## 🟡 Medio

### 9. Robustez de las lecturas de Vera

- Falta un **normalizador antes del validador zod** (coerción de tipos, truncado a los
  límites, mapeo de formatos desconocidos). Tres sesiones murieron por esto, una por un
  solo carácter de más.
- El timeout de sesión es corto para investigaciones profundas, y al abortar reporta
  "sin agente disponible" aunque el servidor esté vivo: hay que separar el error de
  timeout del de agente caído.
- Los sobres rechazados quedan en el log crudo del servidor: **se pueden recuperar,
  normalizar y publicar sin volver a pagar**.
- La columna de tool-calls de la auditoría de sesión nunca se llena.

### 10. Sin retención de media en R2

El archivado de miniaturas suma ~225 MB al mes y **no tiene política de borrado**. El
plan gratuito son 10 GB, y superarlo sin facturación activa provoca **fallos de
subida**. Conviene alinear un borrado con la retención de 90 días de la base y activar
facturación al acercarse a 8 GB.

### 11. Frontend: la deuda de sistema

Del benchmark premium (nota 4,8/10), lo que sigue pendiente:

- Reglas de lint anti-deuda (hex fuera de tokens, `catch` mudo, `font-size` crudo,
  variantes de card y botón).
- Goteo por vista: cada vista que se toca debe salir 100 % al sistema (botones a la
  clase única, escala tipográfica, iconos a un solo set, consultas a `ApiClient`).
- Adopción minoritaria de las primitivas buenas: estado vacío en 14 de 50 vistas,
  datos en vivo en 8, `ApiClient` en 16 frente a cientos de consultas directas.
- 208 `catch` mudos por migrar al `ErrorHandler` real (que ya existe).
- Tres familias de iconos conviviendo; `developer.css` con más de 16.000 líneas.

### 12. i18n incompleto

Faltan las tres vistas gigantes (Studio, Video, VeraView), los compartidos
(`living.js`, `products.js`, `input-registry.js`) y la fase de billing. El
`documentTitle` estático de las vistas aún no es getter, así que el título de pestaña
sigue fijo.

### 13. Integraciones bloqueadas por permisos o credenciales

| Qué | Qué falta | Quién |
|---|---|---|
| Meta leads | `leads_retrieval` en el `config_id`, revisión de Meta, re-auth de clientes | Acción externa |
| Mercado Libre órdenes y preguntas | Ampliar permisos de la app + re-autorizar al vendedor | Acción externa |
| Shopify | Reconectar con tienda real y scope de órdenes (el token de prueba está muerto) | Acción externa |
| TikTok publicación | Auditoría de Content Posting API | Acción externa |
| TikTok métricas ricas | Business API = otra app, otra aprobación | Proyecto aparte |
| Radiografía de Visibilidad | Desplegar + clave de Perplexity | Interno |

### 14. Generación directa: el sondeo vive en memoria

Si el ai-engine reinicia a mitad de una generación, esa entrega se pierde. El upgrade
es una tabla durable con un poller.

### 15. Postura de seguridad de nivel empresarial

SAML SSO, MFA exigible por el admin de la organización, RBAC granular (hoy sólo existe
`admin`), DPA publicable y Trust Center, bug bounty y pentest anual. A 6-18 meses:
SOC 2 Type II, ISO 27001, residencia de datos en la UE.

→ [`docs/task/reference/AUDIT-003-enterprise-readiness-2026-05-12.md`](../task/reference/AUDIT-003-enterprise-readiness-2026-05-12.md),
[`docs/task/FEAT-022-rbac-granular.md`](../task/FEAT-022-rbac-granular.md).

---

## 🟢 Bajo / higiene

- **Higiene de base**: 56 funciones `SECURITY DEFINER` sin `search_path` fijo, 15 pares
  de índices duplicados, ~98 foráneas sin índice de cobertura, ~43 tablas vacías.
  Documentado en la auditoría de mayo; **re-auditar antes de corregir**.
- **Archivos `.bak-*`** acumulados en el servidor: son la red de seguridad del
  protocolo de despliegue, pero conviene barrerlos periódicamente.
- **El scraper sigue guardando `velocity_score` como densidad por post** y mete
  stopwords en los temas de tendencias. Mitigado a nivel de RPC, no en la fuente.
- **Rename de tablas para claridad** (`brand_containers` → mercados, `brand_entities` →
  catálogo de la organización). No urgente, pero la confusión es un costo recurrente.
- **Deuda de `system_ai_outputs`**: no tiene `run_id`, así que las ediciones sueltas de
  la barra de herramientas no aparecen en el canvas scopeado por run.
- **Alerta de Apify sin canal central**: avisa a la organización del primer lote que
  falla, aunque la cuenta es compartida.
- **Endpoints huérfanos** candidatos a borrar (blindados, pero sin llamadores).

---

## Documentos de referencia

| Documento | Qué contiene |
|---|---|
| `docs/task/INDEX.md` | Índice vivo de tareas activas, por severidad |
| `docs/task/PENDING-HUMAN-VERIFICATION.md` | Código hecho que sólo espera una acción humana |
| `docs/task/INTEGRACIONES-PENDIENTES.md` | Detalle por integración |
| `docs/product/AUDITORIA-CMO-2026-07.md` | Estado vivo del producto con lente de CMO |
| `docs/product/NORTH-STAR-PLATILLO.md` | La North Star completa |
| `docs/product/DASHBOARDS-V2-VISION.md` | La visión "3 recolectan, 1 cocina" |
| `docs/product/LOOP-V1-PUENTE-PRODUCCION.md` | El puente aprobar → producir |
| `docs/playbook/` | El libro de 8 partes: cómo construir esto como SaaS premium vendible a marcas Tier-1 |
