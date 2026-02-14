/**
 * SettingsView - Configuración de usuario (Mi cuenta)
 * Solo perfil: datos de user_profiles (full_name, email, phone_number, avatar_url, bio).
 * Fuera de org: ruta /settings. Layout tipo Home (solo header, sin sidebar).
 */
class SettingsView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'settings.html';
    this.supabase = null;
    this.userId = null;
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
        .select('id, full_name, email, phone_number, avatar_url, bio')
        .eq('id', this.userId)
        .maybeSingle();

      const set = (id, value) => {
        const el = this.querySelector(`#${id}`);
        if (el) el.value = value ?? '';
      };
      set('profileFullName', profile?.full_name);
      set('profileEmail', profile?.email);
      set('profilePhone', profile?.phone_number);
      set('profileAvatarUrl', profile?.avatar_url);
      set('profileBio', profile?.bio);
    } catch (error) {
      console.error('Error cargando perfil:', error);
    }
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
    const avatarUrl = this.querySelector('#profileAvatarUrl')?.value?.trim() ?? '';
    const bio = this.querySelector('#profileBio')?.value?.trim() ?? '';
    const btn = this.querySelector('#profileSubmitBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }
    try {
      const { error } = await this.supabase
        .from('user_profiles')
        .update({
          full_name: fullName || null,
          phone_number: phone || null,
          avatar_url: avatarUrl || null,
          bio: bio || null,
          updated_at: new Date().toISOString()
        })
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
