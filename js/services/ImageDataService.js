/**
 * ImageDataService — capa de datos de la página /image (ImageView).
 *
 * Corte ADR-0052 (16/09): es un ADAPTADOR sobre `window.StudioDatos`
 * (js/services/StudioDataService.js) que conserva la interfaz que ImageView
 * ya usa — `loadBrandContext`, `loadImageProductions`, `insertOutput`,
 * `updateOutput`, `publicUrl` — para que la vista no cambie de forma.
 *
 * Lo que cambió por debajo:
 *   - El contexto de marca sale de `markets` + `public.elements_full` (no de
 *     brand_containers/brand_profiles/products/services/brand_entities).
 *   - Las producciones previas salen de `public.salidas` (tipo image), con la
 *     URL por `file_id` → galería de media-v2 (o `url` si no hay archivo).
 *   - `system_ai_outputs` NO existe en la base nueva: la fila de la producción
 *     la escribe la base al terminar la corrida (flows.run_outputs → salidas).
 *     `insertOutput`/`updateOutput` devuelven null y no escriben nada.
 */
class ImageDataService {
  constructor(supabase) {
    this.sb = supabase || null;
  }

  /** Contexto de marca del mercado activo (o el principal): forma completa siempre. */
  async loadBrandContext(brandContainerId, organizationId) {
    const vacio = { brand: null, brandProfiles: [], products: [], services: [], entities: [], audiences: [], campaigns: [] };
    if (!window.StudioDatos || !organizationId) return vacio;
    try {
      return await window.StudioDatos.contexto(organizationId, brandContainerId || null);
    } catch (e) {
      console.warn('ImageDataService loadBrandContext:', e?.message || e);
      return vacio;
    }
  }

  /** URLs completas pasan tal cual; en la base nueva no hay storage público que resolver. */
  publicUrl(_bucketName, filePath) {
    if (typeof filePath === 'string' && /^(https?:|\/\/)/i.test(filePath.trim())) return filePath.trim();
    return null;
  }

  /** Producciones previas de la marca que sirven de referencia: SOLO imágenes. */
  async loadImageProductions({ organizationId }) {
    if (!window.StudioDatos || !organizationId) return [];
    try {
      return (await window.StudioDatos.producciones(organizationId, 'image', 100)).filter((o) => o.media_url && o.isImage);
    } catch (e) {
      console.warn('ImageDataService loadImageProductions:', e?.message || e);
      return [];
    }
  }

  /** system_ai_outputs no existe: la corrida deja su rastro en la base. */
  async insertOutput(_row) { return null; }
  async updateOutput(_id, _updates) { /* sin tabla que actualizar */ }
}

window.ImageDataService = ImageDataService;
