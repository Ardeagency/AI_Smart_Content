class AccountSettingsModal {
  constructor() {
    this.modalEl = document.getElementById('accountSettingsModal');
    this.overlayEl = document.getElementById('accountSettingsModalOverlay');
    this.closeBtn = document.getElementById('accountSettingsModalClose');
    this.cancelBtn = document.getElementById('accountSettingsCancelBtn');
    this.saveBtn = document.getElementById('accountSettingsSaveBtn');

    this.tabBtns = Array.from(document.querySelectorAll('.account-settings-tab-btn'));
    this.panels = Array.from(document.querySelectorAll('.account-settings-panel'));

    // Cuenta
    this.fullNameInput = document.getElementById('accountSettingsFullName');
    this.descriptionInput = document.getElementById('accountSettingsDescription');
    this.avatarPreviewEl = document.getElementById('accountSettingsAvatarPreview');
    this.avatarUrlInput = document.getElementById('accountSettingsAvatarUrl');
    this.orgListEl = document.getElementById('accountSettingsOrgsList');
    this.orgsEmptyEl = document.getElementById('accountSettingsOrgsEmpty');

    // General
    this.langSelect = document.getElementById('accountSettingsLang');
    this.notifEmail = document.getElementById('accountSettingsNotifEmail');
    this.notifApp = document.getElementById('accountSettingsNotifApp');
    this.themeSelect = document.getElementById('accountSettingsTheme');

    // Seguridad
    this.changePasswordBtn = document.getElementById('accountSettingsChangePasswordBtn');
    this.twoFAStatusEl = document.getElementById('accountSettings2FAStatus');
    this.connectGoogleBtn = document.getElementById('accountSettingsConnectGoogle');
    this.connectFacebookBtn = document.getElementById('accountSettingsConnectFacebook');

    this._bound = false;
  }

  init() {
    if (!this.modalEl) return;
    if (this._bound) return;
    this._bound = true;

    // Delegación para que funcione aunque el header se re-renderice.
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest?.('#userDropdownSettingsLink');
      if (!trigger) return;
      e.preventDefault();
      this.open('account');
    });

    // Cerrar
    this.overlayEl?.addEventListener('click', () => this.close());
    this.closeBtn?.addEventListener('click', () => this.close());
    this.cancelBtn?.addEventListener('click', () => this.close());

    // Tabs
    this.tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const section = btn.dataset.section || 'account';
        this.setActiveSection(section);
      });
    });

    // Acciones
    this.saveBtn?.addEventListener('click', () => this.save());
    this.changePasswordBtn?.addEventListener('click', () => {
      this.navigate('/cambiar-contrasena');
      this.close();
    });

    // Botones OAuth (skeleton, todavía deshabilitados por falta de flujo/endpoint de cuenta)
    this.connectGoogleBtn?.addEventListener('click', () => alert('OAuth Google (cuenta) no implementado en este momento.'));
    this.connectFacebookBtn?.addEventListener('click', () => alert('OAuth Facebook (cuenta) no implementado en este momento.'));
  }

  navigate(path) {
    if (window.router?.navigate) window.router.navigate(path, true);
    else window.location.href = path;
  }

  setActiveSection(section) {
    this.tabBtns.forEach((btn) => {
      const isActive = btn.dataset.section === section;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    this.panels.forEach((p) => {
      const isActive = p.dataset.section === section;
      p.classList.toggle('is-active', isActive);
      p.style.display = isActive ? '' : 'none';
    });
  }

  open(section = 'account') {
    if (!this.modalEl) return;
    this.modalEl.style.display = 'flex';
    this.modalEl.setAttribute('aria-hidden', 'false');

    // Asegurar que exista el estado visual de secciones
    this.setActiveSection(section);

    // Cargar datos (fire-and-forget)
    void this.load();
  }

  close() {
    if (!this.modalEl) return;
    this.modalEl.style.display = 'none';
    this.modalEl.setAttribute('aria-hidden', 'true');
  }

  async getSupabaseClient() {
    if (window.supabaseService?.getClient) return await window.supabaseService.getClient();
    return window.supabase || null;
  }

  async getUser() {
    const auth = window.authService;
    const supabase = await this.getSupabaseClient();
    if (auth?.getCurrentUser?.() && auth.getCurrentUser()?.id) return auth.getCurrentUser();
    if (supabase) {
      const res = await supabase.auth.getUser().catch(() => null);
      const user = res?.data?.user || res?.data?.user ?? null;
      if (user?.id) return user;
    }
    return null;
  }

  setAvatarPreview(fullName) {
    if (!this.avatarPreviewEl) return;
    const name = String(fullName ?? '').trim();
    const initials = name
      ? name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0]?.toUpperCase() || '')
          .join('')
      : 'U';
    this.avatarPreviewEl.textContent = initials || 'U';
  }

  async loadGeneralFromStorage() {
    const lang = localStorage.getItem('accountSettingsLang') || 'es';
    const notifEmail = localStorage.getItem('accountSettingsNotifEmail');
    const notifApp = localStorage.getItem('accountSettingsNotifApp');
    const theme = localStorage.getItem('accountSettingsTheme') || 'auto';

    if (this.langSelect) this.langSelect.value = lang;
    if (this.notifEmail) this.notifEmail.checked = notifEmail == null ? true : notifEmail === 'true';
    if (this.notifApp) this.notifApp.checked = notifApp === 'true';
    if (this.themeSelect) this.themeSelect.value = theme;
  }

  async load() {
    await this.loadGeneralFromStorage();
    const user = await this.getUser();
    if (!user) return;
    await this.loadProfile(user.id);
    await this.loadOrganizations(user.id);
  }

  async loadProfile(userId) {
    const supabase = await this.getSupabaseClient();
    if (!supabase) return;

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email, form_verified')
        .eq('id', userId)
        .maybeSingle();

      const fullName = profile?.full_name || '';
      if (this.fullNameInput) this.fullNameInput.value = fullName;
      this.setAvatarPreview(fullName || userId);

      // Skeleton: usamos form_verified como proxy para "verificación 2 pasos".
      if (this.twoFAStatusEl) this.twoFAStatusEl.textContent = profile?.form_verified ? 'Verificada' : 'Pendiente';
    } catch (e) {
      console.warn('AccountSettingsModal loadProfile:', e);
    }

    // Campos que aún no existen en la BD actual (se muestran deshabilitados).
    if (this.descriptionInput) this.descriptionInput.value = '';
    if (this.avatarUrlInput) this.avatarUrlInput.value = '';
  }

  async loadOrganizations(userId) {
    if (!this.orgListEl) return;
    this.orgListEl.innerHTML = '';
    if (this.orgsEmptyEl) this.orgsEmptyEl.style.display = 'none';

    const supabase = await this.getSupabaseClient();
    if (!supabase) return;

    try {
      const { data } = await supabase
        .from('organization_members')
        .select('organization_id, organizations(id, name, owner_user_id)')
        .eq('user_id', userId);

      const list = Array.isArray(data) ? data : [];
      if (!list.length) {
        if (this.orgsEmptyEl) this.orgsEmptyEl.style.display = 'block';
        return;
      }

      const selectedId = localStorage.getItem('selectedOrganizationId');
      list.forEach((row) => {
        const org = row?.organizations;
        const orgId = org?.id || row?.organization_id;
        const name = org?.name || 'Organización';
        if (!orgId) return;

        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'account-settings-org-item';
        item.dataset.orgId = orgId;
        item.dataset.orgName = name;
        item.innerHTML = `
          <span class="account-settings-org-item-name">${this.escapeHtml(name)}</span>
          ${selectedId === orgId ? '<span class="account-settings-org-item-badge">Activo</span>' : '<span class="account-settings-org-item-badge account-settings-org-item-badge--muted">Activar</span>'}
        `;

        item.addEventListener('click', () => {
          this.selectOrganization(orgId, name);
        });
        this.orgListEl.appendChild(item);
      });
    } catch (e) {
      console.warn('AccountSettingsModal loadOrganizations:', e);
    }
  }

  selectOrganization(orgId, orgName) {
    localStorage.setItem('selectedOrganizationId', orgId);

    // Navegar a Production de la org seleccionada si podemos construir el prefijo.
    const prefix = typeof window.getOrgPathPrefix === 'function' ? window.getOrgPathPrefix(orgId, orgName || '') : '';
    this.close();
    if (prefix) this.navigate(`${prefix}/production`);
    else this.navigate('/production');
  }

  async save() {
    const user = await this.getUser();
    const fullName = this.fullNameInput?.value?.trim() || '';

    // General -> localStorage
    if (this.langSelect) localStorage.setItem('accountSettingsLang', this.langSelect.value);
    if (this.notifEmail) localStorage.setItem('accountSettingsNotifEmail', String(this.notifEmail.checked));
    if (this.notifApp) localStorage.setItem('accountSettingsNotifApp', String(this.notifApp.checked));
    if (this.themeSelect) localStorage.setItem('accountSettingsTheme', this.themeSelect.value);

    // Cuenta -> profiles.full_name (si existe supabase)
    if (!user?.id) {
      this.close();
      return;
    }

    const supabase = await this.getSupabaseClient();
    if (!supabase) {
      this.close();
      return;
    }

    try {
      await supabase
        .from('profiles')
        .update({
          full_name: fullName || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
    } catch (e) {
      console.error('AccountSettingsModal save:', e);
      alert(e?.message || 'No se pudo guardar la cuenta.');
      return;
    }

    this.close();
  }

  escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m] || m));
  }
}

window.AccountSettingsModal = AccountSettingsModal;
window.accountSettingsModal = new AccountSettingsModal();
window.accountSettingsModal.init();

