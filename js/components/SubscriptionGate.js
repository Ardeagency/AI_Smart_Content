/**
 * SubscriptionGate — la pantalla de "tu plan venció", al estilo Netflix.
 *
 * Tres estados, y la regla la decide la BD (rpc get_subscription_gate) para que
 * sea la misma aquí, en el móvil y en lo que venga después:
 *   · ok        → no se ve nada.
 *   · gracia    → banner arriba. Sigue trabajando: 7 días de margen porque
 *                 cortarle el acceso a un buen cliente por un retraso de horas
 *                 cuesta más que los días que se regalan.
 *   · bloqueada → pantalla completa con dos puertas: renovar o cerrar sesión.
 *
 * LAS CORTESÍAS NUNCA LLEGAN A `bloqueada` (lo garantiza el RPC): un
 * `admin_grant` vencido es una conversación comercial pendiente, no una falta
 * de pago del cliente.
 *
 * Falla ABIERTA: si el RPC no responde, no se bloquea a nadie. Un error de red
 * jamás puede dejar a un cliente fuera de lo que ya pagó.
 */
(function () {
  'use strict';

  const T = (s, v) => (typeof window.__ === 'function' ? window.__(s, v) : s);

  /* Las únicas rutas alcanzables con el plan vencido: pagar y salir. */
  const RUTAS_LIBRES = ['/planes', '/creditos', '/login', '/signin', '/logout'];

  function esRutaLibre(path) {
    const p = String(path || window.location.pathname || '');
    return RUTAS_LIBRES.some((r) => p.endsWith(r) || p.includes(r + '/') || p.includes(r + '?'));
  }

  function fecha(iso) {
    try {
      return new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (_) { return iso || ''; }
  }

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  class SubscriptionGate {
    constructor({ supabase, orgId } = {}) {
      this.sb = supabase || window.supabase || null;
      this.orgId = orgId || null;
      this.estado = null;
      this._pintado = false;
    }

    async revisar() {
      if (!this.sb || !this.orgId) return null;
      try {
        const { data, error } = await this.sb.rpc('get_subscription_gate', { p_org_id: this.orgId });
        if (error) throw error;
        this.estado = data || null;
      } catch (e) {
        // Falla abierta: sin veredicto no se bloquea.
        console.warn('[SubscriptionGate] sin veredicto:', e?.message || e);
        this.estado = null;
      }
      this.pintar();
      return this.estado;
    }

    pintar() {
      const st = this.estado?.estado;
      this._quitarBanner();
      if (st === 'bloqueada' && !esRutaLibre()) this._pintarBloqueo();
      else this._quitarBloqueo();
      if (st === 'gracia') this._pintarBanner();
    }

    /* ── Gracia: banner, no muro ─────────────────────────────────────────── */
    _pintarBanner() {
      const e = this.estado || {};
      const cortesia = !!e.es_cortesia;
      const quedan = Number(e.dias_de_gracia_restantes || 0);
      const texto = cortesia
        ? T('El plan {plan} está vencido desde el {fecha}. Es una cortesía: el acceso sigue abierto, pero hay que renovarlo.',
            { plan: e.plan_nombre, fecha: fecha(e.vence) })
        : quedan > 0
          ? T('Tu plan {plan} venció el {fecha}. Te quedan {n} días de acceso.',
              { plan: e.plan_nombre, fecha: fecha(e.vence), n: quedan })
          : T('Tu plan {plan} venció el {fecha}. El acceso se cierra hoy.',
              { plan: e.plan_nombre, fecha: fecha(e.vence) });

      const div = document.createElement('div');
      div.className = 'subgate-banner';
      div.id = 'subgateBanner';
      div.innerHTML = `
        <span class="subgate-banner-txt">${esc(texto)}</span>
        <a class="subgate-banner-cta" href="/planes">${esc(T('Renovar'))}</a>`;
      document.body.appendChild(div);
      document.body.classList.add('has-subgate-banner');
    }

    _quitarBanner() {
      document.getElementById('subgateBanner')?.remove();
      document.body.classList.remove('has-subgate-banner');
    }

    /* ── Bloqueada: el muro ──────────────────────────────────────────────── */
    _pintarBloqueo() {
      if (document.getElementById('subgateWall')) return;
      const e = this.estado || {};
      const wall = document.createElement('div');
      wall.className = 'subgate-wall';
      wall.id = 'subgateWall';
      wall.setAttribute('role', 'dialog');
      wall.setAttribute('aria-modal', 'true');
      wall.innerHTML = `
        <div class="subgate-wall-card">
          <img class="subgate-logo" src="/recursos/logos/logo-03.svg" alt="AI Smart Content" width="200" height="21">
          <h1 class="subgate-titulo">${esc(T('Tu plan {plan} venció', { plan: e.plan_nombre || '' }))}</h1>
          <p class="subgate-sub">${esc(T('Venció el {fecha}. Renueva para volver a tener a Vera trabajando en tu marca.', { fecha: fecha(e.vence) }))}</p>
          <div class="subgate-datos">
            <div><dt>${esc(T('Plan'))}</dt><dd>${esc(e.plan_nombre || '—')}</dd></div>
            ${e.precio_mes ? `<div><dt>${esc(T('Mensualidad'))}</dt><dd>US$${esc(e.precio_mes)}</dd></div>` : ''}
            <div><dt>${esc(T('Vencido hace'))}</dt><dd>${esc(T('{n} días', { n: e.dias_vencida }))}</dd></div>
          </div>
          <a class="subgate-btn" href="/planes">${esc(T('Renovar mi plan'))}</a>
          <button type="button" class="subgate-salir" data-subgate-logout>${esc(T('Cerrar sesión'))}</button>
          <p class="subgate-nota">${esc(T('Tus datos y tu historial siguen intactos.'))}</p>
        </div>`;
      document.body.appendChild(wall);
      document.body.classList.add('has-subgate-wall');

      wall.querySelector('[data-subgate-logout]')?.addEventListener('click', async () => {
        try { await (window.authService?.signOut?.() || this.sb?.auth?.signOut?.()); } catch (_) {}
        window.location.href = '/login';
      });
    }

    _quitarBloqueo() {
      document.getElementById('subgateWall')?.remove();
      document.body.classList.remove('has-subgate-wall');
    }

    destroy() {
      this._quitarBanner();
      this._quitarBloqueo();
    }
  }

  window.SubscriptionGate = SubscriptionGate;
})();
