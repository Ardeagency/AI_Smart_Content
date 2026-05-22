/**
 * DevLeadVeraTrainingView - Entrenamiento de Vera (solo Lead)
 *
 * Form de entrenamiento vectorial del cerebro global de Vera:
 *  - Archivo (txt/md/pdf): texto largo se chunkea y embedea
 *  - Prompt: texto libre que entra como un chunk
 *  - Imagen: OpenAI Vision describe el estilo visual; la descripcion se embedea
 *
 * Backend pendiente: el endpoint /api/vera/train vive en ai-engine (no Netlify)
 * porque la OPENAI_API_KEY no esta en Netlify. Esta vista hace POST a esa url
 * cuando exista; mientras tanto avisa con notification.
 */
class DevLeadVeraTrainingView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this._fileObj = null;
    this._imageObj = null;
    this._submitting = false;
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  renderHTML() {
    return `
      <div class="dev-lead-container vera-training">
        <header class="dev-lead-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title"><i class="fas fa-brain"></i> Entrenamiento de Vera</h1>
            <p class="dev-header-subtitle">Inyecta archivos, prompts e imagenes al vector global de Vera. OpenAI vectoriza estilo visual y conocimiento textual.</p>
          </div>
        </header>

        <section class="dev-lead-content vera-training-content">
          <form class="vera-training-form" id="veraTrainingForm" autocomplete="off">

            <div class="vera-training-row">
              <label class="vera-training-label" for="veraTrainingFile">
                <i class="fas fa-file-lines"></i>
                <span>Archivo</span>
                <span class="vera-training-hint">txt, md, pdf, json</span>
              </label>
              <div class="vera-training-drop" data-drop="file">
                <input type="file" id="veraTrainingFile" accept=".txt,.md,.pdf,.json,text/plain,text/markdown,application/pdf,application/json" hidden>
                <button type="button" class="vera-training-drop-btn" data-trigger="file">
                  <i class="fas fa-paperclip"></i>
                  <span>Adjuntar archivo</span>
                </button>
                <div class="vera-training-drop-preview" id="veraTrainingFilePreview" hidden></div>
              </div>
            </div>

            <div class="vera-training-row">
              <label class="vera-training-label" for="veraTrainingPrompt">
                <i class="fas fa-pen-nib"></i>
                <span>Prompt</span>
                <span class="vera-training-hint">conocimiento en texto libre</span>
              </label>
              <textarea
                id="veraTrainingPrompt"
                class="vera-training-textarea"
                rows="6"
                placeholder="Describe el estilo, la marca, el principio, el ejemplo... Sera embebido tal cual al vector global."
              ></textarea>
            </div>

            <div class="vera-training-row">
              <label class="vera-training-label" for="veraTrainingImage">
                <i class="fas fa-image"></i>
                <span>Imagen de referencia</span>
                <span class="vera-training-hint">OpenAI Vision describe el estilo</span>
              </label>
              <div class="vera-training-drop" data-drop="image">
                <input type="file" id="veraTrainingImage" accept="image/jpeg,image/png,image/webp,image/jpg" hidden>
                <button type="button" class="vera-training-drop-btn" data-trigger="image">
                  <i class="fas fa-image"></i>
                  <span>Adjuntar imagen</span>
                </button>
                <div class="vera-training-drop-preview" id="veraTrainingImagePreview" hidden></div>
              </div>
            </div>

            <div class="vera-training-row">
              <label class="vera-training-label" for="veraTrainingTitle">
                <i class="fas fa-tag"></i>
                <span>Titulo (opcional)</span>
                <span class="vera-training-hint">para identificarlo en Ver Conocimientos</span>
              </label>
              <input
                type="text"
                id="veraTrainingTitle"
                class="vera-training-input"
                placeholder="ej: Estilo visual marcas premium 2026"
                maxlength="120"
              >
            </div>

            <footer class="vera-training-footer">
              <button type="button" class="btn btn-secondary" id="veraTrainingReset">
                <i class="fas fa-rotate-left"></i> Limpiar
              </button>
              <button type="submit" class="btn btn-primary" id="veraTrainingSubmit">
                <i class="fas fa-bolt"></i> Entrenar
              </button>
            </footer>
          </form>
        </section>
      </div>
    `;
  }

  async init() {
    const form = document.getElementById('veraTrainingForm');
    const fileInput = document.getElementById('veraTrainingFile');
    const imageInput = document.getElementById('veraTrainingImage');
    const resetBtn = document.getElementById('veraTrainingReset');

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitTraining();
    });

    document.querySelectorAll('[data-trigger="file"]').forEach(btn => {
      btn.addEventListener('click', () => fileInput?.click());
    });
    document.querySelectorAll('[data-trigger="image"]').forEach(btn => {
      btn.addEventListener('click', () => imageInput?.click());
    });

    fileInput?.addEventListener('change', () => this.onFilePicked(fileInput.files?.[0] || null));
    imageInput?.addEventListener('change', () => this.onImagePicked(imageInput.files?.[0] || null));

    resetBtn?.addEventListener('click', () => this.resetForm());

    // Drag & drop sobre cada drop zone
    document.querySelectorAll('.vera-training-drop').forEach(zone => {
      const kind = zone.getAttribute('data-drop');
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-drag'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-drag'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('is-drag');
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        if (kind === 'image') this.onImagePicked(file);
        else this.onFilePicked(file);
      });
    });
  }

  onFilePicked(file) {
    this._fileObj = file || null;
    const preview = document.getElementById('veraTrainingFilePreview');
    if (!preview) return;
    if (!file) { preview.hidden = true; preview.innerHTML = ''; return; }
    const sizeKb = (file.size / 1024).toFixed(1);
    preview.hidden = false;
    preview.innerHTML = `
      <i class="fas fa-file-lines"></i>
      <span class="vera-training-preview-name">${this.escapeHtml(file.name)}</span>
      <span class="vera-training-preview-size">${sizeKb} KB</span>
      <button type="button" class="vera-training-preview-remove" aria-label="Quitar archivo">&times;</button>
    `;
    preview.querySelector('.vera-training-preview-remove')?.addEventListener('click', () => {
      document.getElementById('veraTrainingFile').value = '';
      this.onFilePicked(null);
    });
  }

  onImagePicked(file) {
    this._imageObj = file || null;
    const preview = document.getElementById('veraTrainingImagePreview');
    if (!preview) return;
    if (!file) { preview.hidden = true; preview.innerHTML = ''; return; }
    const url = URL.createObjectURL(file);
    preview.hidden = false;
    preview.innerHTML = `
      <img src="${url}" alt="Preview" class="vera-training-preview-img">
      <span class="vera-training-preview-name">${this.escapeHtml(file.name)}</span>
      <button type="button" class="vera-training-preview-remove" aria-label="Quitar imagen">&times;</button>
    `;
    preview.querySelector('.vera-training-preview-remove')?.addEventListener('click', () => {
      URL.revokeObjectURL(url);
      document.getElementById('veraTrainingImage').value = '';
      this.onImagePicked(null);
    });
  }

  resetForm() {
    const form = document.getElementById('veraTrainingForm');
    form?.reset();
    this.onFilePicked(null);
    this.onImagePicked(null);
  }

  async submitTraining() {
    if (this._submitting) return;
    const promptEl = document.getElementById('veraTrainingPrompt');
    const titleEl = document.getElementById('veraTrainingTitle');
    const prompt = (promptEl?.value || '').trim();
    const title = (titleEl?.value || '').trim();

    if (!this._fileObj && !this._imageObj && !prompt) {
      this.showNotification('Adjunta archivo, escribe un prompt o adjunta imagen.', 'warning');
      return;
    }

    const submitBtn = document.getElementById('veraTrainingSubmit');
    this._submitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrenando...';
    }

    try {
      // TODO: cablear endpoint real en ai-engine (POST /api/vera/train).
      // Por ahora la vista es read-only frontend: mostramos lo que ENVIARIAMOS
      // sin disparar embeddings (la OPENAI_API_KEY vive en ai-engine, no Netlify).
      console.info('[VeraTraining] payload preview:', {
        title,
        prompt,
        file: this._fileObj ? { name: this._fileObj.name, size: this._fileObj.size, type: this._fileObj.type } : null,
        image: this._imageObj ? { name: this._imageObj.name, size: this._imageObj.size, type: this._imageObj.type } : null
      });
      this.showNotification('Backend de vectorizacion pendiente. Payload listo para envio al endpoint /api/vera/train.', 'info');
    } catch (err) {
      console.error('[VeraTraining] error:', err);
      this.showNotification('Error: ' + (err?.message || 'fallo de entrenamiento'), 'error');
    } finally {
      this._submitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-bolt"></i> Entrenar';
      }
    }
  }

  escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

window.DevLeadVeraTrainingView = DevLeadVeraTrainingView;
