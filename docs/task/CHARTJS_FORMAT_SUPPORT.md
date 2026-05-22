# Soporte de formato Chart.js en el renderer del chat

**Fecha**: 2026-05-21
**Estado**: ✅ Codigo implementado — ⏳ **PENDIENTE: realizar pruebas manuales con Vera**
**Prioridad**: Alta (bloquea demo si tests fallan)

## Que falta hacer (lo unico bloqueante)

Pedir a Vera el prompt de validacion (ver "Tests manuales post-deploy" abajo) y
verificar que los 10 charts rendericen sin fallar. Si TODOS los checkboxes
quedan en ✅, borrar este archivo entero (`docs/task/CHARTJS_FORMAT_SUPPORT.md`).

**Codigo ya esta en produccion** (verificado 2026-05-22):
- `_normalizeChartJsSpec()` en `js/views/VeraView.js:776`
- Invocado desde `buildEChartsOption()` en `js/views/VeraView.js:844`
- Aliases case-insensitive + multi-serie + per-item colors implementados

## Contexto

Vera (OpenClaw → Claude Sonnet 4) está emitiendo charts en formato **Chart.js** dentro de bloques ` ```chart `. Esto es lo que Claude conoce nativamente desde su training y emite por default cuando ve la instrucción ` ```chart (visualizaciones SVG) ` sin un schema específico en el prompt.

El frontend del chat tiene un converter (`buildEChartsOption`) que esperaba un formato simplificado distinto. Resultado: charts se renderizan vacíos (donut como anillo blanco sin datos, bar como card en negro).

**Principio rector**: NO alteramos el mensaje de Vera. El chat se adapta a lo que Vera emite, no al revés ([[openclaw-freedom-parser]]).

## Análisis: el formato real que emite Vera

Captura del raw log (`/var/log/openclaw-raw.log`):

```json
{
  "type": "doughnut",
  "data": {
    "labels": ["Instagram", "X (Twitter)", "TikTok", "YouTube", "Facebook"],
    "datasets": [{
      "data": [93, 62, 13, 3, 1],
      "backgroundColor": ["#E1306C", "#1DA1F2", "#FE2C55", "#FF0000", "#4267B2"],
      "borderWidth": 2,
      "borderColor": "#fff"
    }]
  },
  "options": {
    "responsive": true,
    "plugins": {
      "title": { "display": true, "text": "📱 Distribución de Publicaciones por Plataforma" },
      "legend": { "position": "right" }
    }
  }
}
```

Patrones detectados en los 10 charts emitidos:

| # | Tipo emitido | Aliases Chart.js que usa | Notas |
|---|---|---|---|
| 1 | `line` | con `data.datasets[].tension`, `fill`, `borderColor` | OK pero anidado en `data.datasets` |
| 2 | `doughnut` | `data.labels` + `data.datasets[0].data` + `backgroundColor` array | Camel: `doughnut` no `donut` |
| 3 | `bar` | multi-serie en `data.datasets[]` cada uno con su `data:[]` | Multi-serie no estaba mapeado |
| 4 | `polarArea` | mismo schema que doughnut | **camelCase!** `polarArea` no `polararea` |
| 5 | `scatter` | `data.datasets[].data:[{x,y}]` con `pointRadius` | Puntos x/y por dataset |
| 6 | `radar` | `data.labels` + `data.datasets[].data[]` + `backgroundColor`/`borderColor` | Single o multi-serie |
| 8 | `doughnut` con `cutout:"75%"` | Vera lo usa como gauge | Cutout custom |
| 10 | `bubble` | `data.datasets[].data:[{x,y,r}]` | Burbujas con radius |

## Por qué falla en el código actual

`buildEChartsOption(spec)` hace:
```js
const data = Array.isArray(spec.data) ? spec.data : [];
// luego:
data.map((d) => ({ name: d.label, value: d.value }))
```

Con el formato Chart.js, `spec.data` **es un objeto**, no array → `data` queda `[]` → ECharts renderiza placeholder vacío (anillo blanco / card negro).

Para `polarArea` (camelCase) además ni siquiera entra al converter — `ECHARTS_NATIVE_TYPES.has("polarArea")` es false porque el set tiene `polararea` (lowercase). Cae al fallback de tabla → pero como `data` tampoco se parsea bien, la tabla queda vacía también.

## Plan de implementación

### 1. Detector de formato Chart.js → normalizador a forma interna

Añadir al inicio de `buildEChartsOption(spec)`:

```js
function _normalizeChartJsSpec(spec) {
  // Detectar si es formato Chart.js: data es objeto con labels + datasets
  if (spec?.data && typeof spec.data === 'object' && !Array.isArray(spec.data)
      && (Array.isArray(spec.data.labels) || Array.isArray(spec.data.datasets))) {
    const labels = spec.data.labels || [];
    const datasets = spec.data.datasets || [];

    // Title: viene de options.plugins.title.text
    const cjsTitle = spec.options?.plugins?.title?.text;

    return {
      ...spec,
      title: spec.title || cjsTitle,
      categories: labels,
      series: datasets.map((ds, i) => ({
        name: ds.label || `Serie ${i + 1}`,
        data: ds.data || [],
        color: Array.isArray(ds.backgroundColor) ? ds.backgroundColor[0] : ds.backgroundColor,
        // Per-point colors (donut/pie/polarArea usan array de colores)
        _itemColors: Array.isArray(ds.backgroundColor) ? ds.backgroundColor : null,
      })),
      // Para charts circulares: data flat para fácil acceso
      data: (datasets[0]?.data || []).map((v, i) => ({
        label: labels[i] || `Item ${i + 1}`,
        value: typeof v === 'number' ? v : (v?.value ?? 0),
        color: Array.isArray(datasets[0]?.backgroundColor) ? datasets[0].backgroundColor[i] : undefined,
        // Para scatter/bubble: preservar x/y/r
        x: typeof v === 'object' ? v.x : undefined,
        y: typeof v === 'object' ? v.y : undefined,
        r: typeof v === 'object' ? v.r : undefined,
      })),
    };
  }
  return spec;
}
```

### 2. Aliases case-insensitive + nuevos types Chart.js

Antes de chequear `ECHARTS_NATIVE_TYPES`, normalizar el type:

```js
const rawType = String(spec.type || '').toLowerCase().replace(/[\s_-]+/g, '');
// "doughnut" → "doughnut" (lowercased ya), luego alias:
const TYPE_ALIASES = {
  doughnut: 'donut',
  polararea: 'polar',
  horizontalbar: 'horizontalbar', // ya mapeado
  // ... ya están los otros
};
const type = TYPE_ALIASES[rawType] || rawType;
```

(Ya tenemos esto en `parseChartSpec` pero el problema es que `polarArea` con A mayúscula no matcheaba — el `.toLowerCase()` lo arregla en parseChartSpec, pero el set `ECHARTS_NATIVE_TYPES` no incluía `donut` como alias de `doughnut`).

### 3. Soporte multi-serie en bar/line

Vera emite charts con N datasets. Mi converter ya maneja `seriesIn` para bar y line — solo necesita que `_normalizeChartJsSpec` mapee correctamente cada dataset a la forma `{name, data}`.

### 4. Colores per-item en donut/pie/polar

Cuando Chart.js define `backgroundColor: ["#E1306C", "#1DA1F2", ...]` con un color por slice, debemos pasarlos como `itemStyle.color` por cada data point en ECharts.

### 5. Cutout para gauge fake (donut con `cutout:"75%"`)

Vera usa el truco común de Chart.js: doughnut con `cutout: "75%"` como gauge. Detectar `spec.data.datasets[0]?.cutout` o `spec.options?.cutout` y usar `radius: ['cutout', '70%']` en ECharts.

### 6. Title del wrapper

Cuando Vera embebe el título en `options.plugins.title.text`, mi converter debe leerlo de ahí (no solo de `spec.title`).

### 7. Documentar tech debt resuelto

Borrar este archivo cuando los charts rendericen end-to-end ([[tech-debt-task-folder]]).

## Tests manuales post-deploy

Pedir a Vera (mismo prompt que generó el bug):
> "quiero que hagas pruebas enviame todos los diferentes graficos que puedes hacer con un informe del mercado"

Validar que rendericen los 10 charts emitidos:
- [ ] Line (engagement temporal)
- [ ] Doughnut (distribución plataformas)
- [ ] Bar multi-serie (IGNIS vs competencia)
- [ ] PolarArea (sentimientos)
- [ ] Scatter (productos por precio)
- [ ] Radar (engagement por tipo)
- [ ] Mermaid gantt (calendario)
- [ ] Doughnut con cutout (gauge mensual)
- [ ] Mermaid flowchart (conversión)
- [ ] Bubble (market position)

## Out of scope

- **Callbacks JS dentro de spec** (Vera emite `"callback": "function(value) {...}"` en options.scales.y.ticks). ECharts no ejecuta strings. Lo ignoramos por ahora — el axis renderiza sin formatter custom. Si en el futuro Vera lo emite frecuente, se puede agregar un parser de formatters comunes.
- **Plugins de Chart.js** (Title, Legend, Tooltip, etc.). Mapeo los principales. Los avanzados (annotations, datalabels) se ignoran.
- **Animaciones específicas de Chart.js**. ECharts tiene sus propias animaciones por default.
