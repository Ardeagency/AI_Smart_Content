/**
 * VideoEditorView - Editor de video en el navegador (unir 2 vídeos) con FFmpeg.wasm (core single-thread).
 * No requiere COOP/COEP. Ruta: /editor-video, /org/.../editor-video.
 */
class VideoEditorView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this._outputBlobURL = null;
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
      <div class="organization-container video-editor-container" id="videoEditorPage">
        <header class="main-header">
          <div class="header-content">
            <button class="header-sidebar-toggle" id="headerSidebarToggle" aria-label="Toggle sidebar">
              <i class="fas fa-bars"></i>
            </button>
            <div class="header-left">
              <div class="header-context">
                <div class="header-context-primary">
                  <h1 class="header-section">Editor de video</h1>
                </div>
                <div class="header-context-secondary">Unir vídeos en el navegador</div>
              </div>
            </div>
          </div>
        </header>

        <section class="page-content video-editor-content">
          <div class="video-editor-card">
            <h2 class="video-editor-title"><i class="fas fa-film"></i> Unir dos vídeos</h2>
            <p class="video-editor-desc">Selecciona dos archivos de vídeo (MP4 recomendado). Se unirán en orden.</p>

            <div class="video-editor-inputs">
              <div class="video-editor-input-group">
                <label for="videoEditorFile1">Vídeo 1</label>
                <input type="file" id="videoEditorFile1" accept="video/mp4,video/webm,video/quicktime" class="video-editor-file">
              </div>
              <div class="video-editor-input-group">
                <label for="videoEditorFile2">Vídeo 2</label>
                <input type="file" id="videoEditorFile2" accept="video/mp4,video/webm,video/quicktime" class="video-editor-file">
              </div>
            </div>

            <div class="video-editor-actions">
              <button type="button" id="videoEditorBtnJoin" class="btn btn-primary video-editor-btn" disabled>
                <i class="fas fa-link"></i> Unir vídeos
              </button>
            </div>

            <div id="videoEditorProgress" class="video-editor-progress" style="display: none;" aria-live="polite">
              <span class="video-editor-progress-text" id="videoEditorProgressText">—</span>
            </div>

            <div id="videoEditorError" class="video-editor-error" style="display: none;" role="alert">
              <p id="videoEditorErrorText"></p>
            </div>

            <div id="videoEditorResult" class="video-editor-result" style="display: none;">
              <h3 class="video-editor-result-title">Vídeo unido</h3>
              <div class="video-editor-result-player-wrap">
                <video id="videoEditorPlayer" class="video-editor-player" controls playsinline></video>
              </div>
              <a id="videoEditorDownload" class="btn btn-secondary video-editor-download-btn" href="#" download="video-unido.mp4" target="_blank" rel="noopener">
                <i class="fas fa-download"></i> Descargar
              </a>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  async init() {
    const file1 = this.querySelector('#videoEditorFile1');
    const file2 = this.querySelector('#videoEditorFile2');
    const btnJoin = this.querySelector('#videoEditorBtnJoin');
    const progress = this.querySelector('#videoEditorProgress');
    const progressText = this.querySelector('#videoEditorProgressText');
    const errorArea = this.querySelector('#videoEditorError');
    const errorText = this.querySelector('#videoEditorErrorText');
    const resultArea = this.querySelector('#videoEditorResult');
    const player = this.querySelector('#videoEditorPlayer');
    const downloadLink = this.querySelector('#videoEditorDownload');

    const updateJoinButton = () => {
      if (btnJoin) btnJoin.disabled = !(file1 && file1.files.length && file2 && file2.files.length);
    };

    if (file1) this.addEventListener(file1, 'change', updateJoinButton);
    if (file2) this.addEventListener(file2, 'change', updateJoinButton);

    const showProgress = (text) => {
      if (progress) progress.style.display = 'block';
      if (progressText) progressText.textContent = text || 'Procesando…';
      if (errorArea) errorArea.style.display = 'none';
      if (resultArea) resultArea.style.display = 'none';
    };

    const showError = (message) => {
      if (progress) progress.style.display = 'none';
      if (errorArea) errorArea.style.display = 'block';
      if (errorText) errorText.textContent = message || 'Error desconocido';
      if (resultArea) resultArea.style.display = 'none';
    };

    const showResult = (url) => {
      if (progress) progress.style.display = 'none';
      if (errorArea) errorArea.style.display = 'none';
      if (resultArea) resultArea.style.display = 'block';
      if (player) {
        player.src = url;
        player.load();
      }
      if (downloadLink) {
        downloadLink.href = url;
        downloadLink.style.display = 'inline-flex';
      }
    };

    if (btnJoin) {
      this.addEventListener(btnJoin, 'click', async () => {
        if (!file1?.files?.length || !file2?.files?.length) return;
        const f1 = file1.files[0];
        const f2 = file2.files[0];
        if (!f1 || !f2) return;

        const service = window.VideoEditorService;
        if (!service || !service.concatVideos) {
          showError('Servicio de editor no disponible. Recarga la página.');
          return;
        }

        if (this._outputBlobURL) {
          service.revokeOutputURL(this._outputBlobURL);
          this._outputBlobURL = null;
        }

        btnJoin.disabled = true;
        showProgress('Cargando FFmpeg…');

        try {
          const url = await service.concatVideos(f1, f2, {
            onProgress: (msg) => {
              if (progressText) progressText.textContent = msg || 'Procesando…';
            }
          });
          this._outputBlobURL = url;
          showResult(url);
        } catch (err) {
          showError(err && err.message ? err.message : 'Error al unir los vídeos. Prueba con otros archivos.');
        } finally {
          btnJoin.disabled = false;
        }
      });
    }

    this._outputBlobURL = null;
  }

  onLeave() {
    if (window.VideoEditorService && this._outputBlobURL) {
      window.VideoEditorService.revokeOutputURL(this._outputBlobURL);
      this._outputBlobURL = null;
    }
  }
}

window.VideoEditorView = VideoEditorView;
