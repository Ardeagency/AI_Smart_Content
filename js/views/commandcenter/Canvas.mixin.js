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
 * - Click en nodo conceptual/audiencia → editor existente (_openEditor).
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

  /** Lista normalizada de nodos del canvas. */
  P._canvasNodes = function () {
    const auds = (this._audiences || []).map((a) => ({
      key: `aud:${a.id}`, type: 'audience', id: a.id, row: a,
    }));
    const camps = (this._campaigns || []).map((c) => ({
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

  P._nodeAudienceHTML = function (n, pos) {
    const a = n.row;
    const aw = {
      unaware: 'Unaware', problem_aware: 'Problem aware', solution_aware: 'Solution aware',
      product_aware: 'Product aware', most_aware: 'Most aware',
    }[a.awareness_level] || 'Sin awareness';
    const score = a.alignment_score != null ? `${Math.round(Number(a.alignment_score) * 100)}%` : null;
    return `
    <div class="cc-node cc-node--audience" data-node-key="${n.key}" data-type="audience" data-id="${this.escapeHtml(String(n.id))}" style="left:${pos.x}px;top:${pos.y}px;">
      <div class="cc-node-head" data-drag-handle>
        <span class="cc-node-icon"><i class="fas fa-users"></i></span>
        <span class="cc-node-title" title="${this.escapeHtml(a.name || 'Audiencia')}">${this.escapeHtml(a.name || 'Audiencia')}</span>
        <div class="cc-node-actions">
          <button type="button" class="cc-node-act cc-node-edit" title="Editar"><i class="fas fa-pen"></i></button>
          <button type="button" class="cc-node-act cc-node-delete" title="Eliminar"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div class="cc-node-body">
        <span class="cc-node-tag cc-node-tag--aud">${this.escapeHtml(aw)}</span>
        ${score ? `<span class="cc-node-meta"><i class="fas fa-bullseye"></i> ${score} alineacion</span>` : ''}
      </div>
      <span class="cc-node-port cc-node-port--out" data-port="out" title="Arrastra hacia una campana para vincular"></span>
    </div>`;
  };

  P._nodeCampaignHTML = function (n, pos) {
    const c = n.row;
    const isReal = n.type === 'campaign-real';
    const platformLabel = { meta_instagram: 'Instagram', meta_facebook: 'Facebook', google_ads: 'Google Ads', tiktok_ads: 'TikTok', linkedin_ads: 'LinkedIn', pinterest_ads: 'Pinterest', organic: 'Organico', internal: 'Interno' };
    const platLabel = platformLabel[c.platform] || (c.platform ? c.platform.replace(/_/g, ' ') : '');
    const kindBadge = isReal
      ? '<span class="cc-node-badge cc-node-badge--real">Real</span>'
      : '<span class="cc-node-badge cc-node-badge--concept">Conceptual</span>';
    const platBadge = platLabel ? `<span class="cc-node-badge cc-node-badge--plat">${this.escapeHtml(platLabel)}</span>` : '';
    const actions = isReal ? '' : `
        <div class="cc-node-actions">
          <button type="button" class="cc-node-act cc-node-edit" title="Editar"><i class="fas fa-pen"></i></button>
          <button type="button" class="cc-node-act cc-node-delete" title="Eliminar"><i class="fas fa-times"></i></button>
        </div>`;
    const linked = !!c.persona_id;
    return `
    <div class="cc-node cc-node--campaign ${isReal ? 'cc-node--readonly' : ''}" data-node-key="${n.key}" data-type="${n.type}" data-id="${this.escapeHtml(String(n.id))}" style="left:${pos.x}px;top:${pos.y}px;">
      <span class="cc-node-port cc-node-port--in ${linked ? 'cc-node-port--linked' : ''}" data-port="in" title="Audiencia objetivo"></span>
      <div class="cc-node-head" data-drag-handle>
        <span class="cc-node-icon cc-node-icon--camp"><i class="fas fa-bullhorn"></i></span>
        <span class="cc-node-title" title="${this.escapeHtml(c.nombre_campana || 'Campana')}">${this.escapeHtml(c.nombre_campana || 'Campana')}</span>
        ${actions}
      </div>
      <div class="cc-node-body">
        <div class="cc-node-badges">${kindBadge}${platBadge}</div>
        ${c.status ? `<span class="cc-node-meta"><i class="fas fa-circle-dot"></i> ${this.escapeHtml(c.status)}</span>` : ''}
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

        // Botones de accion: dejar que el click los maneje, sin drag ni pan.
        if (e.target.closest('.cc-node-act') || e.target.closest('.cc-edge-disconnect')) return;

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

    // Click en acciones / nodo → editar o eliminar
    if (!this._canvasClick) {
      this._canvasClick = (e) => {
        const nodeEl = e.target.closest('.cc-node');
        if (!nodeEl) return;
        const type = nodeEl.getAttribute('data-type');
        const id   = nodeEl.getAttribute('data-id');
        if (e.target.closest('.cc-node-delete')) {
          e.preventDefault(); e.stopPropagation();
          const et = type === 'audience' ? 'audience' : 'campaign-concept';
          this._confirmAndDelete(et, id, null);
          return;
        }
        if (e.target.closest('.cc-node-edit')) {
          e.preventDefault(); e.stopPropagation();
          this._openEditor(type === 'audience' ? 'audience' : 'campaign-concept', id);
          return;
        }
        if (e.target.closest('.cc-node-port')) return;
        // Click simple en el cuerpo (no drag) → abrir editor (real = no editable)
        if (this._didDrag) return;
        if (type === 'campaign-real') return;
        this._openEditor(type === 'audience' ? 'audience' : 'campaign-concept', id);
      };
      canvas.addEventListener('click', this._canvasClick);
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

    const campCount = document.getElementById('ccCampCount');
    if (campCount) campCount.textContent = String(real);
  };

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------
  const _origDestroy = P.destroy;
  P.destroy = function () {
    const canvas = document.getElementById('ccCanvas');
    if (this._canvasResizeObs) { try { this._canvasResizeObs.disconnect(); } catch (_) {} this._canvasResizeObs = null; }
    if (canvas && this._canvasWheel)     { canvas.removeEventListener('wheel', this._canvasWheel); this._canvasWheel = null; }
    if (canvas && this._canvasMouseDown) { canvas.removeEventListener('mousedown', this._canvasMouseDown); this._canvasMouseDown = null; }
    if (canvas && this._canvasClick)     { canvas.removeEventListener('click', this._canvasClick); this._canvasClick = null; }
    if (typeof _origDestroy === 'function') _origDestroy.call(this);
  };

  /** Escapa un valor para usarlo dentro de un selector de atributo. */
  function cssEsc(v) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(v);
    return String(v).replace(/["\\\]]/g, '\\$&');
  }
})();
