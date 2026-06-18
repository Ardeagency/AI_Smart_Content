/**
 * DevLeadConsumersView — Consumidores (solo Lead).
 *
 * Tabla de monitoreo de TODOS los usuarios que NO son developers. A diferencia
 * de Team (galeria/dashboard de developers), esta vista es una tabla pensada
 * para crecer: ver usuarios, su estado y sus afiliaciones, y completar/editar
 * a que organizacion(es) pertenecen.
 *
 * Backend: edge function `admin-consumers` (list / affiliate / remove_affiliation).
 */
class DevLeadConsumersView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.consumers = [];
    this.orgs = [];
    this._loading = false;
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  ROLE_LABEL = {
    owner: 'Owner', admin: 'Admin', editor: 'Editor',
    creator: 'Creator', vera_user: 'Vera User', viewer: 'Viewer'
  };

  // Roles afiliables desde aqui (owner se gestiona al crear/transferir org).
  AFFILIABLE_ROLES = [
    { v: 'viewer',    label: 'Viewer — solo lectura' },
    { v: 'vera_user', label: 'Vera User — chat + consumo' },
    { v: 'creator',   label: 'Creator — crea contenido' },
    { v: 'editor',    label: 'Editor — contenido + marca + insights' },
    { v: 'admin',     label: 'Admin — todo menos eliminar org' }
  ];

  renderHTML() {
    return `
      <div class="dev-lead-container dev-lead-consumers">
        <header class="dev-lead-header">
          <div class="dev-lead-toolbar">
            <div class="cons-head-title">
              <h1>Consumidores</h1>
              <span class="cons-count" id="consCount">—</span>
            </div>
            <div class="cons-head-actions">
              <input type="search" id="consSearch" class="form-control" placeholder="Buscar por nombre, email u org..." autocomplete="off">
              <button type="button" class="btn btn-secondary" id="consRefresh" title="Recargar"><i class="fas fa-rotate"></i></button>
              <a href="/dev/provisioning/users" class="btn btn-primary"><i class="fas fa-user-plus"></i> Crear usuario</a>
            </div>
          </div>
        </header>

        <section class="dev-lead-content">
          <div class="cons-table-wrap">
            <table class="cons-table">
              <thead>
                <tr>
                  <th class="cons-th-user">Usuario</th>
                  <th>Estado</th>
                  <th>Plan</th>
                  <th>Organizaciones</th>
                  <th>Alta</th>
                  <th class="cons-th-actions">Acciones</th>
                </tr>
              </thead>
              <tbody id="consBody">
                <tr><td colspan="6" class="cons-state"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <div class="team-modal-overlay" id="consAffOverlay" hidden></div>
      </div>
    `;
  }

  async init() {
    this.supabase = await this.getSupabaseClient();
    if (!this.supabase) { this.showError('Supabase no disponible.'); return; }

    // Portalizar el overlay del modal para que se superponga a toda la app.
    const portal = document.getElementById('modals-portal') || document.body;
    const overlay = document.getElementById('consAffOverlay');
    if (overlay && overlay.parentElement !== portal) portal.appendChild(overlay);

    this.container.querySelector('#consSearch')?.addEventListener('input', (e) => {
      this.renderRows((e.target?.value || '').trim().toLowerCase());
    });
    this.container.querySelector('#consRefresh')?.addEventListener('click', () => this.reload());

    await this.load();
    this.renderRows('');
  }

  destroy() {
    document.getElementById('consAffOverlay')?.remove();
    super.destroy();
  }

  async load() {
    if (this._loading) return;
    this._loading = true;
    try {
      const { data, error } = await this.supabase.functions.invoke('admin-consumers', {
        body: { action: 'list' }
      });
      if (error) {
        let msg = error.message || 'Error al cargar';
        try { const ctx = await error.context?.json?.(); if (ctx?.error) msg = ctx.error; } catch (_) {}
        throw new Error(msg);
      }
      this.consumers = Array.isArray(data?.consumers) ? data.consumers : [];
      this.orgs = Array.isArray(data?.orgs) ? data.orgs : [];
    } catch (err) {
      this.consumers = [];
      const body = this.container.querySelector('#consBody');
      if (body) body.innerHTML = `<tr><td colspan="6" class="cons-state cons-state--error"><i class="fas fa-triangle-exclamation"></i> ${this.escapeHtml(err?.message || 'Error al cargar')}</td></tr>`;
    } finally {
      this._loading = false;
    }
  }

  async reload() {
    const body = this.container.querySelector('#consBody');
    if (body) body.innerHTML = `<tr><td colspan="6" class="cons-state"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>`;
    await this.load();
    const filter = (this.container.querySelector('#consSearch')?.value || '').trim().toLowerCase();
    this.renderRows(filter);
  }

  // ─── Render tabla ────────────────────────────────────────────────────

  matchesFilter(c, f) {
    if (!f) return true;
    const hay = [c.full_name, c.email, ...(c.affiliations || []).map(a => a.name)]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(f);
  }

  renderRows(filter) {
    const body = this.container.querySelector('#consBody');
    const countEl = this.container.querySelector('#consCount');
    if (!body) return;

    const filtered = this.consumers.filter(c => this.matchesFilter(c, filter));
    if (countEl) countEl.textContent = String(this.consumers.length);

    if (filtered.length === 0) {
      body.innerHTML = `<tr><td colspan="6" class="cons-state">${filter ? 'Sin coincidencias.' : 'Aun no hay consumidores.'}</td></tr>`;
      return;
    }

    body.innerHTML = filtered.map(c => this.renderRow(c)).join('');
    body.querySelectorAll('[data-affiliate]').forEach((btn) => {
      this.addEventListener(btn, 'click', () => this.openAffiliateModal(btn.getAttribute('data-affiliate')));
    });
  }

  initials(c) {
    return (c.full_name || c.email || '?')
      .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  }

  affiliationState(c) {
    const affs = c.affiliations || [];
    if (affs.some(a => a.role === 'owner')) return { label: 'Owner', cls: 'is-owner' };
    if (affs.length > 0) return { label: 'Miembro', cls: 'is-member' };
    return { label: 'Sin org', cls: 'is-none' };
  }

  renderRow(c) {
    const id = this.escapeHtml(c.id);
    const name = this.escapeHtml(c.full_name || '(sin nombre)');
    const email = this.escapeHtml(c.email || '—');
    const verified = !!c.form_verified;
    const verifyBadge = verified
      ? `<span class="cons-badge cons-badge--ok"><i class="fas fa-circle-check"></i> Verificado</span>`
      : `<span class="cons-badge cons-badge--warn"><i class="fas fa-hourglass-half"></i> Pendiente</span>`;
    const aff = this.affiliationState(c);
    const stateCell = `${verifyBadge} <span class="cons-badge cons-badge--aff cons-badge--${aff.cls}">${aff.label}</span>`;

    const plan = c.plan_type
      ? `<span class="cons-pill">${this.escapeHtml(c.plan_type)}</span>`
      : '<span class="cons-dim">—</span>';

    const orgs = (c.affiliations || []).length
      ? (c.affiliations || []).map(a =>
          `<span class="cons-org-chip" title="${this.escapeHtml(this.ROLE_LABEL[a.role] || a.role)}">${this.escapeHtml(a.name)} <em>${this.escapeHtml(this.ROLE_LABEL[a.role] || a.role)}</em></span>`
        ).join('')
      : '<span class="cons-dim">Sin organizacion</span>';

    const created = c.created_at
      ? new Date(c.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';

    return `
      <tr class="cons-row">
        <td class="cons-td-user">
          <div class="cons-user">
            <span class="cons-avatar">${this.escapeHtml(this.initials(c))}</span>
            <div class="cons-user-id">
              <strong>${name}</strong>
              <span>${email}</span>
            </div>
          </div>
        </td>
        <td>${stateCell}</td>
        <td>${plan}</td>
        <td><div class="cons-orgs">${orgs}</div></td>
        <td><span class="cons-dim">${this.escapeHtml(created)}</span></td>
        <td class="cons-td-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-affiliate="${id}"><i class="fas fa-building-user"></i> Afiliar</button>
        </td>
      </tr>
    `;
  }

  // ─── Modal de afiliacion ─────────────────────────────────────────────

  openAffiliateModal(userId) {
    const c = this.consumers.find(x => x.id === userId);
    if (!c) return;
    const overlay = document.getElementById('consAffOverlay');
    if (!overlay) return;
    overlay.hidden = false;
    overlay.innerHTML = `<div class="team-modal cons-modal" role="dialog" aria-modal="true"></div>`;
    this._renderModalInner(userId);

    this.addEventListener(overlay, 'click', (e) => { if (e.target === overlay) this.closeAffiliateModal(); });
  }

  closeAffiliateModal() {
    const overlay = document.getElementById('consAffOverlay');
    if (overlay) { overlay.innerHTML = ''; overlay.hidden = true; }
  }

  _renderModalInner(userId) {
    const c = this.consumers.find(x => x.id === userId);
    const modal = document.querySelector('#consAffOverlay .cons-modal');
    if (!c || !modal) return;

    const affs = c.affiliations || [];
    const affsHtml = affs.length
      ? affs.map(a => `
          <li class="cons-aff-item">
            <span class="cons-aff-org">${this.escapeHtml(a.name)}</span>
            <span class="cons-aff-role">${this.escapeHtml(this.ROLE_LABEL[a.role] || a.role)}</span>
            ${a.role === 'owner'
              ? '<span class="cons-aff-lock" title="Owner: se gestiona al crear/transferir la org"><i class="fas fa-lock"></i></span>'
              : `<button type="button" class="cons-aff-remove" data-remove-org="${this.escapeHtml(a.organization_id)}" title="Quitar afiliacion"><i class="fas fa-times"></i></button>`}
          </li>`).join('')
      : '<li class="cons-aff-empty">Sin afiliaciones todavia.</li>';

    // Orgs disponibles para anadir = todas menos las ya afiliadas.
    const affiliatedIds = new Set(affs.map(a => a.organization_id));
    const orgOpts = this.orgs.filter(o => !affiliatedIds.has(o.id))
      .map(o => `<option value="${this.escapeHtml(o.id)}">${this.escapeHtml(o.name)}</option>`).join('');
    const roleOpts = this.AFFILIABLE_ROLES.map(r => `<option value="${r.v}">${this.escapeHtml(r.label)}</option>`).join('');

    modal.innerHTML = `
      <header class="team-modal-head">
        <div class="cons-avatar">${this.escapeHtml(this.initials(c))}</div>
        <div class="team-modal-identity">
          <h3>${this.escapeHtml(c.full_name || '(sin nombre)')}</h3>
          <span>${this.escapeHtml(c.email || '')}</span>
        </div>
        <button type="button" class="team-modal-close" data-action="close" aria-label="Cerrar"><i class="fas fa-times"></i></button>
      </header>

      <div class="team-modal-body">
        <div class="cons-modal-section">
          <h4>Afiliaciones actuales</h4>
          <ul class="cons-aff-list">${affsHtml}</ul>
        </div>

        <div class="cons-modal-section">
          <h4>Completar afiliacion</h4>
          ${orgOpts
            ? `<form id="consAffForm" class="cons-aff-form" novalidate>
                <div class="provision-field">
                  <label for="consAffOrg">Organizacion</label>
                  <select id="consAffOrg" name="organization_id" required>${orgOpts}</select>
                </div>
                <div class="provision-field">
                  <label for="consAffRole">Rol</label>
                  <select id="consAffRole" name="role" required>${roleOpts}</select>
                </div>
                <button type="submit" class="btn btn-primary btn-sm"><i class="fas fa-plus"></i> Afiliar</button>
              </form>`
            : '<p class="cons-dim">Ya esta en todas las organizaciones disponibles.</p>'}
          <p class="provision-form-status" id="consAffStatus" role="status" aria-live="polite"></p>
        </div>
      </div>
    `;

    modal.querySelectorAll('[data-action="close"]').forEach(b => this.addEventListener(b, 'click', () => this.closeAffiliateModal()));
    const form = modal.querySelector('#consAffForm');
    if (form) this.addEventListener(form, 'submit', (e) => this.handleAffiliate(e, userId));
    modal.querySelectorAll('[data-remove-org]').forEach(b =>
      this.addEventListener(b, 'click', () => this.handleRemove(userId, b.getAttribute('data-remove-org'))));
  }

  setModalStatus(text, type) {
    const el = document.getElementById('consAffStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'provision-form-status';
    if (type === 'error') el.classList.add('is-error');
    if (type === 'success') el.classList.add('is-success');
  }

  async handleAffiliate(e, userId) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const organization_id = (fd.get('organization_id') || '').toString();
    const role = (fd.get('role') || 'viewer').toString();
    if (!organization_id) return this.setModalStatus('Selecciona una organizacion.', 'error');

    this.setModalStatus('Afiliando...', '');
    try {
      const { data, error } = await this.supabase.functions.invoke('admin-consumers', {
        body: { action: 'affiliate', user_id: userId, organization_id, role }
      });
      if (error || !data?.success) {
        let msg = error?.message || 'Error al afiliar';
        try { const ctx = await error?.context?.json?.(); if (ctx?.error) msg = ctx.error; } catch (_) {}
        throw new Error(msg);
      }
      this.showNotification('Afiliacion guardada.', 'success');
      await this.load();
      this._renderModalInner(userId);
      this.renderRows((this.container.querySelector('#consSearch')?.value || '').trim().toLowerCase());
    } catch (err) {
      this.setModalStatus(err?.message || String(err), 'error');
    }
  }

  async handleRemove(userId, orgId) {
    const c = this.consumers.find(x => x.id === userId);
    const org = (c?.affiliations || []).find(a => a.organization_id === orgId);
    if (!confirm(`Quitar a ${c?.full_name || c?.email} de "${org?.name || 'la organizacion'}"?`)) return;

    this.setModalStatus('Quitando...', '');
    try {
      const { data, error } = await this.supabase.functions.invoke('admin-consumers', {
        body: { action: 'remove_affiliation', user_id: userId, organization_id: orgId }
      });
      if (error || !data?.success) {
        let msg = error?.message || 'Error al quitar';
        try { const ctx = await error?.context?.json?.(); if (ctx?.error) msg = ctx.error; } catch (_) {}
        throw new Error(msg);
      }
      this.showNotification('Afiliacion eliminada.', 'success');
      await this.load();
      this._renderModalInner(userId);
      this.renderRows((this.container.querySelector('#consSearch')?.value || '').trim().toLowerCase());
    } catch (err) {
      this.setModalStatus(err?.message || String(err), 'error');
    }
  }
}

window.DevLeadConsumersView = DevLeadConsumersView;
