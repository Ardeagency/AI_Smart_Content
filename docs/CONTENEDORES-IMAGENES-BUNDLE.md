# Contenedores / cards / celdas que renderizan imágenes (bundle.css)

Resumen de **todos** los patrones de contenedores que muestran imágenes o medios en la plataforma. Cada uno tiene estilos propios (clases distintas).

---

## 1. PRODUCTION / LIVING (historial y hero)

| Patrón | Clases principales | Uso |
|--------|--------------------|-----|
| **Historial – video** | `.history-video-card`, `.history-video-card-thumbnail` | Cards de video en masonry |
| **Historial – imagen** | `.history-image-card`, `.history-image-card img`, `.history-card-actions` | Cards de imagen en masonry |
| **Historial – texto** | `.history-text-card`, `.history-text-card-icon`, `.history-text-card-title` | Cards de texto (sin imagen) |
| **Masonry** | `.living-history-masonry`, `.living-masonry-grid`, `.living-masonry-column`, `.living-masonry-item` | Contenedor y celdas del grid |
| **Hero / featured** | `.living-hero-grid`, `.featured-card`, `.featured-card-visual`, `.featured-card-visual-placeholder`, `.featured-card-prompt-overlay` | Scroll horizontal de producciones destacadas |
| **Highlight cards** | `.highlight-card`, `.highlight-card-title`, `.highlight-card-value` | Destacados tipo “brands” |
| **Content section** | `.living-content-section`, `.living-grid`, `.living-grid-section` | Grid de contenido (reutiliza cards) |

---

## 2. PRODUCTS

| Patrón | Clases principales | Uso |
|--------|--------------------|-----|
| **Product card** | `.product-card`, `.product-card-image`, `.product-card-image img`, `.product-card-image .no-image` | Cards de producto en grid (masonry 0–4 aspect-ratio) |
| **Product grid** | `.products-grid`, `.products-container` | Contenedor del listado |
| **Vista detalle** | `.product-view-thumbnails`, `.product-view-thumb`, `.product-view-thumb img` | Miniaturas en detalle de producto |
| **Galería producto** | `.product-images-section` | Sección de imágenes del producto |

---

## 3. FLOWS (catálogo y hero)

| Patrón | Clases principales | Uso |
|--------|--------------------|-----|
| **Flow card** | `.flow-card`, `.flow-card-media`, `.flow-card-img`, `.flow-card-media-veil`, `.flow-card-placeholder` | Card de flujo (imagen + overlay) |
| **Flow card overlay** | `.flow-card-overlay--default`, `.flow-card-overlay--hover`, `.flow-card-hover-content`, `.flow-card-badges`, `.flow-card-badge` | Overlays y badges |
| **Categoría catálogo** | `.flow-catalog-category-card`, `.flow-catalog-category-card-name` | Cards de categoría en catálogo |
| **Hero por categoría** | `.flow-category-hero`, `.flow-category-hero-media`, `.flow-category-hero-overlay`, `.flow-category-hero-title` | Portada principal por categoría (cover de content_categories) |

---

## 4. STUDIO (flujos y inputs)

| Patrón | Clases principales | Uso |
|--------|--------------------|-----|
| **Studio card flow** | `.studio-card-flow`, `.studio-card-icon`, `.studio-card-text`, `.studio-card-desc`, `.studio-card-tag` | Card de flujo en studio |
| **Image selector** | `.image-selector-card`, `.image-selector-card-image`, `.image-selector-card-placeholder`, `.image-selector-card-label` | Selector de imagen (inputs / studio) |
| **Image selector carousel** | `.image-selector-carousel--preview .image-selector-card` | Variante en carrusel |

---

## 5. CONTENT (vista contenido)

| Patrón | Clases principales | Uso |
|--------|--------------------|-----|
| **Content card** | `.content-card`, `.content-card-image-container`, `.content-card-image`, `.content-card-image-placeholder`, `.content-card-info`, `.content-card-title` | Cards de contenido con imagen |

---

## 6. BRANDS / IDENTITY

| Patrón | Clases principales | Uso |
|--------|--------------------|-----|
| **Brand card** | `.brand-card`, `.brand-cards-zone` | Cards de marca en dashboard |
| **Card genérica** | `.card`, `.card-header`, `.card-body`, `.card-content`, `.card-info`, `.card-content-expanded` | Base y paneles (INFO, etc.) |

---

## 7. CAMPAIGNS

| Patrón | Clases principales | Uso |
|--------|--------------------|-----|
| **Strategic card** | `.campaign-strategic-card`, `.campaign-card-inner`, `.campaign-card-title`, `.campaign-card-meta` | Cards estratégicas |
| **Mini cards** | `.campaign-mini-cards`, `.campaign-mini-card` | Mini cards de campaña |
| **Grid** | `.campaigns-cards-grid` | Contenedor del grid |

---

## 8. DEV / DEVELOPER

| Patrón | Clases principales | Uso |
|--------|--------------------|-----|
| **Dev flow card** | `.dev-flow-card`, `.dev-flow-card-image`, `.dev-flow-card-placeholder`, `.dev-flow-card-header`, `.dev-flow-card-body` | Cards de flujo en vista dev |
| **Dev stat card** | `.dev-stat-card` | Cards de estadísticas |

---

## 9. OTROS (genéricos / planes / templates)

| Patrón | Clases principales | Uso |
|--------|--------------------|-----|
| **Plan card** | `.plan-card-small`, `.plan-card-name`, etc. (planes) | Planes de precios |
| **Template card** | `.template-card` | Plantillas |
| **Login/signin** | `.login-card`, `.signin-card`, `.form-org-card` | Cards de auth |

---

## Resumen numérico

- **Production/Living:** ~7 patrones (history-video, history-image, history-text, masonry, featured-card, highlight-card, content section).
- **Products:** 4 (product-card, grid, thumbnails, images section).
- **Flows:** 4 (flow-card, category card, hero slide).
- **Studio:** 2 (studio-card-flow, image-selector-card).
- **Content:** 1 (content-card).
- **Brands:** 2 (brand-card, card base).
- **Campaigns:** 3 (strategic, mini, grid).
- **Dev:** 2 (dev-flow-card, dev-stat-card).
- **Otros:** 3 (plan, template, login/signin).

En total hay **más de 25 bloques de estilos distintos** para contenedores/cards/celdas que muestran imágenes o medios, cada uno con sus propias clases (sin un sistema unificado de “media card”).
