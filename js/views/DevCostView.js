/**
 * DevCostView — Calculador de costo real de AI Smart Content (Dev/PaaS).
 *
 * Lee credit_usage (TODO el gasto: Anthropic, Apify, OpenAI, ComfyUI) vía la RPC
 * dev_cost_report y responde: (1) cuánto cuesta cada función, (2) cuánto cuesta
 * cada org vs el precio de su plan (margen real), (3) el costo unitario de una
 * "Vera" (dashboard/sesión). Fuente de verdad del gasto: kind='claude_tokens'
 * (usage real del org-server) + los demás proveedores.
 */
class DevCostView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.days = 30;
    this.report = null;
    // Costos unitarios de referencia (medidos, no estimados) — editable en la UI.
    this.unit = {
      veraCall: 0.19,      // una llamada de Vera al org-server que completa
      dashboardSections: 4, // un dashboard = 4 secciones
    };
  }

  async initSupabase() {
    if (window.supabaseService) this.supabase = await window.supabaseService.getClient();
    else if (window.supabase) this.supabase = window.supabase;
  }

  renderHTML() {
    return `
      <div class="dev-cost">
        <header class="dev-cost-head">
          <div>
            <h1 class="dev-cost-title">Calculador de costo real</h1>
            <p class="dev-cost-sub">Todo el gasto de AI Smart Content en un lugar — Anthropic, Apify, OpenAI, ComfyUI. Fuente: <code>credit_usage</code>.</p>
          </div>
          <div class="dev-cost-period">
            <label for="costDays">Período</label>
            <select id="costDays">
              <option value="1">24 h</option>
              <option value="7">7 días</option>
              <option value="30" selected>30 días</option>
              <option value="90">90 días</option>
            </select>
          </div>
        </header>

        <section class="dev-cost-cards" id="costUnit">
          <div class="dcost-card">
            <div class="dcost-k">Costo de 1 llamada de Vera</div>
            <div class="dcost-v" id="uVeraCall">$0.19</div>
            <div class="dcost-note">medido · el output domina (~56%)</div>
          </div>
          <div class="dcost-card dcost-card--accent">
            <div class="dcost-k">1 dashboard completo (4 secciones)</div>
            <div class="dcost-v" id="uDashboard">$0.78</div>
            <div class="dcost-note">estructurado · lo que ve el cliente</div>
          </div>
          <div class="dcost-card">
            <div class="dcost-k">Gasto total del período</div>
            <div class="dcost-v" id="uTotal">—</div>
            <div class="dcost-note" id="uTotalNote">cargando…</div>
          </div>
        </section>

        <section class="dev-cost-block">
          <h2>Costo por función</h2>
          <div class="dcost-tablewrap">
            <table class="dcost-table" id="costByFunc">
              <thead><tr><th>Función</th><th>Proveedor</th><th class="num">Ops</th><th class="num">Costo/op</th><th class="num">Total USD</th><th>Peso</th></tr></thead>
              <tbody><tr><td colspan="6" class="dcost-empty">Cargando…</td></tr></tbody>
            </table>
          </div>
        </section>

        <section class="dev-cost-block">
          <h2>Costo por organización vs. plan <span class="dcost-hint">proyección mensual desde el período</span></h2>
          <div class="dcost-tablewrap">
            <table class="dcost-table" id="costByOrg">
              <thead><tr><th>Organización</th><th>Plan</th><th class="num">Precio/mes</th><th class="num">Costo real (proy.)</th><th class="num">Margen/mes</th><th>Salud</th></tr></thead>
              <tbody><tr><td colspan="6" class="dcost-empty">Cargando…</td></tr></tbody>
            </table>
          </div>
        </section>
      </div>`;
  }

  async init() {
    await this.initSupabase();
    document.getElementById('costDays')?.addEventListener('change', (e) => {
      this.days = Number(e.target.value) || 30;
      this.load();
    });
    document.getElementById('uVeraCall')?.closest('.dcost-card')?.addEventListener('click', () => {});
    await this.load();
  }

  fmt(n) {
    const v = Number(n) || 0;
    return v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'K' : '$' + v.toFixed(v < 1 ? 4 : 2);
  }

  async load() {
    if (!this.supabase) return;
    try {
      const { data, error } = await this.supabase.rpc('dev_cost_report', { p_days: this.days });
      if (error) throw error;
      this.report = data || {};
      this.renderUnit();
      this.renderByFunc();
      this.renderByOrg();
    } catch (e) {
      console.error('[DevCost] load:', e?.message || e);
      const tb = document.querySelector('#costByFunc tbody');
      if (tb) tb.innerHTML = `<tr><td colspan="6" class="dcost-empty">No se pudo cargar: ${this.escapeHtml(e?.message || '')}</td></tr>`;
    }
  }

  renderUnit() {
    const dash = this.unit.veraCall * this.unit.dashboardSections;
    const uv = document.getElementById('uVeraCall'); if (uv) uv.textContent = '$' + this.unit.veraCall.toFixed(2);
    const ud = document.getElementById('uDashboard'); if (ud) ud.textContent = '$' + dash.toFixed(2);
    const ut = document.getElementById('uTotal'); if (ut) ut.textContent = this.fmt(this.report?.total_usd);
    const un = document.getElementById('uTotalNote'); if (un) un.textContent = `en ${this.report?.period_days || this.days} días · todas las orgs`;
  }

  renderByFunc() {
    const rows = Array.isArray(this.report?.by_function) ? this.report.by_function : [];
    const tb = document.querySelector('#costByFunc tbody');
    if (!tb) return;
    if (!rows.length) { tb.innerHTML = `<tr><td colspan="6" class="dcost-empty">Sin gasto en el período.</td></tr>`; return; }
    const max = Math.max(...rows.map(r => Number(r.usd) || 0), 0.0001);
    tb.innerHTML = rows.map(r => {
      const pct = Math.round((Number(r.usd) || 0) / max * 100);
      return `<tr>
        <td class="dcost-fn">${this.escapeHtml(r.label || r.kind)}</td>
        <td><span class="dcost-prov">${this.escapeHtml(r.provider || '')}</span></td>
        <td class="num">${Number(r.ops).toLocaleString('es-CO')}</td>
        <td class="num dcost-dim">${this.fmt(r.usd_avg)}</td>
        <td class="num dcost-strong">${this.fmt(r.usd)}</td>
        <td><div class="dcost-bar"><i style="width:${pct}%"></i></div></td>
      </tr>`;
    }).join('');
  }

  renderByOrg() {
    const rows = Array.isArray(this.report?.by_org) ? this.report.by_org : [];
    const tb = document.querySelector('#costByOrg tbody');
    if (!tb) return;
    if (!rows.length) { tb.innerHTML = `<tr><td colspan="6" class="dcost-empty">Sin orgs con gasto.</td></tr>`; return; }
    tb.innerHTML = rows.map(r => {
      const price = Number(r.plan_price);
      const cost = Number(r.usd_cost_monthly_proj) || 0;
      const margin = Number(r.margin_monthly_proj);
      const hasPrice = r.plan_price != null;
      let health = 'dcost-ok', label = 'sano';
      if (hasPrice) {
        const ratio = price > 0 ? cost / price : 0;
        if (margin < 0) { health = 'dcost-bad'; label = 'pierde'; }
        else if (ratio > 0.6) { health = 'dcost-warn'; label = 'ajustado'; }
      } else { health = 'dcost-dim'; label = '—'; }
      return `<tr>
        <td class="dcost-fn">${this.escapeHtml(r.org_name || r.organization_id)}</td>
        <td>${this.escapeHtml(r.plan)}</td>
        <td class="num">${hasPrice ? '$' + price.toFixed(0) : '—'}</td>
        <td class="num dcost-strong">${this.fmt(r.usd_cost_monthly_proj)}</td>
        <td class="num ${margin < 0 ? 'dcost-neg' : 'dcost-pos'}">${hasPrice ? (margin < 0 ? '-$' + Math.abs(margin).toFixed(0) : '$' + margin.toFixed(0)) : '—'}</td>
        <td><span class="dcost-pill ${health}">${label}</span></td>
      </tr>`;
    }).join('');
  }
}

window.DevCostView = DevCostView;
