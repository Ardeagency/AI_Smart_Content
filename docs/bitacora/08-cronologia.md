# 08 — Cronología

Línea de tiempo de la construcción. Los conteos de commits son del repo del frontend
(`Ardeagency/AI_Smart_Content`); el `ai-engine` tiene historial propio, mucho más
corto, porque durante meses se desplegó parcheando el servidor sin commitear.

**Total: 4.072 commits** entre el 2025-09-16 y el 2026-07-27.

---

## 2025-09 — El origen (49 commits)

El repo nace como **"UGC STUDIO — plataforma de gestión de UGC"**. Casi todo el trabajo
es el **Studio**: secciones, carga real de datos desde Supabase, autenticación,
unificación visual. Todavía es una app de páginas HTML separadas.

## 2025-10 — Navegación y canvas (132)

Sidebar unificado en todas las páginas, acordeones, layout estilo n8n con el sidebar de
arriba abajo y el header sólo sobre el canvas. Mucha depuración de cards que no
aparecían.

## 2025-11 — Productos e identidad (104)

Gestión de productos, subida y edición de imágenes, rutas de storage por usuario para
que las políticas de RLS funcionen. Rediseño del login. Cambio de flujo de registro con
pantalla de confirmación de correo.

## 2025-12 — Generación de contenido (186)

Aparecen los guiones generados por webhook, sus variantes y sus botones de acción.
Sistema de notificaciones visuales del Studio. Validación obligatoria de producto antes
de generar. Se empiezan a documentar contratos de webhook. Primeras optimizaciones de
rendimiento por crashes del compositor.

## 2026-01 — Limpieza y refactor (305)

Mes de saneamiento: se elimina el sistema de caché fantasma de Productos, se borran
duplicaciones y logs, se reescribe la carga de productos contra el esquema real. Es la
transición de "código que funciona" a "código mantenible".

## 2026-02 — La app toma forma (569)

El mes de mayor volumen hasta entonces. Tareas programadas con tabs y tarjetas de
estado, catálogo de flujos con cards interactivas, el sistema visual **glass-black**
aplicado al header y al dropdown de usuario, y muchas peleas con especificidad CSS y
`z-index`.

## 2026-03 — El giro a inteligencia (471)

El mes bisagra. Tres cosas grandes:

- **Migración a `ai-engine` como backend principal del chat.**
- **Extracción completa de datos de Meta** (8 dimensiones).
- **Dashboard "My Brands"** con métricas y gráficos, con arquitectura **100 %
  event-driven** (se elimina el polling y el cron a favor de Supabase Realtime).

Además: endurecimiento de seguridad (se elimina la exposición del esquema de base y se
restringe el endpoint de configuración) y rediseño de VideoView como consola de
producción.

## 2026-04 — Dashboards y portal de desarrollo (624)

Competencia se organiza en cinco secciones temáticas y se activa con su DataService v2.
**Mi Marca v2** se reconstruye y los otros tabs se marcan "Próximamente". El
dev-dashboard se rehace como centro de mando consciente del rol, con RPCs propias.
Vera gana **adjuntos en el chat** (imagen, PDF, audio, video, Word, Excel, texto).
Se documentan el catálogo de sensores y la clasificación de tareas auto-elegibles.

## 2026-05 — El mes más grande (762)

- **Command Center** reconstruido como canvas de nodos vivo, con Realtime y con la
  matriz de reglas de conexión entre tipos de nodo.
- **Protocolo v3 Vera ↔ ai-engine** cerrado 26/26 tools, con parser nuevo y validación
  sintética.
- **Modelo de créditos rediseñado**: 1 crédito = 1 USD, con reembolso retroactivo del
  sobrecobro de 10×.
- **Billing**: pasarela dual Stripe + Wompi, consola de administración de planes y
  paquetes, rebalanceo de pricing, flujo de cancelación. **MFA TOTP** desplegado.
- **Motor de tendencias** cableado al planificador tras 14 días dormido.
- **Brand scraper** end-to-end: URL → payload de marca.
- **Puente ComfyUI** construido en el servidor `content-flows`, con ciclo automático
  cerrado y validado.
- **Studio**: canvas scopeado por run.

## 2026-06 — Integraciones, aislamiento y métricas (480)

- **Aislamiento multi-organización**: se tapan fugas cross-org en Flows, Canvas,
  Productos, producciones, tareas y galería de videos, con una regla central de marca
  activa. Es una tanda entera de commits `fix(isolation)`.
- **Métricas comparables entre redes**: normalización declarativa + columnas generadas.
- **TikTok** integrado (OAuth + populator). **Shopify** con app pública y app custom.
- **Ingesta de posts propios** arreglada: paginación, ventana por plan, cola reanudable.
- **Vera genera archivos** (informes, decks, infografías, XLSX, Word) con la identidad
  de cada marca, y gana **investigación web real** con Tavily.
- **Auto-reparación** del sintetizador en producción.
- **Loop de outcomes** cerrado.
- **i18n** fase 1 completa y fase 2 avanzada.
- Splash de arranque on-brand, +58 iconos monoline propios, iconos del dropdown.

## 2026-07 — El giro a datos crudos y la Lectura de Vera (390 hasta el día 27)

El mes de las decisiones fuertes.

**Semana 1** — Auditorías cruzadas (frontend, benchmark premium, ai-engine) y su
ejecución: `ErrorHandler` real, build de Netlify con minificación, endurecimiento del
borde HTTP del motor, captura del drift sin commitear. **North Star** definida.
**Loop V1** desplegado: la plataforma cocina sola de aprobar a producir.
Migración de media a **R2**, y limpieza de Supabase con regla de retención a 90 días.

**2026-07-08** — Pivote de Vera a **ejecutar e informar**. Capa CMO en la base
(penetración, horizonte, split marca/activación, leads intelligence).

**2026-07-09** — Se elimina el cron de briefs: **Vera decide cuándo hacer un brief**.

**2026-07-14** — Diagnóstico de Tendencias: los RPCs servían datos congelados de dos
meses. Se reanclan a fuentes vivas y se retiran las secciones sin fuente.

**2026-07-15** — El día más denso del proyecto: se apaga el análisis post-scraping
para experimentar con datos crudos, se construyen los sensores de TikTok, Mercado
Libre, Shopify, Google Ads e Instagram a nivel de cuenta, se crea la capa histórica
`platform_insights_daily` y se construye el generador directo de imagen y video para
el chat de Vera.

**2026-07-16** — Se **eliminan físicamente** los analizadores del ai-engine.

**2026-07-17** — Teardown del clasificador en la base: RPCs reescritas desde datos
crudos, columnas eliminadas. Aseo de RPCs (11 borradas, 5 arregladas). **Se vacían los
cuatro tabs del tablero** para rediseñar la Lectura de Vera.

**2026-07-22** — Rediseño del tab **Competencia** (CompGrid). **Archivado de
miniaturas en R2** con su segunda ventana de rescate. **Cosecha de comentarios bajo
demanda**. Ingesta de imágenes de Instagram arreglada (nunca se pedía la imagen).

**2026-07-23** — El productor dedicado de `cards.v2` para Mi Marca. **Océanos azules**
reemplaza a Perfiles recomendados. Queda escrita la **doctrina raíz de conversión**.

**2026-07-24** — **Rediseño del cerebro de Vera**: doctrina siempre encendida en
SOUL/AGENTS/USER.md y 10 tools de razonamiento escritas como preguntas. **Jerarquía de
los 4 dashboards** aprobada; la Intuición sube a nivel 2.

**2026-07-27** — La Intuición se hace transversal a los cuatro tabs. Observaciones de
Mi Marca adopta la plantilla de Competencia. Se arregla el renderizador que hacía que
una card con tabla o chart perdiera el juicio de Vera.

---

## Lo que la curva cuenta

| Periodo | Foco |
|---|---|
| 2025-09 → 2025-12 | Construir la herramienta de producción (Studio, productos, guiones) |
| 2026-01 → 2026-02 | Hacerla mantenible y darle sistema visual |
| 2026-03 → 2026-04 | Convertirla en plataforma de inteligencia (ai-engine, dashboards, Meta) |
| 2026-05 → 2026-06 | Escalar: protocolo de Vera, integraciones, billing, aislamiento multi-org |
| 2026-07 | Podar: quitar lo que no daba calidad y dejar que Vera piense sobre datos crudos |

Julio es el mes en que la plataforma **borró** más de lo que agregó, y a propósito.
El clasificador basado en reglas se eliminó porque un LLM leyendo datos crudos daba
mejores lecturas. Esa es probablemente la decisión de producto más importante del año.
