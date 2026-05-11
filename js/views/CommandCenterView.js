/**
 * CommandCenterView — v5
 * Centro de control: enfoque de mercado (no historial ni segmentación fina).
 * - Personas conceptuales + campañas con persona_id
 * - Última lectura por canal (snapshots dedupe; API por RLS)
 * - Conexiones existentes: integraciones + segmentos con vínculo a persona
 */
class CommandCenterView extends BaseView {
  constructor() {
    super();
    this._subBrandSlug    = '';
    this._organizationId  = null;
    this._containerRow    = null;
    this._audiences       = [];   // audience_personas
    this._segments        = [];   // audience_segments
    this._campaigns       = [];   // campaigns (con cached metrics)
    this._integrations    = [];   // brand_integrations (sync status)
    this._pendingActions  = [];   // vera_pending_actions (status='pending')
    this._supabase        = null;
  }

  /* ── Redirect legacy ──────────────────────────────────────────────── */
  async _redirectLegacyIfNeeded(container) {
    const path = window.location.pathname || '';
    if (path.startsWith('/org/')) return false;
    if (!path.startsWith('/command-center/')) return false;
    const orgId =
      window.appState?.get?.('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') || '';
    if (!orgId || typeof window.getOrgPathPrefix !== 'function') return false;
    const supabase = window.supabaseService
      ? await window.supabaseService.getClient()
      : window.supabase;
    if (!supabase) return false;
    let orgName = '';
    try {
      const { data, error } = await supabase
        .from('organizations').select('name').eq('id', orgId).maybeSingle();
      if (!error && data?.name) orgName = String(data.name);
    } catch (_) { /* noop */ }
    const prefix = window.getOrgPathPrefix(orgId, orgName);
    if (!prefix) return false;
    const slug = (this.routeParams && this.routeParams.subBrandSlug) ||
      path.replace(/^\/command-center\//, '').split('/')[0];
    if (!slug) return false;
    if (container) container.innerHTML = '<div class="page-content"><p class="text-muted">Redirigiendo…</p></div>';
    window.router?.navigate(
      `${prefix}/command-center/${encodeURIComponent(slug)}${window.location.search || ''}`, true);
    return true;
  }

  _resolveOrganizationId() {
    return (
      this.routeParams?.orgId ||
      window.currentOrgId ||
      window.appState?.get?.('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      null
    );
  }

  /* ── Lifecycle ────────────────────────────────────────────────────── */
  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
  }

  /* ── HTML skeleton ────────────────────────────────────────────────── */
  renderHTML() {
    return `
<div class="cc-page" id="commandCenterPage">

  <!-- OPTIMIZACIÓN: comentarios de Vera. Sección oculta hasta que haya comentarios reales -->
  <section class="cc-section cc-section--optim" id="ccOptimSection" style="display:none;" aria-label="Optimización propuesta por Vera">
    <div class="cc-optim-bg" aria-hidden="true">
      <div class="cc-optim-gradient"></div>
    </div>
    <div class="cc-optim-body">
      <div class="cc-section-head">
        <div class="cc-section-head-main">
          <h2 class="cc-section-title">Optimización</h2>
          <p class="cc-section-lede">Lecturas y recomendaciones de Vera sobre tus campañas y audiencia real. Aprueba para que se materialice en el próximo plan.</p>
        </div>
        <div class="cc-optim-count-wrap" aria-live="polite" aria-atomic="true">
          <span class="cc-optim-count-num" id="ccVeraInboxCount" aria-label="Total de comentarios">0</span>
          <span class="cc-optim-count-label" id="ccVeraInboxLabel">comentarios</span>
        </div>
      </div>
      <div class="cc-optim-list" id="ccVeraInboxList"></div>
    </div>
  </section>

  <!-- LAYOUT ENTORNO: mapa LEFT (flex 1) + sidebar derecho 380px ────── -->
  <div class="cc-entorno-layout" id="ccTwoCol" style="display:none;">

    <!-- IZQUIERDA: Mapa con overlays (controles, leyenda, filtro) ───── -->
    <div class="cc-entorno-map">
      <!-- Loading overlay -->
      <div class="cc-entorno-loading" id="ccEntornoLoading" style="display:none;">
        <div class="cc-entorno-spinner"></div>
        <div class="cc-entorno-loading-text">Cargando lectura del mercado…</div>
      </div>

      <!-- Choropleth canvas container -->
      <div class="cc-entorno-map-canvas" id="ccAudienceMap"></div>

      <!-- Demografía: edades bottom-LEFT, géneros bottom-RIGHT (sin fondo) -->
      <div class="cc-entorno-demog cc-entorno-demog--age" id="ccEntornoDemogAge" style="display:none;">
        <div class="cc-break-group" id="ccBreakAge"></div>
      </div>
      <div class="cc-entorno-demog cc-entorno-demog--gender" id="ccEntornoDemogGender" style="display:none;">
        <div class="cc-break-group" id="ccBreakGender"></div>
      </div>
    </div>

    <!-- DERECHA: Sidebar (solo campañas reales sincronizadas) ──────── -->
    <aside class="cc-entorno-sidebar">
      <div class="cc-entorno-breadcrumb">
        <span class="cc-entorno-bc-item">Panel</span>
        <i class="fas fa-chevron-right cc-entorno-bc-sep"></i>
        <span class="cc-entorno-bc-item cc-entorno-bc-current">Campañas</span>
      </div>

      <section class="cc-entorno-section">
        <div class="cc-entorno-subsection-head">
          <h3 class="cc-entorno-section-title">Campañas reales</h3>
          <span class="cc-entorno-subsection-count" id="ccCampCount">0</span>
        </div>
        <div class="cc-list" id="ccCampList"></div>
        <div class="cc-empty cc-empty--compact" id="ccCampEmpty" style="display:none;">
          <i class="fas fa-bullhorn"></i>
          <span>Sin campañas sincronizadas. Conecta una integración (Meta, Google, etc.).</span>
        </div>
      </section>
    </aside>
  </div>
</div>`;
  }

  /* ── Render ───────────────────────────────────────────────────────── */
  async render() {
    const container = document.getElementById('app-container');
    if (await this._redirectLegacyIfNeeded(container)) return;
    await super.render();
    await this._loadData();
    this._setupEventListeners();
  }

  /* ── Data fetching ────────────────────────────────────────────────── */
  async _loadData() {
    this._subBrandSlug   = String(this.routeParams?.subBrandSlug || '').trim().toLowerCase();
    this._organizationId = this._resolveOrganizationId();

    if (!this._organizationId) {
      this.updateHeaderContext('Command Center', this._subBrandSlug || '—', window.currentOrgName || '');
      this._setError('Selecciona una organización o inicia sesión de nuevo.');
      return;
    }

    const supabase = window.supabaseService
      ? await window.supabaseService.getClient()
      : window.supabase;
    this._supabase = supabase || null;
    if (!supabase) { this._setError('No hay conexión con la base de datos.'); return; }

    const slugFn = typeof window.getOrgSlug === 'function'
      ? window.getOrgSlug
      : (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    /* Resolver brand_container por slug */
    let match = null;
    try {
      const { data } = await supabase
        .from('brand_containers')
        .select('id, nombre_marca, created_at')
        .eq('organization_id', this._organizationId)
        .order('created_at', { ascending: false });
      const containers = Array.isArray(data) ? data : [];
      match = containers.find((r) => slugFn(r.nombre_marca) === this._subBrandSlug) || null;
    } catch (e) { console.warn('CommandCenterView: brand_containers', e); }

    const displayName = match
      ? (String(match.nombre_marca || '').trim() || 'Sub-marca')
      : this._subBrandSlug || '—';
    this.updateHeaderContext('Command Center', displayName, window.currentOrgName || '');

    if (!match) {
      this._setError(`No se encontró la sub-marca "${displayName}". Revisa el nombre en Brand Storage.`);
      return;
    }

    this._containerRow = match;
    const bid = match.id;

    /* Fetch paralelo (snapshots + heatmap vía API: RLS suele devolver [] al cliente) */
    try {
      const [audRes, segRes, campRes, intRes] = await Promise.all([
        supabase
          .from('audience_personas')
          .select('id, name, description, awareness_level, alignment_score, dolores, deseos, objeciones, gatillos_compra, datos_demograficos, datos_psicograficos, real_age_distribution, real_gender_distribution, real_location_distribution, real_interests, updated_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),

        supabase
          .from('audience_segments')
          .select('id, persona_id, platform, external_audience_name, external_audience_type, age_range, genders, interests, behaviors, estimated_size, size_lower_bound, size_upper_bound, status, source, last_synced_at')
          .eq('brand_container_id', bid)
          .order('platform', { ascending: true }),

        supabase
          .from('campaigns')
          .select('id, nombre_campana, descripcion_interna, persona_id, cta, cta_url, platform, platform_objective, status, budget_daily, budget_total, budget_currency, starts_at, ends_at, cached_impressions, cached_clicks, cached_spend, cached_conversions, cached_roas, cached_ctr, last_synced_at, source, updated_at, created_at, match_scores, real_demographics')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),

        supabase
          .from('brand_integrations')
          .select('id, platform, external_account_name, is_active, last_sync_at, updated_at')
          .eq('brand_container_id', bid)
          .order('platform', { ascending: true }),
      ]);

      this._audiences    = !audRes.error  && Array.isArray(audRes.data)  ? audRes.data  : [];
      this._segments     = !segRes.error  && Array.isArray(segRes.data)  ? segRes.data  : [];
      this._campaigns    = !campRes.error && Array.isArray(campRes.data) ? campRes.data : [];
      this._integrations = !intRes.error  && Array.isArray(intRes.data)  ? intRes.data  : [];
    } catch (e) {
      console.warn('CommandCenterView: fetch', e);
      this._audiences = [];
      this._segments  = [];
      this._campaigns = [];
      this._integrations = [];
    }

    // Bandeja de Vera: pending_actions sin resolver para esta marca
    this._pendingActions = await this._fetchPendingActions(bid);

    const twoCol = document.getElementById('ccTwoCol');
    if (twoCol) twoCol.style.display = '';

    this._renderVeraInbox();
    this._renderCampaigns();
    this._renderAudienceMap();
    this.updateLinksForRouter();
  }

  /* ── Vera Inbox: pending_actions ──────────────────────────────────────── */
  async _fetchPendingActions(brandContainerId) {
    if (!brandContainerId || !this._supabase) return [];
    try {
      const { data: { session } } = await this._supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return [];
      const qs = new URLSearchParams({ brand_container_id: String(brandContainerId), status: 'pending' });
      const res = await fetch(`/api/vera/pending-actions?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'same-origin',
      });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.actions) ? json.actions : [];
    } catch (e) {
      console.warn('CommandCenterView: fetchPendingActions:', e?.message);
      return [];
    }
  }

  /* ── OPTIMIZACIÓN — comentarios de Vera ──────────────────────────── */
  _renderVeraInbox() {
    const section = document.getElementById('ccOptimSection');
    const list    = document.getElementById('ccVeraInboxList');
    const count   = document.getElementById('ccVeraInboxCount');
    const label   = document.getElementById('ccVeraInboxLabel');
    if (!list) return;

    // Filtrar placeholders/stubs: cualquier acción marcada como tal o con un
    // reasoning que indique "bootstrap stub" no es análisis real y no debe
    // ensuciar la bandeja de Optimización.
    const rawActions = Array.isArray(this._pendingActions) ? this._pendingActions : [];
    const actions = rawActions.filter((a) => {
      if (a?.proposed_payload?.placeholder === true) return false;
      if (typeof a?.vera_reasoning === 'string' && /bootstrap\s*stub/i.test(a.vera_reasoning)) return false;
      return true;
    });

    // Si no hay comentarios reales, ocultar la sección entera (no mostrar
    // header con "0 comentarios" — ruido visual sin valor).
    if (actions.length === 0) {
      if (section) section.style.display = 'none';
      list.innerHTML = '';
      return;
    }
    if (section) section.style.display = '';

    if (count) count.textContent = String(actions.length);
    if (label) label.textContent = actions.length === 1 ? 'comentario' : 'comentarios';

    const personaNameById = this._personaNameById();
    const fmtPct = (n) => Number.isFinite(Number(n)) ? `${Math.round(Number(n) * 100)}%` : '—';
    const labelByType = {
      link_campaign_to_persona:    'Vincular campaña a persona',
      link_segment_to_persona:     'Vincular audiencia a persona',
      update_persona:              'Actualizar persona',
      create_audience:             'Crear nueva audiencia',
      update_audience:             'Actualizar audiencia',
      update_brand_container:      'Actualizar marca',
      strategic_recommendation_for_campaign: 'Recomendación estratégica',
      update_shopify_product_seo:  'Optimizar SEO de producto',
    };

    list.innerHTML = actions.map((a) => {
      const summary = a.proposed_payload?.summary || a.vera_reasoning || '';
      const typeLabel = labelByType[a.action_type] || a.action_type;
      const personaTarget = a.proposed_payload?.persona_id ? (personaNameById[String(a.proposed_payload.persona_id)] || '') : '';
      const reasoningRow = a.vera_reasoning && summary !== a.vera_reasoning
        ? `<p class="cc-vera-inbox-reason">${this.escapeHtml(a.vera_reasoning.slice(0, 200))}</p>`
        : '';
      const conf = Number.isFinite(Number(a.vera_confidence)) ? fmtPct(a.vera_confidence) : null;
      const confBadge = conf ? `<span class="cc-vera-inbox-conf" title="Confianza de Vera">${conf}</span>` : '';
      const personaRow = personaTarget ? `<span class="cc-vera-inbox-meta"><i class="fas fa-user"></i> ${this.escapeHtml(personaTarget)}</span>` : '';
      return `
      <article class="cc-vera-inbox-card" data-action-id="${a.id}">
        <div class="cc-vera-inbox-card-head">
          <span class="cc-vera-inbox-card-type">${this.escapeHtml(typeLabel)}</span>
          ${confBadge}
        </div>
        ${summary ? `<p class="cc-vera-inbox-summary">${this.escapeHtml(summary)}</p>` : ''}
        ${reasoningRow}
        ${personaRow}
        <div class="cc-vera-inbox-actions">
          <button type="button" class="btn btn-sm btn-primary cc-vera-inbox-btn-approve" data-id="${a.id}">
            <i class="fas fa-check"></i> Aprobar
          </button>
          <button type="button" class="btn btn-sm btn-secondary cc-vera-inbox-btn-reject" data-id="${a.id}">
            <i class="fas fa-times"></i> Descartar
          </button>
        </div>
      </article>`;
    }).join('');

    // Listeners
    list.querySelectorAll('.cc-vera-inbox-btn-approve').forEach((btn) => {
      btn.addEventListener('click', (e) => this._approvePendingAction(e.currentTarget.dataset.id));
    });
    list.querySelectorAll('.cc-vera-inbox-btn-reject').forEach((btn) => {
      btn.addEventListener('click', (e) => this._rejectPendingAction(e.currentTarget.dataset.id));
    });
  }

  async _approvePendingAction(actionId) {
    if (!actionId) return;
    try {
      const { data: { session } } = await this._supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/vera/pending-actions/${actionId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        alert(`No se pudo aprobar: ${err.slice(0, 120)}`);
        return;
      }
      // Quitar localmente y re-renderizar
      this._pendingActions = this._pendingActions.filter((a) => a.id !== actionId);
      this._renderVeraInbox();
    } catch (e) {
      console.error('approve action:', e);
    }
  }

  async _rejectPendingAction(actionId) {
    if (!actionId) return;
    const reason = window.prompt('¿Por qué descartas esta sugerencia? (opcional)') || '';
    try {
      const { data: { session } } = await this._supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/vera/pending-actions/${actionId}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        alert(`No se pudo descartar: ${err.slice(0, 120)}`);
        return;
      }
      this._pendingActions = this._pendingActions.filter((a) => a.id !== actionId);
      this._renderVeraInbox();
    } catch (e) {
      console.error('reject action:', e);
    }
  }

  /** Mapa id → nombre de persona (legacy, queda por si se usa en otro lado). */
  _personaNameById() {
    const m = {};
    (this._audiences || []).forEach((p) => {
      if (p?.id) m[String(p.id)] = String(p.name || '').trim() || 'Persona';
    });
    return m;
  }

  /* ── CAMPAÑAS reales: solo las sincronizadas desde una integración ─── */
  _renderCampaigns() {
    const list  = document.getElementById('ccCampList');
    const empty = document.getElementById('ccCampEmpty');
    const count = document.getElementById('ccCampCount');
    const all   = Array.isArray(this._campaigns) ? this._campaigns : [];
    // "Real" = importada de Meta/Google/TikTok/LinkedIn/etc. Indicador robusto:
    // last_synced_at no nulo (la fila vino de un sync, no fue creada a mano).
    const rows = all.filter((c) => c?.last_synced_at);
    if (count) count.textContent = String(rows.length);
    if (!list) return;

    if (!rows.length) {
      list.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    const statusClass = { active: 'cc-badge--green', conceptual: 'cc-badge--blue', draft: 'cc-badge--gray', paused: 'cc-badge--yellow', ended: 'cc-badge--red', archived: 'cc-badge--gray' };
    const platformLabel = { meta_instagram: 'Instagram', meta_facebook: 'Facebook', google_ads: 'Google Ads', tiktok_ads: 'TikTok', linkedin_ads: 'LinkedIn', pinterest_ads: 'Pinterest', organic: 'Orgánico', internal: 'Interno' };
    const fmtCompact = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return '—';
      if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
      if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
      return n.toLocaleString('es-ES');
    };
    const fmtMoney = (v, currency) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return '—';
      const compact = n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString('es-ES', { maximumFractionDigits: 0 });
      return `${compact} ${currency || 'USD'}`;
    };
    const fmtDate = (d) => {
      if (!d) return '—';
      const t = new Date(d);
      return Number.isFinite(t.getTime())
        ? t.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';
    };

    list.innerHTML = rows.map((c) => {
      const stBadge   = `<span class="cc-badge ${statusClass[c.status] || 'cc-badge--gray'}">${this.escapeHtml(c.status || 'draft')}</span>`;
      const platLabel = platformLabel[c.platform] || (c.platform ? c.platform.replace(/_/g, ' ') : null);
      const platBadge = platLabel ? `<span class="cc-badge cc-badge--platform">${this.escapeHtml(platLabel)}</span>` : '';

      // Engagement: cached_clicks como proxy primario (clicks/interacciones).
      // Si no hay clicks, usa impressions como señal de exposición.
      const engagementVal = c.cached_clicks ?? c.cached_impressions;
      const engagementLbl = c.cached_clicks ? 'interacciones' : (c.cached_impressions ? 'impresiones' : '');

      return `
      <div class="cc-camp-row">
        <div class="cc-camp-row-head">
          <span class="cc-camp-name" title="${this.escapeHtml(c.nombre_campana || 'Campaña')}">${this.escapeHtml(c.nombre_campana || 'Campaña')}</span>
          <div class="cc-camp-badges">${stBadge}${platBadge}</div>
        </div>
        <dl class="cc-camp-stats">
          <div class="cc-camp-stat"><dt>Publicada</dt><dd>${this.escapeHtml(fmtDate(c.starts_at || c.created_at))}</dd></div>
          <div class="cc-camp-stat"><dt>Engagement</dt><dd>${engagementVal != null ? `${fmtCompact(engagementVal)}${engagementLbl ? ` <small>${engagementLbl}</small>` : ''}` : '—'}</dd></div>
          <div class="cc-camp-stat"><dt>Gastos</dt><dd>${c.cached_spend != null ? this.escapeHtml(fmtMoney(c.cached_spend, c.budget_currency)) : '—'}</dd></div>
        </dl>
      </div>`;
    }).join('');
  }

  /* ── Mapa choropleth + breakdowns (segmentación real) ─────────────── */
  async _renderAudienceMap() {
    const mapEl       = document.getElementById('ccAudienceMap');
    const ageOverlay  = document.getElementById('ccEntornoDemogAge');
    const genOverlay  = document.getElementById('ccEntornoDemogGender');
    const ageEl       = document.getElementById('ccBreakAge');
    const genEl       = document.getElementById('ccBreakGender');
    if (!mapEl) return;

    // Filtra claves "_raw", "_totals", "_sources", "_updated_at" del jsonb de personas
    const isInternalKey = (k) => typeof k === 'string' && k.startsWith('_');

    // Acepta dos shapes:
    //   campaigns.real_demographics: { age: { "25-34": {impressions, reach} } }
    //   personas.real_*:             { age: { "25-34": 0.45 } }  (fracción 0-1)
    // Devuelve número absoluto o fracción según el caso. El choropleth normaliza por max.
    const toNumeric = (v) => {
      if (typeof v === 'number') return v;
      if (v && typeof v === 'object' && typeof v.impressions === 'number') return v.impressions;
      return 0;
    };

    const agg = { age: {}, gender: {}, country: {} };
    let source = null;  // 'campaigns' | 'personas' | null

    // ── 1) Intento PRIMERO: agregar campaigns.real_demographics (data por
    //    campaña, granular). Solo si tiene cualquier valor > 0.
    const camps = Array.isArray(this._campaigns) ? this._campaigns : [];
    for (const c of camps) {
      const rd = c.real_demographics;
      if (!rd || typeof rd !== 'object') continue;
      for (const axis of ['age', 'gender', 'country']) {
        const dist = rd[axis];
        if (!dist || typeof dist !== 'object') continue;
        for (const [k, v] of Object.entries(dist)) {
          if (isInternalKey(k)) continue;
          const n = toNumeric(v);
          if (n <= 0) continue;
          agg[axis][k] = (agg[axis][k] || 0) + n;
          source = 'campaigns';
        }
      }
    }

    // ── 2) Fallback: si campañas no aportaron data, agregar audience_personas.real_*
    //    (data brand-wide poblada por sensores meta_audience_demographics + ga4)
    if (!source) {
      const personas = Array.isArray(this._audiences) ? this._audiences : [];
      for (const p of personas) {
        const ageDist     = p.real_age_distribution      || {};
        const genderDist  = p.real_gender_distribution   || {};
        const locDist     = p.real_location_distribution || {};
        for (const [k, v] of Object.entries(ageDist)) {
          if (isInternalKey(k)) continue;
          const n = toNumeric(v); if (n <= 0) continue;
          agg.age[k] = (agg.age[k] || 0) + n;
          source = 'personas';
        }
        for (const [k, v] of Object.entries(genderDist)) {
          if (isInternalKey(k) || k === 'unknown') continue;
          const n = toNumeric(v); if (n <= 0) continue;
          agg.gender[k] = (agg.gender[k] || 0) + n;
          source = 'personas';
        }
        const countries = locDist.countries || {};
        for (const [k, v] of Object.entries(countries)) {
          if (isInternalKey(k)) continue;
          // Solo aceptamos ISO-A2 (2 letras mayúsculas); descartamos nombres
          // ("Colombia", "United States") que vienen del fallback GA4 raw.
          if (typeof k !== 'string' || k.length !== 2 || !/^[A-Z]{2}$/.test(k)) continue;
          const n = toNumeric(v); if (n <= 0) continue;
          agg.country[k] = (agg.country[k] || 0) + n;
          source = 'personas';
        }
      }
    }

    if (!source) {
      mapEl.innerHTML = `<div class="cc-map-empty"><i class="fas fa-satellite-dish"></i><p>Aún no hay lectura del mercado. Conecta una integración (Meta/Google) o espera a que los sensores corran (próxima corrida diaria).</p></div>`;
      if (ageEl) ageEl.innerHTML = '';
      if (genEl) genEl.innerHTML = '';
      if (ageOverlay) ageOverlay.style.display = 'none';
      if (genOverlay) genOverlay.style.display = 'none';
      return;
    }

    // Mapa choropleth (country). Si AudienceMap.render dispara su fallback
    // interno de lista, lo detectamos por DOM y mostramos un chip visible para
    // poder diagnosticar el motivo real desde la consola del usuario.
    if (window.AudienceMap) {
      try {
        await window.AudienceMap.render(mapEl, agg.country);
        const fellBack = !!mapEl.querySelector('.cc-map-fallback');
        if (fellBack) {
          const errMsg = mapEl.__lastError || 'razón desconocida (revisa consola)';
          const chip = document.createElement('div');
          chip.className = 'cc-map-error-chip';
          chip.innerHTML = `<i class="fas fa-triangle-exclamation"></i> Mapa no disponible: ${this.escapeHtml(errMsg)}`;
          mapEl.appendChild(chip);
        }
      } catch (e) {
        console.warn('AudienceMap render:', e?.message);
        mapEl.innerHTML = `<div class="cc-map-empty"><i class="fas fa-triangle-exclamation"></i><p>Error al cargar el mapa: ${this.escapeHtml(e?.message || String(e))}</p></div>`;
      }
    } else {
      mapEl.innerHTML = `<div class="cc-map-empty">Cargando mapa…</div>`;
    }

    // Breakdowns: edad (bottom-left) + género (bottom-right) — overlays sin fondo
    const totalGender = Object.values(agg.gender).reduce((s, v) => s + Number(v || 0), 0);
    const totalAge    = Object.values(agg.age).reduce((s, v) => s + Number(v || 0), 0);
    const buildRow = (label, pct, aria) => `
      <div class="cc-break-row" role="progressbar" aria-valuenow="${pct}" aria-label="${aria}">
        <span class="cc-break-label">${label}</span>
        <div class="cc-break-bar-wrap"><div class="cc-break-bar" style="width:${pct}%"></div></div>
        <span class="cc-break-pct">${pct}%</span>
      </div>`;

    const genderRows = totalGender > 0
      ? Object.entries(agg.gender)
          .sort((a, b) => Number(b[1]) - Number(a[1]))
          .slice(0, 4)
          .map(([k, v]) => {
            const pct = Math.round((Number(v) / totalGender) * 100);
            const label = k === 'male' ? 'Hombres' : k === 'female' ? 'Mujeres' : k;
            return buildRow(label, pct, `${label}: ${pct}%`);
          }).join('')
      : '';

    const ageRows = totalAge > 0
      ? Object.entries(agg.age)
          .sort((a, b) => Number(b[1]) - Number(a[1]))
          .slice(0, 6)
          .map(([k, v]) => {
            const pct = Math.round((Number(v) / totalAge) * 100);
            return buildRow(k, pct, `Edad ${k}: ${pct}%`);
          }).join('')
      : '';

    if (ageEl)  ageEl.innerHTML  = ageRows    ? `<h4 class="cc-break-title">Edad</h4>${ageRows}`     : '';
    if (genEl)  genEl.innerHTML  = genderRows ? `<h4 class="cc-break-title">Género</h4>${genderRows}` : '';
    if (ageOverlay) ageOverlay.style.display = ageRows    ? '' : 'none';
    if (genOverlay) genOverlay.style.display = genderRows ? '' : 'none';
  }

  /* ── Listeners: vacío por ahora (las cards no tienen interacción) ── */
  _setupEventListeners() { /* noop */ }

  /* ── Error state ──────────────────────────────────────────────────── */
  _setError(msg) {
    const twoCol = document.getElementById('ccTwoCol');
    const empty  = document.getElementById('ccCampEmpty');
    const count  = document.getElementById('ccCampCount');
    if (twoCol) twoCol.style.display = 'none';
    if (count)  count.textContent    = '0';
    if (empty) {
      empty.style.display = 'flex';
      empty.innerHTML = `<i class="fas fa-exclamation-triangle"></i><p>${this.escapeHtml(msg)}</p>`;
    }
  }
}

window.CommandCenterView = CommandCenterView;
