/**
 * CancelSubscriptionView — /plans/cancel
 *
 * Cancela suscripción en 1 click. Compliance FTC click-to-cancel + ley California:
 *   - Mismo número de clicks que el signup
 *   - Encuesta de salida OPCIONAL (no gate)
 *   - Información factual sin guilt-tripping
 *   - Sin teléfono, sin loop "¿estás seguro?"
 *   - Confirmación por email
 *
 * Corte (ADR-0052, planes.md): en la base nueva cancelar NO tiene puerta para una
 * persona (Wompi no tiene suscripciones; el equipo cambia el estado). La página
 * cuenta lo mismo de siempre y la petición sale por correo ya escrito a
 * CancelSubscriptionView.CORREO. Datos por PlanesDatos; sin `.from()` aquí.
 */
class CancelSubscriptionView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.orgId = null;
    this.org = null;
    this.subscription = null;
    this.plan = null;
    this.creditsAvailable = 0;
    this.reason = null;
    this.cancelling = false;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        window.router?.navigate('/login', true);
        return;
      }
    }
    this.orgId = this.routeParams?.orgId
      || window.appState?.get('selectedOrganizationId')
      || localStorage.getItem('selectedOrganizationId');
    if (!this.orgId) {
      window.router?.navigate('/create', true);
      return;
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
  }

  /** BaseView.render() exige renderHTML(): el cascarón; _render() pinta encima con los datos. */
  renderHTML() {
    return '<div class="cancel-page"><div class="cancel-card"><p class="text-muted">' + __('Cargando…') + '</p></div></div>';
  }

  async render() {
    await super.render();
    if (!window.PlanesDatos) { this.showError(__('Planes no disponible.')); return; }
    await this._loadContext();
    this._render();
    this._bind();
  }

  /** Corte (planes.md): plan, suscripción y créditos por PlanesDatos; la marca por mi_contexto(). */
  async _loadContext() {
    const d = await window.PlanesDatos.cargar(this.orgId).catch(() => null);
    this.org = window.contextoService?.org?.(this.orgId) || { id: this.orgId, name: window.currentOrgName || '' };
    this.subscription = d?.currentSubscription || null;
    this.plan = d?.currentPlan || null;
    this.creditsAvailable = Number(d?.orgCredits?.credits_available ?? 0);
  }

  _render() {
    const host = this.container;
    if (!host) return;
    if (!this.subscription || this.subscription.status === 'cancelled' || this.subscription.status === 'canceled' || (this.subscription.tier || this.subscription.plan_id) === 'free') {
      host.innerHTML = this._renderEmpty();
      return;
    }
    host.innerHTML = this._renderActive();
  }

  _renderEmpty() {
    return `
      <div class="cancel-page">
        <div class="cancel-card">
          <h1>${__('No tienes suscripción activa')}</h1>
          <p>${this.subscription?.status === 'cancelled'
              ? __('Tu suscripción ya está cancelada.')
              : __('Esta organización no tiene una suscripción activa que cancelar.')}</p>
          <a href="${this._plansRoute()}" class="btn btn-primary">
            <i class="aisc-ico aisc-ico--arrow-left"></i> ${__('Volver a planes')}
          </a>
        </div>
      </div>
    `;
  }

  _renderActive() {
    const renewal = this.subscription.current_period_end
      ? new Date(this.subscription.current_period_end).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
      : '—';

    return `
      <div class="cancel-page">
        <div class="cancel-card">
          <a href="${this._plansRoute()}" class="cancel-back">
            <i class="aisc-ico aisc-ico--arrow-left"></i> ${__('Volver')}
          </a>

          <h1>${__('Cancelar suscripción')}</h1>
          <p class="cancel-lead">
            ${__('Vas a cancelar el plan <strong>{plan}</strong> de <strong>{org}</strong>.', {
              plan: this.escapeHtml(this.plan?.name || this.subscription.plan_id),
              org: this.escapeHtml(this.org?.name || ''),
            })}
          </p>

          <div class="cancel-facts">
            <h3>${__('Esto es lo que pasa al cancelar')}</h3>
            <ul>
              <li><i class="aisc-ico aisc-ico--alert-info"></i> ${__('Tu plan sigue activo hasta el <strong>{date}</strong> — usa los créditos que tienes.', { date: renewal })}</li>
              <li><i class="aisc-ico aisc-ico--alert-info"></i> ${__('No se hará el siguiente cargo a tu tarjeta.')}</li>
              <li><i class="aisc-ico aisc-ico--alert-info"></i> ${__('Tus {n} créditos disponibles se mantienen hasta el final del periodo.', { n: this.creditsAvailable.toLocaleString('es') })}</li>
              <li><i class="aisc-ico aisc-ico--alert-info"></i> ${__('Después del {date} pasarás al plan Free (50 cr/mes, outputs con marca de agua).', { date: renewal })}</li>
              <li><i class="aisc-ico aisc-ico--alert-info"></i> ${__('Puedes reactivar en cualquier momento desde la página de planes.')}</li>
            </ul>
          </div>

          <details class="cancel-survey">
            <summary>${__('¿Por qué cancelas? (opcional, ayuda a mejorar el producto)')}</summary>
            <div class="cancel-survey-options">
              ${[__('Muy caro'), __('No lo uso lo suficiente'), __('Falta una feature'), __('Encontré una alternativa'), __('Cambió mi proyecto'), __('Otro')].map((r) => `
                <label class="cancel-survey-option">
                  <input type="radio" name="cancel_reason" value="${this.escapeHtml(r)}"> ${this.escapeHtml(r)}
                </label>
              `).join('')}
              <textarea id="cancelComment" rows="3" placeholder="${__('Comentario adicional (opcional)')}"></textarea>
            </div>
          </details>

          <div class="cancel-actions">
            <button type="button" class="btn btn-secondary" id="cancelKeep">
              ${__('Conservar mi suscripción')}
            </button>
            <button type="button" class="btn btn-danger" id="cancelConfirm">
              <i class="aisc-ico aisc-ico--close"></i> ${__('Cancelar suscripción')}
            </button>
          </div>

          <p class="cancel-fineprint">
            ${__('Hoy la cancelación la hace una persona del equipo: al confirmar se abre un correo ya escrito a {correo} con tu petición y te respondemos con la confirmación. No requerimos llamada telefónica.', { correo: CancelSubscriptionView.CORREO })}
          </p>

          <div id="cancelStatus" class="cancel-status" role="status" aria-live="polite"></div>
        </div>
      </div>
    `;
  }

  _bind() {
    const root = this.container;
    if (!root) return;
    const keep = root.querySelector('#cancelKeep');
    const confirm = root.querySelector('#cancelConfirm');
    if (keep) this.addEventListener(keep, 'click', () => window.history.back());
    if (confirm) this.addEventListener(confirm, 'click', () => this._confirmCancel());
  }

  /**
   * Cancelar no tiene puerta para una persona en la base nueva (planes.md): la
   * petición sale por correo, ya escrita con plan, marca, motivo y comentario.
   * Nada se promete que no pase: el estado de la suscripción lo cambia el equipo.
   */
  async _confirmCancel() {
    const root = this.container;
    const reason = root.querySelector('input[name="cancel_reason"]:checked')?.value || null;
    const comment = root.querySelector('#cancelComment')?.value?.trim() || null;
    const status = root.querySelector('#cancelStatus');
    const asunto = __('Cancelar la suscripción de {org}', { org: this.org?.name || this.orgId });
    const cuerpo = [
      __('Hola, quiero cancelar la suscripción de la marca {org} (plan {plan}).', { org: this.org?.name || '', plan: this.plan?.name || this.subscription?.tier || '' }),
      `organization_id: ${this.orgId}`,
      reason ? `${__('Motivo')}: ${reason}` : '',
      comment ? `${__('Comentario')}: ${comment}` : '',
    ].filter(Boolean).join('\n');
    const href = `mailto:${CancelSubscriptionView.CORREO}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    try { window.location.href = href; } catch (_) { /* sin cliente de correo */ }
    if (status) {
      status.className = 'cancel-status is-success';
      status.innerHTML = `<i class="aisc-ico aisc-ico--check"></i> ${__('Se abrió tu correo con la petición. Si no se abrió, escríbenos a {correo}.', { correo: `<a href="${this.escapeHtml(href)}">${this.escapeHtml(CancelSubscriptionView.CORREO)}</a>` })}`;
    }
  }

  _plansRoute() {
    if (typeof window.getOrgPathPrefix === 'function' && this.org?.name) {
      const prefix = window.getOrgPathPrefix(this.orgId, this.org.name);
      if (prefix) return `${prefix}/plans`;
    }
    return '/plans';
  }
}

CancelSubscriptionView.CORREO = 'contact@aismartcontent.io';
window.CancelSubscriptionView = CancelSubscriptionView;
