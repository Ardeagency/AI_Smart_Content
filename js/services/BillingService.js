/**
 * BillingService — orquesta pagos vía Stripe (USD, internacional) y Wompi
 * (COP, Colombia). El frontend nunca habla con Stripe/Wompi directamente:
 * llama Netlify functions que firman las requests server-side.
 *
 * Uso típico:
 *   await window.billingService.startCheckout({
 *     target:    'subscription',   // o 'package'
 *     planId:    'agency',
 *     billing:   'month',          // o 'year' (solo subscription)
 *     gateway:   'auto',           // 'stripe' | 'wompi' | 'auto'
 *   });
 *
 * FEAT-019.
 */
(function () {
  'use strict';

  const WIDGET_SRC = 'https://checkout.wompi.co/widget.js';

  class BillingService {
    constructor() {
      this._gatewaysCache = null;
      this._widgetLoading = null;
    }

    // ── public API ─────────────────────────────────────────────────

    async getGateways(force = false) {
      if (this._gatewaysCache && !force) return this._gatewaysCache;
      try {
        const res = await fetch('/api/billing/gateways', { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this._gatewaysCache = await res.json();
      } catch (e) {
        console.warn('[BillingService] gateways fetch failed:', e.message);
        this._gatewaysCache = { stripe: false, wompi: false };
      }
      return this._gatewaysCache;
    }

    /**
     * Inicia un checkout. Si gateway='auto' decide según disponibilidad:
     * Wompi si está activo (mercado primario CO), Stripe en otro caso.
     */
    async startCheckout({ target, planId, packageId, billing, gateway = 'auto' }) {
      const orgId = this._activeOrgId();
      if (!orgId) {
        this._toast('No hay organización activa. Selecciona una organización antes de continuar.', 'error');
        return;
      }

      const gateways = await this.getGateways();
      const chosen   = this._resolveGateway(gateway, gateways);
      if (!chosen) {
        this._toast('Ninguna pasarela de pago está configurada. Contacta a soporte.', 'error');
        return;
      }

      if (chosen === 'auto-prompt') {
        return this._openGatewayPicker({ target, planId, packageId, billing });
      }

      if (chosen === 'stripe') return this._checkoutStripe({ orgId, target, planId, packageId, billing });
      if (chosen === 'wompi')  return this._checkoutWompi ({ orgId, target, planId, packageId, billing });
    }

    async openCustomerPortal() {
      const orgId = this._activeOrgId();
      if (!orgId) return;
      try {
        const body = JSON.stringify({ organization_id: orgId });
        const res  = await fetch('/api/billing/portal', { method: 'POST', headers: await this._authHeaders(), body });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error abriendo portal');
        window.location.href = data.url;
      } catch (e) {
        this._toast(`No se pudo abrir el portal: ${e.message}`, 'error');
      }
    }

    // ── gateway resolution ─────────────────────────────────────────

    _resolveGateway(requested, gateways) {
      if (requested === 'stripe') return gateways.stripe ? 'stripe' : null;
      if (requested === 'wompi')  return gateways.wompi  ? 'wompi'  : null;
      // auto
      if (gateways.wompi && gateways.stripe) return 'auto-prompt';
      if (gateways.wompi)                    return 'wompi';
      if (gateways.stripe)                   return 'stripe';
      return null;
    }

    _openGatewayPicker(ctx) {
      // Modal simple con 2 opciones. Si la app tiene un sistema de modales
      // propio se puede integrar allí; por simplicidad uso un overlay inline.
      const existing = document.getElementById('billingGatewayPicker');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'billingGatewayPicker';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
      overlay.innerHTML = `
        <div style="background:#141517;border:1px solid #242424;border-radius:16px;padding:28px;max-width:480px;width:90%;color:#fff;">
          <h3 style="margin:0 0 8px 0;font-size:18px;">Elige cómo pagar</h3>
          <p style="margin:0 0 20px 0;color:#9ca3af;font-size:14px;">Selecciona la pasarela que prefieras.</p>
          <button data-gw="wompi" style="width:100%;padding:14px 16px;margin-bottom:10px;background:#0F4FE0;color:#fff;border:none;border-radius:10px;cursor:pointer;text-align:left;font-size:14px;">
            <strong>Wompi</strong> · COP — Tarjeta, PSE, Nequi, Bancolombia
            <div style="font-size:12px;color:#d1d5db;margin-top:4px;">Recomendado para Colombia</div>
          </button>
          <button data-gw="stripe" style="width:100%;padding:14px 16px;background:#1f2937;color:#fff;border:1px solid #374151;border-radius:10px;cursor:pointer;text-align:left;font-size:14px;">
            <strong>Stripe</strong> · USD — Tarjeta internacional
            <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Para clientes fuera de Colombia</div>
          </button>
          <button data-gw="cancel" style="width:100%;padding:10px;margin-top:12px;background:transparent;color:#9ca3af;border:none;cursor:pointer;font-size:13px;">Cancelar</button>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-gw]');
        if (!btn) return;
        const gw = btn.getAttribute('data-gw');
        overlay.remove();
        if (gw === 'wompi')  return this._checkoutWompi ({ orgId: this._activeOrgId(), ...ctx });
        if (gw === 'stripe') return this._checkoutStripe({ orgId: this._activeOrgId(), ...ctx });
      });
    }

    // ── Stripe ─────────────────────────────────────────────────────

    async _checkoutStripe({ orgId, target, planId, packageId, billing }) {
      try {
        const body = JSON.stringify({
          organization_id: orgId,
          target,
          plan_id:    target === 'subscription' ? planId    : undefined,
          package_id: target === 'package'      ? packageId : undefined,
          billing,
        });
        const res  = await fetch('/api/billing/checkout', { method: 'POST', headers: await this._authHeaders(), body });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error en checkout Stripe');
        window.location.href = data.url;
      } catch (e) {
        this._toast(`Stripe: ${e.message}`, 'error');
      }
    }

    // ── Wompi ──────────────────────────────────────────────────────

    async _checkoutWompi({ orgId, target, planId, packageId, billing }) {
      try {
        const body = JSON.stringify({
          organization_id: orgId,
          target,
          plan_id:    target === 'subscription' ? planId    : undefined,
          package_id: target === 'package'      ? packageId : undefined,
          billing,
        });
        const res  = await fetch('/api/billing/wompi/checkout', { method: 'POST', headers: await this._authHeaders(), body });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error en checkout Wompi');

        await this._ensureWompiWidget();
        if (!window.WidgetCheckout) throw new Error('Widget Wompi no disponible. Recarga la página e intenta de nuevo.');

        const checkout = new window.WidgetCheckout({
          currency:        data.currency,
          amountInCents:   data.amount_in_cents,
          reference:       data.reference,
          publicKey:       data.public_key,
          signature:       { integrity: data.signature },
          redirectUrl:     data.redirect_url,
          expirationTime:  data.expiration_time,
          customerData:    data.customer_email ? { email: data.customer_email } : undefined,
        });
        checkout.open((result) => {
          // result.transaction tiene id + status; el webhook es la fuente de verdad.
          // Aquí solo damos feedback visual inmediato.
          const tx     = result?.transaction;
          const status = tx?.status || 'UNKNOWN';
          if (status === 'APPROVED') {
            this._toast('Pago aprobado. Estamos activando tu compra…', 'success');
          } else if (status === 'PENDING') {
            this._toast('Pago en proceso. Te notificaremos cuando se confirme.', 'info');
          } else if (status === 'DECLINED' || status === 'ERROR' || status === 'VOIDED') {
            this._toast(`Pago no completado (${status}). Intenta de nuevo.`, 'error');
          }
        });
      } catch (e) {
        this._toast(`Wompi: ${e.message}`, 'error');
      }
    }

    _ensureWompiWidget() {
      if (window.WidgetCheckout) return Promise.resolve();
      if (this._widgetLoading)   return this._widgetLoading;
      this._widgetLoading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src   = WIDGET_SRC;
        script.async = true;
        script.onload  = () => resolve();
        script.onerror = () => reject(new Error('No se pudo cargar el widget de Wompi'));
        document.head.appendChild(script);
      });
      return this._widgetLoading;
    }

    // ── helpers ────────────────────────────────────────────────────

    _activeOrgId() {
      if (window.appState && typeof window.appState.getActiveOrgId === 'function') {
        return window.appState.getActiveOrgId();
      }
      return window.activeOrgId || window.currentOrgId || null;
    }

    async _authHeaders() {
      const headers = { 'Content-Type': 'application/json' };
      try {
        const supabase = window.supabaseService?.getClient
          ? await window.supabaseService.getClient()
          : window.supabase;
        if (supabase?.auth?.getSession) {
          const { data } = await supabase.auth.getSession();
          const token = data?.session?.access_token;
          if (token) headers['Authorization'] = `Bearer ${token}`;
          else console.warn('[BillingService] sin access_token en session — usuario no logueado?');
        } else {
          console.warn('[BillingService] supabase client no disponible al construir headers');
        }
      } catch (e) {
        console.warn('[BillingService] error obteniendo token:', e?.message || e);
      }
      return headers;
    }

    _toast(msg, kind = 'info') {
      if (window.showToast) return window.showToast(msg, kind);
      // fallback
      console[kind === 'error' ? 'error' : 'log']('[billing]', msg);
      alert(msg);
    }
  }

  window.BillingService = BillingService;
  window.billingService = new BillingService();
})();
