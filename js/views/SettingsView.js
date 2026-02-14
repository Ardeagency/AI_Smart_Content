/**
 * SettingsView - Configuración de usuario (Mi cuenta)
 * Perfil, contraseña, preferencias, idioma, exportaciones, seguridad.
 * Fuera de org: ruta única /settings. Layout tipo Home (solo header, sin sidebar).
 * Entrada: enlace #userDropdown > a (Mi cuenta) → /settings.
 */
const SETTINGS_TAB_IDS = ['profile', 'preferences', 'language', 'exports', 'security'];

class SettingsView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'settings.html';
    this.supabase = null;
    this.userId = null;
  }

  getSettingsBasePath() {
    return '/settings';
  }

  getTabFromURL() {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    return SETTINGS_TAB_IDS.includes(tab) ? tab : 'profile';
  }

  setURLTab(tab) {
    const base = this.getSettingsBasePath();
    const url = `${base}${tab && tab !== 'profile' ? `?tab=${tab}` : ''}`;
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', url);
    }
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
  }

  async render() {
    await super.render();
    await this.initSupabase();
    await this.loadProfile();
    const initialTab = this.getTabFromURL();
    this.setupTabs(initialTab);
    this.setupProfileForm();
    this.updateHeaderContext('Mi cuenta', null, null);
  }

  async initSupabase() {
    try {
      if (window.supabaseService) this.supabase = await window.supabaseService.getClient();
      else if (window.supabase) this.supabase = window.supabase;
      else if (typeof waitForSupabase === 'function') this.supabase = await waitForSupabase();
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (error) {
      console.error('Error inicializando Supabase:', error);
    }
  }

  async loadProfile() {
    if (!this.supabase || !this.userId) return;
    try {
      const { data: profile } = await this.supabase
        .from('user_profiles')
        .select('id, full_name, email, phone_number')
        .eq('id', this.userId)
        .maybeSingle();

      const fullNameEl = this.querySelector('#profileFullName');
      const emailEl = this.querySelector('#profileEmail');
      const phoneEl = this.querySelector('#profilePhone');
      if (fullNameEl) fullNameEl.value = profile?.full_name || '';
      if (emailEl) emailEl.value = profile?.email || '';
      if (phoneEl) phoneEl.value = profile?.phone_number || '';
    } catch (error) {
      console.error('Error cargando perfil:', error);
    }
  }

  switchToTab(tab) {
    const tabs = this.querySelectorAll('.settings-tab-btn');
    const panels = this.querySelectorAll('.settings-panel');
    tabs.forEach((b) => {
      const isActive = b.getAttribute('data-tab') === tab;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    panels.forEach((p) => {
      const panelTab = p.id && p.id.replace(/Panel$/, '');
      const isActive = panelTab === tab;
      p.classList.toggle('active', isActive);
      p.hidden = !isActive;
    });
    this.setURLTab(tab);
  }

  setupTabs(initialTab = 'profile') {
    this.switchToTab(initialTab);
    const tabs = this.querySelectorAll('.settings-tab-btn');
    tabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) this.switchToTab(tab);
      });
    });
  }

  setupProfileForm() {
    const form = this.querySelector('#settingsProfileForm');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveProfile();
    });
  }

  async saveProfile() {
    if (!this.supabase || !this.userId) return;
    const fullName = this.querySelector('#profileFullName')?.value?.trim() ?? '';
    const phone = this.querySelector('#profilePhone')?.value?.trim() ?? '';
    const btn = this.querySelector('#profileSubmitBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }
    try {
      const { error } = await this.supabase
        .from('user_profiles')
        .update({ full_name: fullName || null, phone_number: phone || null, updated_at: new Date().toISOString() })
        .eq('id', this.userId);
      if (error) throw error;
    } catch (error) {
      console.error('Error guardando perfil:', error);
      alert(error?.message || 'No se pudo guardar.');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar cambios'; }
    }
  }
}

window.SettingsView = SettingsView;
