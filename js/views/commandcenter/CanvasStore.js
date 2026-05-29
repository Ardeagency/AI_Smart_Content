/**
 * CommandCenterView — CanvasStore (F1.1)
 *
 * Store unificado del canvas. Centraliza el estado disperso que vivia en
 * this._positions, this._collapsed, this._onCanvas, this._placed, this._links,
 * this._canvasScale, this._canvasPan, this._selected / this._selectedKey
 * en una sola fuente de verdad por instancia de vista.
 *
 * Modelo:
 *   nodes:
 *     positions  Object<key, {x,y}>     posicion world-coords por nodo
 *     collapsed  Set<key>                nodos colapsados
 *     onCanvas   Set<campaignId-string>  campanas reales puestas en el lienzo
 *     placed     Array<{type,id}>        identities (productos/servicios/...) en el lienzo
 *   edges:
 *     freeLinks  Array<{from,to}>        links libres (visual). persona_id NO vive aqui:
 *                                        ese vive en campaigns.persona_id (BD live).
 *   viewport     {x, y, scale}
 *   selection    {key, descriptor} | null
 *
 * Mutaciones devuelven info suficiente para que F1.2 las envuelva en commands
 * con undo (prev/next o las claves opuestas para invertir).
 *
 * Persistencia: hoy LocalStorageAdapter con las mismas keys que ya usaba
 * Canvas.mixin (`cc:canvas:pos|oncanvas|placed|links:<brand>`). F1.6/F1.7 la
 * cambian a Supabase sin tocar este archivo.
 *
 * Patron de uso desde Canvas.mixin: las refs (positions/collapsed/onCanvas/
 * placed/freeLinks) se comparten por referencia con la vista para que el
 * codigo existente que lee `this._positions[key]` siga funcionando sin
 * cambios. Las mutaciones se hacen IN PLACE; jamas se reasignan estas refs.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (typeof CommandCenterView === 'undefined') return;

  // ------------------------------------------------------------------
  // Emitter minimal (sin deps)
  // ------------------------------------------------------------------
  class Emitter {
    constructor() { this._listeners = Object.create(null); }
    on(event, fn) {
      (this._listeners[event] = this._listeners[event] || []).push(fn);
      return () => this.off(event, fn);
    }
    off(event, fn) {
      const arr = this._listeners[event];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i !== -1) arr.splice(i, 1);
    }
    emit(event, payload) {
      const arr = this._listeners[event];
      if (!arr) return;
      arr.slice().forEach((fn) => {
        try { fn(payload); }
        catch (e) { console.error('CanvasStore listener error', event, e); }
      });
    }
  }

  // ------------------------------------------------------------------
  // Adapter de persistencia: localStorage por brand_container.
  // F1.6/F1.7 lo sustituyen por uno que escribe a canvas_edges / canvas_views.
  // ------------------------------------------------------------------
  class LocalStorageAdapter {
    constructor(scopeId) { this.scope = String(scopeId || 'unknown'); }
    _key(suffix) { return `cc:canvas:${suffix}:${this.scope}`; }
    readJSON(suffix, fallback) {
      try {
        const raw = localStorage.getItem(this._key(suffix));
        if (raw == null) return fallback;
        const parsed = JSON.parse(raw);
        return parsed == null ? fallback : parsed;
      } catch (_) { return fallback; }
    }
    writeJSON(suffix, value) {
      try { localStorage.setItem(this._key(suffix), JSON.stringify(value)); }
      catch (_) { /* quota / private mode: no critico, posiciones efimeras */ }
    }
  }

  // ------------------------------------------------------------------
  // CanvasStore
  // ------------------------------------------------------------------
  class CanvasStore extends Emitter {
    constructor(scopeId, opts) {
      super();
      this.scope = String(scopeId || 'unknown');
      this.persistence = (opts && opts.persistence) || new LocalStorageAdapter(this.scope);
      this.nodes = {
        positions: Object.create(null),
        collapsed: new Set(),
        onCanvas:  new Set(),
        placed:    [],
      };
      this.edges = { freeLinks: [] };
      this.viewport = { x: 0, y: 0, scale: 1 };
      this.selection = null;
      this._hydrate();
    }

    /* ── Hydration ────────────────────────────────────────────────────── */
    _hydrate() {
      const pos = this.persistence.readJSON('pos', {}) || {};
      Object.keys(pos).forEach((k) => {
        const p = pos[k];
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          this.nodes.positions[k] = { x: p.x, y: p.y };
        }
      });
      const oc = this.persistence.readJSON('oncanvas', []);
      (Array.isArray(oc) ? oc : []).forEach((id) => this.nodes.onCanvas.add(String(id)));
      const placed = this.persistence.readJSON('placed', []);
      (Array.isArray(placed) ? placed : []).forEach((p) => {
        if (p && p.type != null && p.id != null) this.nodes.placed.push({ type: String(p.type), id: String(p.id) });
      });
      const links = this.persistence.readJSON('links', []);
      (Array.isArray(links) ? links : []).forEach((l) => {
        if (l && l.from && l.to) this.edges.freeLinks.push({ from: String(l.from), to: String(l.to) });
      });
    }

    /* ── Persistencia (escritura) ─────────────────────────────────────── */
    persistPositions() { this.persistence.writeJSON('pos', this.nodes.positions); }
    persistOnCanvas()  { this.persistence.writeJSON('oncanvas', [...this.nodes.onCanvas]); }
    persistPlaced()    { this.persistence.writeJSON('placed', this.nodes.placed); }
    persistFreeLinks() { this.persistence.writeJSON('links', this.edges.freeLinks); }

    /* ── Mutaciones: nodos ────────────────────────────────────────────── */
    setNodePosition(key, x, y) {
      if (!key || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      const cur = this.nodes.positions[key];
      const prev = cur ? { x: cur.x, y: cur.y } : null;
      if (cur) { cur.x = x; cur.y = y; }
      else { this.nodes.positions[key] = { x, y }; }
      this.persistPositions();
      this._emitMutation('node-position', { key, prev, next: { x, y } });
      return prev;
    }

    /** Borrar todas las posiciones (relayout). Mutacion in place. */
    clearPositions() {
      const prev = {};
      Object.keys(this.nodes.positions).forEach((k) => {
        prev[k] = { x: this.nodes.positions[k].x, y: this.nodes.positions[k].y };
        delete this.nodes.positions[k];
      });
      this.persistPositions();
      this._emitMutation('positions-cleared', { prev });
      return prev;
    }

    setCollapsed(key, collapsed) {
      if (!key) return false;
      const was = this.nodes.collapsed.has(key);
      const next = !!collapsed;
      if (was === next) return false;
      if (next) this.nodes.collapsed.add(key);
      else this.nodes.collapsed.delete(key);
      this._emitMutation('node-collapsed', { key, prev: was, next });
      return true;
    }

    addOnCanvas(campaignId) {
      const id = String(campaignId);
      if (!id || this.nodes.onCanvas.has(id)) return false;
      this.nodes.onCanvas.add(id);
      this.persistOnCanvas();
      this._emitMutation('on-canvas-add', { id });
      return true;
    }

    removeOnCanvas(campaignId) {
      const id = String(campaignId);
      if (!this.nodes.onCanvas.has(id)) return false;
      this.nodes.onCanvas.delete(id);
      this.persistOnCanvas();
      this._emitMutation('on-canvas-remove', { id });
      return true;
    }

    addPlaced(type, id) {
      if (!type || id == null) return false;
      const t = String(type), i = String(id);
      const dup = this.nodes.placed.some((p) => p.type === t && p.id === i);
      if (dup) return false;
      this.nodes.placed.push({ type: t, id: i });
      this.persistPlaced();
      this._emitMutation('placed-add', { type: t, id: i });
      return true;
    }

    removePlaced(type, id) {
      const t = String(type), i = String(id);
      const before = this.nodes.placed.length;
      // mutacion in place: filtramos a una copia y reescribimos el mismo array
      const keep = this.nodes.placed.filter((p) => !(p.type === t && p.id === i));
      if (keep.length === before) return false;
      this.nodes.placed.length = 0;
      keep.forEach((p) => this.nodes.placed.push(p));
      this.persistPlaced();
      this._emitMutation('placed-remove', { type: t, id: i });
      return true;
    }

    /* ── Mutaciones: edges libres ─────────────────────────────────────── */
    /**
     * Agrega un link libre (visual). NO maneja persona_id (audiencia↔campana);
     * eso vive en BD y lo escribe Canvas.mixin via _connectCampaignToPersona.
     * Devuelve true si se agrego, false si era duplicado.
     */
    addFreeLink(from, to) {
      const f = String(from || ''), t = String(to || '');
      if (!f || !t || f === t) return false;
      const dup = this.edges.freeLinks.some((l) =>
        (l.from === f && l.to === t) || (l.from === t && l.to === f));
      if (dup) return false;
      this.edges.freeLinks.push({ from: f, to: t });
      this.persistFreeLinks();
      this._emitMutation('free-link-add', { from: f, to: t });
      return true;
    }

    removeFreeLink(from, to) {
      const f = String(from || ''), t = String(to || '');
      const before = this.edges.freeLinks.length;
      const keep = this.edges.freeLinks.filter((l) =>
        !((l.from === f && l.to === t) || (l.from === t && l.to === f)));
      if (keep.length === before) return false;
      this.edges.freeLinks.length = 0;
      keep.forEach((l) => this.edges.freeLinks.push(l));
      this.persistFreeLinks();
      this._emitMutation('free-link-remove', { from: f, to: t });
      return true;
    }

    /* ── Mutaciones: viewport ─────────────────────────────────────────── */
    setViewport(next) {
      const cur = this.viewport;
      const merged = {
        x:     (next && Number.isFinite(next.x))     ? next.x     : cur.x,
        y:     (next && Number.isFinite(next.y))     ? next.y     : cur.y,
        scale: (next && Number.isFinite(next.scale)) ? next.scale : cur.scale,
      };
      if (merged.x === cur.x && merged.y === cur.y && merged.scale === cur.scale) return false;
      const prev = { x: cur.x, y: cur.y, scale: cur.scale };
      this.viewport.x = merged.x;
      this.viewport.y = merged.y;
      this.viewport.scale = merged.scale;
      this._emitMutation('viewport', { prev, next: { ...this.viewport } });
      return true;
    }

    /* ── Mutaciones: seleccion ────────────────────────────────────────── */
    setSelection(sel) {
      const prev = this.selection;
      if (!sel) {
        if (!prev) return false;
        this.selection = null;
      } else {
        if (prev && prev.key === sel.key) return false;
        this.selection = { key: String(sel.key), descriptor: sel.descriptor || null };
      }
      this._emitMutation('selection', { prev, next: this.selection });
      return true;
    }

    /* ── Re-scope (cambio de brand_container) ─────────────────────────── */
    rescope(newScopeId) {
      const next = String(newScopeId || 'unknown');
      if (next === this.scope) return;
      this.scope = next;
      this.persistence = new LocalStorageAdapter(this.scope);
      Object.keys(this.nodes.positions).forEach((k) => delete this.nodes.positions[k]);
      this.nodes.collapsed.clear();
      this.nodes.onCanvas.clear();
      this.nodes.placed.length = 0;
      this.edges.freeLinks.length = 0;
      this.viewport.x = 0; this.viewport.y = 0; this.viewport.scale = 1;
      this.selection = null;
      this._hydrate();
      this._emitMutation('rescope', { scope: this.scope });
    }

    /* ── Emit helper ──────────────────────────────────────────────────── */
    _emitMutation(kind, payload) {
      this.emit(`mutated:${kind}`, payload);
      this.emit('mutated', { kind, ...(payload || {}) });
    }
  }

  // Expose para inspeccion / tests
  window.CommandCenterCanvasStore = CanvasStore;

  // ------------------------------------------------------------------
  // Bridge: integrar el store con la vista sin romper render existente.
  //
  // La vista sigue leyendo this._positions / this._collapsed / this._onCanvas
  // / this._placed / this._links igual que antes; ahora esas refs SON el
  // estado del store (mismo objeto). Los _load*/_save* delegan al store.
  // Los dos sitios que reasignaban (_relayout y _removeLink) se reescriben
  // para mutar in place via el store.
  // ------------------------------------------------------------------
  const P = CommandCenterView.prototype;

  P._ensureStore = function () {
    const scope = this._containerRow?.id || 'unknown';
    if (!this._store) {
      this._store = new CanvasStore(scope);
    } else if (this._store.scope !== String(scope)) {
      this._store.rescope(scope);
    }
    // refs compartidas: el codigo existente sigue funcionando
    this._positions = this._store.nodes.positions;
    this._collapsed = this._store.nodes.collapsed;
    this._onCanvas  = this._store.nodes.onCanvas;
    this._placed    = this._store.nodes.placed;
    this._links     = this._store.edges.freeLinks;
    return this._store;
  };

  // _load*: ahora simplemente garantizan el store y devuelven la ref.
  // Reemplazan a las implementaciones de Canvas.mixin (que leian localStorage
  // directo y reasignaban this._*).
  P._loadPositions = function () { this._ensureStore(); return this._positions; };
  P._loadOnCanvas  = function () { this._ensureStore(); return this._onCanvas;  };
  P._loadPlaced    = function () { this._ensureStore(); return this._placed;   };
  P._loadLinks     = function () { this._ensureStore(); return this._links;    };

  // _save*: delegan al store (que escribe via su adapter).
  P._savePositions = function () { if (this._store) this._store.persistPositions(); };
  P._saveOnCanvas  = function () { if (this._store) this._store.persistOnCanvas();  };
  P._savePlaced    = function () { if (this._store) this._store.persistPlaced();   };
  P._saveLinks     = function () { if (this._store) this._store.persistFreeLinks(); };

  // _relayout reasignaba this._positions = {}; ahora vacia in place via store.
  P._relayout = function () {
    this._ensureStore();
    this._store.clearPositions();
    this._store.setViewport({ x: 0, y: 0, scale: 1 });
    this._canvasPan = { x: 0, y: 0 };
    this._canvasScale = 1;
    this._renderCanvas();
  };

  // _removeLink reasignaba this._links = this._links.filter(...); ahora muta
  // in place via store.removeFreeLink. La rama persona_id sigue intacta.
  P._removeLink = function (fromKey, toKey) {
    if (fromKey && fromKey.startsWith('aud:') && toKey && toKey.startsWith('camp:')) {
      this._disconnectCampaign(toKey.slice(5));
      return;
    }
    this._ensureStore();
    this._store.removeFreeLink(fromKey, toKey);
    this._renderCanvas();
  };

  // _addLink ya mutaba in place (this._links.push), pero centralizamos via
  // store para validacion uniforme + futuro hook de undo.
  P._addLink = function (fromKey, toKey) {
    if (fromKey && fromKey.startsWith('aud:') && toKey && toKey.startsWith('camp:')) {
      this._connectCampaignToPersona(toKey.slice(5), fromKey.slice(4));
      return;
    }
    this._ensureStore();
    this._store.addFreeLink(fromKey, toKey);
    this._renderCanvas();
  };

  // _removeIdentityFromCanvas reasignaba this._placed y this._links via filter.
  // Ahora muta in place via mutators del store, preservando shared refs.
  P._removeIdentityFromCanvas = function (type, id) {
    const key = `${type}:${id}`;
    this._ensureStore();
    this._store.removePlaced(type, id);
    // borrar tambien todos los links libres que tocaban a ese nodo
    const toDrop = (this._store.edges.freeLinks || [])
      .filter((l) => l.from === key || l.to === key)
      .map((l) => ({ from: l.from, to: l.to }));
    toDrop.forEach((l) => this._store.removeFreeLink(l.from, l.to));
    this._renderCanvas();
    this._renderLibrary();
  };

  // Sync viewport: cuando el view setea zoom/pan, espejar al store para
  // que F1.7 pueda persistirlo en canvas_views sin re-cablear todo. No
  // cambia comportamiento existente; solo añade un observador delgado.
  const _origApplyCanvasTransform = P._applyCanvasTransform;
  if (typeof _origApplyCanvasTransform === 'function') {
    P._applyCanvasTransform = function () {
      const r = _origApplyCanvasTransform.apply(this, arguments);
      if (this._store && (Number.isFinite(this._canvasScale) || this._canvasPan)) {
        this._store.setViewport({
          x: this._canvasPan?.x, y: this._canvasPan?.y, scale: this._canvasScale,
        });
      }
      return r;
    };
  }

  // Sync seleccion: espejo desde _selectNode al store. Util para F1.3
  // (multi-select) y F1.12 (side-panel inspector) sin tocar render hoy.
  const _origSelectNode = P._selectNode;
  if (typeof _origSelectNode === 'function') {
    P._selectNode = function (nodeEl) {
      const r = _origSelectNode.apply(this, arguments);
      this._ensureStore();
      if (this._selectedKey) {
        this._store.setSelection({ key: this._selectedKey, descriptor: this._selected });
      } else {
        this._store.setSelection(null);
      }
      return r;
    };
  }

  // Cleanup: liberar listeners del store al destruir la vista.
  const _origDestroy = P.destroy;
  P.destroy = function () {
    if (this._store) {
      // dejamos el store en su sitio (la vista se descarta), pero limpiamos
      // listeners por si alguien externo se suscribio durante el ciclo.
      this._store._listeners = Object.create(null);
    }
    if (typeof _origDestroy === 'function') _origDestroy.apply(this, arguments);
  };
})();
