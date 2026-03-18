# Markdown oficial (Vera / AI Smart Content)

Esta es la **referencia oficial** de Markdown para Vera. Está basada en el “Basic Syntax” de Markdown y alineada con lo que actualmente se renderiza en el chat.

- Referencia: [Markdown Guide — Basic Syntax](https://www.markdownguide.org/basic-syntax/)

## Headings (títulos)

```text
# H1
## H2
### H3
#### H4
##### H5
###### H6
```

## Énfasis

- **Negrita**

```text
**Texto en negrita**
__Texto en negrita__
```

- *Cursiva*

```text
*Texto en cursiva*
_Texto en cursiva_
```

- ***Negrita + cursiva***

```text
***Texto importante***
___Texto importante___
```

- ~~Tachado~~

```text
~~Texto tachado~~
```

## Párrafos y saltos de línea

- **Párrafo nuevo**: deja una línea en blanco entre bloques.

```text
Primer párrafo.

Segundo párrafo.
```

- **Salto de línea**: usa una nueva línea (se renderiza como `<br>`).

```text
Línea 1
Línea 2
```

## Listas

- **Lista con viñetas** (`-`, `*` o `+`)

```text
- Item 1
- Item 2
* Item 3
+ Item 4
```

- **Lista numerada**

```text
1. Paso 1
2. Paso 2
3. Paso 3
```

## Links

```text
[Texto del link](https://example.com)
```

Recomendación: usa `https://` y evita URLs raras. Vera bloquea esquemas peligrosos (por seguridad).

## Imágenes

```text
![Texto alternativo](/ruta/a/imagen.png)
![Texto alternativo](https://example.com/imagen.jpg)
```

## Blockquote (cita)

```text
> Esto es una cita.
> Puede tener varias líneas.
```

## Código

- **Código inline**

```text
Usa `npm run dev` para iniciar el proyecto.
```

- **Bloque de código (fenced)**

```text
```js
console.log("Hola");
```
```

## Separadores (Horizontal Rules)

```text
---
***
___
```

## Gráficos visuales (Vera Charts)

Vera puede renderizar gráficos **visuales** cuando envías un bloque de código con lenguaje `chart` que contenga un **JSON**.

### Sintaxis

```text
```chart
{
  "type": "pie",
  "title": "Mi gráfico",
  "data": [
    { "label": "A", "value": 30, "color": "#ff6500" },
    { "label": "B", "value": 70, "color": "#00e7ff" }
  ]
}
```
```

### Tipos soportados

- `pie` (pie chart)
- `donut` (donut chart)
- `bar` (bar chart)
- `line` (line chart)
- `progress` (progress bar)
- `pyramid` (pyramid chart)

### Ejemplos (listos para usar)

#### Pie chart

```text
```chart
{
  "type": "pie",
  "title": "Distribución de ventas",
  "data": [
    { "label": "Producto A", "value": 45, "color": "#ff6500" },
    { "label": "Producto B", "value": 30, "color": "#00e7ff" },
    { "label": "Producto C", "value": 25, "color": "#5b00ea" }
  ]
}
```
```

#### Donut chart

```text
```chart
{
  "type": "donut",
  "title": "Canales",
  "centerLabel": "Total",
  "innerRadius": 0.62,
  "data": [
    { "label": "Instagram", "value": 40, "color": "#ff0000" },
    { "label": "TikTok", "value": 35, "color": "#ffe500" },
    { "label": "YouTube", "value": 25, "color": "#0018ee" }
  ]
}
```
```

#### Bar chart

```text
```chart
{
  "type": "bar",
  "title": "Leads por canal",
  "labels": true,
  "gap": 12,
  "data": [
    { "label": "IG", "value": 120, "color": "#ff6500" },
    { "label": "TT", "value": 180, "color": "#00d614" },
    { "label": "YT", "value": 90,  "color": "#00e7ff" },
    { "label": "WEB", "value": 210, "color": "#5b00ea" }
  ]
}
```
```

#### Line chart

```text
```chart
{
  "type": "line",
  "title": "Crecimiento semanal",
  "stroke": "#00e7ff",
  "labels": true,
  "data": [
    { "label": "Lun", "value": 12 },
    { "label": "Mar", "value": 18 },
    { "label": "Mié", "value": 17 },
    { "label": "Jue", "value": 26 },
    { "label": "Vie", "value": 31 },
    { "label": "Sáb", "value": 24 },
    { "label": "Dom", "value": 36 }
  ]
}
```
```

#### Progress bar

```text
```chart
{
  "type": "progress",
  "title": "Progreso de campaña",
  "label": "Meta alcanzada",
  "value": 67,
  "fillColor": "#00d614",
  "trackColor": "rgba(255,255,255,0.12)",
  "barHeight": 18
}
```
```

#### Pyramid chart

```text
```chart
{
  "type": "pyramid",
  "title": "Funnel",
  "labels": true,
  "data": [
    { "label": "Awareness", "value": 1000, "color": "#00e7ff" },
    { "label": "Interés",   "value": 600,  "color": "#ffe500" },
    { "label": "Consider.", "value": 350,  "color": "#ff6500" },
    { "label": "Compra",    "value": 140,  "color": "#00d614" }
  ]
}
```
```

### Opciones comunes

- `title`: string (opcional)
- `legend`: boolean (default `true`)
- `width`, `height`: números (opcional, para ajustar proporción)
- `labels`: boolean (en `bar` y `line`)

### Seguridad

- Las URLs peligrosas (`javascript:`, `data:`) se bloquean.
- El bloque `chart` **solo acepta JSON** (no HTML).

## Recomendación para prompts y respuestas

```text
## Objetivo
- ...

## Plan
1. ...

## Entregables
- ...
```

## Limitaciones actuales (por diseño)

- **No** hay soporte completo de Markdown “extendido” (tablas, footnotes, etc.).
- **HTML embebido** no se renderiza (se escapa por seguridad).
- Mantén **listas anidadas** simples para máxima compatibilidad.

