# Estilo de la plataforma (Living/Brands) – CSS

Todas las vistas deben usar el **mismo tema**: fondo oscuro (Living/Brands), naranja como acento, mismas superficies y bordes.

## Variables de diseño (usar en todas las páginas)

- **Fondo de página:** `var(--living-bg-deep, #0A0C0F)`
- **Superficies/paneles:** `var(--living-bg-surface, #0E1012)`
- **Cards/widgets:** `var(--living-bg-card, rgba(21, 23, 28, 0.6))`
- **Bordes sutiles:** `rgba(255, 255, 255, 0.06)`
- **Acento principal:** `var(--accent-warm, #e09145)` / `var(--accent-yellow-hover, #f0a055)`

## Páginas actualizadas al estilo plataforma

| CSS | Cambios aplicados |
|-----|-------------------|
| **product-detail.css** | Fondo `--living-bg-deep`; cards con `--living-bg-card` y borde sutil; eliminado gradiente propio. |
| **audiences.css** | Contenedor `--living-bg-deep`; secciones `--living-bg-card` y borde. |
| **campaigns.css** | Contenedor `--living-bg-deep`; tabs con borde plataforma. |
| **content.css** | Contenedor `--living-bg-deep`; filtros `--living-bg-surface`; preview `--living-bg-card`. |
| **settings.css** | Contenedor `--living-bg-deep`; secciones `--living-bg-card`; inputs `--living-bg-surface`. |
| **organization.css** | Contenedor `--living-bg-deep`; tabs con borde plataforma. |
| **studio.css** | Layout `--living-bg-deep`; botón Producir naranja y hover. |
| **products.css** | Contenedor `--living-bg-deep`. |
| **payment-modal.css** | Modal con `--living-bg-card` y borde sutil (sin verde). |
| **base.css** | Añadido `--bg-dark: #0A0C0F` para compatibilidad. |

## Páginas que ya usaban el diseño

- **hogar.css**, **living.css**, **brands.css** – Referencia del diseño.
- **developer.css** – Tema unificado en commit anterior.
- **create.css** – Usa `var(--bg-primary)`, `var(--accent-warm)`.
- **navigation.css** – Sidebar y header unificados.

## Evitar

- Fondos con `#121416`, `#1B1D1F`, `#2a2a2a` u otros grises sueltos.
- Bordes con `rgba(236, 235, 218, 0.1)` o tonos amarillos/grises de texto.
- Gradientes o paletas propias por vista (ej. antiguo product-detail).
- Color de acento morado o verde lima en la UI principal.
