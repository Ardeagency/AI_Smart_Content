# Salud de Marca V2 — Spec de rediseño (signos vitales con relato)

> Diagnóstico 2026-07-02, verificado en código. Síntoma que lo disparó:
> IGNIS (ficticia, muerta hace 39 días) = 33; WAKEUP (real, publicando HOY,
> 19.1K engagement, 87% resonancia positiva) = 43. **Brecha de 10 puntos entre
> un cadáver y un ser vivo = el score no discrimina = no informa.**

## Los fallos de la fórmula actual (`dashboard_mimarca_health`, 2 overloads)

**Conceptual:** mide OBEDIENCIA A LA HERRAMIENTA, no salud de marca — 3 de 5
componentes (alineación a fórmula, aprovechamiento de tendencias, cadencia-como-
tarea) preguntan "¿le haces caso a la herramienta?" → métrica auto-servida, el
CMO desconfía. Salud real (doctrina Sharp): penetración, resonancia, share of
voice, disponibilidad mental.

**De cálculo (con línea):**
1. Línea 58: `COALESCE(tone_coherence_score, 0.5)` — sin dato, tono = 50. Por
   eso AMBAS marcas muestran 46 (gravitan al default). La marca muerta FLOTA
   hacia arriba con regalos de 50; la viva es ARRASTRADA por umbrales duros →
   todo converge al mazacote 33-43. Máquina de compresión.
2. PROMEDIA cuando debe VETAR: 39 días sin publicar no capa el score. La muerte
   no se promedia — se declara.
3. Línea 65: "fórmula ganadora min 2" → n=2 posts definen la fórmula; "solo 7%
   usa tu fórmula" castiga la salud con ruido estadístico.
4. Objetivo opaco e incoherente: IGNIS (ficticia) target 78 > WAKEUP (real) 65;
   band p25 hardcodeada en 50; el cliente no puede auditar de dónde sale.
5. Fracciones crudas ilegibles en UI ("105/204", "42/87") + consistencia
   computada sobre TODO el histórico scrapeado (322 semanas desde 2021) =
   denominador imposeíble.

## El rediseño: 5 signos vitales

**La pregunta del score:** *¿Tu marca está hoy más fácil de recordar y de
comprar que el mes pasado — y frente a tu rival?*

| # | Signo | Qué mide | Regla clave | Dato (ya existe) |
|---|---|---|---|---|
| 1 | **PULSO** | ¿Estás vivo? Recencia + cadencia vs TU rival | **GATE, no promedio: >30 días sin publicar → score total capado a 20, "En coma"** | brand_posts |
| 2 | **RESONANCIA** (peso alto) | ¿Le importas a alguien? | engagement_rate normalizado + sentimiento de comentarios | engagement_rate, brand_post_comments |
| 3 | **CRECIMIENTO** | ¿Llegas a gente nueva? | Tendencia de alcance vs tu propio pasado | reach_total |
| 4 | **SHARE OF VOICE** | ¿Ganas o pierdes la conversación? | Posts+engagement vs rivales monitoreados | posts de competidores |
| 5 | **DISTINTIVIDAD** (peso bajo) | ¿Suenas a ti? | Solo con n≥10 posts analizados | tone_coherence_score |

## Reglas de servido
1. **Sin defaults 0.5, JAMÁS**: sin dato → el componente se EXCLUYE y se dice
   abiertamente ("aún no mido X — conecta Y").
2. **El relato ANTES del número**: *"WAKEUP está VIVA y tu audiencia te quiere
   (87% positivo), pero publicas a la mitad del ritmo de tu rival. Salud 62 ↑5
   vs junio."* El cliente jamás hace ingeniería inversa del número.
3. **Flecha de tendencia siempre** (vs mes anterior).
4. **Objetivo transparente**: mediana del set competitivo real, mostrada.
5. **Una sola escala 0-100**. Muerte a las fracciones crudas.
6. **Matar de la salud**: alineación-a-fórmula (→ Oportunidades, con n≥10) y
   aprovechamiento-de-tendencias (tarea, no salud).
7. **Ventana 90 días**, no el histórico completo.
8. Consolidar los 2 overloads en 1 función.

## Criterio de aceptación permanente (fixtures)
IGNIS y WAKEUP como test fijo: **si `salud(muerta) > salud(viva) − 30`, la
fórmula FALLA.** Esperado: IGNIS ≤ 20 "En coma"; WAKEUP ~60-65 "Sana pero lenta".
