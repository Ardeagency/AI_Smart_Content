# Auditoría de los 4 dashboards vs la visión — 2026-07-02

> Vara: `docs/DASHBOARDS-V2-VISION.md` ("3 recolectan, 1 cocina") + test por card:
> *"¿esto lo diría un equipo de marketing profesional en la reunión mensual?"*
> Método: inventario real del código (file:line) → veredicto → plan.
> Mi Marca tiene doc propio (`DASHBOARDS-V2-MIMARCA-REBUILD.md`); aquí el scorecard
> global y el detalle de los otros 3.

## Scorecard global

| Tab | Misión (visión) | Cobertura hoy | Estado |
|---|---|---|---|
| Mi Marca | Autodiagnóstico total (social + comercial) | ~1.5/5 preguntas | 🔨 Sprint 1 desplegado (chatarra fuera); Salud V2 next |
| Competencia → **Monitoreos** | Supervisar competidores / aprender de referencias | **La base más sólida de los 4** | 🟡 2 gaps estructurales |
| Tendencias | Escuchar el mercado (SEO/GEO, demanda real) | Estructura buena, **sin combustible** | 🟡 el dato clave está en 0 |
| Estrategia | LA COCINA: síntesis 1+2+3, propone/produce/rinde cuentas | Embrión correcto, **el más flaco vs su misión** | 🔴 le falta lo que lo hace producto |

## Los 3 hallazgos transversales

1. **NADA conecta insight → acción.** En los 4 tabs la "acción" es retórica de labels
   ("Ocúpalos antes de que lo hagan ellos", "tu munición de contenido") — **cero
   botones que disparen algo**. El puente producción ya existe (Loop V1); falta
   exponerlo: cada insight accionable debería poder convertirse en
   strategic_recommendation / producción con un click.
2. **La síntesis es la más débil.** Los 3 recolectores están mejor construidos de lo
   esperado; Estrategia (la razón de ser del producto) es el tab con menos desarrollo
   frente a su misión.
3. **Datos sin combustible.** Tendencias renderiza bien pero `audience_demand_signals`
   = 0 filas (la promesa SEO/GEO sin populador activo) y los scrapers de tendencias
   están pausados (cuota Apify). El tab más dependiente de dato externo es el que
   menos dato recibe.

---

## MONITOREOS (hoy "Competencia") — inventario y veredicto

**Lo que tiene (sorprendentemente bueno):** El campo de batalla (KPIs + ranking con
deltas vs periodo previo) · Mi Marca vs Competencia (head-to-head con veredicto
gana/pierde + **share of voice** por rival) · Qué les funciona (combos ganadores
tone·topic·format del nicho) · La voz de su audiencia (quotes reales "se quejan
de"/"aman" + ratios) · Vulnerabilidades del rival · hero cards causales
(reglas+math, sin LLM).

### Veredictos
- 🟢 **MANTENER/ELEVAR**: benchmark head-to-head + SOV (germen del ESOV), voz de la
  audiencia del rival (el oro), vulnerabilidades, combos ganadores, hero cards.
- 🟠 **TRANSFORMAR (los 2 gaps estructurales):**
  1. **El ROL es solo un badge cosmético** (`_compTipoMeta` pinta color; nada más
     usa `tipo`, y `relevance` no se usa en absoluto). La visión exige DOS lentes:
     *competidor → supervisar/opacar* (vulnerabilidades, quejas, amenaza) vs
     *referencia → aprender/potenciar* (sus combos ganadores como inspiración, sin
     framing de "rival"). Rediseño: secciones separadas por rol, o framing dinámico
     por perfil; las referencias NO deben sumar al "benchmark vs competencia" (hoy
     todo se agrega como rivales → contamina el head-to-head).
  2. **Renombrar el tab a "Monitoreos"** (decisión de producto ya tomada).
- 🔴 **MATAR**: poco — los 4 KPIs del campo de batalla son numéricos pero con delta
  vs periodo previo y contexto de nicho; se salvan si se les añade veredicto.
- 🔵 **CONSTRUIR**: (1) botón acción en cada insight (queja del rival → proponer
  jugada; combo de referencia → proponer contenido) vía strategic_recommendations;
  (2) usar `relevance` para ordenar/priorizar; (3) ads del rival (competitor_ads +
  meta_ad_library_sync ya ingestan — no se pinta nada de pauta rival).

---

## TENDENCIAS — inventario y veredicto

**Lo que tiene:** Pulso del nicho (KPIs + clima de sentimiento) · Señales emergentes
(chips con velocity+relevance≥0.45) · **Océanos azules** (content_gaps con badge
blue-ocean, breakdown redes/búsquedas/noticias, muestras textuales de búsquedas
reales, y la nota "N de M temas con demanda no tienen NINGÚN rival cubriéndolos") ·
Léxico emergente · Marcas emergentes · Sincronización con el mundo (festivos).

### Veredictos
- 🟢 **MANTENER/ELEVAR**: Océanos azules (la joya — es exactamente "escuchar el
  mercado"), señales emergentes, marcas emergentes, real-world sync.
- 🟠 **TRANSFORMAR**: los 4 KPIs del pulso miden actividad de la herramienta
  ("señales rastreadas", "palabras aprendidas") no el mercado → convertir a
  métricas de mercado (demanda creciendo, categoría acelerando) o degradar a pie
  de página. Léxico: valioso para Vera, dudoso como card de cliente → candidato a
  moverse a configuración/identidad.
- 🔴 **MATAR**: nada estructural.
- 🔵 **CONSTRUIR (lo que le falta para ser el SEO/GEO prometido):**
  1. **El combustible**: populador de `audience_demand_signals` (hoy 0 filas — el
     breakdown "N búsquedas" de los gaps rinde vacío). Sin esto el tab es un radar
     sin señal. PRIORIDAD #1 de este tab.
  2. **Sección dedicada de términos de búsqueda/keywords** (la visión la pide como
     entregable central: "palabras clave desde los términos más buscados").
  3. **Botón acción en cada gap/señal** → proponer jugada (strategic_recommendation)
     con la keyword como ancla.
  4. (2º horizonte) AI Share of Voice / visibilidad generativa.

---

## ESTRATEGIA — inventario y veredicto (auditado de lectura completa previa)

**Lo que tiene:** hero cards (mejor jugada / por decidir / baja prioridad / en
producción) · header con stats (pendientes, en producción, tasa de aprobación,
propuestas totales) · cards de recomendación (título, confianza, descripción,
chips tone/topic/format, copy_seed, botones Aprobar/Ajustar/Descartar) · lista "En
producción" (solo títulos) · filtro por status. Datos: dashboard_strategy_master +
dashboard_strategic_recommendations.

### Veredictos
- 🟢 **MANTENER/ELEVAR**: Action Cards con gate (el corazón del loop — ya conectadas
  al puente de producción), tasa de aprobación (germen del bateo).
- 🟠 **TRANSFORMAR**:
  1. Card de recomendación → mostrar **predicción por escrito** (predicted_engagement
     existe y no se pinta) + **evidencia por lente** (mi marca / monitoreos /
     tendencias — poblar y pintar evidence_chain).
  2. "En producción" → conectar al output real: preview del arte (runs_outputs vía
     metadata.run_id que el puente ya deja) + **botón Publicar ahí mismo** (gate).
  3. "Ajustar" → reemplazar window.prompt() por modal con razones estructuradas
     (alimenta la memoria de paladar).
  4. Presentación por TIPO de jugada: las de distribución/precio/ecosistema
     comercial no llevan formato/copy — hoy la card asume contenido.
- 🔵 **CONSTRUIR (lo que lo convierte en el producto):**
  1. **LA CUENTA RENDIDA** (la pieza #1 de toda la visión): sección superior con el
     resultado de las jugadas anteriores — predicho vs real, error, corrección,
     promedio de bateo. Las columnas existen (predicted/actual_engagement,
     prediction_error_pct, learning_signal) y la medición corre; nadie lo pinta.
  2. **Plan semanal/mensual**: vista calendario/plan de las jugadas aprobadas y
     programadas.
  3. **Directivas comerciales** como tipo de card propio.

---

## Orden de construcción global (los 4 tabs)

1. **Mi Marca**: Salud V2 (spec lista) → voz +/− → GA4 → atribución. *(en curso)*
2. **Estrategia**: la CUENTA RENDIDA + predicción visible + "En producción" con
   output y botón publicar. *(convierte el loop vivo en experiencia visible)*
3. **Monitoreos**: split por rol (competidor/referencia) + rename + botones acción.
4. **Tendencias**: populador de demanda (combustible) + sección keywords + botones
   acción.
5. Transversal: **insight→acción** en los 4 (cada insight puede volverse
   strategic_recommendation con un click → entra al loop existente).
