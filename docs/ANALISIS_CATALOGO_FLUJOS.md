# Análisis: Catálogo de flujos y vistas existentes

## 1. Schema relevante

### `content_categories` (schema.sql 197-203)
- **Uso:** Organizar flujos por categoría y tipo de producción.
- **Campos:** `id`, `name`, `description`, `order_index`.
- **Relación:** `content_flows.category_id` → `content_categories.id`.

### `content_flows`
- **output_type** (NOT NULL): tipo de salida del flujo. En **DevBuilderView** se ofrecen: `text`, `image`, `video`, `audio`, `document`, `mixed`.
- **category_id** (FK a content_categories): categoría asignada al flujo.

---

## 2. Vistas que ya usan flujos y categorías

### 2.1 DevFlowsView (`/dev/flows`, `/dev/flows/:flowId`)
- **Propósito:** Gestión de flujos para **desarrolladores** (solo flujos donde `owner_id = userId`).
- **Qué hace:** Lista “Mis Flujos de IA”, filtros por estado (Todos, Borradores, En Pruebas, Publicados), búsqueda, grid de cards.
- **Categorías:** Hace `select` con `content_categories (name)` y muestra en cada card `flow.content_categories?.name || flow.output_type`.
- **Conclusión:** Es vista de **autor/desarrollador**, no de consumidor. No sirve como catálogo para quien solo “usa” flujos.

### 2.2 DevBuilderView (`/dev/builder`, `/dev/builder/:flowId`)
- **Propósito:** Crear y editar `content_flows` (input_schema, ui_layout_config, etc.).
- **Categorías:** Carga `content_categories` y tiene un `<select id="flowCategory">` para asignar categoría al flujo.
- **output_type:** Select con: Texto, Imagen, Video, Audio, Documento, Mixto (`text`, `image`, `video`, `audio`, `document`, `mixed`).
- **Conclusión:** Define categorías y tipo de salida; no es una vista de catálogo para el usuario final.

### 2.3 DevTestView (`/dev/test`, `/dev/test/:flowId`)
- **Propósito:** Probar y depurar flujos (webhooks test/prod).
- **Flujos:** Carga `content_flows` y un selector de flujo para pruebas.
- **Conclusión:** Herramienta de desarrollador, no catálogo de consumo.

### 2.4 DevWebhooksView (`/dev/webhooks`)
- **Propósito:** Gestionar webhooks de los flujos del desarrollador.
- **Conclusión:** No es catálogo.

### 2.5 StudioView (`/studio`, `/org/:orgId/studio`)
- **Propósito:** Vista **consumidor**: usar flujos para producir contenido.
- **Comportamiento actual:** Carga todos los `content_flows` activos y los muestra en el **sidebar derecho** como lista de cards; al elegir uno se muestra el formulario según `input_schema` y el botón “Producir”.
- **Problema:** La selección del flujo ocurre en el mismo sidebar que el editor (input_schema). No hay un “catálogo” previo separado por tipo (video vs imagen).

---

## 3. ContentView (`/content`, `/org/:orgId/content`)

- **Template:** `content.html` — “Biblioteca de Contenido” con filtros (marca, producto, campaña, formato) y grid.
- **JS:** `ContentView.js` — `renderContentList()` y `renderContentDetail()` están en stub (solo `console.log`). La vista está pensada para listar/detalle de **contenido generado** (outputs), no para listar flujos.
- **Conclusión:** No es catálogo de flujos; es biblioteca de piezas de contenido. No usa `content_flows` ni `content_categories` para un catálogo.

---

## 4. Resumen: qué existe y qué no

| Elemento | ¿Existe? | Dónde / Notas |
|----------|----------|----------------|
| **content_categories** | Sí | Schema; usado en DevBuilderView (asignar categoría) y DevFlowsView (mostrar nombre en card). |
| **output_type en content_flows** | Sí | text, image, video, audio, document, mixed (DevBuilderView). |
| **Vista “Mis Flujos” (desarrollador)** | Sí | DevFlowsView: lista flujos del usuario por estado, muestra categoría. |
| **Vista “Catálogo de flujos” (consumidor)** | **No** | No hay una vista que liste flujos para el consumidor agrupados por video / imagen (o por categoría). |
| **Selección de flujo en Studio** | Sí, pero en sidebar | Studio muestra la lista de flujos en el sidebar derecho junto al formulario input_schema. |
| **Biblioteca de contenido** | Parcial | ContentView existe pero es para contenido generado; no es catálogo de flujos. |

---

## 5. Conclusión y recomendación

- **No existe** una vista específica de “catálogo de flujos” para el usuario consumidor que organice flujos por tipo de producción (p. ej. “Flujos que producen video” y “Flujos que producen imagen”) ni por `content_categories`.
- **Sí existe** la estructura de datos: `content_categories` y `content_flows.output_type` / `content_flows.category_id` están listos para soportar ese catálogo.
- **Propuesta:** Añadir un **catálogo de flujos** (nueva vista o primera pantalla de Studio) que:
  1. Cargue flujos activos/publicados (sin filtrar por `owner_id`, para que el consumidor vea todos los disponibles).
  2. Los agrupe por **output_type** (al menos: video vs imagen; opcionalmente texto, audio, etc.) y/o por **content_categories**.
  3. Permita **elegir un flujo**; al elegirlo, ir a Studio con ese flujo ya seleccionado, de modo que el **sidebar editor creativo** solo muestre el formulario de `input_schema` (sin lista de flujos).

Cuando quieras, el siguiente paso puede ser definir la ruta y el diseño de esa vista (por ejemplo `/studio/catalog` o paso previo dentro de `/studio`) y luego implementarla.
