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
  const MAX_TAGS = 8;     // tope por campo array (no sobresaturar al LLM)
  const ID_TYPES = ['products', 'services', 'places', 'characters', 'flows', 'briefs']; // identities

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

  /* ── Identities colocadas en el canvas (productos/servicios/.../briefs) ─ */
  P._placedKey = function () { return `cc:canvas:placed:${this._containerRow?.id || 'unknown'}`; };
  P._loadPlaced = function () {
    try {
      const raw = localStorage.getItem(this._placedKey());
      this._placed = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
    } catch (_) { this._placed = []; }
    return this._placed;
  };
  P._savePlaced = function () {
    try { localStorage.setItem(this._placedKey(), JSON.stringify(this._placed || [])); } catch (_) { /* noop */ }
  };

  /* ── Links libres (visual, localStorage) ────────────────────────────── */
  P._linksKey = function () { return `cc:canvas:links:${this._containerRow?.id || 'unknown'}`; };
  P._loadLinks = function () {
    try {
      const arr = JSON.parse(localStorage.getItem(this._linksKey()));
      this._links = Array.isArray(arr) ? arr : [];
    } catch (_) { this._links = []; }
    return this._links;
  };
  P._saveLinks = function () {
    try { localStorage.setItem(this._linksKey(), JSON.stringify(this._links || [])); } catch (_) { /* noop */ }
  };
  /** Todos los links a dibujar: persona_id (BD) + libres (localStorage), deduplicados. */
  P._allLinks = function () {
    if (!this._links) this._loadLinks();
    const present = new Set(this._canvasNodes().map((n) => n.key));
    const out = [];
    const seen = new Set();
    const push = (from, to, persona) => {
      if (!present.has(from) || !present.has(to) || from === to) return;
      const k = `${from}->${to}`;
      if (seen.has(k)) return; seen.add(k);
      out.push({ from, to, persona: !!persona });
    };
    // persona_id: audiencia -> campana (audiencia primaria)
    (this._campaigns || []).forEach((c) => { if (c.persona_id) push(`aud:${c.persona_id}`, `camp:${c.id}`, true); });
    // audience_segments: N audiencias por campana (relacion real, dedupe con persona_id por la clave from->to)
    (this._segments || []).forEach((s) => { if (s.persona_id && s.campaign_id) push(`aud:${s.persona_id}`, `camp:${s.campaign_id}`, true); });
    // campaigns.brief_id: campana -> brief (si el brief esta colocado en el canvas)
    (this._campaigns || []).forEach((c) => { if (c.brief_id) push(`camp:${c.id}`, `briefs:${c.brief_id}`, false); });
    // campaign_brief_entities: entidad -> brief (mapa entity_id -> nodo colocado)
    (this._briefEntities || []).forEach((be) => {
      const nodeKey = this._entByEntityId && this._entByEntityId[be.entity_id];
      if (nodeKey && be.brief_id) push(nodeKey, `briefs:${be.brief_id}`, false);
    });
    // libres
    (this._links || []).forEach((l) => push(l.from, l.to, false));
    return out;
  };

  /** Lista normalizada de nodos del canvas: audiencias + campanas (en canvas)
      + identities colocadas. */
  P._canvasNodes = function () {
    this._loadOnCanvas();
    this._loadPlaced();
    const auds = (this._audiences || []).map((a) => ({
      key: `aud:${a.id}`, type: 'audience', id: a.id, row: a,
    }));
    const camps = (this._campaigns || [])
      .filter((c) => (c.last_synced_at ? this._realOnCanvas(c) : true))
      .map((c) => ({
        key: `camp:${c.id}`, type: c.last_synced_at ? 'campaign-real' : 'campaign-concept',
        id: c.id, row: c,
      }));
    const ids = (this._placed || []).map((p) => ({
      key: `${p.type}:${p.id}`, type: 'identity', identityType: p.type, id: p.id, row: p,
    }));
    return [...auds, ...camps, ...ids];
  };

  /** Posicion de un nodo; si falta, calcula auto-layout por columnas y la fija. */
  P._posFor = function (node, audIdx, campIdx, idIdx) {
    const pos = this._positions[node.key];
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) return pos;
    // Layout default en ARBOL (rework 2026-06-11): trigger arriba; audiencia +
    // entidades como ingredientes abajo; produccion (brief/flow) + cierre a la derecha.
    const TOP = ROW_TOP;
    const it = node.identityType;
    const isProdId = it === 'flows' || it === 'briefs';
    let x, y;
    if (node.type === 'campaign-concept')      { x = 360 + campIdx * 380; y = TOP; }
    else if (node.type === 'campaign-real')    { x = 1180; y = TOP + 300 + campIdx * 180; }
    else if (node.type === 'audience')         { x = 40 + audIdx * 300; y = TOP + 280; }
    else if (node.type === 'identity' && isProdId) { x = 800 + idIdx * 300; y = TOP + 60; }
    else                                       { x = 40 + idIdx * 300; y = TOP + 520; }
    const next = { x, y };
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

    // Precarga (una vez) las relaciones reales brief↔entidad + mapa entity_id.
    if (!this._stratRelLoaded) { this._stratRelLoaded = true; this._loadStrategyRelations(); }

    this._loadPositions();
    const nodes = this._canvasNodes();

    if (!nodes.length) {
      world.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      this._renderEdges();
      return;
    }
    if (empty) empty.style.display = 'none';

    let audIdx = 0, campIdx = 0, idIdx = 0;
    world.innerHTML = nodes.map((n) => {
      const pos = this._posFor(n, audIdx, campIdx, idIdx);
      if (n.type === 'audience') audIdx++; else if (n.type === 'identity') idIdx++; else campIdx++;
      if (n.type === 'audience') return this._nodeAudienceHTML(n, pos);
      if (n.type === 'identity') return this._nodeIdentityHTML(n, pos);
      return this._nodeCampaignHTML(n, pos);
    }).join('');

    this._applyCanvasTransform();
    this._anchorCacheW = {}; // full re-render: anclas cacheadas quedan invalidas
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

  /** Editor de array tipo chips/tags con tope (no sobresaturar al LLM). */
  P._fieldTags = function (label, field, arr, max) {
    const items = Array.isArray(arr) ? arr.filter(Boolean) : [];
    const m = max || MAX_TAGS;
    const atMax = items.length >= m;
    const chips = items.map((v) =>
      `<span class="cc-tag" data-val="${this.escapeHtml(v)}">${this.escapeHtml(v)}<button type="button" class="cc-tag-x" aria-label="Quitar">&times;</button></span>`).join('');
    return `
      <div class="cc-field cc-field--tags" data-field-tags="${field}" data-max="${m}">
        <div class="cc-field-head"><span class="cc-field-label">${this.escapeHtml(label)}</span><span class="cc-field-count ${atMax ? 'is-max' : ''}">${items.length}/${m}</span></div>
        <div class="cc-tags">
          ${chips}
          <input class="cc-tag-input" type="text" placeholder="${atMax ? 'Limite alcanzado' : 'Escribe y Enter'}" ${atMax ? 'disabled' : ''} />
        </div>
      </div>`;
  };

  /** Rango de edades: dos inputs numericos en una fila. */
  P._fieldAgeRange = function (minV, maxV) {
    const mv = (minV == null || minV === '') ? '' : String(minV);
    const xv = (maxV == null || maxV === '') ? '' : String(maxV);
    return `
      <div class="cc-field">
        <div class="cc-field-head"><span class="cc-field-label">Rango de edades</span><span class="cc-field-type">int</span></div>
        <div class="cc-field-row">
          <input class="cc-field-input" data-field="target_age_min" data-type="number" type="number" min="13" max="99" value="${mv}" placeholder="Min" />
          <span class="cc-field-row-sep">–</span>
          <input class="cc-field-input" data-field="target_age_max" data-type="number" type="number" min="13" max="99" value="${xv}" placeholder="Max" />
        </div>
      </div>`;
  };

  /** Objetivos de genero: checkboxes multi (vacio = todos). */
  P._fieldGenders = function (genders) {
    const set = new Set(Array.isArray(genders) ? genders.map(String) : []);
    const opt = (val, lbl) => `<label class="cc-check"><input type="checkbox" data-field="target_genders" data-multi="checks" value="${val}" ${set.has(val) ? 'checked' : ''} /> ${lbl}</label>`;
    return `
      <div class="cc-field">
        <div class="cc-field-head"><span class="cc-field-label">Objetivos de genero</span><span class="cc-field-type">array</span></div>
        <div class="cc-checks">${opt('male', 'Hombres')}${opt('female', 'Mujeres')}<span class="cc-checks-hint">${set.size ? '' : 'vacio = todos'}</span></div>
      </div>`;
  };

  P._nodeAudienceHTML = function (n, pos) {
    const a = n.row;
    const off = a.is_active === false;
    const featured = !!a.is_featured;
    const aw = { unaware: 'Unaware', problem_aware: 'Problem aware', solution_aware: 'Solution aware', product_aware: 'Product aware', most_aware: 'Most aware' }[a.awareness_level] || '';
    const age = (a.target_age_min || a.target_age_max) ? `${a.target_age_min || '?'}–${a.target_age_max || '?'}` : '';
    const chips = `${age ? `<span class="cc-node-chip">${this.escapeHtml(age)}</span>` : ''}${aw ? `<span class="cc-node-chip">${this.escapeHtml(aw)}</span>` : ''}`;
    return `
    <div class="cc-node cc-node--audience cc-node--mini ${off ? 'cc-node--off' : ''} ${featured ? 'cc-node--featured' : ''}" data-node-key="${n.key}" data-type="audience" data-id="${this.escapeHtml(String(n.id))}" style="left:${pos.x}px;top:${pos.y}px;">
      <span class="cc-node-port cc-node-port--in" data-port="in" title="Entrada"></span>
      <div class="cc-node-head" data-drag-handle>
        <span class="cc-node-icon"><i class="fas fa-users"></i></span>
        <div class="cc-node-head-text">
          <span class="cc-node-title">Audiencia</span>
          <span class="cc-node-name" title="${this.escapeHtml(a.name || '')}">${this.escapeHtml(a.name || 'Sin nombre')}</span>
        </div>
        <span class="cc-node-status ${off ? 'is-off' : 'is-on'}" title="${off ? 'Apagada' : 'Activa'}"></span>
      </div>
      ${chips ? `<div class="cc-node-body cc-node-body--mini"><div class="cc-node-chips">${chips}</div></div>` : ''}
      <span class="cc-node-port cc-node-port--out" data-port="out" title="Arrastra para conectar"></span>
    </div>`;
  };

  /* ── Nodo identity (producto/servicio/lugar/flow/brief): conexion libre ─ */
  P._nodeIdentityHTML = function (n, pos) {
    const r = n.row || {};
    const labels = { products: __('Producto'), services: __('Servicio'), places: __('Lugar'), characters: __('Personaje'), flows: 'Flow', briefs: 'Brief' };
    const icons  = { products: 'fa-box', services: 'fa-tag', places: 'fa-map-pin', characters: 'fa-masks-theater', flows: 'fa-diagram-project', briefs: 'fa-file-lines' };
    const t = n.identityType;
    return `
    <div class="cc-node cc-node--identity" data-node-key="${n.key}" data-type="identity" data-identity-type="${this.escapeHtml(t)}" data-id="${this.escapeHtml(String(n.id))}" style="left:${pos.x}px;top:${pos.y}px;">
      <span class="cc-node-port cc-node-port--in" data-port="in" title="Entrada"></span>
      ${t === 'briefs'
        ? '<span class="cc-node-port cc-node-port--bl" data-port="bl" title="Identidades"></span><span class="cc-node-port cc-node-port--br" data-port="br" title="Identidades"></span>'
        : ''}
      <div class="cc-node-head" data-drag-handle>
        <span class="cc-node-icon"><i class="fas ${icons[t] || 'fa-cube'}"></i></span>
        <span class="cc-node-title">${this.escapeHtml(labels[t] || 'Identity')}</span>
        <div class="cc-node-actions">
          <button type="button" class="cc-node-act cc-node-uncanvas" title="Quitar del canvas"><i class="fas fa-eye-slash"></i></button>
        </div>
      </div>
      <div class="cc-node-body">
        <div class="cc-node-realname" title="${this.escapeHtml(r.name || '')}">${this.escapeHtml(r.name || labels[t] || 'Identity')}</div>
        ${r.sub ? `<span class="cc-node-meta">${this.escapeHtml(r.sub)}</span>` : ''}
      </div>
      <span class="cc-node-port cc-node-port--out" data-port="out" title="Arrastra para conectar"></span>
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
      // Rediseno F2: card limpio, sin metricas in-card. Metricas en el inspector.
      // Al expandir, los conjuntos+anuncios spawn como nodos satelite externos
      // (renderizados por _renderCampaignSatellites tras _renderCanvas).
      const platLabel = platformLabel[c.platform] || (c.platform ? c.platform.replace(/_/g, ' ') : '');
      const expanded = this._expandedReal && this._expandedReal.has(String(n.id));
      const synced = c.metrics_cached_at || c.last_synced_at;
      const syncTitle = synced ? `Sincronizado: ${new Date(synced).toLocaleString('es-ES')}` : 'Pendiente sync';
      return `
    <div class="cc-node cc-node--campaign cc-node--readonly cc-node--campaign-v2 ${expanded ? 'cc-node--expanded' : ''}" data-node-key="${n.key}" data-type="campaign-real" data-id="${this.escapeHtml(String(n.id))}" style="left:${pos.x}px;top:${pos.y}px;">
      <span class="cc-node-port cc-node-port--in ${linked ? 'cc-node-port--linked' : ''}" data-port="in" title="Audiencia objetivo"></span>
      <div class="cc-node-head" data-drag-handle>
        <span class="cc-node-icon cc-node-icon--camp cc-node-icon--hero"><i class="fas fa-bullhorn"></i></span>
        <div class="cc-node-head-text">
          <span class="cc-node-title">Campana</span>
          <span class="cc-node-realname" title="${this.escapeHtml(c.nombre_campana || 'Campana')}">${this.escapeHtml(c.nombre_campana || 'Sin nombre')}</span>
        </div>
        <div class="cc-node-actions">
          <span class="cc-node-sync ${synced ? 'is-synced' : ''}" title="${this.escapeHtml(syncTitle)}"><i class="fas fa-arrows-rotate"></i></span>
          <button type="button" class="cc-node-act cc-node-uncanvas" title="Quitar del canvas"><i class="fas fa-eye-slash"></i></button>
        </div>
      </div>
      <div class="cc-node-body cc-node-body--lean">
        <div class="cc-node-pills">
          ${platLabel ? `<span class="cc-node-pill cc-node-pill--plat">${this.escapeHtml(platLabel)}</span>` : ''}
          ${c.status ? `<span class="cc-node-pill cc-node-pill--status cc-node-pill--${this.escapeHtml(c.status)}">${this.escapeHtml(c.status)}</span>` : ''}
          ${linkedName ? `<span class="cc-node-pill cc-node-pill--linked" title="Objetivo de Audiencia: ${this.escapeHtml(linkedName)}"><i class="fas fa-link"></i></span>` : ''}
        </div>
      </div>
      <span class="cc-node-port cc-node-port--out" data-port="out" title="Arrastra para conectar"></span>
    </div>`;
    }

    // Objetivo de Campana: ANCLA. Nodo minimalista; todos los campos se editan
    // en el inspector derecho al seleccionarlo.
    const statusLabel = { draft: 'Borrador', conceptual: 'Conceptual', active: 'Activa', paused: 'Pausada', ended: 'Finalizada', archived: 'Archivada' }[c.status] || '';
    const platLabelC = platformLabel[c.platform] || '';
    const chipsC = `${statusLabel ? `<span class="cc-node-chip cc-node-chip--status cc-node-chip--${this.escapeHtml(c.status)}">${this.escapeHtml(statusLabel)}</span>` : ''}${platLabelC ? `<span class="cc-node-chip">${this.escapeHtml(platLabelC)}</span>` : ''}${linked ? `<span class="cc-node-chip cc-node-chip--link" title="Audiencia: ${this.escapeHtml(linkedName)}"><i class="fas fa-link"></i></span>` : ''}`;
    return `
    <div class="cc-node cc-node--campaign cc-node--anchor cc-node--mini" data-node-key="${n.key}" data-type="campaign-concept" data-id="${this.escapeHtml(String(n.id))}" style="left:${pos.x}px;top:${pos.y}px;">
      <span class="cc-node-port cc-node-port--in ${linked ? 'cc-node-port--linked' : ''}" data-port="in" title="Audiencias"></span>
      <div class="cc-node-head" data-drag-handle>
        <span class="cc-node-icon cc-node-icon--anchor"><i class="fas fa-bullseye"></i></span>
        <div class="cc-node-head-text">
          <span class="cc-node-title">Campana</span>
          <span class="cc-node-name" title="${this.escapeHtml(c.nombre_campana || '')}">${this.escapeHtml(c.nombre_campana || 'Sin nombre')}</span>
        </div>
        <span class="cc-node-status cc-node-status--${this.escapeHtml(c.status || 'draft')}" title="${this.escapeHtml(statusLabel || 'Borrador')}"></span>
      </div>
      ${chipsC ? `<div class="cc-node-body cc-node-body--mini"><div class="cc-node-chips">${chipsC}</div></div>` : ''}
      <span class="cc-node-port cc-node-port--out" data-port="out" title="Arrastra para conectar"></span>
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
    const tf = `translate(${p.x}px, ${p.y}px) scale(${s})`;
    world.style.transform = tf;
    world.style.transformOrigin = '0 0';
    // Arquitectura n8n/Vue Flow: el SVG de edges comparte EXACTAMENTE el mismo
    // transform que el mundo y sus paths viven en coordenadas de MUNDO. Pan y
    // zoom mueven las lineas gratis (un solo CSS transform), sin recalcular.
    const edges = document.getElementById('ccCanvasEdges');
    if (edges) { edges.style.transform = tf; edges.style.transformOrigin = '0 0'; }
    // Compensacion de zoom (patron n8n): grosor de linea ~constante en pantalla.
    const canvas = document.getElementById('ccCanvas');
    if (canvas) canvas.style.setProperty('--cc-zoom-comp', String(Math.min(2.4, Math.max(0.5, 1 / s))));
    this._updateLOD();
    this._cullNodes();
    this._drawMinimap();
  };

  /** Level-of-detail: al alejar, oculta glow + cuerpo de los nodos (solo header)
      para que el lienzo no se sature ni penalice el paint. */
  P._updateLOD = function () {
    const canvas = document.getElementById('ccCanvas');
    if (!canvas) return;
    canvas.classList.toggle('cc-canvas--far', (this._canvasScale || 1) < 0.42);
  };

  /** Viewport culling (patron tldraw): oculta nodos fuera de vista via display,
      sin re-render. Calcula desde posiciones en mundo (sin getBoundingClientRect
      por nodo). Nunca oculta el seleccionado / en focus / arrastrando. */
  P._cullNodes = function () {
    const canvas = document.getElementById('ccCanvas');
    const world  = document.getElementById('ccCanvasWorld');
    if (!canvas || !world) return;
    const r = canvas.getBoundingClientRect();
    const s = this._canvasScale || 1;
    const p = this._canvasPan || { x: 0, y: 0 };
    const MARGIN = 320, NW = 360, NH = 760;
    const vx0 = (-p.x) / s - MARGIN, vy0 = (-p.y) / s - MARGIN;
    const vx1 = (r.width - p.x) / s + MARGIN, vy1 = (r.height - p.y) / s + MARGIN;
    let revealed = false;
    world.querySelectorAll('.cc-node').forEach((n) => {
      const key = n.getAttribute('data-node-key');
      const pos = this._positions[key];
      if (!pos) { n.style.display = ''; return; }
      const visible = pos.x < vx1 && pos.x + NW > vx0 && pos.y < vy1 && pos.y + NH > vy0;
      const keep = visible || key === this._selectedKey ||
        (this._focusSet && this._focusSet.has(key)) || n.classList.contains('cc-node--dragging');
      const next = keep ? '' : 'none';
      if (n.style.display !== next) {
        if (next === '') revealed = true; // nodo re-entra al viewport
        n.style.display = next;
      }
    });
    // Un nodo revelado pudo moverse (remoto) mientras estaba culled y su arista
    // usa la ancla cacheada → refrescar geometria (rAF-batched, solo al toggle).
    if (revealed) this._scheduleEdges?.();
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
    // Solo transform: los edges viven en coords de mundo y siguen el zoom solos.
    this._applyCanvasTransform();
  };

  // ------------------------------------------------------------------
  // Aristas (SVG en coords de MUNDO — comparte el transform del world)
  // ------------------------------------------------------------------
  P._bezier = function (x1, y1, x2, y2) {
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  /** Path de una arista (patron n8n): bezier normal, pero si la conexion de
      FLUJO va "hacia atras" (target a la izquierda del source) se rutea por
      DEBAJO con dos cubicas para no atravesar los nodos. */
  P._edgePath = function (from, to, isProduction) {
    if (isProduction && to.x < from.x - 30) {
      const my = Math.max(from.y, to.y) + 130;
      const mx = (from.x + to.x) / 2;
      return `M ${from.x} ${from.y} C ${from.x + 80} ${from.y}, ${from.x + 80} ${my}, ${mx} ${my} ` +
             `C ${to.x - 80} ${my}, ${to.x - 80} ${to.y}, ${to.x} ${to.y}`;
    }
    return this._bezier(from.x, from.y, to.x, to.y);
  };

  /** Convierte un punto en coords de cliente a coords de MUNDO usando el
      canvasRect cacheado del frame (evita re-leer getBoundingClientRect). */
  P._clientToWorld = function (clientX, clientY, canvasRect) {
    const cr = canvasRect || document.getElementById('ccCanvas')?.getBoundingClientRect();
    if (!cr) return { x: clientX, y: clientY };
    const s = this._canvasScale || 1;
    const p = this._canvasPan || { x: 0, y: 0 };
    return { x: (clientX - cr.left - p.x) / s, y: (clientY - cr.top - p.y) / s };
  };

  /** Centro de un puerto en coords de MUNDO. */
  P._portCenter = function (nodeKey, portSel, canvasRect) {
    const node = document.querySelector(`.cc-node[data-node-key="${cssEsc(nodeKey)}"]`);
    if (!node) return null;
    if (node.style.display === 'none' || node.offsetParent === null) return null; // nodo culled
    const port = node.querySelector(portSel) || node;
    const pr = port.getBoundingClientRect();
    return this._clientToWorld(pr.left + pr.width / 2, pr.top + pr.height / 2, canvasRect);
  };

  /** Ancla de arista en coords de MUNDO (rediseno n8n 2026-07-02).
      - role 'from' → prefiere el puerto de SALIDA (out/br/bl); role 'to' →
        prefiere el de ENTRADA (in). Igual que n8n: main-out derecha, main-in
        izquierda. Los adjuntos (sin role o sin ese puerto) caen al puerto
        VISIBLE mas cercano al otro nodo (comportamiento previo).
      - Cachea el resultado por nodo para que las aristas de nodos CULLED
        (display:none fuera de viewport) sigan dibujandose donde corresponde
        (n8n tambien dibuja edges de nodos fuera de pantalla). */
  P._portAnchor = function (nodeKey, towardKey, canvasRect, role) {
    if (!this._anchorCacheW) this._anchorCacheW = {};
    const cacheKey = `${nodeKey}|${role || ''}|${towardKey || ''}`;
    const node = document.querySelector(`.cc-node[data-node-key="${cssEsc(nodeKey)}"]`);
    if (!node || node.style.display === 'none' || node.offsetParent === null) {
      // Culled → ultima ancla conocida; sin cache, aproximar desde la posicion
      // de mundo (el edge existe aunque el nodo este fuera de pantalla; se
      // ajusta exacto cuando el nodo se revela — ver _cullNodes).
      if (this._anchorCacheW[cacheKey]) return this._anchorCacheW[cacheKey];
      const pos = this._positions && this._positions[nodeKey];
      return pos ? { x: pos.x + 134, y: pos.y + 48 } : null;
    }
    const centerW = (el) => {
      const r = el.getBoundingClientRect();
      return this._clientToWorld(r.left + r.width / 2, r.top + r.height / 2, canvasRect);
    };
    const finish = (pt) => { if (pt) this._anchorCacheW[cacheKey] = pt; return pt; };

    // 1) Semantica n8n: from→out, to→in (solo si el puerto existe y es visible).
    if (role) {
      const sel = role === 'from' ? '[data-port="out"], [data-port="br"], [data-port="bl"]' : '[data-port="in"]';
      const pref = node.querySelector(sel);
      if (pref && pref.offsetParent !== null) return finish(centerW(pref));
    }

    // 2) Fallback: puerto visible mas cercano al otro nodo.
    let tx = null, ty = null;
    const toward = document.querySelector(`.cc-node[data-node-key="${cssEsc(towardKey)}"]`);
    if (toward && toward.offsetParent !== null) { const tc = centerW(toward); tx = tc.x; ty = tc.y; }
    const ports = node.querySelectorAll('.cc-node-port');
    if (!ports.length) return finish(centerW(node));
    let best = null, bestD = Infinity;
    ports.forEach((p) => {
      if (p.offsetParent === null) return; // puerto oculto (display:none)
      const c = centerW(p);
      if (tx == null) { if (!best) best = c; return; }
      const d = (c.x - tx) ** 2 + (c.y - ty) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    });
    return finish(best || centerW(node));
  };

  /** Cables monocromos: sin color de tipo (rediseno monocromo). */
  P._nodeTypeColor = function () {
    return 'rgba(255, 255, 255, 0.5)';
  };

  /** Zoom-to-fit: encuadra todos los nodos del canvas con padding. */
  P._zoomToFit = function () {
    const canvas = document.getElementById('ccCanvas');
    const nodes = this._canvasNodes();
    if (!canvas || !nodes.length) { this._canvasScale = 1; this._canvasPan = { x: 0, y: 0 }; this._applyCanvasTransform(); return; }
    this._loadPositions();
    const NW = 268, NH = 220;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let i = 0;
    nodes.forEach((n) => {
      const pos = this._positions[n.key] || { x: 0, y: i * 150 };
      i++;
      x0 = Math.min(x0, pos.x); y0 = Math.min(y0, pos.y);
      x1 = Math.max(x1, pos.x + NW); y1 = Math.max(y1, pos.y + NH);
    });
    const r = canvas.getBoundingClientRect();
    const pad = 80;
    const sx = (r.width - pad * 2) / Math.max(1, x1 - x0);
    const sy = (r.height - pad * 2) / Math.max(1, y1 - y0);
    const s = Math.min(2, Math.max(0.3, Math.min(sx, sy)));
    this._canvasScale = s;
    this._canvasPan = {
      x: (r.width - (x1 - x0) * s) / 2 - x0 * s,
      y: (r.height - (y1 - y0) * s) / 2 - y0 * s,
    };
    // Solo transform: los edges (coords de mundo) siguen el encuadre solos.
    this._applyCanvasTransform();
  };

  /** Redibujo agrupado a un frame. Durante arrastre/paneo solo actualiza la
      geometria (atributo `d` + posicion del boton) de las aristas existentes,
      SIN recrear el DOM del SVG. Evita el parpadeo (recrear nodos SVG en cada
      mousemove reevaluaba selectores :has() a nivel documento). */
  P._scheduleEdges = function () {
    if (this._edgesRaf) return;
    this._edgesRaf = requestAnimationFrame(() => { this._edgesRaf = null; this._updateEdgeGeometry(); });
  };

  P._updateEdgeGeometry = function () {
    const svg = document.getElementById('ccCanvasEdges');
    if (!svg) return;
    const groups = svg.querySelectorAll('.cc-edge');
    if (!groups.length) return;
    // Cache del rect del canvas una sola vez por frame (no por arista).
    const cr = document.getElementById('ccCanvas')?.getBoundingClientRect();
    if (!cr) return;
    // Fase 1 — LECTURA: calcular geometria de todas las aristas sin escribir nada.
    // Fase 2 — ESCRITURA: aplicar todos los setAttribute juntos. Separar lectura
    // de escritura evita el forced synchronous layout (reflow) por-arista que
    // generaba jank en arrastre con muchos nodos conectados.
    const updates = [];
    groups.forEach((g) => {
      const isProd = g.classList.contains('cc-edge--production');
      const from = this._portAnchor(g.getAttribute('data-edge-from'), g.getAttribute('data-edge-to'), cr, isProd ? 'from' : null);
      const to   = this._portAnchor(g.getAttribute('data-edge-to'), g.getAttribute('data-edge-from'), cr, isProd ? 'to' : null);
      if (!from || !to) return;
      updates.push({
        g,
        d: this._edgePath(from, to, isProd),
        mx: (from.x + to.x) / 2 - 12,
        my: (from.y + to.y) / 2 - 12,
      });
    });
    updates.forEach(({ g, d, mx, my }) => {
      g.querySelectorAll('path').forEach((p) => p.setAttribute('d', d));
      const fo = g.querySelector('.cc-edge-action');
      if (fo) { fo.setAttribute('x', String(mx)); fo.setAttribute('y', String(my)); }
    });
  };

  P._renderEdges = function () {
    const svg    = document.getElementById('ccCanvasEdges');
    const canvas = document.getElementById('ccCanvas');
    if (!svg || !canvas) return;
    const r = canvas.getBoundingClientRect();
    // Coords de MUNDO: sin viewBox ni width/height (overflow:visible en CSS);
    // el SVG comparte el transform del world (ver _applyCanvasTransform).
    svg.removeAttribute('viewBox');
    svg.removeAttribute('width');
    svg.removeAttribute('height');

    // Punta de flecha (patron n8n: solo en el flujo principal). markerUnits =
    // strokeWidth → hereda la compensacion de zoom del stroke.
    if (!svg.querySelector('#ccEdgeArrow')) {
      const defs = document.createElementNS(NS, 'defs');
      defs.innerHTML = `<marker id="ccEdgeArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" class="cc-edge-arrow-head"></path></marker>`;
      svg.prepend(defs);
    }

    // limpiar conexiones previas (mantener defs/preview)
    Array.from(svg.querySelectorAll('.cc-edge')).forEach((n) => n.remove());

    // Punteado = ADJUNTOS que cuelgan del flujo (productos/servicios/lugares/
    // personajes/flows, audiencias, grupos). Solido = FLUJO principal por puertos
    // izq/der (objetivo <-> brief <-> campana). El brief es ancla de flujo (aunque
    // es data-type=identity), por eso se excluye del set de adjuntos.
    const _isAttach = (key) => {
      const el = document.querySelector(`.cc-node[data-node-key="${cssEsc(key)}"]`);
      if (!el) return false;
      const t = el.getAttribute('data-type');
      if (t === 'audience' || t === 'group') return true;
      if (t === 'identity') return el.getAttribute('data-identity-type') !== 'brief';
      return false; // campaign-concept / campaign-real / etc = flujo
    };
    this._allLinks().forEach((link) => {
      const isIngredient = _isAttach(link.from) || _isAttach(link.to);
      const isProd = !isIngredient;
      // Flujo principal: semantica n8n (sale por OUT, entra por IN). Adjuntos:
      // puerto mas cercano (cuelgan por abajo/arriba segun layout).
      const from = this._portAnchor(link.from, link.to, r, isProd ? 'from' : null);
      const to   = this._portAnchor(link.to, link.from, r, isProd ? 'to' : null);
      if (!from || !to) return;

      const color = this._nodeTypeColor(link.from);
      const d = this._edgePath(from, to, isProd);

      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `cc-edge ${isIngredient ? 'cc-edge--ingredient' : 'cc-edge--production'} ${link.persona ? 'cc-edge--persona' : 'cc-edge--free'}`);
      g.setAttribute('data-edge-from', link.from);
      g.setAttribute('data-edge-to', link.to);

      const hit = document.createElementNS(NS, 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('class', 'cc-edge-hit');
      hit.setAttribute('fill', 'none');
      g.appendChild(hit);

      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'cc-edge-path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color);
      if (isProd) path.setAttribute('marker-end', 'url(#ccEdgeArrow)');
      g.appendChild(path);

      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      const fo = document.createElementNS(NS, 'foreignObject');
      fo.setAttribute('x', String(midX - 12));
      fo.setAttribute('y', String(midY - 12));
      fo.setAttribute('width', '24');
      fo.setAttribute('height', '24');
      fo.setAttribute('class', 'cc-edge-action');
      fo.innerHTML = `<button type="button" class="cc-edge-disconnect" title="Quitar conexion" aria-label="Quitar conexion"><i class="fas fa-times"></i></button>`;
      const btn = fo.querySelector('.cc-edge-disconnect');
      if (btn) btn.onclick = (e) => { e.stopPropagation(); this._removeLink(link.from, link.to); };
      g.appendChild(fo);

      svg.appendChild(g);
    });
    if (this._focusSet) this._applyFocus();
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
      console.error('CommandCenter connect:', e?.message || e);
      c.persona_id = prev;              // rollback
      this._renderCanvas();
      this._renderMiniDash();
      this._renderCampaigns();
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
      console.error('CommandCenter disconnect:', e?.message || e);
      c.persona_id = prev;              // rollback
      this._renderCanvas();
      this._renderMiniDash();
      this._renderCampaigns();
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
    // Zoom por boton: multiplicativo (mismo "feel" que la rueda) y anclado al
    // centro del canvas para que no salte hacia la esquina.
    const _canvasCenter = () => {
      const r = document.getElementById('ccCanvas')?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    };
    document.getElementById('ccBtnZoomIn') ?.addEventListener('click', () => this._setZoom((this._canvasScale || 1) * 1.2, _canvasCenter()));
    document.getElementById('ccBtnZoomOut')?.addEventListener('click', () => this._setZoom((this._canvasScale || 1) / 1.2, _canvasCenter()));
    document.getElementById('ccBtnZoomReset')?.addEventListener('click', () => this._zoomToFit());
    document.getElementById('ccBtnRelayout')?.addEventListener('click', () => this._relayout());

    // Restaura la seccion activa del sidebar (si habia una abierta).
    try {
      const saved = localStorage.getItem('cc:panel:active');
      if (saved && this._librarySections().some((s) => s.key === saved)) this._activeSection = saved;
    } catch (_) { /* noop */ }

    // Dropdown "Crear informe".
    if (!this._reportDocClick) {
      const ddBtn = document.getElementById('ccBtnReport');
      const menu  = document.getElementById('ccReportMenu');
      ddBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
      });
      menu?.addEventListener('click', (e) => {
        const opt = e.target.closest('[data-scope]');
        if (!opt) return;
        menu.style.display = 'none';
        this._generateReport(opt.getAttribute('data-scope'));
      });
      // Cerrar el menu al hacer click afuera.
      this._reportDocClick = (e) => { if (menu && !e.target.closest('#ccReportDD')) menu.style.display = 'none'; };
      document.addEventListener('click', this._reportDocClick);
      // Modal: cerrar / copiar / descargar.
      document.getElementById('ccReportClose')?.addEventListener('click', () => this._closeReport());
      document.getElementById('ccReportBackdrop')?.addEventListener('click', (e) => { if (e.target.id === 'ccReportBackdrop') this._closeReport(); });
      document.getElementById('ccReportCopy')?.addEventListener('click', () => {
        if (this._lastReport) navigator.clipboard?.writeText(this._lastReport).catch(() => {});
      });
      document.getElementById('ccReportDownload')?.addEventListener('click', () => {
        if (!this._lastReport) return;
        const blob = new Blob([this._lastReport], { type: 'text/markdown' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `informe-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
    }

    // Rueda → zoom anclado al cursor
    if (!this._canvasWheel) {
      this._canvasWheel = (e) => {
        // Scroll dentro de un nodo o del panel flotante: no hacer zoom.
        if (e.target.closest('.cc-node-body, .cc-node-ads, .cc-floating-panel')) return;
        if (Math.abs(e.deltaY) < 0.01) return;
        e.preventDefault();
        // Normaliza deltaY (lineas/paginas → px) y acota saltos bruscos del
        // trackpad/rueda para que el zoom no se vaya a saltos.
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 24;        // DOM_DELTA_LINE → px aprox
        else if (e.deltaMode === 2) dy *= 120;  // DOM_DELTA_PAGE
        dy = Math.max(-100, Math.min(100, dy));
        // Zoom multiplicativo: suave y uniforme en todo el rango (0.4–2),
        // anclado al cursor. Sensibilidad alta para que pocos scrolls basten;
        // el pinch del trackpad (muchos eventos pequenos) sigue siendo fluido.
        const factor = Math.exp(-dy * 0.0045);
        this._setZoom((this._canvasScale || 1) * factor, { x: e.clientX, y: e.clientY });
      };
      canvas.addEventListener('wheel', this._canvasWheel, { passive: false });
    }

    // Re-pintar aristas si cambia el tamano del canvas
    if (!this._canvasResizeObs && typeof ResizeObserver !== 'undefined') {
      this._canvasResizeObs = new ResizeObserver(() => { this._cullNodes(); this._renderEdges(); });
      this._canvasResizeObs.observe(canvas);
    }

    // Delegacion: mousedown decide entre conectar / mover nodo / pan
    if (!this._canvasMouseDown) {
      this._canvasMouseDown = (e) => {
        if (e.button !== 0) return;
        const port = e.target.closest('.cc-node-port');
        if (port) { this._beginConnect(e, port); return; }

        // Panel flotante, controles editables y botones de accion: dejar que
        // reciban el evento nativo (focus / click), sin iniciar drag ni pan.
        if (e.target.closest('.cc-floating-panel, input, textarea, select, option, .cc-node-act, .cc-edge-disconnect')) return;

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
        if (!nodeEl) {
          // Click en vacio (sin haber paneado) → limpia focus + seleccion.
          if (this._didPan) { this._didPan = false; return; }
          if (e.target.closest('.cc-floating-panel')) return;
          if (this._focusSet) this._clearFocus();
          if (this._selectedKey) {
            document.querySelectorAll('.cc-node--selected').forEach((n) => n.classList.remove('cc-node--selected'));
            this._selectedKey = null; this._selected = null;
          }
          return;
        }
        const key  = nodeEl.getAttribute('data-node-key');
        const type = nodeEl.getAttribute('data-type');
        const id   = nodeEl.getAttribute('data-id');
        const tagX = e.target.closest('.cc-tag-x');
        if (tagX) {
          e.preventDefault(); e.stopPropagation();
          const chip = tagX.closest('.cc-tag');
          const cont = chip ? chip.closest('.cc-field--tags') : null;
          if (chip && cont) { chip.remove(); this._commitTags(cont); }
          return;
        }
        const toggleBtn = e.target.closest('.cc-node-toggle');
        if (toggleBtn) {
          e.preventDefault(); e.stopPropagation();
          this._toggleAudienceFlag(id, toggleBtn.getAttribute('data-toggle'), nodeEl);
          return;
        }
        if (e.target.closest('.cc-node-collapse')) {
          e.preventDefault(); e.stopPropagation();
          this._toggleCollapse(key, nodeEl);
          return;
        }
        if (e.target.closest('.cc-node-uncanvas')) {
          e.preventDefault(); e.stopPropagation();
          if (type === 'identity') this._removeIdentityFromCanvas(nodeEl.getAttribute('data-identity-type'), id);
          else this._removeRealFromCanvas(id);
          return;
        }
        if (e.target.closest('.cc-node-delete')) {
          e.preventDefault(); e.stopPropagation();
          const et = type === 'audience' ? 'audience' : 'campaign-concept';
          this._confirmAndDelete(et, id, null);
          return;
        }
        // Click en cualquier otra parte del nodo (no control/puerto/campo): seleccionar.
        if (e.target.closest('input, textarea, select, .cc-node-port')) return;
        this._selectNode(nodeEl);
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

    // Tags/chips: Enter o coma agrega; Backspace en vacio quita el ultimo.
    if (!this._canvasTagKey) {
      this._canvasTagKey = (e) => {
        const input = e.target.closest('.cc-tag-input');
        if (!input) return;
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          this._addTag(input);
        } else if (e.key === 'Backspace' && input.value === '') {
          const cont = input.closest('.cc-field--tags');
          const chips = cont ? cont.querySelectorAll('.cc-tag') : null;
          if (chips && chips.length) { chips[chips.length - 1].remove(); this._commitTags(cont); }
        }
      };
      canvas.addEventListener('keydown', this._canvasTagKey);
    }

    // Minimapa flotante (click para navegar) — se cablea una vez.
    this._setupMinimap();

    // Rail de la biblioteca (delegado en el panel): icono → abre/cierra seccion.
    const panel = document.getElementById('ccSidebar');
    if (panel && !this._panelClick) {
      this._panelClick = (e) => {
        const railSec = e.target.closest('[data-rail-sec]');
        if (railSec) { this._setActiveSection(railSec.getAttribute('data-rail-sec')); return; }
        if (e.target.closest('#ccPanelToggle')) {
          // Si el panel esta mostrando el inspector de un nodo, la X limpia la
          // seleccion (que a su vez cierra el inspector via _renderSelection).
          if (this._inspecting) {
            this._inspecting = false;
            try { this._store?.clearSelection(); } catch (_) { /* noop */ }
            this._selectedKey = null; this._selected = null;
            if (this._focusSet) this._clearFocus();
            if (typeof this._renderSelection === 'function') this._renderSelection();
          }
          this._activeSection = null; this._renderLibrary(); return;
        }
        // Click (sin drag) en una campana del sidebar → enfoca su flujo en el canvas.
        const campItem = e.target.closest('.cc-lib-item[data-lib-type="campaigns"]');
        if (campItem) { this._focusCampaignFromSidebar(campItem.getAttribute('data-lib-id')); return; }
      };
      panel.addEventListener('click', this._panelClick);

      // Accesibilidad: flechas arriba/abajo mueven el foco entre tabs del rail.
      this._railKey = (e) => {
        const btn = e.target.closest('.cc-rail-btn');
        if (!btn || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
        e.preventDefault();
        const btns = [...document.querySelectorAll('#ccPanelRail .cc-rail-btn')];
        const i = btns.indexOf(btn);
        const next = btns[(i + (e.key === 'ArrowDown' ? 1 : btns.length - 1)) % btns.length];
        if (next) next.focus();
      };
      panel.addEventListener('keydown', this._railKey);
    }

    // Drag-and-drop: cualquier item del sidebar → canvas.
    const list = document.getElementById('ccPanelBody');
    if (list && !this._campDragStart) {
      this._campDragStart = (e) => {
        const item = e.target.closest('[data-lib-id]');
        if (!item) return;
        this._dragLib = {
          type: item.getAttribute('data-lib-type'),
          id: item.getAttribute('data-lib-id'),
          name: (item.querySelector('.cc-lib-item-name') || {}).textContent || '',
          sub: (item.querySelector('.cc-lib-item-sub') || {}).textContent || '',
        };
        try { e.dataTransfer.setData('text/plain', this._dragLib.id); e.dataTransfer.effectAllowed = 'copy'; } catch (_) {}
        item.classList.add('cc-camp-row--dragging');
      };
      this._campDragEnd = (e) => {
        const item = e.target.closest('[data-lib-id]');
        if (item) item.classList.remove('cc-camp-row--dragging');
      };
      list.addEventListener('dragstart', this._campDragStart);
      list.addEventListener('dragend', this._campDragEnd);
    }
    if (!this._canvasDragOver) {
      this._canvasDragOver = (e) => {
        if (!this._dragLib) return;
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'copy'; } catch (_) {}
        canvas.classList.add('cc-canvas--droptarget');
        canvas.querySelectorAll('.cc-node').forEach((n) => n.classList.remove('cc-node--drop-target'));
        const tgt = this._nodeAt(e.clientX, e.clientY, null);
        if (tgt) tgt.classList.add('cc-node--drop-target');
      };
      this._canvasDragLeave = () => { canvas.classList.remove('cc-canvas--droptarget'); };
      this._canvasDrop = (e) => {
        const lib = this._dragLib;
        canvas.classList.remove('cc-canvas--droptarget');
        canvas.querySelectorAll('.cc-node').forEach((n) => n.classList.remove('cc-node--drop-target'));
        this._dragLib = null;
        if (!lib) return;
        e.preventDefault();
        if (lib.type === 'campaigns') { this._addRealToCanvas(lib.id, e.clientX, e.clientY); return; }
        if (ID_TYPES.includes(lib.type)) { this._addIdentityToCanvas(lib, e.clientX, e.clientY); return; }
        // audiences / concepts ya viven en el canvas → no-op
      };
      canvas.addEventListener('dragover', this._canvasDragOver);
      canvas.addEventListener('dragleave', this._canvasDragLeave);
      canvas.addEventListener('drop', this._canvasDrop);
    }
  };

  /** Coloca un identity (producto/servicio/.../brief) como nodo en el canvas.
      Si se suelta sobre otro nodo, ademas crea el link libre. */
  P._addIdentityToCanvas = function (lib, clientX, clientY) {
    if (!lib || !lib.type || !lib.id) return;
    this._loadPlaced();
    const key = `${lib.type}:${lib.id}`;
    if (!this._placed.some((p) => p.type === lib.type && String(p.id) === String(lib.id))) {
      this._placed.push({ type: lib.type, id: lib.id, name: lib.name, sub: lib.sub });
      this._savePlaced();
      // refresca el mapa entity_id de la nueva identidad (para conectar a briefs)
      if (/^(products|services|places|characters)$/.test(lib.type)) this._loadStrategyRelations();
    }
    const w = this._worldPointFromClient(clientX, clientY);
    this._positions[key] = { x: Math.max(0, w.x - 110), y: Math.max(0, w.y - 20) };
    this._savePositions();
    const target = this._nodeAt(clientX, clientY, key);
    const toKey = target && target.getAttribute('data-node-key');
    this._renderCanvas();
    this._renderLibrary();
    if (toKey && toKey !== key) this._addLink(key, toKey);
  };

  /** Quita un identity del canvas + sus links. */
  P._removeIdentityFromCanvas = function (type, id) {
    const key = `${type}:${id}`;
    this._loadPlaced();
    this._placed = this._placed.filter((p) => !(p.type === type && String(p.id) === String(id)));
    this._savePlaced();
    this._loadLinks();
    this._links = this._links.filter((l) => l.from !== key && l.to !== key);
    this._saveLinks();
    this._renderCanvas();
    this._renderLibrary();
  };

  /* ── Tags/chips ────────────────────────────────────────────────────── */
  P._addTag = function (input) {
    const cont = input.closest('.cc-field--tags');
    if (!cont) return;
    const max = parseInt(cont.getAttribute('data-max'), 10) || MAX_TAGS;
    const chips = [...cont.querySelectorAll('.cc-tag')];
    if (chips.length >= max) { input.value = ''; return; }
    const val = String(input.value || '').trim();
    if (!val) return;
    if (chips.some((t) => (t.getAttribute('data-val') || '').toLowerCase() === val.toLowerCase())) { input.value = ''; return; }
    const chip = document.createElement('span');
    chip.className = 'cc-tag';
    chip.setAttribute('data-val', val);
    chip.innerHTML = `${this.escapeHtml(val)}<button type="button" class="cc-tag-x" aria-label="Quitar">&times;</button>`;
    input.parentNode.insertBefore(chip, input);
    input.value = '';
    this._commitTags(cont);
    if ([...cont.querySelectorAll('.cc-tag')].length < max) input.focus();
  };

  /** Recolecta los chips de un campo, actualiza el contador/limite y persiste. */
  P._commitTags = function (cont) {
    // Acepta el nodo del canvas o el contenedor de campos del inspector derecho.
    const nodeEl = cont.closest('.cc-node, [data-field-host]');
    if (!nodeEl) return;
    const field = cont.getAttribute('data-field-tags');
    const max   = parseInt(cont.getAttribute('data-max'), 10) || MAX_TAGS;
    const vals  = [...cont.querySelectorAll('.cc-tag')].map((t) => t.getAttribute('data-val'));
    const atMax = vals.length >= max;

    const count = cont.querySelector('.cc-field-count');
    if (count) { count.textContent = `${vals.length}/${max}`; count.classList.toggle('is-max', atMax); }
    const input = cont.querySelector('.cc-tag-input');
    if (input) { input.disabled = atMax; input.placeholder = atMax ? 'Limite alcanzado' : 'Escribe y Enter'; }

    const type = nodeEl.getAttribute('data-type');
    const id   = nodeEl.getAttribute('data-id');
    this._persistField(type, id, field, vals, cont.querySelector('.cc-tags'));
  };

  /** Persiste un campo arbitrario (usado por tags). Optimista + estados. */
  P._persistField = async function (type, id, field, val, indicatorEl) {
    if (!this._supabase || !id || !field) return;
    const isAudience = type === 'audience';
    const table = isAudience ? 'audience_personas' : 'campaigns';
    const arr = isAudience ? this._audiences : this._campaigns;
    const row = (arr || []).find((x) => String(x.id) === String(id));
    if (row) row[field] = val;
    if (indicatorEl) indicatorEl.classList.add('cc-field--saving');
    try {
      const { error } = await this._supabase
        .from(table)
        .update({ [field]: val, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      if (indicatorEl) { indicatorEl.classList.remove('cc-field--saving'); indicatorEl.classList.add('cc-field--saved'); setTimeout(() => indicatorEl.classList.remove('cc-field--saved'), 900); }
    } catch (e) {
      console.error('CommandCenter persist field:', e);
      if (indicatorEl) { indicatorEl.classList.remove('cc-field--saving'); indicatorEl.classList.add('cc-field--invalid'); }
    }
  };

  /** Flags de audiencia (me gusta / destacar / apagar). Persiste en BD. */
  P._toggleAudienceFlag = async function (id, flag, nodeEl) {
    if (!this._supabase || !['is_liked', 'is_featured', 'is_active'].includes(flag)) return;
    const row = (this._audiences || []).find((a) => String(a.id) === String(id));
    if (!row) return;
    const prev = row[flag] === undefined ? (flag === 'is_active') : !!row[flag];
    const next = !prev;
    row[flag] = next;

    // Actualiza UI sin re-render completo (preserva edicion en curso).
    const btn = nodeEl.querySelector(`.cc-node-toggle[data-toggle="${flag}"]`);
    if (flag === 'is_active') {
      nodeEl.classList.toggle('cc-node--off', !next);
      if (btn) { btn.classList.toggle('is-off', !next); btn.title = next ? 'Apagar audiencia' : 'Encender audiencia'; }
    } else {
      nodeEl.classList.toggle(flag === 'is_featured' ? 'cc-node--featured' : 'cc-node--liked', next);
      if (btn) btn.classList.toggle('is-on', next);
    }
    try {
      const { error } = await this._supabase
        .from('audience_personas')
        .update({ [flag]: next, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    } catch (e) {
      console.error('CommandCenter toggle flag:', e);
      row[flag] = prev;  // rollback visual minimo
      if (btn) {
        if (flag === 'is_active') { nodeEl.classList.toggle('cc-node--off', prev === false ? true : !prev); btn.classList.toggle('is-off', !prev); }
        else { btn.classList.toggle('is-on', prev); nodeEl.classList.toggle(flag === 'is_featured' ? 'cc-node--featured' : 'cc-node--liked', prev); }
      }
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
    if (multi === 'checks') {
      const nodeEl = fieldEl.closest('.cc-node, [data-field-host]');
      val = nodeEl ? [...nodeEl.querySelectorAll(`[data-field="${field}"]`)].filter((x) => x.checked).map((x) => x.value) : [];
    } else if (multi === 'lines') {
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
    this._didPan = false;
    const onMove = (ev) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._didPan = true;
      this._canvasPan = { x: p0.x + dx, y: p0.y + dy };
      // Los edges viven en coords de MUNDO y comparten el transform del world:
      // el pan es un solo CSS transform, nada que recalcular (patron n8n).
      this._applyCanvasTransform();
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
      this._scheduleEdges();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      nodeEl.classList.remove('cc-node--dragging');
      // Snap-to-grid (16px) al soltar.
      const pos = this._positions[key];
      if (pos) {
        pos.x = Math.round(pos.x / 16) * 16;
        pos.y = Math.round(pos.y / 16) * 16;
        nodeEl.style.left = `${pos.x}px`;
        nodeEl.style.top = `${pos.y}px`;
        this._scheduleEdges();
      }
      this._savePositions();
      this._drawMinimap();
      // reset flag tras el ciclo de click
      setTimeout(() => { this._didDrag = false; }, 0);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  /** Drag-to-connect libre: desde el puerto de salida de CUALQUIER nodo a
      cualquier otro nodo. Crea un link (audiencia→campana persiste persona_id;
      el resto es link libre en localStorage). */
  P._beginConnect = function (e, port) {
    e.preventDefault(); e.stopPropagation();
    const svg    = document.getElementById('ccCanvasEdges');
    const canvas = document.getElementById('ccCanvas');
    const nodeEl = port.closest('.cc-node');
    if (!svg || !canvas || !nodeEl) return;
    const fromKey = nodeEl.getAttribute('data-node-key');

    const cr = canvas.getBoundingClientRect();
    const pr = port.getBoundingClientRect();
    // Preview en coords de MUNDO (el SVG comparte el transform del world).
    const start = this._clientToWorld(pr.left + pr.width / 2, pr.top + pr.height / 2, cr);

    const preview = document.createElementNS(NS, 'path');
    preview.setAttribute('class', 'cc-edge-path cc-edge-path--preview');
    preview.setAttribute('fill', 'none');
    preview.setAttribute('stroke', this._nodeTypeColor(fromKey)); // preview = color del origen
    svg.appendChild(preview);
    canvas.classList.add('cc-canvas--connecting');

    const onMove = (ev) => {
      const m = this._clientToWorld(ev.clientX, ev.clientY, cr);
      preview.setAttribute('d', this._bezier(start.x, start.y, m.x, m.y));
      canvas.querySelectorAll('.cc-node').forEach((n) => n.classList.remove('cc-node--drop-target'));
      const target = this._nodeAt(ev.clientX, ev.clientY, fromKey);
      if (target) target.classList.add('cc-node--drop-target');
    };
    const onUp = (ev) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      canvas.classList.remove('cc-canvas--connecting');
      canvas.querySelectorAll('.cc-node').forEach((n) => n.classList.remove('cc-node--drop-target'));
      preview.remove();
      const target = this._nodeAt(ev.clientX, ev.clientY, fromKey);
      const toKey = target && target.getAttribute('data-node-key');
      if (toKey && toKey !== fromKey) this._addLink(fromKey, toKey);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  /** Cualquier nodo bajo coords cliente, excluyendo el de origen. */
  P._nodeAt = function (clientX, clientY, excludeKey) {
    const nodes = document.querySelectorAll('.cc-node');
    for (const n of nodes) {
      if (n.getAttribute('data-node-key') === excludeKey) continue;
      const r = n.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return n;
    }
    return null;
  };

  /* ── Links: crear / quitar ─────────────────────────────────────────── */
  P._addLink = function (fromKey, toKey) {
    // audiencia <-> campana persiste persona_id en BD (cualquier direccion:
    // con el trigger arriba se arrastra camp->aud; antes solo aud->camp).
    if (fromKey.startsWith('aud:') && toKey.startsWith('camp:')) {
      this._linkAudienceSegment(toKey.slice(5), fromKey.slice(4));
      return;
    }
    if (fromKey.startsWith('camp:') && toKey.startsWith('aud:')) {
      this._linkAudienceSegment(fromKey.slice(5), toKey.slice(4));
      return;
    }
    // campana <-> brief persiste campaigns.brief_id (cualquier direccion)
    if (fromKey.startsWith('camp:') && toKey.startsWith('briefs:')) {
      this._linkCampaignBrief(fromKey.slice(5), toKey.slice(7)); return;
    }
    if (fromKey.startsWith('briefs:') && toKey.startsWith('camp:')) {
      this._linkCampaignBrief(toKey.slice(5), fromKey.slice(7)); return;
    }
    // entidad <-> brief persiste campaign_brief_entities (con is_hero en la 1ra)
    const _isEnt = (k) => /^(products|services|places|characters):/.test(k);
    if (_isEnt(fromKey) && toKey.startsWith('briefs:')) { this._linkBriefEntity(toKey.slice(7), fromKey); return; }
    if (fromKey.startsWith('briefs:') && _isEnt(toKey)) { this._linkBriefEntity(fromKey.slice(7), toKey); return; }
    // Link libre (visual). Evitar duplicado en cualquier direccion.
    this._loadLinks();
    const dup = this._links.some((l) => (l.from === fromKey && l.to === toKey) || (l.from === toKey && l.to === fromKey));
    if (!dup) { this._links.push({ from: fromKey, to: toKey }); this._saveLinks(); }
    this._renderCanvas();
  };

  P._removeLink = function (fromKey, toKey) {
    if (fromKey.startsWith('aud:') && toKey.startsWith('camp:')) {
      this._unlinkAudienceSegment(toKey.slice(5), fromKey.slice(4));
      return;
    }
    if (fromKey.startsWith('camp:') && toKey.startsWith('aud:')) {
      this._unlinkAudienceSegment(fromKey.slice(5), toKey.slice(4));
      return;
    }
    if ((fromKey.startsWith('camp:') && toKey.startsWith('briefs:')) || (fromKey.startsWith('briefs:') && toKey.startsWith('camp:'))) {
      this._unlinkCampaignBrief(fromKey.startsWith('camp:') ? fromKey.slice(5) : toKey.slice(5));
      return;
    }
    {
      const _isEnt = (k) => /^(products|services|places|characters):/.test(k);
      if (_isEnt(fromKey) && toKey.startsWith('briefs:')) { this._unlinkBriefEntity(toKey.slice(7), fromKey); return; }
      if (fromKey.startsWith('briefs:') && _isEnt(toKey)) { this._unlinkBriefEntity(fromKey.slice(7), toKey); return; }
    }
    this._loadLinks();
    this._links = this._links.filter((l) => !((l.from === fromKey && l.to === toKey) || (l.from === toKey && l.to === fromKey)));
    this._saveLinks();
    this._renderCanvas();
  };

  /** campana -> brief: persiste campaigns.brief_id (BD live, fuera de undo). */
  P._linkCampaignBrief = async function (campId, briefId) {
    const c = (this._campaigns || []).find((x) => String(x.id) === String(campId));
    if (!c || !this._supabase) return;
    if (String(c.brief_id || '') === String(briefId)) return;
    const { error } = await this._supabase.from('campaigns').update({ brief_id: briefId }).eq('id', campId);
    if (error) { console.warn('[CC] brief_id update:', error.message); return; }
    c.brief_id = briefId;
    this._renderCanvas();
  };

  /** Quitar el brief de una campana (brief_id = null). */
  P._unlinkCampaignBrief = async function (campId) {
    const c = (this._campaigns || []).find((x) => String(x.id) === String(campId));
    if (!c || !this._supabase) return;
    const { error } = await this._supabase.from('campaigns').update({ brief_id: null }).eq('id', campId);
    if (error) { console.warn('[CC] brief_id clear:', error.message); return; }
    c.brief_id = null;
    this._renderCanvas();
  };

  /** audiencia -> campana: persiste una fila en audience_segments (permite N
      audiencias por campana). La 1ra ademas queda como persona_id (primaria). */
  P._linkAudienceSegment = async function (campId, persId) {
    const c = (this._campaigns || []).find((x) => String(x.id) === String(campId));
    if (!c || !this._supabase) return;
    const dup = (this._segments || []).some((s) => String(s.campaign_id) === String(campId) && String(s.persona_id) === String(persId));
    if (!dup) {
      const row = { persona_id: persId, campaign_id: campId, brand_container_id: this._containerRow?.id, organization_id: c.organization_id, status: 'active', source: 'canvas', created_via: 'manual' };
      const { data, error } = await this._supabase.from('audience_segments').insert(row).select('id, persona_id, campaign_id, platform, status, source').single();
      if (error) { console.warn('[CC] audience_segments insert:', error.message); return; }
      this._segments = [...(this._segments || []), data];
    }
    if (!c.persona_id) {
      const { error } = await this._supabase.from('campaigns').update({ persona_id: persId }).eq('id', campId);
      if (!error) c.persona_id = persId;
    }
    this._renderCanvas();
  };

  /** Quitar una audiencia de una campana: borra su audience_segments y reconcilia
      persona_id (si era la primaria, pasa a otra restante o null). */
  P._unlinkAudienceSegment = async function (campId, persId) {
    const c = (this._campaigns || []).find((x) => String(x.id) === String(campId));
    if (!c || !this._supabase) return;
    const { error } = await this._supabase.from('audience_segments').delete().eq('campaign_id', campId).eq('persona_id', persId);
    if (error) { console.warn('[CC] audience_segments delete:', error.message); return; }
    this._segments = (this._segments || []).filter((s) => !(String(s.campaign_id) === String(campId) && String(s.persona_id) === String(persId)));
    if (String(c.persona_id || '') === String(persId)) {
      const other = (this._segments || []).find((s) => String(s.campaign_id) === String(campId));
      const newPid = other ? other.persona_id : null;
      await this._supabase.from('campaigns').update({ persona_id: newPid }).eq('id', campId);
      c.persona_id = newPid;
    }
    this._renderCanvas();
  };

  /** brand_entities.id de un nodo identidad (subtipo:id → entity_id). */
  P._entityIdForNode = async function (type, id) {
    const table = { products: 'products', services: 'services', places: 'brand_places', characters: 'brand_characters' }[type];
    if (!table || !this._supabase) return null;
    if (this._entityIdMap && this._entityIdMap[`${type}:${id}`]) return this._entityIdMap[`${type}:${id}`];
    const { data } = await this._supabase.from(table).select('entity_id').eq('id', id).single();
    return data?.entity_id || null;
  };

  /** entidad -> brief: persiste campaign_brief_entities (is_hero en la 1ra del brief). */
  P._linkBriefEntity = async function (briefId, entKey) {
    const sep = entKey.indexOf(':');
    const type = entKey.slice(0, sep), id = entKey.slice(sep + 1);
    const entityId = await this._entityIdForNode(type, id);
    if (!entityId || !this._supabase) return;
    const list = this._briefEntities || [];
    if (list.some((b) => String(b.brief_id) === String(briefId) && String(b.entity_id) === String(entityId))) return;
    const isHero = !list.some((b) => String(b.brief_id) === String(briefId)); // 1ra del brief = hero
    const { data, error } = await this._supabase.from('campaign_brief_entities').insert({ brief_id: briefId, entity_id: entityId, is_hero: isHero }).select('id, brief_id, entity_id, is_hero').single();
    if (error) { console.warn('[CC] brief_entities insert:', error.message); return; }
    this._briefEntities = [...list, data];
    if (!this._entByEntityId) this._entByEntityId = {};
    this._entByEntityId[entityId] = entKey;
    if (!this._entityIdMap) this._entityIdMap = {};
    this._entityIdMap[entKey] = entityId;
    this._renderCanvas();
  };

  /** Quitar entidad de un brief: borra campaign_brief_entities. */
  P._unlinkBriefEntity = async function (briefId, entKey) {
    const sep = entKey.indexOf(':');
    const type = entKey.slice(0, sep), id = entKey.slice(sep + 1);
    const entityId = await this._entityIdForNode(type, id);
    if (!entityId || !this._supabase) return;
    const { error } = await this._supabase.from('campaign_brief_entities').delete().eq('brief_id', briefId).eq('entity_id', entityId);
    if (error) { console.warn('[CC] brief_entities delete:', error.message); return; }
    this._briefEntities = (this._briefEntities || []).filter((b) => !(String(b.brief_id) === String(briefId) && String(b.entity_id) === String(entityId)));
    this._renderCanvas();
  };

  /** Precarga las relaciones brief↔entidad de la BD + el mapa entity_id↔nodo
      para las identidades colocadas. Fire-and-forget; re-pinta aristas al terminar. */
  P._loadStrategyRelations = async function () {
    if (!this._supabase) return;
    const bid = this._containerRow?.id;
    try {
      // 1. brief_entities de los briefs de esta sub-marca
      let be = [];
      if (bid) {
        const { data: briefs } = await this._supabase.from('campaign_briefs').select('id').eq('brand_container_id', bid);
        const briefIds = (briefs || []).map((b) => b.id);
        if (briefIds.length) {
          const { data } = await this._supabase.from('campaign_brief_entities').select('id, brief_id, entity_id, is_hero').in('brief_id', briefIds);
          be = data || [];
        }
      }
      this._briefEntities = be;
      // 2. entity_id de las identidades colocadas → mapas en ambos sentidos
      this._loadPlaced();
      const table = { products: 'products', services: 'services', places: 'brand_places', characters: 'brand_characters' };
      const byType = {};
      (this._placed || []).forEach((p) => { if (table[p.type]) (byType[p.type] = byType[p.type] || []).push(p.id); });
      const fwd = {}, rev = {};
      for (const t of Object.keys(byType)) {
        const { data } = await this._supabase.from(table[t]).select('id, entity_id').in('id', byType[t]);
        (data || []).forEach((r) => { if (r.entity_id) { fwd[`${t}:${r.id}`] = r.entity_id; rev[r.entity_id] = `${t}:${r.id}`; } });
      }
      this._entityIdMap = fwd;
      this._entByEntityId = rev;
      this._renderEdges();
    } catch (e) { console.warn('[CC] _loadStrategyRelations:', e?.message); }
  };

  // ------------------------------------------------------------------
  // Biblioteca del sidebar: secciones de TODO lo conectable (audiencias,
  // campanas, conceptuales, productos, servicios, lugares, flows, briefs).
  // Colapsado = rail de iconos. Drag al canvas: solo campanas reales por
  // ahora persiste; el resto es visual (semantica pendiente).
  // ------------------------------------------------------------------
  P._renderMiniDash = function () { /* stats eliminados; la biblioteca lo reemplaza */ };

  /** Definicion de secciones (orden + icono + label). */
  P._librarySections = function () {
    return [
      { key: 'audiences', label: 'Objetivos de Audiencia', icon: 'fa-users' },
      { key: 'campaigns', label: 'Campanas',               icon: 'fa-bullhorn' },
      { key: 'concepts',  label: 'Objetivos de Campana',   icon: 'fa-lightbulb' },
      { key: 'products',  label: 'Productos',           icon: 'fa-box' },
      { key: 'services',  label: 'Servicios',           icon: 'fa-tag' },
      { key: 'places',    label: 'Lugares',             icon: 'fa-map-pin' },
      { key: 'characters', label: 'Personajes',         icon: 'fa-masks-theater' },
      { key: 'flows',     label: 'My Flows',            icon: 'fa-diagram-project' },
      { key: 'briefs',    label: 'Briefs',              icon: 'fa-file-lines' },
    ];
  };
  P._libIcon = function (key) { return (this._librarySections().find((s) => s.key === key) || {}).icon || 'fa-circle'; };

  /** Items de una seccion. Locales (sincronos) o lazy (cache; undefined = sin cargar). */
  P._libItemsFor = function (key) {
    if (key === 'audiences') {
      return (this._audiences || []).map((a) => ({ id: a.id, name: a.name || 'Objetivo de Audiencia', sub: a.is_active === false ? 'apagada' : '' }));
    }
    if (key === 'campaigns') {
      this._loadOnCanvas();
      return (this._campaigns || []).filter((c) => c.last_synced_at && !this._realOnCanvas(c))
        .map((c) => ({ id: c.id, name: c.nombre_campana || 'Campana', sub: c.status || '', camp: true }));
    }
    if (key === 'concepts') {
      return (this._campaigns || []).filter((c) => !c.last_synced_at)
        .map((c) => ({ id: c.id, name: c.nombre_campana || 'Campana', sub: c.status || '' }));
    }
    return this._libCache[key]; // lazy: undefined si no se ha cargado
  };

  P._renderLibrary = function () {
    // Mientras el panel derecho muestra el inspector de un nodo, no re-pintamos
    // la libreria (clobbearia el contenido editable). El inspector se cierra
    // primero (this._inspecting = false) y recien ahi se llama a _renderLibrary.
    if (this._inspecting) return;
    const rail    = document.getElementById('ccPanelRail');
    const body    = document.getElementById('ccPanelBody');
    const panel   = document.getElementById('ccSidebar');
    const titleEl = document.getElementById('ccPanelTitle');
    if (!rail || !body) return;
    const secs = this._librarySections();
    const active = this._activeSection;

    // Rail: solo iconos (sin texto) + badge de conteo cuando se conoce.
    rail.innerHTML = secs.map((s) => {
      const items = this._libItemsFor(s.key);
      const count = Array.isArray(items) ? items.length : null;
      return `<button class="cc-rail-btn ${active === s.key ? 'is-active' : ''}" data-rail-sec="${s.key}" role="tab" aria-selected="${active === s.key ? 'true' : 'false'}" title="${this.escapeHtml(s.label)}" aria-label="${this.escapeHtml(s.label)}">
        <i class="fas ${s.icon}"></i>
        ${count ? `<span class="cc-rail-badge">${count}</span>` : ''}
      </button>`;
    }).join('');

    // Panel de datos: visible solo si hay seccion activa.
    if (panel) panel.classList.toggle('cc-fp-open', !!active);
    if (active) {
      const s = secs.find((x) => x.key === active) || { label: 'Biblioteca', icon: 'fa-sliders' };
      if (titleEl) titleEl.innerHTML = `<i class="fas ${s.icon}"></i> ${this.escapeHtml(s.label)}`;
      body.innerHTML = this._libBodyHTML(active);
      if (this._libItemsFor(active) === undefined) this._fetchLibrary(active);
    } else {
      body.innerHTML = '';
    }
  };

  P._libBodyHTML = function (key) {
    const items = this._libItemsFor(key);
    if (items === undefined) return '<div class="cc-lib-loading"><i class="fas fa-spinner fa-spin"></i> Cargando…</div>';
    if (!items.length) return '<div class="cc-lib-empty">Sin elementos.</div>';
    const icon = this._libIcon(key);
    return items.map((it) => `
      <div class="cc-lib-item" draggable="true" data-lib-type="${key}" data-lib-id="${this.escapeHtml(String(it.id))}" ${it.camp ? `data-camp-id="${this.escapeHtml(String(it.id))}"` : ''} title="${this.escapeHtml(it.name)}${it.camp ? ' — arrastra al canvas' : ''}">
        <i class="fas ${icon} cc-lib-item-ic"></i>
        <span class="cc-lib-item-name">${this.escapeHtml(it.name)}</span>
        ${it.sub ? `<span class="cc-lib-item-sub">${this.escapeHtml(it.sub)}</span>` : ''}
      </div>`).join('');
  };

  /* ── Minimapa flotante (esquina inferior izquierda) ────────────────── */
  P._setupMinimap = function () {
    const cv = document.getElementById('ccMinimap');
    if (!cv || this._minimapWired) return;
    this._minimapWired = true;
    cv.onclick = (e) => {
      if (!this._miniTransform) return;
      const r = cv.getBoundingClientRect();
      const { sc, ox, oy } = this._miniTransform;
      const wx = ((e.clientX - r.left) - ox) / sc;
      const wy = ((e.clientY - r.top) - oy) / sc;
      const canvas = document.getElementById('ccCanvas');
      const cr = canvas.getBoundingClientRect();
      const s = this._canvasScale || 1;
      this._canvasPan = { x: cr.width / 2 - wx * s, y: cr.height / 2 - wy * s };
      // Solo pan: los edges (coords de mundo) siguen el transform solos.
      this._applyCanvasTransform();
    };
    this._drawMinimap();
  };

  P._drawMinimap = function () {
    const cv = document.getElementById('ccMinimap');
    const wrap = document.getElementById('ccMinimapWrap');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    this._loadPositions();
    const nodes = this._canvasNodes();
    if (!nodes.length) { this._miniTransform = null; if (wrap) wrap.style.display = 'none'; return; }
    if (wrap) wrap.style.display = '';
    const NW = 268, NH = 200;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    nodes.forEach((n) => {
      const p = this._positions[n.key]; if (!p) return;
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + NW); y1 = Math.max(y1, p.y + NH);
    });
    if (!Number.isFinite(x0)) { this._miniTransform = null; return; }
    const pad = 10;
    const sc = Math.min((W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2) / Math.max(1, y1 - y0));
    const ox = pad - x0 * sc, oy = pad - y0 * sc;
    this._miniTransform = { sc, ox, oy };
    // Monocromo: tipos diferenciados por brillo, sin color.
    const colorByType = { audience: '#c9cdd3', 'campaign-concept': '#e8eaed', 'campaign-real': '#90959c', identity: '#aeb3b9' };
    nodes.forEach((n) => {
      const p = this._positions[n.key]; if (!p) return;
      ctx.fillStyle = colorByType[n.type] || '#888';
      ctx.globalAlpha = (this._focusSet && !this._focusSet.has(n.key)) ? 0.25 : 0.9;
      const rw = Math.max(3, NW * sc), rh = Math.max(3, 60 * sc);
      ctx.fillRect(p.x * sc + ox, p.y * sc + oy, rw, rh);
    });
    ctx.globalAlpha = 1;
    // Viewport actual
    const canvas = document.getElementById('ccCanvas');
    if (canvas) {
      const r = canvas.getBoundingClientRect();
      const s = this._canvasScale || 1;
      const pn = this._canvasPan || { x: 0, y: 0 };
      const vx = (-pn.x) / s, vy = (-pn.y) / s, vw = r.width / s, vh = r.height / s;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vx * sc + ox, vy * sc + oy, vw * sc, vh * sc);
    }
  };

  /** Selecciona una seccion (toggle: re-click colapsa el panel de datos).
      Abrir una seccion del rail des-selecciona el nodo: el panel derecho es
      seccion O inspector, no ambos. */
  P._setActiveSection = function (key) {
    if (this._inspecting) {
      this._inspecting = false;
      try { this._store?.clearSelection(); } catch (_) { /* noop */ }
      this._selectedKey = null; this._selected = null;
      if (this._focusSet) this._clearFocus();
      if (typeof this._renderSelection === 'function') this._renderSelection();
    }
    this._activeSection = (this._activeSection === key) ? null : key;
    try { localStorage.setItem('cc:panel:active', this._activeSection || ''); } catch (_) { /* noop */ }
    this._renderLibrary();
  };

  /** Carga lazy de una seccion (productos/servicios/lugares/flows/briefs). */
  P._fetchLibrary = async function (key) {
    if (this._libCache[key] || this._libFetching?.[key]) return;
    if (!this._supabase) { this._libCache[key] = []; this._fillLibSection(key); return; }
    if (!this._libFetching) this._libFetching = {};
    this._libFetching[key] = true;
    const org = this._organizationId;
    const bid = this._containerRow?.id;
    try {
      let items = [];
      if (key === 'products') {
        const { data } = await this._supabase.from('products').select('id, nombre_producto').eq('organization_id', org).limit(200);
        items = (data || []).map((r) => ({ id: r.id, name: r.nombre_producto || 'Producto' }));
      } else if (key === 'services') {
        const { data } = await this._supabase.from('services').select('id, nombre_servicio').eq('organization_id', org).limit(200);
        items = (data || []).map((r) => ({ id: r.id, name: r.nombre_servicio || 'Servicio' }));
      } else if (key === 'places') {
        const { data: ents } = await this._supabase.from('brand_entities').select('id').eq('organization_id', org);
        const ids = (ents || []).map((e) => e.id);
        if (ids.length) {
          const { data } = await this._supabase.from('brand_places').select('id, nombre_lugar, city').in('entity_id', ids).limit(200);
          items = (data || []).map((r) => ({ id: r.id, name: r.nombre_lugar || 'Lugar', sub: r.city || '' }));
        }
      } else if (key === 'characters') {
        const { data: ents } = await this._supabase.from('brand_entities').select('id').eq('organization_id', org);
        const ids = (ents || []).map((e) => e.id);
        if (ids.length) {
          const { data } = await this._supabase.from('brand_characters').select('id, nombre_personaje, tipo_personaje').in('entity_id', ids).limit(200);
          items = (data || []).map((r) => ({ id: r.id, name: r.nombre_personaje || 'Personaje', sub: r.tipo_personaje || '' }));
        }
      } else if (key === 'flows') {
        const { data: { user } } = await this._supabase.auth.getUser();
        if (user?.id) {
          const { data } = await this._supabase.from('content_flows').select('id, name, output_type').eq('owner_id', user.id).limit(200);
          items = (data || []).map((r) => ({ id: r.id, name: r.name || 'Flow', sub: r.output_type || '' }));
        }
      } else if (key === 'briefs') {
        const { data } = await this._supabase.from('campaign_briefs').select('id, nombre').eq('brand_container_id', bid).limit(200);
        items = (data || []).map((r) => ({ id: r.id, name: r.nombre || 'Brief' }));
      }
      this._libCache[key] = items;
    } catch (e) {
      console.warn('CommandCenter fetchLibrary', key, e?.message);
      this._libCache[key] = [];
    } finally {
      if (this._libFetching) this._libFetching[key] = false;
      this._fillLibSection(key);
    }
  };

  /** Tras el fetch: rellena el body si la seccion sigue activa + actualiza el
      badge del rail. */
  P._fillLibSection = function (key) {
    const items = this._libItemsFor(key);
    if (this._activeSection === key) {
      const bodyEl = document.getElementById('ccPanelBody');
      if (bodyEl) bodyEl.innerHTML = this._libBodyHTML(key);
    }
    const railBtn = document.querySelector(`.cc-rail-btn[data-rail-sec="${cssEsc(key)}"]`);
    if (railBtn && Array.isArray(items)) {
      let badge = railBtn.querySelector('.cc-rail-badge');
      if (items.length) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'cc-rail-badge'; railBtn.appendChild(badge); }
        badge.textContent = String(items.length);
      } else if (badge) { badge.remove(); }
    }
  };

  /** Compat: el flujo de carga/mutaciones llama _renderCampaigns. */
  P._renderCampaigns = function () { this._renderLibrary(); };

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
    // Posicion = punto de drop, o centro del viewport si no hay coords (click).
    let w;
    if (clientX == null) {
      const canvas = document.getElementById('ccCanvas');
      const r = canvas.getBoundingClientRect();
      w = this._worldPointFromClient(r.left + r.width / 2, r.top + r.height / 2);
    } else {
      w = this._worldPointFromClient(clientX, clientY);
    }
    this._positions[`camp:${campId}`] = { x: Math.max(0, w.x - 120), y: Math.max(0, w.y - 20) };
    this._savePositions();
    // Si cayo sobre una audiencia, vincular.
    const audEl = clientX == null ? null : this._audienceNodeAt(clientX, clientY);
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

  // ------------------------------------------------------------------
  // Focus de flujo: resalta el componente conectado y atenua el resto.
  // ------------------------------------------------------------------
  P._computeFlowSet = function (rootKey) {
    const adj = new Map();
    const add = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
    this._allLinks().forEach((l) => { add(l.from, l.to); add(l.to, l.from); });
    const set = new Set([rootKey]);
    const q = [rootKey];
    while (q.length) {
      const k = q.shift();
      (adj.get(k) || []).forEach((n) => { if (!set.has(n)) { set.add(n); q.push(n); } });
    }
    return set;
  };

  P._applyFocus = function () {
    const canvas = document.getElementById('ccCanvas');
    if (!canvas) return;
    const on = !!(this._focusSet && this._focusSet.size);
    canvas.classList.toggle('cc-canvas--focusing', on);
    if (!on) {
      document.querySelectorAll('.cc-node--in-focus').forEach((n) => n.classList.remove('cc-node--in-focus'));
      document.querySelectorAll('.cc-edge--in-focus').forEach((g) => g.classList.remove('cc-edge--in-focus'));
      return;
    }
    document.querySelectorAll('#ccCanvasWorld .cc-node').forEach((n) => {
      n.classList.toggle('cc-node--in-focus', this._focusSet.has(n.getAttribute('data-node-key')));
    });
    document.querySelectorAll('#ccCanvasEdges .cc-edge').forEach((g) => {
      const f = g.getAttribute('data-edge-from'), t = g.getAttribute('data-edge-to');
      g.classList.toggle('cc-edge--in-focus', this._focusSet.has(f) && this._focusSet.has(t));
    });
  };

  P._focusFlow = function (rootKey) {
    this._focusSet = this._computeFlowSet(rootKey);
    this._focusedRoot = rootKey;
    this._applyFocus();
  };
  P._clearFocus = function () {
    this._focusSet = null; this._focusedRoot = null;
    this._applyFocus();
  };

  /** Centra el viewport sobre un nodo (para llevar el flujo a la vista). */
  P._centerOnNode = function (key) {
    const pos = this._positions[key];
    const canvas = document.getElementById('ccCanvas');
    if (!pos || !canvas) return;
    const r = canvas.getBoundingClientRect();
    const s = this._canvasScale || 1;
    this._canvasPan = { x: r.width / 2 - (pos.x + 130) * s, y: r.height / 2 - 90 * s };
    this._applyCanvasTransform();
    this._scheduleEdges();
  };

  /** Selecciona una campana del sidebar → la trae al canvas (si falta) y enfoca su flujo. */
  P._focusCampaignFromSidebar = function (id) {
    const c = (this._campaigns || []).find((x) => String(x.id) === String(id));
    if (!c) return;
    const key = `camp:${id}`;
    this._loadOnCanvas();
    if (!this._realOnCanvas(c)) this._addRealToCanvas(id);  // sin coords = centro
    else this._renderCanvas();
    this._focusFlow(key);
    this._centerOnNode(key);
  };

  // ------------------------------------------------------------------
  // Seleccion de nodo + informes (Claude)
  // ------------------------------------------------------------------
  P._selectNode = function (nodeEl) {
    const key = nodeEl.getAttribute('data-node-key');
    document.querySelectorAll('.cc-node--selected').forEach((n) => n.classList.remove('cc-node--selected'));
    // Re-click sobre el mismo nodo: deselecciona y limpia el focus.
    if (this._selectedKey === key) { this._selectedKey = null; this._selected = null; this._clearFocus(); return; }
    nodeEl.classList.add('cc-node--selected');
    this._selectedKey = key;
    this._selected = { type: nodeEl.getAttribute('data-type'), id: nodeEl.getAttribute('data-id'), key };
    // Para identity, el tipo util es el identityType.
    if (this._selected.type === 'identity') this._selected.type = nodeEl.getAttribute('data-identity-type');
    // Resalta el flujo conectado del nodo (atenua el resto).
    this._focusFlow(key);
  };

  P._loadMarkdownLibs = async function () {
    if (window.__mdLibsLoaded) return;
    if (this.constructor.__mdLibsLoading) return this.constructor.__mdLibsLoading;
    this.constructor.__mdLibsLoading = (async () => {
      const load = (src, ready) => new Promise((res) => {
        if (ready()) return res();
        const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = res;
        document.head.appendChild(s);
      });
      await Promise.all([
        load('https://cdn.jsdelivr.net/npm/marked@12/marked.min.js', () => window.marked),
        load('https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js', () => window.DOMPurify),
      ]);
      if (window.marked?.setOptions) window.marked.setOptions({ breaks: true, gfm: true });
      window.__mdLibsLoaded = true;
    })();
    return this.constructor.__mdLibsLoading;
  };

  P._openReport = function () {
    const bd = document.getElementById('ccReportBackdrop');
    if (bd) bd.style.display = 'flex';
  };
  P._closeReport = function () {
    const bd = document.getElementById('ccReportBackdrop');
    if (bd) bd.style.display = 'none';
  };

  P._generateReport = async function (scope) {
    const titleByScope = {
      all: 'Informe integral', campaign: 'Informe de campana', audience: 'Informe de audiencia',
      ecosystem: 'Aprendizaje del ecosistema', selection: 'Informe del seleccionado',
    };
    const body  = document.getElementById('ccReportBody');
    const titleEl = document.getElementById('ccReportTitle');
    const foot  = document.getElementById('ccReportFoot');
    if (titleEl) titleEl.innerHTML = `<i class="fas fa-file-lines"></i> ${this.escapeHtml(titleByScope[scope] || 'Informe')}`;
    if (foot) foot.textContent = '';

    // Resolver seleccion para los scopes que la requieren.
    let selected = null;
    if (scope === 'campaign') {
      if (!this._selected || !String(this._selected.type).startsWith('campaign')) { console.warn('[CC] generar informe: requiere campana seleccionada'); return; }
      selected = { type: this._selected.type, id: this._selected.id };
    } else if (scope === 'audience') {
      if (!this._selected || this._selected.type !== 'audience') { console.warn('[CC] generar informe: requiere audiencia seleccionada'); return; }
      selected = { type: 'audience', id: this._selected.id };
    } else if (scope === 'selection') {
      if (!this._selected) { console.warn('[CC] generar informe: requiere seleccion'); return; }
      selected = { type: this._selected.type, id: this._selected.id };
    }

    this._openReport();
    if (body) body.innerHTML = '<div class="cc-report-loading"><i class="fas fa-spinner fa-spin"></i> Vera esta redactando el informe…</div>';

    try {
      const { data: { session } } = await this._supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Sesion expirada');
      const res = await fetch('/.netlify/functions/api-generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ organization_id: this._organizationId, brand_container_id: this._containerRow?.id, scope, selected }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `Error ${res.status}`);

      this._lastReport = json.report || '';
      await this._loadMarkdownLibs();
      let html = this.escapeHtml(this._lastReport).replace(/\n/g, '<br>');
      if (window.marked && window.DOMPurify) {
        html = window.DOMPurify.sanitize(window.marked.parse(this._lastReport));
      }
      if (body) body.innerHTML = `<article class="cc-report-md">${html}</article>`;
      if (foot) foot.innerHTML = `<span class="cc-report-cost">${json.credits_charged != null ? `${Number(json.credits_charged).toFixed(2)} creditos` : ''}</span>`;
    } catch (e) {
      console.error('generate report:', e);
      if (body) body.innerHTML = `<div class="cc-report-error"><i class="fas fa-triangle-exclamation"></i> No se pudo generar el informe: ${this.escapeHtml(e?.message || 'error')}</div>`;
    }
  };

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------
  const _origDestroy = P.destroy;
  P.destroy = function () {
    const canvas = document.getElementById('ccCanvas');
    const list   = document.getElementById('ccPanelBody');
    const panel  = document.getElementById('ccSidebar');
    if (this._edgesRaf) { cancelAnimationFrame(this._edgesRaf); this._edgesRaf = null; }
    if (this._canvasResizeObs) { try { this._canvasResizeObs.disconnect(); } catch (_) {} this._canvasResizeObs = null; }
    if (canvas && this._canvasWheel)     { canvas.removeEventListener('wheel', this._canvasWheel); this._canvasWheel = null; }
    if (canvas && this._canvasMouseDown) { canvas.removeEventListener('mousedown', this._canvasMouseDown); this._canvasMouseDown = null; }
    if (canvas && this._canvasClick)     { canvas.removeEventListener('click', this._canvasClick); this._canvasClick = null; }
    if (canvas && this._canvasFieldEdit) { canvas.removeEventListener('input', this._canvasFieldEdit); canvas.removeEventListener('change', this._canvasFieldEdit); this._canvasFieldEdit = null; }
    if (canvas && this._canvasTagKey)    { canvas.removeEventListener('keydown', this._canvasTagKey); this._canvasTagKey = null; }
    if (canvas && this._canvasDragOver)  { canvas.removeEventListener('dragover', this._canvasDragOver); canvas.removeEventListener('dragleave', this._canvasDragLeave); canvas.removeEventListener('drop', this._canvasDrop); this._canvasDragOver = null; }
    if (list && this._campDragStart)     { list.removeEventListener('dragstart', this._campDragStart); list.removeEventListener('dragend', this._campDragEnd); this._campDragStart = null; }
    if (panel && this._panelClick)       { panel.removeEventListener('click', this._panelClick); this._panelClick = null; }
    if (panel && this._railKey)          { panel.removeEventListener('keydown', this._railKey); this._railKey = null; }
    if (this._reportDocClick)            { document.removeEventListener('click', this._reportDocClick); this._reportDocClick = null; }
    if (typeof _origDestroy === 'function') _origDestroy.call(this);
  };

  /** Escapa un valor para usarlo dentro de un selector de atributo. */
  function cssEsc(v) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(v);
    return String(v).replace(/["\\\]]/g, '\\$&');
  }
})();
