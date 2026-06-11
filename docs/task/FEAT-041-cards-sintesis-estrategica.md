# FEAT-041 — Las 4 cards como SÍNTESIS estratégica (no una señal cada una)

> Estado: **MOTOR DE SÍNTESIS COMPLETO (4/4 cards) — desplegado 2026-06-11.**
> RPCs: dashboard_brand_what_wins (Lo que funciona), dashboard_brand_opportunities
> (Oportunidad), dashboard_brand_what_drags (Lo que te resta), dashboard_brand_risk_composite
> (Riesgo). Cada una agrega varias fuentes con reglas+matemática (SIN LLM); glance =
> hallazgo dominante, detalle (modal) = findings rankeados por severidad. Riesgo =
> reputación + desempeño (competitivo va a Competencia). Pendiente fase 2: detalle
> narrativo en Figma + sumar más fuentes (crecimiento de público, blind spots de
> brand_vulnerabilities, fuga de audiencia por retención de video).
> Modelo original abajo.

> Estado original: **modelo, pendiente de aprobación.** Fuente de verdad: specs del usuario
> (`~/Downloads/Dashboards-Specs/Dashboard - mi marca.txt` + `dashboard_mi_marca_spec.docx`).
> Corrige el gap: hoy cada card analiza UN tema (un pilar, un tono, hostilidad);
> deben sintetizar TODAS las señales y narrarle al CMO.

## La visión (del usuario + spec)
Las 4 cards (Lo que funciona / Oportunidad / Lo que te resta / Riesgo) son la capa de
**síntesis estratégica** del dashboard Mi Marca. No leen un tema: leen TODO (actividad,
pilares, tono, fatiga, destacados, sentimiento, influencia, conversión, fuga de audiencia,
vulnerabilidades, precios) y le narran al CMO:
- "ganas público por aquí → potencia esto y genera esto otro"
- "identificamos estas vulnerabilidades; pierdes público por esto"
- "este comentario / esta opinión de @user genera alto impacto"
- "desde que usas este tema con este tono tu impacto social bajó drásticamente"
- "tu último post trajo visualizaciones nuevas; el engagement subió por X e Y"
- "en tu historial, el post de mejor conversión fue este; esta campaña convirtió alto
   y podemos reusar el enfoque"

## Datos disponibles en IGNIS (verificado, hay con qué sintetizar)
brand_vulnerabilities (131) · brand_content_analysis (648: fatigue_risk, tone_coherence_score,
why_it_worked, clarity_score, dominant_emotion, narrative_pillar) · brand_narrative_pillars (8) ·
brand_post_comments own (35) · campaigns (7) · + lo ya usado (pillars/what_works/reception/reach).

## Modelo: cada card = síntesis multi-señal → narrativa con evidencia concreta

| Card | Sintetiza (fuentes) | Narra al CMO |
|---|---|---|
| **Lo que funciona** (virtudes / qué gana) | pilares lift>0 · boosts tono/tema/formato · mejor recepción · `why_it_worked` del top post · crecimiento de público · campaña de mejor conversión | "Ganas público por {pilar/tono} (+X%); tu post {Y} funcionó por {color/frase/hora}; campaña {Z} convirtió alto → replica/potencia" |
| **Oportunidad** (blind spots) | pilares huérfanos · blind spots (haces bien y no comunicas) · tonos/formatos de alto lift subexplotados · mejor hora/formato sin usar | "Rinde y casi no lo usas: pilar {X}, tema que deberías tocar, formato/hora {Y}" |
| **Lo que te resta** (fuga / desempeño) | drags tono/tema · fatiga (`fatigue_risk`) · desviación de tono (`tone_coherence_score`) · caída causal "desde {fecha} con {tema+tono} bajó tu impacto Z%" · claridad baja · fuga de audiencia | "Tu tono {X} resta −Y%; desde {fecha} que usas {tema+tono} tu impacto bajó Z%; fatiga en {formato}; mensaje poco claro" |
| **Riesgo** (amenazas / SWOT−) | brand_vulnerabilities (abiertas × severidad: competidor te supera + contenido) · crisis_signals (crisis de baja intensidad) · comentarios hostiles + sentimiento negativo · influencia negativa (detractores) | "{N} amenazas altas (competidor {X} te supera {n}x); crisis incipiente; comentario clave de @{user}; hostilidad {%}" |

**Glance vs detalle:** el glance mantiene el diseño actual y lidera con el hallazgo DOMINANTE
(limpio). El **detalle (modal)** es la NARRATIVA completa: varios hallazgos rankeados, cada uno
con su evidencia concreta (el post, el comentario, la campaña, la vulnerabilidad, el usuario).

## Arquitectura
- Una RPC de síntesis `dashboard_brand_strategic_synthesis` (o ampliar `_computeActionPlanItems`)
  que agrega TODAS las fuentes con reglas+matemática (NO LLM en el camino caliente; respeta la regla)
  y produce, por card: hallazgo dominante (glance) + lista rankeada de hallazgos con evidencia (detalle).
- El RIESGO deja de ser solo hostilidad → compuesto (reputación + competitivo + desempeño), liderando
  con la amenaza más severa (para IGNIS: 41 vulnerabilidades altas, no "Sin hostilidad").

## Fases propuestas
1. **Motor de síntesis (backend):** RPC que agrega las fuentes y rankea hallazgos por card. Testeable
   contra datos reales de IGNIS.
2. **Detalle narrativo (modal):** rediseño en Figma primero (workflow Figma-first) → implementación.
   Glance se mantiene.
3. Iterar contra datos reales.

## Decisiones para aprobar
1. ¿Arrancamos por el motor de síntesis (fase 1) y luego Figma para el detalle?
2. Riesgo compuesto: ¿incluye desempeño propio (fatiga/fuga) además de reputación+competitivo?
