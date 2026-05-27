/**
 * DevLeadLexiconView - Admin del léxico de dimensiones (solo Lead).
 *
 * El léxico (`dimension_lexicon`) es el vocabulario que el ai-engine usa para
 * clasificar contenido y tendencias por dimensión (topic / mood / tone). Las
 * palabras con `source = learned` entran como `proposed` y esperan revisión
 * humana: aquí el Lead las aprueba o rechaza para enriquecer el catálogo global.
 *
 * "Temas huérfanos" (`v_orphan_topics`) son keywords en tendencia que ninguna
 * marca ha cubierto aún — candidatos a futuras palabras del léxico.
 *
 * Lectura: `dimension_lexicon` es legible por el cliente (policy dl_read_all).
 * Escritura/orphans: vía RPCs security-definer gateados a Lead
 * (`review_lexicon_word`, `get_orphan_topics`).
 */
class DevLeadLexiconView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.tab = 'lexicon';           // 'lexicon' | 'orphans'
    this.statusFilter = 'proposed'; // 'proposed' | 'approved' | 'rejected' | 'all'
    this.search = '';
    this.words = [];
    this.orphans = [];
    this.orphansLoaded = false;
    this.counts = { proposed: 0, approved: 0, rejected: 0 };
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  async getSupabase() {
    if (this.supabase) return this.supabase;
    if (window.supabaseService) this.supabase = await window.supabaseService.getClient();
    else if (window.supabase) this.supabase = window.supabase;
    return this.supabase;
  }

  renderHTML() {
    return `
      <div class="dev-lead-container dev-lexicon">
        <div class="dev-flows-topbar">
          <div class="dev-flows-scope-toggle" id="lexTabToggle">
            <button type="button" class="dev-scope-btn active" data-tab="lexicon">
              <i class="fas fa-book"></i> Léxico
            </button>
            <button type="button" class="dev-scope-btn" data-tab="orphans">
              <i class="fas fa-fire"></i> Temas huérfanos
            </button>
          </div>
          <button type="button" class="btn btn-secondary dev-flows-create-btn" id="lexRefreshBtn">
            <i class="fas fa-sync-alt"></i> Actualizar
          </button>
        </div>
        <p class="dev-header-subtitle dev-lexicon-hint">
          Vocabulario que el motor usa para clasificar contenido por dimensión (topic / mood / tone).
          Revisa las palabras propuestas por el sistema y los temas en tendencia aún sin cobertura.
        </p>

        <!-- Panel: Léxico -->
        <div class="dev-lexicon-panel" data-lex-panel="lexicon">
          <div class="dev-flows-toolbar">
            <div class="dev-flows-filters" id="lexStatusFilters">
              <button class="dev-filter-btn active" data-status="proposed">
                <i class="fas fa-clock"></i> Propuestos <span class="lex-count" id="lexCountProposed">0</span>
              </button>
              <button class="dev-filter-btn" data-status="approved">
                <i class="fas fa-check"></i> Aprobados <span class="lex-count" id="lexCountApproved">0</span>
              </button>
              <button class="dev-filter-btn" data-status="rejected">
                <i class="fas fa-times"></i> Rechazados <span class="lex-count" id="lexCountRejected">0</span>
              </button>
              <button class="dev-filter-btn" data-status="all">
                <i class="fas fa-border-all"></i> Todos
              </button>
            </div>
            <div class="dev-flows-search">
              <i class="fas fa-search"></i>
              <input type="text" id="lexSearchInput" placeholder="Buscar palabra o dimensión...">
            </div>
          </div>
          <div class="dev-table-container">
            <table class="dev-table" id="lexTable">
              <thead>
                <tr>
                  <th>Palabra</th>
                  <th>Dimensión</th>
                  <th>Valor</th>
                  <th>Idioma</th>
                  <th>Confianza</th>
                  <th>Fuente</th>
                  <th>Estado</th>
                  <th class="dev-lead-actions">Acciones</th>
                </tr>
              </thead>
              <tbody id="lexBody"></tbody>
            </table>
            <div class="dev-lead-empty" id="lexEmpty" hidden>
              <i class="fas fa-book"></i>
              <p>No hay palabras en este estado.</p>
            </div>
          </div>
        </div>

        <!-- Panel: Temas huérfanos -->
        <div class="dev-lexicon-panel" data-lex-panel="orphans" hidden>
          <div class="dev-table-container">
            <table class="dev-table" id="orphanTable">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Velocidad</th>
                  <th>Relevancia</th>
                  <th>Marcas</th>
                </tr>
              </thead>
              <tbody id="orphanBody"></tbody>
            </table>
            <div class="dev-lead-empty" id="orphanEmpty" hidden>
              <i class="fas fa-fire"></i>
              <p>No hay temas huérfanos.</p>
            </div>
          </div>
        </div>
      </div>`;
  }

  async init() {
    await this.getSupabase();
    if (!this.supabase) { this.showError('No se pudo conectar con la base de datos'); return; }
    this.setupTabs();
    this.setupFilters();
    await this.loadCounts();
    await this.loadWords();
  }

  setupTabs() {
    const toggle = document.getElementById('lexTabToggle');
    toggle?.querySelectorAll('.dev-scope-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setTab(btn.dataset.tab));
    });
    const refresh = document.getElementById('lexRefreshBtn');
    if (refresh) refresh.addEventListener('click', () => this.refreshCurrentTab());
  }

  setupFilters() {
    document.querySelectorAll('#lexStatusFilters .dev-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#lexStatusFilters .dev-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.statusFilter = btn.dataset.status;
        this.loadWords();
      });
    });
    const search = document.getElementById('lexSearchInput');
    if (search) {
      search.addEventListener('input', (e) => {
        this.search = e.target.value.trim();
        this.renderWords();
      });
    }
  }

  setTab(tab) {
    this.tab = (tab === 'orphans') ? 'orphans' : 'lexicon';
    document.querySelectorAll('#lexTabToggle .dev-scope-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === this.tab);
    });
    document.querySelectorAll('.dev-lexicon-panel').forEach(panel => {
      panel.hidden = panel.dataset.lexPanel !== this.tab;
    });
    if (this.tab === 'orphans' && !this.orphansLoaded) this.loadOrphans();
  }

  refreshCurrentTab() {
    if (this.tab === 'orphans') { this.orphansLoaded = false; this.loadOrphans(); }
    else { this.loadCounts(); this.loadWords(); }
  }

  // ---------- Léxico ----------

  async loadCounts() {
    try {
      const { data, error } = await this.supabase
        .from('dimension_lexicon')
        .select('status');
      if (error) throw error;
      const c = { proposed: 0, approved: 0, rejected: 0 };
      (data || []).forEach(r => { if (c[r.status] != null) c[r.status]++; });
      this.counts = c;
      this.renderCounts();
    } catch (err) {
      console.error('Error cargando conteos del léxico:', err);
    }
  }

  renderCounts() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('lexCountProposed', this.counts.proposed);
    set('lexCountApproved', this.counts.approved);
    set('lexCountRejected', this.counts.rejected);
  }

  async loadWords() {
    try {
      let query = this.supabase
        .from('dimension_lexicon')
        .select('id, dimension, category_value, word, language, source, detection_confidence, status, added_at')
        .order('detection_confidence', { ascending: false, nullsFirst: false })
        .limit(1000);
      if (this.statusFilter !== 'all') query = query.eq('status', this.statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      this.words = Array.isArray(data) ? data : [];
      this.renderWords();
    } catch (err) {
      console.error('Error cargando léxico:', err);
      this.words = [];
      this.renderWords();
    }
  }

  filteredWords() {
    if (!this.search) return this.words;
    const q = this.search.toLowerCase();
    return this.words.filter(w =>
      (w.word || '').toLowerCase().includes(q) ||
      (w.dimension || '').toLowerCase().includes(q) ||
      (w.category_value || '').toLowerCase().includes(q)
    );
  }

  renderWords() {
    const tbody = document.getElementById('lexBody');
    const empty = document.getElementById('lexEmpty');
    if (!tbody) return;
    const rows = this.filteredWords();

    if (rows.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = rows.map(w => {
      const conf = (w.detection_confidence != null) ? Number(w.detection_confidence).toFixed(2) : '—';
      const actions = (w.status === 'proposed')
        ? `<button type="button" class="btn-icon lex-approve" title="Aprobar" data-id="${w.id}"><i class="fas fa-check"></i></button>
           <button type="button" class="btn-icon lex-reject" title="Rechazar" data-id="${w.id}"><i class="fas fa-times"></i></button>`
        : (w.status === 'approved'
            ? `<button type="button" class="btn-icon lex-reject" title="Rechazar" data-id="${w.id}"><i class="fas fa-times"></i></button>`
            : `<button type="button" class="btn-icon lex-approve" title="Aprobar" data-id="${w.id}"><i class="fas fa-check"></i></button>`);
      return `
        <tr data-id="${w.id}">
          <td><strong>${this.escapeHtml(w.word || '—')}</strong></td>
          <td>${this.escapeHtml(w.dimension || '—')}</td>
          <td>${this.escapeHtml(w.category_value || '—')}</td>
          <td>${this.escapeHtml(w.language || '—')}</td>
          <td>${conf}</td>
          <td>${this.escapeHtml(w.source || '—')}</td>
          <td><span class="lex-status lex-status-${w.status}">${this.getStatusLabel(w.status)}</span></td>
          <td class="dev-lead-actions">${actions}</td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.lex-approve').forEach(btn => {
      btn.addEventListener('click', () => this.reviewWord(btn.getAttribute('data-id'), 'approved'));
    });
    tbody.querySelectorAll('.lex-reject').forEach(btn => {
      btn.addEventListener('click', () => this.reviewWord(btn.getAttribute('data-id'), 'rejected'));
    });
  }

  async reviewWord(id, status) {
    if (!id) return;
    let reason = null;
    if (status === 'rejected') {
      reason = window.prompt('Motivo del rechazo (opcional):', '') || null;
    }
    try {
      const { error } = await this.supabase.rpc('review_lexicon_word', {
        p_id: id, p_status: status, p_reason: reason
      });
      if (error) throw error;
      // Ajustar conteos y estado local sin recargar todo
      const w = this.words.find(x => x.id === id);
      if (w) {
        if (this.counts[w.status] != null) this.counts[w.status] = Math.max(0, this.counts[w.status] - 1);
        if (this.counts[status] != null) this.counts[status]++;
        w.status = status;
      }
      this.renderCounts();
      // Si el filtro activo ya no coincide, sacar la fila de la vista
      if (this.statusFilter !== 'all' && this.statusFilter !== status) {
        this.words = this.words.filter(x => x.id !== id);
      }
      this.renderWords();
      this.showNotification(status === 'approved' ? 'Palabra aprobada' : 'Palabra rechazada', 'success');
    } catch (err) {
      console.error('Error revisando palabra:', err);
      this.showNotification('Error: ' + (err.message || 'no se pudo actualizar'), 'error');
    }
  }

  // ---------- Temas huérfanos ----------

  async loadOrphans() {
    try {
      const { data, error } = await this.supabase.rpc('get_orphan_topics', { p_limit: 200 });
      if (error) throw error;
      this.orphans = Array.isArray(data) ? data : [];
      this.orphansLoaded = true;
      this.renderOrphans();
    } catch (err) {
      console.error('Error cargando temas huérfanos:', err);
      this.orphans = [];
      this.renderOrphans();
    }
  }

  renderOrphans() {
    const tbody = document.getElementById('orphanBody');
    const empty = document.getElementById('orphanEmpty');
    if (!tbody) return;

    if (!this.orphans || this.orphans.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = this.orphans.map(o => {
      const vel = (o.velocity != null) ? Number(o.velocity).toFixed(2) : '—';
      const rel = (o.relevance != null) ? Number(o.relevance).toFixed(2) : '—';
      return `
        <tr>
          <td><strong>${this.escapeHtml(o.keyword || '—')}</strong></td>
          <td>${vel}</td>
          <td>${rel}</td>
          <td>${o.brands != null ? o.brands : 0}</td>
        </tr>`;
    }).join('');
  }

  // ---------- Utilidades ----------

  getStatusLabel(status) {
    const labels = { proposed: 'Propuesto', approved: 'Aprobado', rejected: 'Rechazado' };
    return labels[status] || status || '—';
  }
}

window.DevLeadLexiconView = DevLeadLexiconView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DevLeadLexiconView;
}
