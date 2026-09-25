/**
 * IntegracionesView — Configuración › Integraciones (L5, 24/09): las plataformas
 * que la marca conecta, en un solo lugar. Antes vivían escondidas en el panel INFO
 * de Identidad. Conectar abre la autorización del borde y vuelve AQUÍ con
 * `?plataforma=&conectado=1&cuenta=` o `&error=`; eso se dice con un aviso.
 */
class IntegracionesView extends BaseView {
  constructor() {
    super();
    this.orgId = null;
    this.estado = { cargando: true, lista: [], sinPermiso: false, error: null };
  }

  static PLATAFORMAS = [
    { clave: 'meta', conectar: 'facebook', nombre: 'Meta', detalle: 'Facebook e Instagram: publicar y leer métricas', logo: '/recursos/logos/plataformas/meta.svg' },
    { clave: 'google', conectar: 'google', nombre: 'Google', detalle: 'Google Ads y Analytics', logo: '/recursos/logos/plataformas/google.svg' },
    { clave: 'tiktok', conectar: 'tiktok', nombre: 'TikTok', detalle: 'Publicaciones y métricas de la cuenta', logo: '/recursos/logos/plataformas/tiktok.svg' },
    { clave: 'x', conectar: 'x', nombre: 'X', detalle: 'Publicaciones y conversación', logo: '/recursos/logos/plataformas/x.svg' },
    { clave: 'linkedin', conectar: 'linkedin', nombre: 'LinkedIn', detalle: 'Página de empresa', logo: '/recursos/logos/plataformas/linkedin.svg' },
    { clave: 'shopify', conectar: 'shopify', nombre: 'Shopify', detalle: 'Catálogo y ventas de la tienda', logo: '/recursos/logos/plataformas/shopify.svg' },
    { clave: 'mercadolibre', conectar: 'mercadolibre', nombre: 'Mercado Libre', detalle: 'Publicaciones y ventas', logo: '/recursos/logos/plataformas/mercado-libre.svg' },
  ];
  /* i18n-keep: __('Facebook e Instagram: publicar y leer métricas') __('Google Ads y Analytics')
     __('Publicaciones y métricas de la cuenta') __('Publicaciones y conversación') __('Página de empresa')
     __('Catálogo y ventas de la tienda') __('Publicaciones y ventas') */

  async onEnter() {
    this.orgId = this.routeParams?.orgId || window.currentOrgId || null;
  }

  renderHTML() {
    return `
      <div class="ajustes-page">
        <header class="ajustes-cabecera">
          <h1 class="ajustes-titulo">${__('Integraciones')}</h1>
          <p class="ajustes-bajada">${__('Las cuentas que tu marca conecta. Vera las usa para leer resultados y, con tu aprobación, publicar.')}</p>
        </header>
        <div id="integracionesCuerpo"></div>
      </div>`;
  }

  async render() {
    await super.render();
    window.PestanasDeAjustes?.montar(this, 'configuracion', 'integraciones');
    this.updateHeaderContext(__('Configuración'));
    this._avisarVuelta();
    this.pintar();
    await this.cargar();
  }

  destroy() {
    window.PestanasDeAjustes?.desmontar(this);
    super.destroy();
  }

  async cargar() {
    this.estado = { cargando: true, lista: [], sinPermiso: false, error: null };
    this.pintar();
    try {
      const r = await window.IntegracionesDatos.conexiones(this.orgId);
      this.estado = { cargando: false, lista: r.lista, sinPermiso: r.sinPermiso, error: null };
    } catch (e) {
      console.warn('[integraciones] conexiones:', e?.code || '', e?.message || e);
      this.estado = { cargando: false, lista: [], sinPermiso: false, error: e };
    }
    this.pintar();
  }

  /** Vuelta del borde: ?plataforma=…&conectado=1&cuenta=… o &error=… */
  _avisarVuelta() {
    const q = new URLSearchParams(window.location.search);
    const plataforma = q.get('plataforma');
    if (!plataforma) return;
    const p = IntegracionesView.PLATAFORMAS.find((x) => x.clave === plataforma || x.conectar === plataforma);
    const nombre = p ? p.nombre : plataforma;
    if (q.get('conectado') === '1') window.showToast?.(__('{p} quedó conectada{cuenta}.', { p: nombre, cuenta: q.get('cuenta') ? ` · ${q.get('cuenta')}` : '' }), { type: 'success' });
    else if (q.get('error')) window.showToast?.(__('No se pudo conectar {p}: {e}', { p: nombre, e: q.get('error') }), { type: 'error' });
    window.history.replaceState(null, '', window.location.pathname);
  }

  pintar() {
    const el = this.querySelector('#integracionesCuerpo');
    if (!el) return;
    window.Estado.pintar(el, this._html());
    el.onclick = (e) => {
      const con = e.target.closest('[data-conectar]');
      if (con) { this._conectar(con.dataset.conectar, con); return; }
      const des = e.target.closest('[data-desconectar]');
      if (des) this._desconectar(des);
    };
  }

  /** El HTML del cuerpo según el estado (un solo punto de pintado). */
  _html() {
    const { cargando, lista, sinPermiso, error } = this.estado;
    if (cargando) {
      return `<ul class="ajustes-lista" aria-busy="true">${IntegracionesView.PLATAFORMAS.map(() => '<li class="ajustes-fila skeleton"></li>').join('')}</ul>`;
    }
    if (sinPermiso) {
      return `<p class="ajustes-nota">${__('Tu rol no puede gestionar las integraciones de esta marca. Pídeselo a quien la administra.')}</p>`;
    }
    if (error) {
      return `<p class="ajustes-nota">${__('No pudimos leer las conexiones. Recarga la página en un momento.')}</p>`;
    }
    const porPlataforma = new Map(lista.map((c) => [c.platform, c]));
    return `
      <ul class="ajustes-lista">
        ${IntegracionesView.PLATAFORMAS.map((p) => {
          const c = porPlataforma.get(p.clave);
          const activa = c && c.status === 'active';
          const estado = !c ? '' : activa
            ? `<span class="ajustes-estado is-ok">${__('Conectada')}</span>`
            : `<span class="ajustes-estado is-alerta">${c.status === 'expired' ? __('Caducó: vuelve a conectarla') : __('Con problemas')}</span>`;
          const cuenta = c?.account_name || c?.external_account_id || '';
          const accion = activa
            ? `<button type="button" class="btn btn-secondary btn-sm" data-desconectar="${this.escapeHtml(c.id)}" data-nombre="${this.escapeHtml(p.nombre)}">${__('Desconectar')}</button>`
            : `<button type="button" class="btn btn-primary btn-sm" data-conectar="${this.escapeHtml(p.conectar)}">${c ? __('Reconectar') : __('Conectar')}</button>`;
          return `
            <li class="ajustes-fila" data-plataforma="${this.escapeHtml(p.clave)}">
              <img class="ajustes-fila-logo" src="${this.escapeHtml(p.logo)}" alt="" width="28" height="28" loading="lazy">
              <div class="ajustes-fila-texto">
                <span class="ajustes-fila-nombre">${this.escapeHtml(p.nombre)} ${estado}</span>
                <span class="ajustes-fila-detalle">${this.escapeHtml(cuenta || __(p.detalle))}</span>
                ${c?.last_error && !activa ? `<span class="ajustes-fila-detalle is-alerta">${this.escapeHtml(c.last_error)}</span>` : ''}
              </div>
              ${accion}
            </li>`;
        }).join('')}
      </ul>`;
  }

  async _conectar(plataforma, boton) {
    const extra = {};
    if (plataforma === 'shopify') {
      const tienda = await this._pedirTienda(boton.closest('.ajustes-fila'));
      if (!tienda) return;
      extra.shop = tienda;
    }
    boton.disabled = true;
    try {
      window.location.href = await window.IntegracionesDatos.conectar(this.orgId, plataforma, extra);
    } catch (e) {
      boton.disabled = false;
      window.showToast?.(e?.code === 'sin_api' ? __('Las integraciones aún no están disponibles.') : (e?.message || __('No se pudo iniciar la conexión.')), { type: 'error' });
    }
  }

  /** Shopify necesita el nombre de la tienda: se pide EN la fila, sin diálogos. */
  _pedirTienda(fila) {
    return new Promise((resolve) => {
      if (!fila || fila.querySelector('.ajustes-tienda')) { resolve(null); return; }
      fila.insertAdjacentHTML('afterend', `
        <li class="ajustes-tienda">
          <label>${__('Nombre de la tienda en Shopify')}
            <span class="ajustes-tienda-campo"><input type="text" autocomplete="off" placeholder="mitienda" spellcheck="false"><span>.myshopify.com</span></span>
          </label>
          <div class="ajustes-tienda-acciones">
            <button type="button" class="btn btn-secondary btn-sm" data-tienda="cancelar">${__('Cancelar')}</button>
            <button type="button" class="btn btn-primary btn-sm" data-tienda="ok">${__('Continuar')}</button>
          </div>
        </li>`);
      const caja = fila.nextElementSibling;
      const input = caja.querySelector('input');
      input.focus();
      const cerrar = (v) => { caja.remove(); resolve(v); };
      const ok = () => {
        const v = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\.myshopify\.com.*$/, '').replace(/\/.*$/, '');
        if (!/^[a-z0-9][a-z0-9-]*$/.test(v)) { input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
        cerrar(v);
      };
      caja.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tienda]');
        if (b) (b.dataset.tienda === 'ok' ? ok() : cerrar(null));
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') cerrar(null); });
    });
  }

  async _desconectar(boton) {
    const fila = boton.closest('.ajustes-fila');
    const pregunta = { texto: __('¿Desconectar {p}? Lo publicado y las métricas ya leídas se quedan.', { p: boton.dataset.nombre }) };
    const ok = window.Capas?.preguntar ? await window.Capas.preguntar(fila, pregunta) : true;
    if (!ok) return;
    boton.disabled = true;
    try {
      await window.IntegracionesDatos.desconectar(boton.dataset.desconectar, this.orgId);
      window.showToast?.(__('{p} quedó desconectada.', { p: boton.dataset.nombre }), { type: 'success' });
      await this.cargar();
    } catch (e) {
      boton.disabled = false;
      window.showToast?.(e?.code === 'sin_api' ? __('Las integraciones aún no están disponibles.') : (e?.message || __('No se pudo desconectar.')), { type: 'error' });
    }
  }
}
window.IntegracionesView = IntegracionesView;
