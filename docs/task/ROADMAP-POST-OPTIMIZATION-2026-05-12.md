---
id: ROADMAP-POST-OPTIMIZATION
title: Roadmap post-sesión de optimización — 4 items pendientes con ROI evaluado
type: planning
status: open
created: 2026-05-12
related:
  - SESSION-IMPACT-2026-05-12.md
---

# Roadmap post-sesión de optimización (2026-05-12)

> **Status (2026-05-22):** ⚠️ Documento HISTORICO. De los 4 items originales:
>
> | Item | Estado actual |
> |---|---|
> | 1. Web Vitals Dashboard UI | ⚠️ **PENDIENTE — NO en INDEX**. Crear task formal `FEAT-027-web-vitals-dashboard` si se quiere atacar; modulo `js/utils/webvitals.js` ya envia samples a `frontend_errors`. |
> | 2. Migrar modales custom (20 archivos) | ⚠️ **PENDIENTE — NO en INDEX**. Crear task formal `FEAT-028-modal-migration` o decidir si se queda como deuda permanente. |
> | 3. Background sync (offline writes) | ✅ Descartado explicitamente (backlog) — sin caso de uso real |
> | 4. Image srcset Supabase Pro | ✅ Descartado — requiere upgrade $25/mes injustificado hasta ver LCP real |
>
> **Accion**: cuando los items 1-2 se conviertan en tasks formales (o se
> descarten explicitamente), borrar este archivo.

Tras los 32 commits de optimización (perf + a11y + observabilidad + SEO),
quedan 4 items grandes pendientes que se evaluaron y descartaron de la
sesión por scope o complejidad. Este doc detalla cada uno: qué es, qué
problema resuelve, costo, riesgo, y recomendación de cuándo atacarlo.

## TL;DR — Prioridades

| Item | Prioridad | Esfuerzo | Riesgo | ROI |
|---|---|---|---|---|
| **Web Vitals dashboard** | 🟢 **Alta** | ~1-1.5h | Bajo | Valida los 32 commits empíricamente; detecta regresiones futuras |
| **Migrar modales custom** | 🟡 Media | ~2h/sesión × varias | Medio-alto | A11y consistente, mata duplicación, requiere validación por modal |
| **Background sync (offline writes)** | 🔴 Bajo | ~3h+ | Alto | Solo si hay caso de uso real de offline-frecuente |
| **Image srcset Supabase Pro** | 🔴 No (esperar) | ~1h | Bajo | Requiere upgrade Pro ($25/mes); injustificable hasta ver LCP real |

---

## 1. 🟢 Web Vitals Dashboard UI

### Qué es

Una vista interna (`/dev/web-vitals` o similar) que muestra los percentiles
de **LCP, CLS, FCP, INP, TTFB** de los últimos N días, filtrables por
ruta y dispositivo. Lee de la tabla `public.frontend_errors` donde el
módulo `js/utils/webvitals.js` (commit `7883799a`) ya está enviando
samples.

### Problema concreto que resuelve

Tras la sesión de optimización (32 commits con prefetch, critical CSS,
content-visibility, Service Worker, lazy-load, transitions, etc.) NO
tenemos forma fácil de saber si efectivamente mejoraron las métricas.

Hoy, para responder "¿el LCP bajó tras el critical CSS?", hay que entrar
al SQL Editor de Supabase y escribir queries manuales como:

```sql
SELECT
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (s->>'value')::numeric) AS p75,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (s->>'value')::numeric) AS p95,
  COUNT(*) AS samples
FROM frontend_errors,
     LATERAL jsonb_array_elements(ctx->'samples') s
WHERE ctx->>'source' = 'webvital'
  AND s->>'name' = 'LCP'
  AND created_at > now() - interval '7 days';
```

Esto no es accesible a stakeholders no-técnicos y desincentiva el monitoreo.

### Estado actual de la data

Verificado 2026-05-12:
- ✅ RPC `public.log_frontend_error(payloads jsonb)` existe.
- ✅ Tabla `public.frontend_errors` existe (14 filas al momento, recién empezando).
- ✅ `js/utils/webvitals.js` ya flushea samples en `visibilitychange:hidden`
  con `ctx={source:'webvital', samples:[{name:'LCP', value, t}, ...]}`.
- ❌ No hay UI que consulte esos datos.

### Cómo ayuda concretamente

1. **Validación empírica**: una semana post-deploy → "LCP p75 bajó de
   2.1s a 1.4s tras critical CSS + prefetch idle". Convierte la fe en evidencia.
2. **Detección de regresiones**: cuando alguien commitea código que
   rompe LCP/CLS, el dashboard lo muestra en horas, no semanas.
3. **Comparativa por ruta**: identifica qué vistas son más lentas
   (probables candidatas: `/vera` y `/studio` con loads pesados de Chart.js).
4. **Comparativa por dispositivo**: separar móvil vs desktop. Mobile
   típicamente tiene LCP 2-3× peor; identifica si afectamos ahí.

### Diseño técnico propuesto

**Frontend:**
- Nueva vista `js/views/DevWebVitalsView.js` registrada en `/dev/web-vitals`.
- Query a Supabase: `from('frontend_errors').select('ctx, created_at, user_agent').contains('ctx', { source: 'webvital' }).gte('created_at', N days ago)`.
- Agregación en cliente (P50, P75, P95, P99) por métrica.
- Visualización: 5 cards (una por métrica) + gráfico de línea temporal
  (Chart.js ya está disponible vía DashboardView).
- Filtros: ruta (via `ctx->'route'` si lo agregamos al recolector),
  rango de fechas, dispositivo (UA parsing simple).

**Backend (opcional, +30min):**
- Crear RPC `get_webvitals_summary(days int, route text default null)`
  que agrega en Postgres (más rápido que cliente con miles de filas).
- Mantener la query directa como fallback para devs.

**Mejoras opcionales al recolector** (`js/utils/webvitals.js`):
- Agregar `route` al ctx (window.location.pathname al flush).
- Agregar `viewport_width` al ctx para correlar con device.

### Costo y riesgo

| Aspecto | Valor |
|---|---|
| Esfuerzo | ~1-1.5h (vista frontend + queries) |
| Backend extra | +30min si se crea la RPC agregadora |
| Riesgo | Bajo — es vista interna `/dev/*`, no afecta producción |
| Dependencias | Chart.js (ya en bundle), Supabase JS client (ya), frontend_errors table (ya) |

### Recomendación

**SÍ, prioridad alta.** Es el cierre natural de la sesión de optimización.
Sin esto, los 32 commits son inversión sin retorno medible. Con esto,
podemos decir empíricamente qué movió la aguja y qué no.

**Cuándo:** próxima sesión, antes de seguir agregando optimizaciones.
Recolectar al menos 3-7 días de data primero (la tabla recién está
empezando a poblar).

---

## 2. 🟡 Migrar modales custom a `window.Modal.show`

### Qué es

Consolidar los 20 archivos que crean modales custom (cada uno con su
`<div class="modal">`, su Esc handler, su click-outside, su focus
handling) para que todos consuman la primitiva `window.Modal.show()` que
ya tiene focus trap + return focus + initial focus (commit `34bbe3a`).

### Problema concreto

**Inventario 2026-05-12** — archivos con modales custom:

```
js/components/Navigation.js              (modales del sidebar)
js/components/navigation/Settings.mixin  (config user)
js/products.js                           (edit producto)
js/ui/primitives.js                      (dialog primitivo legacy)
js/views/BrandOrganizationView.js        (editar marca)
js/views/BrandstorageView.js             (gestión brand_containers)
js/views/DevBuilderView.js               (interno)
js/views/DevFlowsView.js                 (interno)
js/views/DevLeadAllFlowsView.js          (interno)
js/views/DevLeadCategoriesView.js        (interno)
js/views/DevLeadInputSchemasView.js      (interno)
js/views/DevLeadVectorsView.js           (interno)
js/views/DevLogsView.js                  (interno)
js/views/DevTestView.js                  (interno)
js/views/DevWebhooksView.js              (interno)
js/views/MonitoringView.js               (edit entity)
js/views/OrganizationView.js             (edit miembros, BU)
js/views/TasksView.js                    (edit task detail — ya semi-modal)
js/views/builder/BuilderModules.js       (interno)
```

= **9 user-facing + 9 internos (dev) + 2 utilities**.

### Por qué importa

- Cada modal tiene comportamiento de teclado **distinto**. Esc funciona
  en algunos; focus trap solo en los que ya usan `window.Modal.show` (3
  sitios) y en el ColorPickerModal.
- Cualquier fix de a11y al primitivo (ej. arreglar bug del focus trap,
  agregar `aria-describedby`) **no se propaga** a los 20 modales custom
  — siguen rotos. Es la misma trampa del color picker duplicado que
  cerramos en `7749c9c`.
- Cada modal duplica ~30-40 líneas de boilerplate. Total estimado:
  **600-800 líneas duplicadas** distribuidas.

### Cómo ayuda concretamente

- **A11y user-facing**: en `/organization` modal "Editar miembro",
  Tab hoy escapa al sidebar; tras migración queda dentro del modal.
- **A11y dev**: los modales de DevTestView (testear flows) son
  inaccesibles con teclado hoy — la migración los hace usables sin
  mouse.
- **Mantenibilidad**: un fix futuro toca 1 archivo (`js/utils/modal.js`)
  en lugar de 20.
- **UX consistente**: misma animación de entrada, misma posición,
  mismo blur de backdrop en TODOS los modales.

### Costo y riesgo

| Aspecto | Valor |
|---|---|
| Esfuerzo total | ~2h por sesión × 3-5 sesiones (20 archivos) |
| Esfuerzo por archivo | 15-30min (depende de complejidad del modal) |
| Riesgo user-facing | **Medio-alto** — los modales tienen flows críticos (save brand, schedule task) |
| Riesgo dev-facing | Bajo — uso interno, menos usuarios afectados |

### Edge cases que pueden romper

- **Modales anidados** (modal A abre modal B): la primitiva actual no
  los soporta — focus trap del modal externo confundiría el del interno.
- **Modal que persiste a navegación** (raro pero podría existir en
  Settings): la primitiva limpia el modal en close + Esc, no en route change.
- **Modal con formulario complejo** (Tasks task-detail): el "modal" en
  TasksView es realmente un view secundario, no un modal real. Decidir
  si migrar o dejar custom.

### Recomendación

**Sí, vale la pena pero gradual.** NO migrar todo en una sesión.

**Estrategia sugerida:**
1. **Sprint 1** — 5-6 modales Dev (`DevLogsView, DevWebhooksView,
   DevTestView, DevLeadVectorsView, DevLeadCategoriesView, DevBuilderView`).
   Bajo riesgo. Shake-down de la API. ~2h.
2. **Sprint 2** — 4-5 modales de Organization/Monitoring/Products.
   Mid-low usage. ~2h.
3. **Sprint 3** — Brand y Tasks (alto uso). Cuidadosamente con
   smoke test manual. ~2h.

**Antes de empezar**, considerar si extender el primitivo para soportar:
- `headerless: true` para modales sin título.
- `width: 'lg'|'md'|'sm'` para tamaños predefinidos.
- `disableEscape: true` (algunos modales requieren confirmación explícita).

Eso reduce fricción al migrar (no hay que pelearse con el primitivo).

---

## 3. 🔴 Background sync para writes offline

### Qué es

Cuando el user hace un cambio sin conexión (guarda color, programa
tarea, edita producto), la escritura queda en cola local y se reintenta
automáticamente al recuperar la red. PWA-grade UX (lo que Notion/Linear
hacen).

### Por qué NO ahora

**Complejidad alta vs caso de uso difuso.**

#### Lo que tenemos hoy
- Service Worker (commit `04fe0be7`).
- offline.html (commit `a7e286e7`).
- Banner online/offline global (commit `68636d7c`).
- Por lo tanto: el user **SABE** que está offline y la app **avisa**.

#### Lo que falta y por qué cuesta
Cuando el user intenta guardar offline:
- El flow falla → toast error.
- El user reintenta varias veces hasta darse cuenta.
- O cierra la pestaña → pierde el cambio.

Solución correcta = **encolar el write localmente y replay al volver red**.
Pero las escrituras pasan por el cliente Supabase JS, NO por `fetch()`
directo. Opciones:

**a) Wrapper del cliente Supabase**
- Cada `.from('x').insert/update/delete()` pasa por un wrapper que, si
  offline, encola en IndexedDB.
- Requiere envolver TODAS las views que escriben (~15+ archivos).
- Riesgo: si una view bypassa el wrapper, el sync no aplica → bug
  silencioso.

**b) BackgroundSync API del SW (estándar)**
- Reformular cada write como `fetch()` y registrar sync events.
- Significa **reescribir cómo se hacen los writes** en toda la app.
- Cambio masivo, ~2-3 sprints.

### Edge cases nasty

1. **Conflict resolution**: otro user editó la misma fila mientras
   estabas offline → ¿quién gana? Hay que implementar versioning o
   last-write-wins explícito.
2. **Reintento de no-idempotentes**: crear un schedule duplicado si
   ambos creates se ejecutan (uno offline encolado + uno online
   manual).
3. **JWT expiration**: el token puede expirar entre el offline write
   y el reintento → refrescar token primero.
4. **RLS de Supabase**: el contexto de auth puede haber cambiado entre
   write offline y replay → fila escrita con permisos diferentes.
5. **Triggers/cached views**: el write offline puede disparar triggers
   que dependen de timing → resultado inconsistente al replay.
6. **Order matters**: si encolaste 5 writes (A, B, C, D, E) y el replay
   los procesa desordenadamente, queda BD inconsistente.

### Cuándo SÍ vale la pena

Solo si:
- (a) Hay caso de uso real de offline-frecuente (ej. equipos de campo,
  viajes regulares, ubicaciones con red intermitente).
- (b) Hay capacidad de hacer arquitectura de outbox / event-sourcing
  en el cliente.

Si solo es para "feature checkbox PWA", el ROI es bajo. La mayoría
de offline events son <2 min de duración y los users naturalmente
reintentan al volver.

### Recomendación

**NO ahora.** Esperar a tener:
- Demanda real de clientes/agencias usando la app offline.
- Decisión de producto sobre conflict resolution.
- Sprint dedicado (no se hace en cadena con otras optimizaciones).

---

## 4. 🔴 Image responsive `srcset` Supabase Storage — descartado

### Qué iba a hacer

Generar `srcset` HTML para que el browser elija el tamaño óptimo de
imagen según el viewport:

```html
<img src="...?width=400"
     srcset="...?width=400 400w,
             ...?width=800 800w,
             ...?width=1200 1200w"
     sizes="(max-width: 600px) 100vw, 50vw">
```

Mobile descarga 400px (rápido), desktop descarga 1200px (calidad).

### Por qué descartado

**Verificado 2026-05-12:**
```bash
curl https://tsdpbqcwjckbfsdqacam.supabase.co/storage/v1/render/image/public/test/test.jpg?width=1
# → HTTP 400
```

Supabase Image Transformations es feature de **plan Pro o superior**
($25 USD/mes) y la org actual está en plan que no lo incluye.

### Cuándo SÍ vale la pena

Solo si **se cumplen ambos:**

1. **Verificación empírica de problema** — Web Vitals (item #1) reporta
   LCP >2.5s en `/production` o `/brands` por culpa de imágenes
   (verificable en DevTools → Lighthouse → "Largest Contentful Paint
   element").
2. **Justificación económica** — un par de Mb ahorrados × N users >
   $25/mes. Estimación: con 100 users activos haciendo 50 page loads/mes
   con 2Mb de imágenes → 10GB de tráfico. Cloudinary cobra ~$0.10/GB →
   $1/mes de ahorro. **No se paga solo a corto plazo.**

### Recomendación

**NO hasta que Web Vitals (item #1) reporte LCP problemático por imágenes.**
Es prematuro. Si en el futuro se justifica, el cambio es:
1. Upgrade Supabase a Pro.
2. Helper `imageSrcset(url, [400, 800, 1200])` en `js/utils/`.
3. Actualizar los `<img>` que renderean assets de Supabase Storage para
   usar el helper.

---

## Apéndice: Estado del Service Worker tras la sesión

Para contexto: el SW que se instaló en commit `04fe0be7` ya hace
cache-first de assets versionados (JS/CSS con `?v=BUILD_ID`). Esto
significa que **navegaciones repetidas a vistas ya visitadas** son
casi-instantáneas — no requieren background sync para ese caso.

Lo que el SW NO cubre:
- Writes (POST/PUT/DELETE) offline → eso es lo que background sync
  resolvería (item #3).
- Imágenes muy grandes que no caben en cache → eso es lo que srcset
  resolvería (item #4).
- Validar performance real → eso es lo que el dashboard resolvería
  (item #1).

## Próximos pasos sugeridos

1. **Esta semana**: Deploy y validación manual del smoke test en
   `SESSION-IMPACT-2026-05-12.md`.
2. **+1 semana**: revisar samples de Web Vitals en BD (suficiente data
   para baseline).
3. **+1 semana**: implementar **Web Vitals dashboard** (item #1). Lock
   in los gains.
4. **+1 sprint**: iniciar migración de modales (item #2), comenzando
   por Dev views.
5. **Indefinido**: items #3 y #4 quedan en backlog hasta que se justifiquen.
