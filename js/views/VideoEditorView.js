/**
 * VideoEditorView - Editor de video en el navegador con FFmpeg.wasm.
 * Permite unir dos videos (concat) sin salir de la plataforma.
 * Requiere cabeceras COOP/COEP (netlify.toml) y script FFmpeg en index.html.
 */
class VideoEditorView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.ffmpeg = null;
    this.resultBlobUrl = null;
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
    const backUrl = this._getBackUrl();
    return `
      <div class="organization-container video-editor-view" id="videoEditorPage">
        <div class="page-content">
          <div class="video-editor-header">
            <a href="${backUrl}" class="video-editor-back" data-router-link aria-label="Volver">
              <i class="fas fa-arrow-left"></i> Volver
            </a>
            <h1 class="video-editor-title">Editor de video (FFmpeg)</h1>
            <p class="video-editor-subtitle">Une dos videos en el navegador. No se suben archivos a ningún servidor.</p>
          </div>

          <div class="video-editor-card glass-black">
            <h2 class="video-editor-card-title">Unir dos videos</h2>
            <div class="video-editor-inputs">
              <label class="video-editor-file-label">
                <span class="video-editor-file-name" id="videoEditorFile1Name">Video 1 (clic para elegir)</span>
                <input type="file" id="videoEditorFile1" accept="video/*" class="video-editor-file-input" aria-label="Seleccionar primer video">
              </label>
              <label class="video-editor-file-label">
                <span class="video-editor-file-name" id="videoEditorFile2Name">Video 2 (clic para elegir)</span>
                <input type="file" id="videoEditorFile2" accept="video/*" class="video-editor-file-input" aria-label="Seleccionar segundo video">
              </label>
            </div>
            <div class="video-editor-actions">
              <button type="button" class="btn btn-primary" id="videoEditorJoinBtn" disabled aria-label="Unir videos">
                <i class="fas fa-link"></i> Unir videos
              </button>
            </div>
            <div class="video-editor-progress" id="videoEditorProgress" style="display: none;" aria-live="polite">
              <div class="loader"><div class="loader-line"></div></div>
              <p class="video-editor-progress-text" id="videoEditorProgressText">Cargando FFmpeg...</p>
            </div>
            <div class="video-editor-error" id="videoEditorError" style="display: none;" role="alert">
              <p class="video-editor-error-text" id="videoEditorErrorText"></p>
            </div>
            <div class="video-editor-result" id="videoEditorResult" style="display: none;">
              <h3 class="video-editor-result-title">Video unido</h3>
              <div class="video-editor-result-player-wrap">
                <video id="videoEditorResultPlayer" class="video-editor-result-player" controls playsinline></video>
              </div>
              <a id="videoEditorDownload" class="btn btn-secondary" href="#" download="video-unido.mp4" target="_blank" rel="noopener">
                <i class="fas fa-download"></i> Descargar
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _getBackUrl() {
    const rp = this.routeParams || {};
    if (rp.orgIdShort && rp.orgNameSlug) {
      return `/org/${rp.orgIdShort}/${rp.orgNameSlug}/video`;
    }
    const orgId = window.currentOrgId || rp.orgId;
    const prefix = typeof window.getOrgPathPrefix === 'function' && orgId
      ? window.getOrgPathPrefix(orgId, window.currentOrgName || '')
      : '';
    return prefix ? `${prefix}/video` : '/video';
  }

  async init() {
    if (this.initialized) return;
    const container = this.container;
    if (!container) return;

    const file1Input = container.querySelector('#videoEditorFile1');
    const file2Input = container.querySelector('#videoEditorFile2');
    const file1Name = container.querySelector('#videoEditorFile1Name');
    const file2Name = container.querySelector('#videoEditorFile2Name');
    const joinBtn = container.querySelector('#videoEditorJoinBtn');
    const progressEl = container.querySelector('#videoEditorProgress');
    const progressText = container.querySelector('#videoEditorProgressText');
    const errorEl = container.querySelector('#videoEditorError');
    const errorText = container.querySelector('#videoEditorErrorText');
    const resultEl = container.querySelector('#videoEditorResult');
    const resultPlayer = container.querySelector('#videoEditorResultPlayer');
    const downloadLink = container.querySelector('#videoEditorDownload');

    const hideError = () => {
      if (errorEl) errorEl.style.display = 'none';
    };
    const showError = (msg) => {
      if (errorText) errorText.textContent = msg || 'Error desconocido';
      if (errorEl) errorEl.style.display = 'block';
      if (progressEl) progressEl.style.display = 'none';
    };
    const setProgress = (visible, text) => {
      if (progressEl) progressEl.style.display = visible ? 'block' : 'none';
      if (progressText && text !== undefined) progressText.textContent = text;
    };
    const setResult = (url, filename = 'video-unido.mp4') => {
      if (this.resultBlobUrl) URL.revokeObjectURL(this.resultBlobUrl);
      this.resultBlobUrl = url;
      if (resultPlayer) resultPlayer.src = url;
      if (downloadLink) {
        downloadLink.href = url;
        downloadLink.download = filename;
        downloadLink.style.display = 'inline-flex';
      }
      if (resultEl) resultEl.style.display = 'block';
      setProgress(false);
    };

    const updateJoinButton = () => {
      const has1 = file1Input && file1Input.files && file1Input.files.length > 0;
      const has2 = file2Input && file2Input.files && file2Input.files.length > 0;
      if (joinBtn) joinBtn.disabled = !(has1 && has2);
    };

    if (file1Input) {
      file1Input.addEventListener('change', () => {
        const name = file1Input.files && file1Input.files[0] ? file1Input.files[0].name : 'Video 1 (clic para elegir)';
        if (file1Name) file1Name.textContent = name;
        updateJoinButton();
        hideError();
      });
    }
    if (file2Input) {
      file2Input.addEventListener('change', () => {
        const name = file2Input.files && file2Input.files[0] ? file2Input.files[0].name : 'Video 2 (clic para elegir)';
        if (file2Name) file2Name.textContent = name;
        updateJoinButton();
        hideError();
      });
    }

    if (joinBtn) {
      joinBtn.addEventListener('click', async () => {
        const file1 = file1Input?.files?.[0];
        const file2 = file2Input?.files?.[0];
        if (!file1 || !file2) {
          showError('Selecciona ambos videos.');
          return;
        }
        hideError();
        setProgress(true, 'Cargando FFmpeg...');
        joinBtn.disabled = true;
        try {
          const url = await this.handleJoinVideos(file1, file2, (msg) => {
            if (progressText) progressText.textContent = msg;
          });
          const baseName = file1.name.replace(/\.[^.]+$/, '') + '-' + file2.name.replace(/\.[^.]+$/, '') + '-unido.mp4';
          setResult(url, baseName);
        } catch (err) {
          console.error('Error uniendo videos:', err);
          showError(err.message || 'Error al unir los videos. Comprueba que sean formatos compatibles (ej. MP4).');
        } finally {
          joinBtn.disabled = false;
        }
      });
    }

    this.initialized = true;
  }

  /**
   * Une dos archivos de video con FFmpeg.wasm (concat demuxer para mayor compatibilidad).
   * @param {File} file1 - Primer video
   * @param {File} file2 - Segundo video
   * @param {function(string): void} onProgress - Callback con mensaje de estado
   * @returns {Promise<string>} URL del blob del video resultante
   */
  async handleJoinVideos(file1, file2, onProgress) {
    if (typeof window.FFmpeg === 'undefined') {
      throw new Error('FFmpeg.wasm no está cargado. Comprueba que el script esté en index.html y que la página use las cabeceras COOP/COEP.');
    }
    const { createFFmpeg, fetchFile } = window.FFmpeg;
    const ffmpeg = createFFmpeg({ log: true });

    if (onProgress) onProgress('Cargando FFmpeg...');
    await ffmpeg.load();

    const v1Name = 'v1.mp4';
    const v2Name = 'v2.mp4';
    const listName = 'list.txt';
    const outName = 'output.mp4';

    if (onProgress) onProgress('Leyendo archivos...');
    const data1 = await fetchFile(file1);
    const data2 = await fetchFile(file2);
    ffmpeg.FS('writeFile', v1Name, data1);
    ffmpeg.FS('writeFile', v2Name, data2);

    // Lista para concat demuxer (funciona aunque un video no tenga audio)
    const listContent = `file '${v1Name}'\nfile '${v2Name}'`;
    ffmpeg.FS('writeFile', listName, new TextEncoder().encode(listContent));

    if (onProgress) onProgress('Uniendo videos...');
    await ffmpeg.run('-f', 'concat', '-safe', '0', '-i', listName, '-c', 'copy', outName);

    const data = ffmpeg.FS('readFile', outName);
    ffmpeg.FS('unlink', v1Name);
    ffmpeg.FS('unlink', v2Name);
    ffmpeg.FS('unlink', listName);
    ffmpeg.FS('unlink', outName);

    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    return URL.createObjectURL(blob);
  }

  destroy() {
    if (this.resultBlobUrl) {
      URL.revokeObjectURL(this.resultBlobUrl);
      this.resultBlobUrl = null;
    }
    super.destroy();
  }
}

window.VideoEditorView = VideoEditorView;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VideoEditorView;
}
