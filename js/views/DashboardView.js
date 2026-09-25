/**
 * DashboardView — el TABLERO de 4 pestañas (Mi Marca · Competencia · Tendencias · Estrategia)
 * con el diseño de v1, sobre la base nueva (decisión de JC, 25/09: «borramos Inicio y
 * restablecemos los 4 dashboards»; variables nuevas, mismo diseño).
 *
 * Esta clase es el CORE: la cabecera (hero con el degradado de la marca, las pestañas, «Crear
 * informe», las burbujas de integraciones y el sensor de Vera), el cambio de pestaña por hash
 * (#mi-marca, #competencia, #tendencias, #estrategia; los de v1 en inglés siguen valiendo) y los
 * ayudantes compartidos (Chart.js, colores por token, modales por Capas, «todavía no»).
 * Cada pestaña vive en su mixin (js/views/dashboard/*.mixin.js), que define
 * `_renderMyBrands`, `_renderCompetence`, `_renderTendencies` y `_renderStrategy`.
 *
 * Datos: TODO por window.DashboardDatos (js/services/DashboardDataService.js). La vista no llama
 * `.from()` ni asigna HTML a mano: pinta con window.Estado.pintar. Lo que la base todavía no
 * expone se muestra en su sitio, con el estilo de v1, como «todavía no» en palabras.
 * Contrato: Git-AISC-DB docs/contratos/dashboard.md.
 */
class DashboardView extends BaseView {
  static cacheable = false;
  static get documentTitle() { return __('Tablero'); }

  /* Pestañas: id interno (el de v1, lo usan los mixins) ↔ hash público en español. */
  static get TABS() {
    return [
      { id: 'my-brands',  hash: 'mi-marca',    scope: 'mi_marca',   label: __('Mi Marca') },
      { id: 'competence', hash: 'competencia', scope: 'monitoreo',  label: __('Competencia') },
      { id: 'tendencies', hash: 'tendencias',  scope: 'tendencias', label: __('Tendencias') },
      { id: 'strategy',   hash: 'estrategia',  scope: 'estrategia', label: __('Estrategia') },
    ];
  }

  constructor() {
    super();
    this._activeTab = this._tabDelHash();
    this._charts = [];
    this._orgId = null;
    this._onHashChange = null;
  }

  /** La pestaña del hash (#competencia o el #competence de v1); si no hay, Mi Marca. */
  _tabDelHash() {
    const h = (typeof location !== 'undefined' ? (location.hash || '') : '').replace(/^#/, '');
    const t = DashboardView.TABS.find((x) => x.hash === h || x.id === h);
    return t ? t.id : 'my-brands';
  }

  async onEnter() {
    // La sesión la exige el router (ruta auth) y la marca sale de la URL.
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const c = this.routeParams?.orgId || window.currentOrgId || null;
    this._orgId = uuid.test(String(c || '')) ? c : null;
  }

  renderHTML() {
    return `
      <div class="insight-page page-content insight-page--hero" id="insightPage">
        ${this._buildHero(this._activeTab)}
        <div class="insight-tab-body" id="insightTabBody"></div>
      </div>`;
  }

  async render() {
    await super.render();
    this.updateHeaderContext('Dashboard', null, window.currentOrgName || '');
    this.clearSubnavFromHeader();
    this._setupHero();
    this._setupTabs();
    this._mountVeraPulse();
    this._subscribeRealtime();
    this._renderTab(this._activeTab);
    this._loadHeroLogo();
    this._cargarCabecera();
  }

  /* ── Cabecera (hero) ─────────────────────────────────────────────────── */

  _buildHero(tabId) {
    return `
      <section class="dash-hero" id="dashHero" data-tab="${this._esc(tabId)}" aria-label="${this._esc(__('Resumen del tablero'))}">
        <div class="dash-hero-grad" aria-hidden="true"></div>
        <div class="dash-hero-inner">
          <nav class="dash-hero-tabs" id="dashHeroTabs" role="tablist">
            ${DashboardView.TABS.map((t) => `
              <button type="button" class="dash-hero-tab${this._activeTab === t.id ? ' is-active' : ''}" role="tab" aria-selected="${this._activeTab === t.id}" data-tab="${t.id}">${this._esc(t.label)}</button>`).join('')}
          </nav>
          <div class="dash-hero-actions" id="dashHeroActions">${this._buildTabFiltersBar()}</div>
        </div>
      </section>`;
  }

  /** La barra del hero: «Crear informe», las burbujas de integraciones, la frescura y el sensor de Vera. */
  _buildTabFiltersBar() {
    return `
      <header class="living-history-filters mb-filters-bar">
        ${this._reportDropdown()}
        ${this._buildIntegrationBubbles()}
        ${this._freshnessChip()}
      </header>
      <div class="dash-hero-pulse" id="veraPulseHost"></div>`;
  }

  /* «Crear informe»: los cuatro informes nunca existieron (en v1 decían «próximamente»). Se
     listan como lo que son: todavía no. */
  _reportDropdown() {
    const opts = [__('Informes de competencia'), __('Diagnóstico de marca'), __('Informes de ventas'), __('Research de productos')];
    return `
      <details class="dash-report-dd">
        <summary class="dash-report-btn"><i class="aisc-ico aisc-ico--document" aria-hidden="true"></i><span>${this._esc(__('Crear informe'))}</span><i class="aisc-ico dash-report-caret aisc-ico--chevron-down" aria-hidden="true"></i></summary>
        <div class="dash-report-menu">
          ${opts.map((l) => `<button type="button" class="dash-report-item" data-report="${this._esc(l)}" aria-disabled="true">${this._esc(l)}<span class="dash-report-pronto">${this._esc(__('todavía no'))}</span></button>`).join('')}
        </div>
      </details>`;
  }

  _buildIntegrationBubbles() {
    const list = Array.isArray(this._heroIntegrations) ? this._heroIntegrations : [];
    const META = {
      instagram: { icon: 'fab fa-instagram', label: 'Instagram' },
      facebook: { icon: 'fab fa-facebook', label: 'Facebook' },
      tiktok: { icon: 'fab fa-tiktok', label: 'TikTok' },
      x: { icon: 'fab fa-x-twitter', label: 'X' },
      youtube: { icon: 'fab fa-youtube', label: 'YouTube' },
      linkedin: { icon: 'fab fa-linkedin', label: 'LinkedIn' },
      google: { icon: 'fab fa-google', label: 'Google' },
      shopify: { icon: 'fab fa-shopify', label: 'Shopify' },
      mercadolibre: { iconSrc: '/recursos/icons/mercadolibre.svg', label: 'Mercado Libre' },
    };
    const bubbles = list.map((p) => {
      const m = META[p] || { iconSrc: '/recursos/icons/store.svg', label: this._capitalize(p) };
      const inner = m.iconSrc ? `<img src="${this._esc(m.iconSrc)}" alt="" aria-hidden="true">` : `<i class="${this._esc(m.icon)}" aria-hidden="true"></i>`;
      return `<span class="dash-integ-bubble" title="${this._esc(m.label)}" aria-label="${this._esc(m.label)}">${inner}</span>`;
    }).join('');
    return `
      <div class="dash-integ" role="group" aria-label="${this._esc(__('Integraciones activas'))}">
        ${bubbles}
        <button type="button" class="dash-integ-bubble dash-integ-add" data-action="add-integration" title="${this._esc(__('Agregar integración'))}" aria-label="${this._esc(__('Agregar integración'))}"><i class="aisc-ico aisc-ico--add" aria-hidden="true"></i></button>
      </div>`;
  }

  /* «Datos al …» (ingest.frescura, P3). Más de 3 días = datos viejos, y lo dice con la fecha;
     sin la vista, no se inventa una frescura. */
  _freshnessChip() {
    const f = this._freshness;
    if (!f) return '';
    const ts = ({ 'my-brands': f.own_posts, competence: f.competitor_posts }[this._activeTab]) || f.latest;
    if (!ts) return '';
    const dias = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
    const fecha = this._fmtFecha(ts);
    const viejo = dias > 3;
    const txt = viejo ? __('Datos viejos: al {fecha}', { fecha }) : __('Datos al {fecha}', { fecha });
    const title = f.agendas_activas ? __('Última captura de datos') : __('La cosecha está en pausa: los datos no se actualizan solos');
    return `<span class="dash-freshness${viejo ? ' dash-freshness--stale' : ''}" title="${this._esc(title)}">${this._esc(txt)}</span>`;
  }

  _fmtFecha(ts) {
    try {
      const loc = (window.i18n && window.i18n.getLocale && window.i18n.getLocale() === 'en') ? 'en-US' : 'es-CO';
      return new Date(ts).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return String(ts || '').slice(0, 10); }
  }

  /** Burbujas, frescura: se leen en paralelo y repintan solo la barra (el sensor se re-monta). */
  async _cargarCabecera() {
    const D = window.DashboardDatos;
    if (!D || !this._orgId) return;
    const [integ, fr] = await Promise.all([D.integraciones(this._orgId), D.frescura(this._orgId)]);
    this._heroIntegrations = integ.falta ? [] : integ.datos;
    this._freshness = fr.falta ? null : fr.datos;
    this._renderHeroActions();
  }

  _renderHeroActions() {
    const host = document.getElementById('dashHeroActions');
    if (!host) return;
    window.Estado.pintar(host, this._buildTabFiltersBar());
    this._mountVeraPulse();
  }

  /* Marca de agua: el logo de la marca (organizations.logo_url), siempre en blanco tenue. */
  async _loadHeroLogo() {
    const hero = document.getElementById('dashHero');
    if (!hero || !window.DashboardDatos || !this._orgId) return;
    if (this._orgLogoUrl === undefined) {
      const r = await window.DashboardDatos.marca(this._orgId);
      this._orgLogoUrl = r.datos ? r.datos.logo_url : null;
    }
    if (!this._orgLogoUrl || hero.querySelector('.dash-hero-logo')) return;
    const img = document.createElement('img');
    img.className = 'dash-hero-logo';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.hidden = true;
    hero.querySelector('.dash-hero-grad')?.after(img);
    img.onload = () => { img.hidden = false; img.classList.add('is-entering'); };
    img.onerror = () => { img.hidden = true; };
    img.src = this._orgLogoUrl;
  }

  /* Sensor de Vera: VeraPulse con las lecturas de ai.pulso / ai.bitacora (P3). */
  _mountVeraPulse() {
    const host = document.getElementById('veraPulseHost');
    if (!host || typeof window.VeraPulse !== 'function' || !this._orgId) return;
    if (!this._veraPulse) this._veraPulse = new window.VeraPulse({ orgId: this._orgId, datos: window.DashboardDatos });
    this._veraPulse.mount(host);
  }

  _setupHero() {
    const hero = document.getElementById('dashHero');
    if (!hero || hero._wired) return;
    hero._wired = true;
    hero.addEventListener('click', (e) => {
      const tab = e.target.closest('.dash-hero-tab[data-tab]');
      if (tab) { this._switchTab(tab.dataset.tab, true); return; }
      const rep = e.target.closest('[data-report]');
      if (rep) {
        e.preventDefault();
        rep.closest('details')?.removeAttribute('open');
        window.showToast?.(__('{informe}: todavía no. Los informes llegan cuando Vera los pueda escribir sobre la base nueva.', { informe: rep.dataset.report }), { type: 'info' });
        return;
      }
      if (e.target.closest('[data-action="add-integration"]')) {
        e.preventDefault();
        window.router?.navigate(`${this._prefijo()}/configuracion/integraciones`);
      }
    });
    // Cerrar el menú de «Crear informe» al hacer clic fuera.
    this._fueraHandler = (e) => {
      document.querySelectorAll('details.dash-report-dd[open]').forEach((dd) => { if (!dd.contains(e.target)) dd.removeAttribute('open'); });
    };
    document.addEventListener('click', this._fueraHandler);
  }

  _prefijo() {
    const nombre = window.currentOrgName || '';
    return (this._orgId && typeof window.getOrgPathPrefix === 'function') ? window.getOrgPathPrefix(this._orgId, nombre) : '';
  }

  /* ── Pestañas ────────────────────────────────────────────────────────── */

  _setupTabs() {
    if (this._onHashChange) return;
    this._onHashChange = () => {
      const t = this._tabDelHash();
      if (t !== this._activeTab) this._switchTab(t, false);
    };
    window.addEventListener('hashchange', this._onHashChange);
  }

  _switchTab(tabId, fromUser) {
    if (!tabId || tabId === this._activeTab) return;
    this._destroyCharts();
    this._activeTab = tabId;
    if (fromUser) {
      const t = DashboardView.TABS.find((x) => x.id === tabId);
      try { history.replaceState(history.state, '', `${location.pathname}${location.search}#${t ? t.hash : tabId}`); } catch (e) { location.hash = t ? t.hash : tabId; }
    }
    const hero = document.getElementById('dashHero');
    if (hero) {
      hero.dataset.tab = tabId;
      hero.querySelectorAll('.dash-hero-tab').forEach((b) => {
        const on = b.dataset.tab === tabId;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', String(on));
      });
    }
    this._renderHeroActions();
    this._renderTab(tabId);
  }

  async _renderTab(tabId) {
    const body = document.getElementById('insightTabBody');
    if (!body) return;
    this._bodyTab = tabId;
    delete body.dataset.bgridBound;
    delete body.dataset.cgridBound;
    window.Estado.pintar(body, `<div class="dash-skeleton">${window.Estado.cargando('tarjetas', 6)}</div>`);
    if (!this._orgId) {
      window.Estado.pintar(body, window.Estado.vacio({ titulo: __('Elige una marca'), texto: __('El tablero se lee por marca: abre una desde el menú.') }));
      return;
    }
    const pintores = { 'my-brands': '_renderMyBrands', competence: '_renderCompetence', tendencies: '_renderTendencies', strategy: '_renderStrategy' };
    const fn = this[pintores[tabId]];
    if (typeof fn !== 'function') return;
    window.Estado.pintar(body, '');
    try {
      await fn.call(this, body);
    } catch (err) {
      console.error(`[Dashboard] ${tabId}:`, err);
      if (this._activeTab === tabId) {
        window.Estado.pintar(body, window.Estado.error({ titulo: __('No se pudo cargar esta pestaña'), texto: err?.message || '' }));
        window.Estado.alReintentar(body, () => this._renderTab(tabId));
      }
    }
  }

  /** ¿Sigue siendo esta la pestaña a la vista? (un pintado lento no pisa la pestaña nueva) */
  _sigue(tabId) { return this._activeTab === tabId && this._bodyTab === tabId; }

  /* ── Realtime: Vera publica una lectura y la pestaña se repinta sola ───── */

  _subscribeRealtime() {
    if (!this._orgId || this._liveChannels?.length) return;
    this.liveSubscribe([{
      name: 'lecturas', schema: 'marketing', table: 'readings', filter: `organization_id=eq.${this._orgId}`,
      onChange: (payload) => {
        const scope = payload?.new?.evidence?.scope || payload?.old?.evidence?.scope;
        const t = DashboardView.TABS.find((x) => x.scope === scope || (scope === 'diagnostico' && x.id === 'my-brands'));
        if (t && t.id === this._activeTab && document.getElementById('insightTabBody')) this._renderTab(t.id);
      },
    }]);
  }

  /* ── Ayudantes compartidos por los mixins ─────────────────────────────── */

  async _ensureChartJs() {
    if (window.Chart) return;
    await this.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js', 'Chart', 8000);
  }

  /** Registra un Chart.js para destruirlo al salir o al cambiar de pestaña. */
  _reg(chart) { this._charts.push(chart); return chart; }

  _destroyCharts() {
    this._charts.forEach((c) => { try { c.destroy(); } catch (e) { console.warn('[Dashboard] chart:', e?.message); } });
    this._charts = [];
  }

  _esc(s) { return this.escapeHtml(s == null ? '' : String(s)); }

  _capitalize(s) { const t = String(s || ''); return t.charAt(0).toUpperCase() + t.slice(1); }

  _compactNum(n) {
    const v = Number(n) || 0;
    const a = Math.abs(v);
    if (a >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
    return String(Math.round(v));
  }

  /** Valor resuelto de un token CSS (--org-primary, --prisma-azul…), para Chart.js y canvas. */
  _tok(nombre, respaldo = '--accent') {
    const cs = getComputedStyle(document.documentElement);
    return (cs.getPropertyValue(nombre) || '').trim() || (respaldo ? (cs.getPropertyValue(respaldo) || '').trim() : '');
  }

  /** [r, g, b] de un color CSS resuelto (#rgb, #rrggbb o rgb[a](…)). */
  _rgbDe(color) {
    const s = String(color || '').trim();
    const m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const r = s.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    return r ? [Number(r[1]), Number(r[2]), Number(r[3])] : [255, 255, 255];
  }

  _rgba(color, alfa) { const [r, g, b] = this._rgbDe(color); return `rgba(${r},${g},${b},${alfa})`; }

  /** Colores de los datos de la MARCA (--org-*, los pone OrgBrandTheme). Nunca negro: se pintan sobre oscuro. */
  _coloresMarca() {
    const vivo = (c) => { const [r, g, b] = this._rgbDe(c); return (r + g + b) > 180; };
    const lista = ['--org-color-light', '--org-primary', '--org-color-mid', '--org-secondary', '--org-color-dark'].map((t) => this._tok(t, null)).filter(Boolean);
    const vivos = lista.filter(vivo);
    return vivos.length ? vivos : [this._tok('--accent')];
  }

  /** Paleta de la PLATAFORMA para series categóricas (el prisma, orden fijo: nunca se cicla distinto). */
  _coloresPlataforma() {
    return ['--prisma-azul', '--prisma-naranja', '--prisma-verde', '--prisma-amarillo', '--prisma-fucsia', '--prisma-violeta'].map((t) => this._tok(t));
  }

  /** Tinta de los ejes y la rejilla de Chart.js, por token. */
  _tintaCharts() {
    return {
      tick: this._tok('--text-muted'),
      grid: this._tok('--white-6'),
      tooltip: { backgroundColor: this._tok('--bg-card'), borderColor: this._tok('--border-color'), borderWidth: 1, titleColor: this._tok('--text-primary'), bodyColor: this._tok('--text-secondary'), padding: 10 },
    };
  }

  /** Modal de la plataforma (Capas, principal): devuelve la capa con su cuerpo ya pintado. */
  _modal({ titulo = '', html = '', clase = '', tamano = null } = {}) {
    if (!window.Capas) return null;
    const c = window.Capas.abrir({ forma: 'principal', titulo, clase: `dash-modal ${clase}`.trim(), tamano });
    window.Estado.pintar(c.cuerpo, html);
    return c;
  }

  /**
   * Pinta HTML en una zona (Estado.pintar) y aplica los estilos DINÁMICOS que v1 ponía en línea
   * (un atributo style con width:42%): aquí viajan como atributos y se aplican por DOM, sin `style=` en el HTML.
   *   data-w / data-h / data-l / data-t  → width / height / left / top en %
   *   data-bg / data-fg / data-bc        → background / color / border-color (un token var(--…) o un color resuelto)
   *   data-ar="W / H" · data-maxw="px"   → aspect-ratio · max-width
   *   data-var="--nombre:valor;--otra:valor" → custom properties
   */
  _pintar(zona, html) {
    if (!zona) return zona;
    window.Estado.pintar(zona, html);
    this._vestir(zona);
    return zona;
  }

  _vestir(raiz) {
    if (!raiz || !raiz.querySelectorAll) return;
    const pct = (v) => `${Math.max(0, Math.min(100, Number(v) || 0))}%`;
    const todos = [raiz, ...raiz.querySelectorAll('[data-w],[data-h],[data-l],[data-t],[data-bg],[data-fg],[data-bc],[data-ar],[data-maxw],[data-var]')];
    for (const el of todos) {
      const d = el.dataset || {};
      if (d.w != null) el.style.width = pct(d.w);
      if (d.h != null) el.style.height = pct(d.h);
      if (d.l != null) el.style.left = pct(d.l);
      if (d.t != null) el.style.top = pct(d.t);
      if (d.bg) el.style.background = d.bg;
      if (d.fg) el.style.color = d.fg;
      if (d.bc) el.style.borderColor = d.bc;
      if (d.ar) el.style.aspectRatio = d.ar;
      if (d.maxw) el.style.maxWidth = `${Number(d.maxw) || 0}px`;
      if (d.var) String(d.var).split(';').forEach((par) => { const i = par.indexOf(':'); if (i > 0) el.style.setProperty(par.slice(0, i).trim(), par.slice(i + 1).trim()); });
    }
  }

  /** Nodos a partir de HTML (para insertar antes/después de algo sin asignar HTML a mano). */
  _nodos(html) {
    const tmp = document.createElement('div');
    this._pintar(tmp, html);
    return [...tmp.childNodes];
  }

  /** «Todavía no» en su sitio, con el estilo de la sección: qué falta, en palabras. */
  _todaviaNo(titulo, texto) {
    // El rótulo «TODAVÍA NO» ya lo pone el estado: si el título lo repetiría, el texto pasa a ser el título.
    if (!titulo || titulo === __('Todavía no')) {
      return `<div class="estado estado--todavia-no" role="status"><span class="en-obras-eyebrow">${this._esc(__('TODAVÍA NO'))}</span><p class="estado__titulo">${this._esc(texto || '')}</p></div>`;
    }
    return window.Estado.todaviaNo({ titulo, texto });
  }

  /** Por qué falta una lectura del servicio, en palabras (vista sin aplicar, permiso o sin datos). */
  _faltaTexto(r, sinDatos) {
    if (r && r.falta === 'permiso') return __('Tu rol no tiene permiso para ver esta parte del tablero.');
    if (r && r.falta === 'error') return __('No se pudo leer ahora. Vuelve a intentarlo en un momento.');
    return sinDatos;
  }

  async onLeave() {
    this._destroyCharts();
    this.liveUnsubscribe();
    try { this._veraPulse?.destroy(); } catch (e) { console.warn('[Dashboard] pulso:', e?.message); }
    this._veraPulse = null;
    if (this._onHashChange) { window.removeEventListener('hashchange', this._onHashChange); this._onHashChange = null; }
    if (this._fueraHandler) { document.removeEventListener('click', this._fueraHandler); this._fueraHandler = null; }
    (this._veraLatidos || []).forEach((t) => clearTimeout(t));
    this.cleanup();
  }
}

window.DashboardView = DashboardView;
