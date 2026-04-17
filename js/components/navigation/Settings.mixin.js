/**
 * Navigation — Settings mixin.
 *
 * Modal de configuración de usuario (cuenta, general, seguridad) con tabs,
 * incluyendo su inyección lazy al DOM (ensureSettingsModal) y el wiring de
 * listeners del overlay/close/ESC/tab-switching.
 *
 * Aplica sobre Navigation.prototype al cargarse.
 */
(function () {
  'use strict';
  if (typeof Navigation === 'undefined') return;

  const SettingsMixin = {
  ensureSettingsModal() {
    const portal = document.getElementById('modals-portal');
    if (!portal) return;
    if (document.getElementById('userSettingsModal')) return;
    const html = `
      <div class="modal user-settings-modal" id="userSettingsModal" aria-hidden="true" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="userSettingsModalTitle">
        <div class="modal-overlay" id="userSettingsModalOverlay"></div>
        <div class="modal-content glass-white">
          <div class="modal-header">
            <h3 id="userSettingsModalTitle">Settings</h3>
            <button type="button" class="modal-close" id="userSettingsModalClose" data-action="close-settings-modal" aria-label="Cerrar">&times;</button>
          </div>
          <div class="modal-body user-settings-modal-body">
            <div id="userSettingsTabs" class="user-settings-tabs">
              <button type="button" class="btn btn-secondary" data-section="account">Cuenta</button>
              <button type="button" class="btn btn-secondary" data-section="general">General</button>
              <button type="button" class="btn btn-secondary" data-section="security">Seguridad</button>
            </div>
            <div id="userSettingsPanels" class="user-settings-panels">
              <section data-section="account">
                <div class="form-group"><label>Nombre</label><input type="text" class="form-input" id="settingsAccountName" readonly></div>
                <div class="form-group"><label>Correo</label><input type="email" class="form-input" id="settingsAccountEmail" readonly></div>
                <div class="form-group"><label>Organización</label><input type="text" class="form-input" id="settingsAccountOrg" readonly></div>
              </section>
              <section data-section="general" class="is-hidden">
                <div class="form-group">
                  <label for="settingsGeneralLanguage">Idioma</label>
                  <select id="settingsGeneralLanguage" class="form-select">
                    <option value="es">Español</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div class="form-group">
                  <label style="display:flex;align-items:center;gap:.5rem;">
                    <input type="checkbox" id="settingsGeneralNotifications" checked>
                    <span>Notificaciones</span>
                  </label>
                </div>
              </section>
              <section data-section="security" class="is-hidden">
                <div class="form-group">
                  <button type="button" class="btn btn-primary" id="settingsSecurityChangePassword"><i class="fas fa-key"></i> Cambiar contraseña</button>
                </div>
                <div class="form-group">
                  <button type="button" class="btn btn-secondary" id="settingsSecurityEditEmail"><i class="fas fa-envelope"></i> Editar correo</button>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>`;
    portal.insertAdjacentHTML('beforeend', html);

    const modal = document.getElementById('userSettingsModal');
    const close = () => this.closeSettingsModal();
    document.getElementById('userSettingsModalOverlay')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
    });
    document.getElementById('userSettingsModalClose')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
    });
    document.getElementById('settingsSecurityChangePassword')?.addEventListener('click', () => {
      this.closeSettingsModal();
      window.router?.navigate('/cambiar-contrasena');
    });
    document.getElementById('settingsSecurityEditEmail')?.addEventListener('click', () => {
      alert('La edición de correo estará disponible pronto.');
    });
    document.getElementById('userSettingsTabs')?.querySelectorAll('[data-section]').forEach((btn) => {
      btn.addEventListener('click', () => this.setSettingsSection(btn.getAttribute('data-section') || 'account'));
    });
    if (modal) modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeSettingsModal();
    });
    if (!this._settingsModalDelegatedCloseBound) {
      this._settingsModalDelegatedCloseBound = true;
      document.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('[data-action="close-settings-modal"]');
        const overlay = e.target.closest('#userSettingsModalOverlay');
        if (closeBtn || overlay) {
          e.preventDefault();
          e.stopPropagation();
          this.closeSettingsModal();
        }
      });
    }
  },

  setSettingsSection(section) {
    const root = document.getElementById('userSettingsModal');
    if (!root) return;
    root.querySelectorAll('#userSettingsTabs [data-section]').forEach((btn) => {
      const active = btn.getAttribute('data-section') === section;
      btn.classList.toggle('btn-primary', active);
      btn.classList.toggle('btn-secondary', !active);
    });
    root.querySelectorAll('#userSettingsPanels [data-section]').forEach((panel) => {
      const active = panel.getAttribute('data-section') === section;
      panel.classList.toggle('is-hidden', !active);
    });
  },

  openSettingsModal(section = 'account') {
    this.ensureSettingsModal();
    const modal = document.getElementById('userSettingsModal');
    if (!modal) return;
    const user = window.authService?.getCurrentUser();
    const orgName = this._orgCache?.name || window.currentOrgName || 'Sin organización';
    const name = user?.full_name || user?.user_metadata?.full_name || 'Usuario';
    const email = user?.email || '';
    const nameEl = modal.querySelector('#settingsAccountName');
    const emailEl = modal.querySelector('#settingsAccountEmail');
    const orgEl = modal.querySelector('#settingsAccountOrg');
    if (nameEl) nameEl.value = name;
    if (emailEl) emailEl.value = email;
    if (orgEl) orgEl.value = orgName;

    modal.classList.add('active', 'modal-open');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'flex';
    this.setSettingsSection(section);
  },

  closeSettingsModal() {
    const modal = document.getElementById('userSettingsModal');
    if (!modal) return;
    modal.classList.remove('active', 'modal-open');
    modal.setAttribute('aria-hidden', 'true');
    modal.style.display = 'none';
  },
  };

  Object.assign(Navigation.prototype, SettingsMixin);
})();
