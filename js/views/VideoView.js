/**
 * VideoView - Página de generación de video con Kling 3.0 (KIE API).
 * Misma estructura que el resto de vistas: renderHTML() sin template, layout organization-* del bundle.
 * Flujo: crear tarea (createTask) → consultar estado (recordInfo) hasta success/fail → mostrar video o error.
 */
class VideoView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this._pollInterval = null;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth && window.router) {
        window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
  }

  renderHTML() {
    return `
      <div class="organization-container video-view-container" id="videoPage">
        <div class="video-status-area" id="videoStatusArea" style="display: none;">
          <div class="video-status-card" id="videoStatusCard">
            <p class="video-status-text" id="videoStatusText">—</p>
            <div class="video-status-spinner" id="videoStatusSpinner" style="display: none;"></div>
          </div>
        </div>

        <div class="video-result-area" id="videoResultArea" style="display: none;">
          <div class="video-result-card">
            <h2 class="video-result-title">Video generado</h2>
            <div class="video-result-player-wrap">
              <video id="videoResultPlayer" class="video-result-player" controls playsinline></video>
            </div>
            <a id="videoResultDownload" class="btn btn-secondary video-download-btn" href="#" download target="_blank" rel="noopener">
              <i class="fas fa-download"></i> Descargar
            </a>
          </div>
        </div>

        <div class="video-error-area" id="videoErrorArea" style="display: none;">
          <div class="video-error-card">
            <p class="video-error-text" id="videoErrorText">—</p>
          </div>
        </div>

        <footer class="video-page-footer video-prompt-wrap" aria-label="Prompt de generación">
          <div class="video-prompt-card-gradient-wrap">
          <div class="video-prompt-card glass-black">
            <div class="video-prompt-inner">
              <label for="videoPromptInput" class="video-prompt-label visually-hidden">Describe tu video</label>
              <input
                type="text"
                id="videoPromptInput"
                class="video-prompt-input"
                placeholder="¿Qué video quieres generar?..."
                autocomplete="off"
                aria-label="Prompt para generar video"
              />
              <div class="video-prompt-actions">
                <button type="button" class="video-prompt-btn video-prompt-btn-add" id="videoPromptAdd" aria-label="Añadir adjunto">
                  <i class="fas fa-plus"></i>
                </button>
                <div class="video-prompt-duration-wrap">
                  <span class="video-prompt-duration-label">Duración</span>
                  <div class="video-prompt-duration-btns" role="group" aria-label="Duración del video">
                    <button type="button" class="video-prompt-duration-btn active" data-duration="5" aria-pressed="true">5s</button>
                    <button type="button" class="video-prompt-duration-btn" data-duration="10" aria-pressed="false">10s</button>
                    <button type="button" class="video-prompt-duration-btn" data-duration="15" aria-pressed="false">15s</button>
                  </div>
                </div>
                <div class="video-prompt-aspect-wrap">
                  <select id="videoAspectRatio" class="video-prompt-aspect" aria-label="Relación de aspecto">
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                    <option value="1:1">1:1</option>
                  </select>
                  <i class="fas fa-chevron-down video-prompt-aspect-chevron" aria-hidden="true"></i>
                </div>
                <button type="button" class="video-prompt-btn video-prompt-btn-send" id="videoPromptSend" aria-label="Generar video">
                  <i class="fas fa-paper-plane"></i>
                </button>
              </div>
            </div>
          </div>
          </div>
        </footer>
      </div>
    `;
  }

  async init() {
    this.sendBtn = this.container.querySelector('#videoPromptSend');
    this.promptInput = this.container.querySelector('#videoPromptInput');
    this.aspectSelect = this.container.querySelector('#videoAspectRatio');
    this.statusArea = this.container.querySelector('#videoStatusArea');
    this.statusText = this.container.querySelector('#videoStatusText');
    this.statusSpinner = this.container.querySelector('#videoStatusSpinner');
    this.resultArea = this.container.querySelector('#videoResultArea');
    this.resultPlayer = this.container.querySelector('#videoResultPlayer');
    this.resultDownload = this.container.querySelector('#videoResultDownload');
    this.errorArea = this.container.querySelector('#videoErrorArea');
    this.errorText = this.container.querySelector('#videoErrorText');

    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => this.startGeneration());
    }
    if (this.promptInput) {
      this.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.startGeneration();
        }
      });
    }
    const addBtn = this.container.querySelector('#videoPromptAdd');
    if (addBtn) {
      addBtn.addEventListener('click', () => { /* reservado para adjuntos */ });
    }
    this.container.querySelectorAll('.video-prompt-duration-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.video-prompt-duration-btn').forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      });
    });
  }

  hideAllFeedback() {
    if (this.statusArea) this.statusArea.style.display = 'none';
    if (this.resultArea) this.resultArea.style.display = 'none';
    if (this.errorArea) this.errorArea.style.display = 'none';
  }

  showStatus(message, showSpinner = true) {
    this.hideAllFeedback();
    if (this.statusArea) this.statusArea.style.display = 'block';
    if (this.statusText) this.statusText.textContent = message;
    if (this.statusSpinner) this.statusSpinner.style.display = showSpinner ? 'block' : 'none';
  }

  showResult(url) {
    this.hideAllFeedback();
    if (this.resultArea) this.resultArea.style.display = 'block';
    if (this.resultPlayer) {
      this.resultPlayer.src = url;
      this.resultPlayer.load();
    }
    if (this.resultDownload) {
      this.resultDownload.href = url;
      this.resultDownload.download = '';
    }
  }

  showError(message) {
    this.hideAllFeedback();
    if (this.errorArea) this.errorArea.style.display = 'block';
    if (this.errorText) this.errorText.textContent = message;
  }

  async startGeneration() {
    const mode = 'pro';
    if (this.sendBtn) this.sendBtn.disabled = true;
    this.showStatus('Creando tarea de generación…', true);

    try {
      const createRes = await fetch('/.netlify/functions/kie-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createTask', mode })
      });
      const createData = await createRes.json();

      if (!createRes.ok) {
        this.showError(createData.error || createData.failMsg || 'Error al crear la tarea');
        if (this.sendBtn) this.sendBtn.disabled = false;
        return;
      }

      const taskId = createData.taskId;
      if (!taskId) {
        this.showError('No se recibió taskId del servidor');
        if (this.sendBtn) this.sendBtn.disabled = false;
        return;
      }

      this.showStatus('Generando video (Kling 3.0). Esto puede tardar unos minutos…', true);
      await this.pollTask(taskId);
    } catch (err) {
      this.showError(err.message || 'Error de conexión');
    } finally {
      if (this.sendBtn) this.sendBtn.disabled = false;
    }
  }

  stopPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  async pollTask(taskId) {
    const poll = async () => {
      try {
        const res = await fetch(`/.netlify/functions/kie-video?taskId=${encodeURIComponent(taskId)}`);
        const data = await res.json();

        if (!res.ok) {
          this.stopPolling();
          this.showError(data.error || 'Error al consultar el estado');
          return;
        }

        const state = data.data?.state;
        if (state === 'success') {
          this.stopPolling();
          let resultJson = data.data?.resultJson;
          if (typeof resultJson === 'string') {
            try {
              resultJson = JSON.parse(resultJson);
            } catch (_) {}
          }
          const urls = resultJson?.resultUrls;
          const url = Array.isArray(urls) && urls.length > 0 ? urls[0] : null;
          if (url) {
            this.showResult(url);
          } else {
            this.showError('No se encontró URL del video en la respuesta');
          }
          return;
        }
        if (state === 'fail') {
          this.stopPolling();
          const msg = data.data?.failMsg || data.data?.failCode || 'La generación falló';
          this.showError(msg);
          return;
        }

        this.showStatus('Generando video (Kling 3.0). Esto puede tardar unos minutos…', true);
      } catch (err) {
        this.stopPolling();
        this.showError(err.message || 'Error al consultar el estado');
      }
    };

    await poll();
    this._pollInterval = setInterval(poll, 4000);
  }

  onLeave() {
    this.stopPolling();
  }

  destroy() {
    this.stopPolling();
  }
}

window.VideoView = VideoView;
