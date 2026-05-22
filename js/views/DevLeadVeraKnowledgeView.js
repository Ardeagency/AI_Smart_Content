/**
 * DevLeadVeraKnowledgeView - Ver conocimientos (solo Lead)
 *
 * Muestra cada conocimiento del vector global de Vera (ai_global_vectors) como
 * una burbuja. Agrupa por source_path para no listar 1 burbuja por chunk:
 * cada fuente = 1 burbuja con su titulo (metadata.title), # chunks y tipo.
 * Click en una burbuja abre detalle con todos los chunks.
 */
class DevLeadVeraKnowledgeView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.items = [];
    this._loading = false;
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  renderHTML() {
    return `
      <div class="dev-lead-container vera-knowledge">
        <header class="dev-lead-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title"><i class="fas fa-circle-nodes"></i> Conocimientos de Vera</h1>
            <p class="dev-header-subtitle">Todo lo que el vector global aprendio. Cada burbuja es una fuente con sus chunks embedidos.</p>
          </div>
          <div class="dev-lead-toolbar" id="headerToolbar">
            <input type="search" id="veraKnowledgeSearch" class="form-control vera-knowledge-search" placeholder="Buscar por titulo o contenido..." autocomplete="off">
            <button type="button" class="btn btn-secondary" id="veraKnowledgeRefresh" title="Refrescar"><i class="fas fa-sync-alt"></i></button>
          </div>
        </header>

        <section class="dev-lead-content vera-knowledge-content">
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

        <div class="modal dev-lead-modal" id="veraKnowledgeDetailModal" hidden>
          <div class="modal-overlay"></div>
          <div class="modal-content modal-lg">
            <div class="modal-header">
              <h3 id="veraDetailTitle">Detalle</h3>
              <button type="button" class="modal-close" id="veraDetailClose">&times;</button>
            </div>
            <div class="modal-body" id="veraDetailBody"></div>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
    document.getElementById('veraKnowledgeRefresh')?.addEventListener('click', () => this.loadKnowledge());
    document.getElementById('veraKnowledgeSearch')?.addEventListener('input', (e) => {
      this.renderBubbles((e.target?.value || '').trim().toLowerCase());
    });
    document.getElementById('veraDetailClose')?.addEventListener('click', () => this.closeDetail());
    document.querySelector('#veraKnowledgeDetailModal .modal-overlay')?.addEventListener('click', () => this.closeDetail());

    document.getElementById('veraKnowledgeBubbles')?.addEventListener('click', (e) => {
      const bubble = e.target.closest('.vera-bubble');
      if (!bubble) return;
      const key = bubble.getAttribute('data-key');
      if (key) this.openDetail(key);
    });

    try {
      this.supabase = await this.getSupabaseClient();
      await this.loadKnowledge();
    } catch (err) {
      console.error('VeraKnowledge init:', err);
      this.renderError(err?.message || 'Error al cargar');
    }
  }

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
      // Mantener la fecha mas reciente
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
          <p class="vera-knowledge-empty-hint">Ve a <a href="/dev/lead/vera-training">Entrenamiento de Vera</a> para agregar conocimientos.</p>
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
    const modal = document.getElementById('veraKnowledgeDetailModal');
    const title = document.getElementById('veraDetailTitle');
    const body = document.getElementById('veraDetailBody');
    if (!modal || !body) return;
    if (title) title.textContent = group.title;
    body.innerHTML = `
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
    modal.hidden = false;
    modal.style.display = 'flex';
    modal.classList.add('is-open');
  }

  closeDetail() {
    const modal = document.getElementById('veraKnowledgeDetailModal');
    if (!modal) return;
    modal.hidden = true;
    modal.style.display = 'none';
    modal.classList.remove('is-open');
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

window.DevLeadVeraKnowledgeView = DevLeadVeraKnowledgeView;
