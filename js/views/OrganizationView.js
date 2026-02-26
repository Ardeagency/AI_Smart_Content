/**
 * OrganizationView - Configuración de la organización (workspace)
 * Permite al usuario consumidor administrar datos administrativos y técnicos:
 * nombre, miembros, roles, y previsualizar metadata (id, créditos, propietario, etc).
 * No es un dashboard; es una página de configuración.
 */
class OrganizationView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'organization.html';
    this.supabase = null;
    this.userId = null;
    this.orgId = null;
    this.org = null;
    this.members = [];
    this.credits = { credits_available: 0, credits_total: 0, updated_at: null };
    this.storage = { used_mb: 0, max_mb: 0, updated_at: null };
    this.isOwner = false;
    this.canManageMembers = false;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }

    this.orgId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');

    if (!this.orgId) {
      const url = window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
        ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
        : '/settings';
      window.router?.navigate(url, true);
      return;
    }

    if (window.appState) window.appState.set('selectedOrganizationId', this.orgId, true);
    localStorage.setItem('selectedOrganizationId', this.orgId);
  }

  async render() {
    await super.render();
    await this.initSupabase();
    await this.loadOrganizationData();
    this.setupEventListeners();
    this.updateHeaderContext('Configuración de la organización', null, this.org?.name || null);
  }

  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      } else if (typeof waitForSupabase === 'function') {
        this.supabase = await waitForSupabase();
      }
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (error) {
      console.error('Error inicializando Supabase:', error);
    }
  }

  async loadOrganizationData() {
    if (!this.supabase || !this.orgId) return;

    try {
      const { data: orgData, error: orgError } = await this.supabase
        .from('organizations')
        .select('id, name, owner_user_id, created_at, deleted_at')
        .eq('id', this.orgId)
        .maybeSingle();

      if (orgError) throw orgError;
      if (!orgData) {
        this.showError('Organización no encontrada.');
        return;
      }

      this.org = orgData;
      this.isOwner = this.org.owner_user_id === this.userId;

      const { data: creditsData } = await this.supabase
        .from('organization_credits')
        .select('credits_available, credits_total')
        .eq('organization_id', this.orgId)
        .maybeSingle();

      if (creditsData) {
        this.credits = creditsData;
      }

      const { data: membersData, error: membersError } = await this.supabase
        .from('organization_members')
        .select('id, user_id, role')
        .eq('organization_id', this.orgId);

      if (membersError) throw membersError;
      this.members = membersData || [];

      const myMember = this.members.find(m => m.user_id === this.userId);
      this.canManageMembers = this.isOwner || (myMember && ['owner', 'admin'].includes(myMember.role));

      const userIds = [...new Set(this.members.map(m => m.user_id).filter(Boolean))];
      let profilesMap = {};
      if (userIds.length > 0) {
        const { data: profiles } = await this.supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        if (profiles) {
          profiles.forEach(p => { profilesMap[p.id] = p; });
        }
      }

      this.membersWithProfile = this.members.map(m => ({
        ...m,
        full_name: profilesMap[m.user_id]?.full_name || null,
        email: profilesMap[m.user_id]?.email || null
      }));

      this.renderOverview();
      this.renderMembers();
    } catch (error) {
      console.error('Error cargando organización:', error);
      this.showError(error.message || 'Error al cargar la organización.');
    }
  }

  renderOverview() {
    if (!this.org) return;

    const nameInput = this.querySelector('#orgName');
    if (nameInput) nameInput.value = this.org.name;

    const formatDate = (d) => {
      if (!d) return '—';
      try {
        return new Date(d).toLocaleString('es');
      } catch (_) { return d; }
    };

    const status = this.org.deleted_at ? 'Archivada' : 'Activa';
    this.setText('#metaId', this.org.id || '—');
    this.setText('#metaStatus', status);
    this.setText('#metaCreated', formatDate(this.org.created_at));
    this.setText('#metaOwner', this.org.owner_user_id || '—');
    this.setText('#metaCreditsAvailable', String(this.credits.credits_available ?? '—'));
    this.setText('#metaCreditsTotal', String(this.credits.credits_total ?? '—'));
    this.setText('#metaCreditsUpdated', formatDate(this.credits.updated_at));
    this.setText('#metaStorageUsed', this.storage.used_mb != null ? String(this.storage.used_mb) : '—');
    this.setText('#metaStorageMax', this.storage.max_mb != null ? String(this.storage.max_mb) : '—');
    this.setText('#metaStorageUpdated', formatDate(this.storage.updated_at));

    const submitBtn = this.querySelector('#orgGeneralSubmit');
    if (submitBtn) submitBtn.disabled = !this.isOwner;
    if (!this.isOwner && nameInput) nameInput.readOnly = true;
  }

  renderMembers() {
    const listEl = this.querySelector('#orgMembersList');
    const actionsEl = this.querySelector('#orgMembersActions');
    if (!listEl) return;

    const canManage = this.canManageMembers;

    listEl.innerHTML = (this.membersWithProfile || []).map(m => {
      const display = m.email || m.full_name || m.user_id?.slice(0, 8) + '…';
      const isCurrentUser = m.user_id === this.userId;
      const isOrgOwner = this.org?.owner_user_id === m.user_id;
      const canRemove = canManage && !isOrgOwner && (this.isOwner || (isCurrentUser ? true : true));
      const removeBtn = canManage && !isOrgOwner && !isCurrentUser
        ? `<button type="button" class="btn btn-ghost btn-sm org-member-remove" data-member-id="${m.id}" title="Quitar de la organización"><i class="fas fa-times"></i></button>`
        : '';
      return `
        <div class="org-member-row" data-member-id="${m.id}">
          <div class="org-member-info">
            <span class="org-member-name">${this.escapeHtml(display)}</span>
            ${m.email && m.email !== display ? `<span class="org-member-email">${this.escapeHtml(m.email)}</span>` : ''}
          </div>
          <span class="org-member-role org-role-${(m.role || 'member').toLowerCase()}">${this.escapeHtml(m.role || 'member')}</span>
          ${removeBtn}
        </div>`;
    }).join('') || '<p class="org-members-empty">No hay miembros cargados.</p>';

    if (actionsEl) {
      const inviteBtn = actionsEl.querySelector('#orgInviteMemberBtn');
      if (inviteBtn) inviteBtn.style.display = canManage ? '' : 'none';
    }

    listEl.querySelectorAll('.org-member-remove').forEach(btn => {
      btn.addEventListener('click', (e) => this.removeMember(e.currentTarget.dataset.memberId));
    });
  }

  setText(selector, text) {
    const el = this.querySelector(selector);
    if (el) el.textContent = text;
  }

  setupEventListeners() {
    const tabs = this.querySelectorAll('.organization-tabs .tab-btn');
    const panels = this.querySelectorAll('.organization-content .tab-content');

    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        tabs.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        panels.forEach(p => { p.classList.remove('active'); });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        const panelId = tab + 'Tab';
        const panel = this.querySelector('#' + panelId);
        if (panel) panel.classList.add('active');
      });
    });

    const generalForm = this.querySelector('#orgGeneralForm');
    if (generalForm) {
      generalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveOrganizationName();
      });
    }

    const inviteBtn = this.querySelector('#orgInviteMemberBtn');
    if (inviteBtn) {
      inviteBtn.addEventListener('click', () => this.openInviteModal());
    }

    // Modal está en #modals-portal (movido por BaseView), no en this.container
    const inviteModal = document.getElementById('orgInviteModal');
    const inviteForm = document.getElementById('orgInviteForm');
    const inviteClose = document.getElementById('orgInviteModalClose');
    const inviteCancel = document.getElementById('orgInviteCancel');

    if (inviteClose) inviteClose.addEventListener('click', () => this.closeInviteModal());
    if (inviteCancel) inviteCancel.addEventListener('click', () => this.closeInviteModal());
    if (inviteForm) {
      inviteForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitInvite();
      });
    }
    if (inviteModal) {
      inviteModal.addEventListener('click', (e) => {
        if (e.target === inviteModal) this.closeInviteModal();
      });
    }
  }

  async saveOrganizationName() {
    if (!this.supabase || !this.orgId || !this.isOwner) return;

    const nameInput = this.querySelector('#orgName');
    const submitBtn = this.querySelector('#orgGeneralSubmit');
    const name = nameInput?.value?.trim();
    if (!name) {
      alert('El nombre no puede estar vacío.');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }

    try {
      const { error } = await this.supabase
        .from('organizations')
        .update({ name })
        .eq('id', this.orgId)
        .eq('owner_user_id', this.userId);

      if (error) throw error;
      this.org = { ...this.org, name };
      this.updateHeaderContext('Configuración de la organización', null, name);
    } catch (error) {
      console.error('Error guardando nombre:', error);
      alert(error.message || 'No se pudo guardar el nombre.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Guardar cambios';
      }
    }
  }

  openInviteModal() {
    const modal = document.getElementById('orgInviteModal');
    const form = document.getElementById('orgInviteForm');
    if (modal) {
      modal.classList.add('modal-open');
      modal.setAttribute('aria-hidden', 'false');
      if (form) form.reset();
    }
  }

  closeInviteModal() {
    const modal = document.getElementById('orgInviteModal');
    if (modal) {
      modal.classList.remove('modal-open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  async submitInvite() {
    if (!this.supabase || !this.orgId || !this.canManageMembers) return;

    const emailInput = document.getElementById('inviteEmail');
    const roleSelect = document.getElementById('inviteRole');
    const email = emailInput?.value?.trim();
    const role = (roleSelect?.value || 'member').toLowerCase();
    if (!email) return;

    try {
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) {
        alert('No existe ningún usuario con ese email. El usuario debe estar registrado en la plataforma.');
        return;
      }

      const existing = this.members.find(m => m.user_id === profile.id);
      if (existing) {
        alert('Ese usuario ya es miembro de la organización.');
        return;
      }

      const { error: insertError } = await this.supabase
        .from('organization_members')
        .insert({
          organization_id: this.orgId,
          user_id: profile.id,
          role: role === 'admin' ? 'admin' : 'member'
        });

      if (insertError) throw insertError;
      this.closeInviteModal();
      await this.loadOrganizationData();
    } catch (error) {
      console.error('Error añadiendo miembro:', error);
      alert(error.message || 'No se pudo añadir el miembro.');
    }
  }

  async removeMember(memberId) {
    if (!this.supabase || !this.canManageMembers || !memberId) return;
    const member = this.members.find(m => m.id === memberId);
    if (!member || member.user_id === this.org?.owner_user_id) return;
    if (!confirm('¿Quitar a este miembro de la organización?')) return;

    try {
      const { error } = await this.supabase
        .from('organization_members')
        .delete()
        .eq('id', memberId)
        .eq('organization_id', this.orgId);

      if (error) throw error;
      await this.loadOrganizationData();
    } catch (error) {
      console.error('Error quitando miembro:', error);
      alert(error.message || 'No se pudo quitar el miembro.');
    }
  }

  showError(message) {
    const container = this.container || document.getElementById('app-container');
    if (container) {
      container.querySelector('.organization-content')?.insertAdjacentHTML('beforebegin',
        `<div class="org-error-banner" role="alert">${this.escapeHtml(message)}</div>`);
    }
  }
}

window.OrganizationView = OrganizationView;
