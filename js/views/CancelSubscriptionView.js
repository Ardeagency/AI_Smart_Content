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
 * Stripe NO conectado: el Edge Function provision-cancel-subscription es stub
 * que marca subscription.status='cancellation_pending' y manda el email.
 * Cuando Stripe se conecte, llamará a stripe.subscriptions.cancel().
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

  async render() {
    await super.render();
    if (window.supabaseService) {
      this.supabase = await window.supabaseService.getClient();
    } else if (window.supabase) {
      this.supabase = window.supabase;
    }
    if (!this.supabase) {
      this.showError(__('Supabase no disponible.'));
      return;
    }
    await this._loadContext();
    this._render();
    this._bind();
  }

  async _loadContext() {
    const [orgRes, subRes, credRes] = await Promise.all([
      this.supabase.from('organizations').select('id, name').eq('id', this.orgId).maybeSingle(),
      this.supabase.from('subscriptions')
        .select('id, plan_id, status, current_period_end')
        .eq('organization_id', this.orgId)
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle(),
      this.supabase.from('organization_credits')
        .select('credits_available').eq('organization_id', this.orgId).maybeSingle(),
    ]);
    this.org = orgRes.data;
    this.subscription = subRes.data;
    this.creditsAvailable = Number(credRes.data?.credits_available ?? 0);
    if (this.subscription?.plan_id) {
      const { data } = await this.supabase.from('plans')
        .select('id, name, price_usd_month').eq('id', this.subscription.plan_id).maybeSingle();
      this.plan = data;
    }
  }

  _render() {
    const host = this.container;
    if (!host) return;
    if (!this.subscription || this.subscription.status === 'cancelled') {
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
            <i class="fas fa-arrow-left"></i> ${__('Volver a planes')}
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
            <i class="fas fa-arrow-left"></i> ${__('Volver')}
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
              <li><i class="fas fa-circle-info"></i> ${__('Tu plan sigue activo hasta el <strong>{date}</strong> — usa los créditos que tienes.', { date: renewal })}</li>
              <li><i class="fas fa-circle-info"></i> ${__('No se hará el siguiente cargo a tu tarjeta.')}</li>
              <li><i class="fas fa-circle-info"></i> ${__('Tus {n} créditos disponibles se mantienen hasta el final del periodo.', { n: this.creditsAvailable.toLocaleString('es') })}</li>
              <li><i class="fas fa-circle-info"></i> ${__('Después del {date} pasarás al plan Free (50 cr/mes, outputs con marca de agua).', { date: renewal })}</li>
              <li><i class="fas fa-circle-info"></i> ${__('Puedes reactivar en cualquier momento desde la página de planes.')}</li>
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
              <i class="fas fa-circle-xmark"></i> ${__('Cancelar suscripción')}
            </button>
          </div>

          <p class="cancel-fineprint">
            ${__('Recibirás un email de confirmación. Si tienes problemas con esto, escríbenos a soporte; no requerimos llamada telefónica.')}
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

  async _confirmCancel() {
    if (this.cancelling) return;
    this.cancelling = true;

    const root = this.container;
    const reason = root.querySelector('input[name="cancel_reason"]:checked')?.value || null;
    const comment = root.querySelector('#cancelComment')?.value?.trim() || null;
    const status = root.querySelector('#cancelStatus');
    const btn = root.querySelector('#cancelConfirm');
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${__('Cancelando…')}`; }

    try {
      const { data, error } = await this.supabase.functions.invoke('cancel-subscription', {
        body: {
          subscription_id: this.subscription.id,
          organization_id: this.orgId,
          reason,
          comment,
        },
      });
      if (error) throw new Error(error.message || __('No se pudo cancelar'));

      if (status) {
        status.className = 'cancel-status is-success';
        status.innerHTML = `<i class="fas fa-circle-check"></i> ${__('Cancelación confirmada. Te enviamos un email con los detalles.')}`;
      }
      setTimeout(() => window.router?.navigate(this._plansRoute(), true), 2000);
    } catch (e) {
      if (status) {
        status.className = 'cancel-status is-error';
        status.textContent = `${__('Error')}: ${e.message}`;
      }
      if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-circle-xmark"></i> ${__('Cancelar suscripción')}`; }
      this.cancelling = false;
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

window.CancelSubscriptionView = CancelSubscriptionView;
