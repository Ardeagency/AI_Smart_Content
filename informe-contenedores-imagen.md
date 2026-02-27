# Informe: contenedores de imagen — variables (actualizado)

## Variables únicas en `:root` (único punto de verdad)

```css
--media-container-shadow: var(--shadow-card);
--media-container-shadow-hover: var(--shadow-hover);
--media-container-bg: transparent;
--media-container-bg-fill: var(--bg-card);  /* p. ej. video thumbnail */
--media-container-radius: 0;
```

## Quién usa estas variables

| Contenedor | shadow | background | radius |
|------------|--------|------------|--------|
| `.history-image-card` | `--media-container-shadow` / hover `--media-container-shadow-hover` | `--media-container-bg` | `--media-container-radius` |
| `.history-video-card-thumbnail` | — | `--media-container-bg-fill` | — |
| Bloque "mismo contenedor" (featured, content-card, product, flow, dev-flow, image-selector-card-image, image-preview, image-wrapper, ficha) | `--media-container-shadow` | `--media-container-bg` | `--media-container-radius` |
| `.image-selector-card` | `--media-container-shadow` (hover: `--media-container-shadow-hover`) | `--media-container-bg` | `--media-container-radius` |
| `.product-view-thumb` | (hereda del bloque) | (hereda) | (hereda); `border: 2px solid var(--border-color)` |

## Pendiente (placeholders)

Los placeholders (featured, content-card, image-selector) siguen con sus propios gradientes/variables; se pueden unificar después con variables de placeholder si se desea.
