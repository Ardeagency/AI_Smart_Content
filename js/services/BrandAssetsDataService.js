/**
 * BrandAssetsDataService — el catálogo de ELEMENTOS de la marca.
 *
 * Escenarios y personajes con su imagen: lo que el panel de Elementos pinta en
 * filas y el director arrastra al prompt. Vive aquí por la regla de oro de la
 * auditoría 2026-07-02 (las vistas no llaman `supabase.from()` directo) y
 * porque lo van a necesitar las dos páginas de producción, no solo /video.
 *
 * LO QUE HAY QUE SABER DEL MODELO: `brand_places` y `brand_characters` NO
 * tienen FK a la organización — cuelgan de `brand_entities`. Se piden con los
 * entity_ids de la org ya resueltos; filtrarlos por `organization_id` devuelve
 * 400 (columna inexistente) y tumba el select entero.
 *
 * Los servicios quedan fuera a propósito: no tienen tabla de imágenes en la
 * base, así que no pueden entrar como referencia visual. La vista los muestra
 * igual —existen en la marca— pero sin nada que arrastrar.
 */
class BrandAssetsDataService {
  constructor(supabase) {
    this.sb = supabase || null;
  }

  /**
   * Escenarios y personajes de esos entity_ids, cada uno con TODAS sus
   * `image_urls`. La primera es la portada del tile; el resto se despliega al
   * pasar el cursor, para que el director elija cual usar.
   *
   * Devuelve siempre el shape completo: un fallo deja listas vacías, no
   * undefined. La fila dice "Sin escenarios", que es la verdad visible, en vez
   * de reventar el panel entero.
   */
  async loadElementos(entityIds) {
    const vacio = { places: [], characters: [] };
    if (!this.sb || !Array.isArray(entityIds) || !entityIds.length) return vacio;

    try {
      const [placesRes, charsRes] = await Promise.all([
        this.sb.from('brand_places')
          .select('id, entity_id, nombre_lugar')
          .in('entity_id', entityIds)
          .order('created_at', { ascending: false })
          .limit(50),
        this.sb.from('brand_characters')
          .select('id, entity_id, nombre_personaje')
          .in('entity_id', entityIds)
          .order('created_at', { ascending: false })
          .limit(50)
      ]);
      const places = placesRes.data || [];
      const characters = charsRes.data || [];

      const [placeImgs, charImgs] = await Promise.all([
        places.length
          ? this.sb.from('place_images')
            .select('place_id, image_url, image_order')
            .in('place_id', places.map((x) => x.id))
            .not('image_url', 'is', null)
            .order('image_order', { ascending: true })
          : Promise.resolve({ data: [] }),
        characters.length
          ? this.sb.from('character_images')
            .select('character_id, image_url, image_order')
            .in('character_id', characters.map((x) => x.id))
            .not('image_url', 'is', null)
            .order('image_order', { ascending: true })
          : Promise.resolve({ data: [] })
      ]);

      // TODAS las imagenes, no solo la portada: el panel las despliega al pasar
      // el cursor para que el director elija cual quiere. Guardar solo la
      // primera era decidir por el.
      const todasPorId = (filas, clave) => {
        const m = {};
        (filas || []).forEach((img) => {
          const url = (img.image_url || '').trim();
          if (!url) return;
          // `image_order` viene ordenado: la primera que llega es la portada.
          (m[img[clave]] ??= []).push(url);
        });
        return m;
      };
      const porLugar = todasPorId(placeImgs.data, 'place_id');
      const porPersonaje = todasPorId(charImgs.data, 'character_id');
      places.forEach((x) => { x.image_urls = porLugar[x.id] || []; });
      characters.forEach((x) => { x.image_urls = porPersonaje[x.id] || []; });

      return { places, characters };
    } catch (e) {
      console.warn('BrandAssetsDataService loadElementos:', e);
      return vacio;
    }
  }
}

window.BrandAssetsDataService = BrandAssetsDataService;
