/**
 * MarcaDataService — la página MI MARCA sobre la base nueva (aqblperqrcwumiztmjnw,
 * corte ADR-0052). Es la ÚNICA puerta a la base para BrandOrganizationView y sus
 * mixins (colores, tipografía, subidas, panel INFO): la vista sigue pintando las
 * filas con los nombres de v1 y este servicio traduce en las dos direcciones.
 *
 * Contrato medido por BD el 16/09 13:45 UTC (Git-AISC-DB docs/contratos/marca.md):
 *   organizations(id, slug, name, legal_name, tagline, logo_url, logo_file_id, …)
 *     SELECT ver_marca · UPDATE editar_marca · `plan` lo protege un guardián: no se manda.
 *   brand_colors(id, organization_id, role color_role, hex char(7) '^#[0-9a-f]{6}$'
 *     → MINÚSCULAS, name, position) · UN solo role='primary' por marca.
 *   brand_fonts(id, organization_id, role font_role, family, fallback_stack,
 *     weights text[], source_url, license_note) · ÚNICO (organization_id, role)
 *     → upsert onConflict 'organization_id,role'.
 *   brand_assets(id, organization_id, kind asset_kind, name, storage_path, url,
 *     mime_type, width, height, bytes, is_primary, notes, file_id) · name no
 *     vacío · CHECK (storage_path o url) · UN solo is_primary por (org, kind).
 *   markets(id, organization_id, slug, name, countries[], languages[], core_niche,
 *     sub_niches[], archetype, value_proposition, mission_vision, keywords[],
 *     banned_words[], strategic_goals[], creative_brief, verbal_dna, visual_dna,
 *     is_primary, archived_at) — lo que v1 llamaba brand_containers.
 *   integrations.connections(id, organization_id, platform, status, account_name,
 *     external_account_id, expires_at, last_refreshed_at, last_used_at, last_error)
 *     SELECT exige gestionar_integraciones (42501 sin él → lista vacía, no error).
 *   Subidas: NO hay storage de Supabase para la persona. `POST /v1/archivos?org=
 *     &proposito=subida` (multipart, campo `archivo`) → {archivo:{id, bucket,
 *     object_key, bytes}} y luego insert en brand_assets con file_id. La URL para
 *     verlo es `url_galeria` de `GET /v1/archivos?org=` (Worker media-v2 + cookie
 *     de `POST /v1/sesion/galeria`, que ApiV2.mantenerSesionGaleria renueva).
 *
 * Regla del corte: ningún `.from()` fuera de js/services; cada campo que la
 * vista pinta sale de aquí con el nombre que la vista espera.
 */
(function () {
  'use strict';

  /* ── Diccionarios v1 ⇄ base nueva ─────────────────────────────────────── */

  /** Campos del panel INFO (js/config/brand-schema.js) → columnas de markets. */
  const MERCADO_V1_A_BASE = Object.freeze({
    nombre_marca: 'name',
    creative_brief: 'creative_brief',
    idiomas_contenido: 'languages',
    mercado_objetivo: 'countries',
    nicho_core: 'core_niche',
    sub_nichos: 'sub_niches',
    arquetipo: 'archetype',
    propuesta_valor: 'value_proposition',
    mision_vision: 'mission_vision',
    verbal_dna: 'verbal_dna',
    visual_dna: 'visual_dna',
    palabras_clave: 'keywords',
    palabras_prohibidas: 'banned_words',
    objetivos_estrategicos: 'strategic_goals',
  });
  const MERCADO_BASE_A_V1 = Object.freeze(Object.fromEntries(Object.entries(MERCADO_V1_A_BASE).map(([a, b]) => [b, a])));

  /** Roles de color en el orden en que la vista los reparte (primary es único). */
  const ROLES_COLOR = Object.freeze(['primary', 'secondary', 'accent', 'highlight', 'neutral', 'background', 'text']);
  /** v1 guardaba la tipografía «para imágenes»; en la base es el rol display. */
  const ROL_FUENTE_IMAGENES = 'display';
  /** Plataformas como las nombra v1 → enum platform de la base. */
  const PLATAFORMA_V1_A_BASE = Object.freeze({ facebook: 'meta', meta: 'meta', google: 'google', shopify: 'shopify', mercadolibre: 'mercadolibre', x: 'x', tiktok: 'tiktok', linkedin: 'linkedin' });

  /* ── Mapeos puros (probados en test/marca-datos.test.js) ──────────────── */

  function organizacionAV1(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      name: fila.name || '',
      slug: fila.slug || null,
      // La vista muestra brand_name_oficial || name: en la base nueva la marca ES la org,
      // así que el nombre grande es `name`; legal_name es de facturación (Organización).
      brand_name_oficial: fila.name || '',
      legal_name: fila.legal_name || null,
      brand_slogan: fila.tagline || null,
      logo_url: fila.logo_url || null,
      logo_file_id: fila.logo_file_id || null,
      mfa_required: fila.mfa_required === true,
    };
  }

  /** Parche de organizations en nombres de v1 → columnas reales. Ignora lo que no existe. */
  function organizacionABase(parcial) {
    const salida = {};
    if (!parcial || typeof parcial !== 'object') return salida;
    if ('brand_name_oficial' in parcial || 'name' in parcial || 'nombre_marca' in parcial) {
      const v = parcial.brand_name_oficial ?? parcial.name ?? parcial.nombre_marca;
      if (v != null && String(v).trim()) salida.name = String(v).trim();
    }
    if ('brand_slogan' in parcial || 'tagline' in parcial) salida.tagline = (parcial.brand_slogan ?? parcial.tagline) || null;
    if ('logo_url' in parcial) salida.logo_url = parcial.logo_url || null;
    if ('logo_file_id' in parcial) salida.logo_file_id = parcial.logo_file_id || null;
    if ('legal_name' in parcial) salida.legal_name = parcial.legal_name || null;
    return salida;
  }

  function colorAV1(fila) {
    return {
      id: fila.id,
      organization_id: fila.organization_id,
      hex_value: fila.hex,
      color_role: fila.role,
      role: fila.role,
      name: fila.name || null,
      position: fila.position ?? 0,
    };
  }

  /** '#AbCdEf' / 'abcdef' → '#abcdef' o null si no es un hex de 6. */
  function hexNormal(valor) {
    const limpio = String(valor || '').trim().replace(/^#/, '');
    return /^[0-9a-fA-F]{6}$/.test(limpio) ? `#${limpio.toLowerCase()}` : null;
  }

  /** El rol libre para un color nuevo: primary si nadie lo tiene; si no, el siguiente sin usar. */
  function siguienteRolColor(existentes) {
    const usados = new Set((existentes || []).map((c) => c.role || c.color_role));
    return ROLES_COLOR.find((r) => !usados.has(r)) || 'accent';
  }

  function fuenteAV1(fila) {
    return {
      id: fila.id,
      organization_id: fila.organization_id,
      role: fila.role,
      font_usage: fila.role === ROL_FUENTE_IMAGENES ? 'images' : fila.role,
      font_family: fila.family,
      font_weight: Array.isArray(fila.weights) && fila.weights.length ? String(fila.weights[0]) : '400',
      fallback_font: fila.fallback_stack || 'sans-serif',
    };
  }

  /** Un kind de la base → el `asset_type` que la vista usa para separar Identidad (documentos) de Assets. */
  function tipoAssetV1(kind) {
    return kind === 'document' ? 'identity' : (kind || 'asset');
  }

  /** El kind de la base para un archivo que sube la persona. */
  function kindDeArchivo(archivo, { identidad = false, logo = false } = {}) {
    if (logo) return 'logo';
    if (identidad) return 'document';
    const mime = String(archivo?.type || '').toLowerCase();
    const nombre = String(archivo?.name || '').toLowerCase();
    if (mime.startsWith('video/') || /\.(mp4|mov|webm)$/.test(nombre)) return 'video';
    if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|ai|eps|psd)$/.test(nombre)) return 'photo';
    return 'document';
  }

  /** brand_assets + (file_id → url_galeria) → la forma que pinta la vista. */
  function assetAV1(fila, urlPorArchivo = {}) {
    const url = fila.url || (fila.file_id && urlPorArchivo[fila.file_id]) || null;
    return {
      id: fila.id,
      organization_id: fila.organization_id,
      kind: fila.kind,
      asset_type: tipoAssetV1(fila.kind),
      file_id: fila.file_id || null,
      storage_path: fila.storage_path || null,
      bucket: null,
      file_name: fila.name || '',
      file_type: fila.mime_type || '',
      file_url: url,
      file_size: fila.bytes ?? null,
      is_primary: fila.is_primary === true,
      created_at: fila.created_at,
    };
  }

  function mercadoAV1(fila) {
    const salida = { id: fila.id, organization_id: fila.organization_id, slug: fila.slug, is_primary: fila.is_primary === true, created_at: fila.created_at, updated_at: fila.updated_at };
    for (const [base, v1] of Object.entries(MERCADO_BASE_A_V1)) salida[v1] = fila[base] ?? (v1.endsWith('_dna') ? null : (Array.isArray(fila[base]) ? [] : null));
    return salida;
  }

  /** Un campo del panel INFO → {columna, valor} o null si en la base no existe. */
  function campoMercadoABase(campoV1, valor) {
    const columna = MERCADO_V1_A_BASE[campoV1];
    if (!columna) return null;
    return { columna, valor };
  }

  function conexionAV1(fila) {
    return {
      id: fila.id,
      organization_id: fila.organization_id,
      brand_container_id: null,
      platform: fila.platform === 'meta' ? 'facebook' : fila.platform,
      plataforma: fila.platform,
      external_account_name: fila.account_name || fila.external_account_id || null,
      external_account_id: fila.external_account_id || null,
      is_active: fila.status === 'active',
      status: fila.status,
      token_expires_at: fila.expires_at || null,
      last_sync_at: fila.last_used_at || fila.last_refreshed_at || null,
      last_error: fila.last_error || null,
      metadata: {},
      updated_at: fila.updated_at || null,
    };
  }

  /* ── Acceso ──────────────────────────────────────────────────────────────── */

  let clienteInyectado = null;
  async function cliente() {
    if (clienteInyectado) return clienteInyectado;
    return window.supabase || (window.supabaseService && await window.supabaseService.getClient()) || null;
  }
  /** Las funciones del borde viven en `window.apiV2.api`; sin AISC_API_URL lanzan `sin_api` (codigo). */
  function api() { return (typeof window !== 'undefined' && window.apiV2?.api) || null; }

  /** 42501 (sin permiso) o PGRST301 se tratan como «no puedo ver esto», no como fallo. */
  function sinPermiso(error) {
    return error && (error.code === '42501' || error.code === 'PGRST301');
  }

  /** Lo que la galería sabe de cada archivo de la marca: file_id → url_galeria. Sin borde = {}. */
  async function urlsDeGaleria(orgId) {
    const a = api();
    if (!a) return {};
    try {
      const r = await a.archivos(orgId);
      const lista = Array.isArray(r?.archivos) ? r.archivos : [];
      return Object.fromEntries(lista.filter((f) => f?.id && f.url_galeria).map((f) => [f.id, f.url_galeria]));
    } catch (e) {
      if (e?.codigo !== 'sin_api') console.warn('[marca] archivos del borde:', e?.codigo || e?.message || e);
      else console.info('[marca] sin borde (AISC_API_URL vacío): los archivos subidos no tienen URL de galería.');
      return {};
    }
  }

  /** TODO lo que la página pinta, en una ida por tabla. */
  async function cargar(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return null;
    const [org, colores, fuentes, assets, mercados, conexiones, urls] = await Promise.all([
      sb.from('organizations').select('id, slug, name, legal_name, tagline, logo_url, logo_file_id, mfa_required').eq('id', orgId).maybeSingle(),
      sb.from('brand_colors').select('id, organization_id, role, hex, name, position').eq('organization_id', orgId).order('position', { ascending: true }),
      sb.from('brand_fonts').select('id, organization_id, role, family, fallback_stack, weights').eq('organization_id', orgId),
      sb.from('brand_assets').select('id, organization_id, kind, name, storage_path, url, mime_type, bytes, is_primary, file_id, created_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(24),
      sb.from('markets').select('id, organization_id, slug, name, countries, languages, core_niche, sub_niches, archetype, value_proposition, mission_vision, keywords, banned_words, strategic_goals, creative_brief, verbal_dna, visual_dna, is_primary, created_at, updated_at').eq('organization_id', orgId).is('archived_at', null).order('is_primary', { ascending: false }).order('created_at', { ascending: true }),
      sb.schema('integrations').from('connections').select('id, organization_id, platform, status, account_name, external_account_id, expires_at, last_refreshed_at, last_used_at, last_error, updated_at').eq('organization_id', orgId).order('platform', { ascending: true }),
      urlsDeGaleria(orgId),
    ]);
    for (const [nombre, r] of [['organizations', org], ['brand_colors', colores], ['brand_fonts', fuentes], ['brand_assets', assets], ['markets', mercados]]) {
      if (r.error && r.error.code !== 'PGRST116') console.warn(`[marca] ${nombre}:`, r.error.code, r.error.message);
    }
    if (conexiones.error && !sinPermiso(conexiones.error)) console.warn('[marca] integrations.connections:', conexiones.error.code, conexiones.error.message);
    return {
      organizationRow: organizacionAV1(org.data),
      brandColors: (colores.data || []).map(colorAV1),
      brandFonts: (fuentes.data || []).map(fuenteAV1),
      brandAssets: (assets.data || []).map((f) => assetAV1(f, urls)),
      brandContainers: (mercados.data || []).map(mercadoAV1),
      brandIntegrations: (conexiones.data || []).map(conexionAV1),
    };
  }

  async function colores(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const { data, error } = await sb.from('brand_colors').select('id, organization_id, role, hex, name, position').eq('organization_id', orgId).order('position', { ascending: true });
    if (error) { console.warn('[marca] brand_colors:', error.code, error.message); return []; }
    return (data || []).map(colorAV1);
  }

  async function assets(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const [{ data, error }, urls] = await Promise.all([
      sb.from('brand_assets').select('id, organization_id, kind, name, storage_path, url, mime_type, bytes, is_primary, file_id, created_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(24),
      urlsDeGaleria(orgId),
    ]);
    if (error) { console.warn('[marca] brand_assets:', error.code, error.message); return []; }
    return (data || []).map((f) => assetAV1(f, urls));
  }

  /* ── Escritura: organización ─────────────────────────────────────────────── */

  async function actualizarOrganizacion(orgId, parcialV1) {
    const sb = await cliente();
    const cambios = organizacionABase(parcialV1);
    if (!sb || !orgId || !Object.keys(cambios).length) return null;
    const { data, error } = await sb.from('organizations').update(cambios).eq('id', orgId).select('id, slug, name, legal_name, tagline, logo_url, logo_file_id, mfa_required').maybeSingle();
    if (error) throw error;
    if (!data) throw Object.assign(new Error('La base no devolvió la marca actualizada (¿sin permiso editar_marca?).'), { code: 'sin_fila' });
    return organizacionAV1(data);
  }

  /* ── Escritura: colores ──────────────────────────────────────────────────── */

  async function crearColor(orgId, hexValor) {
    const sb = await cliente();
    const hex = hexNormal(hexValor);
    if (!sb || !orgId || !hex) throw Object.assign(new Error('Color inválido.'), { code: 'hex_invalido' });
    const actuales = await colores(orgId);
    if (actuales.length >= 4) throw Object.assign(new Error('Máximo 4 colores por marca.'), { code: 'tope' });
    if (actuales.some((c) => c.hex_value === hex)) throw Object.assign(new Error('Este color ya existe en la marca.'), { code: '23505' });
    const fila = { organization_id: orgId, role: siguienteRolColor(actuales), hex, position: actuales.length };
    const { data, error } = await sb.from('brand_colors').insert(fila).select('id, organization_id, role, hex, name, position').single();
    if (error) throw error;
    return colorAV1(data);
  }

  async function actualizarColor(colorId, hexValor) {
    const sb = await cliente();
    const hex = hexNormal(hexValor);
    if (!sb || !colorId || !hex) throw Object.assign(new Error('Color inválido.'), { code: 'hex_invalido' });
    const { data, error } = await sb.from('brand_colors').update({ hex }).eq('id', colorId).select('id, organization_id, role, hex, name, position').maybeSingle();
    if (error) throw error;
    if (!data) throw Object.assign(new Error('El color no se guardó (¿sin permiso editar_marca?).'), { code: 'sin_fila' });
    return colorAV1(data);
  }

  async function borrarColor(colorId) {
    const sb = await cliente();
    if (!sb || !colorId) return false;
    const { data, error } = await sb.from('brand_colors').delete().eq('id', colorId).select('id');
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  }

  /* ── Escritura: tipografía ───────────────────────────────────────────────── */

  async function guardarTipografiaImagenes(orgId, familia) {
    const sb = await cliente();
    const family = String(familia || '').trim();
    if (!sb || !orgId || !family) throw Object.assign(new Error('Tipografía inválida.'), { code: 'familia_invalida' });
    const fila = { organization_id: orgId, role: ROL_FUENTE_IMAGENES, family, weights: ['400'], fallback_stack: 'sans-serif' };
    const { data, error } = await sb.from('brand_fonts').upsert(fila, { onConflict: 'organization_id,role' }).select('id, organization_id, role, family, fallback_stack, weights').maybeSingle();
    if (error) throw error;
    if (!data) throw Object.assign(new Error('La tipografía no se guardó (¿sin permiso editar_marca?).'), { code: 'sin_fila' });
    return fuenteAV1(data);
  }

  /* ── Escritura: archivos (logo, identidad, assets) ───────────────────────── */

  /**
   * Sube por el borde y registra el asset. Devuelve el asset en forma v1.
   * `logo: true` además apunta organizations.logo_file_id (+ logo_url a la galería
   * mientras el borde no exponga un espacio público para logos).
   */
  async function subirAsset(orgId, archivo, { identidad = false, logo = false } = {}) {
    const a = api();
    const sb = await cliente();
    if (!a) throw Object.assign(new Error('El borde no está configurado (AISC_API_URL): no se puede subir.'), { code: 'sin_api' });
    if (!sb || !orgId || !archivo) throw Object.assign(new Error('Falta la marca o el archivo.'), { code: 'entrada_invalida' });
    let subido;
    try { subido = await a.subirArchivo(orgId, archivo, 'subida'); } catch (e) { if (e?.codigo) e.code = e.codigo; throw e; }
    const f = subido?.archivo;
    if (!f?.id) throw Object.assign(new Error('El borde no devolvió el archivo subido.'), { code: 'sin_archivo' });
    const kind = kindDeArchivo(archivo, { identidad, logo });
    const fila = {
      organization_id: orgId, kind, name: archivo.name || 'archivo', file_id: f.id,
      storage_path: f.object_key || null, mime_type: archivo.type || null, bytes: f.bytes ?? archivo.size ?? null, is_primary: false,
    };
    if (logo) await sb.from('brand_assets').update({ is_primary: false }).eq('organization_id', orgId).eq('kind', 'logo');
    if (logo) fila.is_primary = true;
    const { data, error } = await sb.from('brand_assets').insert(fila).select('id, organization_id, kind, name, storage_path, url, mime_type, bytes, is_primary, file_id, created_at').single();
    if (error) throw error;
    const urls = await urlsDeGaleria(orgId);
    const asset = assetAV1(data, urls);
    if (logo) await actualizarOrganizacion(orgId, { logo_file_id: f.id, logo_url: asset.file_url || null });
    return asset;
  }

  async function borrarAsset(orgId, assetV1) {
    const sb = await cliente();
    if (!sb || !assetV1?.id) return false;
    const { data, error } = await sb.from('brand_assets').delete().eq('id', assetV1.id).select('id');
    if (error) throw error;
    if (!Array.isArray(data) || !data.length) return false;
    const a = api();
    if (a && assetV1.file_id) {
      try { await a.borrarArchivo(assetV1.file_id, orgId); } catch (e) { console.warn('[marca] borrar archivo del borde:', e?.codigo || e?.message || e); }
    }
    return true;
  }

  /* ── Escritura: mercado (panel INFO) ─────────────────────────────────────── */

  async function actualizarMercado(mercadoId, campoV1, valor) {
    const sb = await cliente();
    const cambio = campoMercadoABase(campoV1, valor);
    if (!cambio) throw Object.assign(new Error(`«${campoV1}» ya no vive en la ficha del mercado.`), { code: 'campo_inexistente' });
    if (!sb || !mercadoId) return null;
    const { data, error } = await sb.from('markets').update({ [cambio.columna]: cambio.valor }).eq('id', mercadoId).select('id, organization_id, slug, name, countries, languages, core_niche, sub_niches, archetype, value_proposition, mission_vision, keywords, banned_words, strategic_goals, creative_brief, verbal_dna, visual_dna, is_primary, created_at, updated_at').maybeSingle();
    if (error) throw error;
    if (!data) throw Object.assign(new Error('El mercado no se guardó (¿sin permiso editar_marca?).'), { code: 'sin_fila' });
    return mercadoAV1(data);
  }

  /** ¿Hay otro mercado de la marca con este nombre? (v1 lo comprobaba antes de renombrar). */
  async function nombreDeMercadoRepetido(orgId, nombre, salvoId) {
    const sb = await cliente();
    if (!sb || !orgId) return false;
    let q = sb.from('markets').select('id').eq('organization_id', orgId).ilike('name', String(nombre || '').trim()).limit(1);
    if (salvoId) q = q.neq('id', salvoId);
    const { data, error } = await q;
    if (error) { console.warn('[marca] markets nombre:', error.code, error.message); return false; }
    return Array.isArray(data) && data.length > 0;
  }

  /* ── Integraciones (solo lo que la ficha de marca necesita; el resto es D2) ── */

  /** Devuelve la URL de autorización; la navegación la hace la vista. */
  async function urlParaConectar(orgId, plataformaV1, extra = {}) {
    const a = api();
    const plataforma = PLATAFORMA_V1_A_BASE[String(plataformaV1 || '').toLowerCase()];
    if (!a) throw Object.assign(new Error('El borde no está configurado (AISC_API_URL).'), { code: 'sin_api' });
    if (!plataforma) throw Object.assign(new Error(`Plataforma no admitida: ${plataformaV1}`), { code: 'plataforma' });
    let r;
    try { r = await a.conectar(plataforma, orgId, extra); } catch (e) { if (e?.codigo) e.code = e.codigo; throw e; }
    const url = r?.url || r?.authorize_url || r?.url_autorizacion;
    if (!url) throw Object.assign(new Error('El borde no devolvió la URL de autorización.'), { code: 'sin_url' });
    return url;
  }

  window.MarcaDatos = Object.freeze({
    // datos
    cargar, colores, assets,
    // escritura
    actualizarOrganizacion, crearColor, actualizarColor, borrarColor, guardarTipografiaImagenes,
    subirAsset, borrarAsset, actualizarMercado, nombreDeMercadoRepetido, urlParaConectar,
    // puros (test)
    mapeo: Object.freeze({ organizacionAV1, organizacionABase, colorAV1, hexNormal, siguienteRolColor, fuenteAV1, assetAV1, tipoAssetV1, kindDeArchivo, mercadoAV1, campoMercadoABase, conexionAV1, MERCADO_V1_A_BASE, ROLES_COLOR }),
    /** Solo para pruebas: inyecta un cliente con la forma de supabase-js. */
    _inyectarCliente(sb) { clienteInyectado = sb; },
  });
})();
