# Pendiente: crear `recursos/og-image.png`

`index.html` referencia `https://aismartcontent.io/recursos/og-image.png` en `og:image` y `twitter:image`. El archivo todavía no existe en el repo.

Mientras no exista, los previews en WhatsApp/Slack/X/LinkedIn salen sin imagen (texto + dominio nada más, como en el screenshot que mandó @info que motivó este cambio).

## Specs
- Formato: PNG (alternativa WebP si es <100 KB).
- Resolución: 1200×630 (proporción 1.91:1).
- Peso objetivo: <300 KB.
- Safe area: dejar ~100 px de padding (algunos crops cortan).
- Contenido sugerido: logo `recursos/Recursos de Marca/Recursos/logo-03.svg` + tagline corto ("Crea contenido de marca con IA") sobre fondo de marca.

## Cuando esté listo
1. Copiar a `recursos/og-image.png`.
2. Validar con https://www.opengraph.xyz/url/https%3A%2F%2Faismartcontent.io%2F
3. Borrar este archivo (regla [[feedback_tech_debt_task_folder]]).
