/**
 * CreditsShopView — /creditos: comprar créditos extra. Nada más.
 *
 * Esta vista era un tablero de 784 líneas: saldo, plan, gráfico de consumo a
 * 7/30/90 días, alertas y auto-recarga, consumo por miembro con exportación a
 * CSV, e historial paginado. Todo eso se retiró el 2026-09-08 por decisión del
 * usuario: /plans y /creditos son la MISMA página con distinta mercancía —una
 * vende el plan del mes, la otra créditos sueltos— y la tienda no tiene por qué
 * cargar con la analítica.
 *
 * Lo retirado NO se perdió: vive en el historial de git, y las tablas que leía
 * (credit_usage, credit_alert_prefs) siguen intactas. Si el tablero vuelve, es
 * como página propia, no colgado de la tienda.
 *
 * El efecto secundario que importa: la vista pasa de cinco consultas y un
 * barrido de credit_usage a UNA sola lectura de credit_packages.
 *
 * Corte ADR-0052 (16/09): los paquetes salen de `window.PlanesDatos.paquetes()`
 * (billing.credit_packages, precio en su moneda) y la compra va por el borde
 * (`POST /v1/pagos/iniciar` → widget de Wompi). Hasta reprecificar (ADR-0042)
 * ApiV2 tiene el candado PAGOS_HABILITADOS=false: el botón avisa, no cobra.
 */
class CreditsShopView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.orgId = null;
    this.org = null;
    this.packages = [];
    this._starfield = null;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }

    this.orgId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');

    if (!this.orgId) {
      const url = window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
        ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
        : '/create';
      window.router?.navigate(url, true);
      return;
    }

    if (window.appState) window.appState.set('selectedOrganizationId', this.orgId, true);
    localStorage.setItem('selectedOrganizationId', this.orgId);
  }

  async render() {
    await super.render();
    await this.initSupabase();
    await this.loadPackages();
    this.renderPacks();
    this.bindEvents();

    this._starfield = window.Starfield ? new window.Starfield() : null;
    if (this._starfield) this._starfield.start();

    this.updateHeaderContext(__('Créditos'), null, this.org?.name || null);
  }

  /** El router llama destroy() al salir: sin esto el canvas y su rAF sobreviven
   *  a la vista y siguen pintando encima de las demás páginas. */
  destroy() {
    if (this._starfield) {
      this._starfield.stop();
      this._starfield = null;
    }
    super.destroy();
  }

  // ─── data ─────────────────────────────────────────────────────────────

  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      }
      // El nombre de la marca ya está en el contexto de arranque (mi_contexto).
      const org = window.contextoService?.org?.(this.orgId) || null;
      this.org = org ? { id: org.id, name: org.name } : { id: this.orgId, name: window.currentOrgName || null };
    } catch (e) {
      console.error('CreditsShopView initSupabase:', e);
    }
  }

  async loadPackages() {
    this.packages = window.PlanesDatos ? await window.PlanesDatos.paquetes() : [];
  }

  /** Precio en su moneda: COP sin decimales (240.000 COP), USD con símbolo. */
  formatPrecio(p) {
    const n = Number(p.price) || 0;
    if (p.currency === 'USD') return `$${n.toLocaleString('en-US')}`;
    return `${n.toLocaleString('es-CO')} ${this.escapeHtml(p.currency || 'COP')}`;
  }

  // ─── render ───────────────────────────────────────────────────────────

  renderHTML() {
    return `
      <div class="credits-page">
        <header class="credits-hero">
          <div class="credits-hero-content">
            <p class="credits-hero-eyebrow">${__('Pago único · Se suman a tu saldo · No expiran')}</p>
            <div id="creditsPacks"></div>
          </div>
        </header>
      </div>
    `;
  }

  renderPacks() {
    const el = this.querySelector('#creditsPacks');
    if (!el) return;
    if (!this.packages.length) {
      el.innerHTML = `<div class="credits-empty">${__('No hay paquetes disponibles.')}</div>`;
      return;
    }
    // Lista, no galeria: los paquetes se diferencian en UNA variable (cuantos
    // creditos por cuanta plata). Puestos en columna, las cifras quedan alineadas
    // y se comparan de un vistazo; en rejilla el ojo tiene que saltar en zigzag.
    el.innerHTML = `
      <ul class="credits-packs-list">
        ${this.packages.map((p) => {
          const total = p.credits + p.bonus;
          return `
            <li class="credits-pack-row glass-black ${p.popular ? 'is-popular' : ''}" data-pack-id="${p.id}">
              <div class="credits-pack-main">
                <div class="credits-pack-headline">
                  <span class="credits-pack-credits">${p.credits.toLocaleString('es')}<small>${__('créditos')}</small></span>
                  ${p.bonus > 0 ? `<span class="credits-pack-bonus">+${p.bonus.toLocaleString('es')} ${__('bonus')}</span>` : ''}
                  ${p.popular ? `<span class="credits-pack-badge">${__('Recomendado')}</span>` : ''}
                </div>
                <div class="credits-pack-meta">
                  ${this.escapeHtml(p.name)} · ${__('Total: {n} cr · No expiran, se acumulan', { n: total.toLocaleString('es') })}
                </div>
              </div>
              <div class="credits-pack-buyside">
                <span class="credits-pack-price">${this.formatPrecio(p)}</span>
                <button type="button" class="btn btn-primary credits-pack-buy" data-pack-id="${p.id}">
                  ${__('Comprar')}
                </button>
              </div>
            </li>
          `;
        }).join('')}
      </ul>
    `;
  }

  // ─── events ──────────────────────────────────────────────────────────

  bindEvents() {
    const root = this.container;
    if (!root) return;
    root.querySelectorAll('.credits-pack-buy').forEach((btn) => {
      this.addEventListener(btn, 'click', (e) => this._onBuyClick(e));
    });
  }

  async _onBuyClick(e) {
    const btn = e.currentTarget;
    const packId = btn.getAttribute('data-pack-id');
    if (!packId || !window.PlanesDatos) return;
    const avisar = (msg, tipo = 'error') => { if (window.showToast) window.showToast(msg, tipo); else alert(msg); };
    btn.disabled = true;
    try {
      const r = await window.PlanesDatos.iniciarCompra(this.orgId, packId);
      await this._abrirWompi(r.checkout);
    } catch (err) {
      const code = err?.code || err?.codigo;
      if (code === 'pagos_no_habilitados' || code === 'sin_api') {
        avisar(__('La compra de créditos se habilita con el corte. Escríbenos a contact@aismartcontent.io si necesitas saldo hoy.'), 'info');
      } else if (code === 'ficha_de_facturacion_incompleta') {
        avisar(__('Antes de comprar completa los datos de facturación de la marca (Organización › Suscripción).'), 'info');
        const prefix = (window.getOrgPathPrefix && window.currentOrgName) ? window.getOrgPathPrefix(this.orgId, window.currentOrgName) : '';
        window.router?.navigate(`${prefix || ''}/organization/subscription`);
      } else if (err?.http === 403) {
        avisar(__('Tu rol no puede comprar créditos en esta marca.'));
      } else {
        console.error('CreditsShopView compra:', err);
        avisar(err?.message || __('No se pudo iniciar la compra.'));
      }
    } finally {
      btn.disabled = false;
    }
  }

  /** Abre el widget de Wompi con el checkout firmado por el borde (el monto no se toca aquí). */
  async _abrirWompi(checkout) {
    if (!window.WidgetCheckout) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://checkout.wompi.co/widget.js'; s.async = true;
        s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar el widget de Wompi.'));
        document.head.appendChild(s);
      });
    }
    const w = new window.WidgetCheckout({
      currency: checkout.currency,
      amountInCents: checkout.amountInCents,
      reference: checkout.reference,
      publicKey: checkout.publicKey,
      signature: { integrity: checkout.signature?.integrity },
      redirectUrl: checkout.redirectUrl,
    });
    w.open((result) => {
      const status = result?.transaction?.status || 'UNKNOWN';
      const avisar = (msg, tipo) => { if (window.showToast) window.showToast(msg, tipo); else alert(msg); };
      if (status === 'APPROVED') avisar(__('Pago aprobado. El saldo se actualiza en unos segundos.'), 'success');
      else if (status === 'PENDING') avisar(__('Pago en proceso. Te avisamos cuando se confirme.'), 'info');
      else avisar(__('Pago no completado ({estado}). Intenta de nuevo.', { estado: status }), 'error');
      if (window.contextoService?.cargar) window.contextoService.cargar({ fresco: true }).catch(() => {});
    });
  }
}
window.CreditsShopView = CreditsShopView;
