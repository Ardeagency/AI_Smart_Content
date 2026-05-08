---
id: FEAT-015
title: Pre-flight cost confirmation — Vera advierte antes de tareas costosas
severity: medium
type: feature
status: open
auto_eligible: no
auto_eligible_reason: requiere validación visual de UX (confirm() en producción)
est_duration: short
created: 2026-05-05
updated: 2026-05-05
owner: -
---

# FEAT-015 · Pre-flight cost confirmation

## Por qué

OpenClaw tiene autonomía total — cuando el usuario le pide una tarea de tipo "investiga toda la competencia" puede entrar en un loop de tool calls que dura 30-60 minutos y consume $19-20 USD. El cap diario (FEAT-014) bloquea cuando el dinero ya se gastó. Esta feature **frena antes**: estima el costo del mensaje y le pide al usuario confirmación si supera el threshold per-org.

## Diseño

```
Usuario manda mensaje
    ↓
chat.controller.js
    ↓
cost-estimator.js (heurística sin LLM)
    ↓
¿estimación >= confirm_threshold_usd?
    ├─ NO → flujo normal (insertar user msg, fire-and-forget processAndSaveReply)
    └─ SÍ → devolver { status: 'cost_confirmation_required', estimate }
              ↓
       VeraView muestra window.confirm con estimate
              ↓
        ┌─ Acepta → re-envía con confirmed_high_cost=true → flujo normal
        └─ Cancela → frontend remueve el bubble optimista, no se gasta nada
```

## Heurística (sin LLM)

`src/lib/cost-estimator.js` calcula `usd_estimate` por:

1. **Input tokens estimados:** `text.length × 0.25` + overhead por adjuntos (1500 tokens/imagen, 4000/video, 3000/PDF).
2. **Multiplicador de output:** `6×` si detecta keywords pesadas, `1.5×` si no.
3. **Output base:** 80k tokens si pesado, 8k si no.
4. **Tool calls esperadas:** 25 si pesado, 3 si no — cada una suma $0.40.
5. **Piso histórico:** si el promedio de los últimos 3 mensajes de la org × 1.2 supera el cálculo heurístico, usamos ese piso.
6. **Pricing:** Sonnet 4 ($3 input / $15 output por MTok).

### Keywords pesadas (regex)

| Patrón | Match típico |
|---|---|
| `investig(a\|ar\|ación) (profunda\|exhaustiva)` | "investiga toda la web" |
| `análi(sis\|cis) (exhaustivo\|profundo\|completo)` | "análisis exhaustivo" |
| `(deep\|exhaustive\|comprehensive)[ -]?research` | "deep research" |
| `toda la web` | literal |
| `todos? los\|todas? las` + competidores/marcas/posts/catálogo | "todas las marcas" |
| `catalog(a\|ar)` | "cataloga todos los..." |
| `scraping (masivo\|completo\|de todo)` | literal |
| `(genera\|crea) ... (\d{2,}\|cien\|mil) ...` | "genera 50 variantes" |
| `(análisis\|reporte) (mensual\|anual\|completo)` | "reporte mensual completo" |

### Tests reales (probados en server)

```
[trivial ] est=$1.32  confirm=false  ("hola, ¿cómo estás?")
[normal  ] est=$1.32  confirm=false  ("resúmeme cómo está mi marca esta semana")
[pesado  ] est=$11.20 confirm=true   ("investiga toda la web sobre todos los competidores...")
[masivo  ] est=$11.20 confirm=true   ("genera 50 variantes de copy con análisis exhaustivo + reporte mensual")
```

## Configuración por org

`org_claude_caps` extendida con 2 columnas:

| Columna | Default | Función |
|---|---|---|
| `confirm_threshold_usd` | 5.00 | Si la estimación supera este USD, pide confirmación |
| `confirm_enabled` | true | Si false, salta el pre-check (orgs power-user que no quieren preguntas) |

Para subir el threshold de una org: `UPDATE org_claude_caps SET confirm_threshold_usd = 15 WHERE organization_id = '...';`. Para deshabilitar: `SET confirm_enabled = false`.

## Frontend (v1 con `window.confirm`)

`VeraView.js` ahora maneja `status === 'cost_confirmation_required'`:

```
⚠️ Vera detectó una tarea potencialmente costosa.

Costo estimado: $6.72 – $17.92 USD
Duración estimada: 5-60 min

Razones:
  • Palabras clave detectadas: investiga, toda la web, todos los competidores
  • Promedio reciente alto ($X.XX/mensaje)

¿Continuar con esta tarea?
(Aceptar = ejecutar · Cancelar = replantear o descartar)
```

Si acepta → re-envía con `confirmed_high_cost=true` (skip pre-check). Si cancela → remueve el bubble optimista del usuario.

## Mejora futura (v2)

Reemplazar `window.confirm()` por modal custom con:
- Botón "Replantear" que enfoca el input para que el usuario pueda editar.
- Histograma del costo histórico de la org para contexto.
- Opción "No preguntar más en esta sesión" (flag en `aiState`).

No bloquea esta task — funcional con el confirm nativo.

## Archivos modificados

- `src/lib/cost-estimator.js` — **nuevo** (~140 líneas, sin deps externas más allá del cliente Supabase ya importado).
- `src/controllers/chat.controller.js` — agregada importación + bloque pre-check antes de insertar user message.
- `js/views/VeraView.js` — `sendMessage` acepta `opts.confirmedHighCost`, maneja `cost_confirmation_required`, helper `_confirmHighCost()` y `_removeMessage()`.
- BD: `org_claude_caps.confirm_threshold_usd` + `confirm_enabled` agregadas.
- Backups en server: `chat.controller.js.bak.feat015`.

ai-engine reiniciado limpio post-deploy.

## Criterio de done

- ✅ Schema BD aplicado.
- ✅ `cost-estimator.js` con tests reales pasando (4 casos).
- ✅ `chat.controller.js` devuelve `cost_confirmation_required` para mensajes pesados.
- ✅ `VeraView.js` muestra confirm y reenvía con flag.
- ⏳ **Validación humana**: mandar un mensaje pesado real desde el browser y verificar que sale el confirm + funciona el flujo aceptar/cancelar.
- ⏳ **Calibrar threshold**: tras 1-2 semanas de datos, ajustar `confirm_threshold_usd` y los multiplicadores de la heurística según falsos positivos / falsos negativos.
