/**
 * CambiarContrasenaView - Vista para establecer nueva contraseña tras el enlace de recuperación.
 * El usuario llega aquí desde el correo (Supabase redirect con type=recovery en el hash).
 */
class CambiarContrasenaView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'cambiar-contrasena.html';
  }

  async onEnter() {}

  async init() {
    const loadingEl = this.querySelector('#changePasswordLoading');
    const invalidEl = this.querySelector('#changePasswordInvalid');
    const formWrapEl = this.querySelector('#changePasswordFormWrap');

    const show = (which) => {
      if (loadingEl) loadingEl.hidden = which !== 'loading';
      if (invalidEl) invalidEl.hidden = which !== 'invalid';
      if (formWrapEl) formWrapEl.hidden = which !== 'form';
    };

    const supabase = await this.getSupabaseClient();
    if (!supabase) {
      show('invalid');
      this.bindInvalidLinks();
      return;
    }

    // La sesión de recuperación se establece desde el hash (#access_token=...&type=recovery)
    let { data: { session } } = await supabase.auth.getSession();
    const hash = window.location.hash || '';
    const isRecoveryUrl = hash.includes('type=recovery');

    if (!session && isRecoveryUrl) {
      // Dar un momento al cliente para procesar el hash
      await new Promise(r => setTimeout(r, 300));
      const result = await supabase.auth.getSession();
      session = result.data?.session;
    }

    if (session) {
      show('form');
      this.bindForm(supabase);
    } else {
      show('invalid');
      this.bindInvalidLinks();
    }
  }

  bindInvalidLinks() {
    const link = this.querySelector('#linkInvalidToLogin');
    if (link) {
      this.addEventListener(link, 'click', (e) => {
        e.preventDefault();
        if (window.router) window.router.navigate('/login', true);
        else window.location.href = '/login';
      });
    }
  }

  bindForm(supabase) {
    const form = this.querySelector('#form_change_password');
    const linkBack = this.querySelector('#linkChangeBackToLogin');
    if (linkBack) {
      this.addEventListener(linkBack, 'click', (e) => {
        e.preventDefault();
        if (window.router) window.router.navigate('/login', true);
        else window.location.href = '/login';
      });
    }
    if (!form) return;

    this.addEventListener(form, 'submit', async (e) => {
      e.preventDefault();
      const newPassword = this.querySelector('#newPassword')?.value;
      const confirm = this.querySelector('#newPasswordConfirm')?.value;
      const btn = this.querySelector('#btnChangePassword');

      if (!newPassword || newPassword.length < 8) {
        alert('La contraseña debe tener al menos 8 caracteres.');
        return;
      }
      if (newPassword !== confirm) {
        alert('Las contraseñas no coinciden.');
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Guardando...';
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Cambiar contraseña';
      }

      if (error) {
        alert(error.message || 'Error al actualizar la contraseña.');
        return;
      }

      // Redirigir a login con mensaje de éxito (limpiar hash por seguridad)
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + '?password_changed=1');
      }
      if (window.router) {
        window.router.navigate('/login?password_changed=1', true);
      } else {
        window.location.href = '/login?password_changed=1';
      }
    });
  }

  async getSupabaseClient() {
    if (window.supabaseService?.getClient) {
      return await window.supabaseService.getClient();
    }
    if (window.appLoader?.waitFor) {
      try {
        return await window.appLoader.waitFor();
      } catch {
        return null;
      }
    }
    return window.supabase || null;
  }
}

window.CambiarContrasenaView = CambiarContrasenaView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CambiarContrasenaView;
}
