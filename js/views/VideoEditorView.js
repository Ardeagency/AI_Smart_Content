/**
 * VideoEditorView - Editor de video en navegador con FFmpeg.wasm.
 * Unión de dos videos (concat) con drag & drop, barra de progreso y descarga.
 * Requiere cabeceras COOP/COEP (netlify.toml) para SharedArrayBuffer.
 */
class VideoEditorView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.file1 = null;
    this.file2 = null;
    this.ffmpeg = null;
    this.outputBlobUrl = null;
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
        <section class="video-editor-main" aria-label="Editor de video">
          <h2 class="video-editor-title">
            <i class="fas fa-film"></i> Unir videos
          </h2>
          <p class="video-editor-desc">Arrastra dos videos o selecciónalos. Se concatenarán en orden (primero + segundo).</p>

          <div class="video-editor-drop-row">
            <div class="video-editor-drop-zone" id="dropZone1" data-slot="1" role="button" tabindex="0">
              <input type="file" id="inputFile1" accept="video/*" class="video-editor-input-file" aria-label="Seleccionar video 1">
              <div class="video-editor-drop-content">
                <i class="fas fa-cloud-upload-alt video-editor-drop-icon"></i>
                <span class="video-editor-drop-label">Video 1</span>
                <span class="video-editor-drop-name" id="fileName1">Suelta o haz clic</span>
              </div>
            </div>
            <div class="video-editor-drop-zone" id="dropZone2" data-slot="2" role="button" tabindex="0">
              <input type="file" id="inputFile2" accept="video/*" class="video-editor-input-file" aria-label="Seleccionar video 2">
              <div class="video-editor-drop-content">
                <i class="fas fa-cloud-upload-alt video-editor-drop-icon"></i>
                <span class="video-editor-drop-label">Video 2</span>
                <span class="video-editor-drop-name" id="fileName2">Suelta o haz clic</span>
              </div>
            </div>
          </div>

          <div class="video-editor-actions">
            <button type="button" class="btn btn-primary video-editor-join-btn" id="joinVideosBtn" disabled aria-label="Unir videos">
              <i class="fas fa-wand-magic-sparkles"></i> Unir videos
            </button>
          </div>

          <div class="video-editor-progress-wrap" id="progressWrap" style="display: none;" aria-live="polite">
            <div class="video-editor-progress-bar">
              <div class="video-editor-progress-fill" id="progressFill" style="width: 0%"></div>
            </div>
            <p class="video-editor-progress-text" id="progressText">Cargando FFmpeg…</p>
            <div class="video-editor-log" id="ffmpegLog" aria-label="Log de FFmpeg"></div>
          </div>

          <div class="video-editor-result-wrap" id="resultWrap" style="display: none;">
            <h3 class="video-editor-result-title">Video unido</h3>
            <div class="video-editor-result-player-wrap">
              <video id="resultVideo" class="video-editor-result-video" controls playsinline></video>
            </div>
            <a id="resultDownload" class="btn btn-secondary video-editor-download-btn" href="#" download="video-unido.mp4" target="_blank" rel="noopener">
              <i class="fas fa-download"></i> Descargar
            </a>
          </div>

          <div class="video-editor-error" id="editorError" style="display: none;" role="alert">
            <p class="video-editor-error-text" id="editorErrorText"></p>
          </div>
        </section>
      </div>
    `;
  }

  async init() {
    this.bindDropZones();
    this.bindJoinButton();
    this.updateJoinButtonState();
  }

  bindDropZones() {
    const slot1 = 1, slot2 = 2;
    const zone1 = this.querySelector('#dropZone1');
    const zone2 = this.querySelector('#dropZone2');
    const input1 = this.querySelector('#inputFile1');
    const input2 = this.querySelector('#inputFile2');
    const name1 = this.querySelector('#fileName1');
    const name2 = this.querySelector('#fileName2');

    const handleFile = (slot, file) => {
      if (!file || !file.type.startsWith('video/')) return;
      if (slot === 1) {
        this.file1 = file;
        name1.textContent = file.name;
      } else {
        this.file2 = file;
        name2.textContent = file.name;
      }
      this.updateJoinButtonState();
    };

    const setupZone = (zone, input, nameEl, slot) => {
      const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
      this.addEventListener(zone, 'dragover', prevent);
      this.addEventListener(zone, 'dragenter', (e) => { prevent(e); zone.classList.add('drag-over'); });
      this.addEventListener(zone, 'dragleave', (e) => { prevent(e); zone.classList.remove('drag-over'); });
      this.addEventListener(zone, 'drop', (e) => {
        prevent(e);
        zone.classList.remove('drag-over');
        handleFile(slot, e.dataTransfer?.files?.[0]);
      });
      this.addEventListener(zone, 'click', () => input.click());
      this.addEventListener(zone, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      this.addEventListener(input, 'change', () => handleFile(slot, input.files?.[0]));
    };
    setupZone(zone1, input1, name1, slot1);
    setupZone(zone2, input2, name2, slot2);
  }

  bindJoinButton() {
    const btn = this.querySelector('#joinVideosBtn');
    if (btn) {
      this.addEventListener(btn, 'click', () => this.handleJoinVideos());
    }
  }

  updateJoinButtonState() {
    const btn = this.querySelector('#joinVideosBtn');
    if (btn) btn.disabled = !this.file1 || !this.file2;
  }

  showProgress(show, text = '') {
    const wrap = this.querySelector('#progressWrap');
    const textEl = this.querySelector('#progressText');
    if (wrap) wrap.style.display = show ? 'block' : 'none';
    if (textEl) textEl.textContent = text;
  }

  setProgress(ratio, text) {
    const fill = this.querySelector('#progressFill');
    const textEl = this.querySelector('#progressText');
    if (fill) fill.style.width = `${Math.round((ratio || 0) * 100)}%`;
    if (textEl && text !== undefined) textEl.textContent = text;
  }

  showResult(url, blob) {
    this.showProgress(false);
    const wrap = this.querySelector('#resultWrap');
    const video = this.querySelector('#resultVideo');
    const link = this.querySelector('#resultDownload');
    if (this.outputBlobUrl) URL.revokeObjectURL(this.outputBlobUrl);
    this.outputBlobUrl = url;
    if (wrap) wrap.style.display = 'block';
    if (video) {
      video.src = url;
      video.load();
    }
    if (link) {
      link.href = url;
      link.download = blob ? 'video-unido.mp4' : 'video-unido.mp4';
    }
    const err = this.querySelector('#editorError');
    if (err) err.style.display = 'none';
  }

  showError(message) {
    this.showProgress(false);
    const wrap = this.querySelector('#resultWrap');
    if (wrap) wrap.style.display = 'none';
    const err = this.querySelector('#editorError');
    const textEl = this.querySelector('#editorErrorText');
    if (err) err.style.display = 'block';
    if (textEl) textEl.textContent = message || 'Error al procesar.';
  }

  async handleJoinVideos() {
    if (!this.file1 || !this.file2) return;

    const FFmpegLib = window.FFmpeg;
    if (!FFmpegLib || !FFmpegLib.createFFmpeg || !FFmpegLib.fetchFile) {
      this.showError('FFmpeg.wasm no está cargado. Comprueba que la página tenga las cabeceras COOP/COEP (mismo origen).');
      return;
    }

    this.showProgress(true, 'Cargando FFmpeg…');
    this.setProgress(0, 'Cargando FFmpeg…');
    const logEl = this.querySelector('#ffmpegLog');
    if (logEl) logEl.innerHTML = '';

    try {
      const { createFFmpeg, fetchFile } = FFmpegLib;
      this.ffmpeg = createFFmpeg({ log: true });

      this.ffmpeg.setProgress(({ ratio }) => {
        const r = ratio;
        if (typeof r === 'number' && !Number.isNaN(r)) {
          this.setProgress(r, `Procesando… ${Math.round(r * 100)}%`);
        }
      });

      if (logEl) {
        this.ffmpeg.setLogger(({ type, message }) => {
          const line = document.createElement('div');
          line.className = 'video-editor-log-line';
          line.textContent = `[${type}] ${message}`;
          logEl.appendChild(line);
          logEl.scrollTop = logEl.scrollHeight;
        });
      }

      await this.ffmpeg.load();
      this.setProgress(0.1, 'Escribiendo archivos…');

      this.ffmpeg.FS('writeFile', 'v1.mp4', await fetchFile(this.file1));
      this.setProgress(0.2, 'Video 1 listo.');
      this.ffmpeg.FS('writeFile', 'v2.mp4', await fetchFile(this.file2));
      this.setProgress(0.3, 'Uniendo videos…');

      await this.ffmpeg.run(
        '-i', 'v1.mp4',
        '-i', 'v2.mp4',
        '-filter_complex', '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]',
        '-map', '[outv]',
        '-map', '[outa]',
        'output.mp4'
      );
    } catch (err) {
      const msg = err?.message || String(err);
      try {
        await this.joinWithConcatDemuxer();
      } catch (e2) {
        this.showError(msg);
      }
      return;
    }

    try {
      const data = this.ffmpeg.FS('readFile', 'output.mp4');
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      this.showResult(url, blob);
      this.setProgress(1, 'Listo.');
    } catch (err) {
      this.showError(err?.message || 'Error al leer el video de salida.');
    }
  }

  async joinWithConcatDemuxer() {
    if (!this.ffmpeg) return;
    try {
      this.setProgress(0.4, 'Uniendo (mismo formato)…');
      this.ffmpeg.FS('writeFile', 'list.txt', 'file \'v1.mp4\'\nfile \'v2.mp4\'\n');
      await this.ffmpeg.run('-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'output.mp4');
      const data = this.ffmpeg.FS('readFile', 'output.mp4');
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      this.showResult(url, blob);
      this.setProgress(1, 'Listo.');
    } catch (err) {
      this.showError(err?.message || 'Error al unir con concat.');
    }
  }

  onLeave() {
    if (this.outputBlobUrl) {
      URL.revokeObjectURL(this.outputBlobUrl);
      this.outputBlobUrl = null;
    }
  }
}

window.VideoEditorView = VideoEditorView;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VideoEditorView;
}
