/**
 * FormRecordView - Ruta legacy. Redirige a /create.
 */
class FormRecordView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.formRecord = null;
  }

  renderHTML() {
    return `
<div class="form-record-container">
        <div class="form-main-content">
            <div class="form-org-card card">
                <form id="form_org">
                    <!-- Paso 1: Plan de la organización -->
                    <div class="form-step active" data-step="1">
                        <h2 class="step-title">Plan de la organización</h2>
                        <p class="step-subtitle">Selecciona el plan que mejor se ajusta al tamaño y necesidades de la marca.</p>
                        <select class="form-input form-select" id="plan_organizacion" name="plan_organizacion" required>
                            <option value="">Seleccionar plan...</option>
                            <option value="basico">Básico — $29/mes</option>
                            <option value="pro">Pro — $79/mes</option>
                            <option value="enterprise">Enterprise — $199/mes</option>
                        </select>
                        <button type="button" class="btn btn-primary btn-next">Continuar</button>
                    </div>
                    <!-- Paso 2: Nombre de la organización -->
                    <div class="form-step" data-step="2">
                        <h2 class="step-title">Nombre de la organización</h2>
                        <p class="step-subtitle">Este será el nombre oficial que verás dentro de todo el sistema.</p>
                        <input type="text" class="form-input" id="nombre_organizacion" name="nombre_organizacion" placeholder="Nombre de la organización" maxlength="200" required>
                        <div class="form-actions-two">
                            <button type="button" class="btn btn-secondary btn-back">Atrás</button>
                            <button type="button" class="btn btn-primary btn-next">Continuar</button>
                        </div>
                    </div>
                    <!-- Paso 3: Nicho / industria -->
                    <div class="form-step" data-step="3">
                        <h2 class="step-title">Nicho o mercado</h2>
                        <p class="step-subtitle">Define cómo se describe la categoría principal de la marca.</p>
                        <input type="text" class="form-input" id="nicho_organizacion" name="nicho_organizacion" placeholder="Ej. Electrodomésticos inteligentes, Retail moda premium, etc." required>
                        <small class="field-hint">Puedes usar etiquetas compuestas (industria + enfoque) para obtener mejores sugerencias de competencia.</small>
                        <div class="form-actions-two">
                            <button type="button" class="btn btn-secondary btn-back">Atrás</button>
                            <button type="button" class="btn btn-primary btn-next">Continuar</button>
                        </div>
                    </div>
                    <!-- Paso 4: Canales digitales -->
                    <div class="form-step" data-step="4">
                        <h2 class="step-title">Canales digitales</h2>
                        <p class="step-subtitle">Comparte las URLs principales de la marca. El scraper buscará variaciones y perfiles relacionados.</p>
                        <div class="social-input-grid">
                            <label>Instagram<input type="url" class="form-input" id="instagram_url" placeholder="https://instagram.com/mimarca"></label>
                            <label>TikTok<input type="url" class="form-input" id="tiktok_url" placeholder="https://www.tiktok.com/@mimarca"></label>
                            <label>YouTube<input type="url" class="form-input" id="youtube_url" placeholder="https://youtube.com/@mimarca"></label>
                            <label>Facebook<input type="url" class="form-input" id="facebook_url" placeholder="https://facebook.com/mimarca"></label>
                            <label>LinkedIn<input type="url" class="form-input" id="linkedin_url" placeholder="https://linkedin.com/company/mimarca"></label>
                            <label>X / Twitter<input type="url" class="form-input" id="twitter_url" placeholder="https://x.com/mimarca"></label>
                            <label>Pinterest<input type="url" class="form-input" id="pinterest_url" placeholder="https://pinterest.com/mimarca"></label>
                            <label>Otros canales<input type="text" class="form-input" id="otros_canales" placeholder="Separar por coma"></label>
                        </div>
                        <div class="form-field-group">
                            <label for="url_web">Sitio web principal</label>
                            <input type="url" class="form-input" id="url_web" name="url_web" placeholder="https://tu-sitio.com" required>
                        </div>
                        <div class="form-actions-two">
                            <button type="button" class="btn btn-secondary btn-back">Atrás</button>
                            <button type="submit" class="btn btn-primary" id="btnSubmit">Enviar a scraping</button>
                        </div>
                    </div>
                </form>
                <div id="formStatus" class="form-status"></div>
            </div>
        </div>
    </div>

    <div id="competitorReview" class="competitor-review" style="display: none;">
        <div class="competitor-review-header">
            <div>
                <h2>Confirma a tu competencia</h2>
                <p class="step-subtitle">
                    Estas marcas fueron detectadas automáticamente. Selecciona cuáles competirán en tu radar
                    o agrega otras manualmente.
                </p>
            </div>
            <button type="button" class="btn btn-link" id="btnHideCompetitorReview">Ocultar</button>
        </div>
        <div id="competitorList" class="competitor-list"></div>

        <div class="manual-competitor">
            <h3>Agregar competencia manual</h3>
            <div class="manual-competitor-fields">
                <input type="text" id="manualCompetitorName" class="form-input" placeholder="Nombre de la marca">
                <input type="url" id="manualCompetitorUrl" class="form-input" placeholder="https://sitio.com">
                <button type="button" class="btn btn-secondary" id="btnAddManualCompetitor">Agregar</button>
            </div>
            <div id="manualCompetitorPills" class="manual-competitor-pills"></div>
        </div>

        <div class="competitor-actions">
            <button type="button" class="btn btn-primary" id="btnConfirmCompetitors">
                Confirmar selección
            </button>
            <button type="button" class="btn btn-secondary" id="btnSkipCompetitors">
                Revisar más tarde
            </button>
        </div>
    </div>
    `;
  }

  async onEnter() {
    if (window.router) {
      window.router.navigate('/create', true);
      return;
    }

    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    } else {
      const isAuth = await this.checkAuthentication();
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        else window.location.href = '/login.html';
        return;
      }
    }
  }

  async init() {
    const container = document.getElementById('app-container');
    if (container) {
      container.innerHTML = '<div class="page-content"><p class="text-muted">Redirigiendo...</p></div>';
    }
  }

  async checkAuthentication() {
    const supabase = await this.getSupabaseClient();
    if (!supabase) return false;
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      return !error && user !== null;
    } catch {
      return false;
    }
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

  async onLeave() {}
}

// Hacer disponible globalmente
window.FormRecordView = FormRecordView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormRecordView;
}

