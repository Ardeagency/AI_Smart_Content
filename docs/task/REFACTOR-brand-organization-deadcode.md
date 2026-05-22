# REFACTOR: Brand Organization view — dead code y deuda

Detectado durante la auditoria del 2026-05-22 al profesionalizar `/brand-organization`. Hoy se atendio el split Identity/Assets + carrusel; queda pendiente podar codigo huerfano.

## Lote 1 — Cadena de entidades de marca (eliminacion 100% segura)

Resto del refactor `brand_containers` → `organizations`. Sin markup en `renderHTML()` ni invocacion desde `renderCards()`.

Eliminar en `js/views/BrandOrganizationView.js`:
- `renderBrandEntities()` (linea 864)
- `openAddPlaceModal()` (linea 914)
- `openAddEntityModal()` (linea 959)
- `submitCreateEntity()` (linea 987)
- `deleteEntity()` (linea 1009)
- Estado `brandEntities`, `brandPlaces`, `brandAudiences` (init + 3 reasignaciones a `[]`)
- Inserts a `brand_entities`/`brand_places` desde esta vista

~165 lineas.

## Lote 2 — Queries y estado nunca consumidos en `loadData`

Estado inicializado y cargado pero nunca leido en ningun render:
- `products` (query a `products`, lineas 387-397) — el propio comentario lo admite
- `organizationMembers` + `organizationCredits` + `creditUsage` (lineas 463-499) — 3 queries
- `brandIntegrations` + `brandCampaigns` (lineas 430-441) — cargados pero no pintados
- `brandRules`, `brandSocialLinks` — solo init

Adicional: reducir el `select` de `brand_containers` (linea 421-424) a `select('id, nombre_marca')` — del resto solo se consume `length`.

Ahorro: ~6 queries por entrada a la pagina + payload.

## Lote 3 — Bindings huerfanos en `InfoPanel.mixin.js`

`renderBrandSchemaAsideHtml` solo emite `data-editor-type="text"` y `data-editor-type="textarea"` para los 4 campos reales de `organizations`. Pero `setupInfoBrandFieldEditors` tiene loops para markup que esta vista nunca genera:

Eliminar en `js/views/brand-organization/InfoPanel.mixin.js`:
- Loop `[data-editor-type="json"]` (lineas 438-472)
- Loop `.info-brand-array-editor` (lineas 474-478)
- Loop `.info-brand-select` (lineas 480-482)
- `_bindInfoBrandNichoSelect()` completo (lineas 488-555) — `nicho_core` no se rendera nunca aqui
- `_normalizeBrandFieldForDb()` (lineas 379-411) — sin caller, `saveBrandField` guarda directo

Eliminar en `js/views/BrandOrganizationView.js`:
- 4 static getters `BRAND_SCHEMA_BLOCKS`, `BRAND_ARRAY_FIELDS`, `BRAND_JSON_FIELDS`, `BRAND_TEXT_FIELDS`, `BRAND_TEXTAREA_FIELDS` (lineas 580-584) — apuntan a campos de `brand_containers` que NO existen en `organizations` (`sub_nichos`, `verbal_dna`, `propuesta_valor`, etc.). Solo alimentan el `_normalizeBrandFieldForDb` muerto.
- Branch `if (fieldName === 'mercado_objetivo') { /* no columna */ }` en `saveContainerField` (linea 1278)

Mantener `NICHO_CORE_OPTIONS` / `getNichoCoreLabel` si se planea reactivar nicho.

~180 lineas.

## CSS residual

`css/modules/brands.css` tiene reglas para selectors que esta vista no usa:
- `#infoPanelContent .info-brand-select*` (lineas 2024-2148, ~120 lineas)
- `#infoPanelContent .info-brand-array-editor` (linea 2495)
- `#infoPanelContent .info-brand-json-editor` (lineas 3663-3675)

**NO borrar sin verificar `BrandstorageView`** — la vista de sub-marca SI las usa en su panel INFO completo (selects, arrays, JSON). Son compartidas via `#infoPanelContent`.

## Mismo problema en BrandstorageView

`js/views/BrandstorageView.js:16-27` arrastra la misma deuda muerta (`products`, `organizationMembers`, `organizationCredits`, `creditUsage`, `brandIntegrations`, `brandSocialLinks`, `brandRules` cargados pero nunca leidos). Atender en un PR aparte.

## Estimacion total

~525 lineas eliminables entre JS + estado innecesario, sin cambio de funcionalidad. Cero riesgo si se respeta el orden (lote 1 → 2 → 3) y se verifica `BrandstorageView` antes de tocar CSS compartido.
