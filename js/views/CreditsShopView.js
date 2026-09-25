/**
 * CreditsShopView — /credits: el SALDO de créditos de la marca y en qué se fue.
 * Solo lectura.
 *
 * Antes era la tienda de paquetes. La compra está CERRADA por ADR-0042 (paquetes
 * al ~12 % del costo): no basta el candado PAGOS_HABILITADOS de ApiV2, la consola
 * no enseña ni el precio ni el botón (test/creditos-sin-compra.test.js lo vigila).
 * Cuando un ADR sustituya a 0042, la compra vuelve como página propia.
 *
 * Datos: saldo por PlanesDatos.cargar (billing.available/balance), consumo de los
 * últimos 30 días por OrganizacionDatos.uso (billing.usage_records). Sin
 * ver_facturacion el consumo dice que falta el permiso, no «0».
 */
class CreditsShopView extends BaseView {
  constructor() {
    super();
    this.orgId = null;
    this.creditos = null;
    this.consumo = null;
  }

  async onEnter() {
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    this.orgId = this.routeParams?.orgId || window.currentOrgId || null;
    if (!this.orgId) {
      const uid = window.authService?.getCurrentUser()?.id;
      const url = uid && window.authService?.getDefaultUserRoute ? await window.authService.getDefaultUserRoute(uid) : '/home';
      window.router?.navigate(url, true);
    }
  }

  async render() {
    await super.render();
    this.updateHeaderContext(__('Créditos'), null, window.currentOrgName || null);
    if (!this.orgId) return;
    await this.cargar();
    this.pintar();
  }

  async cargar() {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - 29 * 24 * 60 * 60 * 1000);
    try {
      const planes = window.PlanesDatos ? await window.PlanesDatos.cargar(this.orgId) : null;
      this.creditos = planes?.orgCredits || null;
    } catch (e) {
      console.warn('[creditos] saldo:', e?.message || e);
    }
    try {
      const disponibles = this.creditos ? this.creditos.credits_available : undefined;
      this.consumo = window.OrganizacionDatos ? await window.OrganizacionDatos.uso(this.orgId, desde, hasta, disponibles) : null;
    } catch (e) {
      console.warn('[creditos] consumo:', e?.message || e);
    }
  }

  // ─── render ───────────────────────────────────────────────────────────

  renderHTML() {
    return `
      <div class="creditos-page">
        <header class="creditos-cabecera">
          <p class="creditos-eyebrow">${__('Créditos de la marca')}</p>
          <h1 class="creditos-titulo">${__('Saldo y consumo')}</h1>
        </header>
        <div id="creditosCuerpo" class="creditos-cuerpo" aria-busy="true">
          <div class="creditos-cifras">
            <div class="creditos-cifra skeleton"></div><div class="creditos-cifra skeleton"></div><div class="creditos-cifra skeleton"></div>
          </div>
        </div>
      </div>
    `;
  }

  /** Créditos: FLOOR a 4 decimales (ADR-0040), sin ceros de relleno. */
  cr(n) {
    const v = Math.floor((Number(n) || 0) * 10000) / 10000;
    return v.toLocaleString(window.i18n?.locale || 'es', { maximumFractionDigits: 4 });
  }

  pintar() {
    const el = this.querySelector('#creditosCuerpo');
    if (!el) return;
    el.removeAttribute('aria-busy');
    const c = this.creditos;
    const u = this.consumo;
    const fecha = (d) => d.toLocaleDateString(window.i18n?.locale || 'es', { day: 'numeric', month: 'long' });

    const cifras = c ? `
      <div class="creditos-cifras">
        <div class="creditos-cifra">
          <span class="creditos-cifra-rotulo">${__('Disponibles')}</span>
          <span class="creditos-cifra-valor">${this.cr(c.credits_available)}</span>
        </div>
        <div class="creditos-cifra">
          <span class="creditos-cifra-rotulo">${__('Reservados en producciones en curso')}</span>
          <span class="creditos-cifra-valor">${this.cr(c.retenido)}</span>
        </div>
        <div class="creditos-cifra">
          <span class="creditos-cifra-rotulo">${__('Gastados en 30 días')}</span>
          <span class="creditos-cifra-valor">${u && !u.pendiente ? this.cr(u.total) : '—'}</span>
        </div>
      </div>` : `<p class="creditos-nota">${__('No pudimos leer el saldo de la marca. Recarga la página en un momento.')}</p>`;

    let detalle = '';
    if (u?.sinPermiso) {
      detalle = `<p class="creditos-nota">${__('Tu rol no puede ver el consumo de esta marca.')}</p>`;
    } else if (u && !u.pendiente) {
      const porQue = Object.values(u.porKind || {}).sort((a, b) => b.creditos - a.creditos).slice(0, 6);
      detalle = `
        ${u.seAgotan ? `<p class="creditos-nota">${__('Al ritmo de este mes, el saldo alcanza hasta el {fecha}.', { fecha: this.escapeHtml(fecha(u.seAgotan)) })}</p>` : ''}
        <section class="creditos-bloque" aria-labelledby="creditosEnQue">
          <h2 class="creditos-subtitulo" id="creditosEnQue">${__('En qué se fueron')}</h2>
          ${porQue.length ? `<ul class="creditos-lista">${porQue.map((k) => `
            <li class="creditos-fila">
              <span class="creditos-fila-nombre">${this.escapeHtml(k.nombre)}</span>
              <span class="creditos-fila-veces">${__('{n} usos', { n: Number(k.eventos) || 0 })}</span>
              <span class="creditos-fila-valor">${this.cr(k.creditos)}</span>
            </li>`).join('')}</ul>` : `<p class="creditos-nota">${__('Sin consumo en los últimos 30 días.')}</p>`}
        </section>`;
    }

    const usoHref = this.rutaDeOrg('/organization/usage');
    window.Estado.pintar(el, `
      ${cifras}
      ${detalle}
      <p class="creditos-pie">
        <a href="${this.escapeHtml(usoHref)}" data-route="${this.escapeHtml(usoHref)}" class="creditos-enlace">${__('Ver el consumo por día y por persona')}</a>
        · ${__('¿Necesitas más créditos? Escríbenos a {correo}.', { correo: '<a class="creditos-enlace" href="mailto:contact@aismartcontent.io">contact@aismartcontent.io</a>' })}
      </p>`);
    const a = el.querySelector('a[data-route]');
    if (a) this.addEventListener(a, 'click', (e) => { e.preventDefault(); window.router?.navigate(usoHref); });
  }

  rutaDeOrg(sufijo) {
    const prefijo = window.getOrgPathPrefix && window.currentOrgName ? window.getOrgPathPrefix(this.orgId, window.currentOrgName) : '';
    return `${prefijo || ''}${sufijo}`;
  }
}
window.CreditsShopView = CreditsShopView;
