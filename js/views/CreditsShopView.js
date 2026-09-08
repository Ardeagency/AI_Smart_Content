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
      if (this.supabase) {
        const { data: orgData } = await this.supabase
          .from('organizations')
          .select('id, name')
          .eq('id', this.orgId)
          .maybeSingle();
        if (orgData) this.org = orgData;
      }
    } catch (e) {
      console.error('CreditsShopView initSupabase:', e);
    }
  }

  async loadPackages() {
    if (!this.supabase) return;
    const { data } = await this.supabase
      .from('credit_packages')
      .select('id, name, credits, price_usd, bonus_credits, is_popular, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    this.packages = (data || []).map((p) => ({
      id: p.id, name: p.name, credits: p.credits, bonus: p.bonus_credits || 0,
      price: Number(p.price_usd) || 0, popular: !!p.is_popular,
    }));
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
                <span class="credits-pack-price">$${p.price}</span>
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

  _onBuyClick(e) {
    const packId = e.currentTarget.getAttribute('data-pack-id');
    if (!packId) return;
    if (!window.billingService) {
      const msg = __('Billing service no disponible. Recarga la página.');
      this.showNotification?.(msg, 'error') || alert(msg);
      return;
    }
    window.billingService.startCheckout({
      target:    'package',
      packageId: packId,
      gateway:   'auto',
    });
  }
}

window.CreditsShopView = CreditsShopView;
