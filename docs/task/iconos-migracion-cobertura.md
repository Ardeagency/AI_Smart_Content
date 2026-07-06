# Mapa de cobertura de iconos — externos → biblioteca custom

_Cruce de los iconos de proveedores externos (Font Awesome + Phosphor) usados en el codigo de AI Smart Content contra la biblioteca propia `recursos/icons/*.svg` (mirror del frame Figma `53:24`)._

Generado automaticamente. Objetivo: saber que iconos externos ya tienen equivalente propio (se pueden reemplazar) y cuales **faltan por dibujar** (GAP) antes de completar la migracion.

---

## ACTUALIZACION 2026-07-06 — 41 GAPs dibujados

Se dibujaron los **41 GAPs de mas uso** (geometria oficial Lucide reestilizada al estandar de la casa: `viewBox 0 0 24 24`, `stroke="white" 1.5`, round). Unifican **82 glifos externos** (FA + Phosphor) en un solo SVG cada uno. Ya estan en `recursos/icons/`:

`bookmark`, `camera`, `chart-bar`, `chart-pie`, `chevron-down`, `chevron-up`, `circle`, `credit-card`, `crop`, `cursor-click`, `eraser`, `expand`, `eye`, `fire`, `flask`, `gift`, `git-branch`, `globe`, `grid`, `hourglass`, `inbox`, `key`, `laptop`, `logout`, `menu`, `minimize`, `minus`, `moon`, `move`, `music`, `paperclip`, `pause`, `play`, `plug`, `puzzle`, `quote`, `receipt`, `scissors`, `sun`, `user-slash`, `volume`

**Cobertura tras el batch: 1516 / 1586 usos (~96%)** — subio desde 78%. Total biblioteca custom: **145 SVG**.

Mapeos clave nuevos (externo → custom): `fa-bars`/`fa-th`/`ph-list-bullets` → `menu`; `fa-th-large`/`ph-squares-four`/`fa-border-all` → `grid`; `fa-caret-down`/`ph-caret-down` → `chevron-down`; `fa-sign-out-alt`/`fa-arrow-right-to-bracket` → `logout`; `fa-expand-alt`/`ph-arrows-out` → `expand`; `fa-cut`/`fa-scissors` → `scissors`; `fa-plug`/`ph-disconnect`/`ph-connection` → `plug`; `ph-cardholder` → `credit-card`; `fa-user-secret` → `user-slash`.

**GAP restante (~70 usos):** casi todo contenido/demo o count=1 (`fa-utensils`, `fa-wine-glass`, `fa-water`, `fa-wind`, `fa-shirt`, `fa-pills`...) mas unos pocos UI menores: `ph-textbox` (4), `fa-align-left` (3), `ph-overlay` (3), `fa-gem`/`fa-crown` (2, premium), `fa-concierge-bell` (2), `fa-code-compare` (2), `ph-cloud` (2). Se dibujan on-demand cuando toque migrar esas zonas.

_(Las tablas abajo son el snapshot original pre-batch: los 82 glifos listados arriba ya NO son GAP.)_

---

## Resumen

| Proveedor | Glifos cubiertos | Usos cubiertos | Glifos GAP | Usos GAP | Logos marca |
|---|---|---|---|---|---|
| Font Awesome | 153 | 1098 | 108 | 271 | 10 (21 usos) |
| Phosphor | 46 | 144 | 31 | 73 | 0 |
| **Total** | **199** | **1242** | **139** | **344** | 10 |

**Cobertura: 1242 de 1586 usos ya tienen equivalente propio (~78%).**

---

## GAP — iconos externos SIN equivalente propio (hay que dibujarlos)

Ordenados por numero de usos en el codigo (los de arriba mueven mas UI). Estos son los que Vera/el equipo debe **dibujar en Figma** (frame `53:24`) y exportar a `recursos/icons/` antes de poder reemplazarlos.

### Font Awesome — GAPs

| Icono externo | Usos | Sugerencia de nombre custom |
|---|---|---|
| `fa-chevron-down` | 21 | `chevron-down` |
| `fa-play` | 15 | `play` |
| `fa-paperclip` | 15 | `paperclip` |
| `fa-circle` | 15 | `circle` |
| `fa-fire` | 9 | `fire` |
| `fa-bars` | 9 | `bars` |
| `fa-globe` | 8 | `globe` |
| `fa-bookmark` | 7 | `bookmark` |
| `fa-music` | 5 | `music` |
| `fa-inbox` | 5 | `inbox` |
| `fa-eye` | 5 | `eye` |
| `fa-user-slash` | 4 | `user-slash` |
| `fa-th-large` | 4 | `th-large` |
| `fa-sign-out-alt` | 4 | `sign-out-alt` |
| `fa-moon` | 4 | `moon` |
| `fa-expand-alt` | 4 | `expand-alt` |
| `fa-eraser` | 4 | `eraser` |
| `fa-chevron-up` | 4 | `chevron-up` |
| `fa-plug` | 3 | `plug` |
| `fa-pause-circle` | 3 | `pause-circle` |
| `fa-pause` | 3 | `pause` |
| `fa-hourglass-half` | 3 | `hourglass-half` |
| `fa-circle-pause` | 3 | `circle-pause` |
| `fa-circle-half-stroke` | 3 | `circle-half-stroke` |
| `fa-camera` | 3 | `camera` |
| `fa-align-left` | 3 | `align-left` |
| `fa-volume-up` | 2 | `volume-up` |
| `fa-up-right-and-down-left-from-center` | 2 | `up-right-and-down-left-from-center` |
| `fa-th` | 2 | `th` |
| `fa-receipt` | 2 | `receipt` |
| `fa-quote-left` | 2 | `quote-left` |
| `fa-puzzle-piece` | 2 | `puzzle-piece` |
| `fa-minus` | 2 | `minus` |
| `fa-laptop` | 2 | `laptop` |
| `fa-gift` | 2 | `gift` |
| `fa-gem` | 2 | `gem` |
| `fa-flask` | 2 | `flask` |
| `fa-cut` | 2 | `cut` |
| `fa-crown` | 2 | `crown` |
| `fa-crop-simple` | 2 | `crop-simple` |
| `fa-credit-card` | 2 | `credit-card` |
| `fa-concierge-bell` | 2 | `concierge-bell` |
| `fa-code-compare` | 2 | `code-compare` |
| `fa-circle-dot` | 2 | `circle-dot` |
| `fa-chart-simple` | 2 | `chart-simple` |
| `fa-chart-column` | 2 | `chart-column` |
| `fa-caret-down` | 2 | `caret-down` |
| `fa-border-all` | 2 | `border-all` |
| `fa-arrows-up-down-left-right` | 2 | `arrows-up-down-left-right` |
| `fa-wine-glass` | 1 | `wine-glass` |
| `fa-wind` | 1 | `wind` |
| `fa-water` | 1 | `water` |
| `fa-volume-xmark` | 1 | `volume-xmark` |
| `fa-utensils` | 1 | `utensils` |
| `fa-user-secret` | 1 | `user-secret` |
| `fa-user-clock` | 1 | `user-clock` |
| `fa-undo` | 1 | `undo` |
| `fa-thumbtack` | 1 | `thumbtack` |
| `fa-temperature-three-quarters` | 1 | `temperature-three-quarters` |
| `fa-sun` | 1 | `sun` |
| `fa-stop-circle` | 1 | `stop-circle` |
| `fa-steps` | 1 | `steps` |
| `fa-square` | 1 | `square` |
| `fa-spray-can` | 1 | `spray-can` |
| `fa-spider` | 1 | `spider` |
| `fa-spa` | 1 | `spa` |
| `fa-snowflake` | 1 | `snowflake` |
| `fa-skull-crossbones` | 1 | `skull-crossbones` |
| `fa-shoe-prints` | 1 | `shoe-prints` |
| `fa-shirt` | 1 | `shirt` |
| `fa-shapes` | 1 | `shapes` |
| `fa-scissors` | 1 | `scissors` |
| `fa-route` | 1 | `route` |
| `fa-reply` | 1 | `reply` |
| `fa-play-circle` | 1 | `play-circle` |
| `fa-pills` | 1 | `pills` |
| `fa-mountain-sun` | 1 | `mountain-sun` |
| `fa-mobile-screen-button` | 1 | `mobile-screen-button` |
| `fa-mobile-screen` | 1 | `mobile-screen` |
| `fa-microphone` | 1 | `microphone` |
| `fa-list` | 1 | `list` |
| `fa-key` | 1 | `key` |
| `fa-hourglass-start` | 1 | `hourglass-start` |
| `fa-helicopter` | 1 | `helicopter` |
| `fa-handshake` | 1 | `handshake` |
| `fa-glass-water` | 1 | `glass-water` |
| `fa-font` | 1 | `font` |
| `fa-flag` | 1 | `flag` |
| `fa-fire-flame-curved` | 1 | `fire-flame-curved` |
| `fa-fingerprint` | 1 | `fingerprint` |
| `fa-file-invoice-dollar` | 1 | `file-invoice-dollar` |
| `fa-file-audio` | 1 | `file-audio` |
| `fa-down-left-and-up-right-to-center` | 1 | `down-left-and-up-right-to-center` |
| `fa-crop` | 1 | `crop` |
| `fa-cookie` | 1 | `cookie` |
| `fa-compress` | 1 | `compress` |
| `fa-compass` | 1 | `compass` |
| `fa-cloud` | 1 | `cloud` |
| `fa-circle-radiation` | 1 | `circle-radiation` |
| `fa-circle-minus` | 1 | `circle-minus` |
| `fa-chart-pie` | 1 | `chart-pie` |
| `fa-camera-retro` | 1 | `camera-retro` |
| `fa-bug` | 1 | `bug` |
| `fa-broom` | 1 | `broom` |
| `fa-ban` | 1 | `ban` |
| `fa-arrow-right-to-bracket` | 1 | `arrow-right-to-bracket` |
| `fa-archive` | 1 | `archive` |
| `fa-ad` | 1 | `ad` |

### Phosphor — GAPs

| Icono externo | Usos | Sugerencia de nombre custom |
|---|---|---|
| `ph-play` | 12 | `play` |
| `ph-caret-down` | 7 | `caret-down` |
| `ph-textbox` | 4 | `textbox` |
| `ph-caret-up` | 4 | `caret-up` |
| `ph-cardholder` | 4 | `cardholder` |
| `ph-squares-four` | 3 | `squares-four` |
| `ph-overlay` | 3 | `overlay` |
| `ph-hand-pointing` | 3 | `hand-pointing` |
| `ph-globe` | 3 | `globe` |
| `ph-list-bullets` | 2 | `list-bullets` |
| `ph-flask` | 2 | `flask` |
| `ph-dragging` | 2 | `dragging` |
| `ph-disconnect` | 2 | `disconnect` |
| `ph-cursor-click` | 2 | `cursor-click` |
| `ph-connection` | 2 | `connection` |
| `ph-cloud` | 2 | `cloud` |
| `ph-arrow` | 2 | `arrow` |
| `ph-webhooks-logo` | 1 | `webhooks-logo` |
| `ph-rows` | 1 | `rows` |
| `ph-path-action` | 1 | `path-action` |
| `ph-path--preview` | 1 | `path--preview` |
| `ph-monitor-play` | 1 | `monitor-play` |
| `ph-hand` | 1 | `hand` |
| `ph-git-branch` | 1 | `git-branch` |
| `ph-eraser` | 1 | `eraser` |
| `ph-download` | 1 | `download` |
| `ph-arrows-out` | 1 | `arrows-out` |
| `ph-arrow-square-out` | 1 | `arrow-square-out` |
| `ph-arrow-head` | 1 | `arrow-head` |
| `ph-arrow-clockwise` | 1 | `arrow-clockwise` |
| `ph-arrow-bend-up-right` | 1 | `arrow-bend-up-right` |

---

## CUBIERTO — mapa de reemplazo (externo → custom que YA existe)

Estos se pueden migrar sin dibujar nada: cambiar el `<i class="fa-... fa-X">` / `<i class="ph ph-X">` por el SVG custom de la derecha.

### Font Awesome → custom

| Icono externo | Usos | → Custom (`recursos/icons/`) |
|---|---|---|
| `fa-plus` | 50 | `add.svg` |
| `fa-times` | 49 | `close.svg` |
| `fa-check` | 47 | `check.svg` |
| `fa-image` | 40 | `image.svg` |
| `fa-arrow-right` | 39 | `arrow-right.svg` |
| `fa-spinner` | 32 | `loader.svg` |
| `fa-trash` | 28 | `delete.svg` |
| `fa-wand-magic-sparkles` | 25 | `sparkle.svg` |
| `fa-triangle-exclamation` | 25 | `alert-warning.svg` |
| `fa-bolt` | 25 | `zap.svg` |
| `fa-box` | 22 | `product.svg` |
| `fa-users` | 21 | `audience.svg` |
| `fa-circle-notch` | 20 | `loader.svg` |
| `fa-link` | 19 | `link.svg` |
| `fa-chevron-right` | 19 | `chevron-right.svg` |
| `fa-layer-group` | 18 | `layers.svg` |
| `fa-arrow-left` | 18 | `arrow-left.svg` |
| `fa-bullhorn` | 17 | `campaign.svg` |
| `fa-heart` | 16 | `likes.svg` |
| `fa-file` | 15 | `document.svg` |
| `fa-file-lines` | 14 | `document.svg` |
| `fa-diagram-project` | 13 | `flows.svg` |
| `fa-copy` | 13 | `copy.svg` |
| `fa-circle-check` | 13 | `check.svg` |
| `fa-circle-info` | 12 | `alert-info.svg` |
| `fa-bullseye` | 11 | `goal.svg` |
| `fa-hashtag` | 10 | `tag.svg` |
| `fa-chart-line` | 10 | `growth.svg` |
| `fa-video` | 9 | `video.svg` |
| `fa-tag` | 9 | `tag.svg` |
| `fa-star` | 9 | `star.svg` |
| `fa-robot` | 9 | `bot.svg` |
| `fa-pen` | 9 | `edit.svg` |
| `fa-map-pin` | 9 | `Places.svg` |
| `fa-external-link-alt` | 9 | `external-link.svg` |
| `fa-download` | 9 | `dowload.svg` |
| `fa-store` | 8 | `store.svg` |
| `fa-save` | 8 | `save.svg` |
| `fa-magic` | 8 | `sparkle.svg` |
| `fa-clock` | 8 | `clock.svg` |
| `fa-chevron-left` | 8 | `chevron-left.svg` |
| `fa-arrows-rotate` | 8 | `refresh.svg` |
| `fa-user` | 7 | `audience.svg` |
| `fa-masks-theater` | 7 | `Characters.svg` |
| `fa-file-alt` | 7 | `document.svg` |
| `fa-exclamation-triangle` | 7 | `alert-warning.svg` |
| `fa-cube` | 7 | `product.svg` |
| `fa-coins` | 7 | `credits.svg` |
| `fa-arrow-up-right-from-square` | 7 | `external-link.svg` |
| `fa-user-plus` | 6 | `user registration.svg` |
| `fa-trash-alt` | 6 | `delete.svg` |
| `fa-magnifying-glass` | 6 | `search.svg` |
| `fa-magic-wand-sparkles` | 6 | `sparkle.svg` |
| `fa-lightbulb` | 6 | `idea.svg` |
| `fa-film` | 6 | `film.svg` |
| `fa-edit` | 6 | `edit.svg` |
| `fa-building` | 6 | `organization.svg` |
| `fa-photo-film` | 5 | `image.svg` |
| `fa-object-group` | 5 | `layers.svg` |
| `fa-note-sticky` | 5 | `brief.svg` |
| `fa-lock` | 5 | `lock.svg` |
| `fa-info-circle` | 5 | `alert-info.svg` |
| `fa-folder-open` | 5 | `folder.svg` |
| `fa-file-pdf` | 5 | `document.svg` |
| `fa-code` | 5 | `coding.svg` |
| `fa-clock-rotate-left` | 5 | `history.svg` |
| `fa-check-circle` | 5 | `check.svg` |
| `fa-bell` | 5 | `notification.svg` |
| `fa-arrow-up` | 5 | `arrow-up.svg` |
| `fa-upload` | 4 | `upload.svg` |
| `fa-project-diagram` | 4 | `flows.svg` |
| `fa-pen-to-square` | 4 | `edit.svg` |
| `fa-palette` | 4 | `palette.svg` |
| `fa-paintbrush` | 4 | `palette.svg` |
| `fa-map-marker-alt` | 4 | `Places.svg` |
| `fa-folder` | 4 | `folder.svg` |
| `fa-database` | 4 | `database.svg` |
| `fa-clipboard` | 4 | `copy.svg` |
| `fa-circle-nodes` | 4 | `flows.svg` |
| `fa-cart-plus` | 4 | `cart.svg` |
| `fa-calendar-alt` | 4 | `calendar.svg` |
| `fa-briefcase` | 4 | `brief.svg` |
| `fa-brain` | 4 | `memory.svg` |
| `fa-book` | 4 | `book.svg` |
| `fa-xmark` | 3 | `close.svg` |
| `fa-terminal` | 3 | `consola-desarrollador.svg` |
| `fa-tags` | 3 | `tag.svg` |
| `fa-sliders` | 3 | `filter.svg` |
| `fa-rocket` | 3 | `growth.svg` |
| `fa-paper-plane` | 3 | `send.svg` |
| `fa-list-check` | 3 | `task.svg` |
| `fa-file-word` | 3 | `document.svg` |
| `fa-file-excel` | 3 | `document.svg` |
| `fa-file-circle-plus` | 3 | `document.svg` |
| `fa-eye-slash` | 3 | `eye-off.svg` |
| `fa-droplet` | 3 | `palette.svg` |
| `fa-bag-shopping` | 3 | `cart.svg` |
| `fa-wand-magic` | 2 | `sparkle.svg` |
| `fa-users-gear` | 2 | `audience.svg` |
| `fa-tools` | 2 | `settings.svg` |
| `fa-sync-alt` | 2 | `refresh.svg` |
| `fa-sliders-h` | 2 | `filter.svg` |
| `fa-shield-halved` | 2 | `shield.svg` |
| `fa-search` | 2 | `search.svg` |
| `fa-rotate-right` | 2 | `refresh.svg` |
| `fa-rotate-left` | 2 | `refresh.svg` |
| `fa-retweet` | 2 | `refresh.svg` |
| `fa-pen-nib` | 2 | `edit.svg` |
| `fa-life-ring` | 2 | `help.svg` |
| `fa-images` | 2 | `gallery.svg` |
| `fa-heart-pulse` | 2 | `monitoring.svg` |
| `fa-file-csv` | 2 | `document.svg` |
| `fa-file-code` | 2 | `document.svg` |
| `fa-envelope` | 2 | `mail.svg` |
| `fa-comment` | 2 | `comments.svg` |
| `fa-circle-xmark` | 2 | `close.svg` |
| `fa-cart-shopping` | 2 | `cart.svg` |
| `fa-building-user` | 2 | `organization.svg` |
| `fa-box-open` | 2 | `product.svg` |
| `fa-binoculars` | 2 | `monitoring.svg` |
| `fa-at` | 2 | `mail.svg` |
| `fa-arrow-down` | 2 | `arrow-down.svg` |
| `fa-user-group` | 1 | `audience.svg` |
| `fa-times-circle` | 1 | `close.svg` |
| `fa-sort` | 1 | `sort.svg` |
| `fa-sitemap` | 1 | `flows.svg` |
| `fa-signal` | 1 | `monitoring.svg` |
| `fa-shield-alt` | 1 | `shield.svg` |
| `fa-screwdriver-wrench` | 1 | `settings.svg` |
| `fa-satellite-dish` | 1 | `monitoring.svg` |
| `fa-pen-fancy` | 1 | `edit.svg` |
| `fa-paste` | 1 | `copy.svg` |
| `fa-newspaper` | 1 | `feed.svg` |
| `fa-magnifying-glass-dollar` | 1 | `search.svg` |
| `fa-location-dot` | 1 | `Places.svg` |
| `fa-hand` | 1 | `help.svg` |
| `fa-gauge-high` | 1 | `dashboard.svg` |
| `fa-gauge` | 1 | `dashboard.svg` |
| `fa-filter-circle-xmark` | 1 | `filter.svg` |
| `fa-file-video` | 1 | `video.svg` |
| `fa-file-powerpoint` | 1 | `document.svg` |
| `fa-file-image` | 1 | `image.svg` |
| `fa-exchange-alt` | 1 | `refresh.svg` |
| `fa-envelope-open-text` | 1 | `mail.svg` |
| `fa-crosshairs` | 1 | `goal.svg` |
| `fa-comment-dots` | 1 | `comments.svg` |
| `fa-cogs` | 1 | `settings.svg` |
| `fa-cloud-upload-alt` | 1 | `upload.svg` |
| `fa-clone` | 1 | `copy.svg` |
| `fa-calendar-day` | 1 | `calendar.svg` |
| `fa-book-open` | 1 | `book.svg` |
| `fa-arrows-spin` | 1 | `refresh.svg` |
| `fa-arrow-trend-up` | 1 | `growth.svg` |

### Phosphor → custom

| Icono externo | Usos | → Custom (`recursos/icons/`) |
|---|---|---|
| `ph-x` | 11 | `close.svg` |
| `ph-warning` | 10 | `alert-warning.svg` |
| `ph-trash` | 9 | `delete.svg` |
| `ph-plus` | 9 | `add.svg` |
| `ph-spinner` | 7 | `loader.svg` |
| `ph-image` | 7 | `image.svg` |
| `ph-copy` | 7 | `copy.svg` |
| `ph-magnifying-glass` | 5 | `search.svg` |
| `ph-check-circle` | 5 | `check.svg` |
| `ph-sparkle` | 4 | `sparkle.svg` |
| `ph-floppy-disk` | 4 | `save.svg` |
| `ph-timer` | 3 | `clock.svg` |
| `ph-info` | 3 | `alert-info.svg` |
| `ph-heartbeat` | 3 | `monitoring.svg` |
| `ph-clock-counter-clockwise` | 3 | `history.svg` |
| `ph-check` | 3 | `check.svg` |
| `ph-arrows-clockwise` | 3 | `refresh.svg` |
| `ph-arrow-counter-clockwise` | 3 | `refresh.svg` |
| `ph-x-circle` | 2 | `close.svg` |
| `ph-wrench` | 2 | `settings.svg` |
| `ph-upload-simple` | 2 | `upload.svg` |
| `ph-tree-structure` | 2 | `flows.svg` |
| `ph-stack` | 2 | `layers.svg` |
| `ph-sliders-horizontal` | 2 | `filter.svg` |
| `ph-sliders` | 2 | `filter.svg` |
| `ph-question` | 2 | `help.svg` |
| `ph-pencil` | 2 | `edit.svg` |
| `ph-path` | 2 | `flows.svg` |
| `ph-note` | 2 | `brief.svg` |
| `ph-gear` | 2 | `settings.svg` |
| `ph-folder-simple` | 2 | `folder.svg` |
| `ph-dots-six-vertical` | 2 | `more.svg` |
| `ph-code` | 2 | `coding.svg` |
| `ph-clock` | 2 | `clock.svg` |
| `ph-brackets-curly` | 2 | `coding.svg` |
| `ph-warning-circle` | 1 | `alert-warning.svg` |
| `ph-terminal` | 1 | `consola-desarrollador.svg` |
| `ph-robot` | 1 | `bot.svg` |
| `ph-plus-circle` | 1 | `add.svg` |
| `ph-pencil-simple` | 1 | `edit.svg` |
| `ph-palette` | 1 | `palette.svg` |
| `ph-magic-wand` | 1 | `sparkle.svg` |
| `ph-link` | 1 | `link.svg` |
| `ph-caret-right` | 1 | `chevron-right.svg` |
| `ph-caret-left` | 1 | `chevron-left.svg` |
| `ph-arrow-right` | 1 | `arrow-right.svg` |

---

## Logos de marca (pista aparte — `recursos/logos/`)

No son iconos UI monoline; son marcas de terceros. Van a `recursos/logos/` (ya existe `plataformas/` con varios).

| Marca (FA brands) | Usos |
|---|---|
| `fa-x-twitter` | 4 |
| `fa-facebook` | 4 |
| `fa-tiktok` | 3 |
| `fa-instagram` | 3 |
| `fa-youtube` | 2 |
| `fa-shopify` | 1 |
| `fa-meta` | 1 |
| `fa-linkedin-in` | 1 |
| `fa-linkedin` | 1 |
| `fa-google` | 1 |

---

## Ignorados (falsos positivos — NO son iconos)

`fa-error`, `fa-subset`, `fa-status--on`, `fa-status--off`, `fa-qr-wrap`, `fa-policy-hint`, `fa-policy`, `fa-personal`, `fa-chevron-`, `ph-prop-type`, `ph-prop-sep`, `ph-path-hit`
