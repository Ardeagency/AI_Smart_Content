# Doctrina de renderizado de dashboards — ni vacíos, ni saturados, ni mentirosos

> Investigación 2026-07-02 (NN/g, Carbon, PatternFly, Stephen Few, Shneiderman,
> Bach et al., PostHog/Similarweb/Stripe/Linear/Mixpanel + doctrina dataviz).
> Gobierna CÓMO cada card decide qué mostrar. Complementa la auditoría
> (`DASHBOARDS-V2-AUDITORIA-4TABS.md`) que dice QUÉ mostrar.

## Los dos pecados diagnosticados (capturas reales 2026-07-02)

**Pecado A — el dashboard muerto que miente (tab Competencia, WAKEUP):**
- KPIs renderizando `0` y `—` como si fueran mediciones ("0 rivales activos").
- Ranking con 7 filas de ceros (0 posts · 0 eng · 0/post).
- **Hero cards fabricando narrativa desde el vacío**: "Cacahuates domina tu
  nicho — 0 engagement", "Cacahuates es tu mayor amenaza — 0 engagement",
  "La competencia te supera (101 vs 0)" cuando el 101 es la PROPIA marca.
  → Asesino de credibilidad: un CMO que lee UNA conclusión fabricada de ceros
  no vuelve a creer ninguna.
- Causa raíz de dato: los monitoreados de WAKEUP aún no tienen ingesta
  (scrapers de competidores recién configurados / cuota Apify). Causa raíz de
  código: **ningún generador de narrativa tiene guard de datos mínimos**.

**Pecado B — el dashboard saturado (tab Mi Marca):**
- ~14 bloques con el mismo peso visual; donuts para valores cercanos (anti-patrón
  textual del catálogo dataviz); 9 pilares en sidebar (> techo de ~7 clases);
  listas largas de comentarios/recepción a pantalla completa; ninguna conclusión
  arriba. El nivel-3 (detalle) volcado en el nivel-1 (overview).

---

## LA MÁQUINA DE ESTADOS POR CARD (regla central)

Toda card/sección pasa por este árbol ANTES de renderizar:

```
¿Aplica a este usuario/marca/plan?
 ├─ NO → OCULTAR (no existe en el árbol de render; nada de cementerios disabled)
 └─ SÍ → ¿La fuente que la alimenta está conectada/activa?
     ├─ NO → TEASER compacto: micro-preview + beneficio en 1 frase + botón Conectar
     │        ("Conecta Google Analytics y aquí verás tus conversiones reales")
     │        — el teaser NO ocupa el espacio del módulo lleno
     └─ SÍ → ¿Cargando?
         ├─ SÍ → SKELETON (nunca spinner >500ms; nunca "vacío" que luego se llena)
         └─ NO → ¿Hay datos?
             ├─ CERO datos → EMPTY STATE con propósito (3 preguntas):
             │    qué veré aquí + POR QUÉ no hay aún (la causa real: "tus
             │    sensores corren desde ayer; primeros datos en ~24h") + UN CTA
             ├─ POCOS datos (< min_n del insight) → DEGRADADO HONESTO:
             │    se muestra con píldora "Señal temprana · n=3" — nunca con la
             │    autoridad visual de un insight maduro. Narrativas/veredictos
             │    NO se generan bajo el umbral (mejor progreso: "faltan ~2
             │    semanas de datos para comparar")
             └─ Datos suficientes → RENDER PLENO
```

### Reglas duras que la máquina implica

1. **`null` ≠ `0`, SIEMPRE.** `0` solo se pinta cuando se MIDIÓ y fue cero.
   Ausencia de ingesta/fuente → estado, no número. Los RPCs deben distinguirlo
   (retornar null/flags de cobertura, no COALESCE a 0) y el frontend respetarlo.
2. **Toda narrativa generada lleva `min_n` declarado.** Sin guard no hay
   veredicto. Umbrales iniciales: comparativas de rivales n≥5 posts Y ≥2 rivales
   con actividad; "fórmula ganadora" n≥10; tendencia temporal ≥1 ciclo semanal
   completo; hero cards de Competencia: engagement total del nicho > 0 Y ≥1
   rival con ≥3 posts. (PostHog bloquea bajo 50 exposiciones; Similarweb pinta
   "Not enough data" — es práctica de productos serios, no timidez.)
3. **El empty state auto-diagnostica su causa** (patrón Linear): si es por
   filtros → mostrar los chips activos y cuál es el culpable; si es por ingesta
   → decir desde cuándo corre el sensor y cuándo llegará el dato; si es por
   fuente → teaser con Conectar.
4. **Demo-state etiquetado > vacío pasivo** para marcas recién creadas: "Así se
   verá tu Estrategia — datos de ejemplo" con el CTA real superpuesto (patrón
   Mixpanel/Autopilot). Candidato: onboarding de marcas nuevas.
5. **El teaser de integración es palanca de activación** (PLG): liderar con lo
   que desbloquea ("Conecta Shopify → verás qué contenido genera VENTAS"), no
   con el candado. Aplica directo a la capa comercial de Mi Marca (GA4, Shopify,
   ML) — convierte los huecos de la visión en motor de conexión.

---

## EL SISTEMA ANTI-SATURACIÓN (jerarquía)

1. **BLUF ejecutivo**: cada tab abre con LA conclusión en palabras (frase con
   verbo, generada de los datos: "Tu engagement cayó 18% porque bajaste cadencia;
   la jugada: X") — los charts son la evidencia, debajo. Para un CMO: claridad,
   no exploración (Dykes/Few).
2. **5–7 elementos primarios por vista. 1 héroe + 3–5 soportes.** Todo lo demás
   → drill-down. Máximo 2 niveles de disclosure (card → modal, y PARAR).
3. **Overview → zoom/filter → details on demand** (Shneiderman): el nivel-3
   (listas completas de comentarios, tablas de recepción por post) vive en
   modales/vistas de detalle, jamás en el overview.
4. **Formas correctas** (doctrina dataviz): si la historia es un número → stat
   tile, no chart; si es "usa X pero funciona Y" → frase de énfasis, no dos
   donuts; >7 clases con significado → top-N + "Otros" o tabla; nunca dual-axis;
   marcas finas, grid recesivo, un solo acento.
5. **Color solo donde significa algo**: status reservado para bueno/malo,
   énfasis para el protagonista, gris para el contexto.

---

## APLICACIÓN CONCRETA POR TAB (fixes priorizados)

### Competencia/Monitoreos (pecado A — URGENTE, es bug de credibilidad)
1. **Guards en `_computeCompetitionCards`**: si engagement total del nicho = 0 o
   ningún rival con ≥3 posts → NO generar hero cards de rivalidad; en su lugar
   UNA card de estado: "Tus 5 monitoreados están configurados — los sensores
   corren; primeras señales en ~24-48h" (+estado real de sensor_runs).
2. **Benchmark**: guard "≥2 lados con actividad" (ya existe el mensaje "Aun no
   hay suficiente actividad" — pero el SOV 100%/0% y el headline "te superan
   101 vs 0" se cuelan; alinear todos los sub-bloques al mismo guard).
3. **KPIs**: `0`/`—` por ausencia → reemplazar la fila entera por el empty
   state con causa (un solo mensaje, no 4 tiles muertos).
4. **Ranking de ceros** → empty state con causa + estado de sensores por perfil.

### Mi Marca (pecado B — en curso, Sprint 1 ya quitó 6 bloques)
5. Donuts Tonos/Temas → frase de énfasis única (ya planificado).
6. Pilares: top 3 + "ver los 9" (fold), con guard n≥5 por pilar.
7. Recepción/comentarios: top 3 + "ver todo" en modal (nivel-3 fuera del overview).
8. BLUF: el relato de Salud V2 como apertura del tab (ya spec'd en task #3).

### Tendencias
9. Ya tiene "estados vacíos honestos" (patrón correcto) — extenderles la CAUSA
   real (sensores pausados por cuota) + próximo paso.
10. KPIs de actividad-de-la-herramienta → degradar; hero = el océano azul #1.

### Estrategia
11. Aplicar máquina de estados a la cuenta rendida futura: sin jugadas medidas →
    "Tu primera jugada está en producción; la primera cuenta rendida llega ~7
    días después de publicar" (progreso hacia el valor, no hueco).

### Transversal (infraestructura)
12. **Primitiva compartida `cardState()`** en el frontend (BaseView o helper de
    dashboard): recibe {aplica, fuenteConectada, cargando, n, min_n} y retorna
    el estado — para que los 4 tabs no re-implementen el árbol cada uno.
13. **RPCs**: exponer `coverage`/`data_since`/`n` en las respuestas para que el
    frontend pueda decidir estado sin adivinar (varios ya lo traen parcialmente).

## El test final de cada card (se suma al test de la reunión mensual)

> *"¿Esta card puede MENTIR si no hay datos?"* — si puede (narrativa sin guard,
> cero como medición, 100% vs 0% de un solo lado), no se shippea sin su guard.
