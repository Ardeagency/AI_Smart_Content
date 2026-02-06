/**
 * StudioView - Vista en blanco del Estudio (hoja vacía para construir desde cero)
 */
class StudioView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        window.router?.navigate('/login', true);
        return;
      }
    }

    this.organizationId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');

    if (!this.organizationId) {
      window.router?.navigate('/hogar');
      return;
    }

    localStorage.setItem('selectedOrganizationId', this.organizationId);
  }

  renderHTML() {
    return `
      <div class="studio-layout" id="studioContainer">
        <!-- Panel central -->
        <main class="studio-center">
          <div class="studio-prompt-wrap">
            <h1 class="studio-prompt" id="studioPrompt">
              Ask your data anything<span class="studio-cursor">_</span>
            </h1>
          </div>
          <div class="studio-center-footer">
            <div class="studio-center-icons">
              <button type="button" class="studio-icon-btn" title="Agregar"><i class="fas fa-plus"></i></button>
              <button type="button" class="studio-icon-btn" title="Documento"><i class="fas fa-file-alt"></i></button>
              <button type="button" class="studio-icon-btn" title="Calendario"><i class="fas fa-calendar"></i></button>
              <button type="button" class="studio-icon-btn" title="Persona"><i class="fas fa-user"></i></button>
              <button type="button" class="studio-icon-btn" title="Más"><i class="fas fa-align-center"></i></button>
            </div>
            <button type="button" class="studio-submit-btn" id="studioSubmitBtn" title="Enviar">
              <i class="fas fa-bolt"></i>
            </button>
          </div>
        </main>

        <!-- Sidebar editor creativo (derecha) -->
        <aside class="studio-sidebar-creative">
          <div class="studio-sidebar-tabs">
            <span class="studio-tab studio-tab-past">PAST</span>
            <button type="button" class="studio-tab studio-tab-future active">
              FUTURE <i class="fas fa-caret-right"></i>
            </button>
          </div>
          <div class="studio-sidebar-cards">
            <article class="studio-card studio-card-large">
              <div class="studio-card-icon"><i class="fas fa-magic"></i></div>
              <p class="studio-card-text">Predict my busiest weeks based on my calendar trends.</p>
              <span class="studio-card-tag">FUTURE</span>
            </article>
            <div class="studio-cards-row">
              <article class="studio-card">
                <div class="studio-card-icon"><i class="fas fa-magic"></i></div>
                <p class="studio-card-text">Predict questions I might receive for my next presentation.</p>
                <span class="studio-card-tag">FUTURE</span>
              </article>
              <article class="studio-card">
                <div class="studio-card-icon"><i class="fas fa-magic"></i></div>
                <p class="studio-card-text">What should I focus on improving based on last year's mistakes?</p>
                <span class="studio-card-tag">FUTURE</span>
              </article>
            </div>
          </div>
        </aside>
      </div>
    `;
  }

  async init() {
    window.studioView = this;
  }
}

window.StudioView = StudioView;
