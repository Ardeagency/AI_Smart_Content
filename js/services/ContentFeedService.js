/**
 * ContentFeedService — capa de datos del Content Feed (FEAT-017).
 *
 * Consume la RPC `get_paginated_content_feed(p_org_id, p_entity_ids, p_date_from,
 * p_date_to, p_limit, p_offset, p_include_ads, p_include_signals)` definida en
 * SQL/functions/content/get_paginated_content_feed.sql (RPC en Supabase prod).
 *
 * También expone `loadEntities()` para alimentar el filtro multi-select de
 * competidores (intelligence_entities con scope brand u org).
 */
class ContentFeedService {
  constructor() {
    this.sb = null;
    this.orgId = null;
  }

  init(supabase, orgId) {
    this.sb = supabase;
    this.orgId = orgId;
    return this;
  }

  _ok(data)  { return { data, isEmpty: !data || (Array.isArray(data) && data.length === 0), error: null }; }
  _err(error) { return { data: null, isEmpty: true, error }; }
  _noOrg() { return !this.sb || !this.orgId; }

  /**
   * Trae un page del feed unificado.
   * @param {Object}   opts
   * @param {string[]} [opts.entityIds]      — null/empty = todas las entidades de la org
   * @param {Date|string} [opts.dateFrom]    — default: now - 30d
   * @param {Date|string} [opts.dateTo]      — default: now
   * @param {number}   [opts.limit=50]
   * @param {number}   [opts.offset=0]
   * @param {boolean}  [opts.includeAds=true]
   * @param {boolean}  [opts.includeSignals=true]
   */
  async loadFeed(opts = {}) {
    if (this._noOrg()) return this._ok([]);
    const {
      entityIds = null,
      dateFrom = null,
      dateTo = null,
      limit = 50,
      offset = 0,
      includeAds = true,
      includeSignals = true,
    } = opts;

    const toIso = (v) => v instanceof Date ? v.toISOString() : (v || null);

    const params = {
      p_org_id: this.orgId,
      p_entity_ids: (entityIds && entityIds.length) ? entityIds : null,
      p_limit: limit,
      p_offset: offset,
      p_include_ads: includeAds,
      p_include_signals: includeSignals,
    };
    const isoFrom = toIso(dateFrom);
    const isoTo = toIso(dateTo);
    if (isoFrom) params.p_date_from = isoFrom;
    if (isoTo)   params.p_date_to   = isoTo;

    const { data, error } = await this.sb.rpc('get_paginated_content_feed', params);
    if (error) return this._err(error);
    return this._ok(data || []);
  }

  /**
   * Lista entidades scrapeables de la org (competidores, perfiles vigilados).
   * Solo activas, ordenadas por nombre.
   */
  async loadEntities() {
    if (this._noOrg()) return this._ok([]);

    const { data, error } = await this.sb
      .from('intelligence_entities')
      .select('id, name, domain, target_identifier, brand_container_id')
      .eq('organization_id', this.orgId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) return this._err(error);
    return this._ok(data || []);
  }
}

window.ContentFeedService = ContentFeedService;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContentFeedService;
}
