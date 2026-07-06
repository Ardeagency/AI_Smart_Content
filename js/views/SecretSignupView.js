/**
 * SecretSignupView — Sign up secreto self-service (prototipo de flujo).
 *
 * Ruta NO enlazada (el "secreto" es la URL): window.SECRET_SIGNUP.base.
 * Reusa el shell del login (video de fondo + card glass + footer).
 *
 * MODO PREVIEW (window.SECRET_SIGNUP.preview === true):
 *   No crea usuarios ni llama al backend — solo navega las pantallas para
 *   revisar el flujo sin generar errores. Poner preview:false (en app.js) para
 *   activar el alta real (signUp / OAuth / finalize).
 *
 * Pantallas:
 *   cuenta          — Google / Facebook, o nombre + correo + contraseña.
 *   verify          — "verifica tu correo" (espera de confirmación).
 *   choice          — 2 cards: Crear una marca nueva / Afiliarme a una marca.
 *   affiliate       — token de invitación + clave de verificación.
 *   affiliate_done  — solicitud enviada (la org debe aceptar al invitado).
 *   plans           — versión pública de planes para crear la org.
 *   pay             — pasarela de pagos (Wompi/Stripe; apagada en demo).
 *   create-brand    — "Crea tu marca": automáticamente / manualmente.
 *   brand_done      — confirmación del modo elegido (placeholder).
 */
class SecretSignupView extends (window.BaseView || class {}) {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.step = 'cuenta';
    this._submitting = false;
    this._resendCooldownUntil = 0;
    this._cooldownTimer = null;
    this.form = { full_name: '', email: '', password: '' };
    this.createdEmail = '';
    this._hasSession = false;
    this._sessionEmail = '';
    this._plans = null;
    this._selectedPlan = null;
    this._brandMode = null;
    // Sub-flujo "Crear automáticamente" (motor reusado del modo dev, páginas propias).
    this._auto = { url: '', integrations: [] };
    this._approval = null;
    this._apIdx = 0;
    this._autoSimTimer = null;
    this._preview = !!(window.SECRET_SIGNUP && window.SECRET_SIGNUP.preview);
  }

  async updateHeader() { /* pagina publica: sin header */ }

  async onEnter() {
    await super.onEnter?.();
    try {
      this.supabase = window.supabase
        || (window.supabaseService && (await window.supabaseService.getClient()));
      if (this.supabase && !this._preview) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user && user.is_anonymous !== true) {
          this._hasSession = true;
          this._sessionEmail = user.email || '';
        }
      }
    } catch (_) { /* seguir con el registro */ }
  }

  _t(es) { return (window.__ ? window.__(es) : es); }

  _continuePath() {
    return (window.SECRET_SIGNUP && window.SECRET_SIGNUP.continue) || '/registro/continuar';
  }

  _defaultPendingOrg() {
    const name = this.form.full_name || (this.form.email || '').split('@')[0] || '';
    return { name, brand_name_oficial: name, level_of_autonomy: 'parcial', idiomas_contenido: ['es'], mercado_objetivo: [] };
  }

  // ─── Render ──────────────────────────────────────────────────────────

  renderHTML() {
    const year = new Date().getFullYear();
    const wide = (this.step === 'plans' || this.step === 'choice') ? ' ssup-card--wide' : '';
    return `
      <div class="signin-container signin-container--hero ssup-scope">
        <video class="signin-hero-video" autoplay muted loop playsinline preload="metadata"
               poster="https://res.cloudinary.com/dmruwjuxn/image/upload/v1779481981/__8_kejphv.jpg">
          <source src="https://tsdpbqcwjckbfsdqacam.supabase.co/storage/v1/object/public/web-assets/home-banner-web.mp4" type="video/mp4">
        </video>
        <div class="signin-card ssup-card${wide}" id="ssupCard">
          <div class="signin-brand">
            <img src="/recursos/logos/logo-02.svg" alt="AI Smart Content" class="signin-brand-logo" width="180" height="72" decoding="async">
          </div>
          ${this._preview ? `<div class="ssup-demo-badge">${this._t('Modo demo · no se crean cuentas')}</div>` : ''}
          ${(this._hasSession && this.step === 'cuenta') ? `
            <div class="ssup-banner" id="ssupBanner">
              <span>${this._t('Ya tienes una sesión iniciada como')} <strong>${this.escapeHtml(this._sessionEmail)}</strong>.</span>
              <button type="button" class="ssup-banner-btn" id="ssupEnter">${this._t('Iniciar sesión')}</button>
            </div>
          ` : ''}
          <div class="ssup-body" id="ssupBody">
            ${this.renderStep()}
          </div>
        </div>
        <footer class="signin-footer">
          <span class="signin-footer-copy">${year} AI SMART CONTENT by ARDE AGENCY S.A.S. ${this._t('Todos los derechos reservados.')}</span>
          <span class="signin-footer-links">
            <a href="https://aismartcontent.io/privacy-policy" target="_blank" rel="noopener">${this._t('Privacidad')}</a>
            <span aria-hidden="true">·</span>
            <a href="https://aismartcontent.io/terms-and-conditions" target="_blank" rel="noopener">${this._t('Términos')}</a>
            <span aria-hidden="true">·</span>
            <a href="https://aismartcontent.io/contact" target="_blank" rel="noopener">${this._t('Contacto')}</a>
          </span>
        </footer>
      </div>
    `;
  }

  renderStep() {
    switch (this.step) {
      case 'verify': return this.renderStepVerify();
      case 'choice': return this.renderStepChoice();
      case 'affiliate': return this.renderStepAffiliate();
      case 'affiliate_done': return this.renderStepAffiliateDone();
      case 'plans': return this.renderStepPlans();
      case 'pay': return this.renderStepPay();
      case 'create-brand': return this.renderStepCreateBrand();
      case 'brand_done': return this.renderStepBrandDone();
      case 'auto-source': return this.renderStepAutoSource();
      case 'auto-progress': return this.renderStepAutoProgress();
      case 'auto-approval': return this.renderStepAutoApproval();
      case 'vera-provision': return this.renderStepVeraProvision();
      case 'creating-org': return this.renderStepCreatingOrg();
      default: return this.renderStepCuenta();
    }
  }

  renderStepCuenta() {
    const f = this.form;
    return `
      <header class="ssup-head">
        <h1>${this._t('Crea tu cuenta')}</h1>
        <p>${this._t('Empieza con tu proveedor favorito o con tu correo.')}</p>
      </header>
      <div class="ssup-oauth">
        <button type="button" class="ssup-oauth-btn" data-oauth="google">
          ${this._googleIcon()}<span>${this._t('Continuar con Google')}</span>
        </button>
        <button type="button" class="ssup-oauth-btn" data-oauth="facebook">
          ${this._facebookIcon()}<span>${this._t('Continuar con Facebook')}</span>
        </button>
      </div>
      <div class="ssup-divider"><span>${this._t('o')}</span></div>
      <form id="ssupCuentaForm" class="ssup-form" novalidate autocomplete="on">
        <div class="ssup-field">
          <label for="ssupName">${this._t('Nombre completo')}</label>
          <input class="form-input" id="ssupName" name="full_name" type="text" placeholder="${this._t('Ej. María García')}" autocomplete="name" value="${this.escapeHtml(f.full_name)}">
        </div>
        <div class="ssup-field">
          <label for="ssupEmail">${this._t('Correo electrónico')}</label>
          <input class="form-input" id="ssupEmail" name="email" type="email" placeholder="tu@correo.com" autocomplete="email" value="${this.escapeHtml(f.email)}">
        </div>
        <div class="ssup-field">
          <label for="ssupPass">${this._t('Contraseña')}</label>
          <input class="form-input" id="ssupPass" name="password" type="password" placeholder="${this._t('Mínimo 8 caracteres')}" autocomplete="new-password" minlength="8" value="${this.escapeHtml(f.password)}">
        </div>
        <p class="ssup-status" id="ssupStatus" role="status" aria-live="polite"></p>
        <button type="submit" class="ssup-btn ssup-btn-primary ssup-btn-block" data-action="create">${this._t('Crear cuenta')}</button>
      </form>
    `;
  }

  renderStepVerify() {
    return `
      <div class="ssup-verify">
        <div class="ssup-verify-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6h16v12H4z"></path><path d="M4 6l8 7 8-7"></path>
          </svg>
        </div>
        <h1>${this._t('Verifica tu correo')}</h1>
        <p>${this._t('Te enviamos un enlace de confirmación a')} <strong>${this.escapeHtml(this.createdEmail || 'tu correo')}</strong>. ${this._t('Ábrelo para activar tu cuenta y continuar.')}</p>
        <p class="ssup-hint">${this._t('¿No te llega? Revisa spam o promociones.')}</p>
        ${this._preview
          ? `<button type="button" class="ssup-btn ssup-btn-primary ssup-btn-block" data-action="verified-demo">${this._t('Ya verifiqué (demo)')}</button>`
          : `<button type="button" class="ssup-btn ssup-btn-primary ssup-btn-block" id="ssupResend">${this._t('Reenviar correo')}</button>`}
        <button type="button" class="ssup-btn ssup-btn-ghost ssup-btn-block" data-action="back-cuenta">${this._t('Volver')}</button>
        <p class="ssup-status" id="ssupStatus" role="status" aria-live="polite"></p>
      </div>
    `;
  }

  renderStepChoice() {
    const cards = [
      { action: 'create-brand', icon: 'fa-crown', title: this._t('Crear una marca nueva'),
        hint: this._t('Empieza tu propia organización desde cero. Quedas como owner.') },
      { action: 'affiliate', icon: 'aisc-ico aisc-ico--user-registration', title: this._t('Afiliarme a una marca'),
        hint: this._t('Únete a una organización existente con un token de invitación.') },
    ];
    return `
      <header class="ssup-head ssup-head--center">
        <h1>${this._t('¿Cómo quieres empezar?')}</h1>
        <p>${this._t('Crea tu propia marca o únete a una que ya existe.')}</p>
      </header>
      <div class="ssup-choice">
        ${cards.map((c) => `
          <button type="button" class="ssup-choice-card" data-choice="${c.action}">
            <span class="ssup-choice-ico"><i class="fas ${c.icon}"></i></span>
            <strong>${this.escapeHtml(c.title)}</strong>
            <small>${this.escapeHtml(c.hint)}</small>
          </button>
        `).join('')}
      </div>
    `;
  }

  renderStepAffiliate() {
    return `
      <header class="ssup-head">
        <h1>${this._t('Afiliarme a una marca')}</h1>
        <p>${this._t('Pide a la organización su token de invitación y su clave de verificación.')}</p>
      </header>
      <form id="ssupAffiliateForm" class="ssup-form" novalidate>
        <div class="ssup-field">
          <label for="ssupInviteToken">${this._t('Token de invitación')}</label>
          <input class="form-input" id="ssupInviteToken" type="text" placeholder="${this._t('Ej. INV-7K2F-9XQ4')}" autocomplete="off">
        </div>
        <div class="ssup-field">
          <label for="ssupInviteKey">${this._t('Clave de verificación')}</label>
          <input class="form-input" id="ssupInviteKey" type="text" placeholder="${this._t('Ej. 6 dígitos')}" autocomplete="off">
        </div>
        <p class="ssup-hint">${this._t('Al enviar, la organización recibirá una notificación y deberá aceptarte.')}</p>
        <p class="ssup-status" id="ssupStatus" role="status" aria-live="polite"></p>
        <button type="submit" class="ssup-btn ssup-btn-primary ssup-btn-block" data-action="affiliate-submit">${this._t('Solicitar acceso')}</button>
        <button type="button" class="ssup-btn ssup-btn-ghost ssup-btn-block" data-action="back-choice">${this._t('Volver')}</button>
      </form>
    `;
  }

  renderStepAffiliateDone() {
    return `
      <div class="ssup-verify">
        <div class="ssup-verify-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path>
          </svg>
        </div>
        <h1>${this._t('Solicitud enviada')}</h1>
        <p>${this._t('Enviamos tu solicitud a la organización. Cuando un administrador te acepte, recibirás acceso y te avisaremos por correo.')}</p>
        <button type="button" class="ssup-btn ssup-btn-ghost ssup-btn-block" data-action="back-choice">${this._t('Volver')}</button>
      </div>
    `;
  }

  renderStepPlans() {
    const plans = this._plans;
    if (!plans) {
      return `
        <header class="ssup-head ssup-head--center"><h1>${this._t('Elige tu plan')}</h1></header>
        <div class="ssup-plans-loading"><div class="ssup-spinner"></div></div>
      `;
    }
    return `
      <header class="ssup-head ssup-head--center">
        <h1>${this._t('Elige tu plan')}</h1>
        <p>${this._t('Con qué plan quieres crear tu organización. Podrás cambiarlo después.')}</p>
      </header>
      <div class="ssup-plans">
        ${plans.map((p) => this._planCard(p)).join('')}
      </div>
      <button type="button" class="ssup-btn ssup-btn-ghost ssup-btn-block" data-action="back-choice">${this._t('Volver')}</button>
    `;
  }

  _planCard(p) {
    const price = Number(p.price_usd_month || 0);
    const feats = this._planFeatures(p);
    return `
      <div class="ssup-plan ${p.is_popular ? 'is-popular' : ''}">
        ${p.is_popular ? `<span class="ssup-plan-tag">${this._t('Popular')}</span>` : ''}
        <h3 class="ssup-plan-name">${this.escapeHtml(p.name)}</h3>
        <div class="ssup-plan-price"><span>$${price.toLocaleString('en-US')}</span><small>/${this._t('mes')}</small></div>
        <p class="ssup-plan-desc">${this.escapeHtml(p.description || '')}</p>
        <ul class="ssup-plan-feats">
          ${feats.map((t) => `<li><i class="aisc-ico aisc-ico--check"></i> ${this.escapeHtml(t)}</li>`).join('')}
        </ul>
        <button type="button" class="ssup-btn ssup-btn-primary ssup-btn-block" data-plan="${this.escapeHtml(p.id)}">${this._t('Elegir')} ${this.escapeHtml(p.name)}</button>
      </div>
    `;
  }

  _planFeatures(p) {
    const out = [];
    if (p.credits_monthly != null) out.push(`${Number(p.credits_monthly).toLocaleString('en-US')} ${this._t('créditos / mes')}`);
    if (p.max_handles != null) out.push(`${p.max_handles} ${this._t('cuentas conectables')}`);
    const f = p.features || {};
    if (f.team_seats) out.push(`${f.team_seats} ${this._t('miembros de equipo')}`);
    if (f.vera_full) out.push(this._t('Vera completo'));
    else if (f.vera_basic) out.push(this._t('Vera básico'));
    if (f.sub_brands) out.push(this._t('Sub-marcas'));
    if (f.custom_domain) out.push(this._t('Dominio propio'));
    if (f.insights) out.push(this._t('Insights'));
    if (f.video || f.studio) out.push(this._t('Studio + Video'));
    return out;
  }

  renderStepPay() {
    const p = (this._plans || []).find((x) => x.id === this._selectedPlan) || {};
    const price = Number(p.price_usd_month || 0);
    const gateways = [
      { v: 'wompi', icon: 'aisc-ico aisc-ico--credit-card', label: this._t('Wompi'), hint: this._t('Tarjeta · PSE · Nequi (Colombia)') },
      { v: 'stripe', icon: 'aisc-ico aisc-ico--globe', label: this._t('Tarjeta internacional'), hint: this._t('Visa · Mastercard · Amex') },
    ];
    return `
      <header class="ssup-head">
        <h1>${this._t('Confirma tu plan')}</h1>
        <p>${this._t('Plan')} <strong>${this.escapeHtml(p.name || '')}</strong> · $${price.toLocaleString('en-US')}/${this._t('mes')}</p>
      </header>
      <div class="ssup-pay-summary">
        <span>${this._t('Total hoy')}</span>
        <strong>$${price.toLocaleString('en-US')} <small>USD/${this._t('mes')}</small></strong>
      </div>
      <div class="ssup-pay-methods" role="radiogroup" aria-label="${this._t('Método de pago')}">
        ${gateways.map((g, i) => `
          <label class="ssup-pay-method">
            <input type="radio" name="ssup_gateway" value="${g.v}" ${i === 0 ? 'checked' : ''}>
            <span class="ssup-pay-card">
              <i class="fas ${g.icon}"></i>
              <span><strong>${this.escapeHtml(g.label)}</strong><small>${this.escapeHtml(g.hint)}</small></span>
            </span>
          </label>
        `).join('')}
      </div>
      ${this._preview ? `<p class="ssup-pay-note"><i class="aisc-ico aisc-ico--alert-info"></i> ${this._t('Pasarela en modo demo — no se realiza ningún cobro.')}</p>` : ''}
      <p class="ssup-status" id="ssupStatus" role="status" aria-live="polite"></p>
      <button type="button" class="ssup-btn ssup-btn-primary ssup-btn-block" data-action="pay">
        ${this._preview ? this._t('Pagar y continuar (demo)') : this._t('Pagar y continuar')}
      </button>
      <button type="button" class="ssup-btn ssup-btn-ghost ssup-btn-block" data-action="back-plans">${this._t('Ver otros planes')}</button>
    `;
  }

  renderStepCreateBrand() {
    const cards = [
      { mode: 'auto', icon: 'aisc-ico aisc-ico--sparkle', title: this._t('Crear automáticamente'),
        hint: this._t('Danos tu sitio o redes y Vera investiga y arma tu marca sola.') },
      { mode: 'manual', icon: 'aisc-ico aisc-ico--edit', title: this._t('Manualmente'),
        hint: this._t('Tú defines la identidad, el mercado y el ADN paso a paso.') },
    ];
    return `
      <header class="ssup-head ssup-head--center">
        <h1>${this._t('Crea tu marca')}</h1>
        <p>${this._t('Elige cómo quieres construir tu marca.')}</p>
      </header>
      <div class="ssup-choice">
        ${cards.map((c) => `
          <button type="button" class="ssup-choice-card" data-brand-mode="${c.mode}">
            <span class="ssup-choice-ico"><i class="fas ${c.icon}"></i></span>
            <strong>${this.escapeHtml(c.title)}</strong>
            <small>${this.escapeHtml(c.hint)}</small>
          </button>
        `).join('')}
      </div>
    `;
  }

  renderStepBrandDone() {
    // Camino manual (placeholder por construir). El automático ya no pasa por
    // aquí: va Vera → "creando organización" → dashboard con mini tutorial.
    return `
      <div class="ssup-verify">
        <div class="ssup-verify-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6L9 17l-5-5"></path>
          </svg>
        </div>
        <h1>${this._t('¡Vamos a crear tu marca!')}</h1>
        <p>${this._t('Elegiste')} <strong>${this._t('Manualmente')}</strong>. ${this._preview ? this._t('(Flujo manual por construir.)') : ''}</p>
        <button type="button" class="ssup-btn ssup-btn-ghost ssup-btn-block" data-action="back-create-brand">${this._t('Volver')}</button>
      </div>
    `;
  }

  // ─── Sub-flujo "Crear automáticamente" (motor reusado, páginas propias) ──
  // Adaptado al contexto público: sin páginas de plan (ya elegido), owner (eres
  // tú) ni Vera (acción admin/billable). En preview se simula el análisis con
  // datos de ejemplo; en real se cablearía a /api/brand-scrape + admin-update-brand.

  AUTO_PROVIDERS = [
    { v: 'shopify', icon: 'aisc-ico aisc-ico--cart', label: 'Shopify' },
    { v: 'mercadolibre', icon: 'aisc-ico aisc-ico--store', label: 'Mercado Libre' },
    { v: 'amazon', icon: 'aisc-ico aisc-ico--product', label: 'Amazon' },
    { v: 'woocommerce', icon: 'aisc-ico aisc-ico--cart', label: 'WooCommerce' },
  ];

  AUTO_APPROVAL_PAGES = [
    { key: 'identity', label: this._t('Identidad') },
    { key: 'market', label: this._t('Mercado e idioma') },
    { key: 'voice', label: this._t('Voz y mensaje') },
    { key: 'colors', label: this._t('Colores') },
    { key: 'fonts', label: this._t('Tipografía') },
    { key: 'products', label: this._t('Productos') },
    { key: 'services', label: this._t('Servicios') },
    { key: 'competitors', label: this._t('Competencia') },
    { key: 'review', label: this._t('Resumen') },
  ];

  renderStepAutoSource() {
    const a = this._auto;
    const chips = this.AUTO_PROVIDERS.map((p) => {
      const on = (a.integrations || []).includes(p.v);
      return `<button type="button" class="ssup-intg ${on ? 'is-on' : ''}" data-intg="${p.v}" aria-pressed="${on}">
        <i class="fas ${p.icon}"></i> ${this.escapeHtml(p.label)} <span class="ssup-intg-mark"><i class="aisc-ico ${on ? 'aisc-ico--check' : 'aisc-ico--add'}"></i></span>
      </button>`;
    }).join('');
    return `
      <header class="ssup-head">
        <h1>${this._t('Crear automáticamente')}</h1>
        <p>${this._t('Danos tu web y Vera investiga tu marca: nombre, colores, tipografías, ADN, productos y competencia.')}</p>
      </header>
      <form id="ssupAutoForm" class="ssup-form" novalidate>
        <div class="ssup-field">
          <label for="ssupAutoUrl">${this._t('URL de tu web')}</label>
          <input class="form-input" id="ssupAutoUrl" type="url" placeholder="https://tumarca.com" value="${this.escapeHtml(a.url)}">
          <small>${this._t('De aquí sacamos tu identidad visual y verbal.')}</small>
        </div>
        <div class="ssup-field">
          <label>${this._t('Conecta tu tienda')} <span class="ssup-opt">(${this._t('opcional · importa productos')})</span></label>
          <div class="ssup-intgs">${chips}</div>
        </div>
        <p class="ssup-status" id="ssupStatus" role="status" aria-live="polite"></p>
        <button type="submit" class="ssup-btn ssup-btn-primary ssup-btn-block" data-action="auto-create"><i class="aisc-ico aisc-ico--sparkle"></i> ${this._t('Crear y analizar')}</button>
        <button type="button" class="ssup-btn ssup-btn-ghost ssup-btn-block" data-action="back-create-brand">${this._t('Volver')}</button>
      </form>
    `;
  }

  renderStepAutoProgress() {
    const steps = [
      this._t('Creando tu organización'),
      this._t('Navegando tu sitio web'),
      this._t('Analizando páginas y contenido'),
      this._t('Obteniendo el ADN de la marca (IA)'),
      this._t('Guardando identidad y logo'),
      this._t('Buscando tu competencia'),
    ];
    const done = this._autoSimStep || 0;
    const items = steps.map((s, i) => {
      const state = i < done ? 'done' : (i === done ? 'active' : 'pending');
      const mark = state === 'done' ? '<i class="aisc-ico aisc-ico--check"></i>'
        : state === 'active' ? '<i class="aisc-ico fa-spin aisc-ico--loader"></i>'
        : '<span class="ssup-load-dot"></span>';
      return `<li class="ssup-load-item is-${state}"><span class="ssup-load-mark">${mark}</span><span>${this.escapeHtml(s)}</span></li>`;
    }).join('');
    return `
      <header class="ssup-head ssup-head--center">
        <h1>${this._t('Construyendo tu marca')}</h1>
        <p>${this._t('Vera está investigando')} ${this.escapeHtml(this._auto.url || '')}…</p>
      </header>
      <ul class="ssup-load-list">${items}</ul>
    `;
  }

  renderStepAutoApproval() {
    const pages = this.AUTO_APPROVAL_PAGES;
    const idx = this._apIdx;
    const page = pages[idx];
    const total = pages.length;
    const isLast = idx === total - 1;
    const a = this._approval || {};
    const body = ({
      identity: () => `${a.logo ? `<div class="ssup-ap-logo"><img src="${this.escapeHtml(a.logo)}" alt="logo" onerror="this.style.display='none'"></div>` : ''}
        ${this._ssF(this._t('Nombre de la marca'), 'apName', a.name)}
        ${this._ssF(this._t('Slogan'), 'apSlogan', a.slogan)}`,
      market: () => `${this._ssF(this._t('Nicho / categoría'), 'apNicho', a.nicho_core)}
        ${this._ssCSV(this._t('Mercados objetivo (países)'), 'apMercados', a.mercado_objetivo, 'CO, MX')}
        ${this._ssCSV(this._t('Idiomas de contenido'), 'apIdiomas', a.idiomas_contenido, 'es, en')}`,
      voice: () => `${this._ssF(this._t('Tono de voz'), 'apTono', a.tono_de_voz)}
        ${this._ssTA(this._t('Propuesta de valor'), 'apProp', a.propuesta_valor)}
        ${this._ssTA(this._t('Misión / visión'), 'apMision', a.mision_vision)}
        ${this._ssCSV(this._t('Pilares'), 'apPilares', a.pilares)}
        ${this._ssCSV(this._t('Palabras clave'), 'apClave', a.palabras_clave)}
        ${this._ssCSV(this._t('Palabras prohibidas'), 'apProh', a.palabras_prohibidas)}`,
      colors: () => this._apColorsBody(),
      fonts: () => `${this._ssF(this._t('Tipografía principal'), 'apFont1', a.typography_primary)}
        ${this._ssF(this._t('Tipografía secundaria'), 'apFont2', a.typography_secondary)}
        ${this._ssF(this._t('Estética'), 'apEstetica', a.estetica)}`,
      products: () => this._apListBody('products', this._t('Productos'), 'aisc-ico aisc-ico--product'),
      services: () => this._apListBody('services', this._t('Servicios'), 'fa-concierge-bell'),
      competitors: () => this._apCompBody(),
      review: () => this._apReviewBody(),
    }[page.key] || (() => ''))();

    return `
      <header class="ssup-head">
        <span class="ssup-eyebrow">${this._t('Revisar')} ${idx + 1}/${total} · ${this.escapeHtml(page.label)}</span>
        <h1>${this.escapeHtml(page.label)}</h1>
        <p>${this._t('Vera lo detectó. Edita lo que quieras y avanza para aceptar.')}</p>
      </header>
      <form id="ssupApForm" class="ssup-form" novalidate>${body}</form>
      <div class="ssup-ap-actions">
        ${idx > 0 ? `<button type="button" class="ssup-btn ssup-btn-ghost" data-action="ap-back">← ${this._t('Atrás')}</button>` : `<button type="button" class="ssup-btn ssup-btn-ghost" data-action="back-create-brand">← ${this._t('Atrás')}</button>`}
        ${isLast
          ? `<button type="button" class="ssup-btn ssup-btn-primary" data-action="ap-finish"><i class="aisc-ico aisc-ico--check"></i> ${this._t('Terminar mi marca')}</button>`
          : `<button type="button" class="ssup-btn ssup-btn-primary" data-action="ap-next">${this._t('Aceptar y seguir')} →</button>`}
      </div>
    `;
  }

  _ssF(label, id, val, ph) {
    return `<div class="ssup-field"><label for="${id}">${this.escapeHtml(label)}</label><input class="form-input" id="${id}" value="${this.escapeHtml(val || '')}" placeholder="${this.escapeHtml(ph || '')}"></div>`;
  }
  _ssTA(label, id, val) {
    return `<div class="ssup-field"><label for="${id}">${this.escapeHtml(label)}</label><textarea class="form-input" id="${id}" rows="2">${this.escapeHtml(val || '')}</textarea></div>`;
  }
  _ssCSV(label, id, list, ph) {
    return `<div class="ssup-field"><label for="${id}">${this.escapeHtml(label)}</label><input class="form-input" id="${id}" value="${this.escapeHtml((list || []).join(', '))}" placeholder="${this.escapeHtml(ph || '')}"></div>`;
  }

  _apColorsBody() {
    const rows = (this._approval.colors || []).map((c, i) => `
      <div class="ssup-color-row" data-color-idx="${i}">
        <input type="color" data-color-hex value="${/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#000000'}">
        <span class="ssup-color-role">${this.escapeHtml(c.role || ('color ' + (i + 1)))}</span>
        <button type="button" class="ssup-row-rm" data-color-rm="${i}" aria-label="Quitar"><i class="aisc-ico aisc-ico--close"></i></button>
      </div>`).join('');
    return `<div class="ssup-field"><label>${this._t('Paleta de la marca')}</label>
      <div id="ssupColors">${rows || `<p class="ssup-hint">${this._t('Sin colores detectados.')}</p>`}</div>
      <button type="button" class="ssup-btn ssup-btn-ghost ssup-btn-sm" data-action="ap-add-color"><i class="aisc-ico aisc-ico--add"></i> ${this._t('Agregar color')}</button></div>`;
  }

  _apListBody(kind, label, icon) {
    const items = this._approval[kind] || [];
    const attr = kind === 'products' ? 'data-prod' : 'data-svc';
    if (!items.length) return `<p class="ssup-hint">${this._t('No se detectaron')} ${label.toLowerCase()}.</p>`;
    const rows = items.map((it, i) => `
      <div class="ssup-list-row" data-${kind}-idx="${i}">
        <span class="ssup-list-thumb"><i class="fas ${icon}"></i></span>
        <input class="form-input" ${attr}-name value="${this.escapeHtml(it.name || '')}" placeholder="${this.escapeHtml(label)}">
        <button type="button" class="ssup-row-rm" data-${kind}-rm="${i}" aria-label="Quitar"><i class="aisc-ico aisc-ico--close"></i></button>
      </div>`).join('');
    return `<div class="ssup-field"><label>${this.escapeHtml(label)} (${items.length})</label><div id="ssup${kind}">${rows}</div></div>`;
  }

  _apCompBody() {
    const rows = (this._approval.competitors || []).map((c, i) => `
      <div class="ssup-list-row" data-comp-idx="${i}">
        <input class="form-input" data-comp-name value="${this.escapeHtml(c.name || '')}" placeholder="${this._t('Nombre')}">
        <input class="form-input" data-comp-web value="${this.escapeHtml(c.website || '')}" placeholder="${this._t('sitio web')}">
        <button type="button" class="ssup-row-rm" data-comp-rm="${i}" aria-label="Quitar"><i class="aisc-ico aisc-ico--close"></i></button>
      </div>`).join('');
    return `<div class="ssup-field"><label>${this._t('Competidores')} (${(this._approval.competitors || []).length})</label>
      <div id="ssupComps">${rows || `<p class="ssup-hint">${this._t('Sin competidores.')}</p>`}</div>
      <button type="button" class="ssup-btn ssup-btn-ghost ssup-btn-sm" data-action="ap-add-comp"><i class="aisc-ico aisc-ico--add"></i> ${this._t('Agregar competidor')}</button></div>`;
  }

  _apReviewBody() {
    const a = this._approval;
    return `<ul class="ssup-review-list">
      <li><b>${this._t('Marca')}:</b> ${this.escapeHtml(a.name || '—')}${a.slogan ? ' — ' + this.escapeHtml(a.slogan) : ''}</li>
      <li><b>${this._t('Nicho')}:</b> ${this.escapeHtml(a.nicho_core || '—')}</li>
      <li><b>${this._t('Mercados')}:</b> ${this.escapeHtml((a.mercado_objetivo || []).join(', ') || '—')} · <b>${this._t('Idiomas')}:</b> ${this.escapeHtml((a.idiomas_contenido || []).join(', ') || '—')}</li>
      <li><b>${this._t('Tono')}:</b> ${this.escapeHtml(a.tono_de_voz || '—')}</li>
      <li><b>${this._t('Colores')}:</b> ${(a.colors || []).length} · <b>${this._t('Pilares')}:</b> ${(a.pilares || []).length}</li>
      <li><b>${this._t('Productos')}:</b> ${(a.products || []).length} · <b>${this._t('Servicios')}:</b> ${(a.services || []).length} · <b>${this._t('Competencia')}:</b> ${(a.competitors || []).length}</li>
    </ul>`;
  }

  _toggleIntg(v) {
    const set = new Set(this._auto.integrations || []);
    set.has(v) ? set.delete(v) : set.add(v);
    this._auto.integrations = [...set];
    const chip = this.querySelector(`[data-intg="${v}"]`);
    if (chip) {
      const on = set.has(v);
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', String(on));
      const m = chip.querySelector('.ssup-intg-mark i');
      if (m) m.className = `aisc-ico ${on ? 'aisc-ico--check' : 'aisc-ico--add'}`;
    }
  }

  _handleAutoCreate() {
    this._auto.url = (this.querySelector('#ssupAutoUrl')?.value || '').trim();
    if (!this._preview && !this._auto.url) { this._setStatus(this._t('Agrega la URL de tu web.'), 'error'); return; }
    if (this._preview) { this._runAutoSim(); return; }
    // En real: aquí se crea el shell (admin_create_organization) y se lanza
    // /api/brand-scrape con organization_id, luego polling → _enterApproval(payload).
    this._setStatus(this._t('Motor de análisis pendiente de cablear fuera de demo.'), 'error');
  }

  // Preview: simula el análisis avanzando el checklist y entra a la aprobación.
  _runAutoSim() {
    this._autoSimStep = 0;
    this._goto('auto-progress');
    const tick = () => {
      this._autoSimStep = (this._autoSimStep || 0) + 1;
      const body = this.querySelector('#ssupBody');
      if (body && this.step === 'auto-progress') body.innerHTML = this.renderStep();
      if (this._autoSimStep >= 6) {
        clearInterval(this._autoSimTimer); this._autoSimTimer = null;
        this._enterApproval(this._mockBrand());
      }
    };
    if (this._autoSimTimer) clearInterval(this._autoSimTimer);
    this._autoSimTimer = setInterval(tick, 700);
  }

  _mockBrand() {
    let host = (this._auto.url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || 'tumarca.com';
    const base = host.split('.')[0] || 'Tu Marca';
    const name = base.charAt(0).toUpperCase() + base.slice(1);
    return {
      logo: null, name, slogan: this._t('Tu marca, potenciada por IA'),
      nicho_core: this._t('alimentos y bebidas'),
      mercado_objetivo: ['CO'], idiomas_contenido: ['es'], locale: 'es', timezone: 'America/Bogota',
      tono_de_voz: this._t('amigable'),
      propuesta_valor: this._t('Productos pensados para tu día a día, con calidad e identidad.'),
      mision_vision: this._t('Construir una marca cercana que crece con su comunidad.'),
      pilares: [this._t('calidad'), this._t('innovación'), this._t('comunidad')],
      palabras_clave: [this._t('natural'), this._t('premium'), this._t('local')],
      palabras_prohibidas: [this._t('barato')],
      colors: [{ role: 'primary', hex: '#1a1a1a' }, { role: 'secondary', hex: '#f5f5f5' }, { role: 'accent_1', hex: '#7c83ff' }],
      typography_primary: 'Inter', typography_secondary: 'Lora', estetica: this._t('minimalista, premium'),
      products: [{ name: this._t('Producto 1') }, { name: this._t('Producto 2') }],
      services: [],
      competitors: [{ name: this._t('Competidor A'), website: 'competidor-a.com' }],
    };
  }

  _enterApproval(brand) {
    this._approval = brand;
    this._apIdx = 0;
    this._goto('auto-approval');
  }

  _apCollect() {
    const a = this._approval; if (!a) return;
    const g = (id) => (this.querySelector('#' + id)?.value || '').trim();
    const csv = (id) => g(id).split(',').map((s) => s.trim()).filter(Boolean);
    const key = this.AUTO_APPROVAL_PAGES[this._apIdx]?.key;
    if (key === 'identity') { a.name = g('apName'); a.slogan = g('apSlogan'); }
    else if (key === 'market') { a.nicho_core = g('apNicho'); a.mercado_objetivo = csv('apMercados'); a.idiomas_contenido = csv('apIdiomas'); }
    else if (key === 'voice') { a.tono_de_voz = g('apTono'); a.propuesta_valor = g('apProp'); a.mision_vision = g('apMision'); a.pilares = csv('apPilares'); a.palabras_clave = csv('apClave'); a.palabras_prohibidas = csv('apProh'); }
    else if (key === 'colors') { a.colors = [...this.querySelectorAll('#ssupColors .ssup-color-row')].map((r, i) => ({ role: a.colors?.[i]?.role || ('accent_' + i), hex: r.querySelector('[data-color-hex]')?.value || '#000000' })); }
    else if (key === 'fonts') { a.typography_primary = g('apFont1'); a.typography_secondary = g('apFont2'); a.estetica = g('apEstetica'); }
    else if (key === 'products') { a.products = [...this.querySelectorAll('#ssupproducts .ssup-list-row')].map((r) => ({ name: (r.querySelector('[data-prod-name]')?.value || '').trim() })).filter((p) => p.name); }
    else if (key === 'services') { a.services = [...this.querySelectorAll('#ssupservices .ssup-list-row')].map((r) => ({ name: (r.querySelector('[data-svc-name]')?.value || '').trim() })).filter((s) => s.name); }
    else if (key === 'competitors') { a.competitors = [...this.querySelectorAll('#ssupComps .ssup-list-row')].map((r) => ({ name: (r.querySelector('[data-comp-name]')?.value || '').trim(), website: (r.querySelector('[data-comp-web]')?.value || '').trim() })).filter((c) => c.name); }
  }

  _apNext() {
    this._apCollect();
    // En real, aquí se guardaría la sección con admin-update-brand(section,data).
    if (this._apIdx < this.AUTO_APPROVAL_PAGES.length - 1) { this._apIdx++; this._goto('auto-approval'); }
  }
  _apBack() { this._apCollect(); if (this._apIdx > 0) { this._apIdx--; this._goto('auto-approval'); } }

  // "Terminar mi marca": aquí SIEMPRE se provisiona Vera — una org nunca queda
  // sin su Vera. En preview se simula; en real dispara provision-org-agent.
  _apFinish() {
    this._apCollect();
    this._brandMode = 'auto';
    this._runVeraProvision();
  }

  renderStepVeraProvision() {
    return `
      <div class="ssup-verify">
        <div class="ssup-spinner" aria-hidden="true"></div>
        <h1>${this._t('Creando tu Vera')}</h1>
        <p>${this._t('Estamos activando el equipo de IA de tu marca. Toda organización tiene su Vera para automatizar contenido, estrategia y monitoreo.')}</p>
        <p class="ssup-hint">${this._t('Esto puede tardar unos minutos. No cierres esta ventana.')}</p>
      </div>
    `;
  }

  async _runVeraProvision() {
    this._goto('vera-provision');
    if (this._preview) {
      if (this._autoSimTimer) clearTimeout(this._autoSimTimer);
      this._autoSimTimer = setTimeout(() => { this._autoSimTimer = null; this._runCreatingOrg(); }, 2600);
      return;
    }
    // Real: provisionar Vera para la org recién creada (org nunca sin Vera).
    try {
      const { error } = await this.supabase.functions.invoke('provision-org-agent', {
        body: { organization_id: this._autoOrgId },
      });
      if (error) throw error;
    } catch (err) {
      // No bloquea el cierre: Vera puede reintentarse luego.
      this._veraError = (err && err.message) ? err.message : String(err);
    }
    this._runCreatingOrg();
  }

  renderStepCreatingOrg() {
    return `
      <div class="ssup-verify">
        <div class="ssup-spinner" aria-hidden="true"></div>
        <h1>${this._t('Creando tu organización')}</h1>
        <p>${this._t('Dejando todo listo y abriendo tu espacio de trabajo…')}</p>
      </div>
    `;
  }

  _runCreatingOrg() {
    this._goto('creating-org');
    if (this._autoSimTimer) clearTimeout(this._autoSimTimer);
    this._autoSimTimer = setTimeout(() => { this._autoSimTimer = null; this._finishToDashboard(); }, 2200);
  }

  // Marca/ org lista → al dashboard principal, activando el mini tutorial.
  _finishToDashboard() {
    try { localStorage.setItem('asc:onboardingTour', '1'); } catch (_) {}
    if (this._preview) {
      // Demo: el dashboard real necesita sesión/org; usamos la vitrina IGNIS
      // (crea sesión y aterriza en el dashboard) para mostrar el tutorial.
      if (window.router) window.router.navigate('/demo', true);
      else window.location.href = '/demo';
      return;
    }
    let target = '/home';
    (async () => {
      try {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user && window.authService?.getDefaultUserRoute) target = await window.authService.getDefaultUserRoute(user.id);
      } catch (_) {}
      if (window.router) window.router.navigate(target, true); else window.location.href = target;
    })();
  }

  _googleIcon() {
    return `<svg class="ssup-oauth-ico" viewBox="0 0 18 18" aria-hidden="true" width="18" height="18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>`;
  }

  _facebookIcon() {
    return `<svg class="ssup-oauth-ico" viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
      <path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.08 24 18.09 24 12.07z"/>
    </svg>`;
  }

  // ─── Init / navegación ───────────────────────────────────────────────

  async init() {
    this.supabase = this.supabase || window.supabase
      || (window.supabaseService && (await window.supabaseService.getClient()));
    if (!this.supabase && !this._preview) {
      this._setStatus(this._t('No se pudo cargar Supabase. Recarga la página.'), 'error');
      return;
    }
    this.wire();
    const enter = this.querySelector('#ssupEnter');
    if (enter) this.addEventListener(enter, 'click', () => this._handleEnter());
  }

  wire() {
    this.querySelectorAll('[data-oauth]').forEach((btn) => {
      this.addEventListener(btn, 'click', () => this._handleOAuth(btn.getAttribute('data-oauth')));
    });
    const cuentaForm = this.querySelector('#ssupCuentaForm');
    if (cuentaForm) this.addEventListener(cuentaForm, 'submit', (e) => { e.preventDefault(); this._handleCreate(); });

    const resend = this.querySelector('#ssupResend');
    if (resend) this.addEventListener(resend, 'click', () => this._handleResend());

    const affForm = this.querySelector('#ssupAffiliateForm');
    if (affForm) this.addEventListener(affForm, 'submit', (e) => { e.preventDefault(); this._handleAffiliate(); });

    this.querySelectorAll('[data-choice]').forEach((c) => {
      this.addEventListener(c, 'click', () => this._handleChoice(c.getAttribute('data-choice')));
    });
    this.querySelectorAll('[data-plan]').forEach((b) => {
      this.addEventListener(b, 'click', () => this._handlePlan(b.getAttribute('data-plan')));
    });
    this.querySelectorAll('[data-brand-mode]').forEach((b) => {
      this.addEventListener(b, 'click', () => this._handleBrandMode(b.getAttribute('data-brand-mode')));
    });

    // Sub-flujo automático
    const autoForm = this.querySelector('#ssupAutoForm');
    if (autoForm) this.addEventListener(autoForm, 'submit', (e) => { e.preventDefault(); this._handleAutoCreate(); });
    this.querySelectorAll('[data-intg]').forEach((c) => {
      this.addEventListener(c, 'click', () => this._toggleIntg(c.getAttribute('data-intg')));
    });
    this.querySelectorAll('[data-color-rm]').forEach((b) => {
      this.addEventListener(b, 'click', () => { this._apCollect(); this._approval.colors.splice(parseInt(b.getAttribute('data-color-rm'), 10), 1); this._goto('auto-approval'); });
    });
    this.querySelectorAll('[data-prod-rm]').forEach((b) => {
      this.addEventListener(b, 'click', () => { this._apCollect(); this._approval.products.splice(parseInt(b.getAttribute('data-prod-rm'), 10), 1); this._goto('auto-approval'); });
    });
    this.querySelectorAll('[data-svc-rm]').forEach((b) => {
      this.addEventListener(b, 'click', () => { this._apCollect(); this._approval.services.splice(parseInt(b.getAttribute('data-svc-rm'), 10), 1); this._goto('auto-approval'); });
    });
    this.querySelectorAll('[data-comp-rm]').forEach((b) => {
      this.addEventListener(b, 'click', () => { this._apCollect(); this._approval.competitors.splice(parseInt(b.getAttribute('data-comp-rm'), 10), 1); this._goto('auto-approval'); });
    });

    const map = {
      'verified-demo': () => this._goto('choice'),
      'back-cuenta': () => this._goto('cuenta'),
      'back-choice': () => this._goto('choice'),
      'back-plans': () => this._goto('plans'),
      'pay': () => this._handlePay(),
      'back-create-brand': () => this._goto('create-brand'),
      'ap-next': () => this._apNext(),
      'ap-back': () => this._apBack(),
      'ap-finish': () => this._apFinish(),
      'ap-add-color': () => { this._apCollect(); this._approval.colors = [...(this._approval.colors || []), { role: 'accent', hex: '#7c83ff' }]; this._goto('auto-approval'); },
      'ap-add-comp': () => { this._apCollect(); this._approval.competitors = [...(this._approval.competitors || []), { name: '', website: '' }]; this._goto('auto-approval'); },
    };
    Object.entries(map).forEach(([action, fn]) => {
      const el = this.querySelector(`[data-action="${action}"]`);
      if (el) this.addEventListener(el, 'click', fn);
    });
  }

  _goto(step) {
    this.step = step;
    // Algunos pasos cambian el ancho de la card → re-render del card completo.
    const card = this.querySelector('#ssupCard');
    if (card) {
      card.classList.toggle('ssup-card--wide', step === 'plans' || step === 'choice' || step === 'create-brand');
    }
    const body = this.querySelector('#ssupBody');
    if (body) { body.innerHTML = this.renderStep(); this.wire(); }
    if (step === 'plans' && !this._plans) this._loadPlans();
    const card2 = this.querySelector('#ssupCard');
    card2?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }

  async _handleEnter() {
    let target = '/home';
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (user && window.authService && typeof window.authService.getDefaultUserRoute === 'function') {
        target = await window.authService.getDefaultUserRoute(user.id);
      }
    } catch (_) {}
    if (window.router) window.router.navigate(target, true);
    else window.location.href = target;
  }

  _captureCuenta() {
    this.form.full_name = (this.querySelector('#ssupName')?.value || '').trim();
    this.form.email = (this.querySelector('#ssupEmail')?.value || '').toLowerCase().trim();
    this.form.password = this.querySelector('#ssupPass')?.value || '';
  }

  _validateCuenta() {
    const f = this.form;
    if (!f.full_name) return this._setStatus(this._t('Falta tu nombre.'), 'error'), false;
    if (!f.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return this._setStatus(this._t('Correo inválido.'), 'error'), false;
    if (f.password.length < 8) return this._setStatus(this._t('La contraseña debe tener al menos 8 caracteres.'), 'error'), false;
    return true;
  }

  async _handleOAuth(provider) {
    // Preview: no autenticamos, solo avanzamos al siguiente paso.
    if (this._preview) { this._goto('choice'); return; }
    if (this._submitting) return;
    this._submitting = true;
    try {
      const { error } = await this.supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}${this._continuePath()}` },
      });
      if (error) throw error;
    } catch (err) {
      this._submitting = false;
      this._setStatus((err && err.message) ? err.message : String(err), 'error');
    }
  }

  async _handleCreate() {
    this._captureCuenta();

    // Preview: no creamos usuario; pasamos a "verifica tu correo".
    if (this._preview) {
      this.createdEmail = this.form.email || 'tucorreo@ejemplo.com';
      this._goto('verify');
      return;
    }

    if (this._submitting) return;
    if (!this._validateCuenta()) return;
    this._submitting = true;
    this._setSubmitting(true);
    this._setStatus(this._t('Creando tu cuenta y enviando el correo…'), '');

    const f = this.form;
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email: f.email,
        password: f.password,
        options: {
          emailRedirectTo: `${window.location.origin}${this._continuePath()}`,
          data: { full_name: f.full_name, pending_org: this._defaultPendingOrg() },
        },
      });
      if (error) throw error;
      this.createdEmail = f.email;
      if (data && data.session) { if (window.router) window.router.navigate(this._continuePath(), true); return; }
      this._submitting = false;
      this._goto('verify');
    } catch (err) {
      this._submitting = false;
      this._setSubmitting(false);
      this._setStatus((err && err.message) ? err.message : String(err), 'error');
    }
  }

  _handleChoice(choice) {
    if (choice === 'affiliate') this._goto('affiliate');
    else this._goto('plans');
  }

  _handleAffiliate() {
    const token = (this.querySelector('#ssupInviteToken')?.value || '').trim();
    const key = (this.querySelector('#ssupInviteKey')?.value || '').trim();
    if (!this._preview) {
      // Backend de afiliación aún no existe — se cablea después.
      if (!token || !key) { this._setStatus(this._t('Ingresa el token y la clave.'), 'error'); return; }
    }
    this._goto('affiliate_done');
  }

  _handlePlan(planId) {
    this._selectedPlan = planId;
    this._goto('pay');
  }

  _handlePay() {
    // Preview: pasarela apagada, solo avanzamos. En real, aquí se lanza el
    // checkout (Stripe/Wompi vía functions/api-billing-*) antes de continuar.
    if (!this._preview) {
      this._setStatus(this._t('Pasarela de pagos pendiente de cablear.'), 'error');
      return;
    }
    this._goto('create-brand');
  }

  _handleBrandMode(mode) {
    this._brandMode = mode;
    if (mode === 'auto') { this._goto('auto-source'); return; }
    this._goto('brand_done');
  }

  async _loadPlans() {
    let plans = null;
    try {
      if (this.supabase) {
        const { data } = await this.supabase
          .from('plans')
          .select('id,name,description,price_usd_month,credits_monthly,max_handles,features,is_popular,display_order')
          .eq('is_active', true)
          .order('display_order', { ascending: true });
        if (Array.isArray(data) && data.length) plans = data;
      }
    } catch (_) { /* fallback abajo */ }
    this._plans = plans || this._fallbackPlans();
    if (this.step === 'plans') {
      const body = this.querySelector('#ssupBody');
      if (body) { body.innerHTML = this.renderStep(); this.wire(); }
    }
  }

  _fallbackPlans() {
    return [
      { id: 'creator', name: 'Creator', description: 'Solo / freelance que produce contenido de marca.', price_usd_month: 79, credits_monthly: 800, max_handles: 3, features: { vera_basic: true, studio: true, video: true }, is_popular: false },
      { id: 'team', name: 'Team', description: 'Equipos de marketing pequeños. Vera completo + colaboración.', price_usd_month: 179, credits_monthly: 2500, max_handles: 10, features: { vera_full: true, team_seats: 10, insights: true, brand_kits: 3 }, is_popular: true },
      { id: 'agency', name: 'Agency', description: 'Agencias gestionando múltiples marcas.', price_usd_month: 499, credits_monthly: 8000, max_handles: 25, features: { vera_full: true, sub_brands: true, team_seats: 25, custom_domain: true }, is_popular: false },
    ];
  }

  async _handleResend() {
    if (Date.now() < this._resendCooldownUntil) return;
    const email = this.createdEmail;
    if (!email) return;
    try {
      const { error } = await this.supabase.auth.resend({
        type: 'signup', email,
        options: { emailRedirectTo: `${window.location.origin}${this._continuePath()}` },
      });
      if (error) { this._setStatus(error.message, 'error'); return; }
      this._setStatus(this._t('Correo reenviado. Revisa tu bandeja.'), 'ok');
      this._startCooldown(60);
    } catch (err) {
      this._setStatus((err && err.message) || String(err), 'error');
    }
  }

  _startCooldown(seconds) {
    this._resendCooldownUntil = Date.now() + seconds * 1000;
    const btn = this.querySelector('#ssupResend');
    const tick = () => {
      const rem = Math.max(0, Math.ceil((this._resendCooldownUntil - Date.now()) / 1000));
      if (!btn) return;
      if (rem <= 0) { btn.disabled = false; btn.textContent = this._t('Reenviar correo'); if (this._cooldownTimer) { clearInterval(this._cooldownTimer); this._cooldownTimer = null; } return; }
      btn.disabled = true; btn.textContent = `${this._t('Reenviar en')} ${rem}s`;
    };
    tick();
    if (this._cooldownTimer) clearInterval(this._cooldownTimer);
    this._cooldownTimer = setInterval(tick, 1000);
  }

  _setSubmitting(yes) {
    const btn = this.querySelector('[data-action="create"]');
    if (btn) btn.disabled = !!yes;
  }

  _setStatus(text, type) {
    const el = this.querySelector('#ssupStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'ssup-status';
    if (type === 'error') el.classList.add('is-error');
    if (type === 'ok') el.classList.add('is-ok');
  }

  destroy() {
    if (this._cooldownTimer) { clearInterval(this._cooldownTimer); this._cooldownTimer = null; }
    if (this._autoSimTimer) { clearInterval(this._autoSimTimer); this._autoSimTimer = null; }
    super.destroy?.();
  }
}

window.SecretSignupView = SecretSignupView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecretSignupView;
}
