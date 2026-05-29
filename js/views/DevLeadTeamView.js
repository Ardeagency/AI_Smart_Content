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
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  RANK_ORDER = ['legend', 'master', 'expert', 'builder', 'junior', 'rookie'];
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
          <h1 class="team-page-title"><i class="fas fa-user-friends"></i> Equipo</h1>
          <p class="team-page-subtitle">Desarrolladores activos en el portal /dev y provisioning en curso.</p>
          <a href="/dev/provisioning/users" class="team-cta">
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
  }

  renderMemberCard(m) {
    const rank = m.dev_rank || 'rookie';
    const roleMeta = this.ROLE_LABEL[m.dev_role] || { label: m.dev_role || '—', desc: '' };
    const initials = (m.full_name || m.email || '?')
      .split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
    const created = m.created_at ? new Date(m.created_at).toLocaleDateString() : '';
    return `
      <article class="team-card" data-rank="${this.escapeHtml(rank)}">
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
