/**
 * DevLeadVeraTrainingView - Entrenamiento (solo Lead)
 *
 * Página unificada "LLM → Entrenamiento" con dos pestañas:
 *  - Entrenar: inyecta archivo / prompt / imagen al vector global de Vera.
 *    (Backend /api/vera/train pendiente en ai-engine — la OPENAI_API_KEY no
 *    está en Netlify; por ahora arma el payload y avisa.)
 *  - Conocimientos: lista lo que el vector global aprendió (ai_global_vectors),
 *    agrupado por fuente; cada burbuja abre detalle con sus chunks.
 *
 * Antes eran dos vistas separadas (Entrenamiento de Vera + Ver conocimientos);
 * se unificaron 2026-05-27.
 */
class DevLeadVeraTrainingView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    // Entrenar
    this._fileObj = null;
    this._imageObj = null;
    this._submitting = false;
    // Conocimientos
    this.tab = 'train';            // 'train' | 'knowledge'
    this.items = [];
    this._knowledgeLoaded = false;
    this._loading = false;
    this._modalClose = null;
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  renderHTML() {
    return `
      <div class="dev-lead-container vera-training">
        <div class="dev-flows-topbar">
          <div class="dev-flows-scope-toggle" id="veraTabToggle">
            <button type="button" class="dev-scope-btn active" data-tab="train">
              <i class="fas fa-bolt"></i> Entrenar
            </button>
            <button type="button" class="dev-scope-btn" data-tab="knowledge">
              <i class="fas fa-circle-nodes"></i> Conocimientos
            </button>
          </div>
        </div>

        <!-- Panel: Entrenar -->
        <section class="dev-lead-content vera-training-content vera-tab-panel" data-vera-panel="train">
          <p class="dev-header-subtitle vera-tab-hint">Inyecta archivos, prompts e imágenes al vector global de Vera. OpenAI vectoriza estilo visual y conocimiento textual.</p>
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
                <span class="vera-training-hint">para identificarlo en Conocimientos</span>
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

        <!-- Panel: Conocimientos -->
        <section class="dev-lead-content vera-knowledge-content vera-tab-panel" data-vera-panel="knowledge" hidden>
          <div class="dev-flows-toolbar">
            <p class="dev-header-subtitle vera-tab-hint">Todo lo que el vector global aprendió. Cada burbuja es una fuente con sus chunks embedidos.</p>
            <div class="dev-lead-toolbar" id="headerToolbar">
              <input type="search" id="veraKnowledgeSearch" class="form-control vera-knowledge-search" placeholder="Buscar por titulo o contenido..." autocomplete="off">
            </div>
          </div>
          <div class="vera-knowledge-stats" id="veraKnowledgeStats" hidden>
            <span class="vera-knowledge-stat"><i class="fas fa-database"></i> <span id="statSources">0</span> fuentes</span>
            <span class="vera-knowledge-stat"><i class="fas fa-puzzle-piece"></i> <span id="statChunks">0</span> chunks</span>
          </div>
          <div class="vera-knowledge-bubbles" id="veraKnowledgeBubbles">
            <div class="vera-knowledge-loading">
              <i class="fas fa-spinner fa-spin"></i> Cargando conocimientos...
            </div>
          </div>
        </section>
      </div>
    `;
  }

  async init() {
    // Tabs
    document.getElementById('veraTabToggle')?.querySelectorAll('.dev-scope-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setTab(btn.dataset.tab));
    });

    // ----- Entrenar -----
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

    // ----- Conocimientos -----
    document.getElementById('veraKnowledgeSearch')?.addEventListener('input', (e) => {
      this.renderBubbles((e.target?.value || '').trim().toLowerCase());
    });
    document.getElementById('veraKnowledgeBubbles')?.addEventListener('click', (e) => {
      const bubble = e.target.closest('.vera-bubble');
      if (!bubble) return;
      const key = bubble.getAttribute('data-key');
      if (key) this.openDetail(key);
    });

    // Permite abrir directo en Conocimientos via ?tab=knowledge.
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('tab') === 'knowledge') {
      this.setTab('knowledge');
    }
  }

  setTab(tab) {
    this.tab = (tab === 'knowledge') ? 'knowledge' : 'train';
    document.querySelectorAll('#veraTabToggle .dev-scope-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === this.tab);
    });
    document.querySelectorAll('.vera-tab-panel').forEach(panel => {
      panel.hidden = panel.dataset.veraPanel !== this.tab;
    });
    if (this.tab === 'knowledge' && !this._knowledgeLoaded) this.loadKnowledge();
  }

  // ========== Entrenar ==========

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

  // ========== Conocimientos ==========

  async loadKnowledge() {
    if (this._loading) return;
    this._loading = true;
    const container = document.getElementById('veraKnowledgeBubbles');
    if (container) {
      container.innerHTML = '<div class="vera-knowledge-loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    }

    try {
      if (!this.supabase) this.supabase = await this.getSupabaseClient();
      if (!this.supabase) throw new Error('Sin conexion a Supabase');

      const { data, error } = await this.supabase
        .from('ai_global_vectors')
        .select('id, source_bucket, source_path, source_type, chunk_index, content, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(2000);

      if (error) throw error;
      this.items = Array.isArray(data) ? data : [];
      this._knowledgeLoaded = true;
      this.renderBubbles('');
    } catch (err) {
      console.error('loadKnowledge:', err);
      this.renderError(err?.message || 'Error al cargar conocimientos');
    } finally {
      this._loading = false;
    }
  }

  /** Agrupa por source_path. Si dos rows comparten path, son chunks de la misma fuente. */
  groupBySource() {
    const map = new Map();
    for (const row of this.items) {
      const key = row.source_path || row.id;
      if (!map.has(key)) {
        map.set(key, {
          key,
          source_path: row.source_path || '',
          source_type: row.source_type || 'unknown',
          source_bucket: row.source_bucket || '',
          title: (row.metadata && row.metadata.title) || row.source_path || 'Sin titulo',
          createdAt: row.created_at,
          chunks: []
        });
      }
      const group = map.get(key);
      group.chunks.push(row);
      if (row.created_at && (!group.createdAt || new Date(row.created_at) > new Date(group.createdAt))) {
        group.createdAt = row.created_at;
      }
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  renderBubbles(filter) {
    const container = document.getElementById('veraKnowledgeBubbles');
    const statsEl = document.getElementById('veraKnowledgeStats');
    const statSources = document.getElementById('statSources');
    const statChunks = document.getElementById('statChunks');
    if (!container) return;

    const groups = this.groupBySource();
    const totalChunks = this.items.length;
    if (statsEl) statsEl.hidden = groups.length === 0;
    if (statSources) statSources.textContent = String(groups.length);
    if (statChunks) statChunks.textContent = String(totalChunks);

    if (groups.length === 0) {
      container.innerHTML = `
        <div class="vera-knowledge-empty">
          <i class="fas fa-circle-nodes"></i>
          <p>El vector global esta vacio.</p>
          <p class="vera-knowledge-empty-hint">Usa la pestaña <strong>Entrenar</strong> para agregar conocimientos.</p>
        </div>
      `;
      return;
    }

    const filtered = filter
      ? groups.filter(g => (g.title + ' ' + g.chunks.map(c => c.content).join(' ')).toLowerCase().includes(filter))
      : groups;

    if (filtered.length === 0) {
      container.innerHTML = `<div class="vera-knowledge-empty"><p>Sin coincidencias para "${this.escapeHtml(filter)}".</p></div>`;
      return;
    }

    container.innerHTML = filtered.map(g => this.renderBubble(g)).join('');
  }

  renderBubble(group) {
    const typeIcon = this.iconForType(group.source_type);
    const preview = (group.chunks[0]?.content || '').slice(0, 140);
    const date = group.createdAt ? new Date(group.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    return `
      <article class="vera-bubble" data-key="${this.escapeHtml(group.key)}" role="button" tabindex="0">
        <header class="vera-bubble-head">
          <span class="vera-bubble-icon"><i class="fas ${typeIcon}"></i></span>
          <span class="vera-bubble-type">${this.escapeHtml(group.source_type)}</span>
          <span class="vera-bubble-chunks">${group.chunks.length} ${group.chunks.length === 1 ? 'chunk' : 'chunks'}</span>
        </header>
        <h3 class="vera-bubble-title">${this.escapeHtml(group.title)}</h3>
        <p class="vera-bubble-preview">${this.escapeHtml(preview)}${preview.length >= 140 ? '...' : ''}</p>
        <footer class="vera-bubble-foot">
          <span class="vera-bubble-date"><i class="far fa-clock"></i> ${date}</span>
        </footer>
      </article>
    `;
  }

  iconForType(type) {
    const t = (type || '').toLowerCase();
    if (t === 'image' || t === 'visual') return 'fa-image';
    if (t === 'prompt' || t === 'text') return 'fa-pen-nib';
    if (t === 'pdf') return 'fa-file-pdf';
    if (t === 'md' || t === 'markdown') return 'fa-file-lines';
    if (t === 'json') return 'fa-file-code';
    return 'fa-file';
  }

  openDetail(key) {
    const groups = this.groupBySource();
    const group = groups.find(g => g.key === key);
    if (!group) return;
    const body = `
      <div class="vera-detail-meta">
        <span><strong>Tipo:</strong> ${this.escapeHtml(group.source_type)}</span>
        <span><strong>Fuente:</strong> ${this.escapeHtml(group.source_path || '—')}</span>
        <span><strong>Chunks:</strong> ${group.chunks.length}</span>
      </div>
      <div class="vera-detail-chunks">
        ${group.chunks
          .slice()
          .sort((a, b) => (a.chunk_index ?? 0) - (b.chunk_index ?? 0))
          .map(c => `
            <article class="vera-detail-chunk">
              <header><span class="vera-detail-chunk-index">#${c.chunk_index ?? 0}</span></header>
              <pre class="vera-detail-chunk-content">${this.escapeHtml(c.content || '')}</pre>
            </article>
          `).join('')}
      </div>
    `;
    const { close } = window.Modal.show({ title: group.title, body, className: 'dev-lead-modal-content dev-lead-modal-wide', onClose: () => { this._modalClose = null; } });
    this._modalClose = close;
  }

  closeDetail() {
    if (this._modalClose) this._modalClose();
  }

  renderError(message) {
    const container = document.getElementById('veraKnowledgeBubbles');
    if (!container) return;
    container.innerHTML = `
      <div class="vera-knowledge-empty">
        <i class="fas fa-triangle-exclamation"></i>
        <p>${this.escapeHtml(message)}</p>
      </div>
    `;
  }

  escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

window.DevLeadVeraTrainingView = DevLeadVeraTrainingView;
