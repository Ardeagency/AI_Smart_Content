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
      this._checkoutInFlight = false;   // guard anti-doble-click
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
      if (this._checkoutInFlight) {
        console.warn('[BillingService] checkout ya en curso — ignorando re-trigger');
        return;
      }
      this._checkoutInFlight = true;
      // safety net: si algo se cuelga, libera el guard a los 60s para no quedar bloqueado.
      const releaseTimer = setTimeout(() => { this._checkoutInFlight = false; }, 60_000);
      const release = () => { clearTimeout(releaseTimer); this._checkoutInFlight = false; };

      const orgId = this._activeOrgId();
      if (!orgId) {
        this._toast('No hay organización activa. Selecciona una organización antes de continuar.', 'error');
        release();
        return;
      }

      const gateways = await this.getGateways();
      const chosen   = this._resolveGateway(gateway, gateways);
      if (!chosen) {
        this._toast('Ninguna pasarela de pago está configurada. Contacta a soporte.', 'error');
        release();
        return;
      }

      try {
        if (chosen === 'auto-prompt') {
          await this._openGatewayPicker({ orgId, target, planId, packageId, billing });
        } else if (chosen === 'stripe') {
          await this._checkoutStripe({ orgId, target, planId, packageId, billing });
        } else if (chosen === 'wompi') {
          await this._checkoutWompi({ orgId, target, planId, packageId, billing, onClose: release });
          return;   // Wompi libera el guard en el callback del widget, no aquí.
        }
      } finally {
        if (chosen !== 'wompi') release();
      }
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

    _openGatewayPicker({ orgId, target, planId, packageId, billing }) {
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
        if (gw === 'cancel') { this._checkoutInFlight = false; return; }
        if (gw === 'wompi') {
          return this._checkoutWompi({ orgId, target, planId, packageId, billing, onClose: () => { this._checkoutInFlight = false; } });
        }
        if (gw === 'stripe') {
          await this._checkoutStripe({ orgId, target, planId, packageId, billing });
          this._checkoutInFlight = false;
        }
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

    async _checkoutWompi({ orgId, target, planId, packageId, billing, onClose }) {
      // Wompi tiene dos flujos:
      //  - target='package'      → Widget Checkout (cobro único, no tokeniza)
      //  - target='subscription' → flujo tokenizado (form propio → /tokens/cards
      //                            → /payment_sources → /transactions con
      //                            payment_source_id reusable para el cron mensual)
      if (target === 'subscription') {
        return this._checkoutWompiSubscription({ orgId, planId, billing, onClose });
      }
      return this._checkoutWompiWidget({ orgId, target, planId, packageId, billing, onClose });
    }

    // ── Flujo Widget (pagos únicos: paquetes de créditos) ──────────
    async _checkoutWompiWidget({ orgId, target, planId, packageId, billing, onClose }) {
      const finish = () => { try { onClose && onClose(); } catch (_) {} };
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
          finish();
          const tx     = result?.transaction;
          const status = tx?.status || 'UNKNOWN';
          if (status === 'APPROVED')      this._toast('Pago aprobado. Estamos activando tu compra…', 'success');
          else if (status === 'PENDING')  this._toast('Pago en proceso. Te notificaremos cuando se confirme.', 'info');
          else if (['DECLINED','ERROR','VOIDED'].includes(status)) this._toast(`Pago no completado (${status}). Intenta de nuevo.`, 'error');
        });
      } catch (e) {
        this._toast(`Wompi: ${e.message}`, 'error');
        finish();
      }
    }

    // ── Flujo tokenizado (suscripciones recurrentes) ───────────────
    async _checkoutWompiSubscription({ orgId, planId, billing, onClose }) {
      const finish = () => { try { onClose && onClose(); } catch (_) {} };
      try {
        const gateways = await this.getGateways();
        if (!gateways.wompi_public_key) throw new Error('Wompi public key no disponible');
        const wompiApi = gateways.environment === 'production'
          ? 'https://production.wompi.co/v1'
          : 'https://sandbox.wompi.co/v1';

        const card = await this._openCardModal({ planLabel: planId, billing });
        if (!card) { finish(); return; }  // user canceló

        // 1. Tokenizar tarjeta directo a Wompi (frontend, public_key)
        this._setStatus('Tokenizando tarjeta…');
        const tokRes  = await fetch(`${wompiApi}/tokens/cards`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${gateways.wompi_public_key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number:      card.number,
            cvc:         card.cvc,
            exp_month:   card.exp_month,
            exp_year:    card.exp_year,
            card_holder: card.card_holder,
          }),
        });
        const tokJson = await tokRes.json().catch(() => ({}));
        if (!tokRes.ok || !tokJson?.data?.id) {
          throw new Error(tokJson?.error?.messages?.number?.[0] || tokJson?.error?.reason || 'No se pudo tokenizar la tarjeta');
        }
        const cardToken = tokJson.data.id;

        // 2. Crear payment_source server-side
        this._setStatus('Registrando método de pago…');
        const setupRes = await fetch('/api/billing/wompi/setup-source', {
          method: 'POST',
          headers: await this._authHeaders(),
          body: JSON.stringify({ organization_id: orgId, card_token: cardToken }),
        });
        const setupJson = await setupRes.json();
        if (!setupRes.ok) throw new Error(setupJson.error || 'Error registrando método de pago');
        if (setupJson.status === 'DECLINED' || setupJson.status === 'ERROR') {
          throw new Error(setupJson.status_reason || `Tarjeta rechazada (${setupJson.status})`);
        }

        // 3. Cobrar transacción inicial con payment_source_id
        this._setStatus('Procesando primer cobro…');
        const chargeRes = await fetch('/api/billing/wompi/charge-source', {
          method: 'POST',
          headers: await this._authHeaders(),
          body: JSON.stringify({
            organization_id:   orgId,
            payment_source_id: setupJson.payment_source_id,
            target:            'subscription',
            plan_id:           planId,
            billing,
          }),
        });
        const chargeJson = await chargeRes.json();
        if (!chargeRes.ok) throw new Error(chargeJson.error || 'Error procesando primer cobro');

        this._closeCardModal();
        this._toast(`Suscripción iniciada. Tarjeta ${setupJson.brand || ''} ****${setupJson.last_four || ''}. El estado final del cobro llega por webhook.`, 'success');
      } catch (e) {
        this._setStatus(`Error: ${e.message}`, true);
        this._toast(`Wompi: ${e.message}`, 'error');
      } finally {
        finish();
      }
    }

    // ── Modal captura de tarjeta ───────────────────────────────────
    _openCardModal({ planLabel, billing }) {
      return new Promise((resolve) => {
        const existing = document.getElementById('billingCardModal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'billingCardModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:1rem;';
        overlay.innerHTML = `
          <div style="background:#141517;border:1px solid #242424;border-radius:16px;padding:24px;max-width:440px;width:100%;color:#fff;box-shadow:0 24px 64px rgba(0,0,0,.5);">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px;">
              <div>
                <h3 style="margin:0;font-size:18px;">Datos de tu tarjeta</h3>
                <p style="margin:6px 0 0;color:#9ca3af;font-size:13px;">${planLabel ? `Plan <strong>${planLabel}</strong> · facturación ${billing === 'year' ? 'anual' : 'mensual'}` : 'Suscripción'}</p>
              </div>
              <button type="button" data-act="cancel" style="background:transparent;border:none;color:#9ca3af;font-size:22px;line-height:1;cursor:pointer;padding:0 4px;" aria-label="Cerrar">×</button>
            </div>

            <form id="billingCardForm" autocomplete="on" novalidate>
              <label style="display:block;margin-bottom:14px;">
                <span style="display:block;font-size:13px;color:#9ca3af;margin-bottom:6px;">Nombre en la tarjeta</span>
                <input type="text" name="card_holder" autocomplete="cc-name" required maxlength="60"
                  style="width:100%;padding:10px 12px;background:#0b0b0b;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;">
              </label>

              <label style="display:block;margin-bottom:14px;">
                <span style="display:block;font-size:13px;color:#9ca3af;margin-bottom:6px;">Número de tarjeta</span>
                <input type="text" name="number" inputmode="numeric" autocomplete="cc-number" required maxlength="23"
                  placeholder="4242 4242 4242 4242"
                  style="width:100%;padding:10px 12px;background:#0b0b0b;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;letter-spacing:1px;box-sizing:border-box;">
              </label>

              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px;">
                <label>
                  <span style="display:block;font-size:13px;color:#9ca3af;margin-bottom:6px;">Mes</span>
                  <input type="text" name="exp_month" inputmode="numeric" autocomplete="cc-exp-month" required maxlength="2" placeholder="12"
                    style="width:100%;padding:10px 12px;background:#0b0b0b;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;">
                </label>
                <label>
                  <span style="display:block;font-size:13px;color:#9ca3af;margin-bottom:6px;">Año</span>
                  <input type="text" name="exp_year" inputmode="numeric" autocomplete="cc-exp-year" required maxlength="2" placeholder="29"
                    style="width:100%;padding:10px 12px;background:#0b0b0b;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;">
                </label>
                <label>
                  <span style="display:block;font-size:13px;color:#9ca3af;margin-bottom:6px;">CVC</span>
                  <input type="password" name="cvc" inputmode="numeric" autocomplete="cc-csc" required maxlength="4" placeholder="123"
                    style="width:100%;padding:10px 12px;background:#0b0b0b;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box;">
                </label>
              </div>

              <div id="billingCardStatus" style="min-height:18px;font-size:13px;margin-bottom:10px;color:#9ca3af;"></div>

              <div style="display:flex;gap:8px;">
                <button type="button" data-act="cancel" style="flex:0 0 auto;padding:12px 16px;background:transparent;color:#9ca3af;border:1px solid #2a2a2a;border-radius:10px;cursor:pointer;font-size:14px;">Cancelar</button>
                <button type="submit" id="billingCardSubmit" style="flex:1;padding:12px 16px;background:#0F4FE0;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;">Confirmar suscripción</button>
              </div>

              <p style="margin:14px 0 0;font-size:11px;color:#6b7280;text-align:center;">
                Los datos viajan directo a Wompi y nunca tocan nuestros servidores.<br>
                Renovación automática hasta que canceles.
              </p>
            </form>
          </div>
        `;
        document.body.appendChild(overlay);
        this._cardModalEl = overlay;

        const cleanup = (result) => {
          if (this._cardModalEl) { this._cardModalEl.remove(); this._cardModalEl = null; }
          resolve(result);
        };
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) cleanup(null);
          const cancelBtn = e.target.closest('button[data-act="cancel"]');
          if (cancelBtn) cleanup(null);
        });

        overlay.querySelector('#billingCardForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const f = e.currentTarget;
          const card = {
            number:      String(f.number.value || '').replace(/\s+/g, ''),
            cvc:         String(f.cvc.value || '').trim(),
            exp_month:   String(f.exp_month.value || '').trim().padStart(2, '0'),
            exp_year:    String(f.exp_year.value || '').trim().slice(-2).padStart(2, '0'),
            card_holder: String(f.card_holder.value || '').trim(),
          };
          const err = this._validateCard(card);
          if (err) { this._setStatus(err, true); return; }
          // El modal NO se cierra aquí — lo cierra _closeCardModal tras el cobro exitoso,
          // o lo dejamos abierto si falla para que el user corrija.
          const submit = overlay.querySelector('#billingCardSubmit');
          if (submit) { submit.disabled = true; submit.textContent = 'Procesando…'; }
          resolve(card);
        });
      });
    }

    _closeCardModal() {
      if (this._cardModalEl) { this._cardModalEl.remove(); this._cardModalEl = null; }
    }

    _setStatus(msg, isError = false) {
      const el = this._cardModalEl?.querySelector('#billingCardStatus');
      if (!el) return;
      el.textContent  = msg;
      el.style.color  = isError ? '#ff8a8a' : '#9ca3af';
      if (isError) {
        const submit = this._cardModalEl.querySelector('#billingCardSubmit');
        if (submit) { submit.disabled = false; submit.textContent = 'Reintentar'; }
      }
    }

    _validateCard({ number, cvc, exp_month, exp_year, card_holder }) {
      if (!card_holder || card_holder.length < 2) return 'Ingresa el nombre del titular';
      if (!/^\d{12,19}$/.test(number)) return 'Número de tarjeta inválido';
      if (!this._luhnOk(number))       return 'Número de tarjeta inválido (verifica dígitos)';
      if (!/^\d{3,4}$/.test(cvc))      return 'CVC inválido';
      const m = parseInt(exp_month, 10);
      const y = parseInt(exp_year, 10);
      if (!(m >= 1 && m <= 12))        return 'Mes de vencimiento inválido (1-12)';
      const now      = new Date();
      const fullYear = 2000 + y;
      // Tarjeta vence al fin del mes — válida hasta último día de ese mes.
      const expEndOfMonth = new Date(fullYear, m, 0, 23, 59, 59);
      if (expEndOfMonth < now)         return 'La tarjeta está vencida';
      return null;
    }

    _luhnOk(num) {
      let sum = 0, alt = false;
      for (let i = num.length - 1; i >= 0; i--) {
        let d = parseInt(num[i], 10);
        if (alt) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
        alt = !alt;
      }
      return sum % 10 === 0;
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
