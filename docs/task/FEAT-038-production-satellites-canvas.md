# FEAT-038 — Satelites de produccion y publicacion en el Command Center

**Estado:** PENDIENTE (diseno -> Figma primero; bloqueado en datos por FEAT-037)
**Prioridad:** Media — completa el modelo de estrategia (cierre por produccion publicada).

## Objetivo

Que el canvas muestre, como **satelites** colgando del nodo brief/flow (o campana),
las **producciones** (`runs_outputs`) de esa estrategia, y marque las **publicadas**
(`social_publications` / `runs_outputs.published_at`). Reusar el patron existente
`_renderCampaignSatellites` / clase `cc-satellite` (adsets/ads de campanas pagas).

## Modelo (confirmado con el usuario 2026-06-10)

El cierre de una estrategia NO es siempre pauta paga:
- **Con presupuesto** -> campana real (pauta). Satelites = adsets/ads (ya existe).
- **Sin presupuesto** -> publicacion organica. El cierre es la **produccion publicada**
  (post/historia/reel/carrusel/UGC/infografia) via `social_publications`.

Las producciones y las publicadas deben verse en la estrategia.

## Datos
- `runs_outputs`: la produccion (output_type, storage_path/media, generated_copy,
  brief_id/campaign_id/persona_id -> FEAT-037, published_at/external_ad_id si fue a pauta).
- `social_publications`: publicacion organica (output_id -> runs_outputs, platform,
  status published/failed, remote_url, caption).

## Por que esta bloqueado / pendiente
1. **Datos:** sin FEAT-037 (tagging) las producciones no enlazan a la estrategia -> los
   satelites saldrian vacios.
2. **Visual:** es UI nueva -> por regla del usuario va PRIMERO a Figma (maqueta
   Sj1AK4L9hQ6iuCbdlR8j2E) reutilizando cc-satellite, luego se implementa en bundle.
3. La skill figma-use no estaba instalada en la sesion del 2026-06-10.

## Implementacion (cuando se desbloquee)
- `_renderProductionSatellites()` en CanvasStore.js, espejando `_renderCampaignSatellites`
  (FASE 1 posicionar divs en world-coords, FASE 2 edges bezier en screen-coords).
- Fetch productions por nodo: brief node -> runs_outputs WHERE brief_id; campaign node ->
  WHERE campaign_id. Cache en `this._prodData` (como `this._adData`).
- Render cada produccion como cc-satellite con thumb (media) + tipo (imagen/video) +
  badge de estado publicada (social_publications.status=published).
- Hook en el render loop junto a `_renderCampaignSatellites` (lineas ~2226/2241/2251).
- Guardar en try/catch para no romper el render core.
