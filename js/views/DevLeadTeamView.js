/**
 * DevLeadTeamView — Equipo de developers (solo Lead).
 *
 * Lista todos los users con is_developer=true. Tambien muestra una seccion
 * arriba con provisioning_jobs pendientes (estados pending_email_confirmation
 * / email_confirmed / finalizing) — el Lead puede reanudar el flow del
 * wizard ahi mismo, o cancelar el job.
 */
class DevLeadTeamView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.team = [];
    this.pendingJobs = [];
    this.editing = null;     // profile en edicion
    this.savingEdit = false;
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  RANK_ORDER = ['legend', 'master', 'expert', 'builder', 'junior', 'rookie'];
  RANKS = ['rookie', 'junior', 'builder', 'expert', 'master', 'legend'];
  ROLES = ['viewer', 'contributor', 'senior', 'lead'];
  ROLE_LABEL = {
    lead:        { label: 'Lead',        desc: 'Todo + provisioning' },
    senior:      { label: 'Senior',      desc: 'Admin + lexicon' },
    contributor: { label: 'Contributor', desc: 'Flows + builder' },
    viewer:      { label: 'Viewer',      desc: 'Solo lectura' }
  };

  renderHTML() {
    return `
      <div class="team-page">
        <header class="team-page-header">
          <a href="/dev/provisioning/users" class="btn btn-primary">
            <i class="fas fa-user-plus"></i> Crear usuario
          </a>
        </header>

        <div class="team-page-body">
          <section class="team-section" id="teamPendingSection" hidden>
            <h2 class="team-section-title">
              <i class="fas fa-hourglass-half"></i> Provisioning pendiente
              <span class="team-section-count" id="teamPendingCount">0</span>
            </h2>
            <div class="team-pending-list" id="teamPendingList"></div>
          </section>

          <section class="team-section">
            <h2 class="team-section-title">
              <i class="fas fa-code"></i> Developers activos
              <span class="team-section-count" id="teamCount">0</span>
            </h2>
            <div class="team-list" id="teamList"></div>
          </section>
        </div>

        <div class="team-modal-overlay" id="teamEditOverlay" hidden></div>
      </div>
    `;
  }

  async init() {
    this.supabase = await this.getSupabaseClient();
    if (!this.supabase) {
      this.showError('Supabase no disponible.');
      return;
    }
    await Promise.all([this.loadTeam(), this.loadPending()]);
    this.renderTeam();
    this.renderPending();
  }

  async loadTeam() {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, email, full_name, role, dev_role, dev_rank, created_at, default_view_mode')
      .eq('is_developer', true)
      .order('created_at', { ascending: true });
    if (error) {
      this.showNotification(`Error cargando equipo: ${error.message}`, 'error');
      this.team = [];
      return;
    }
    this.team = (data || []).sort((a, b) => {
      // Por rank desc (legend → rookie), luego por created_at asc
      const ra = this.RANK_ORDER.indexOf(a.dev_rank);
      const rb = this.RANK_ORDER.indexOf(b.dev_rank);
      if (ra !== rb) return (ra === -1 ? 999 : ra) - (rb === -1 ? 999 : rb);
      return new Date(a.created_at) - new Date(b.created_at);
    });
  }

  async loadPending() {
    const { data, error } = await this.supabase
      .from('provisioning_jobs')
      .select('id, email, status, created_at, auth_user_id')
      .in('status', ['pending_email_confirmation', 'email_confirmed', 'finalizing'])
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      this.pendingJobs = [];
      return;
    }
    this.pendingJobs = data || [];
  }

  renderTeam() {
    const host = this.container.querySelector('#teamList');
    const countEl = this.container.querySelector('#teamCount');
    if (!host) return;
    countEl.textContent = String(this.team.length);

    if (this.team.length === 0) {
      host.innerHTML = `
        <div class="team-empty">
          <i class="fas fa-user-slash"></i>
          <p>No hay developers todavia.</p>
        </div>
      `;
      return;
    }

    host.innerHTML = this.team.map((m) => this.renderMemberCard(m)).join('');
    host.querySelectorAll('[data-edit-id]').forEach((card) => {
      this.addEventListener(card, 'click', () => this.openEdit(card.getAttribute('data-edit-id')));
    });
  }

  renderMemberCard(m) {
    const rank = m.dev_rank || 'rookie';
    const roleMeta = this.ROLE_LABEL[m.dev_role] || { label: m.dev_role || '—', desc: '' };
    const initials = (m.full_name || m.email || '?')
      .split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
    const created = m.created_at ? new Date(m.created_at).toLocaleDateString() : '';
    return `
      <article class="team-card" data-rank="${this.escapeHtml(rank)}" data-edit-id="${this.escapeHtml(m.id)}" tabindex="0" role="button" aria-label="Editar ${this.escapeHtml(m.full_name || m.email)}">
        <span class="team-card-edit"><i class="fas fa-pen"></i></span>
        <header class="team-card-head">
          <div class="team-avatar" data-rank="${this.escapeHtml(rank)}">${this.escapeHtml(initials)}</div>
          <div class="team-identity">
            <strong class="team-name">${this.escapeHtml(m.full_name || '(sin nombre)')}</strong>
            <span class="team-email">${this.escapeHtml(m.email)}</span>
          </div>
        </header>
        <div class="team-card-body">
          <div class="team-badge team-badge--rank" data-rank="${this.escapeHtml(rank)}">
            ${this.escapeHtml(rank.toUpperCase())}
          </div>
          <div class="team-badge team-badge--role">
            ${this.escapeHtml(roleMeta.label)}
          </div>
          ${roleMeta.desc ? `<span class="team-role-desc">${this.escapeHtml(roleMeta.desc)}</span>` : ''}
        </div>
        <footer class="team-card-foot">
          <span class="team-meta"><i class="fas fa-clock"></i> ${this.escapeHtml(created)}</span>
        </footer>
      </article>
    `;
  }

  // ─── Modal de edicion ────────────────────────────────────────────────

  openEdit(profileId) {
    const m = this.team.find((p) => p.id === profileId);
    if (!m) return;
    this.editing = { ...m };
    this.renderEditModal();
  }

  closeEdit() {
    this.editing = null;
    const overlay = this.container.querySelector('#teamEditOverlay');
    if (overlay) {
      overlay.innerHTML = '';
      overlay.hidden = true;
    }
  }

  renderEditModal() {
    const overlay = this.container.querySelector('#teamEditOverlay');
    if (!overlay || !this.editing) return;
    const m = this.editing;
    const rank = m.dev_rank || 'rookie';
    const initials = (m.full_name || m.email || '?')
      .split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();

    const roleOpts = this.ROLES.map((r) => {
      const meta = this.ROLE_LABEL[r];
      const sel = r === m.dev_role ? 'selected' : '';
      return `<option value="${r}" ${sel}>${meta.label} — ${meta.desc}</option>`;
    }).join('');

    const rankOpts = this.RANKS.map((r) => {
      const sel = r === rank ? 'selected' : '';
      return `<option value="${r}" ${sel}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`;
    }).join('');

    overlay.hidden = false;
    overlay.innerHTML = `
      <div class="team-modal" role="dialog" aria-modal="true" aria-labelledby="teamEditTitle">
        <header class="team-modal-head">
          <div class="team-avatar" data-rank="${this.escapeHtml(rank)}">${this.escapeHtml(initials)}</div>
          <div class="team-modal-identity">
            <h3 id="teamEditTitle">${this.escapeHtml(m.full_name || '(sin nombre)')}</h3>
            <span>${this.escapeHtml(m.email)}</span>
          </div>
          <button type="button" class="team-modal-close" data-action="close" aria-label="Cerrar">
            <i class="fas fa-times"></i>
          </button>
        </header>

        <form id="teamEditForm" class="team-modal-body" novalidate>
          <div class="provision-field">
            <label for="teamEditRole">Rol developer</label>
            <select id="teamEditRole" name="dev_role" required>${roleOpts}</select>
          </div>
          <div class="provision-field">
            <label for="teamEditRank">Rango</label>
            <select id="teamEditRank" name="dev_rank" required>${rankOpts}</select>
          </div>
          <p class="provision-form-status" id="teamEditStatus" role="status" aria-live="polite"></p>
        </form>

        <footer class="team-modal-foot">
          <button type="button" class="team-modal-btn-danger" data-action="ban">
            <i class="fas fa-user-slash"></i> Quitar acceso developer
          </button>
          <div class="team-modal-spacer"></div>
          <button type="button" class="provision-back-btn" data-action="close">Cancelar</button>
          <button type="submit" form="teamEditForm" class="team-modal-btn-save">
            <i class="fas fa-check"></i> Guardar
          </button>
        </footer>
      </div>
    `;

    this.wireEditModal();
  }

  wireEditModal() {
    const overlay = this.container.querySelector('#teamEditOverlay');
    const form = overlay.querySelector('#teamEditForm');
    if (form) this.addEventListener(form, 'submit', (e) => this.handleEditSave(e));

    overlay.querySelectorAll('[data-action="close"]').forEach((btn) => {
      this.addEventListener(btn, 'click', () => this.closeEdit());
    });
    const banBtn = overlay.querySelector('[data-action="ban"]');
    if (banBtn) this.addEventListener(banBtn, 'click', () => this.handleEditBan());

    // Click fuera del modal cierra
    this.addEventListener(overlay, 'click', (e) => {
      if (e.target === overlay) this.closeEdit();
    });
  }

  async handleEditSave(e) {
    e.preventDefault();
    if (this.savingEdit || !this.editing) return;
    const fd = new FormData(e.target);
    const dev_role = (fd.get('dev_role') || '').toString();
    const dev_rank = (fd.get('dev_rank') || '').toString();
    if (!this.ROLES.includes(dev_role)) return this.setEditStatus('Rol invalido.', 'error');
    if (!this.RANKS.includes(dev_rank)) return this.setEditStatus('Rango invalido.', 'error');

    // Evitar que un lead se quite a si mismo (lock-out)
    const self = window.authService?.currentUser?.id;
    if (self && self === this.editing.id && this.editing.dev_role === 'lead' && dev_role !== 'lead') {
      return this.setEditStatus('No puedes quitar tu propio rol de Lead.', 'error');
    }

    this.savingEdit = true;
    this.setEditStatus('Guardando...', '');
    try {
      const { error } = await this.supabase
        .from('profiles')
        .update({ dev_role, dev_rank })
        .eq('id', this.editing.id);
      if (error) throw error;

      this.showNotification('Cambios guardados.', 'success');
      this.closeEdit();
      await this.loadTeam();
      this.renderTeam();
    } catch (err) {
      this.savingEdit = false;
      this.setEditStatus(err.message || String(err), 'error');
      return;
    }
    this.savingEdit = false;
  }

  async handleEditBan() {
    if (!this.editing) return;
    const self = window.authService?.currentUser?.id;
    if (self && self === this.editing.id) {
      this.setEditStatus('No puedes quitarte tu propio acceso developer.', 'error');
      return;
    }
    const ok = confirm(
      `Quitar acceso developer a ${this.editing.full_name || this.editing.email}?\n\n` +
      `Pierde el portal /dev pero su cuenta y login siguen activos.`
    );
    if (!ok) return;

    this.savingEdit = true;
    this.setEditStatus('Quitando acceso...', '');
    try {
      const { error } = await this.supabase
        .from('profiles')
        .update({
          is_developer: false,
          dev_role: null,
          dev_rank: null,
          role: 'user',
          default_view_mode: 'user'
        })
        .eq('id', this.editing.id);
      if (error) throw error;
      this.showNotification('Acceso developer quitado.', 'success');
      this.closeEdit();
      await this.loadTeam();
      this.renderTeam();
    } catch (err) {
      this.savingEdit = false;
      this.setEditStatus(err.message || String(err), 'error');
    }
  }

  setEditStatus(text, type) {
    const el = this.container.querySelector('#teamEditStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'provision-form-status';
    if (type === 'error') el.classList.add('is-error');
    if (type === 'success') el.classList.add('is-success');
  }

  renderPending() {
    const section = this.container.querySelector('#teamPendingSection');
    const host = this.container.querySelector('#teamPendingList');
    const countEl = this.container.querySelector('#teamPendingCount');
    if (!host) return;

    if (this.pendingJobs.length === 0) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    countEl.textContent = String(this.pendingJobs.length);

    host.innerHTML = this.pendingJobs.map((j) => `
      <article class="team-pending-card" data-job-id="${this.escapeHtml(j.id)}">
        <div class="team-pending-status status-${this.escapeHtml(j.status)}">${this.escapeHtml(this.statusLabel(j.status))}</div>
        <strong class="team-pending-email">${this.escapeHtml(j.email)}</strong>
        <span class="team-pending-date">${this.escapeHtml(new Date(j.created_at).toLocaleString())}</span>
        <div class="team-pending-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-resume="${this.escapeHtml(j.id)}">
            <i class="fas fa-arrow-right"></i> Reanudar
          </button>
          <button type="button" class="btn btn-danger btn-sm" data-cancel="${this.escapeHtml(j.id)}">
            <i class="fas fa-times"></i> Cancelar
          </button>
        </div>
      </article>
    `).join('');

    host.querySelectorAll('[data-resume]').forEach((btn) => {
      this.addEventListener(btn, 'click', () => {
        if (window.router) {
          window.router.navigate('/dev/provisioning/users?job=' + btn.getAttribute('data-resume'));
        }
      });
    });
    host.querySelectorAll('[data-cancel]').forEach((btn) => {
      this.addEventListener(btn, 'click', () => this.cancelJob(btn.getAttribute('data-cancel')));
    });
  }

  async cancelJob(jobId) {
    if (!confirm('Cancelar este provisioning?\n\nEl auth.user creado se borra y el job queda cancelado.')) return;
    try {
      const { error } = await this.supabase.functions.invoke('provision-user-cancel', {
        body: { job_id: jobId, delete_auth: true }
      });
      if (error) throw error;
      this.showNotification('Provisioning cancelado.', 'success');
      await this.loadPending();
      this.renderPending();
    } catch (err) {
      this.showNotification(`Error: ${err.message}`, 'error');
    }
  }

  statusLabel(s) {
    return {
      pending_email_confirmation: 'Esperando email',
      email_confirmed: 'Email confirmado',
      finalizing: 'Finalizando',
      completed: 'Completado',
      failed: 'Fallo',
      cancelled: 'Cancelado'
    }[s] || s;
  }
}

window.DevLeadTeamView = DevLeadTeamView;
