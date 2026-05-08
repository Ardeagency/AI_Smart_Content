---
id: FEAT-017
title: Content Feed — reescribir ContentView como feed unificado de contenido scrapeado
severity: high
type: feature
status: in_progress
auto_eligible: no
auto_eligible_reason: requiere validación visual + diseño de RPC + decisiones UX
est_duration: long
created: 2026-05-08
target_delivery: 2026-05-12
owner: -
related:
  - SPRINT-FRONTEND-100 (D8 originalmente Activity Timeline; pivote a Content)
  - reference: /Users/ardeagency/Documents/Clientes Arde/SECRETARIA DE MEDELLIN/(proyecto partner)/IA_Partner
---

# FEAT-017 · Content Feed unificado

> **Pivote:** la página `/activity` (shell del sprint D8) se reemplaza por una nueva
> función para `ContentView` (`/content`). Activity como timeline operacional queda
> postergado; Content como feed de scraping pasa al frente.

## 1. Contexto

Hoy el usuario debe entrar página por página (Monitoring, Dashboard de
Competencia, Estrategia) para ver lo que el ai-engine ha scrapeado. La idea es
**una sola página** estilo Instagram que consolide TODO el contenido recolectado
de competidores y URLs/eventos monitoreados. El usuario NO necesita ver su
propio contenido (lo ve en sus redes); le interesa lo que sus competidores
publican y lo que el sistema captura externamente.

Referencia visual y arquitectónica: el feed `actividad.html` + `feed.js` +
`filter-controls.js` del proyecto **IA_Partner** (Secretaría de Medellín).
Mismo patrón: 1 RPC paginada + cards estilo Instagram + filtros con date picker.

## 2. Decisiones tomadas (sesión 2026-05-08)

| Decisión | Valor |
|---|---|
| Naming | Reusar `ContentView` y la ruta `/content` (la actual es zombie con `console.log`). |
| Fuentes | Posts de competidores + ads de competencia + signals de scraping. **No** posts propios (el usuario los ve en sus redes). |
| Backend | Definir RPC `get_paginated_content_feed` antes de tocar el frontend. |
| Activity Timeline | Pausado. La ruta `/activity` queda como shell hasta que retomemos D8. |

## 3. Alcance

### 3.1 Limpieza previa (DONE en este sprint)

- [x] Sidebar: item "Content" agregado en sección "Create" de `Navigation.js`.
- [x] Eliminar `js/views/HogarView.js` (zombie de 634 líneas, nunca instanciado).
- [x] Limpiar comentarios huérfanos que mencionaban HogarView (`brand-colors.js`, `BrandstorageView.js`, `BrandOrganizationView.js`).

### 3.2 Backend — RPC `get_paginated_content_feed`

```sql
get_paginated_content_feed(
  p_org_id uuid,
  p_entity_ids uuid[]    DEFAULT NULL,  -- filtro multi-select de competidores; null = todos
  p_date_from timestamptz,
  p_date_to   timestamptz,
  p_limit int            DEFAULT 50,
  p_offset int           DEFAULT 0,     -- TODO evaluar cursor por timestamp+id
  p_include_ads boolean  DEFAULT true,
  p_include_signals boolean DEFAULT true
) RETURNS TABLE (
  source_type      text,            -- 'brand_post' | 'competitor_ad' | 'intel_signal'
  id               uuid,
  entity_id        uuid,
  profile_name     text,
  network          text,             -- 'meta' | 'instagram' | 'twitter' | 'tiktok' | 'youtube' | 'web'
  is_competitor    boolean,
  patrocinado      boolean,          -- true para competitor_ad
  fecha            timestamptz,      -- captured_at o first_seen_at
  contenido        text,             -- content / copy_text / content_text
  url_publicacion  text,
  url_medios       text,             -- thumbnail
  media_assets     jsonb,            -- {video_url, image_urls[], tipo}
  metrics          jsonb,            -- {likes, comments, shares, views, plays}
  total_engagement bigint,
  hashtags         text[],
  menciones        text[],
  topics           text[],
  flags            text[],
  sentiment        text,
  tone             text,
  locacion         text,
  ai_analysis      jsonb
)
```

**Fuentes que une (UNION ALL):**

1. `brand_posts WHERE brand_container_id ∈ {org} AND (is_competitor = true OR post_source = 'competitor')` — el cuerpo principal.
2. `competitor_ads WHERE organization_id = p_org_id` — opcional según `p_include_ads`.
3. `intelligence_signals WHERE entity_id IN (entity_ids of org)` — opcional según `p_include_signals`. ⚠️ Nota: `intelligence_signals` NO tiene `organization_id`; resolver `entity_ids` desde `intelligence_entities WHERE organization_id = p_org_id`.

**Orden:** `fecha DESC NULLS LAST`. **LIMIT/OFFSET** server-side.

### 3.3 Frontend — reescribir `ContentView`

**Estructura adaptada del patrón IA_Partner:**

- **Header:** título "Content" + count + selector de rango "últimos 30 días" abre `<DatePickerModal>`.
- **Feed:** lista vertical de cards. Cada card:
  - Avatar (inicial del autor) + nombre + verificado + badge PATROCINADO si aplica
  - Plataforma (icono fa-brands) + fecha relativa
  - Texto del contenido (limpiado de URLs trailing)
  - Media: thumbnail primero (`url_medios`), luego carga progresiva del video o carousel real
  - Métricas: likes / comments / shares / views / plays con iconos
  - Hashtags · Menciones · Topics · Flags · Sentiment · Tone · Location
  - Link externo al post original
- **FAB de filtros** (esquina inferior derecha): abre panel deslizante con
  - Multi-select de competidores (de `intelligence_entities` con `is_owned = false`)
  - Toggle "Incluir ads" / "Incluir signals"
  - Date picker con presets (hoy, 7d, 30d, 90d, custom)

**Stack técnico:**
- Mantener vanilla JS + el patrón `BaseView` actual.
- 1 servicio nuevo `js/services/ContentFeedService.js` (siguiendo patrón `MiBrandaDataService`): `init(supabase, orgId)`, `loadFeed({entityIds, dateRange, limit, offset, includeAds, includeSignals})`, `loadEntities()` (para filtros).
- CSS nuevo en `css/modules/content-feed.css`.

### 3.4 Cleanup post-implementación

- [ ] Quitar el mapeo legacy `'/content': 'IDENTITY'` en `Navigation.js:1644` (ya no aplica con el nuevo Content).
- [ ] Fix bug `Navigation.js:69`: el item "Production" tiene `id: 'activity'` duplicado con el item Activity real (línea 56). Cambiar a `id: 'production'`.

## 4. Plan en bloques

| Bloque | Trabajo | Duración estimada |
|---|---|---|
| **A** | Limpieza zombies + ticket (este turno) | 30 min |
| **B** | Diseño + aplicación RPC `get_paginated_content_feed` | 60-90 min |
| **C** | Service `ContentFeedService` + reescritura `ContentView` HTML/render | 90-120 min |
| **D** | Filtros (FAB + date picker + multi-select) | 60 min |
| **E** | Carga progresiva media (thumbnail → video/carousel) | 30-45 min |
| **F** | Cleanup `'/content': 'IDENTITY'` + fix bug duplicate id | 15 min |
| **G** | Smoke test end-to-end con datos reales (IGNIS) | 30 min |

**Total estimado:** 5-7 horas distribuidas en sesiones.

## 5. Definition of Done

1. ✅ `ContentView` muestra ≥ 1 publicación real cuando hay datos en `brand_posts` con `is_competitor = true`.
2. ✅ FAB abre panel; multi-select de competidores filtra el feed.
3. ✅ Date picker cambia el rango y refresca.
4. ✅ Cards renderizan thumbnail primero y reemplazan con video/carousel cuando carga.
5. ✅ Toggle "Incluir ads" hace aparecer/desaparecer cards con badge PATROCINADO.
6. ✅ Performance: feed inicial < 1.5s en 4G con 50 items.
7. ✅ 0 errores en consola del browser.
8. ✅ Smoke test con IGNIS pasa.

## 6. Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| `brand_posts` con `is_competitor=true` está vacío para IGNIS | Media | Usar otra org con datos o validar con seed manual antes de E2E. |
| `intelligence_signals` mezcla tipos (crisis, mention, ad, etc.) — no todos son "feed-shaped" | Alta | Filtrar `signal_type IN ('mention','social_post','content_capture','url_change')` en la RPC. Definir lista exacta al diseñar. |
| `competitor_ads` viene de Apify quota agotada → cero filas reales | Alta (memoria proyecto) | Tarjeta condicional "incluir ads" off por defecto si la query devuelve 0 ítems. |
| Carga progresiva de media falla por CORS de Meta CDN | Media | Fallback a thumbnail siempre visible (mismo patrón Partner). |

## 7. Bitácora

### 2026-05-08

- [x] **A** — Auditoría de zombies + cleanup (HogarView −634 líneas, comentarios huérfanos limpios) + ticket creado.
- [x] **B** — RPC `get_paginated_content_feed` diseñada y aplicada en Supabase prod vía Management API. Validada con 5 posts reales de Red Bull / Monster Energy en org Arde Agency: thumbnails JPG correctos, `has_video` detectado, hashtags/mentions parseados.
- [x] **C** — `ContentFeedService.js` creado (90 líneas) + `ContentView.js` reescrito completo (~520 líneas). Cards estilo Instagram con avatar, autor, plataforma, fecha relativa, texto, media, métricas (likes/comments/shares/views/plays), hashtags, menciones, sentiment, tone, location.
- [x] **D** — Filtros: FAB con badge contador + panel deslizante con presets de fecha (Hoy/7d/30d/90d), multi-select de entidades, toggles para incluir ads/signals.
- [x] **E** — Carga progresiva: thumbnail JPG visible primero, video reemplaza al `onloadedmetadata`. Fallback al thumbnail si falla.
- [x] **F** — Limpieza: `'/content': 'IDENTITY'` → `'CONTENT'`. Fix bug `Navigation.js:69` (Production tenía `id: 'activity'` duplicado → `id: 'production'`). Eliminada ruta vestigial `/content/:contentId` (la nueva ContentView no tiene vista de detalle propia, los items linkean al post original).
- [x] CSS nuevo `css/modules/content-feed.css` registrado en `bundle.css`.
- [x] Lazy loader `app.js` actualizado para cargar `ContentFeedService.js` antes de `ContentView.js`.
- [x] `node --check` pasa en los 4 archivos modificados/creados.
- [x] **Refinamiento Partner** (sesión 2 del 2026-05-08): análisis profundo del Activity de IA_Partner y portado de las 3 brechas críticas más fallback elegante y persistencia:
  - Carrusel multi-imagen con flechas + indicador 1/N (`_createCarouselHtml`, `_carouselStep`).
  - Video autoplay con IntersectionObserver (threshold 0.3, rootMargin 50px) — pause/play según viewport (`_attachMediaInteractions`).
  - Carga progresiva en 2 fases idéntica al patrón Partner: thumbnail visible inmediatamente, probe video oculto, reemplazo solo si `onloadedmetadata` (`_attemptLoadVideo`).
  - Fallback elegante "Ver en publicación original" con link al post si la imagen/video falla (CORS Meta CDN, links expirados) — reemplaza el broken icon.
  - localStorage de filtros entre sesiones (`_loadFiltersFromStorage` / `_saveFiltersToStorage`).
  - Custom range con `<input type="date">` HTML5 (sin flatpickr para evitar dependencia).
- [ ] **G** — Smoke test E2E visual en `aismartcontent.io/org/.../content` con la org Arde Agency (359 posts competidor + 357 signals esperados).

### Archivo SQL fuente

⚠️ La carpeta `SQL/` está en `.gitignore` por decisión del proyecto ("no exponer
estructura interna"). El archivo
`SQL/functions/content/get_paginated_content_feed.sql` queda en disco local
como referencia. La fuente de verdad es la RPC viva en Supabase prod.

---

_Última actualización: 2026-05-08 — Bloques A-F cerrados, falta validación visual G._
