# Markdown oficial (Vera / AI Smart Content)

Este documento define el **formato Markdown recomendado** para escribir mensajes y respuestas dentro de Vera.

> Nota: el renderer actual es deliberadamente simple. Si algo no se ve como esperas, usa las alternativas sugeridas.

## Texto

- **Negrita**

```text
**Texto en negrita**
```

- *Cursiva*

```text
*Texto en cursiva*
```

## Saltos de línea y párrafos

- **Párrafo nuevo**: deja una línea en blanco entre bloques.

```text
Primer párrafo.

Segundo párrafo.
```

- **Salto de línea dentro de un párrafo**: usa una nueva línea (se renderiza como `<br>`).

```text
Línea 1
Línea 2
```

## Listas

- **Lista con viñetas**

```text
- Item 1
- Item 2
  - Sub-item (recomendado: usar otro `-` con indentación)
```

- **Lista numerada**

```text
1. Paso 1
2. Paso 2
3. Paso 3
```

## Código

- **Código inline**

```text
Usa `npm run dev` para iniciar el proyecto.
```

- **Bloque de código**

> Puedes indicar el lenguaje después de las tres comillas invertidas.

```text
```js
console.log("Hola");
```
```

## Recomendaciones para prompts y respuestas

- **Usa títulos cortos** en negrita para secciones:

```text
**Objetivo**
- ...

**Plan**
1. ...
```

- **Para instrucciones**: prefiere listas numeradas.
- **Para checks**: usa viñetas con texto claro.

## Limitaciones conocidas (por diseño)

- **No hay soporte completo** de Markdown “extendido” (tablas, footnotes, etc.).
- **Los links** pueden mostrarse como texto normal dependiendo del contenido.
- **Anidación compleja de listas**: mantenla simple para máxima compatibilidad.

