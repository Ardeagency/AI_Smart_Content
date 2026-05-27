# FEAT-035 — Rediseño del Market de Flows (premium + Netflix + editorial)

**Fecha:** 2026-05-27
**Estado:** plan aprobado, ejecucion por fases
**Decisiones del usuario:**
- Alcance: TODO por fases (plan completo + ejecucion fase por fase con revision intermedia).
- Metrica de confianza en cards: **usos (`run_count`) + badge automatico Popular/Trending** por umbral. NO rating de estrellas (de momento).

---

## 1. Objetivo

Evolucionar el catalogo de Flows (`FlowCatalogView.js`) de su base actual "Netflix" a una sintesis de tres archetipos:

- **Marketplace premium** (Figma Community, Vercel/Linear templates, App Store Today): search-first, orden/filtro explicito, prueba social, detalle rico antes de ejecutar.
- **Netflix cinematografico** (ya parcialmente logrado): hero billboard, rails, hover-expand, modal takeover, rails algoritmicos.
- **Editorial minimalista** (Apple, Aesop, Stripe): whitespace, jerarquia tipografica de portada, restraint, storytelling en la pieza destacada.

**Regla de sintesis:** editorial arriba (hero + 1-2 destacados con direccion de arte), Netflix en el cuerpo (rails densos poster-forward), premium en los bordes (search + filtros + prueba social + detalle). Restraint transversal: paleta y efectos ya existentes (glass solo en botones, bg-card #141517, accent-warm), sin ruido nuevo.

**No reescribir.** La base es buena. Se añaden capas.

---

## 2. Estado actual (base, ya funciona)

- Hero carousel full-bleed + Ken Burns + dots con progress (Netflix). `flow-catalog.css:131-347`
- Mask fade-out que funde el hero con el fondo brand (editorial).
- Rails horizontales por categoria/subcategoria + flechas en hover. `flow-catalog.css:349-430`
- Cards poster 4:5, hover lift + zoom 1.04, gradient legibilidad, glass like/save. `flow-catalog.css:477-741`
- Badges Nuevo / Trending / Autopilot, chips de subcategoria, header de categoria con cover.
- Datos: `content_flows` (+ categories, subcategories), `user_flow_likes`, `org_flow_saves`, `flow_runs`. Cache SWR.
- Vista unica: `js/views/FlowCatalogView.js` (~1156 lineas).

---

## 3. Gaps (priorizados)

Criticos (marketplace): sin buscador, sin detalle/preview, sin orden/filtro explicito, prueba social no visible.
Importantes (Netflix premium): sin hover-expand, sin rails de personalizacion/Top 10, previews estaticos, sin colecciones.
Editoriales: tratamiento editorial debil, tipografia funcional no de portada, estado vacio que no enseña, loading spinner no skeleton.
Datos: sin `created_by` (autor), sin rating (decidido: usamos usos, no rating).

---

## 4. Fases

### Fase 1 — Editorial + premium visual (bajo riesgo, sin backend) ← EN CURSO
Solo CSS + render, sin schema nuevo. Usa datos ya existentes.
1. **Prueba social en card:** mostrar `run_count` formateado ("1.2k usos") en el meta de la card.
2. **Badge Popular/Trending automatico:** umbral sobre `run_count` (Popular) y sobre engagement reciente (Trending, ya existe la nocion top-20%). Definir umbrales en el render.
3. **Skeleton shimmer** con la forma de los rails (reemplaza el spinner `flow-catalog-loading`).
4. **Jerarquia tipografica editorial:** escala de display en titulos de seccion y category-block; refinar tracking/leading.
5. **Estado vacio que enseña** (reemplaza "PROXIMAMENTE" pelado): mensaje + sugerencia/CTA.
6. **Pieza destacada editorial** en home: el primer slide del hero o un bloque "Destacado" con copy narrativo y direccion de arte.

### Fase 2 — Detalle / preview modal (Netflix takeover + premium) ← HECHA (commit c81bae20)
- Modal takeover al hacer clic en una card: media hero (img/video) + scrim + badges + titulo, descripcion, output type, creditos, usos, CTA "Ejecutar" (con costo) + Guardar/Like. HECHO.
- Row de flows relacionados dentro del modal (misma subcategoria, fallback categoria); swap in-place al clickear. HECHO.
- Reemplaza el salto directo a StudioView (el CTA del modal navega via runFlow). HECHO.
- Deep-link `?flow=<id>` abre el modal y se limpia al cerrar. HECHO.
- Reusa `window.Modal.show` (focus-trap/ESC/portal/a11y) con scope `flow-detail-modal`. toggleLike/toggleSave ahora refrescan cards + modal por flowId.

### Fase 3 — Search + filtros + orden (marketplace) ← HECHA
- Buscador (nombre + descripcion, client-side sobre this.flows, debounce 160ms). HECHO.
- Dropdown de orden: Trending / Nuevos / Mas usados / A-Z. HECHO.
- Filtros por output_type y execution_mode. HECHO.
- Barra sticky superior (offset --app-header-height) con search + controles. HECHO.
- Al activar busqueda/filtro/orden: grid plana de resultados responsiva; sin actividad vuelve al browse editorial. Solo en home (categorias usan su subnav).
- Pendiente opcional: search server-side si el catalogo crece; search dentro de vista categoria.

### Fase 4 — Hover-expand card + previews en movimiento (firma Netflix) ← HECHA
- Card crece en hover: `scale(1.06)` + z-index 5 + sombra fuerte, con delay 140ms en el transform (expand con retardo). HECHO.
- Preview en movimiento: el video de la card ya NO autoplay; se reproduce solo en hover (play/pause + reset en mouseenter/leave) → mejor rendimiento con muchas cards. HECHO.
- Accion rapida "Ejecutar" (play blanco) en las acciones de la card → runFlow directo sin abrir el detalle. Guardar/Like ya existian; "Detalle" = clic en la card. HECHO.
- Rails con padding vertical extra (0.9/1.1rem) para que el scale no se recorte con overflow-y:hidden. Home grid (overflow visible) no recorta.
- Sin romper glass: solo transform/scale (ya se usaba), nada de content-visibility/isolation/contain.

### Fase 5 — Personalizacion + colecciones (premium + Netflix) ← PARCIAL
- Rails de personalizacion (client-side, sin schema): HECHO.
  - **Top 10** con numeracion gigante outline (Netflix), umbral >=3 flows.
  - **Porque usaste X**: semilla = ultimo run, flows afines (misma sub/cat). Solo si hay runs recientes.
  - **Recomendados para ti**: flows en las cat/subcat con las que el usuario interactuo (like/save/run). Solo si hay señales.
  - Se ocultan en modo busqueda/filtro; se rebindean los cards.
- Colecciones / bundles curados: **DIFERIDO**. Requiere schema (`flow_collections` + `flow_collection_items`), UI de admin para crearlas y contenido real (hoy 0 flows asignados, 3 demo). Sin eso las colecciones nacen vacias. Retomar cuando haya catalogo real + tooling de curaduria.
- `created_by` / curador en `content_flows`: DIFERIDO (atribucion), junto con colecciones.

---

## 5. Schema (solo fases tardias)
- Fase 1-4: cero cambios de schema (todo con columnas existentes).
- Fase 5: `flow_collections`, `flow_collection_items`; opcional `content_flows.created_by`.

## 6. Archivos
- `js/views/FlowCatalogView.js` — render de cards, rails, hero, (fase 2) modal, (fase 3) search.
- `css/modules/flow-catalog.css` — toda la capa visual.
- Posible `js/components/FlowDetailModal.js` (fase 2) si conviene extraer.

## 7. Riesgos
- `backdrop-filter` global se rompe con content-visibility/isolation/contain en ancestros (ya documentado en el CSS de `.flow-card`). Aplica a fase 4.
- Performance de rails con muchos flows: lazy-load de imagenes, no montar todo.
- No meter LLM en background (no aplica aqui, es UI pura).
