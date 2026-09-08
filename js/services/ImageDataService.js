/**
 * ImageDataService — capa de datos de la página /image (ImageView).
 *
 * Existe por la regla de oro de la auditoría 2026-07-02: las vistas no llaman
 * `supabase.from()` directo. Aquí viven las cuatro cosas que ImageView
 * necesita de la base — el contexto de marca, las producciones previas que se
 * ofrecen como referencia, y el alta/actualización de la fila en
 * system_ai_outputs — y solo eso: la vista sigue decidiendo qué hacer con los
 * datos, este archivo no sabe nada de la pantalla.
 *
 * Scope por tabla (modelo org vs brand_container), que es donde se falla:
 *   - products / audience_personas / campaigns: llevan brand_container_id.
 *   - services / brand_entities: son org-scope, compartidos entre sub-marcas.
 *     Filtrarlos por brand_container_id devuelve 400 (columna inexistente) y
 *     tumba el select entero, no solo esa condición.
 */
class ImageDataService {
  constructor(supabase) {
    this.sb = supabase || null;
  }

  /**
   * Contexto de marca de la sub-marca activa: identidad, perfiles, catálogo y
   * las fotos de cada producto (que alimentan el Stack de activos).
   * Devuelve siempre el shape completo — un fallo parcial deja listas vacías,
   * no undefined: la vista pinta "no hay productos", que es la verdad.
   */
  async loadBrandContext(brandContainerId, organizationId) {
    const vacio = { brand: null, brandProfiles: [], products: [], services: [], entities: [], audiences: [], campaigns: [] };
    if (!this.sb || !brandContainerId) return vacio;

    const { data: brandRow } = await this.sb
      .from('brand_containers')
      .select('id, nicho_core, sub_nichos, arquetipo, propuesta_valor, mision_vision, verbal_dna, visual_dna, palabras_clave, palabras_prohibidas, objetivos_estrategicos')
      .eq('id', brandContainerId)
      .maybeSingle();

    let brandProfiles = [];
    if (brandRow?.id) {
      const { data: profiles } = await this.sb
        .from('brand_profiles')
        .select('section, content')
        .eq('brand_container_id', brandRow.id);
      brandProfiles = profiles || [];
    }

    const [productsRes, servicesRes, entitiesRes, audiencesRes, campaignsRes] = await Promise.all([
      this.sb.from('products').select('id, entity_id, nombre_producto, brand_container_id').eq('brand_container_id', brandContainerId).order('created_at', { ascending: false }).limit(50),
      organizationId
        ? this.sb.from('services').select('id, entity_id, nombre_servicio').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(50)
        : Promise.resolve({ data: [] }),
      organizationId
        ? this.sb.from('brand_entities').select('id, name, entity_type, description').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(50)
        : Promise.resolve({ data: [] }),
      this.sb.from('audience_personas').select('id, name, description, estilo_lenguaje').eq('brand_container_id', brandContainerId).order('created_at', { ascending: false }).limit(50),
      // contexto_temporal / objetivos_estrategicos / tono_modificador viven en
      // campaign_briefs (BUG-006); se resuelven por el embed de la FK brief_id.
      this.sb.from('campaigns').select('id, nombre_campana, descripcion_interna, persona_id, brief_id, campaign_briefs:brief_id(contexto_temporal, objetivos_estrategicos, tono_modificador)').eq('brand_container_id', brandContainerId).order('created_at', { ascending: false }).limit(50)
    ]);

    const products = productsRes.data || [];
    const productIds = products.map((p) => p.id).filter(Boolean);
    if (productIds.length > 0) {
      const { data: imgs } = await this.sb
        .from('product_images')
        .select('product_id, image_url, image_type, image_order')
        .in('product_id', productIds)
        .order('image_order', { ascending: true });
      const byProduct = {};
      (imgs || []).forEach((img) => {
        if (!byProduct[img.product_id]) byProduct[img.product_id] = [];
        byProduct[img.product_id].push(img.image_url);
      });
      products.forEach((p) => { p.image_urls = (byProduct[p.id] || []).slice(0, 4); });
    }

    return {
      brand: brandRow || null,
      brandProfiles,
      products,
      services: servicesRes.data || [],
      entities: entitiesRes.data || [],
      audiences: audiencesRes.data || [],
      // Aplanamos el brief al row de campaña para que quien lo lea acceda
      // como c.contexto_temporal y no tenga que conocer el embed.
      campaigns: (campaignsRes.data || []).map((c) => {
        const brief = c.campaign_briefs || {};
        return {
          id: c.id,
          nombre_campana: c.nombre_campana,
          descripcion_interna: c.descripcion_interna,
          persona_id: c.persona_id,
          brief_id: c.brief_id,
          contexto_temporal: brief.contexto_temporal || null,
          objetivos_estrategicos: brief.objetivos_estrategicos || null,
          tono_modificador: brief.tono_modificador || null,
        };
      })
    };
  }

  /** URL pública de un storage_path. R2 guarda la URL completa: pass-through. */
  publicUrl(bucketName, filePath) {
    if (typeof filePath === 'string' && /^(https?:|\/\/)/i.test(filePath.trim())) return filePath.trim();
    if (!this.sb?.storage?.from || !bucketName || typeof filePath !== 'string' || !filePath.trim()) return null;
    try {
      let path = filePath.trim();
      if (path.startsWith(`${bucketName}/`)) path = path.replace(`${bucketName}/`, '');
      else if (path.startsWith('/')) path = path.slice(1);
      const { data } = this.sb.storage.from(bucketName).getPublicUrl(path);
      return data?.publicUrl || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Producciones previas que sirven de referencia: SOLO imágenes. Un video no
   * le sirve a nano-banana, y ofrecerlo en el carrusel sería enseñar algo que
   * el payload va a descartar.
   *
   * Dos orígenes, los mismos que el canvas de Studio: runs_outputs (piezas de
   * un flow) y system_ai_outputs (herramientas standalone). Ambos filtrados
   * por organización — sin eso, un usuario multi-org ve mezcladas las
   * producciones de todas sus orgs en cualquier workspace.
   */
  async loadImageProductions({ organizationId, userId }) {
    if (!this.sb || !userId) return [];

    const resolveMedia = (o) => {
      let media_url = null;
      const rawPath = typeof o.storage_path === 'string' ? o.storage_path.trim() : '';
      if (rawPath) {
        media_url = rawPath.startsWith('http')
          ? rawPath
          : (this.publicUrl('production-outputs', rawPath) || this.publicUrl('outputs', rawPath));
      }
      const meta = o.metadata && typeof o.metadata === 'object' ? o.metadata : {};
      if (!media_url) {
        media_url = meta.image_url || meta.url || meta.file_url || meta.output_url || meta.publicUrl || meta.src || null;
      }
      const type = (o.output_type || '').toLowerCase();
      const isVideo = type.includes('video') || /\.(mp4|webm|mov)(\?|$)/i.test(media_url || '');
      const isImage = !isVideo && (type.includes('image') || type.includes('img') || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(media_url || ''));
      return { ...o, media_url, isVideo, isImage };
    };

    let runsQ = this.sb.from('flow_runs').select('id').eq('user_id', userId);
    if (organizationId) runsQ = runsQ.eq('organization_id', organizationId);
    const { data: runs } = await runsQ;
    const runIds = (runs || []).map((r) => r.id).filter(Boolean);

    let fromRuns = [];
    if (runIds.length > 0) {
      const { data } = await this.sb
        .from('runs_outputs')
        .select('id, run_id, output_type, storage_path, metadata, created_at')
        .in('run_id', runIds)
        .order('created_at', { ascending: false })
        .limit(100);
      fromRuns = data || [];
    }

    let fromSystem = [];
    if (organizationId) {
      const { data } = await this.sb
        .from('system_ai_outputs')
        .select('id, output_type, storage_path, metadata, created_at')
        .eq('organization_id', organizationId)
        .neq('provider', 'openai')
        .order('created_at', { ascending: false })
        .limit(100);
      fromSystem = data || [];
    }

    const merged = [...fromRuns, ...fromSystem]
      .map(resolveMedia)
      .filter((o) => o.media_url && o.isImage)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    const vistos = new Set();
    return merged.filter((o) => {
      if (vistos.has(o.id)) return false;
      vistos.add(o.id);
      return true;
    });
  }

  /** Alta en system_ai_outputs. Devuelve el id, o null si no se pudo escribir. */
  async insertOutput(row) {
    if (!this.sb) return null;
    const { data, error } = await this.sb.from('system_ai_outputs').insert(row).select('id').single();
    if (error) {
      console.warn('ImageDataService insertOutput:', error.message);
      return null;
    }
    return data?.id || null;
  }

  /** Actualiza la fila del output (estado, storage_path, metadata del cobro). */
  async updateOutput(id, updates) {
    if (!this.sb || !id) return;
    const { error } = await this.sb
      .from('system_ai_outputs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) console.warn('ImageDataService updateOutput:', error.message);
  }
}

window.ImageDataService = ImageDataService;
