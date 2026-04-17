/**
 * CommandCenterView — v2
 * - Carrusel: audiencias Supabase (nombre + awareness) + modal edición
 * - Fila inferior: campañas Supabase (izq) | targeting + campañas API (der)
 */
class CommandCenterView extends BaseView {
  constructor() {
    super();
    this._subBrandSlug = '';
    this._organizationId = null;
    this._containerRow = null;
    this._audiences = [];
    this._campaigns = [];
    this._integrations = [];
    this._supabase = null;
    this._editingAudience = null;
  }

  /* ── Redirect legacy (sin /org/) ─────────────────────────────────── */
  async _redirectLegacyIfNeeded(container) {
    const path = window.location.pathname || '';
    if (path.startsWith('/org/')) return false;
    if (!path.startsWith('/command-center/')) return false;
    const orgId =
      window.appState?.get?.('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      '';
    if (!orgId || typeof window.getOrgPathPrefix !== 'function') return false;
    const supabase = window.supabaseService
      ? await window.supabaseService.getClient()
      : window.supabase;
    if (!supabase) return false;
    let orgName = '';
    try {
      const { data, error } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
      if (!error && data?.name) orgName = String(data.name);
    } catch (e) { /* noop */ }
    const prefix = window.getOrgPathPrefix(orgId, orgName);
    if (!prefix) return false;
    const slug = (this.routeParams && this.routeParams.subBrandSlug) ||
      path.replace(/^\/command-center\//, '').split('/')[0];
    if (!slug) return false;
    if (container) container.innerHTML = '<div class="page-content"><p class="text-muted">Redirigiendo…</p></div>';
    window.router?.navigate(`${prefix}/command-center/${encodeURIComponent(slug)}${window.location.search || ''}`, true);
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

  /* ── HTML ─────────────────────────────────────────────────────────── */
  renderHTML() {
    return `
<div class="cc-page" id="commandCenterPage">
  <section class="cc-section cc-section--audiences">
    <div class="cc-aud-glow" aria-hidden="true"></div>
    <div class="cc-section--audiences-body">
      <div class="cc-section-head">
        <div class="cc-section-head-main">
          <h2 class="cc-section-title">Audiencias</h2>
        </div>
        <div class="cc-aud-head-count-wrap" aria-live="polite" aria-atomic="true">
          <span class="cc-aud-head-count-num" id="ccAudCount" aria-label="Total de audiencias">0</span>
        </div>
      </div>
      <div class="cc-carousel-wrap">
        <div class="cc-carousel" id="ccAudCarousel">
          <div class="cc-loading"><span></span><span></span><span></span></div>
        </div>
      </div>
      <div class="cc-empty" id="ccAudEmpty" style="display:none;">
        <i class="fas fa-users-slash"></i>
        <p>No hay audiencias para esta sub-marca.</p>
      </div>
    </div>
  </section>

  <div class="cc-two-col" id="ccTwoCol">
    <aside class="cc-col cc-col--left">
      <div class="cc-section-head cc-section-head--campaigns">
        <div class="cc-section-head-main">
          <h2 class="cc-section-title cc-section-title--campaigns">Campañas</h2>
        </div>
        <div class="cc-camp-head-count-wrap" aria-live="polite" aria-atomic="true">
          <span class="cc-camp-head-count-num" id="ccCampCount" aria-label="Total de campañas">0</span>
        </div>
      </div>
      <div class="cc-list" id="ccCampList"></div>
      <div class="cc-empty cc-empty--inline" id="ccCampEmpty" style="display:none;">
        <i class="fas fa-bullhorn"></i>
        <p>No hay campañas en Supabase para esta sub-marca.</p>
      </div>
    </aside>

    <div class="cc-col cc-col--right">
      <section class="cc-section cc-section--tight">
        <div class="cc-section-head">
          <div class="cc-section-head-main">
            <h2 class="cc-section-title">Audiencias API</h2>
          </div>
          <span class="cc-section-subtitle">Meta / integraciones</span>
        </div>
        <div class="cc-api-stack" id="ccApiAudStack"></div>
      </section>
      <section class="cc-section cc-section--tight">
        <div class="cc-section-head">
          <div class="cc-section-head-main">
            <h2 class="cc-section-title">Campañas API</h2>
          </div>
          <span class="cc-section-subtitle">Activas / inactivas</span>
        </div>
        <div id="ccApiCampWrap"></div>
      </section>
    </div>
  </div>
</div>

<div class="cc-modal-backdrop" id="ccAudienceModalBackdrop" style="display:none;">
  <div class="cc-modal" role="dialog" aria-modal="true" aria-labelledby="ccAudienceModalTitle">
    <div class="cc-modal-head">
      <h3 class="cc-modal-title" id="ccAudienceModalTitle">Editar audiencia</h3>
      <button class="cc-modal-close" type="button" id="ccAudienceModalClose" aria-label="Cerrar">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <form class="cc-modal-form" id="ccAudienceForm">
      <label class="cc-field">
        <span>Nombre</span>
        <input id="ccAudFormName" type="text" required maxlength="120" />
      </label>
      <label class="cc-field">
        <span>Awareness level</span>
        <select id="ccAudFormAwareness">
          <option value="">Sin definir</option>
          <option value="unaware">unaware</option>
          <option value="problem_aware">problem_aware</option>
          <option value="solution_aware">solution_aware</option>
          <option value="product_aware">product_aware</option>
          <option value="most_aware">most_aware</option>
        </select>
      </label>
      <label class="cc-field">
        <span>Descripcion</span>
        <textarea id="ccAudFormDescription" rows="3" maxlength="1200"></textarea>
      </label>
      <label class="cc-field">
        <span>Dolores (uno por linea)</span>
        <textarea id="ccAudFormPains" rows="3" placeholder="Dolor 1&#10;Dolor 2"></textarea>
      </label>
      <label class="cc-field">
        <span>Deseos (uno por linea)</span>
        <textarea id="ccAudFormDesires" rows="3" placeholder="Deseo 1&#10;Deseo 2"></textarea>
      </label>
      <div class="cc-modal-actions">
        <button class="btn btn-secondary btn-sm" type="button" id="ccAudienceCancelBtn">Cancelar</button>
        <button class="btn btn-primary btn-sm" type="submit" id="ccAudienceSaveBtn">Guardar cambios</button>
      </div>
    </form>
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
    this._subBrandSlug = String(this.routeParams?.subBrandSlug || '').trim().toLowerCase();
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

    if (!supabase) {
      this._setError('No hay conexión con la base de datos.');
      return;
    }

    const slugFn = typeof window.getOrgSlug === 'function'
      ? window.getOrgSlug
      : (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Resolver brand_container por slug
    let match = null;
    try {
      const { data } = await supabase
        .from('brand_containers')
        .select('id, nombre_marca, created_at')
        .eq('organization_id', this._organizationId)
        .order('created_at', { ascending: false });
      const containers = Array.isArray(data) ? data : [];
      match = containers.find((r) => slugFn(r.nombre_marca) === this._subBrandSlug) || null;
    } catch (e) {
      console.warn('CommandCenterView: brand_containers', e);
    }

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

    try {
      const [audRes, campRes, intRes] = await Promise.all([
        supabase
          .from('audiences')
          .select('id, name, description, awareness_level, datos_demograficos, datos_psicograficos, dolores, deseos, updated_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),
        supabase
          .from('campaigns')
          .select('id, nombre_campana, descripcion_interna, contexto_temporal, objetivos_estrategicos, tono_modificador, audience_id, updated_at, created_at')
          .eq('brand_container_id', bid)
          .order('updated_at', { ascending: false }),
        supabase
          .from('brand_integrations')
          .select('id, platform, external_account_name, is_active, metadata, last_sync_at, updated_at')
          .eq('brand_container_id', bid)
          .order('platform', { ascending: true }),
      ]);
      this._audiences = !audRes.error && Array.isArray(audRes.data) ? audRes.data : [];
      this._campaigns = !campRes.error && Array.isArray(campRes.data) ? campRes.data : [];
      this._integrations = !intRes.error && Array.isArray(intRes.data) ? intRes.data : [];
    } catch (e) {
      console.warn('CommandCenterView: fetch', e);
      this._audiences = [];
      this._campaigns = [];
      this._integrations = [];
    }

    const twoCol = document.getElementById('ccTwoCol');
    if (twoCol) twoCol.style.display = '';

    const campEmpty = document.getElementById('ccCampEmpty');
    if (campEmpty) {
      campEmpty.innerHTML = '<i class="fas fa-bullhorn"></i><p>No hay campañas en Supabase para esta sub-marca.</p>';
    }

    this._renderAudiencesCarousel();
    this._renderSupabaseCampaigns();
    this._renderApiAudienceTargeting();
    this._renderApiCampaignsPanel();
    await this._maybeSyncMetaFromApisThenRefresh(bid);
    this.updateLinksForRouter();
  }

  /**
   * Orquestación desde el cliente: pide al backend que llame a Meta y guarde en
   * `brand_integrations.metadata` (el navegador no usa el token de Meta directo).
   * Throttle ~25 min por integración para no saturar Graph API.
   */
  async _maybeSyncMetaFromApisThenRefresh(bid) {
    if (!this._supabase || !bid) return;
    const rows = (this._integrations || []).filter((i) => {
      const p = String(i.platform || '').toLowerCase();
      return p === 'facebook' || p.includes('meta') || p.includes('facebook');
    });
    if (!rows.length) return;

    const STALE_MS = 25 * 60 * 1000;
    const now = Date.now();
    const { data: { session } } = await this._supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) return;

    let anyOk = false;
    for (const row of rows) {
      const syncedAt = row.metadata?.meta_insights?.synced_at;
      if (syncedAt) {
        const t = new Date(syncedAt).getTime();
        if (Number.isFinite(t) && (now - t) < STALE_MS) continue;
      }
      try {
        const res = await fetch('/api/insights/fetch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            platform: 'facebook',
            integration_id: row.id,
            date_range: '30d',
          }),
        });
        if (res.ok) anyOk = true;
        else console.warn('CommandCenterView: meta sync HTTP', res.status, await res.text().catch(() => ''));
      } catch (e) {
        console.warn('CommandCenterView: meta sync', e);
      }
    }

    if (!anyOk) return;

    try {
      const { data, error } = await this._supabase
        .from('brand_integrations')
        .select('id, platform, external_account_name, is_active, metadata, last_sync_at, updated_at')
        .eq('brand_container_id', bid)
        .order('platform', { ascending: true });
      if (!error && Array.isArray(data)) {
        this._integrations = data;
        this._renderApiAudienceTargeting();
        this._renderApiCampaignsPanel();
      }
    } catch (e) {
      console.warn('CommandCenterView: refresh integrations', e);
    }
  }

  _renderAudiencesCarousel() {
    const carousel = document.getElementById('ccAudCarousel');
    const count = document.getElementById('ccAudCount');
    const empty = document.getElementById('ccAudEmpty');
    if (!carousel) return;
    const rows = Array.isArray(this._audiences) ? this._audiences : [];
    if (count) count.textContent = String(rows.length || 0);

    if (!rows.length) {
      carousel.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    carousel.innerHTML = rows.map((a) => `
      <article class="cc-aud-card" data-audience-id="${this.escapeHtml(String(a.id || ''))}" role="button" tabindex="0">
        <h3 class="cc-aud-name">${this.escapeHtml(a.name || 'Audiencia sin nombre')}</h3>
        <span class="cc-aud-level">${this.escapeHtml(a.awareness_level || 'sin awareness-level')}</span>
      </article>
    `).join('');
  }

  _setupEventListeners() {
    const carousel = document.getElementById('ccAudCarousel');
    const modalBackdrop = document.getElementById('ccAudienceModalBackdrop');
    const closeBtn = document.getElementById('ccAudienceModalClose');
    const cancelBtn = document.getElementById('ccAudienceCancelBtn');
    const form = document.getElementById('ccAudienceForm');
    if (carousel) {
      carousel.addEventListener('click', (ev) => {
        const card = ev.target.closest('.cc-aud-card[data-audience-id]');
        if (!card) return;
        this._openAudienceModal(card.getAttribute('data-audience-id'));
      });
      carousel.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        const card = ev.target.closest('.cc-aud-card[data-audience-id]');
        if (!card) return;
        ev.preventDefault();
        this._openAudienceModal(card.getAttribute('data-audience-id'));
      });
    }
    if (closeBtn) closeBtn.onclick = () => this._closeAudienceModal();
    if (cancelBtn) cancelBtn.onclick = () => this._closeAudienceModal();
    if (modalBackdrop) {
      modalBackdrop.onclick = (ev) => {
        if (ev.target === modalBackdrop) this._closeAudienceModal();
      };
    }
    if (form) {
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        await this._saveAudienceFromModal();
      });
    }
  }

  _openAudienceModal(audienceId) {
    const row = this._audiences.find((a) => String(a.id) === String(audienceId));
    if (!row) return;
    this._editingAudience = row;
    const backdrop = document.getElementById('ccAudienceModalBackdrop');
    const name = document.getElementById('ccAudFormName');
    const awareness = document.getElementById('ccAudFormAwareness');
    const description = document.getElementById('ccAudFormDescription');
    const pains = document.getElementById('ccAudFormPains');
    const desires = document.getElementById('ccAudFormDesires');
    if (name) name.value = row.name || '';
    if (awareness) awareness.value = row.awareness_level || '';
    if (description) description.value = row.description || '';
    if (pains) pains.value = Array.isArray(row.dolores) ? row.dolores.join('\n') : '';
    if (desires) desires.value = Array.isArray(row.deseos) ? row.deseos.join('\n') : '';
    if (backdrop) backdrop.style.display = 'flex';
    setTimeout(() => name?.focus(), 0);
  }

  _closeAudienceModal() {
    this._editingAudience = null;
    const backdrop = document.getElementById('ccAudienceModalBackdrop');
    if (backdrop) backdrop.style.display = 'none';
  }

  async _saveAudienceFromModal() {
    if (!this._supabase || !this._editingAudience?.id) return;
    const saveBtn = document.getElementById('ccAudienceSaveBtn');
    const name = document.getElementById('ccAudFormName')?.value?.trim() || '';
    const awareness = document.getElementById('ccAudFormAwareness')?.value || null;
    const description = document.getElementById('ccAudFormDescription')?.value?.trim() || null;
    const painsRaw = document.getElementById('ccAudFormPains')?.value || '';
    const desiresRaw = document.getElementById('ccAudFormDesires')?.value || '';
    const dolores = painsRaw.split('\n').map((v) => v.trim()).filter(Boolean);
    const deseos = desiresRaw.split('\n').map((v) => v.trim()).filter(Boolean);
    if (!name) {
      window.alert('El nombre es obligatorio.');
      return;
    }
    if (saveBtn) saveBtn.disabled = true;
    try {
      const { error } = await this._supabase
        .from('audiences')
        .update({
          name,
          awareness_level: awareness || null,
          description,
          dolores,
          deseos,
          updated_at: new Date().toISOString(),
        })
        .eq('id', this._editingAudience.id);
      if (error) throw error;
      const idx = this._audiences.findIndex((a) => String(a.id) === String(this._editingAudience.id));
      if (idx >= 0) {
        this._audiences[idx] = {
          ...this._audiences[idx],
          name,
          awareness_level: awareness || null,
          description,
          dolores,
          deseos,
          updated_at: new Date().toISOString(),
        };
      }
      this._renderAudiencesCarousel();
      this._closeAudienceModal();
    } catch (e) {
      console.error('CommandCenterView save audience:', e);
      window.alert(e?.message || 'No se pudo guardar la audiencia.');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  _setError(msg) {
    const twoCol = document.getElementById('ccTwoCol');
    if (twoCol) twoCol.style.display = 'none';
    const carousel = document.getElementById('ccAudCarousel');
    const empty = document.getElementById('ccAudEmpty');
    const count = document.getElementById('ccAudCount');
    if (carousel) carousel.innerHTML = '';
    if (count) count.textContent = '0';
    if (empty) {
      empty.style.display = 'flex';
      empty.innerHTML = `<i class="fas fa-exclamation-triangle"></i><p>${this.escapeHtml(msg)}</p>`;
    }
  }

  _campaignCtaText(c) {
    const obj = Array.isArray(c.objetivos_estrategicos) ? c.objetivos_estrategicos : [];
    if (obj.length) return String(obj[0]);
    const d = c.descripcion_interna ? String(c.descripcion_interna).trim() : '';
    if (d) return d.length > 72 ? `${d.slice(0, 72)}…` : d;
    return 'Sin CTA definido';
  }

  _renderSupabaseCampaigns() {
    const list = document.getElementById('ccCampList');
    const empty = document.getElementById('ccCampEmpty');
    const count = document.getElementById('ccCampCount');
    const rows = Array.isArray(this._campaigns) ? this._campaigns : [];
    if (count) count.textContent = String(rows.length);
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = rows.map((c) => {
      const cta = this._campaignCtaText(c);
      return `
        <div class="cc-camp-row">
          <div class="cc-camp-row-main">
            <span class="cc-camp-name">${this.escapeHtml(c.nombre_campana || 'Campaña')}</span>
            <span class="cc-camp-cta">${this.escapeHtml(cta)}</span>
          </div>
        </div>`;
    }).join('');
  }

  _isMetaIntegration(platform) {
    const p = String(platform || '').toLowerCase();
    return p.includes('meta') || p.includes('facebook') || p.includes('instagram');
  }

  _campaignListFromMetadata(meta) {
    const m = meta && typeof meta === 'object' ? meta : {};
    if (Array.isArray(m.campaigns)) return m.campaigns;
    if (Array.isArray(m.meta_campaigns)) return m.meta_campaigns;
    if (Array.isArray(m.ads_campaigns)) return m.ads_campaigns;
    return [];
  }

  _firstInsight(c) {
    if (!c || typeof c !== 'object') return null;
    if (c.insights?.data?.[0]) return c.insights.data[0];
    if (Array.isArray(c.insights) && c.insights[0]) return c.insights[0];
    if (c.insight && typeof c.insight === 'object') return c.insight;
    return null;
  }

  _formatInsightNumber(v) {
    if (v == null || v === '') return '—';
    const n = Number(v);
    if (Number.isFinite(n)) return n.toLocaleString('es-ES');
    return String(v);
  }

  _targetingLinesFromObject(t) {
    if (!t || typeof t !== 'object') return { ages: '', genders: '', interests: '' };
    const min = t.age_min ?? t.ageMin;
    const max = t.age_max ?? t.ageMax;
    let ages = '';
    if (min != null || max != null) ages = `Edades: ${min ?? '?'}–${max ?? '?'}`;
    let genders = '';
    const g = t.genders;
    if (Array.isArray(g) && g.length) {
      const map = { 1: 'Hombres', 2: 'Mujeres', male: 'Hombres', female: 'Mujeres' };
      genders = `Género: ${g.map((x) => map[x] || map[String(x).toLowerCase()] || String(x)).join(', ')}`;
    }
    let interests = '';
    const flex = t.flexible_spec;
    const intList = (flex && Array.isArray(flex.interests) ? flex.interests : null)
      || (Array.isArray(t.interests) ? t.interests : null);
    if (intList && intList.length) {
      const names = intList.map((i) => (i && (i.name || i.id)) || '').filter(Boolean).slice(0, 12);
      if (names.length) interests = `Intereses: ${names.join(', ')}`;
    }
    return { ages, genders, interests };
  }

  _extractTargetingBlocks(meta) {
    const m = meta && typeof meta === 'object' ? meta : {};
    const blocks = [];
    const pushBlock = (label, t) => {
      const { ages, genders, interests } = this._targetingLinesFromObject(t);
      if (ages || genders || interests) blocks.push({ label, ages, genders, interests });
    };
    if (m.targeting && typeof m.targeting === 'object') pushBlock('Targeting (cuenta)', m.targeting);
    if (m.default_targeting && typeof m.default_targeting === 'object') pushBlock('Targeting por defecto', m.default_targeting);
    const audKeys = ['audiences', 'custom_audiences', 'saved_audiences', 'meta_audiences'];
    audKeys.forEach((key) => {
      const arr = m[key];
      if (!Array.isArray(arr)) return;
      arr.forEach((a, i) => {
        const name = a?.name || a?.id || `${key} ${i + 1}`;
        const t = a?.targeting || a?.targeting_spec || a?.definition?.targeting || null;
        if (t) pushBlock(String(name), t);
      });
    });
    if (Array.isArray(m.audience_targeting)) {
      m.audience_targeting.forEach((row, i) => {
        if (row && typeof row === 'object') pushBlock(row.name || `Segmento ${i + 1}`, row);
      });
    }
    if (m.audience_breakdown && typeof m.audience_breakdown === 'object') {
      const b = m.audience_breakdown;
      pushBlock('Desglose audiencia', b);
    }
    return blocks;
  }

  _renderApiAudienceTargeting() {
    const root = document.getElementById('ccApiAudStack');
    if (!root) return;
    const metaInts = (this._integrations || []).filter((i) => this._isMetaIntegration(i.platform));
    if (!metaInts.length) {
      root.innerHTML = `<div class="cc-api-hint">Conecta Meta en Brand Storage para ver edades, género e intereses cuando estén sincronizados en <code>metadata</code>.</div>`;
      return;
    }
    const parts = [];
    metaInts.forEach((intg) => {
      const meta = (intg.metadata && typeof intg.metadata === 'object') ? intg.metadata : {};
      const blocks = this._extractTargetingBlocks(meta);
      const account = this.escapeHtml(intg.external_account_name || intg.platform || 'Cuenta');
      if (!blocks.length) {
        parts.push(`
          <div class="cc-api-card">
            <div class="cc-api-card-head"><span class="cc-api-card-title">${account}</span></div>
            <p class="cc-api-hint">No hay targeting de audiencia en los datos guardados. Tras sincronizar Meta, aquí aparecerán edades, género e intereses si el job los incluye en <code>metadata</code>.</p>
          </div>`);
        return;
      }
      parts.push(`
        <div class="cc-api-card">
          <div class="cc-api-card-head"><span class="cc-api-card-title">${account}</span></div>
          ${blocks.map((b) => `
            <div class="cc-api-target-block">
              ${b.label ? `<div class="cc-api-target-label">${this.escapeHtml(b.label)}</div>` : ''}
              <ul class="cc-api-target-list">
                ${b.ages ? `<li>${this.escapeHtml(b.ages)}</li>` : ''}
                ${b.genders ? `<li>${this.escapeHtml(b.genders)}</li>` : ''}
                ${b.interests ? `<li>${this.escapeHtml(b.interests)}</li>` : ''}
              </ul>
            </div>`).join('')}
        </div>`);
    });
    root.innerHTML = parts.join('');
  }

  _renderApiCampaignsPanel() {
    const root = document.getElementById('ccApiCampWrap');
    if (!root) return;
    const metaInts = (this._integrations || []).filter((i) => this._isMetaIntegration(i.platform));
    if (!metaInts.length) {
      root.innerHTML = `<div class="cc-api-hint">Conecta Meta para listar campañas activas/inactivas y métricas sincronizadas.</div>`;
      return;
    }
    const rows = [];
    metaInts.forEach((intg) => {
      const meta = (intg.metadata && typeof intg.metadata === 'object') ? intg.metadata : {};
      const list = this._campaignListFromMetadata(meta);
      const account = this.escapeHtml(intg.external_account_name || intg.platform || 'Cuenta');
      if (!list.length) {
        rows.push(`
          <div class="cc-api-card">
            <div class="cc-api-card-head"><span class="cc-api-card-title">${account}</span></div>
            <p class="cc-api-hint">Sin campañas en metadata. Un sync desde el backend puede poblar <code>metadata.campaigns</code> con insights.</p>
          </div>`);
        return;
      }
      const active = [];
      const inactive = [];
      list.forEach((c) => {
        const st = String(c.effective_status || c.status || '').toUpperCase();
        if (st === 'ACTIVE') active.push(c);
        else inactive.push(c);
      });
      const renderCamp = (c) => {
        const name = this.escapeHtml(c.name || c.id || 'Campaña');
        const st = String(c.effective_status || c.status || '—').toUpperCase();
        const ins = this._firstInsight(c);
        const imp = ins ? this._formatInsightNumber(ins.impressions) : '—';
        const reach = ins ? this._formatInsightNumber(ins.reach) : '—';
        const clk = ins ? this._formatInsightNumber(ins.clicks) : '—';
        const spend = ins && ins.spend != null ? this._formatInsightNumber(ins.spend) : '—';
        const badgeClass = st === 'ACTIVE' ? 'cc-api-status cc-api-status--on' : 'cc-api-status cc-api-status--off';
        return `
          <div class="cc-api-camp-row">
            <div class="cc-api-camp-row-top">
              <span class="cc-api-camp-name">${name}</span>
              <span class="${badgeClass}">${this.escapeHtml(st)}</span>
            </div>
            <div class="cc-api-camp-stats">
              <span>Impresiones ${imp}</span>
              <span>Alcance ${reach}</span>
              <span>Clics ${clk}</span>
              <span>Gasto ${spend}</span>
            </div>
          </div>`;
      };
      rows.push(`
        <div class="cc-api-card">
          <div class="cc-api-card-head"><span class="cc-api-card-title">${account}</span></div>
          <div class="cc-api-camp-split">
            <div>
              <div class="cc-api-subhead">Activas</div>
              ${active.length ? active.map(renderCamp).join('') : '<p class="cc-api-hint">Ninguna activa en los datos actuales.</p>'}
            </div>
            <div>
              <div class="cc-api-subhead">Inactivas / otras</div>
              ${inactive.length ? inactive.map(renderCamp).join('') : '<p class="cc-api-hint">Ninguna inactiva listada.</p>'}
            </div>
          </div>
        </div>`);
    });
    root.innerHTML = rows.join('');
  }
}

window.CommandCenterView = CommandCenterView;
