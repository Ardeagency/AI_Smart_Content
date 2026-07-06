/**
 * CreateView - Vista de generación de contenido
 * Modos: guiado, experto y plantillas
 */
class CreateView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.mode = 'guided'; // guided, pro, templates
  }

  renderHTML() {
    return `
<div class="create-container">
    <div class="create-header">
        <h1 class="create-title">${__('Crear Contenido')}</h1>
        <div class="create-mode-selector">
            <button class="mode-btn active" data-mode="guided" id="guidedModeBtn">
                <i class="fas fa-compass"></i>
                ${__('Guiado')}
            </button>
            <button class="mode-btn" data-mode="pro" id="proModeBtn">
                <i class="aisc-ico aisc-ico--coding"></i>
                ${__('Experto')}
            </button>
            <button class="mode-btn" data-mode="templates" id="templatesModeBtn">
                <i class="aisc-ico aisc-ico--layers"></i>
                ${__('Plantillas')}
            </button>
        </div>
    </div>

    <!-- Modo Guiado -->
    <div class="create-mode-content active" id="guidedMode">
        <div class="guided-wizard">
            <div class="wizard-step active" data-step="1">
                <h3>${__('1. Seleccionar Marca')}</h3>
                <select id="guidedBrand" class="form-select">
                    <option value="">${__('Seleccionar marca...')}</option>
                </select>
            </div>
            <div class="wizard-step" data-step="2">
                <h3>${__('2. Seleccionar Producto')}</h3>
                <select id="guidedProduct" class="form-select">
                    <option value="">${__('Seleccionar producto...')}</option>
                </select>
            </div>
            <div class="wizard-step" data-step="3">
                <h3>${__('3. Definir Objetivo')}</h3>
                <select id="guidedObjective" class="form-select">
                    <option value="">${__('Seleccionar objetivo...')}</option>
                </select>
            </div>
            <div class="wizard-step" data-step="4">
                <h3>${__('4. Seleccionar Canal')}</h3>
                <select id="guidedChannel" class="form-select">
                    <option value="">${__('Seleccionar canal...')}</option>
                </select>
            </div>
            <div class="wizard-step" data-step="5">
                <h3>${__('5. Seleccionar Formato')}</h3>
                <select id="guidedFormat" class="form-select">
                    <option value="">${__('Seleccionar formato...')}</option>
                </select>
            </div>
        </div>
        <div class="wizard-actions">
            <button class="btn btn-secondary" id="wizardPrevBtn">${__('Anterior')}</button>
            <button class="btn btn-primary" id="wizardNextBtn">${__('Siguiente')}</button>
            <button class="btn btn-primary" id="wizardGenerateBtn" style="display: none;">${__('Generar')}</button>
        </div>
    </div>

    <!-- Modo Experto -->
    <div class="create-mode-content" id="proMode">
        <div class="pro-editor">
            <div class="editor-section">
                <label>${__('Prompt Avanzado')}</label>
                <textarea id="proPrompt" class="form-textarea" rows="10"
                          placeholder="${__('Escribe tu prompt aquí...')}"></textarea>
            </div>
            <div class="editor-section">
                <label>${__('Reglas JSON (Opcional)')}</label>
                <textarea id="proRules" class="form-textarea" rows="5"
                          placeholder='{"restrictions": [], "priorities": []}'></textarea>
            </div>
            <div class="editor-actions">
                <button class="btn btn-primary" id="proGenerateBtn">${__('Generar')}</button>
            </div>
        </div>
    </div>

    <!-- Modo Plantillas -->
    <div class="create-mode-content" id="templatesMode">
        <div class="templates-grid">
            <div class="template-card" data-template="carousel">
                <i class="aisc-ico aisc-ico--gallery"></i>
                <h3>${__('Carrusel')}</h3>
                <p>${__('Contenido en formato carrusel')}</p>
            </div>
            <div class="template-card" data-template="video">
                <i class="aisc-ico aisc-ico--video"></i>
                <h3>${__('Video')}</h3>
                <p>${__('Contenido en formato video')}</p>
            </div>
            <div class="template-card" data-template="product">
                <i class="aisc-ico aisc-ico--product"></i>
                <h3>${__('Producto')}</h3>
                <p>${__('Contenido de producto')}</p>
            </div>
            <div class="template-card" data-template="ads">
                <i class="fas fa-ad"></i>
                <h3>Ads</h3>
                <p>${__('Contenido para publicidad')}</p>
            </div>
            <div class="template-card" data-template="email">
                <i class="aisc-ico aisc-ico--mail"></i>
                <h3>Email</h3>
                <p>${__('Contenido para email')}</p>
            </div>
        </div>
    </div>
</div>
    `;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) {
          window.router.navigate('/login', true);
        }
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
    
    // Detectar modo desde la ruta
    const path = window.location.pathname;
    if (path.includes('/create/pro')) {
      this.mode = 'pro';
    } else if (path.includes('/create/templates')) {
      this.mode = 'templates';
    } else {
      this.mode = 'guided';
    }
    
    this.renderMode();
    this.setupEventListeners();
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
        if (user) {
          this.userId = user.id;
        }
      }
    } catch (error) {
      console.error('Error inicializando Supabase:', error);
    }
  }

  renderMode() {
    const guidedEl = this.querySelector('#guidedMode');
    const proEl = this.querySelector('#proMode');
    const templatesEl = this.querySelector('#templatesMode');

    if (guidedEl) guidedEl.style.display = this.mode === 'guided' ? 'block' : 'none';
    if (proEl) proEl.style.display = this.mode === 'pro' ? 'block' : 'none';
    if (templatesEl) templatesEl.style.display = this.mode === 'templates' ? 'block' : 'none';
  }

  setupEventListeners() {
    // TODO: Configurar event listeners
  }
}

window.CreateView = CreateView;
