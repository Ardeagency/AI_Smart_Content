/**
 * TableroView — el TABLERO (/dashboard) compuesto en la consola sobre la base nueva
 * (corte ADR-0052). Los 60 `dashboard_*` de v1 no existen: el Tablero se arma con lo
 * que la base sí da (contrato competencia.md): lo que Vera opina (marketing.readings,
 * con «Lo hice» / «Ponerla en marcha» → acted_on; con evidence.produccion la base encola
 * estrategia.producir), las tendencias vivas (intel.tendencias_vivas / trends),
 * los huecos de contenido (intel.content_gaps) y la competencia de un vistazo
 * (social.profiles + intel.signals). Todo por TableroDatos; sin `.from()` aquí.
 * DashboardView.js (v1) queda como cantera, sin ruta.
 */
class TableroView extends BaseView {
  static cacheable = false;
  static get documentTitle() { return __('Inicio'); }

  constructor() {
    super();
    this.organizationId = null;
    this._datos = null;
  }

  async onEnter() {
    // La sesión la exige el router (ruta auth) y la marca sale de la URL: nada de localStorage.
    this.organizationId = this.routeParams?.orgId || window.currentOrgId || null;
  }

  renderHTML() {
    return `
<div class="insight-page tablero" id="tableroPage">
  <header class="insight-header">
    <div class="insight-header-left">
      <h1 class="insight-title">${__('Inicio')}</h1>
      <p class="insight-subtitle" id="tableroSub">${__('Lo que Vera ve de tu marca: sus lecturas, las tendencias vivas, los huecos de contenido y la competencia.')}</p>
    </div>
  </header>
  <div class="tablero-grid" id="tableroGrid">
    <section class="tablero-col tablero-col--lecturas" id="tableroLecturas">${window.Estado ? window.Estado.cargando('bloque') : ''}</section>
    <aside class="tablero-col tablero-col--lado">
      <section class="tablero-card" id="tableroCompetencia">${window.Estado ? window.Estado.cargando('texto', 3) : ''}</section>
      <section class="tablero-card" id="tableroHuecos">${window.Estado ? window.Estado.cargando('filas', 3) : ''}</section>
      <section class="tablero-card" id="tableroTendencias">${window.Estado ? window.Estado.cargando('filas', 4) : ''}</section>
    </aside>
  </div>
</div>`;
  }

  async render() {
    await super.render();
    const grid = document.getElementById('tableroGrid');
    if (grid && window.Estado) window.Estado.alReintentar(grid, () => this.render());
    try {
      await this.cargar();
    } catch (err) {
      console.error('TableroView render:', err);
      this._pintar(grid, window.Estado.error({ titulo: __('No se pudo cargar el Tablero'), texto: err?.message || '' }));
    }
  }

  /** Único punto de pintado: Estado.pintar (el HTML ya viene escapado de cada _pintarX). */
  _pintar(host, html) {
    if (host && window.Estado) window.Estado.pintar(host, html);
  }

  async cargar() {
    if (!window.TableroDatos || !this.organizationId) return;
    this._datos = await window.TableroDatos.resumen(this.organizationId);
    this._pintarLecturas();
    this._pintarCompetencia();
    this._pintarHuecos();
    this._pintarTendencias();
    this._bind();
    // Los enlaces se pintaron después de render(): engancharlos al router (sin recarga).
    this.updateLinksForRouter();
  }

  _prefijo() {
    const orgName = window.currentOrgName || '';
    return (this.organizationId && typeof window.getOrgPathPrefix === 'function') ? window.getOrgPathPrefix(this.organizationId, orgName) : '';
  }

  /** Vera con el mensaje ya escrito (?q=, mismo mecanismo que Competencia). */
  _veraUrl(prompt) {
    return `${this._prefijo()}/vera?q=${encodeURIComponent(prompt)}`;
  }

  _pintarLecturas() {
    const host = document.getElementById('tableroLecturas');
    if (!host) return;
    const L = window.LecturaVera;
    const d = this._datos;
    const pendientes = d.lecturas.filter((l) => !l.acted_on);
    const atendidas = d.lecturas.filter((l) => l.acted_on);
    if (!d.lecturas.length && !d.observaciones.length) {
      this._pintar(host, window.Estado.vacio({
        icono: 'aisc-ico aisc-ico--sparkle',
        titulo: __('Vera aún no ha escrito una lectura de esta marca.'),
        texto: __('Cuando corran las cosechas y la estrategia, aquí aparecerán sus diagnósticos y recomendaciones.'),
        accion: __('Hablar con Vera'),
      }));
      window.Estado.alAccion(host, () => window.router?.navigate(this._prefijo() + '/vera'));
      return;
    }
    const cab = (titulo, n) => `<div class="mb-section-head"><h2 class="mb-section-title">${this.escapeHtml(titulo)}</h2><span class="mb-section-hint">${n}</span></div>`;
    this._pintar(host, [
      pendientes.length ? cab(__('Lo que Vera recomienda'), pendientes.length) + pendientes.slice(0, 6).map((l, i) => L.lectura(l, { accion: true, abierto: i === 0 })).join('') : '',
      d.observaciones.length ? cab(__('Lo que Vera observó'), d.observaciones.length) + d.observaciones.slice(0, 2).map((l) => L.lectura(l)).join('') : '',
      atendidas.length ? `<details class="tablero-atendidas"><summary>${this.escapeHtml(__('Atendidas o en marcha ({n})', { n: atendidas.length }))}</summary>${atendidas.slice(0, 6).map((l) => L.lectura(l)).join('')}</details>` : '',
    ].join(''));
  }

  _pintarCompetencia() {
    const host = document.getElementById('tableroCompetencia');
    if (!host) return;
    const c = this._datos.competencia;
    const SEV = { critical: 'threat', high: 'threat', medium: 'warn', low: 'neu', info: 'neu' };
    // i18n-keep: __('Movida de un rival') __('Cambio de precio') __('Producto nuevo') __('Pico de contenido') __('Campaña nueva') __('Cambio en su sitio')
    const TIPO = { competitor_move: 'Movida de un rival', price_change: 'Cambio de precio', new_product: 'Producto nuevo', content_spike: 'Pico de contenido', new_campaign: 'Campaña nueva', site_change: 'Cambio en su sitio' };
    const tipo = (k) => (TIPO[k] ? __(TIPO[k]) : String(k || '').replace(/_/g, ' '));
    const senales = c.senales.slice(0, 5).map((s) => `
      <li class="tablero-senal vera-sev--${SEV[s.severity] || 'neu'}">
        <span class="tablero-senal-kind">${this.escapeHtml(tipo(s.kind))}</span>
        <strong>${this.escapeHtml(s.title)}</strong>
        ${s.body ? `<p>${this.escapeHtml(String(s.body).slice(0, 180))}</p>` : ''}
      </li>`).join('');
    this._pintar(host, `
      <div class="mb-section-head"><h2 class="mb-section-title">${__('Competencia')}</h2><a class="mb-section-hint" href="${this.escapeHtml(this._prefijo() + '/monitoring')}">${__('ver el monitoreo →')}</a></div>
      <div class="vera-tiles tablero-tiles">
        <div class="vera-tile"><div class="vera-tile-label">${__('rivales vigilados')}</div><div class="vera-tile-value">${c.rivales}</div></div>
        <div class="vera-tile"><div class="vera-tile-label">${__('perfiles propios')}</div><div class="vera-tile-value">${c.propios}</div></div>
      </div>
      ${senales ? `<h3 class="tablero-h3">${__('Últimas señales')}</h3><ul class="tablero-lista">${senales}</ul>` : `<p class="vera-dim">${__('Sin señales todavía: las cosechas están en pausa.')}</p>`}`);
  }

  _pintarHuecos() {
    const host = document.getElementById('tableroHuecos');
    if (!host) return;
    const h = this._datos.huecos;
    const pct = (x) => `${Math.round((Number(x) || 0) * 100)}%`;
    this._pintar(host, `
      <div class="mb-section-head"><h2 class="mb-section-title">${__('Huecos de contenido')}</h2><span class="mb-section-hint">${__('el mercado lo pide, nadie lo cubre')}</span></div>
      ${h.length ? `<ul class="tablero-lista">${h.slice(0, 6).map((g) => `
        <li class="tablero-hueco">
          <div class="tablero-hueco-head"><strong>${this.escapeHtml(g.phrase)}</strong><span class="tablero-score" title="${__('demanda {d} · cobertura {c}', { d: pct(g.demand_score), c: pct(g.coverage_score) })}">${pct(g.gap_score)}</span></div>
          ${g.angle ? `<p>${this.escapeHtml(g.angle)}</p>` : ''}
          ${g.demand_terms.length ? `<div class="tablero-chips">${g.demand_terms.slice(0, 4).map((t) => `<span class="vera-move-chip">${this.escapeHtml(t)}</span>`).join('')}</div>` : ''}
          <a class="tablero-enlace" href="${this.escapeHtml(this._veraUrl(__('Quiero producir contenido sobre «{tema}». Ángulo: {angulo}. Propón 3 piezas (formato, canal y copy) con los productos de la marca.', { tema: g.phrase, angulo: g.angle || __('el que mejor encaje') })))}">${__('pedírselo a Vera →')}</a>
          <a class="tablero-enlace" href="${this.escapeHtml(this._prefijo() + '/image')}">${__('producir una imagen →')}</a>
        </li>`).join('')}</ul>` : `<p class="vera-dim">${__('Sin huecos detectados todavía.')}</p>`}`);
  }

  _pintarTendencias() {
    const host = document.getElementById('tableroTendencias');
    if (!host) return;
    const t = this._datos.tendencias;
    const fmt = (n) => (n == null ? '' : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n * 100) / 100));
    this._pintar(host, `
      <div class="mb-section-head"><h2 class="mb-section-title">${__('Tendencias vivas')}</h2><span class="mb-section-hint">${this.escapeHtml(__('{n} activas', { n: t.length }))}${this._datos.tendenciasFuente === 'trends' ? ` · ${__('sin la última lectura hasta la 190000')}` : ''}</span></div>
      ${t.length ? `<ul class="tablero-lista tablero-tendencias">${t.slice(0, 12).map((x) => `
        <li class="tablero-tendencia">
          <span class="tablero-tendencia-kw">${this.escapeHtml(x.keyword)}</span>
          <span class="tablero-tendencia-meta">${this.escapeHtml(x.fuente)}${x.category ? ` · ${this.escapeHtml(x.category)}` : ''}${x.velocity != null ? ` · ▲ ${fmt(x.velocity)}` : ''}${x.volume != null ? ` · ${fmt(x.volume)}` : ''}${x.relevance != null ? ` · ${Math.round(x.relevance * 100)}%` : ''}</span>
        </li>`).join('')}</ul>` : `<p class="vera-dim">${__('Sin tendencias vivas todavía.')}</p>`}`);
  }

  _bind() {
    const host = document.getElementById('tableroLecturas');
    if (!host || host._bound) return;
    host._bound = true;
    host.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-lectura-actuar]');
      if (!btn) return;
      const id = btn.getAttribute('data-lectura-actuar');
      btn.disabled = true;
      try {
        const l = await window.TableroDatos.actuar(id);
        const sec = host.querySelector(`[data-lectura="${CSS.escape(id)}"]`);
        if (sec && l) {
          const nuevo = document.createElement('div');
          window.Estado.pintar(nuevo, window.LecturaVera.lectura(l));
          sec.replaceWith(...nuevo.childNodes);
        }
        if (typeof window.showToast === 'function') window.showToast(l?.produce ? __('En marcha: Vera la convierte en producción.') : __('Marcada como atendida.'));
      } catch (err) {
        btn.disabled = false;
        const msg = err?.code === '42501' ? __('No tienes permiso para marcar lecturas en esta marca.') : (err?.message || __('No se pudo marcar.'));
        window.showToast?.(msg, { type: 'error' });
      }
    });
  }

  async onLeave() {
    this.cleanup();
    this._datos = null;
  }

}

window.TableroView = TableroView;
