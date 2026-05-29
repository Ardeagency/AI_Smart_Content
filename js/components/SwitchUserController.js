/**
 * SwitchUserController — impersonacion temporal de developers por leads.
 *
 * Pattern profesional (Stripe / Auth0 / Salesforce):
 * 1. Lead abre modal con lista de devs (is_developer=true).
 * 2. Click en dev → guardar sesion del lead en localStorage + llamar
 *    edge function lead-switch-user que devuelve un magic link.
 * 3. Browser redirige al magic link → Supabase auth setea la nueva sesion
 *    (lead queda logged in como target).
 * 4. Banner sticky arriba avisa "Viendo como X — Volver".
 * 5. Click en banner → restaurar sesion via supabase.auth.setSession()
 *    con el refresh_token guardado → reload.
 *
 * API publica:
 *   SwitchUserController.open()        — abre el modal
 *   SwitchUserController.setupBanner() — monta banner si hay impersonacion
 *   SwitchUserController.returnToLead()— restaura sesion del lead
 *   SwitchUserController.isLead()      — boolean check
 */
(function () {
  const STORAGE_KEY = 'switchuser:origin'; // sesion del lead guardada

  function getSupabase() {
    return window.supabaseClient || window.supabase || null;
  }

  function isLead() {
    return !!window.authService?.currentUser?.dev_role &&
           window.authService.currentUser.dev_role === 'lead';
  }

  function hasImpersonation() {
    try {
      return !!localStorage.getItem(STORAGE_KEY);
    } catch { return false; }
  }

  function readOrigin() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function clearOrigin() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  }

  // ─── Modal ─────────────────────────────────────────────────────────────

  async function open() {
    if (!isLead()) {
      showToast('Solo leads pueden cambiar de usuario.', 'error');
      return;
    }
    const supa = getSupabase();
    if (!supa) {
      showToast('Supabase no disponible.', 'error');
      return;
    }

    let modal = document.getElementById('switchUserModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'switchUserModal';
      modal.className = 'switchuser-modal-overlay';
      document.body.appendChild(modal);
    }
    modal.hidden = false;
    modal.innerHTML = `
      <div class="switchuser-modal" role="dialog" aria-modal="true" aria-labelledby="switchUserTitle">
        <header class="switchuser-modal-head">
          <div>
            <h3 id="switchUserTitle">Cambiar usuario</h3>
            <p>Inicia sesion como otro developer. Tu cuenta de Lead queda guardada para volver.</p>
          </div>
          <button type="button" class="switchuser-modal-close" data-action="close" aria-label="Cerrar">
            <i class="fas fa-times"></i>
          </button>
        </header>
        <div class="switchuser-modal-body" id="switchUserList">
          <div class="switchuser-loading"><i class="fas fa-circle-notch fa-spin"></i> Cargando developers...</div>
        </div>
        <footer class="switchuser-modal-foot">
          <p class="switchuser-modal-status" id="switchUserStatus" role="status" aria-live="polite"></p>
        </footer>
      </div>
    `;

    modal.querySelectorAll('[data-action="close"]').forEach((b) =>
      b.addEventListener('click', close, { once: true })
    );
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    // Cargar lista de devs
    try {
      const me = window.authService?.currentUser?.id;
      const { data, error } = await supa
        .from('profiles')
        .select('id, email, full_name, dev_role, dev_rank')
        .eq('is_developer', true)
        .order('full_name', { ascending: true });
      if (error) throw error;
      const others = (data || []).filter((p) => p.id !== me);
      renderList(others);
    } catch (err) {
      const host = modal.querySelector('#switchUserList');
      if (host) host.innerHTML = `<div class="switchuser-empty">Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  function close() {
    const modal = document.getElementById('switchUserModal');
    if (!modal) return;
    modal.hidden = true;
    modal.innerHTML = '';
  }

  function renderList(devs) {
    const host = document.querySelector('#switchUserModal #switchUserList');
    if (!host) return;
    if (devs.length === 0) {
      host.innerHTML = `
        <div class="switchuser-empty">
          <i class="fas fa-user-slash"></i>
          <p>No hay otros developers para cambiarse.</p>
        </div>
      `;
      return;
    }
    host.innerHTML = devs.map((d) => {
      const rank = d.dev_rank || 'rookie';
      const initials = (d.full_name || d.email || '?')
        .split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
      return `
        <button type="button" class="switchuser-row" data-target-id="${escapeHtml(d.id)}">
          <span class="switchuser-avatar" data-rank="${escapeHtml(rank)}">${escapeHtml(initials)}</span>
          <span class="switchuser-info">
            <strong>${escapeHtml(d.full_name || '(sin nombre)')}</strong>
            <span>${escapeHtml(d.email)}</span>
          </span>
          <span class="switchuser-meta">
            <span class="switchuser-tag">${escapeHtml((d.dev_role || '').toUpperCase())}</span>
            <span class="switchuser-tag" data-rank="${escapeHtml(rank)}">${escapeHtml(rank.toUpperCase())}</span>
          </span>
          <i class="fas fa-arrow-right switchuser-arrow"></i>
        </button>
      `;
    }).join('');

    host.querySelectorAll('[data-target-id]').forEach((btn) => {
      btn.addEventListener('click', () => switchTo(btn.getAttribute('data-target-id')));
    });
  }

  // ─── Switch ────────────────────────────────────────────────────────────

  async function switchTo(targetId) {
    const status = document.getElementById('switchUserStatus');
    if (status) status.textContent = 'Generando link de acceso...';

    const supa = getSupabase();
    if (!supa) return;

    try {
      // 1) Guardar sesion actual del lead
      const { data: { session } } = await supa.auth.getSession();
      if (!session?.refresh_token) {
        throw new Error('No hay sesion activa para guardar');
      }
      const me = window.authService?.currentUser || {};
      const origin = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        saved_at: new Date().toISOString(),
        lead: { id: me.id, email: me.email, full_name: me.full_name }
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(origin));

      // 2) Llamar edge function
      const { data, error } = await supa.functions.invoke('lead-switch-user', {
        body: { target_user_id: targetId }
      });
      if (error || !data?.action_link) {
        clearOrigin();
        throw new Error(error?.message || 'No se obtuvo action_link');
      }

      // 3) Redirigir al magic link — el browser carga la URL de Supabase auth,
      // que setea cookies/session y redirige a site_url con el nuevo token
      if (status) status.textContent = 'Cambiando de usuario...';
      window.location.href = data.action_link;
    } catch (err) {
      if (status) {
        status.textContent = err.message || String(err);
        status.classList.add('is-error');
      }
    }
  }

  // ─── Banner + return ───────────────────────────────────────────────────

  function setupBanner() {
    if (!hasImpersonation()) {
      removeBanner();
      return;
    }
    const me = window.authService?.currentUser;
    if (!me) return;
    const origin = readOrigin();
    if (!origin) return;
    // Si la sesion activa es la del lead (volvio), limpiar
    if (origin.lead?.id === me.id) {
      clearOrigin();
      removeBanner();
      return;
    }

    let banner = document.getElementById('switchUserBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'switchUserBanner';
      banner.className = 'switchuser-banner';
      document.body.prepend(banner);
    }
    banner.innerHTML = `
      <span class="switchuser-banner-text">
        <i class="fas fa-eye"></i>
        Viendo como <strong>${escapeHtml(me.full_name || me.email)}</strong>.
        Tu cuenta de Lead (${escapeHtml(origin.lead?.email || '')}) esta guardada.
      </span>
      <button type="button" class="switchuser-banner-btn" id="switchUserBannerBtn">
        <i class="fas fa-arrow-left"></i> Volver a mi cuenta
      </button>
    `;
    document.body.classList.add('has-switchuser-banner');
    document.getElementById('switchUserBannerBtn')
      ?.addEventListener('click', returnToLead);
  }

  function removeBanner() {
    document.getElementById('switchUserBanner')?.remove();
    document.body.classList.remove('has-switchuser-banner');
  }

  async function returnToLead() {
    const supa = getSupabase();
    if (!supa) return;
    const origin = readOrigin();
    if (!origin) {
      showToast('No hay sesion guardada para volver.', 'error');
      return;
    }

    const btn = document.getElementById('switchUserBannerBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Volviendo...';
    }

    try {
      const { error } = await supa.auth.setSession({
        access_token: origin.access_token,
        refresh_token: origin.refresh_token
      });
      if (error) throw error;
      clearOrigin();
      window.location.href = '/dev/dashboard';
    } catch (err) {
      showToast(`Error al volver: ${err.message}`, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-arrow-left"></i> Volver a mi cuenta';
      }
    }
  }

  // ─── Notif minima ──────────────────────────────────────────────────────

  function showToast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `app-notification ${type}`;
    el.innerHTML = `<div class="notification-content">${escapeHtml(msg)}</div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3500);
  }

  // ─── Export ────────────────────────────────────────────────────────────

  window.SwitchUserController = {
    open,
    close,
    setupBanner,
    returnToLead,
    isLead,
    hasImpersonation
  };
})();
