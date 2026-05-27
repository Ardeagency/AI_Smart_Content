/**
 * CommandCenterView — Canvas mixin (v6)
 *
 * Convierte Command Center en un lienzo tipo n8n/Segmind: nodos de audiencias
 * (audience_personas) a la izquierda y campanas (campaigns reales + conceptuales)
 * a la derecha. Las aristas son el vinculo campaigns.persona_id → audience_personas.id.
 *
 * - Arrastrar el puerto de salida de una audiencia y soltar sobre una campana
 *   escribe campaigns.persona_id en Supabase (live). El boton sobre la arista
 *   lo pone a null.
 * - Arrastrar el header de un nodo lo reposiciona; las posiciones persisten en
 *   localStorage por brand_container (cc:canvas:pos:<id>).
 * - Pan arrastrando el fondo; zoom con rueda o botones de la toolbar.
 * - Crear/editar nodos: el modal editor fue eliminado; el flujo se definira aparte.
 *
 * Patron de overlay SVG + bezier + drag-to-connect tomado de BuilderGraph.js.
 */
(function () {
  'use strict';
  if (typeof CommandCenterView === 'undefined') return;
  const P = CommandCenterView.prototype;
  const NS = 'http://www.w3.org/2000/svg';

  const NODE_W   = 244;   // ancho aprox para el auto-layout
  const COL_AUD  = 48;    // x columna audiencias
  const COL_CAMP = 392;   // x columna campanas
  const ROW_GAP  = 150;   // separacion vertical en auto-layout
  const ROW_TOP  = 40;

  // ------------------------------------------------------------------
  // Estado / helpers
  // ------------------------------------------------------------------
  P._posKey = function () {
    return `cc:canvas:pos:${this._containerRow?.id || 'unknown'}`;
  };

  P._loadPositions = function () {
    try {
      const raw = localStorage.getItem(this._posKey());
      this._positions = raw ? (JSON.parse(raw) || {}) : {};
    } catch (_) { this._positions = {}; }
    return this._positions;
  };

  P._savePositions = function () {
    try { localStorage.setItem(this._posKey(), JSON.stringify(this._positions || {})); }
    catch (_) { /* quota / private mode: posiciones efimeras, no critico */ }
  };

  /* ── On-canvas: que campanas reales estan puestas en el lienzo ──────── */
  P._onCanvasKey = function () { return `cc:canvas:oncanvas:${this._containerRow?.id || 'unknown'}`; };
  P._loadOnCanvas = function () {
    try {
      const raw = localStorage.getItem(this._onCanvasKey());
      this._onCanvas = new Set(raw ? (JSON.parse(raw) || []).map(String) : []);
    } catch (_) { this._onCanvas = new Set(); }
    return this._onCanvas;
  };
  P._saveOnCanvas = function () {
    try { localStorage.setItem(this._onCanvasKey(), JSON.stringify([...(this._onCanvas || [])])); }
    catch (_) { /* noop */ }
  };
  /** Una campana real esta en el canvas si esta vinculada o fue arrastrada. */
  P._realOnCanvas = function (c) {
    if (!this._onCanvas) this._loadOnCanvas();
    return !!c.persona_id || this._onCanvas.has(String(c.id));
  };

  /** Lista normalizada de nodos del canvas. Las campanas reales sin vinculo
      y sin colocar manualmente NO entran al lienzo (viven en el sidebar). */
  P._canvasNodes = function () {
    this._loadOnCanvas();
    const auds = (this._audiences || []).map((a) => ({
      key: `aud:${a.id}`, type: 'audience', id: a.id, row: a,
    }));
    const camps = (this._campaigns || [])
      .filter((c) => (c.last_synced_at ? this._realOnCanvas(c) : true))
      .map((c) => ({
        key: `camp:${c.id}`, type: c.last_synced_at ? 'campaign-real' : 'campaign-concept',
        id: c.id, row: c,
      }));
    return [...auds, ...camps];
  };

  /** Posicion de un nodo; si falta, calcula auto-layout por columnas y la fija. */
  P._posFor = function (node, audIdx, campIdx) {
    const pos = this._positions[node.key];
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) return pos;
    const isAud = node.type === 'audience';
    const next = {
      x: isAud ? COL_AUD : COL_CAMP,
      y: ROW_TOP + (isAud ? audIdx : campIdx) * ROW_GAP,
    };
    this._positions[node.key] = next;
    return next;
  };

  P._relayout = function () {
    this._positions = {};
    this._savePositions();
    this._canvasPan = { x: 0, y: 0 };
    this._canvasScale = 1;
    this._renderCanvas();
  };

  // ------------------------------------------------------------------
  // Render de nodos
  // ------------------------------------------------------------------
  P._renderCanvas = function () {
    const world = document.getElementById('ccCanvasWorld');
    const empty = document.getElementById('ccCanvasEmpty');
    if (!world) return;

    this._loadPositions();
    const nodes = this._canvasNodes();

    if (!nodes.length) {
      world.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      this._renderEdges();
      return;
    }
    if (empty) empty.style.display = 'none';

    let audIdx = 0, campIdx = 0;
    world.innerHTML = nodes.map((n) => {
      const pos = this._posFor(n, audIdx, campIdx);
      if (n.type === 'audience') audIdx++; else campIdx++;
      return n.type === 'audience'
        ? this._nodeAudienceHTML(n, pos)
        : this._nodeCampaignHTML(n, pos);
    }).join('');

    this._applyCanvasTransform();
    this._renderEdges();
  };

  /* ── Helpers de campos editables (estilo Segmind) ─────────────────── */
  P._fieldText = function (label, type, field, value, opts) {
    const o = opts || {};
    const v = this.escapeHtml(value == null ? '' : String(value));
    const ph = o.placeholder ? ` placeholder="${this.escapeHtml(o.placeholder)}"` : '';
    const extra = (o.dataType ? ` data-type="${o.dataType}"` : '') + (o.inputType ? ` type="${o.inputType}"` : ' type="text"');
    return `
      <div class="cc-field">
        <div class="cc-field-head"><span class="cc-field-label">${this.escapeHtml(label)}</span><span class="cc-field-type">${this.escapeHtml(type)}</span></div>
        <input class="cc-field-input" data-field="${field}"${extra}${ph} value="${v}" />
      </div>`;
  };
  P._fieldArea = function (label, type, field, value, opts) {
    const o = opts || {};
    const v = this.escapeHtml(value == null ? '' : String(value));
    const ph = o.placeholder ? ` placeholder="${this.escapeHtml(o.placeholder)}"` : '';
    const multi = o.multi ? ` data-multi="${o.multi}"` : '';
    return `
      <div class="cc-field">
        <div class="cc-field-head"><span class="cc-field-label">${this.escapeHtml(label)}</span><span class="cc-field-type">${this.escapeHtml(type)}</span></div>
        <textarea class="cc-field-input cc-field-area" data-field="${field}"${multi} rows="${o.rows || 2}"${ph}>${v}</textarea>
      </div>`;
  };
  P._fieldSelect = function (label, field, value, options) {
    const cur = value == null ? '' : String(value);
    const opts = options.map(([val, lbl]) => `<option value="${this.escapeHtml(val)}" ${cur === val ? 'selected' : ''}>${this.escapeHtml(lbl)}</option>`).join('');
    return `
      <div class="cc-field">
        <div class="cc-field-head"><span class="cc-field-label">${this.escapeHtml(label)}</span><span class="cc-field-type">str</span></div>
        <select class="cc-field-input cc-field-select" data-field="${field}">${opts}</select>
      </div>`;
  };
  P._linesOf = function (arr) { return Array.isArray(arr) ? arr.join('\n') : ''; };

  P._nodeActionsHTML = function (collapsed) {
    return `
        <div class="cc-node-actions">
          <button type="button" class="cc-node-act cc-node-collapse" title="${collapsed ? 'Expandir' : 'Colapsar'}"><i class="fas fa-${collapsed ? 'chevron-down' : 'chevron-up'}"></i></button>
          <button type="button" class="cc-node-act cc-node-delete" title="Eliminar"><i class="fas fa-trash"></i></button>
        </div>`;
  };

  P._nodeAudienceHTML = function (n, pos) {
    const a = n.row;
    const collapsed = this._collapsed && this._collapsed.has(n.key);
    const title = this.escapeHtml(a.name || '');
    return `
    <div class="cc-node cc-node--audience ${collapsed ? 'cc-node--collapsed' : ''}" data-node-key="${n.key}" data-type="audience" data-id="${this.escapeHtml(String(n.id))}" style="left:${pos.x}px;top:${pos.y}px;">
      <div class="cc-node-head" data-drag-handle>
        <span class="cc-node-icon"><i class="fas fa-users"></i></span>
        <input class="cc-node-title-input" data-field="name" value="${title}" placeholder="Nombre de la audiencia" title="${title}" />
        ${this._nodeActionsHTML(collapsed)}
      </div>
      <div class="cc-node-body">
        ${this._fieldSelect('Awareness', 'awareness_level', a.awareness_level, [
          ['', 'Sin definir'], ['unaware', 'Unaware'], ['problem_aware', 'Problem aware'],
          ['solution_aware', 'Solution aware'], ['product_aware', 'Product aware'], ['most_aware', 'Most aware'],
        ])}
        ${this._fieldArea('Descripcion', 'str', 'description', a.description, { rows: 2, placeholder: 'Quien es esta audiencia' })}
        ${this._fieldArea('Dolores', 'list', 'dolores', this._linesOf(a.dolores), { multi: 'lines', rows: 3, placeholder: 'Uno por linea' })}
        ${this._fieldArea('Deseos', 'list', 'deseos', this._linesOf(a.deseos), { multi: 'lines', rows: 3, placeholder: 'Uno por linea' })}
        ${this._fieldArea('Objeciones', 'list', 'objeciones', this._linesOf(a.objeciones), { multi: 'lines', rows: 3, placeholder: 'Uno por linea' })}
        ${this._fieldArea('Gatillos de compra', 'list', 'gatillos_compra', this._linesOf(a.gatillos_compra), { multi: 'lines', rows: 3, placeholder: 'Uno por linea' })}
      </div>
      <span class="cc-node-port cc-node-port--out" data-port="out" title="Arrastra hacia una campana para vincular"></span>
    </div>`;
  };

  P._nodeCampaignHTML = function (n, pos) {
    const c = n.row;
    const isReal = n.type === 'campaign-real';
    const collapsed = this._collapsed && this._collapsed.has(n.key);
    const linked = !!c.persona_id;
    const platformLabel = { meta_instagram: 'Instagram', meta_facebook: 'Facebook', google_ads: 'Google Ads', tiktok_ads: 'TikTok', linkedin_ads: 'LinkedIn', pinterest_ads: 'Pinterest', organic: 'Organico', internal: 'Interno' };
    const linkedName = linked ? ((this._audiences || []).find((a) => String(a.id) === String(c.persona_id))?.name || 'Audiencia vinculada') : '';

    if (isReal) {
      // Read-only: espejo de Meta/Google. Metricas + conjuntos/ads expandibles.
      const platLabel = platformLabel[c.platform] || (c.platform ? c.platform.replace(/_/g, ' ') : '');
      const fmt = (v) => { const x = Number(v); return Number.isFinite(x) ? (x >= 1e6 ? (x/1e6).toFixed(1)+'M' : x >= 1e3 ? (x/1e3).toFixed(1)+'K' : x.toLocaleString('es-ES')) : '0'; };
      const expanded = this._expandedReal && this._expandedReal.has(String(n.id));
      return `
    <div class="cc-node cc-node--campaign cc-node--readonly ${expanded ? 'cc-node--expanded' : ''}" data-node-key="${n.key}" data-type="campaign-real" data-id="${this.escapeHtml(String(n.id))}" style="left:${pos.x}px;top:${pos.y}px;">
      <span class="cc-node-port cc-node-port--in ${linked ? 'cc-node-port--linked' : ''}" data-port="in" title="Audiencia objetivo"></span>
      <div class="cc-node-head" data-drag-handle>
        <span class="cc-node-icon cc-node-icon--camp"><i class="fas fa-bullhorn"></i></span>
        <span class="cc-node-title" title="${this.escapeHtml(c.nombre_campana || 'Campana')}">${this.escapeHtml(c.nombre_campana || 'Campana')}</span>
        <div class="cc-node-actions">
          <button type="button" class="cc-node-act cc-node-uncanvas" title="Quitar del canvas"><i class="fas fa-eye-slash"></i></button>
        </div>
      </div>
      <div class="cc-node-body">
        <div class="cc-node-badges"><span class="cc-node-badge cc-node-badge--real">Real</span>${platLabel ? `<span class="cc-node-badge cc-node-badge--plat">${this.escapeHtml(platLabel)}</span>` : ''}${c.status ? `<span class="cc-node-badge">${this.escapeHtml(c.status)}</span>` : ''}</div>
        <dl class="cc-node-stats">
          <div><dt>Resultados</dt><dd>${fmt(c.cached_conversions)}</dd></div>
          <div><dt>Gasto</dt><dd>${fmt(c.cached_spend)} ${this.escapeHtml(c.budget_currency || '')}</dd></div>
          <div><dt>Impresiones</dt><dd>${fmt(c.cached_impressions)}</dd></div>
        </dl>
        ${linkedName ? `<span class="cc-node-meta"><i class="fas fa-link"></i> ${this.escapeHtml(linkedName)}</span>` : ''}
        <button type="button" class="cc-node-expand-btn" data-expand-id="${this.escapeHtml(String(n.id))}">
          <i class="fas fa-chevron-${expanded ? 'up' : 'down'}"></i>
          <span>${expanded ? 'Ocultar conjuntos y ads' : 'Ver conjuntos y ads'}</span>
        </button>
        <div class="cc-node-ads" data-ads-for="${this.escapeHtml(String(n.id))}" style="${expanded ? '' : 'display:none;'}">
          ${expanded ? (this._adsHTML(n.id) || '<div class="cc-ads-loading"><i class="fas fa-spinner fa-spin"></i> Cargando ads…</div>') : ''}
        </div>
      </div>
    </div>`;
    }

    // Conceptual: editable.
    const title = this.escapeHtml(c.nombre_campana || '');
    return `
    <div class="cc-node cc-node--campaign ${collapsed ? 'cc-node--collapsed' : ''}" data-node-key="${n.key}" data-type="campaign-concept" data-id="${this.escapeHtml(String(n.id))}" style="left:${pos.x}px;top:${pos.y}px;">
      <span class="cc-node-port cc-node-port--in ${linked ? 'cc-node-port--linked' : ''}" data-port="in" title="Audiencia objetivo"></span>
      <div class="cc-node-head" data-drag-handle>
        <span class="cc-node-icon cc-node-icon--camp"><i class="fas fa-bullhorn"></i></span>
        <input class="cc-node-title-input" data-field="nombre_campana" value="${title}" placeholder="Nombre de la campana" title="${title}" />
        ${this._nodeActionsHTML(collapsed)}
      </div>
      <div class="cc-node-body">
        <div class="cc-node-badges"><span class="cc-node-badge cc-node-badge--concept">Conceptual</span>${linkedName ? `<span class="cc-node-badge cc-node-badge--link"><i class="fas fa-link"></i> ${this.escapeHtml(linkedName)}</span>` : ''}</div>
        ${this._fieldArea('Descripcion interna', 'str', 'descripcion_interna', c.descripcion_interna, { rows: 2, placeholder: 'Objetivo del concepto' })}
        ${this._fieldSelect('Estado', 'status', c.status || 'draft', [
          ['draft', 'Borrador'], ['conceptual', 'Conceptual'], ['active', 'Activa'],
          ['paused', 'Pausada'], ['ended', 'Finalizada'], ['archived', 'Archivada'],
        ])}
        ${this._fieldSelect('Plataforma', 'platform', c.platform || '', [
          ['', 'Sin definir'], ['meta_facebook', 'Facebook'], ['meta_instagram', 'Instagram'],
          ['google_ads', 'Google Ads'], ['tiktok_ads', 'TikTok'], ['linkedin_ads', 'LinkedIn'],
          ['pinterest_ads', 'Pinterest'], ['organic', 'Organico'], ['internal', 'Interno'],
        ])}
        ${this._fieldText('Objetivo', 'str', 'platform_objective', c.platform_objective, { placeholder: 'OUTCOME_LEADS, PURCHASE…' })}
        ${this._fieldText('CTA', 'str', 'cta', c.cta)}
        ${this._fieldText('CTA URL', 'str', 'cta_url', c.cta_url, { inputType: 'url', placeholder: 'https://…' })}
        ${this._fieldText('Presupuesto/dia', 'num', 'budget_daily', c.budget_daily, { inputType: 'number', dataType: 'number' })}
        ${this._fieldText('Moneda', 'str', 'budget_currency', c.budget_currency || 'USD')}
        ${this._fieldText('Inicio', 'date', 'starts_at', c.starts_at ? String(c.starts_at).slice(0, 10) : '', { inputType: 'date', dataType: 'date' })}
        ${this._fieldText('Fin', 'date', 'ends_at', c.ends_at ? String(c.ends_at).slice(0, 10) : '', { inputType: 'date', dataType: 'date' })}
      </div>
    </div>`;
  };

  // ------------------------------------------------------------------
  // Transform (pan/zoom)
  // ------------------------------------------------------------------
  P._applyCanvasTransform = function () {
    const world = document.getElementById('ccCanvasWorld');
    if (!world) return;
    const s = this._canvasScale || 1;
    const p = this._canvasPan || { x: 0, y: 0 };
    world.style.transform = `translate(${p.x}px, ${p.y}px) scale(${s})`;
    world.style.transformOrigin = '0 0';
  };

  P._setZoom = function (scale, anchor) {
    const canvas = document.getElementById('ccCanvas');
    const next = Math.min(2, Math.max(0.4, scale));
    if (canvas && anchor) {
      // Zoom anclado al punto (anchor en coords de viewport del canvas)
      const r = canvas.getBoundingClientRect();
      const ax = anchor.x - r.left;
      const ay = anchor.y - r.top;
      const s0 = this._canvasScale || 1;
      const p0 = this._canvasPan || { x: 0, y: 0 };
      // mantener el punto del mundo bajo el cursor
      const wx = (ax - p0.x) / s0;
      const wy = (ay - p0.y) / s0;
      this._canvasPan = { x: ax - wx * next, y: ay - wy * next };
    }
    this._canvasScale = next;
    this._applyCanvasTransform();
    this._renderEdges();
  };

  // ------------------------------------------------------------------
  // Aristas (SVG overlay en coords de viewport)
  // ------------------------------------------------------------------
  P._bezier = function (x1, y1, x2, y2) {
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  /** Centro de un puerto en coords relativas al viewport del canvas. */
  P._portCenter = function (nodeKey, portSel) {
    const canvas = document.getElementById('ccCanvas');
    const node = document.querySelector(`.cc-node[data-node-key="${cssEsc(nodeKey)}"]`);
    if (!canvas || !node) return null;
    const port = node.querySelector(portSel) || node;
    const cr = canvas.getBoundingClientRect();
    const pr = port.getBoundingClientRect();
    return { x: pr.left + pr.width / 2 - cr.left, y: pr.top + pr.height / 2 - cr.top };
  };

  P._renderEdges = function () {
    const svg    = document.getElementById('ccCanvasEdges');
    const canvas = document.getElementById('ccCanvas');
    if (!svg || !canvas) return;
    const r = canvas.getBoundingClientRect();
    svg.setAttribute('width', String(r.width));
    svg.setAttribute('height', String(r.height));
    svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);

    // limpiar conexiones previas (mantener defs/preview)
    Array.from(svg.querySelectorAll('.cc-edge')).forEach((n) => n.remove());
    this._ensureArrowMarker(svg);

    const audSet = new Set((this._audiences || []).map((a) => String(a.id)));
    (this._campaigns || []).forEach((c) => {
      if (!c.persona_id || !audSet.has(String(c.persona_id))) return;
      const from = this._portCenter(`aud:${c.persona_id}`, '.cc-node-port--out');
      const to   = this._portCenter(`camp:${c.id}`, '.cc-node-port--in');
      if (!from || !to) return;

      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'cc-edge');

      const hit = document.createElementNS(NS, 'path');
      hit.setAttribute('d', this._bezier(from.x, from.y, to.x, to.y));
      hit.setAttribute('class', 'cc-edge-hit');
      hit.setAttribute('fill', 'none');
      g.appendChild(hit);

      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', this._bezier(from.x, from.y, to.x, to.y));
      path.setAttribute('class', 'cc-edge-path');
      path.setAttribute('fill', 'none');
      path.setAttribute('marker-end', 'url(#ccEdgeArrow)');
      g.appendChild(path);

      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      const fo = document.createElementNS(NS, 'foreignObject');
      fo.setAttribute('x', String(midX - 12));
      fo.setAttribute('y', String(midY - 12));
      fo.setAttribute('width', '24');
      fo.setAttribute('height', '24');
      fo.setAttribute('class', 'cc-edge-action');
      fo.innerHTML = `<button type="button" class="cc-edge-disconnect" title="Desvincular" aria-label="Desvincular audiencia"><i class="fas fa-times"></i></button>`;
      const btn = fo.querySelector('.cc-edge-disconnect');
      if (btn) btn.onclick = (e) => { e.stopPropagation(); this._disconnectCampaign(c.id); };
      g.appendChild(fo);

      svg.appendChild(g);
    });
  };

  P._ensureArrowMarker = function (svg) {
    if (svg.querySelector('#ccEdgeArrow')) return;
    const defs = document.createElementNS(NS, 'defs');
    const marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', 'ccEdgeArrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8'); marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6'); marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    path.setAttribute('class', 'cc-edge-arrow-head');
    marker.appendChild(path);
    defs.appendChild(marker);
    svg.appendChild(defs);
  };

  // ------------------------------------------------------------------
  // Persistencia del vinculo (BD live)
  // ------------------------------------------------------------------
  P._connectCampaignToPersona = async function (campaignId, personaId) {
    const c = (this._campaigns || []).find((x) => String(x.id) === String(campaignId));
    if (!c || !this._supabase) return;
    if (String(c.persona_id) === String(personaId)) return; // ya vinculada
    const prev = c.persona_id;
    c.persona_id = personaId;           // optimista
    this._renderCanvas();
    this._renderMiniDash();
    this._renderCampaigns();
    try {
      const { error } = await this._supabase
        .from('campaigns')
        .update({ persona_id: personaId, updated_at: new Date().toISOString() })
        .eq('id', campaignId);
      if (error) throw error;
    } catch (e) {
      console.error('CommandCenter connect:', e);
      c.persona_id = prev;              // rollback
      this._renderCanvas();
      this._renderMiniDash();
      this._renderCampaigns();
      window.alert(`No se pudo vincular: ${e?.message || 'error desconocido'}`);
    }
  };

  P._disconnectCampaign = async function (campaignId) {
    const c = (this._campaigns || []).find((x) => String(x.id) === String(campaignId));
    if (!c || !this._supabase) return;
    const prev = c.persona_id;
    c.persona_id = null;                // optimista
    this._renderCanvas();
    this._renderMiniDash();
    this._renderCampaigns();
    try {
      const { error } = await this._supabase
        .from('campaigns')
        .update({ persona_id: null, updated_at: new Date().toISOString() })
        .eq('id', campaignId);
      if (error) throw error;
    } catch (e) {
      console.error('CommandCenter disconnect:', e);
      c.persona_id = prev;              // rollback
      this._renderCanvas();
      this._renderMiniDash();
      this._renderCampaigns();
      window.alert(`No se pudo desvincular: ${e?.message || 'error desconocido'}`);
    }
  };

  // ------------------------------------------------------------------
  // Listeners (drag-connect, node-drag, pan, zoom, click→editor)
  // ------------------------------------------------------------------
  P._setupCanvasListeners = function () {
    const canvas = document.getElementById('ccCanvas');
    const world  = document.getElementById('ccCanvasWorld');
    if (!canvas || !world) return;

    // Toolbar zoom + relayout + crear
    document.getElementById('ccBtnZoomIn') ?.addEventListener('click', () => this._setZoom((this._canvasScale || 1) + 0.15));
    document.getElementById('ccBtnZoomOut')?.addEventListener('click', () => this._setZoom((this._canvasScale || 1) - 0.15));
    document.getElementById('ccBtnZoomReset')?.addEventListener('click', () => { this._canvasScale = 1; this._canvasPan = { x: 0, y: 0 }; this._applyCanvasTransform(); this._renderEdges(); });
    document.getElementById('ccBtnRelayout')?.addEventListener('click', () => this._relayout());

    // Rueda → zoom anclado al cursor
    if (!this._canvasWheel) {
      this._canvasWheel = (e) => {
        // Scroll dentro del cuerpo de un nodo (campos / ads): no hacer zoom.
        if (e.target.closest('.cc-node-body, .cc-node-ads')) return;
        if (!e.ctrlKey && Math.abs(e.deltaY) < 1) return;
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        this._setZoom((this._canvasScale || 1) + dir * 0.12, { x: e.clientX, y: e.clientY });
      };
      canvas.addEventListener('wheel', this._canvasWheel, { passive: false });
    }

    // Re-pintar aristas si cambia el tamano del canvas
    if (!this._canvasResizeObs && typeof ResizeObserver !== 'undefined') {
      this._canvasResizeObs = new ResizeObserver(() => this._renderEdges());
      this._canvasResizeObs.observe(canvas);
    }

    // Delegacion: mousedown decide entre conectar / mover nodo / pan
    if (!this._canvasMouseDown) {
      this._canvasMouseDown = (e) => {
        if (e.button !== 0) return;
        const port = e.target.closest('.cc-node-port--out');
        if (port) { this._beginConnect(e, port); return; }

        // Controles editables y botones de accion: dejar que reciban el evento
        // nativo (focus / click), sin iniciar drag ni pan.
        if (e.target.closest('input, textarea, select, option, .cc-node-act, .cc-edge-disconnect')) return;

        const handle = e.target.closest('[data-drag-handle]');
        const nodeEl = e.target.closest('.cc-node');
        if (handle && nodeEl) { this._beginNodeDrag(e, nodeEl); return; }

        // Sobre un nodo (cuerpo) o una arista: no iniciar pan.
        if (nodeEl || e.target.closest('.cc-edge')) return;

        // Fondo vacio → pan.
        this._beginPan(e);
      };
      canvas.addEventListener('mousedown', this._canvasMouseDown);
    }

    // Click: colapsar / eliminar nodo.
    if (!this._canvasClick) {
      this._canvasClick = (e) => {
        const nodeEl = e.target.closest('.cc-node');
        if (!nodeEl) return;
        const key  = nodeEl.getAttribute('data-node-key');
        const type = nodeEl.getAttribute('data-type');
        const id   = nodeEl.getAttribute('data-id');
        if (e.target.closest('.cc-node-collapse')) {
          e.preventDefault(); e.stopPropagation();
          this._toggleCollapse(key, nodeEl);
          return;
        }
        if (e.target.closest('.cc-node-uncanvas')) {
          e.preventDefault(); e.stopPropagation();
          this._removeRealFromCanvas(id);
          return;
        }
        if (e.target.closest('.cc-node-expand-btn')) {
          e.preventDefault(); e.stopPropagation();
          this._toggleRealExpand(id, nodeEl);
          return;
        }
        if (e.target.closest('.cc-node-delete')) {
          e.preventDefault(); e.stopPropagation();
          const et = type === 'audience' ? 'audience' : 'campaign-concept';
          this._confirmAndDelete(et, id, null);
        }
      };
      canvas.addEventListener('click', this._canvasClick);
    }

    // Edicion inline: cada cambio de campo se guarda en BD (debounce).
    if (!this._canvasFieldEdit) {
      this._canvasFieldEdit = (e) => {
        const fieldEl = e.target.closest('[data-field]');
        if (!fieldEl) return;
        const nodeEl = fieldEl.closest('.cc-node');
        if (!nodeEl || nodeEl.getAttribute('data-type') === 'campaign-real') return;
        this._queueFieldSave(nodeEl, fieldEl, e.type === 'change');
      };
      canvas.addEventListener('input', this._canvasFieldEdit);
      canvas.addEventListener('change', this._canvasFieldEdit);
    }

    // Drag-and-drop: campana real del sidebar → canvas (como Segmind).
    const list = document.getElementById('ccCampList');
    if (list && !this._campDragStart) {
      this._campDragStart = (e) => {
        const row = e.target.closest('[data-camp-id]');
        if (!row) return;
        this._draggingCampId = row.getAttribute('data-camp-id');
        try { e.dataTransfer.setData('text/plain', this._draggingCampId); e.dataTransfer.effectAllowed = 'copy'; } catch (_) {}
        row.classList.add('cc-camp-row--dragging');
      };
      this._campDragEnd = (e) => {
        const row = e.target.closest('[data-camp-id]');
        if (row) row.classList.remove('cc-camp-row--dragging');
      };
      list.addEventListener('dragstart', this._campDragStart);
      list.addEventListener('dragend', this._campDragEnd);
    }
    if (!this._canvasDragOver) {
      this._canvasDragOver = (e) => {
        if (!this._draggingCampId) return;
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'copy'; } catch (_) {}
        canvas.classList.add('cc-canvas--droptarget');
        const audEl = this._audienceNodeAt(e.clientX, e.clientY);
        canvas.querySelectorAll('.cc-node--audience').forEach((n) => n.classList.remove('cc-node--drop-target'));
        if (audEl) audEl.classList.add('cc-node--drop-target');
      };
      this._canvasDragLeave = () => { canvas.classList.remove('cc-canvas--droptarget'); };
      this._canvasDrop = (e) => {
        const id = this._draggingCampId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
        canvas.classList.remove('cc-canvas--droptarget');
        canvas.querySelectorAll('.cc-node--audience').forEach((n) => n.classList.remove('cc-node--drop-target'));
        this._draggingCampId = null;
        if (!id) return;
        e.preventDefault();
        this._addRealToCanvas(id, e.clientX, e.clientY);
      };
      canvas.addEventListener('dragover', this._canvasDragOver);
      canvas.addEventListener('dragleave', this._canvasDragLeave);
      canvas.addEventListener('drop', this._canvasDrop);
    }
  };

  /** Colapsa/expande un nodo sin re-render completo (preserva foco/edicion). */
  P._toggleCollapse = function (key, nodeEl) {
    if (!this._collapsed) this._collapsed = new Set();
    const collapsed = this._collapsed.has(key);
    if (collapsed) this._collapsed.delete(key); else this._collapsed.add(key);
    nodeEl.classList.toggle('cc-node--collapsed', !collapsed);
    const ic = nodeEl.querySelector('.cc-node-collapse i');
    if (ic) ic.className = `fas fa-${!collapsed ? 'chevron-down' : 'chevron-up'}`;
    this._renderEdges();
  };

  /* ── Guardado inline por campo (debounce) ──────────────────────────── */
  P._queueFieldSave = function (nodeEl, fieldEl, immediate) {
    const type  = nodeEl.getAttribute('data-type');
    const id    = nodeEl.getAttribute('data-id');
    const field = fieldEl.getAttribute('data-field');
    if (!id || !field) return;
    const tkey = `${id}:${field}`;
    if (this._fieldSaveTimers[tkey]) clearTimeout(this._fieldSaveTimers[tkey]);
    const run = () => { delete this._fieldSaveTimers[tkey]; this._saveNodeField(type, id, fieldEl); };
    if (immediate) run();
    else this._fieldSaveTimers[tkey] = setTimeout(run, 600);
  };

  P._saveNodeField = async function (type, id, fieldEl) {
    if (!this._supabase) return;
    const field = fieldEl.getAttribute('data-field');
    const isAudience = type === 'audience';
    const table = isAudience ? 'audience_personas' : 'campaigns';
    const dataType = fieldEl.getAttribute('data-type');
    const multi    = fieldEl.getAttribute('data-multi');
    let val = fieldEl.value;
    if (multi === 'lines') {
      val = String(val || '').split('\n').map((s) => s.trim()).filter(Boolean);
    } else if (dataType === 'number') {
      val = val === '' ? null : Number(val);
      if (!Number.isFinite(val)) val = null;
    } else if (dataType === 'date') {
      val = val ? new Date(val + 'T00:00:00Z').toISOString() : null;
    } else {
      val = String(val ?? '').trim();
      if (val === '') val = null;
    }

    // Nombre obligatorio: no persistir vacio.
    const nameField = isAudience ? 'name' : 'nombre_campana';
    if (field === nameField && !val) { fieldEl.classList.add('cc-field--invalid'); return; }
    fieldEl.classList.remove('cc-field--invalid');

    // Estado local + payload.
    const arr = isAudience ? this._audiences : this._campaigns;
    const row = (arr || []).find((x) => String(x.id) === String(id));
    if (row) row[field] = val;

    fieldEl.classList.add('cc-field--saving');
    try {
      const { error } = await this._supabase
        .from(table)
        .update({ [field]: val, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      fieldEl.classList.remove('cc-field--saving');
      fieldEl.classList.add('cc-field--saved');
      setTimeout(() => fieldEl.classList.remove('cc-field--saved'), 900);
      if (field === nameField) this._renderMiniDash();
    } catch (e) {
      console.error('CommandCenter field save:', e);
      fieldEl.classList.remove('cc-field--saving');
      fieldEl.classList.add('cc-field--invalid');
    }
  };

  /** Pan del lienzo arrastrando el fondo. */
  P._beginPan = function (e) {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const p0 = { ...(this._canvasPan || { x: 0, y: 0 }) };
    const canvas = document.getElementById('ccCanvas');
    canvas?.classList.add('cc-canvas--panning');
    const onMove = (ev) => {
      this._canvasPan = { x: p0.x + (ev.clientX - start.x), y: p0.y + (ev.clientY - start.y) };
      this._applyCanvasTransform();
      this._renderEdges();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      canvas?.classList.remove('cc-canvas--panning');
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  /** Mover un nodo (header). Convierte delta de pantalla a delta de mundo /scale. */
  P._beginNodeDrag = function (e, nodeEl) {
    e.preventDefault(); e.stopPropagation();
    this._didDrag = false;
    const key = nodeEl.getAttribute('data-node-key');
    const start = { x: e.clientX, y: e.clientY };
    const base = this._positions[key] || { x: parseFloat(nodeEl.style.left) || 0, y: parseFloat(nodeEl.style.top) || 0 };
    const s = this._canvasScale || 1;
    nodeEl.classList.add('cc-node--dragging');
    const onMove = (ev) => {
      const dx = (ev.clientX - start.x) / s;
      const dy = (ev.clientY - start.y) / s;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._didDrag = true;
      const nx = base.x + dx, ny = base.y + dy;
      nodeEl.style.left = `${nx}px`;
      nodeEl.style.top  = `${ny}px`;
      this._positions[key] = { x: nx, y: ny };
      this._renderEdges();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      nodeEl.classList.remove('cc-node--dragging');
      this._savePositions();
      // reset flag tras el ciclo de click
      setTimeout(() => { this._didDrag = false; }, 0);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  /** Drag-to-connect desde el puerto de salida de una audiencia. */
  P._beginConnect = function (e, port) {
    e.preventDefault(); e.stopPropagation();
    const svg    = document.getElementById('ccCanvasEdges');
    const canvas = document.getElementById('ccCanvas');
    const nodeEl = port.closest('.cc-node');
    if (!svg || !canvas || !nodeEl) return;
    const audId = nodeEl.getAttribute('data-id');

    const cr = canvas.getBoundingClientRect();
    const pr = port.getBoundingClientRect();
    const startX = pr.left + pr.width / 2 - cr.left;
    const startY = pr.top + pr.height / 2 - cr.top;

    const preview = document.createElementNS(NS, 'path');
    preview.setAttribute('class', 'cc-edge-path cc-edge-path--preview');
    preview.setAttribute('fill', 'none');
    svg.appendChild(preview);
    canvas.classList.add('cc-canvas--connecting');

    const onMove = (ev) => {
      const x = ev.clientX - cr.left;
      const y = ev.clientY - cr.top;
      preview.setAttribute('d', this._bezier(startX, startY, x, y));
      canvas.querySelectorAll('.cc-node--campaign').forEach((n) => n.classList.remove('cc-node--drop-target'));
      const target = this._campaignNodeAt(ev.clientX, ev.clientY);
      if (target) target.classList.add('cc-node--drop-target');
    };
    const onUp = (ev) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      canvas.classList.remove('cc-canvas--connecting');
      canvas.querySelectorAll('.cc-node--campaign').forEach((n) => n.classList.remove('cc-node--drop-target'));
      preview.remove();
      const target = this._campaignNodeAt(ev.clientX, ev.clientY);
      if (target && audId) {
        const campId = target.getAttribute('data-id');
        if (campId) this._connectCampaignToPersona(campId, audId);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  /** Nodo campana bajo coords cliente (para drop de conexion). */
  P._campaignNodeAt = function (clientX, clientY) {
    const nodes = document.querySelectorAll('.cc-node--campaign');
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return n;
    }
    return null;
  };

  // ------------------------------------------------------------------
  // Mini-dashboard (stats + conteos)
  // ------------------------------------------------------------------
  P._renderMiniDash = function () {
    const statsEl = document.getElementById('ccMiniStats');
    const camps = Array.isArray(this._campaigns) ? this._campaigns : [];
    const auds  = Array.isArray(this._audiences) ? this._audiences : [];
    const real    = camps.filter((c) => c.last_synced_at).length;
    const concept = camps.length - real;
    const linked  = camps.filter((c) => c.persona_id).length;
    const unlinked = camps.length - linked;

    if (statsEl) {
      const stat = (n, label, cls) => `
        <div class="cc-mini-stat ${cls || ''}">
          <span class="cc-mini-stat-num">${n}</span>
          <span class="cc-mini-stat-label">${label}</span>
        </div>`;
      statsEl.innerHTML =
        stat(auds.length, 'Audiencias') +
        stat(real, 'Reales') +
        stat(concept, 'Conceptuales') +
        stat(linked, 'Vinculadas') +
        (unlinked > 0 ? stat(unlinked, 'Sin vincular', 'cc-mini-stat--warn') : '');
    }

    // El contador del header (ccCampCount) lo maneja _renderCampaigns
    // (refleja las campanas reales que estan FUERA del canvas).
  };

  // ------------------------------------------------------------------
  // Campanas reales: sidebar (fuera del canvas) + drag-and-drop al lienzo
  // ------------------------------------------------------------------
  /** Sidebar: lista de campanas reales que NO estan en el canvas, arrastrables. */
  P._renderCampaigns = function () {
    const list  = document.getElementById('ccCampList');
    const empty = document.getElementById('ccCampEmpty');
    const count = document.getElementById('ccCampCount');
    if (!list) return;
    this._loadOnCanvas();
    const reals = (this._campaigns || []).filter((c) => c.last_synced_at);
    const rows  = reals.filter((c) => !this._realOnCanvas(c));
    if (count) count.textContent = String(rows.length);

    if (!rows.length) {
      list.innerHTML = '';
      if (empty) {
        empty.style.display = 'flex';
        empty.innerHTML = reals.length === 0
          ? '<i class="fas fa-bullhorn"></i><span>Sin campanas sincronizadas. Conecta una integracion (Meta, Google, etc.).</span>'
          : '<i class="fas fa-circle-check"></i><span>Todas las campanas reales estan en el canvas. Quitalas desde el nodo para traerlas aqui.</span>';
      }
      return;
    }
    if (empty) empty.style.display = 'none';

    const platformLabel = { meta_instagram: 'Instagram', meta_facebook: 'Facebook', google_ads: 'Google Ads', tiktok_ads: 'TikTok', linkedin_ads: 'LinkedIn', pinterest_ads: 'Pinterest', organic: 'Organico', internal: 'Interno' };
    const fmt = (v) => { const n = Number(v); return Number.isFinite(n) ? (n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : n.toLocaleString('es-ES')) : '0'; };
    const fmtDate = (d) => { if (!d) return '—'; const t = new Date(d); return Number.isFinite(t.getTime()) ? t.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; };

    list.innerHTML = rows.map((c) => {
      const plat = platformLabel[c.platform] || (c.platform ? c.platform.replace(/_/g, ' ') : '');
      return `
      <div class="cc-camp-row" draggable="true" data-camp-id="${this.escapeHtml(String(c.id))}" title="Arrastra al canvas para conectarla">
        <div class="cc-camp-row-head">
          <span class="cc-camp-name">${this.escapeHtml(c.nombre_campana || 'Campana')}</span>
          <div class="cc-camp-badges">
            <span class="cc-badge cc-badge--yellow">${this.escapeHtml(c.status || 'draft')}</span>
            ${plat ? `<span class="cc-badge cc-badge--platform">${this.escapeHtml(plat)}</span>` : ''}
          </div>
        </div>
        <dl class="cc-camp-stats">
          <div class="cc-camp-stat"><dt>Publicada</dt><dd>${this.escapeHtml(fmtDate(c.starts_at || c.created_at))}</dd></div>
          <div class="cc-camp-stat"><dt>Resultados</dt><dd>${fmt(c.cached_conversions)}</dd></div>
          <div class="cc-camp-stat"><dt>Gastos</dt><dd>${fmt(c.cached_spend)} ${this.escapeHtml(c.budget_currency || '')}</dd></div>
        </dl>
        <span class="cc-camp-drag-hint"><i class="fas fa-arrows-up-down-left-right"></i> Arrastrar al canvas</span>
      </div>`;
    }).join('');
  };

  /** Coordenadas de mundo a partir de un punto en pantalla (invierte transform). */
  P._worldPointFromClient = function (clientX, clientY) {
    const canvas = document.getElementById('ccCanvas');
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    const s = this._canvasScale || 1;
    const p = this._canvasPan || { x: 0, y: 0 };
    return { x: (clientX - r.left - p.x) / s, y: (clientY - r.top - p.y) / s };
  };

  /** Pone una campana real en el canvas (drag desde el sidebar). Si se suelta
      sobre una audiencia, ademas crea el vinculo. */
  P._addRealToCanvas = function (campId, clientX, clientY) {
    const c = (this._campaigns || []).find((x) => String(x.id) === String(campId) && x.last_synced_at);
    if (!c) return;
    this._loadOnCanvas();
    this._onCanvas.add(String(campId));
    this._saveOnCanvas();
    // Posicion = punto de drop (centrado un poco a la izquierda del cursor).
    const w = this._worldPointFromClient(clientX, clientY);
    this._positions[`camp:${campId}`] = { x: Math.max(0, w.x - 120), y: Math.max(0, w.y - 20) };
    this._savePositions();
    // Si cayo sobre una audiencia, vincular.
    const audEl = this._audienceNodeAt(clientX, clientY);
    if (audEl) {
      const audId = audEl.getAttribute('data-id');
      if (audId) { this._connectCampaignToPersona(campId, audId); return; }
    }
    this._renderCanvas();
    this._renderMiniDash();
    this._renderCampaigns();
  };

  /** Quita una campana real del canvas (vuelve al sidebar). Si estaba
      vinculada, tambien la desvincula. */
  P._removeRealFromCanvas = function (campId) {
    this._loadOnCanvas();
    this._onCanvas.delete(String(campId));
    this._saveOnCanvas();
    const c = (this._campaigns || []).find((x) => String(x.id) === String(campId));
    if (c && c.persona_id) { this._disconnectCampaign(campId); }  // re-render incluido
    else { this._renderCanvas(); this._renderCampaigns(); this._renderMiniDash(); }
  };

  /** Nodo audiencia bajo coords cliente (para drop de campana real). */
  P._audienceNodeAt = function (clientX, clientY) {
    const nodes = document.querySelectorAll('.cc-node--audience');
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return n;
    }
    return null;
  };

  // ------------------------------------------------------------------
  // Nodo real expandible: conjuntos (ad sets) + ads (copys, headlines)
  // Fuente: ad_insights_daily (metricas por external_ad_id/external_adset_id)
  // + runs_outputs (copy generado, vinculado por external_ad_id).
  // ------------------------------------------------------------------
  P._toggleRealExpand = async function (campId, nodeEl) {
    if (!this._expandedReal) this._expandedReal = new Set();
    const key = String(campId);
    const expanding = !this._expandedReal.has(key);
    if (expanding) this._expandedReal.add(key); else this._expandedReal.delete(key);

    nodeEl.classList.toggle('cc-node--expanded', expanding);
    const btn = nodeEl.querySelector('.cc-node-expand-btn');
    const cont = nodeEl.querySelector('.cc-node-ads');
    if (btn) btn.innerHTML = `<i class="fas fa-chevron-${expanding ? 'up' : 'down'}"></i><span>${expanding ? 'Ocultar conjuntos y ads' : 'Ver conjuntos y ads'}</span>`;
    if (!cont) return;

    if (!expanding) { cont.style.display = 'none'; cont.innerHTML = ''; this._renderEdges(); return; }
    cont.style.display = '';

    const cached = this._adData[key];
    if (cached) { cont.innerHTML = this._adsHTML(campId); this._renderEdges(); return; }

    cont.innerHTML = '<div class="cc-ads-loading"><i class="fas fa-spinner fa-spin"></i> Cargando conjuntos y ads…</div>';
    this._renderEdges();
    await this._fetchCampaignAds(campId);
    // El nodo pudo re-renderizarse; re-localizar el contenedor por id.
    const cont2 = document.querySelector(`.cc-node-ads[data-ads-for="${cssEsc(key)}"]`);
    if (cont2 && this._expandedReal.has(key)) { cont2.style.display = ''; cont2.innerHTML = this._adsHTML(campId); }
    this._renderEdges();
  };

  P._fetchCampaignAds = async function (campId) {
    const key = String(campId);
    if (this._adData[key]) return this._adData[key];
    if (!this._supabase) { this._adData[key] = { adsets: [], error: 'sin conexion' }; return this._adData[key]; }
    try {
      const [insRes, outRes] = await Promise.all([
        this._supabase
          .from('ad_insights_daily')
          .select('external_ad_id, external_adset_id, impressions, clicks, spend, conversions, raw_payload')
          .eq('campaign_id', campId)
          .limit(2000),
        this._supabase
          .from('runs_outputs')
          .select('external_ad_id, generated_copy, creative_rationale')
          .eq('campaign_id', campId)
          .not('external_ad_id', 'is', null)
          .limit(500),
      ]);
      const ins = (!insRes.error && Array.isArray(insRes.data)) ? insRes.data : [];
      const outs = (!outRes.error && Array.isArray(outRes.data)) ? outRes.data : [];

      // Copy por external_ad_id (primer match no vacio).
      const copyByAd = {};
      outs.forEach((o) => {
        const aid = String(o.external_ad_id);
        if (!copyByAd[aid] && (o.generated_copy || o.creative_rationale)) {
          copyByAd[aid] = { copy: o.generated_copy || '', rationale: o.creative_rationale || '' };
        }
      });

      // Agregar por adset → ad (sumar metricas; tomar nombre del raw_payload).
      const adsetMap = new Map();
      ins.forEach((r) => {
        const adsetId = r.external_adset_id || 'sin-conjunto';
        const adId    = r.external_ad_id || 'sin-ad';
        const rp = (r.raw_payload && typeof r.raw_payload === 'object') ? r.raw_payload : {};
        const adsetName = rp.adset_name || rp.adset || null;
        const adName    = rp.ad_name || rp.name || null;
        const title     = rp.title || rp.headline || (rp.creative && rp.creative.title) || null;
        const body      = rp.body || rp.message || (rp.creative && rp.creative.body) || null;

        if (!adsetMap.has(adsetId)) adsetMap.set(adsetId, { id: adsetId, name: adsetName, ads: new Map(), spend: 0, conv: 0, impr: 0, clicks: 0 });
        const aset = adsetMap.get(adsetId);
        if (adsetName && !aset.name) aset.name = adsetName;
        if (!aset.ads.has(adId)) aset.ads.set(adId, { id: adId, name: adName, title, body, spend: 0, conv: 0, impr: 0, clicks: 0 });
        const ad = aset.ads.get(adId);
        if (adName && !ad.name) ad.name = adName;
        if (title && !ad.title) ad.title = title;
        if (body && !ad.body) ad.body = body;
        const add = (k, v) => { const x = Number(v) || 0; ad[k] += x; aset[k] += x; };
        add('spend', r.spend); add('conv', r.conversions); add('impr', r.impressions); add('clicks', r.clicks);
      });

      const adsets = [...adsetMap.values()].map((a) => ({
        ...a,
        ads: [...a.ads.values()].map((ad) => ({ ...ad, copy: copyByAd[String(ad.id)]?.copy || '', rationale: copyByAd[String(ad.id)]?.rationale || '' }))
                                 .sort((x, y) => y.spend - x.spend),
      })).sort((x, y) => y.spend - x.spend);

      this._adData[key] = { adsets };
    } catch (e) {
      console.warn('CommandCenter fetchCampaignAds:', e?.message);
      this._adData[key] = { adsets: [], error: e?.message || 'error' };
    }
    return this._adData[key];
  };

  P._adsHTML = function (campId) {
    const data = this._adData[String(campId)];
    if (!data) return '';
    if (data.error) return `<div class="cc-ads-empty"><i class="fas fa-triangle-exclamation"></i> No se pudieron cargar los ads (${this.escapeHtml(String(data.error))}).</div>`;
    if (!data.adsets.length) return '<div class="cc-ads-empty"><i class="fas fa-circle-info"></i> Sin datos de ads para esta campana todavia.</div>';
    const fmt = (v) => { const n = Number(v); return Number.isFinite(n) ? (n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : n.toLocaleString('es-ES')) : '0'; };
    const shortId = (id) => { const s = String(id || ''); return s.length > 10 ? '…' + s.slice(-8) : s; };

    return data.adsets.map((aset) => `
      <div class="cc-adset">
        <div class="cc-adset-head">
          <i class="fas fa-layer-group"></i>
          <span class="cc-adset-name">${this.escapeHtml(aset.name || (aset.id === 'sin-conjunto' ? 'Conjunto' : shortId(aset.id)))}</span>
          <span class="cc-adset-meta">${aset.ads.length} ad${aset.ads.length === 1 ? '' : 's'} · ${fmt(aset.spend)} gasto · ${fmt(aset.conv)} result.</span>
        </div>
        <div class="cc-ad-list">
          ${aset.ads.map((ad) => `
            <div class="cc-ad">
              <div class="cc-ad-head"><i class="fas fa-image"></i><span class="cc-ad-name">${this.escapeHtml(ad.name || shortId(ad.id))}</span></div>
              ${ad.title ? `<div class="cc-ad-headline">${this.escapeHtml(ad.title)}</div>` : ''}
              ${ad.body || ad.copy ? `<div class="cc-ad-copy">${this.escapeHtml(ad.body || ad.copy)}</div>` : ''}
              <div class="cc-ad-stats"><span>${fmt(ad.impr)} impr.</span><span>${fmt(ad.clicks)} clics</span><span>${fmt(ad.spend)} gasto</span><span>${fmt(ad.conv)} result.</span></div>
            </div>`).join('')}
        </div>
      </div>`).join('');
  };

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------
  const _origDestroy = P.destroy;
  P.destroy = function () {
    const canvas = document.getElementById('ccCanvas');
    const list   = document.getElementById('ccCampList');
    if (this._canvasResizeObs) { try { this._canvasResizeObs.disconnect(); } catch (_) {} this._canvasResizeObs = null; }
    if (canvas && this._canvasWheel)     { canvas.removeEventListener('wheel', this._canvasWheel); this._canvasWheel = null; }
    if (canvas && this._canvasMouseDown) { canvas.removeEventListener('mousedown', this._canvasMouseDown); this._canvasMouseDown = null; }
    if (canvas && this._canvasClick)     { canvas.removeEventListener('click', this._canvasClick); this._canvasClick = null; }
    if (canvas && this._canvasFieldEdit) { canvas.removeEventListener('input', this._canvasFieldEdit); canvas.removeEventListener('change', this._canvasFieldEdit); this._canvasFieldEdit = null; }
    if (canvas && this._canvasDragOver)  { canvas.removeEventListener('dragover', this._canvasDragOver); canvas.removeEventListener('dragleave', this._canvasDragLeave); canvas.removeEventListener('drop', this._canvasDrop); this._canvasDragOver = null; }
    if (list && this._campDragStart)     { list.removeEventListener('dragstart', this._campDragStart); list.removeEventListener('dragend', this._campDragEnd); this._campDragStart = null; }
    if (typeof _origDestroy === 'function') _origDestroy.call(this);
  };

  /** Escapa un valor para usarlo dentro de un selector de atributo. */
  function cssEsc(v) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(v);
    return String(v).replace(/["\\\]]/g, '\\$&');
  }
})();
