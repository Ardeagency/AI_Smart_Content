/**
 * DevLeadLexiconView - Temas huérfanos del nicho (solo Lead).
 *
 * "Temas huérfanos" (`v_orphan_topics` → RPC `get_orphan_topics`) son keywords
 * en tendencia con velocidad real que ninguna marca ha cubierto con un pilar
 * narrativo: el hueco entre lo que el nicho habla y lo que las marcas dicen.
 *
 * Se alimenta de `trend_topics`, que sigue VIVO (collectors semanales). El
 * léxico de dimensiones que vivía aquí se eliminó en 2026-07-23 junto con
 * `dimension_lexicon`: era vocabulario del clasificador, un subsistema que ya
 * no existe, y su última palabra databa del 2026-05-04.
 *
 * El nombre de archivo/ruta se conserva para no romper enlaces guardados.
 */
class DevLeadLexiconView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.orphans = [];
    this.search = '';
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
        <p class="dev-header-subtitle dev-lexicon-hint">
          Keywords con velocidad real en el nicho que ninguna marca cubre todavía con un pilar
          narrativo. Es el hueco entre lo que la gente habla y lo que las marcas dicen.
        </p>
        <div class="dev-lexicon-panel">
          <div class="dev-flows-toolbar">
            <div class="dev-flows-search">
              <i class="aisc-ico aisc-ico--search"></i>
              <input type="text" id="orphanSearchInput" placeholder="Buscar keyword...">
            </div>
          </div>
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
              <i class="aisc-ico aisc-ico--fire"></i>
              <p>No hay temas huérfanos.</p>
            </div>
          </div>
        </div>
      </div>`;
  }

  async init() {
    await this.getSupabase();
    if (!this.supabase) { this.showError('No se pudo conectar con la base de datos'); return; }
    const search = document.getElementById('orphanSearchInput');
    if (search) {
      search.addEventListener('input', (e) => {
        this.search = e.target.value.trim();
        this.renderOrphans();
      });
    }
    await this.loadOrphans();
  }

  refreshCurrentTab() { this.loadOrphans(); }

  async loadOrphans() {
    try {
      const { data, error } = await this.supabase.rpc('get_orphan_topics', { p_limit: 200 });
      if (error) throw error;
      this.orphans = Array.isArray(data) ? data : [];
      this.renderOrphans();
    } catch (err) {
      console.error('Error cargando temas huérfanos:', err);
      this.orphans = [];
      this.renderOrphans();
    }
  }

  filteredOrphans() {
    if (!this.search) return this.orphans;
    const q = this.search.toLowerCase();
    return this.orphans.filter((o) => (o.keyword || '').toLowerCase().includes(q));
  }

  renderOrphans() {
    const tbody = document.getElementById('orphanBody');
    const empty = document.getElementById('orphanEmpty');
    if (!tbody) return;
    const rows = this.filteredOrphans();

    if (!rows.length) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = rows.map((o) => {
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
}

window.DevLeadLexiconView = DevLeadLexiconView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DevLeadLexiconView;
}
