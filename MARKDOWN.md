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

