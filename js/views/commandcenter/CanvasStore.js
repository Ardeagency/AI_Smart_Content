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
      // F2-prep: estrategia activa (n8n-flow-like container). this.scope sigue
      // siendo brand_container_id por compat de localStorage; this.strategyId
      // es lo que filtra las queries BD de F1.6/F1.7/F1.10/F1.11.
      this.strategyId = null;
      this.strategy   = null;
      // Seleccion (F1.3 multi-select):
      //   selection        = {key, descriptor} | null   — primary
      //   selectionSet     = Set<key>                   — todos los seleccionados
      //   selectionDescriptors = Map<key, descriptor>   — info por key
      // Convencion: si selectionSet.size === 1, selection.key === el unico.
      // Si === 0, selection === null. Si > 1, selection.key es el primary
      // (usado para focus flow / inspector / informes).
      this.selection = null;
      this.selectionSet = new Set();
      this.selectionDescriptors = new Map();
      // F1.2: pila de undo/redo. Los commands viven en memoria (no se
      // persisten cross-session: cerrar el navegador limpia el historial).
      this.history = { past: [], future: [], limit: 200 };
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
    /**
     * Seleccion single (click plano): vacia el set y deja un solo elemento
     * (o ninguno si sel es null/undefined).
     */
    setSelection(sel) {
      const prev = this.selection;
      if (!sel) {
        if (!prev && this.selectionSet.size === 0) return false;
        this.selection = null;
        this.selectionSet.clear();
        this.selectionDescriptors.clear();
        this._emitMutation('selection', { prev, next: null, set: [] });
        return true;
      }
      const k = String(sel.key);
      if (prev && prev.key === k && this.selectionSet.size === 1) return false;
      this.selection = { key: k, descriptor: sel.descriptor || null };
      this.selectionSet.clear();
      this.selectionSet.add(k);
      this.selectionDescriptors.clear();
      this.selectionDescriptors.set(k, sel.descriptor || null);
      this._emitMutation('selection', { prev, next: this.selection, set: [k] });
      return true;
    }

    /**
     * Toggle de un elemento en el set (shift+click).
     * - Si estaba: lo quita; si era primary, primary salta a otro del set o null.
     * - Si no estaba: lo agrega; si no habia primary, este se vuelve primary.
     */
    toggleSelection(key, descriptor) {
      const k = String(key);
      if (this.selectionSet.has(k)) {
        this.selectionSet.delete(k);
        this.selectionDescriptors.delete(k);
        if (this.selection && this.selection.key === k) {
          const next = this.selectionSet.values().next().value;
          this.selection = next
            ? { key: next, descriptor: this.selectionDescriptors.get(next) || null }
            : null;
        }
      } else {
        this.selectionSet.add(k);
        this.selectionDescriptors.set(k, descriptor || null);
        if (!this.selection) this.selection = { key: k, descriptor: descriptor || null };
      }
      this._emitMutation('selection', { next: this.selection, set: [...this.selectionSet] });
      return true;
    }

    /** Agrega al set sin tocar primary salvo que no exista. */
    addToSelection(key, descriptor) {
      const k = String(key);
      if (this.selectionSet.has(k)) return false;
      this.selectionSet.add(k);
      this.selectionDescriptors.set(k, descriptor || null);
      if (!this.selection) this.selection = { key: k, descriptor: descriptor || null };
      this._emitMutation('selection', { next: this.selection, set: [...this.selectionSet] });
      return true;
    }

    removeFromSelection(key) {
      const k = String(key);
      if (!this.selectionSet.has(k)) return false;
      this.selectionSet.delete(k);
      this.selectionDescriptors.delete(k);
      if (this.selection && this.selection.key === k) {
        const next = this.selectionSet.values().next().value;
        this.selection = next
          ? { key: next, descriptor: this.selectionDescriptors.get(next) || null }
          : null;
      }
      this._emitMutation('selection', { next: this.selection, set: [...this.selectionSet] });
      return true;
    }

    /** Reemplaza el set completo (marquee). primary opcional; si no esta en keys, usa el primero. */
    selectMulti(keys, primary, descMap) {
      this.selectionSet.clear();
      this.selectionDescriptors.clear();
      (keys || []).forEach((k) => {
        const ks = String(k);
        this.selectionSet.add(ks);
        if (descMap && typeof descMap.get === 'function') {
          const d = descMap.get(k);
          if (d) this.selectionDescriptors.set(ks, d);
        }
      });
      let p = primary && this.selectionSet.has(String(primary)) ? String(primary) : null;
      if (!p) {
        const first = this.selectionSet.values().next().value;
        p = first || null;
      }
      this.selection = p
        ? { key: p, descriptor: this.selectionDescriptors.get(p) || null }
        : null;
      this._emitMutation('selection', { next: this.selection, set: [...this.selectionSet] });
      return true;
    }

    clearSelection() {
      if (!this.selection && this.selectionSet.size === 0) return false;
      this.selection = null;
      this.selectionSet.clear();
      this.selectionDescriptors.clear();
      this._emitMutation('selection', { next: null, set: [] });
      return true;
    }

    /* ── Cambio de estrategia activa (F2-prep) ─────────────────────────── */
    setStrategy(strategyId, strategy) {
      const next = strategyId ? String(strategyId) : null;
      if (next === this.strategyId) return false;
      const prev = this.strategyId;
      this.strategyId = next;
      this.strategy = strategy || null;
      // Cambio de estrategia → invalida estado canvas-derivado.
      // Las refs (edges, etc.) las vuelve a hidratar el bridge desde BD.
      this.edges.freeLinks.length = 0;
      this.persistFreeLinks();
      Object.keys(this.nodes.positions).forEach((k) => delete this.nodes.positions[k]);
      this.persistPositions();
      this.nodes.collapsed.clear();
      this.nodes.onCanvas.clear();
      this.persistOnCanvas();
      this.nodes.placed.length = 0;
      this.persistPlaced();
      this.viewport.x = 0; this.viewport.y = 0; this.viewport.scale = 1;
      this.selection = null;
      this.selectionSet.clear();
      this.selectionDescriptors.clear();
      // Historial pertenece a la estrategia tambien
      this.history.past.length = 0;
      this.history.future.length = 0;
      this._emitMutation('strategy-changed', { prev, next, strategy: this.strategy });
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
      this.selectionSet.clear();
      this.selectionDescriptors.clear();
      // F2-prep: cambio de brand tambien tira estrategia activa
      this.strategyId = null;
      this.strategy = null;
      // Historial pertenece al scope; cambiar de marca tira undo/redo.
      this.history.past.length = 0;
      this.history.future.length = 0;
      this._hydrate();
      this._emitMutation('rescope', { scope: this.scope });
    }

    /* ── Historia / command pattern (F1.2) ─────────────────────────────── */
    /**
     * Ejecuta un command y lo apila para undo.
     * Un command es { kind, label, do(), undo(), mergeable?, mergeWith?(other) }.
     * Si el ultimo command en la pila es del mismo kind y se puede mergear,
     * lo absorbe (util para drags pixel a pixel: 1 entrada de undo, no 80).
     */
    dispatch(command) {
      if (!command || typeof command.do !== 'function' || typeof command.undo !== 'function') return false;
      let didApply;
      try { didApply = command.do(); }
      catch (e) { console.error('CanvasStore dispatch do() error', command.kind, e); return false; }
      // Si do() devolvio false explicito, la mutacion fue no-op (duplicado,
      // out-of-bounds, etc). No ensuciamos la historia con un command vacio.
      if (didApply === false) return false;
      const last = this.history.past[this.history.past.length - 1];
      if (last && command.mergeable && last.kind === command.kind && typeof last.mergeWith === 'function' && last.mergeWith(command)) {
        // merged into last; no apilar duplicado
      } else {
        this.history.past.push(command);
        while (this.history.past.length > this.history.limit) this.history.past.shift();
      }
      if (this.history.future.length) this.history.future.length = 0;
      this._emitMutation('history', { past: this.history.past.length, future: this.history.future.length, last: command.kind });
      return true;
    }

    undo() {
      const cmd = this.history.past.pop();
      if (!cmd) return false;
      try { cmd.undo(); }
      catch (e) { console.error('CanvasStore undo() error', cmd.kind, e); this.history.past.push(cmd); return false; }
      this.history.future.push(cmd);
      this._emitMutation('history', { past: this.history.past.length, future: this.history.future.length, undone: cmd.kind });
      return true;
    }

    redo() {
      const cmd = this.history.future.pop();
      if (!cmd) return false;
      try { cmd.do(); }
      catch (e) { console.error('CanvasStore redo() error', cmd.kind, e); this.history.future.push(cmd); return false; }
      this.history.past.push(cmd);
      this._emitMutation('history', { past: this.history.past.length, future: this.history.future.length, redone: cmd.kind });
      return true;
    }

    canUndo() { return this.history.past.length > 0; }
    canRedo() { return this.history.future.length > 0; }

    clearHistory() {
      if (!this.history.past.length && !this.history.future.length) return;
      this.history.past.length = 0;
      this.history.future.length = 0;
      this._emitMutation('history', { past: 0, future: 0 });
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
  // CanvasCommands (F1.2): fabrica de commands para store.dispatch.
  // Cada command captura el estado previo necesario para que undo()
  // reverse la mutacion sin tocar BD. Lo que toca BD (persona_id,
  // edicion de campos de audiencia/campana) se queda FUERA de la
  // historia visual — es responsabilidad del callsite hacer rollback
  // optimista (ya lo hace _connectCampaignToPersona).
  // ------------------------------------------------------------------
  function CanvasCommands(store) {
    return {
      moveNode(key, fromX, fromY, toX, toY) {
        // mergeable: drags consecutivos del mismo nodo colapsan en 1 entrada
        return {
          kind: 'move-node', key, label: 'Mover nodo',
          toX, toY,
          do()   { store.setNodePosition(this.key, this.toX, this.toY); },
          undo() { store.setNodePosition(this.key, fromX, fromY); },
          mergeable: true,
          mergeWith(other) {
            if (other.kind !== this.kind || other.key !== this.key) return false;
            // mantenemos el from original (fromX/fromY) por closure; solo avanzamos el to
            this.toX = other.toX; this.toY = other.toY;
            return true;
          },
        };
      },

      addFreeLink(from, to) {
        return {
          kind: 'free-link-add', label: 'Crear conexion',
          do()   { return store.addFreeLink(from, to); },     // false si duplicado
          undo() { store.removeFreeLink(from, to); },
        };
      },

      removeFreeLink(from, to) {
        return {
          kind: 'free-link-remove', label: 'Quitar conexion',
          do()   { return store.removeFreeLink(from, to); },  // false si no existia
          undo() { store.addFreeLink(from, to); },
        };
      },

      /**
       * placed-add: agregar un identity (producto/servicio/.../brief) al lienzo.
       * Preserva extras (name/sub) que el store.addPlaced base no acepta.
       */
      addPlaced(type, id, extras, pos) {
        const t = String(type), i = String(id);
        const key = `${t}:${i}`;
        return {
          kind: 'placed-add', label: 'Agregar al lienzo',
          do() {
            const exists = store.nodes.placed.some((p) => p.type === t && p.id === i);
            if (!exists) {
              const node = { type: t, id: i };
              if (extras && typeof extras === 'object') {
                if (extras.name != null) node.name = String(extras.name);
                if (extras.sub  != null) node.sub  = String(extras.sub);
              }
              store.nodes.placed.push(node);
              store.persistPlaced();
              store._emitMutation('placed-add', { type: t, id: i });
            }
            if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
              store.setNodePosition(key, pos.x, pos.y);
            }
          },
          undo() { store.removePlaced(t, i); },
        };
      },

      /**
       * placed-remove: capturar pos + links libres tocando al nodo para poder
       * restaurar todo en undo.
       */
      removePlaced(type, id) {
        const t = String(type), i = String(id);
        const key = `${t}:${i}`;
        const prevPlaced = store.nodes.placed.find((p) => p.type === t && p.id === i);
        const prevExtras = prevPlaced ? { name: prevPlaced.name, sub: prevPlaced.sub } : null;
        const prevPos = store.nodes.positions[key]
          ? { x: store.nodes.positions[key].x, y: store.nodes.positions[key].y }
          : null;
        const prevLinks = (store.edges.freeLinks || [])
          .filter((l) => l.from === key || l.to === key)
          .map((l) => ({ from: l.from, to: l.to }));
        return {
          kind: 'placed-remove', label: 'Quitar del lienzo',
          do() {
            store.removePlaced(t, i);
            prevLinks.forEach((l) => store.removeFreeLink(l.from, l.to));
          },
          undo() {
            const exists = store.nodes.placed.some((p) => p.type === t && p.id === i);
            if (!exists) {
              const node = { type: t, id: i };
              if (prevExtras) {
                if (prevExtras.name != null) node.name = prevExtras.name;
                if (prevExtras.sub  != null) node.sub  = prevExtras.sub;
              }
              store.nodes.placed.push(node);
              store.persistPlaced();
              store._emitMutation('placed-add', { type: t, id: i });
            }
            if (prevPos) store.setNodePosition(key, prevPos.x, prevPos.y);
            prevLinks.forEach((l) => store.addFreeLink(l.from, l.to));
          },
        };
      },

      /**
       * on-canvas-add: poner una campana real en el lienzo (visual, no BD).
       * El vinculo persona_id que se crea cuando cae sobre una audiencia
       * NO entra aqui — lo maneja _connectCampaignToPersona (BD live).
       */
      addOnCanvas(campaignId, pos) {
        const id = String(campaignId);
        const key = `camp:${id}`;
        return {
          kind: 'on-canvas-add', label: 'Agregar campana al lienzo',
          do() {
            store.addOnCanvas(id);
            if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
              store.setNodePosition(key, pos.x, pos.y);
            }
          },
          undo() { store.removeOnCanvas(id); },
        };
      },

      removeOnCanvas(campaignId) {
        const id = String(campaignId);
        const key = `camp:${id}`;
        const prevPos = store.nodes.positions[key]
          ? { x: store.nodes.positions[key].x, y: store.nodes.positions[key].y }
          : null;
        const prevLinks = (store.edges.freeLinks || [])
          .filter((l) => l.from === key || l.to === key)
          .map((l) => ({ from: l.from, to: l.to }));
        return {
          kind: 'on-canvas-remove', label: 'Quitar campana del lienzo',
          do() {
            store.removeOnCanvas(id);
            prevLinks.forEach((l) => store.removeFreeLink(l.from, l.to));
          },
          undo() {
            store.addOnCanvas(id);
            if (prevPos) store.setNodePosition(key, prevPos.x, prevPos.y);
            prevLinks.forEach((l) => store.addFreeLink(l.from, l.to));
          },
        };
      },

      setCollapsed(key, prev, next) {
        return {
          kind: 'collapsed', label: next ? 'Colapsar' : 'Expandir',
          do()   { store.setCollapsed(key, next); },
          undo() { store.setCollapsed(key, prev); },
        };
      },

      /**
       * moveNodes (F1.3 + F1.5 mergeable): batch move N nodos como 1 sola
       * entrada de undo. mergeWith verifica que las claves coincidan y que
       * el final de this == base de other (cadena consecutiva, util para
       * arrow-key presses repetidos sobre la misma seleccion).
       */
      moveNodes(baseByKey, finalByKey) {
        const fromCopy = new Map();
        const toCopy = new Map();
        baseByKey.forEach((v, k) => fromCopy.set(k, { x: v.x, y: v.y }));
        finalByKey.forEach((v, k) => toCopy.set(k, { x: v.x, y: v.y }));
        return {
          kind: 'move-nodes', label: 'Mover seleccion',
          _fromCopy: fromCopy,
          _toCopy:   toCopy,
          do() {
            this._toCopy.forEach((p, k) => store.setNodePosition(k, p.x, p.y));
          },
          undo() {
            this._fromCopy.forEach((p, k) => store.setNodePosition(k, p.x, p.y));
          },
          mergeable: true,
          mergeWith(other) {
            if (other.kind !== 'move-nodes') return false;
            if (this._toCopy.size !== other._fromCopy.size) return false;
            // cada key debe estar en ambos y final-de-this debe igualar base-de-other
            for (const [k, finalPos] of this._toCopy) {
              const otherBase = other._fromCopy.get(k);
              if (!otherBase) return false;
              if (otherBase.x !== finalPos.x || otherBase.y !== finalPos.y) return false;
            }
            // adoptar el final de other; el base (fromCopy) original se preserva
            this._toCopy = other._toCopy;
            return true;
          },
        };
      },
    };
  }
  window.CommandCenterCanvasCommands = CanvasCommands;

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
      // re-scope cambia de marca → las hidrataciones remotas deben correr de nuevo
      this._ccRemoteHydratedFor = null;
      this._ccViewHydratedFor = null;
      this._ccStickiesHydratedFor = null;
      this._ccGroupsHydratedFor = null;
      this._ccStrategiesHydratedFor = null;
      // estado pertenece al scope anterior; resetear local caches
      this._stickies = null;
      this._groups = null;
      this._strategies = null;
      this._strategyId = null;
      this._strategy = null;
    }
    // F2-prep: propagar la estrategia activa de la vista al store. Si la vista
    // tiene un strategyId distinto al del store, el store se resetea (que
    // dispara re-hydrate via los caches invalidados abajo).
    if (this._strategyId && this._store.strategyId !== String(this._strategyId)) {
      this._store.setStrategy(this._strategyId, this._strategy);
      // todos los caches de hidratacion se atan a strategy_id ahora
      this._ccRemoteHydratedFor = null;
      this._ccViewHydratedFor = null;
      this._ccStickiesHydratedFor = null;
      this._ccGroupsHydratedFor = null;
      this._stickies = null;
      this._groups = null;
    }
    // refs compartidas: el codigo existente sigue funcionando
    this._positions = this._store.nodes.positions;
    this._collapsed = this._store.nodes.collapsed;
    this._onCanvas  = this._store.nodes.onCanvas;
    this._placed    = this._store.nodes.placed;
    this._links     = this._store.edges.freeLinks;
    // F1.2: fabrica de commands ligada a este store
    if (!this._commands || this._commandsStore !== this._store) {
      this._commands = CanvasCommands(this._store);
      this._commandsStore = this._store;
    }
    // F1.6: write-through BD para free-links. Suscribimos 1 vez por vista
    // a los eventos del store; los handlers leen this._containerRow/_organizationId/_supabase
    // al disparar (auto-adapt en re-scope).
    if (!this._ccEdgeSubs) {
      this._ccEdgeSubs = [
        this._store.on('mutated:free-link-add', (p) => {
          if (this._ccSuspendRemoteEdges) return;
          this._insertEdgeRemote(p && p.from, p && p.to);
        }),
        this._store.on('mutated:free-link-remove', (p) => {
          if (this._ccSuspendRemoteEdges) return;
          this._deleteEdgeRemote(p && p.from, p && p.to);
        }),
      ];
    }
    // F1.7: write-through BD para viewport (per-user-per-brand). Debounced
    // upsert via _persistRemoteView, lo dispara cualquier cambio en el store
    // (que ya espeja _canvasPan/_canvasScale via wrap de _applyCanvasTransform).
    if (!this._ccViewportSub) {
      this._ccViewportSub = this._store.on('mutated:viewport', () => {
        if (this._ccSuspendRemoteView) return;
        this._persistRemoteView();
      });
    }
    // F1.10: write-through BD para posicion de sticky (sub a mutated:node-position
    // filtrado por keys 'sticky:*'). Se dispara desde dispatch de moveNode/
    // moveNodes (drag, arrows) y hydrate (suspendido). Debounce en _persistStickyPosition.
    if (!this._ccStickyPosSub) {
      this._ccStickyPosSub = this._store.on('mutated:node-position', (p) => {
        if (this._ccSuspendStickyPos) return;
        if (!p || !p.key || !p.key.startsWith('sticky:')) return;
        this._persistStickyPosition(p.key.slice(7));
      });
    }
    // F1.11: write-through para posicion de groups. Group drag (con children)
    // dispatchea moveNodes que emite por cada key incluido (group + children).
    // Aqui solo filtramos las group: y delegamos a su debounce.
    if (!this._ccGroupPosSub) {
      this._ccGroupPosSub = this._store.on('mutated:node-position', (p) => {
        if (this._ccSuspendGroupPos) return;
        if (!p || !p.key || !p.key.startsWith('group:')) return;
        this._persistGroupPosition(p.key.slice(6));
      });
    }
    // F2-prep.2: write-through de positions para placements (audiencias,
    // campanas, identities). Stickies y groups van por otras tablas; los
    // filtra _typeAndIdFromKey returning null para ellos.
    if (!this._ccPlacementPosSub) {
      this._ccPlacementPosSub = this._store.on('mutated:node-position', (p) => {
        if (this._ccSuspendPlacementWrite) return;
        if (!p || !p.key) return;
        const ti = this._typeAndIdFromKey(p.key);
        if (!ti) return; // sticky/group manejados aparte
        this._persistPlacementPosition(p.key);
      });
    }
    // F1.12 eliminado: ya no nos suscribimos a mutated:selection para el inspector.
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

  // Auto-organizar: layout en columnas (audiencias | campanas | identidades)
  // MIDIENDO la altura real de cada nodo (respeta colapsado/expandido) para que
  // nunca se encimen, y luego encuadra todo. El layout viejo apilaba con un
  // ROW_GAP fijo de 150px y los nodos (200-900px de alto) se solapaban.
  P._relayout = function () {
    this._ensureStore();
    this._loadPositions();
    const world  = document.getElementById('ccCanvasWorld');
    const canvas = document.getElementById('ccCanvas');
    const nodes  = this._canvasNodes();
    if (!world || !nodes.length) {
      this._store.clearPositions();
      this._store.setViewport({ x: 0, y: 0, scale: 1 });
      this._canvasPan = { x: 0, y: 0 };
      this._canvasScale = 1;
      this._renderCanvas();
      return;
    }
    // 1) Garantiza el DOM de los nodos para poder medir alturas reales.
    this._renderCanvas();
    // Des-cull temporal: un nodo con display:none mide 0; lo mostramos para medir.
    world.querySelectorAll('.cc-node').forEach((n) => { n.style.display = ''; });

    const VGAP = 44, HGAP = 130, X0 = 40, Y0 = 40;
    const colOf = (t) => (t === 'audience' ? 0 : t === 'identity' ? 2 : 1);
    const cols = [[], [], []];
    nodes.forEach((n) => { cols[colOf(n.type)].push(n.key); });
    const elOf = (k) => world.querySelector(`.cc-node[data-node-key="${k}"]`);

    let curX = X0, maxRight = X0, maxBottom = Y0;
    cols.forEach((keys) => {
      if (!keys.length) return;
      let colW = 0;
      keys.forEach((k) => { const el = elOf(k); if (el) colW = Math.max(colW, el.offsetWidth || 268); });
      let y = Y0;
      keys.forEach((k) => {
        const el = elOf(k);
        const h = el ? (el.offsetHeight || 220) : 220;
        this._positions[k] = { x: curX, y };
        if (el) { el.style.left = `${curX}px`; el.style.top = `${y}px`; }
        y += h + VGAP;
      });
      maxBottom = Math.max(maxBottom, y - VGAP);
      maxRight  = Math.max(maxRight, curX + colW);
      curX += colW + HGAP;
    });
    this._savePositions();

    // 2) Encuadrar todo (zoom-to-fit con medidas reales; no acerca mas de 1x).
    if (canvas) {
      const r = canvas.getBoundingClientRect();
      const pad = 80;
      const cw = Math.max(1, maxRight - X0);
      const ch = Math.max(1, maxBottom - Y0);
      const s = Math.min(1, Math.max(0.3, Math.min((r.width - pad * 2) / cw, (r.height - pad * 2) / ch)));
      this._canvasScale = s;
      this._canvasPan = {
        x: (r.width  - cw * s) / 2 - X0 * s,
        y: (r.height - ch * s) / 2 - Y0 * s,
      };
    } else {
      this._canvasPan = { x: 0, y: 0 };
      this._canvasScale = 1;
    }
    this._store.setViewport({ x: this._canvasPan.x, y: this._canvasPan.y, scale: this._canvasScale });
    this._applyCanvasTransform();
    this._renderEdges();
  };

  // F1.2: _removeLink ahora dispatchea como command (undoable). La rama
  // persona_id sigue siendo BD live, NO entra en la pila de undo.
  P._removeLink = function (fromKey, toKey) {
    if (fromKey && fromKey.startsWith('aud:') && toKey && toKey.startsWith('camp:')) {
      this._disconnectCampaign(toKey.slice(5));
      return;
    }
    this._ensureStore();
    this._store.dispatch(this._commands.removeFreeLink(fromKey, toKey));
    this._renderCanvas();
  };

  // F1.2: _addLink dispatchea como command (undoable). Rama persona_id BD live.
  P._addLink = function (fromKey, toKey) {
    if (fromKey && fromKey.startsWith('aud:') && toKey && toKey.startsWith('camp:')) {
      this._connectCampaignToPersona(toKey.slice(5), fromKey.slice(4));
      return;
    }
    this._ensureStore();
    this._store.dispatch(this._commands.addFreeLink(fromKey, toKey));
    this._renderCanvas();
  };

  // F1.2: _addIdentityToCanvas dispatchea placed-add con extras + pos.
  // El link al nodo de drop (si lo hay) se rutea por _addLink (otro command).
  P._addIdentityToCanvas = function (lib, clientX, clientY) {
    if (!lib || !lib.type || !lib.id) return;
    this._ensureStore();
    const w = this._worldPointFromClient(clientX, clientY);
    const pos = { x: Math.max(0, w.x - 110), y: Math.max(0, w.y - 20) };
    this._store.dispatch(this._commands.addPlaced(lib.type, lib.id, { name: lib.name, sub: lib.sub }, pos));
    const key = `${lib.type}:${lib.id}`;
    const target = this._nodeAt(clientX, clientY, key);
    const toKey = target && target.getAttribute('data-node-key');
    this._renderCanvas();
    this._renderLibrary();
    if (toKey && toKey !== key) this._addLink(key, toKey);
  };

  // F1.2: _removeIdentityFromCanvas dispatchea (captura snapshot internamente).
  P._removeIdentityFromCanvas = function (type, id) {
    this._ensureStore();
    this._store.dispatch(this._commands.removePlaced(type, id));
    this._renderCanvas();
    this._renderLibrary();
  };

  // F1.2: _addRealToCanvas dispatchea on-canvas-add + pos. Si cayo sobre
  // audiencia, _connectCampaignToPersona (BD) corre FUERA del historial.
  P._addRealToCanvas = function (campId, clientX, clientY) {
    const c = (this._campaigns || []).find((x) => String(x.id) === String(campId) && x.last_synced_at);
    if (!c) return;
    this._ensureStore();
    let w;
    if (clientX == null) {
      const canvas = document.getElementById('ccCanvas');
      const r = canvas.getBoundingClientRect();
      w = this._worldPointFromClient(r.left + r.width / 2, r.top + r.height / 2);
    } else {
      w = this._worldPointFromClient(clientX, clientY);
    }
    const pos = { x: Math.max(0, w.x - 120), y: Math.max(0, w.y - 20) };
    this._store.dispatch(this._commands.addOnCanvas(campId, pos));
    // Si cayo sobre una audiencia, vincular persona_id (BD, fuera de undo)
    const audEl = clientX == null ? null : this._audienceNodeAt(clientX, clientY);
    if (audEl) {
      const audId = audEl.getAttribute('data-id');
      if (audId) { this._connectCampaignToPersona(campId, audId); return; }
    }
    this._renderCanvas();
    this._renderMiniDash();
    this._renderCampaigns();
  };

  // F1.2: _removeRealFromCanvas dispatchea visual (undoable). El disconnect
  // de persona_id (si lo habia) corre FUERA del historial (BD live).
  P._removeRealFromCanvas = function (campId) {
    this._ensureStore();
    const c = (this._campaigns || []).find((x) => String(x.id) === String(campId));
    this._store.dispatch(this._commands.removeOnCanvas(campId));
    if (c && c.persona_id) {
      this._disconnectCampaign(campId); // hace su propio re-render async
      return;
    }
    this._renderCanvas();
    this._renderMiniDash();
    this._renderCampaigns();
  };

  // F1.2: _toggleCollapse dispatchea + replica el DOM-update fine-grained
  // del original (sin _renderCanvas, preserva foco/edicion). Undo via Ctrl+Z
  // SI hace _renderCanvas (asume que no estabas editando).
  P._toggleCollapse = function (key, nodeEl) {
    this._ensureStore();
    const was = this._collapsed.has(key);
    const next = !was;
    this._store.dispatch(this._commands.setCollapsed(key, was, next));
    if (nodeEl) {
      nodeEl.classList.toggle('cc-node--collapsed', next);
      const ic = nodeEl.querySelector('.cc-node-collapse i');
      if (ic) ic.className = `fas fa-${next ? 'chevron-down' : 'chevron-up'}`;
    }
    this._renderEdges();
  };

  // ------------------------------------------------------------------
  // F2: reglas de conexion entre tipos de nodo (validacion al free-link)
  //
  // Modelo BD que justifica cada regla:
  //   product/service/place (brand_entities polimorfico):
  //     consumidos por brief (campaign_brief_entities.entity_id), flow
  //     (flow_runs.entity_id) y campaign-concept (planificacion).
  //   audience (audience_personas):
  //     consumida por flow (flow_runs.persona_id), campaign-concept y
  //     campaign-real (campaigns.persona_id).
  //   brief (campaign_briefs):
  //     usado por flow (flow_runs.brief_id) y campaigns (brief_id).
  //   flow (content_flows + flow_runs):
  //     produce runs_outputs; el output puede asociarse a una campaign
  //     (runs_outputs.campaign_id).
  //   campaign-concept: ancla del plan; converge en campaign-real (mismo row).
  //   campaign-real: destino final; recibe pero no fluye al canvas.
  //   sticky/group: anotaciones puras; no participan del grafo de datos.
  //
  // Las reglas son bidireccionales (si A→B esta permitido, B→A tambien)
  // — el usuario no deberia memorizar direccionalidad del drag.
  // ------------------------------------------------------------------

  // Conexion MANUAL libre (2026-06-11): el usuario arma su estrategia conectando
  // lo que quiera. La topologia "real" (trigger CONCEPTUAL define ingredientes y
  // arranca produccion; cierre en campana real) se EXPRESA por el layout en arbol
  // (_posFor) y el estilo de cable (punteado = ingrediente, solido = produccion),
  // NO por bloqueo duro. Las reglas estrictas frustraban la conexion manual.
  P._typeFromKey = function (key) {
    if (!key) return null;
    if (key.startsWith('aud:'))    return 'audience';
    if (key.startsWith('sticky:')) return 'sticky';
    if (key.startsWith('group:'))  return 'group';
    if (key.startsWith('camp:')) {
      const id = key.slice(5);
      const c = (this._campaigns || []).find((x) => String(x.id) === String(id));
      return (c && c.last_synced_at) ? 'campaign-real' : 'campaign-concept';
    }
    const colon = key.indexOf(':');
    if (colon > 0) {
      const t = key.slice(0, colon);
      return ({ products: 'product', services: 'service', places: 'place', characters: 'character', flows: 'flow', briefs: 'brief' })[t] || null;
    }
    return null;
  };

  /** Conexion manual permisiva: se permite cualquier par de nodos distintos,
      salvo mismo-tipo-exacto y anotaciones (sticky/group, sin puertos). */
  P._canConnect = function (fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) return false;
    const a = this._typeFromKey(fromKey);
    const b = this._typeFromKey(toKey);
    if (!a || !b) return false;
    if (a === b) return false; // mismo tipo no se conecta entre si
    if (a === 'sticky' || a === 'group' || b === 'sticky' || b === 'group') return false;
    return true;
  };

  // Override _addLink: bloquea silenciosamente si la conexion no es valida.
  // _connectCampaignToPersona (persona_id en BD) sigue siendo el unico caso
  // hardcoded del mixin — ese link aud→camp YA esta en CC_CONNECTION_RULES
  // (audience → campaign-concept / campaign-real), asi que no necesita
  // excepcion. Si el usuario arrastra al reves (camp→aud), tambien pasa
  // porque la regla es bidireccional.
  const _f2RulesAddLink = P._addLink;
  if (typeof _f2RulesAddLink === 'function') {
    P._addLink = function (fromKey, toKey) {
      if (!this._canConnect(fromKey, toKey)) {
        console.info('[CC] conexion bloqueada:', fromKey, '→', toKey,
          '(regla:', this._typeFromKey(fromKey), '→', this._typeFromKey(toKey), 'no permitida)');
        return;
      }
      return _f2RulesAddLink.apply(this, arguments);
    };
  }

  // F2-prep.2: wraps de add/remove para INSERT/DELETE canvas_node_placements
  // en la estrategia activa. Encadenados sobre los wraps de F1.2 que ya
  // gestionan localStorage + commands. Stickies y groups no entran aqui;
  // tienen sus propias tablas.
  const _f2pAddRealToCanvas = P._addRealToCanvas;
  if (typeof _f2pAddRealToCanvas === 'function') {
    P._addRealToCanvas = function (campId /*, clientX, clientY */) {
      const r = _f2pAddRealToCanvas.apply(this, arguments);
      const pos = this._positions[`camp:${campId}`];
      if (pos) this._insertPlacement('campaign', campId, pos.x, pos.y);
      return r;
    };
  }
  const _f2pRemoveRealFromCanvas = P._removeRealFromCanvas;
  if (typeof _f2pRemoveRealFromCanvas === 'function') {
    P._removeRealFromCanvas = function (campId) {
      this._deletePlacement('campaign', campId);
      return _f2pRemoveRealFromCanvas.apply(this, arguments);
    };
  }
  const _f2pAddIdentityToCanvas = P._addIdentityToCanvas;
  if (typeof _f2pAddIdentityToCanvas === 'function') {
    P._addIdentityToCanvas = function (lib /*, clientX, clientY */) {
      // F2: enriquecer lib con imageUrl desde libCache (si existe) para que
      // el nodo en canvas tenga el preview visual (products/flows).
      if (lib && lib.type && lib.id && this._libCache && this._libCache[lib.type]) {
        const found = this._libCache[lib.type].find((it) => String(it.id) === String(lib.id));
        if (found && found.imageUrl && !lib.imageUrl) lib.imageUrl = found.imageUrl;
      }
      const r = _f2pAddIdentityToCanvas.apply(this, arguments);
      // Post: anadir imageUrl al placed entry para que sobreviva re-renders
      if (lib && lib.imageUrl) {
        const entry = (this._placed || []).find((p) => p.type === lib.type && String(p.id) === String(lib.id));
        if (entry && !entry.imageUrl) {
          entry.imageUrl = lib.imageUrl;
          if (this._store && typeof this._store.persistPlaced === 'function') this._store.persistPlaced();
        }
      }
      if (lib && lib.type && lib.id != null) {
        const pos = this._positions[`${lib.type}:${lib.id}`];
        const singular = ({ products: 'product', services: 'service', places: 'place', characters: 'character', flows: 'flow', briefs: 'brief' })[lib.type] || lib.type;
        if (pos) this._insertPlacement(singular, lib.id, pos.x, pos.y);
      }
      return r;
    };
  }

  // F2: override _nodeIdentityHTML con design premium minimalista.
  // - Products: card con imagen como pieza visual principal + caption sutil
  // - Flows: card oscuro con ports tipados + form preview (placeholders)
  // - Otros tipos: legacy
  const _f2IdentityHTML = P._nodeIdentityHTML;
  if (typeof _f2IdentityHTML === 'function') {
    P._nodeIdentityHTML = function (n, pos) {
      const t = n.identityType;
      const r = n.row || {};
      if (t === 'products') return this._renderProductNode(n, pos, r);
      if (t === 'flows')    return this._renderFlowNode(n, pos, r);
      return _f2IdentityHTML.apply(this, arguments);
    };
  }

  /**
   * Enriquece un placed entry (n.row) con imageUrl, name, sub desde el
   * libCache del tipo correspondiente. Si libCache no esta cargado, dispara
   * _fetchLibrary fire-and-forget + re-renderea al completar. Idempotente
   * via flag _enrichLockedFor para evitar fetches paralelos del mismo type.
   */
  P._enrichPlacedFromLibCache = function (placedEntry, libKey) {
    if (!placedEntry || placedEntry.imageUrl) return;
    const cached = this._libCache && this._libCache[libKey];
    if (cached === undefined) {
      if (!this._enrichLockedFor) this._enrichLockedFor = new Set();
      if (this._enrichLockedFor.has(libKey)) return; // ya hay fetch en vuelo
      this._enrichLockedFor.add(libKey);
      if (typeof this._fetchLibrary === 'function') {
        this._fetchLibrary(libKey).then(() => {
          this._enrichLockedFor.delete(libKey);
          // Aplicar a TODOS los placements de ese tipo en una sola pasada
          let anyUpdated = false;
          (this._placed || []).forEach((p) => {
            if (p.type !== libKey || p.imageUrl) return;
            const found = (this._libCache[libKey] || []).find((it) => String(it.id) === String(p.id));
            if (found && found.imageUrl) { p.imageUrl = found.imageUrl; anyUpdated = true; }
          });
          if (anyUpdated) {
            if (this._store && typeof this._store.persistPlaced === 'function') this._store.persistPlaced();
            this._renderCanvas();
          }
        }).catch(() => { this._enrichLockedFor.delete(libKey); });
      }
      return;
    }
    // Cache presente: enriquecer in-place sin re-render (el render actual ya
    // esta corriendo y vera la imageUrl en el HTML que devolvemos abajo)
    const found = (cached || []).find((it) => String(it.id) === String(placedEntry.id));
    if (found && found.imageUrl) {
      placedEntry.imageUrl = found.imageUrl;
      if (this._store && typeof this._store.persistPlaced === 'function') this._store.persistPlaced();
    }
  };

  P._renderProductNode = function (n, pos, r) {
    const name = r.name || 'Producto';
    const sub  = r.sub || '';
    // F2: enriquecer placement existente sin imageUrl desde libCache.products
    // (corre solo cuando hace falta, kickoff fetch lazy si libCache vacio)
    if (!r.imageUrl && r.type === 'products' && r.id != null) {
      this._enrichPlacedFromLibCache(r, 'products');
    }
    const img  = r.imageUrl
      ? `<img src="${this.escapeHtml(r.imageUrl)}" alt="" loading="lazy" />`
      : '<div class="cc-prem-placeholder"><i class="fas fa-image"></i></div>';
    return `
    <div class="cc-node cc-node--identity cc-node--prem cc-node--prem-product" data-node-key="${n.key}" data-type="identity" data-identity-type="products" data-id="${this.escapeHtml(String(n.id))}" style="left:${pos.x}px;top:${pos.y}px;">
      <span class="cc-node-port cc-node-port--in" data-port="in" title="Entrada"></span>
      <div class="cc-prem-toolbar" data-drag-handle>
        <span class="cc-prem-tag">PRODUCTO</span>
        <button type="button" class="cc-prem-x cc-node-uncanvas" title="Quitar del canvas"><i class="fas fa-times"></i></button>
      </div>
      <div class="cc-prem-image">${img}</div>
      <div class="cc-prem-caption">
        <span class="cc-prem-name" title="${this.escapeHtml(name)}">${this.escapeHtml(name)}</span>
        ${sub ? `<span class="cc-prem-sub">${this.escapeHtml(sub)}</span>` : ''}
      </div>
      <span class="cc-node-port cc-node-port--out" data-port="out" title="Arrastra para conectar"></span>
    </div>`;
  };

  P._renderFlowNode = function (n, pos, r) {
    const name = r.name || 'Flow';
    const sub  = r.sub || '';
    // F2: enriquecer placement existente sin imageUrl desde libCache.flows
    if (!r.imageUrl && r.type === 'flows' && r.id != null) {
      this._enrichPlacedFromLibCache(r, 'flows');
    }
    // Ports tipados visuales (placeholder estatico para v1; el schema real
    // vive en flow_modules y se incorporara en una iteracion posterior)
    const inputPorts = [
      { id: 'input',  color: '#c9cdd3', label: 'input' },
      { id: 'config', color: '#c9cdd3', label: 'config' },
      { id: 'brief',  color: '#c9cdd3', label: 'brief' },
    ];
    const outputPorts = [
      { id: 'output', color: '#c9cdd3', label: sub || 'output' },
    ];
    const fields = [
      { label: 'Output', value: sub || '—' },
      { label: 'Modelo', value: 'Auto' },
      { label: 'Calidad', value: 'Alta' },
    ];
    return `
    <div class="cc-node cc-node--identity cc-node--prem cc-node--prem-flow" data-node-key="${n.key}" data-type="identity" data-identity-type="flows" data-id="${this.escapeHtml(String(n.id))}" style="left:${pos.x}px;top:${pos.y}px;">
      <span class="cc-node-port cc-node-port--in" data-port="in" title="Entrada"></span>
      <div class="cc-prem-toolbar" data-drag-handle>
        <span class="cc-prem-dot"></span>
        <span class="cc-prem-title">${this.escapeHtml(name)}</span>
        <button type="button" class="cc-prem-x cc-node-uncanvas" title="Quitar del canvas"><i class="fas fa-times"></i></button>
      </div>
      <div class="cc-prem-inner">
        <div class="cc-prem-ports">
          <div class="cc-prem-ports-col">
            ${inputPorts.map((p) => `<div class="cc-prem-port-row"><span class="cc-prem-port-dot" style="background:${p.color}"></span><span class="cc-prem-port-label">${this.escapeHtml(p.label)}</span></div>`).join('')}
          </div>
          <div class="cc-prem-ports-col cc-prem-ports-col--right">
            ${outputPorts.map((p) => `<div class="cc-prem-port-row"><span class="cc-prem-port-label">${this.escapeHtml(p.label)}</span><span class="cc-prem-port-dot" style="background:${p.color}"></span></div>`).join('')}
          </div>
        </div>
        <div class="cc-prem-form">
          ${fields.map((f) => `<div class="cc-prem-field"><span class="cc-prem-field-label">${this.escapeHtml(f.label)}</span><span class="cc-prem-field-value">${this.escapeHtml(f.value)}</span></div>`).join('')}
        </div>
      </div>
      <span class="cc-node-port cc-node-port--out" data-port="out" title="Arrastra para conectar"></span>
    </div>`;
  };
  const _f2pRemoveIdentityFromCanvas = P._removeIdentityFromCanvas;
  if (typeof _f2pRemoveIdentityFromCanvas === 'function') {
    P._removeIdentityFromCanvas = function (type, id) {
      const singular = ({ products: 'product', services: 'service', places: 'place', characters: 'character', flows: 'flow', briefs: 'brief' })[type] || type;
      this._deletePlacement(singular, id);
      return _f2pRemoveIdentityFromCanvas.apply(this, arguments);
    };
  }

  // F1.2 + F1.3: wrap _beginNodeDrag con soporte para group-drag.
  //
  // - Si el nodo arrastrado esta en el selectionSet del store y la
  //   seleccion tiene >1 elementos → group drag: aplicamos el mismo
  //   delta a todos. mouseup dispatchea un command `move-nodes` (1 entrada
  //   de undo para todo el grupo).
  // - Si no, comportamiento single-drag F1.2 con mergeable move-node.
  P._beginNodeDrag = function (e, nodeEl) {
    e.preventDefault(); e.stopPropagation();
    this._ensureStore();
    this._didDrag = false;
    const key = nodeEl.getAttribute('data-node-key');
    const s = this._canvasScale || 1;
    const startMouse = { x: e.clientX, y: e.clientY };

    // ── Camino A: group drag ─────────────────────────────────────────
    const set = this._store.selectionSet;
    if (set && set.size > 1 && set.has(key)) {
      const baseByKey = new Map();
      set.forEach((k) => {
        const p = this._positions[k];
        if (p) baseByKey.set(k, { x: p.x, y: p.y });
        // si por algun motivo no hay pos, lo saltamos (el node se quedara fijo)
      });
      // marcar todos los miembros como dragging
      const draggingEls = [];
      set.forEach((k) => {
        const el = document.querySelector(`.cc-node[data-node-key="${ccCssEsc(k)}"]`);
        if (el) { el.classList.add('cc-node--dragging'); draggingEls.push(el); }
      });

      const onMove = (ev) => {
        const dx = (ev.clientX - startMouse.x) / s;
        const dy = (ev.clientY - startMouse.y) / s;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._didDrag = true;
        baseByKey.forEach((base, k) => {
          const nx = base.x + dx, ny = base.y + dy;
          const el = document.querySelector(`.cc-node[data-node-key="${ccCssEsc(k)}"]`);
          if (el) { el.style.left = `${nx}px`; el.style.top = `${ny}px`; }
          if (this._positions[k]) { this._positions[k].x = nx; this._positions[k].y = ny; }
          else this._positions[k] = { x: nx, y: ny };
        });
        this._scheduleEdges();
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        draggingEls.forEach((el) => el.classList.remove('cc-node--dragging'));
        // snap cada nodo a grid 16 + collect deltas
        const finalByKey = new Map();
        let anyChange = false;
        baseByKey.forEach((base, k) => {
          const p = this._positions[k];
          if (!p) return;
          const fx = Math.round(p.x / 16) * 16;
          const fy = Math.round(p.y / 16) * 16;
          p.x = fx; p.y = fy;
          const el = document.querySelector(`.cc-node[data-node-key="${ccCssEsc(k)}"]`);
          if (el) { el.style.left = `${fx}px`; el.style.top = `${fy}px`; }
          finalByKey.set(k, { x: fx, y: fy });
          if (fx !== base.x || fy !== base.y) anyChange = true;
        });
        this._scheduleEdges();
        if (anyChange) {
          this._store.dispatch(this._commands.moveNodes(baseByKey, finalByKey));
        } else {
          this._store.persistPositions();
        }
        this._drawMinimap();
        setTimeout(() => { this._didDrag = false; }, 0);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      return;
    }

    // ── Camino B: single drag (F1.2) ────────────────────────────────
    const cur = this._positions[key];
    const base = cur
      ? { x: cur.x, y: cur.y }
      : { x: parseFloat(nodeEl.style.left) || 0, y: parseFloat(nodeEl.style.top) || 0 };
    nodeEl.classList.add('cc-node--dragging');
    const onMove = (ev) => {
      const dx = (ev.clientX - startMouse.x) / s;
      const dy = (ev.clientY - startMouse.y) / s;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._didDrag = true;
      const nx = base.x + dx, ny = base.y + dy;
      nodeEl.style.left = `${nx}px`;
      nodeEl.style.top  = `${ny}px`;
      if (this._positions[key]) { this._positions[key].x = nx; this._positions[key].y = ny; }
      else this._positions[key] = { x: nx, y: ny };
      this._scheduleEdges();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      nodeEl.classList.remove('cc-node--dragging');
      const pos = this._positions[key];
      if (pos) {
        pos.x = Math.round(pos.x / 16) * 16;
        pos.y = Math.round(pos.y / 16) * 16;
        nodeEl.style.left = `${pos.x}px`;
        nodeEl.style.top  = `${pos.y}px`;
        this._scheduleEdges();
      }
      const toX = pos ? pos.x : base.x;
      const toY = pos ? pos.y : base.y;
      if (toX !== base.x || toY !== base.y) {
        this._store.dispatch(this._commands.moveNode(key, base.x, base.y, toX, toY));
      } else {
        this._store.persistPositions();
      }
      this._drawMinimap();
      setTimeout(() => { this._didDrag = false; }, 0);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ------------------------------------------------------------------
  // F1.3: multi-seleccion (shift+click + marquee + group-drag)
  // ------------------------------------------------------------------
  function ccCssEsc(v) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(v);
    return String(v).replace(/["\\\]]/g, '\\$&');
  }

  P._renderSelection = function () {
    if (!this._store) return;
    const set = this._store.selectionSet;
    document.querySelectorAll('.cc-node').forEach((n) => {
      const k = n.getAttribute('data-node-key');
      n.classList.toggle('cc-node--selected', !!(set && set.has(k)));
    });
    // Inspector derecho: abre/actualiza/cierra segun la seleccion single.
    if (typeof this._renderInspector === 'function') this._renderInspector();
  };

  /** Toggle in/out del set y re-render selection. Mantiene focus solo en single. */
  P._toggleSelectionAndRender = function (nodeEl) {
    this._ensureStore();
    const key = nodeEl.getAttribute('data-node-key');
    const desc = {
      type: nodeEl.getAttribute('data-type'),
      id: nodeEl.getAttribute('data-id'),
      key,
    };
    if (desc.type === 'identity') desc.type = nodeEl.getAttribute('data-identity-type');
    this._store.toggleSelection(key, desc);
    this._renderSelection();
    // sync legacy refs
    this._selectedKey = this._store.selection?.key || null;
    this._selected    = this._store.selection?.descriptor || null;
    // focus flow solo si el set es exactamente uno
    if (this._store.selectionSet.size === 1 && this._store.selection) {
      this._focusFlow(this._store.selection.key);
    } else if (this._focusSet) {
      this._clearFocus();
    }
  };

  /** Marquee: overlay div en screen coords; al soltar agrega los nodos intersectados al set. */
  P._beginMarquee = function (e) {
    const canvas = document.getElementById('ccCanvas');
    if (!canvas) return;
    const cr = canvas.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const m = document.createElement('div');
    m.className = 'cc-marquee';
    m.style.cssText = [
      'position:absolute',
      'pointer-events:none',
      'border:1px dashed rgba(200,200,200,0.85)',
      'background:rgba(200,200,200,0.10)',
      'z-index:60',
      `left:${sx - cr.left}px`,
      `top:${sy - cr.top}px`,
      'width:0px',
      'height:0px',
    ].join(';');
    canvas.appendChild(m);

    const onMove = (ev) => {
      const x = Math.min(sx, ev.clientX) - cr.left;
      const y = Math.min(sy, ev.clientY) - cr.top;
      const w = Math.abs(ev.clientX - sx);
      const h = Math.abs(ev.clientY - sy);
      m.style.left = `${x}px`;
      m.style.top = `${y}px`;
      m.style.width = `${w}px`;
      m.style.height = `${h}px`;
    };

    const onUp = (ev) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const rect = m.getBoundingClientRect();
      m.remove();
      const minW = 3; // marquee con tamano > 3px (descarta clicks accidentales)
      if (rect.width < minW && rect.height < minW) return;
      const keys = [];
      const descMap = new Map();
      document.querySelectorAll('.cc-node').forEach((n) => {
        const nr = n.getBoundingClientRect();
        const intersects = !(nr.right < rect.left || nr.left > rect.right
                          || nr.bottom < rect.top || nr.top > rect.bottom);
        if (!intersects) return;
        const key = n.getAttribute('data-node-key');
        keys.push(key);
        const d = { type: n.getAttribute('data-type'), id: n.getAttribute('data-id'), key };
        if (d.type === 'identity') d.type = n.getAttribute('data-identity-type');
        descMap.set(key, d);
      });
      if (!keys.length) return;
      this._ensureStore();
      // shift+marquee: agregar al set existente (no reemplazar)
      keys.forEach((k) => this._store.addToSelection(k, descMap.get(k)));
      this._renderSelection();
      this._selectedKey = this._store.selection?.key || null;
      this._selected    = this._store.selection?.descriptor || null;
      // multi-select borra focus single
      if (this._store.selectionSet.size > 1 && this._focusSet) this._clearFocus();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  /**
   * Capture-phase listeners para shift+click (toggle) y shift+drag empty (marquee).
   * Corren ANTES del click/mousedown handlers del mixin gracias a useCapture=true,
   * y usan stopPropagation cuando manejan el evento para evitar pan/select duplicado.
   */
  P._installMultiSelect = function () {
    const canvas = document.getElementById('ccCanvas');
    if (!canvas) return;

    if (!this._ccMultiClick) {
      this._ccMultiClick = (e) => {
        const nodeEl = e.target.closest('.cc-node');
        if (e.shiftKey) {
          if (!nodeEl) { e.stopPropagation(); return; } // shift+empty click: NO clear
          if (e.target.closest('input, textarea, select, .cc-node-port, .cc-node-act, .cc-tag-x, .cc-edge')) return;
          e.preventDefault(); e.stopPropagation();
          this._toggleSelectionAndRender(nodeEl);
          return;
        }
        // Click plano sobre nodo perteneciente a multi-set:
        // → pasar a single-seleccionar ese mismo nodo. Pre-limpiamos el set y
        //   forzamos _selectedKey=null para que el toggle-off del mixin
        //   (cuando _selectedKey === k) NO se dispare por error.
        if (nodeEl && this._store && this._store.selectionSet.size > 1) {
          const k = nodeEl.getAttribute('data-node-key');
          if (this._store.selectionSet.has(k)) {
            this._store.selectionSet.clear();
            this._store.selectionDescriptors.clear();
            this._store.selection = null;
            this._selectedKey = null;
            this._selected = null;
            // dejamos que bubble-phase _selectNode siga, agregue clase y
            // setee _selectedKey=k; nuestro F1.1 wrap espeja al store.
          }
        }
        // Click plano en vacio con multi-set previo: limpiar el set.
        // OJO: si veniamos de un pan, _didPan=true y NO debemos tocar seleccion.
        if (!nodeEl && this._store && this._store.selectionSet.size > 0) {
          if (this._didPan) return;
          this._store.clearSelection();
          this._renderSelection();
          // bubble-phase original tambien hara su limpieza de single-state
        }
      };
      canvas.addEventListener('click', this._ccMultiClick, true);
    }

    if (!this._ccMultiMouseDown) {
      this._ccMultiMouseDown = (e) => {
        if (e.button !== 0 || !e.shiftKey) return;
        // ignorar si cae sobre algo "no vacio"
        if (e.target.closest('.cc-node-port--out, .cc-node, .cc-edge, .cc-floating-panel, input, textarea, select')) return;
        e.preventDefault(); e.stopPropagation();
        this._beginMarquee(e);
      };
      canvas.addEventListener('mousedown', this._ccMultiMouseDown, true);
    }
  };

  // F1.2 + F1.4 + F1.5: atajos de teclado power-user.
  //
  // Sin modificador:
  // - Esc                 → limpia seleccion + focus
  // - Del / Backspace     → borra la seleccion (BD destructivo + canvas-only;
  //                          confirm si hay audiencias / campanas conceptuales)
  // - Flechas             → mueve la seleccion 1px (10px con Shift); dispatch
  //                          moveNodes mergeable (presses repetidos = 1 entrada)
  //
  // Con Ctrl/Cmd:
  // - Z                   → undo
  // - Shift+Z / Y         → redo
  // - C                   → copy
  // - V                   → paste (BD-clones)
  // - D                   → duplicate
  // - K                   → command palette stub (F1.x)
  //
  // Siempre ignora si el target es input / textarea / contenteditable.
  P._installCanvasShortcuts = function () {
    if (this._ccKeyHandler) return;
    this._ccKeyHandler = (e) => {
      if (!this._store) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = (e.key || '').toLowerCase();
      const mod = e.metaKey || e.ctrlKey;

      // ── No-mod shortcuts ────────────────────────────────────────
      if (!mod) {
        if (k === 'escape') {
          if (this._store.selectionSet.size > 0 || this._selectedKey) {
            e.preventDefault();
            this._store.clearSelection();
            this._renderSelection();
            this._selectedKey = null;
            this._selected = null;
            if (this._focusSet) this._clearFocus();
          }
          return;
        }
        if (k === 'delete' || k === 'backspace') {
          if (this._store.selectionSet.size === 0) return;
          e.preventDefault();
          this._ccDeleteSelection();
          return;
        }
        if (k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright') {
          if (this._store.selectionSet.size === 0) return;
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
          const dy = k === 'arrowup'   ? -step : k === 'arrowdown'  ? step : 0;
          this._ccMoveSelection(dx, dy);
          return;
        }
        return;
      }

      // ── Con Ctrl/Cmd ────────────────────────────────────────────
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) { if (this._store.redo()) this._renderCanvas(); }
        else            { if (this._store.undo()) this._renderCanvas(); }
        return;
      }
      if (k === 'y') {
        e.preventDefault();
        if (this._store.redo()) this._renderCanvas();
        return;
      }
      if (k === 'c') { e.preventDefault(); this._ccCopyToClipboard(); return; }
      if (k === 'v') { e.preventDefault(); this._ccPasteFromClipboard(); return; }
      if (k === 'd') { e.preventDefault(); this._ccDuplicate(); return; }
      if (k === 'k') {
        e.preventDefault();
        console.info('[CC] Command palette: stub (F1.5; full UI en F1.x)');
        return;
      }
    };
    document.addEventListener('keydown', this._ccKeyHandler);
  };

  // ------------------------------------------------------------------
  // F1.5: helpers de keyboard ops (Del + flechas)
  // ------------------------------------------------------------------

  /**
   * Mueve la seleccion completa dx/dy en world coords. Dispatchea un
   * moveNodes mergeable: presses consecutivos en la misma direccion sobre
   * el mismo set colapsan en 1 entrada de undo.
   */
  P._ccMoveSelection = function (dx, dy) {
    this._ensureStore();
    const set = this._store.selectionSet;
    if (!set || set.size === 0) return;
    if (dx === 0 && dy === 0) return;
    const baseByKey = new Map();
    const finalByKey = new Map();
    set.forEach((key) => {
      const p = this._positions[key];
      if (!p) return;
      baseByKey.set(key, { x: p.x, y: p.y });
      finalByKey.set(key, { x: p.x + dx, y: p.y + dy });
    });
    if (!baseByKey.size) return;
    this._store.dispatch(this._commands.moveNodes(baseByKey, finalByKey));
    // DOM update directo (sin re-render completo, preserva foco/edicion)
    finalByKey.forEach((p, key) => {
      const el = document.querySelector(`.cc-node[data-node-key="${ccCssEsc(key)}"]`);
      if (el) { el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; }
    });
    this._scheduleEdges();
  };

  /**
   * Borra los nodos seleccionados. Diferencia entre:
   *   - canvas-only (identity / real campaign): _removeIdentityFromCanvas /
   *     _removeRealFromCanvas (visual; sin tocar BD del producto/servicio/etc)
   *   - BD destructivo (audience / campaign conceptual): DELETE en supabase
   *     con un solo window.confirm que resume el total
   * Las free-edges tocando a un nodo borrado se quitan via el path correspondiente.
   * Al final limpia seleccion y re-renderiza.
   */
  P._ccDeleteSelection = async function () {
    this._ensureStore();
    const set = this._store.selectionSet;
    if (!set || set.size === 0) return;

    const keys = [...set];
    const bdItems = [];     // {type, id, key, name}
    const canvasItems = []; // {type, identityType?, id, key}

    const stickyItems = []; // {id, key} — borrado en BD (canvas_stickies)
    const groupItems = [];  // {id, key} — borrado en BD (canvas_groups; NO afecta children)
    keys.forEach((key) => {
      if (key.startsWith('aud:')) {
        const id = key.slice(4);
        const row = (this._audiences || []).find((a) => String(a.id) === String(id));
        if (row) bdItems.push({ type: 'audience', id, key, name: row.name || 'Sin nombre' });
      } else if (key.startsWith('camp:')) {
        const id = key.slice(5);
        const row = (this._campaigns || []).find((c) => String(c.id) === String(id));
        if (!row) return;
        if (row.last_synced_at) canvasItems.push({ type: 'campaign-real', id, key });
        else bdItems.push({ type: 'campaign-concept', id, key, name: row.nombre_campana || 'Sin nombre' });
      } else if (key.startsWith('sticky:')) {
        stickyItems.push({ id: key.slice(7), key });
      } else if (key.startsWith('group:')) {
        groupItems.push({ id: key.slice(6), key });
      } else {
        const colon = key.indexOf(':');
        if (colon > 0) {
          const t = key.slice(0, colon);
          const id = key.slice(colon + 1);
          canvasItems.push({ type: 'identity', identityType: t, id, key });
        }
      }
    });

    // Sin confirm: borrado directo (la seleccion es accion deliberada del usuario,
    // Cmd+Z cubre los items canvas-only; BD destructivo es responsabilidad
    // explicita del Del/Backspace).

    // Canvas-only primero (sincrono / instant)
    canvasItems.forEach((item) => {
      try {
        if (item.type === 'identity') this._removeIdentityFromCanvas(item.identityType, item.id);
        else if (item.type === 'campaign-real') this._removeRealFromCanvas(item.id);
      } catch (e) { console.error('[CC] canvas remove error:', e); }
    });

    // Sticky: BD delete + limpieza local + free-links tocando
    for (const item of stickyItems) {
      try {
        const ok = await this._deleteStickyRemote(item.id);
        if (!ok) continue;
        // links libres tocando este sticky
        const touchingLinks = (this._store.edges.freeLinks || [])
          .filter((l) => l.from === item.key || l.to === item.key)
          .map((l) => ({ from: l.from, to: l.to }));
        touchingLinks.forEach((l) => this._store.removeFreeLink(l.from, l.to));
      } catch (e) { console.error('[CC] sticky delete error:', e); }
    }
    // Group: BD delete + cleanup local. NO afecta children (siguen en su sitio)
    for (const item of groupItems) {
      try {
        await this._deleteGroupRemote(item.id);
      } catch (e) { console.error('[CC] group delete error:', e); }
    }

    // BD destructivo: DELETE en supabase + limpieza local
    for (const item of bdItems) {
      try {
        const table = item.type === 'audience' ? 'audience_personas' : 'campaigns';
        const { error } = await this._supabase.from(table).delete().eq('id', item.id);
        if (error) {
          console.error('[CC] BD delete error:', error.message || error);
          continue;
        }
        if (item.type === 'audience') {
          this._audiences = (this._audiences || []).filter((a) => String(a.id) !== String(item.id));
        } else {
          this._campaigns = (this._campaigns || []).filter((c) => String(c.id) !== String(item.id));
        }
        // limpiar posicion + free-edges tocando al nodo borrado
        delete this._positions[item.key];
        // tambien limpiar onCanvas / placed (no aplica a aud/camp-concept, pero defensivo)
        this._store.removeOnCanvas(item.id);
        const touchingLinks = (this._store.edges.freeLinks || [])
          .filter((l) => l.from === item.key || l.to === item.key)
          .map((l) => ({ from: l.from, to: l.to }));
        touchingLinks.forEach((l) => this._store.removeFreeLink(l.from, l.to));
      } catch (e) {
        console.error('[CC] BD delete exception:', e);
      }
    }
    this._store.persistPositions();
    this._store.clearSelection();
    this._selectedKey = null;
    this._selected = null;
    this._renderCanvas();
    this._renderSelection();
    if (typeof this._renderCampaigns === 'function') this._renderCampaigns();
    if (typeof this._renderMiniDash === 'function') this._renderMiniDash();
  };

  // ------------------------------------------------------------------
  // F1.4: copy / paste / duplicate
  //
  // Clipboard en memoria (no OS clipboard) en this._ccClipboard:
  //   { items: [{kind, originalKey, originalId, position, snapshot}], edges: [{from,to}], capturedAt, pastedCount }
  //
  // Copy snapshot solo audiencias y campanas conceptuales (BD clonable).
  // Identities (producto/servicio/...) y campanas reales se ignoran porque
  // son referencias a entidades unicas; duplicar visualmente no tiene
  // semantica clara en F1.4. Free edges donde ambos endpoints estan en la
  // seleccion tambien se capturan para recrear entre los nuevos clones.
  //
  // Paste corre BD inserts secuenciales (no batch). Las posiciones se
  // desplazan por +24px * pastedCount (acumulado por cada paste sin un
  // copy nuevo). Las inserciones BD NO entran al undo stack (consistente
  // con persona_id en F1.2): el usuario revierte borrando manualmente
  // desde la biblioteca de audiencias/campanas.
  // ------------------------------------------------------------------

  P._ccCopyToClipboard = function () {
    this._ensureStore();
    const set = this._store.selectionSet;
    if (!set || set.size === 0) {
      console.info('[CC] copy: seleccion vacia');
      return;
    }
    const items = [];
    const edges = [];
    set.forEach((key) => {
      const cur = this._positions[key];
      const position = cur ? { x: cur.x, y: cur.y } : null;
      if (key.startsWith('aud:')) {
        const id = key.slice(4);
        const row = (this._audiences || []).find((a) => String(a.id) === String(id));
        if (row) items.push({ kind: 'audience', originalKey: key, originalId: id, position, snapshot: { ...row } });
      } else if (key.startsWith('camp:')) {
        const id = key.slice(5);
        const row = (this._campaigns || []).find((c) => String(c.id) === String(id));
        if (!row) return;
        if (row.last_synced_at) return; // campana real: no clonable
        items.push({ kind: 'campaign-concept', originalKey: key, originalId: id, position, snapshot: { ...row } });
      }
      // identities / real campaigns: ignore
    });
    const keySet = new Set([...set]);
    (this._store.edges.freeLinks || []).forEach((l) => {
      if (keySet.has(l.from) && keySet.has(l.to)) edges.push({ from: l.from, to: l.to });
    });
    this._ccClipboard = { items, edges, capturedAt: Date.now(), pastedCount: 0 };
    console.info(`[CC] copy: ${items.length} nodos + ${edges.length} conexiones`);
  };

  P._ccPasteFromClipboard = async function () {
    if (!this._ccClipboard || !Array.isArray(this._ccClipboard.items) || !this._ccClipboard.items.length) {
      console.info('[CC] paste: clipboard vacio');
      return;
    }
    if (!this._supabase) {
      console.warn('[CC] paste: sin conexion supabase');
      return;
    }
    if (this._ccPasteInFlight) {
      console.info('[CC] paste: paste anterior en curso');
      return;
    }
    this._ccPasteInFlight = true;
    this._ensureStore();

    this._ccClipboard.pastedCount = (this._ccClipboard.pastedCount || 0) + 1;
    const offset = 24 * this._ccClipboard.pastedCount;

    // Usuario actual: para sobreescribir created_by del clone (RLS + semantica:
    // el clon es del que clona, no del autor del original).
    let currentUserId = null;
    try {
      const { data: { user } } = await this._supabase.auth.getUser();
      currentUserId = user?.id || null;
    } catch (_) { /* noop */ }

    const newKeysByOld = new Map();
    const newDescs = new Map();

    try {
      for (const item of this._ccClipboard.items) {
        try {
          let cloneRow = null;
          if (item.kind === 'audience') {
            cloneRow = await this._cloneAudienceRow(item.snapshot, currentUserId);
            if (cloneRow) {
              this._audiences.push(cloneRow);
              const newKey = `aud:${cloneRow.id}`;
              newKeysByOld.set(item.originalKey, newKey);
              newDescs.set(newKey, { type: 'audience', id: String(cloneRow.id), key: newKey });
              if (item.position) {
                this._store.setNodePosition(newKey, item.position.x + offset, item.position.y + offset);
              }
            }
          } else if (item.kind === 'campaign-concept') {
            cloneRow = await this._cloneCampaignConceptRow(item.snapshot, currentUserId);
            if (cloneRow) {
              this._campaigns.push(cloneRow);
              const newKey = `camp:${cloneRow.id}`;
              newKeysByOld.set(item.originalKey, newKey);
              newDescs.set(newKey, { type: 'campaign-concept', id: String(cloneRow.id), key: newKey });
              if (item.position) {
                this._store.setNodePosition(newKey, item.position.x + offset, item.position.y + offset);
              }
            }
          }
        } catch (e) {
          console.error('[CC] paste clone error:', e);
        }
      }
      // Recrear free edges entre los nuevos keys (solo si ambos endpoints clonaron)
      this._ccClipboard.edges.forEach((edge) => {
        const nf = newKeysByOld.get(edge.from);
        const nt = newKeysByOld.get(edge.to);
        if (nf && nt) this._store.addFreeLink(nf, nt);
      });
      // Seleccionar los clones recien pegados
      const newKeys = Array.from(newKeysByOld.values());
      if (newKeys.length) {
        this._store.selectMulti(newKeys, newKeys[0], newDescs);
        this._selectedKey = newKeys[0];
        this._selected = newDescs.get(newKeys[0]);
      }
      console.info(`[CC] paste: ${newKeys.length} clones creados`);
    } finally {
      this._ccPasteInFlight = false;
      this._renderCanvas();
      this._renderSelection();
      if (typeof this._renderCampaigns === 'function') this._renderCampaigns();
      if (typeof this._renderMiniDash === 'function') this._renderMiniDash();
    }
  };

  P._ccDuplicate = async function () {
    this._ccCopyToClipboard();
    await this._ccPasteFromClipboard();
  };

  /**
   * Clona una fila de audience_personas. Strip: id/timestamps/computed.
   * Rename: name = "X (copia)". Sobreescribe created_by con el currentUserId
   * (RLS + semantica del clon). Devuelve la fila creada con su nuevo id.
   */
  P._cloneAudienceRow = async function (src, currentUserId) {
    const stripCols = new Set([
      'id', 'created_at', 'updated_at',
      'alignment_score', 'alignment_analyzed_at',
      'top_converting_segment',
      'real_age_distribution', 'real_gender_distribution',
      'real_location_distribution', 'real_interests',
    ]);
    const insert = {};
    Object.keys(src || {}).forEach((k) => {
      if (stripCols.has(k)) return;
      insert[k] = src[k];
    });
    insert.name = `${src.name || 'Sin nombre'} (copia)`;
    if (currentUserId && 'created_by' in (src || {})) insert.created_by = currentUserId;
    const { data, error } = await this._supabase
      .from('audience_personas')
      .insert(insert)
      .select()
      .single();
    if (error) {
      console.error('[CC] clone audience error:', error.message || error);
      return null;
    }
    return data;
  };

  /**
   * Clona una fila de campaigns (solo conceptuales — sin last_synced_at).
   * Strip: id/timestamps/cached metrics/external refs. Rename: nombre_campana
   * = "X (copia)". Fuerza source=internal y created_via=manual; sobreescribe
   * created_by con el currentUserId si esta presente.
   */
  P._cloneCampaignConceptRow = async function (src, currentUserId) {
    const stripCols = new Set([
      'id', 'created_at', 'updated_at',
      'cached_impressions', 'cached_clicks', 'cached_spend',
      'cached_conversions', 'cached_roas', 'cached_ctr',
      'match_scores', 'last_synced_at',
      'external_campaign_id', 'external_adset_id', 'external_account_id',
      'platform', 'integration_id',
    ]);
    const insert = {};
    Object.keys(src || {}).forEach((k) => {
      if (stripCols.has(k)) return;
      insert[k] = src[k];
    });
    insert.nombre_campana = `${src.nombre_campana || 'Sin nombre'} (copia)`;
    insert.source = 'internal';
    insert.created_via = 'manual';
    if (currentUserId && 'created_by' in (src || {})) insert.created_by = currentUserId;
    const { data, error } = await this._supabase
      .from('campaigns')
      .insert(insert)
      .select()
      .single();
    if (error) {
      console.error('[CC] clone campaign error:', error.message || error);
      return null;
    }
    return data;
  };

  // Wrap _setupCanvasListeners para instalar atajos + multi-select + hidratar
  // edges desde BD despues del setup original.
  const _origSetupCanvasListeners = P._setupCanvasListeners;
  if (typeof _origSetupCanvasListeners === 'function') {
    P._setupCanvasListeners = function () {
      const r = _origSetupCanvasListeners.apply(this, arguments);
      this._ensureStore();
      this._installCanvasShortcuts();
      this._installMultiSelect();
      // F2-prep: ANTES de cualquier hydrate de canvas state, asegurar que
      // la estrategia activa esta resuelta. Si es primera vez del brand,
      // _hydrateStrategies trae la lista + setea this._strategyId a la default.
      // Los demas hydrates leen this._strategyId, asi que esto debe ir primero.
      this._hydrateStrategies().then(() => {
        // Sidebar de estrategias: pintar la lista una vez resuelta la activa.
        this._renderStrategyPanel();
        this._renderStrategyHeaderName();
        // F2-prep.2: placements ANTES de los demas hydrates (necesita
        // la strategy activa pero deben aplicarse positions antes de
        // que _renderCanvas corra)
        this._hydrateNodePlacements();
        // F1.6: fire-and-forget hidratacion remota. Si la marca ya se hidrato
        // antes en esta misma vista, _hydrateRemoteEdges se sale solo.
        this._hydrateRemoteEdges();
        // F1.7: hidrata viewport per-usuario despues del setup. Tambien idempotente.
        this._hydrateRemoteView();
        // F1.10: hidrata stickies + escucha edits en textareas
        this._hydrateRemoteStickies();
        // F1.11: hidrata groups + escucha edits del title input
        this._hydrateRemoteGroups();
        // Sprint 1: realtime — canvas vivo reaccionando a Vera
        this._installRealtimeSubs();
        // Sprint 1.4: helper para simular Vera desde consola (dev)
        this._installVeraSimulator();
        // Sprint 2: Vera Insights — cards de pending_actions en el canvas
        this._hydrateVeraInsights();
        this._installVeraInsightListeners();
      });
      // F1.8: search en sidebar (input+clear listeners en ccPanelBody)
      this._installLibSearch();
      // Sidebar de estrategias (izquierda): colapsar/abrir + switch/create
      this._installStrategyPanel();
      // Nombre de la estrategia activa (editable) en el header
      this._installStrategyNameEditor();
      // F1.9: context menu (right-click) sobre canvas
      this._installCanvasContextMenu();
      // F1.10: listener de texto en stickies (delegado, no depende de strategy)
      this._installStickyContentListener();
      // F1.11: listener de title de group (delegado, no depende de strategy)
      this._installGroupTitleListener();
      // Inspector derecho REACTIVADO (2026-06-10): nodos minimalistas en el
      // canvas + panel derecho con TODOS los campos editables al seleccionar.
      this._installInspector();
      return r;
    };
  }

  // ------------------------------------------------------------------
  // F2: satelites de conjuntos+anuncios bajo el nodo Campana
  //
  // Cuando una campana real esta expanded (this._expandedReal.has(id)) y
  // sus datos de adsets/ads ya estan cacheados en this._adData[id], spawn-
  // eamos nodos satelite tipo pill alrededor del padre + edges bezier
  // dashed. Los satelites NO se persisten ni son interactivos en v1.
  // Sus posiciones se recalculan en cada render/_scheduleEdges para que
  // viajen con el padre durante drag/pan/zoom.
  // ------------------------------------------------------------------

  P._renderCampaignSatellites = function () {
    const world = document.getElementById('ccCanvasWorld');
    const svg   = document.getElementById('ccCanvasEdges');
    if (!world || !svg) return;
    // Limpia satelites + edges previas
    world.querySelectorAll('.cc-satellite').forEach((el) => el.remove());
    svg.querySelectorAll('.cc-satellite-edge').forEach((el) => el.remove());
    if (!this._adData) this._adData = {};

    // F2: ya no dependemos del expandible. Iteramos TODAS las campanas reales
    // que esten en el canvas, auto-fetcheamos sus adsets/ads y rendeamos
    // satelites cuando hay data. El fetch se dispara una sola vez por campId
    // gracias a _fetchCampaignAds (cache en this._adData[campId]).
    const realCampaigns = (this._campaigns || [])
      .filter((c) => c && c.last_synced_at && (typeof this._realOnCanvas === 'function' ? this._realOnCanvas(c) : true));

    // Set virtual de las que vamos a renderear este pase (las que tienen data)
    const idsToRender = new Set();
    realCampaigns.forEach((c) => {
      const id = String(c.id);
      const data = this._adData[id];
      if (!data) {
        // Kick off fetch en background; al resolver, re-renderea satelites
        if (typeof this._fetchCampaignAds === 'function' && !this._ccPendingAdFetch?.has?.(id)) {
          if (!this._ccPendingAdFetch) this._ccPendingAdFetch = new Set();
          this._ccPendingAdFetch.add(id);
          this._fetchCampaignAds(id).then(() => {
            this._ccPendingAdFetch?.delete?.(id);
            this._renderCampaignSatellites();
          }).catch(() => { this._ccPendingAdFetch?.delete?.(id); });
        }
        return;
      }
      idsToRender.add(id);
    });
    if (idsToRender.size === 0) return;

    const fmt = (v) => {
      const x = Number(v);
      if (!Number.isFinite(x)) return '0';
      if (x >= 1e6) return (x / 1e6).toFixed(1) + 'M';
      if (x >= 1e3) return (x / 1e3).toFixed(1) + 'K';
      return Math.round(x).toLocaleString('es-ES');
    };
    const shortId = (id) => {
      const s = String(id || '');
      return s.length > 10 ? '…' + s.slice(-8) : s;
    };

    // FASE 1: posicionar los DIVS en world coords (siguen el viewport
    // transform automaticamente porque viven en #ccCanvasWorld).
    // FASE 2: medir el DOM via getBoundingClientRect para calcular las
    // posiciones SCREEN de los paths bezier (igual que _updateEdgeGeometry).
    // Esto sincroniza divs (world) y lineas (screen) bajo cualquier pan/zoom.
    const linkages = []; // [{ from: HTMLEl, to: HTMLEl }]
    idsToRender.forEach((campId) => {
      const data = this._adData[String(campId)];
      if (!data || !Array.isArray(data.adsets) || data.adsets.length === 0) return;
      const parentKey = `camp:${campId}`;
      const pos = this._positions[parentKey];
      if (!pos) return;
      const parentEl = document.querySelector(`.cc-node[data-node-key="${ccCssEsc(parentKey)}"]`);
      if (!parentEl) return;

      const PARENT_W = 280, PARENT_H = 140;
      const ADSET_W = 220, ADSET_H = 56, ADSET_GAP = 28;
      const AD_W    = 220, AD_H    = 200, AD_GAP    = 24;
      const ROW1_Y  = pos.y + PARENT_H + 60;
      const ROW2_Y  = ROW1_Y + ADSET_H + 60;

      const adsets = data.adsets.slice(0, 6);
      const totalAdsetsW = adsets.length * ADSET_W + (adsets.length - 1) * ADSET_GAP;
      const adsetsStartX = pos.x + PARENT_W / 2 - totalAdsetsW / 2;

      adsets.forEach((aset, i) => {
        const aX = adsetsStartX + i * (ADSET_W + ADSET_GAP);
        const aY = ROW1_Y;
        const adsetDiv = document.createElement('div');
        adsetDiv.className = 'cc-satellite cc-satellite--adset';
        adsetDiv.setAttribute('data-satellite-parent', String(campId));
        adsetDiv.setAttribute('data-satellite-type', 'adset');
        adsetDiv.setAttribute('data-satellite-id', String(aset.id));
        adsetDiv.style.left = `${aX}px`;
        adsetDiv.style.top  = `${aY}px`;
        adsetDiv.style.width  = `${ADSET_W}px`;
        adsetDiv.style.height = `${ADSET_H}px`;
        const asetName = (aset.name && String(aset.name).trim()) || '';
        const asetTitle = asetName || `${fmt(aset.impr)} impresiones`;
        adsetDiv.innerHTML = `
          <span class="cc-satellite-icon"><i class="fas fa-layer-group"></i></span>
          <div class="cc-satellite-text">
            <span class="cc-satellite-type">Conjunto de anuncios</span>
            <span class="cc-satellite-name" title="${this.escapeHtml(asetTitle)}">${this.escapeHtml(asetTitle)}</span>
            <span class="cc-satellite-sub">${fmt(aset.impr)} impr · ${fmt(aset.conv)} conv</span>
          </div>`;
        world.appendChild(adsetDiv);
        linkages.push({ from: parentEl, to: adsetDiv });

        const ads = Array.isArray(aset.ads) ? aset.ads.slice(0, 3) : [];
        if (!ads.length) return;
        const aCenterX = aX + ADSET_W / 2;
        const totalAdsW = ads.length * AD_W + (ads.length - 1) * AD_GAP;
        const adsStartX = aCenterX - totalAdsW / 2;
        ads.forEach((ad, j) => {
          const adX = adsStartX + j * (AD_W + AD_GAP);
          const adY = ROW2_Y;
          const adDiv = document.createElement('div');
          adDiv.className = 'cc-satellite cc-satellite--ad';
          adDiv.setAttribute('data-satellite-parent', String(campId));
          adDiv.setAttribute('data-satellite-type', 'ad');
          adDiv.setAttribute('data-satellite-id', String(ad.id));
          adDiv.style.left = `${adX}px`;
          adDiv.style.top  = `${adY}px`;
          adDiv.style.width  = `${AD_W}px`;
          adDiv.style.height = `${AD_H}px`;
          const headline = ad.title || ad.body || ad.copy || '';
          const adName = (ad.name && String(ad.name).trim()) || 'Sin nombre';
          adDiv.innerHTML = `
            <div class="cc-satellite-thumb"><i class="fas fa-image"></i></div>
            <div class="cc-satellite-body">
              <span class="cc-satellite-type">Anuncio</span>
              <span class="cc-satellite-name" title="${this.escapeHtml(adName)}">${this.escapeHtml(adName)}</span>
              ${headline ? `<span class="cc-satellite-headline">${this.escapeHtml(headline)}</span>` : ''}
              <span class="cc-satellite-cta"><i class="fas fa-arrow-up-right-from-square"></i>&nbsp;Mas info</span>
              <span class="cc-satellite-sub" style="margin-top:2px;">${fmt(ad.impr)} impr</span>
            </div>`;
          world.appendChild(adDiv);
          linkages.push({ from: adsetDiv, to: adDiv });
        });
      });
    });

    // FASE 2: medir DOM y dibujar paths en screen coords (relative al canvas)
    if (!linkages.length) return;
    const canvas = document.getElementById('ccCanvas');
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const NS = 'http://www.w3.org/2000/svg';
    linkages.forEach((link) => {
      const fr = link.from.getBoundingClientRect();
      const tr = link.to.getBoundingClientRect();
      const fromX = (fr.left + fr.width / 2) - canvasRect.left;
      const fromY = fr.bottom - canvasRect.top;
      const toX   = (tr.left + tr.width / 2) - canvasRect.left;
      const toY   = tr.top - canvasRect.top;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'cc-satellite-edge');
      const dy = toY - fromY;
      const cy1 = fromY + dy * 0.45;
      const cy2 = toY - dy * 0.45;
      path.setAttribute('d', `M ${fromX} ${fromY} C ${fromX} ${cy1}, ${toX} ${cy2}, ${toX} ${toY}`);
      svg.appendChild(path);
    });
  };

  // ── FEAT-038: Satelites de PRODUCCION (runs_outputs) colgando del brief/campaign,
  // con badge de publicada (social_publications). Reusa el patron de satelites.
  // Depende de FEAT-037 (tagging brief_id/campaign_id) para tener datos. Estilos
  // inline a proposito: el visual final se pulira en Figma. Guardado en try/catch.
  P._fetchNodeProductions = async function (key, col, id) {
    if (!this._supabase) return;
    if (!this._prodData) this._prodData = {};
    try {
      let prodQ = this._supabase
        .from('runs_outputs')
        .select('id, output_type, published_at')
        .eq(col, id);
      // Aislamiento por org activa (no basta el brief_id/campaign_id ni RLS).
      if (this._organizationId) prodQ = prodQ.eq('organization_id', this._organizationId);
      const { data: prods } = await prodQ
        .order('created_at', { ascending: false })
        .limit(6);
      const list = Array.isArray(prods) ? prods : [];
      if (list.length) {
        const ids = list.map((p) => p.id);
        const { data: pubs } = await this._supabase
          .from('social_publications')
          .select('output_id, status, platform')
          .in('output_id', ids);
        const by = {};
        (pubs || []).forEach((pb) => { by[pb.output_id] = pb; });
        list.forEach((p) => { p._pub = by[p.id] || null; });
      }
      this._prodData[key] = list;
    } catch (_) { this._prodData[key] = []; }
  };

  P._renderProductionSatellites = function () {
    try {
      const world = document.getElementById('ccCanvasWorld');
      const svg   = document.getElementById('ccCanvasEdges');
      if (!world || !svg) return;
      world.querySelectorAll('.cc-prod-sat').forEach((el) => el.remove());
      svg.querySelectorAll('.cc-prod-sat-edge').forEach((el) => el.remove());
      const positions = this._positions || {};
      if (!this._prodData) this._prodData = {};
      if (!this._ccPendingProdFetch) this._ccPendingProdFetch = new Set();
      // F3: boton "Publicar" en satelites de produccion (publicacion manual del humano).
      if (!this._ccProdPublishWired) {
        this._ccProdPublishWired = true;
        document.addEventListener('click', (ev) => {
          const b = ev.target.closest && ev.target.closest('.cc-prod-publish-btn');
          if (b) { ev.preventDefault(); ev.stopPropagation(); this._publishProductionFromCanvas(b.getAttribute('data-output-id'), b); }
        });
      }
      const linkages = [];
      Object.keys(positions).forEach((key) => {
        let col = null;
        if (key.startsWith('briefs:')) col = 'brief_id';
        else if (key.startsWith('camp:')) col = 'campaign_id';
        else return;
        const id = key.slice(key.indexOf(':') + 1);
        const cached = this._prodData[key];
        if (cached === undefined) {
          if (!this._ccPendingProdFetch.has(key)) {
            this._ccPendingProdFetch.add(key);
            this._fetchNodeProductions(key, col, id).then(() => {
              this._ccPendingProdFetch.delete(key);
              this._renderProductionSatellites();
            }).catch(() => this._ccPendingProdFetch.delete(key));
          }
          return;
        }
        if (!cached.length) return;
        const pos = positions[key];
        if (!pos) return;
        const parentEl = document.querySelector(`.cc-node[data-node-key="${ccCssEsc(key)}"]`);
        if (!parentEl) return;
        const PW = 280, PH = 140, SW = 150, SH = 88, GAP = 20;
        const items = cached.slice(0, 6);
        const totalW = items.length * SW + (items.length - 1) * GAP;
        const startX = pos.x + PW / 2 - totalW / 2;
        const rowY = pos.y + PH + 70;
        items.forEach((p, i) => {
          const x = startX + i * (SW + GAP);
          const div = document.createElement('div');
          div.className = 'cc-prod-sat';
          div.style.cssText = `position:absolute;left:${x}px;top:${rowY}px;width:${SW}px;height:${SH}px;background:#141517;border:1px solid #242424;border-radius:10px;padding:8px;box-sizing:border-box;font-size:11px;color:#d4d1d8;overflow:hidden;`;
          const isVideo = p.output_type === 'video';
          const pub = p._pub;
          const isPublished = !!(pub && pub.status === 'published');
          let badge, action = '';
          if (isPublished) {
            badge = `<span style="color:#e8eaed;font-size:10px;">&#9679; Publicada${pub.platform ? ' &middot; ' + this.escapeHtml(pub.platform) : ''}</span>`;
          } else if (p.published_at) {
            badge = `<span style="color:#b8bdc4;font-size:10px;">&#9679; En pauta</span>`;
          } else {
            badge = `<span style="color:rgba(212,209,216,.5);font-size:10px;">&#9675; Lista para publicar</span>`;
            action = `<button class="cc-prod-publish-btn" data-output-id="${p.id}" style="margin-top:6px;width:100%;padding:4px 0;border:1px solid rgba(255,255,255,0.22);border-radius:6px;background:rgba(255,255,255,0.10);color:#e8eaed;font-size:10px;cursor:pointer;">Publicar</button>`;
          }
          div.style.height = action ? `${SH + 28}px` : `${SH}px`;
          div.innerHTML = `<div style="display:flex;align-items:center;gap:6px;"><i class="fas ${isVideo ? 'fa-film' : 'fa-image'}" style="color:#cfd3d8;"></i><span>${isVideo ? 'Video' : 'Imagen'}</span></div><div style="margin-top:6px;">${badge}</div>${action}`;
          world.appendChild(div);
          linkages.push({ from: parentEl, to: div });
        });
      });
      if (!linkages.length) return;
      const canvas = document.getElementById('ccCanvas');
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      const NS = 'http://www.w3.org/2000/svg';
      linkages.forEach((link) => {
        const fr = link.from.getBoundingClientRect();
        const tr = link.to.getBoundingClientRect();
        const fromX = (fr.left + fr.width / 2) - canvasRect.left;
        const fromY = fr.bottom - canvasRect.top;
        const toX   = (tr.left + tr.width / 2) - canvasRect.left;
        const toY   = tr.top - canvasRect.top;
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('class', 'cc-prod-sat-edge');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(106,163,255,.4)');
        path.setAttribute('stroke-dasharray', '4 4');
        const dy = toY - fromY;
        path.setAttribute('d', `M ${fromX} ${fromY} C ${fromX} ${fromY + dy * 0.45}, ${toX} ${toY - dy * 0.45}, ${toX} ${toY}`);
        svg.appendChild(path);
      });
    } catch (e) { /* nunca romper el render core */ }
  };

  // F3: publica una produccion manualmente (humano) via la funcion probada
  // api-social-publish, con la auth del usuario. ai-engine NUNCA postea.
  P._publishProductionFromCanvas = async function (outputId, btn) {
    if (!outputId || !this._supabase) return;
    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Publicando...'; }
      const { data: { session } } = await this._supabase.auth.getSession();
      const token = session && session.access_token;
      if (!token) { window.showToast && window.showToast('Sin sesion activa', { type: 'error' }); return; }
      const res = await fetch('/.netlify/functions/api-social-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ output_id: outputId, platforms: ['instagram', 'facebook'] }),
      });
      const data = await res.json().catch(() => ({}));
      const results = Array.isArray(data.results) ? data.results : [];
      const ok = results.some((r) => r.status === 'published');
      if (ok) {
        window.showToast && window.showToast('Produccion publicada', { type: 'success' });
        this._prodData = {};                 // invalidar cache -> re-render muestra "Publicada"
        this._renderProductionSatellites();
      } else {
        const fail = results.find((r) => r.status === 'failed');
        const msg = fail ? `Error: ${fail.error || 'fallo'}` : (data.error || 'No se pudo publicar');
        window.showToast && window.showToast(msg, { type: 'error' });
        if (btn) { btn.disabled = false; btn.textContent = 'Publicar'; }
      }
    } catch (e) {
      window.showToast && window.showToast('Error al publicar', { type: 'error' });
      if (btn) { btn.disabled = false; btn.textContent = 'Publicar'; }
    }
  };

  // Wrap _renderCanvas para tambien renderear satelites + vera_states + Vera Insights
  const _f12RenderCanvas = P._renderCanvas;
  if (typeof _f12RenderCanvas === 'function') {
    P._renderCanvas = function () {
      const r = _f12RenderCanvas.apply(this, arguments);
      this._renderCampaignSatellites();
      this._renderProductionSatellites();
      // Sprint 1: aplicar vera_state al DOM (las clases se pierden en re-render)
      this._applyAllVeraStates();
      // Sprint 2: render de Vera Insights (cards en columna izquierda)
      if (typeof this._renderVeraInsights === 'function') this._renderVeraInsights();
      return r;
    };
  }

  // Wrap _scheduleEdges/_updateEdgeGeometry: cuando se actualizan edges
  // (drag/pan), re-rendereamos satelites para que viajen con el padre.
  const _f12UpdateEdgeGeometry = P._updateEdgeGeometry;
  if (typeof _f12UpdateEdgeGeometry === 'function') {
    P._updateEdgeGeometry = function () {
      const r = _f12UpdateEdgeGeometry.apply(this, arguments);
      this._renderCampaignSatellites();
      this._renderProductionSatellites();
      return r;
    };
  }

  // Wrap _renderEdges: tras un re-render completo de edges, tambien los satelites
  const _f12RenderEdges = P._renderEdges;
  if (typeof _f12RenderEdges === 'function') {
    P._renderEdges = function () {
      const r = _f12RenderEdges.apply(this, arguments);
      this._renderCampaignSatellites();
      this._renderProductionSatellites();
      return r;
    };
  }

  // ------------------------------------------------------------------
  // F2-prep: gestion de estrategias (n8n-flow-like containers)
  // ------------------------------------------------------------------

  /**
   * Trae la lista de estrategias del brand activo. Idempotente por brand
   * via _ccStrategiesHydratedFor. Si no hay estrategias (brand nuevo),
   * crea la default automaticamente. Setea this._strategyId a la default
   * (o la primera en orden de creacion si no hay default marcada).
   */
  P._hydrateStrategies = async function () {
    this._ensureStore();
    const brandId = this._containerRow?.id;
    if (!this._supabase || !brandId) return;
    if (this._ccStrategiesHydratedFor === brandId && this._strategyId) return;
    this._ccStrategiesHydratedFor = brandId;
    try {
      const { data: rows, error } = await this._supabase
        .from('canvas_strategies')
        .select('id, name, description, color, icon, is_default, created_at')
        .eq('brand_container_id', brandId)
        .order('created_at', { ascending: true });
      if (error) {
        console.warn('[CC] hydrate strategies:', error.message || error);
        this._ccStrategiesHydratedFor = null;
        return;
      }
      let list = rows || [];
      // Brand nuevo sin estrategias: crear la default
      if (!list.length) {
        const created = await this._ensureDefaultStrategy(brandId);
        if (created) list = [created];
      }
      this._strategies = list;
      // Active = la default, o la primera si no hay default marcada
      const active = list.find((s) => s.is_default) || list[0] || null;
      if (active) {
        this._strategyId = active.id;
        this._strategy = active;
        this._store.setStrategy(active.id, active);
      }
    } catch (e) {
      console.warn('[CC] hydrate strategies exception:', e);
      this._ccStrategiesHydratedFor = null;
    }
  };

  /** Crea la "Estrategia general" default para un brand sin estrategias. */
  P._ensureDefaultStrategy = async function (brandId) {
    if (!this._supabase || !brandId || !this._organizationId) return null;
    try {
      const { data: { user } } = await this._supabase.auth.getUser();
      const insert = {
        organization_id: this._organizationId,
        brand_container_id: brandId,
        name: 'Estrategia general',
        description: 'Estrategia creada automaticamente al introducir el modelo de estrategias',
        color: 'blue',
        icon: 'fa-diagram-project',
        is_default: true,
      };
      if (user?.id) insert.created_by = user.id;
      const { data: row, error } = await this._supabase
        .from('canvas_strategies')
        .insert(insert)
        .select()
        .single();
      if (error) { console.warn('[CC] ensure default strategy:', error.message || error); return null; }
      return row;
    } catch (e) {
      console.warn('[CC] ensure default strategy exception:', e);
      return null;
    }
  };

  /** Cambia la estrategia activa y re-hydrata todo el canvas. */
  P._switchStrategy = async function (strategyId) {
    if (!strategyId || strategyId === this._strategyId) return;
    const next = (this._strategies || []).find((s) => String(s.id) === String(strategyId));
    if (!next) return;
    this._strategyId = next.id;
    this._strategy = next;
    this._store.setStrategy(next.id, next);
    // invalidar caches → la proxima llamada hidrata para la nueva strategy
    this._ccRemoteHydratedFor = null;
    this._ccViewHydratedFor = null;
    this._ccStickiesHydratedFor = null;
    this._ccGroupsHydratedFor = null;
    this._ccPlacementsHydratedFor = null;
    this._canvasNodePlacements = null;
    this._stickies = null;
    this._groups = null;
    // Re-hydrate
    await this._hydrateNodePlacements();
    await this._hydrateRemoteEdges();
    await this._hydrateRemoteView();
    await this._hydrateRemoteStickies();
    await this._hydrateRemoteGroups();
    // Sprint 1: re-subscribe realtime para la nueva strategy
    this._installRealtimeSubs();
    // Re-render del sidebar de estrategias + nombre en header (nueva activa)
    if (typeof this._renderStrategyPanel === 'function') this._renderStrategyPanel();
    if (typeof this._renderStrategyHeaderName === 'function') this._renderStrategyHeaderName();
    this._renderCanvas();
  };

  // ------------------------------------------------------------------
  // F2-prep.2 + F2-prep.3: canvas_node_placements write-through + migracion
  //
  // canvas_node_placements(strategy_id, node_type, node_id, position_x/y,
  //                        is_collapsed). Reemplaza el localStorage
  //                        cc:canvas:pos|oncanvas|placed:<brand> con un
  //                        modelo BD per-strategy.
  //
  // Tipos en BD: 'audience' | 'campaign' | 'product' | 'service' | 'place'
  //              | 'flow' | 'brief'. Keys frontend (aud:/camp:/products:/
  //              services:/places:/flows:/briefs:) se mapean en
  //              _keyFromPlacement / _typeAndIdFromKey.
  //
  // Stickies y groups tienen sus propias tablas y siguen con sus writes
  // directos a canvas_stickies / canvas_groups (F1.10 / F1.11).
  // ------------------------------------------------------------------

  // Mapping bidireccional entre key-prefix frontend y node_type BD
  P._keyFromPlacement = function (type, id) {
    const map = { audience: 'aud', campaign: 'camp', product: 'products', service: 'services', place: 'places', character: 'characters', flow: 'flows', brief: 'briefs' };
    return `${map[type] || type}:${id}`;
  };
  P._typeAndIdFromKey = function (key) {
    if (!key) return null;
    const colon = key.indexOf(':');
    if (colon < 0) return null;
    const prefix = key.slice(0, colon);
    const id = key.slice(colon + 1);
    const map = { aud: 'audience', camp: 'campaign', products: 'product', services: 'service', places: 'place', characters: 'character', flows: 'flow', briefs: 'brief' };
    if (!map[prefix]) return null; // sticky/group/group:... van por otras tablas
    return { node_type: map[prefix], node_id: id };
  };

  P._hydrateNodePlacements = async function () {
    this._ensureStore();
    const strategyId = this._strategyId;
    if (!this._supabase || !strategyId) return;
    if (this._ccPlacementsHydratedFor === strategyId) return;
    this._ccPlacementsHydratedFor = strategyId;
    try {
      // Antes del hydrate, intentar migrar localStorage la primera vez
      await this._migrateLocalStorageToPlacements();

      const { data: rows, error } = await this._supabase
        .from('canvas_node_placements')
        .select('id, node_type, node_id, position_x, position_y, is_collapsed, vera_state, vera_reasoning')
        .eq('strategy_id', strategyId);
      if (error) {
        console.warn('[CC] hydrate placements:', error.message || error);
        this._ccPlacementsHydratedFor = null;
        return;
      }
      const map = new Map();
      (rows || []).forEach((r) => {
        const key = this._keyFromPlacement(r.node_type, r.node_id);
        map.set(key, {
          id: r.id,
          x: Number(r.position_x) || 0,
          y: Number(r.position_y) || 0,
          is_collapsed: !!r.is_collapsed,
          vera_state: r.vera_state || 'idle',
          vera_reasoning: r.vera_reasoning || null,
        });
      });
      this._canvasNodePlacements = map;

      // Aplicar positions al store + reconstruir onCanvas/_placed desde BD
      // Suspender el write-through durante el apply para no disparar UPDATEs.
      this._ccSuspendPlacementWrite = true;
      const onCanvas = this._store.nodes.onCanvas;
      const placed = this._store.nodes.placed;
      onCanvas.clear();
      placed.length = 0;

      map.forEach((p, key) => {
        this._store.setNodePosition(key, p.x, p.y);
        if (p.is_collapsed) this._store.setCollapsed(key, true);
        if (key.startsWith('camp:')) {
          const id = key.slice(5);
          const c = (this._campaigns || []).find((x) => String(x.id) === id);
          if (c && c.last_synced_at) onCanvas.add(id);
        } else if (!key.startsWith('aud:') && !key.startsWith('sticky:') && !key.startsWith('group:')) {
          // identity prefix
          const colon = key.indexOf(':');
          if (colon > 0) {
            const type = key.slice(0, colon);
            const id = key.slice(colon + 1);
            // Enriquecer con name/sub si existe en lib cache o local data
            const lib = (this._libCache && this._libCache[type]) || [];
            const found = lib.find((it) => String(it.id) === id);
            const entry = { type, id };
            if (found) { if (found.name) entry.name = found.name; if (found.sub) entry.sub = found.sub; }
            placed.push(entry);
          }
        }
      });
      this._store.persistOnCanvas();
      this._store.persistPlaced();
      this._ccSuspendPlacementWrite = false;

      this._renderCanvas();
    } catch (e) {
      console.warn('[CC] hydrate placements exception:', e);
      this._ccPlacementsHydratedFor = null;
    } finally {
      this._ccSuspendPlacementWrite = false;
    }
  };

  /** UPSERT per-key debounced. */
  P._persistPlacementPosition = function (key) {
    if (this._ccSuspendPlacementWrite) return;
    if (!this._supabase || !this._strategyId) return;
    const ti = this._typeAndIdFromKey(key);
    if (!ti) return;
    if (!this._canvasNodePlacements) this._canvasNodePlacements = new Map();
    if (!this._ccPlacementPosTimers) this._ccPlacementPosTimers = {};
    if (this._ccPlacementPosTimers[key]) clearTimeout(this._ccPlacementPosTimers[key]);
    this._ccPlacementPosTimers[key] = setTimeout(async () => {
      delete this._ccPlacementPosTimers[key];
      const pos = this._positions[key];
      if (!pos) return;
      const existing = this._canvasNodePlacements.get(key);
      try {
        if (existing && existing.id) {
          const { error } = await this._supabase
            .from('canvas_node_placements')
            .update({ position_x: pos.x, position_y: pos.y })
            .eq('id', existing.id);
          if (error) console.warn('[CC] update placement pos:', error.message || error);
          else { existing.x = pos.x; existing.y = pos.y; }
        } else {
          const insertData = {
            strategy_id: this._strategyId,
            node_type: ti.node_type,
            node_id: ti.node_id,
            position_x: pos.x,
            position_y: pos.y,
          };
          const { data: { user } } = await this._supabase.auth.getUser();
          if (user?.id) insertData.created_by = user.id;
          const { data: row, error } = await this._supabase
            .from('canvas_node_placements')
            .insert(insertData)
            .select()
            .single();
          if (error && error.code !== '23505') {
            console.warn('[CC] insert placement (via pos):', error.message || error);
          } else if (row) {
            this._canvasNodePlacements.set(key, { id: row.id, x: row.position_x, y: row.position_y, is_collapsed: !!row.is_collapsed });
          }
        }
      } catch (e) {
        console.warn('[CC] persist placement pos exception:', e);
      }
    }, 800);
  };

  P._insertPlacement = async function (type, id, x, y) {
    if (!this._supabase || !this._strategyId) return null;
    const key = this._keyFromPlacement(type, id);
    if (!this._canvasNodePlacements) this._canvasNodePlacements = new Map();
    if (this._canvasNodePlacements.has(key)) return this._canvasNodePlacements.get(key);
    try {
      const insertData = {
        strategy_id: this._strategyId,
        node_type: type,
        node_id: String(id),
        position_x: Number(x) || 0,
        position_y: Number(y) || 0,
      };
      const { data: { user } } = await this._supabase.auth.getUser();
      if (user?.id) insertData.created_by = user.id;
      const { data: row, error } = await this._supabase
        .from('canvas_node_placements')
        .insert(insertData)
        .select()
        .single();
      if (error) {
        if (error.code === '23505') return null; // race; placement ya existe
        console.warn('[CC] insert placement:', error.message || error);
        return null;
      }
      const entry = { id: row.id, x: row.position_x, y: row.position_y, is_collapsed: !!row.is_collapsed };
      this._canvasNodePlacements.set(key, entry);
      return entry;
    } catch (e) {
      console.warn('[CC] insert placement exception:', e);
      return null;
    }
  };

  P._deletePlacement = async function (type, id) {
    if (!this._supabase || !this._strategyId) return false;
    const key = this._keyFromPlacement(type, id);
    if (!this._canvasNodePlacements) return false;
    const entry = this._canvasNodePlacements.get(key);
    if (!entry || !entry.id) { this._canvasNodePlacements.delete(key); return false; }
    try {
      const { error } = await this._supabase
        .from('canvas_node_placements')
        .delete()
        .eq('id', entry.id);
      if (error) { console.warn('[CC] delete placement:', error.message || error); return false; }
      this._canvasNodePlacements.delete(key);
      return true;
    } catch (e) {
      console.warn('[CC] delete placement exception:', e);
      return false;
    }
  };

  // ------------------------------------------------------------------
  // Sprint 1: Supabase Realtime — el canvas vivo
  //
  // Subs a postgres_changes para canvas_node_placements, canvas_edges,
  // canvas_stickies, canvas_groups filtrados por strategy_id activa.
  // Cualquier INSERT/UPDATE/DELETE que Vera (u otro usuario en la misma
  // estrategia) haga aparece en el canvas SIN refrescar.
  //
  // Para vera_state especificamente: UPDATE de placement con vera_state
  // distinto al previo dispara una clase CSS pulse en el nodo.
  // ------------------------------------------------------------------

  // ------------------------------------------------------------------
  // Sprint 2: Vera Insight nodes (vera_pending_actions visible en canvas)
  //
  // Fetch de pending_actions del brand activo + render como cards premium
  // en una columna a la izquierda. Botones inline Aprobar/Rechazar
  // disparan UPDATE BD; Realtime sync los hace desaparecer en vivo.
  //
  // Estos nodos NO son placements (no estan en canvas_node_placements);
  // son ephemerals derivados de vera_pending_actions y se rendean
  // directamente al world. Sus posiciones se recalculan cada render.
  // ------------------------------------------------------------------

  P._hydrateVeraInsights = async function () {
    if (!this._supabase || !this._containerRow?.id) return;
    if (this._ccVeraInsightsHydratedFor === this._containerRow.id) return;
    this._ccVeraInsightsHydratedFor = this._containerRow.id;
    try {
      const { data: rows, error } = await this._supabase
        .from('vera_pending_actions')
        .select('id, action_type, target_table, target_id, status, vera_confidence, vera_reasoning, impact_estimate, priority, expires_at, created_at')
        .eq('brand_container_id', this._containerRow.id)
        .eq('status', 'pending')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) {
        console.warn('[CC] hydrate vera insights:', error.message || error);
        this._ccVeraInsightsHydratedFor = null;
        return;
      }
      this._veraInsights = rows || [];
      this._renderCanvas();
    } catch (e) {
      console.warn('[CC] hydrate vera insights exception:', e);
      this._ccVeraInsightsHydratedFor = null;
    }
  };

  P._renderVeraInsights = function () {
    const world = document.getElementById('ccCanvasWorld');
    const svg   = document.getElementById('ccCanvasEdges');
    if (!world || !svg) return;
    // Limpiar previos
    world.querySelectorAll('.cc-vera-insight').forEach((el) => el.remove());
    svg.querySelectorAll('.cc-vera-edge').forEach((el) => el.remove());
    const insights = this._veraInsights || [];
    if (!insights.length) return;

    // Layout: columna izquierda del canvas, en cascada
    const CARD_W = 280, CARD_H = 200, CARD_GAP = 24;
    const startX = -350;
    const startY = 0;

    const labels = {
      update_persona: 'Actualizar Audiencia',
      create_audience: 'Crear Audiencia',
      create_brief: 'Crear Brief',
      create_campaign: 'Crear Campana',
      pause_campaign: 'Pausar Campana',
      iterate_creative: 'Iterar Creativo',
      link_brief_to_campaign: 'Vincular Brief',
      publish_post: 'Publicar Post',
    };
    const icons = {
      update_persona: 'fa-users-gear',
      create_audience: 'fa-users',
      create_brief: 'fa-file-circle-plus',
      create_campaign: 'fa-bullhorn',
      pause_campaign: 'fa-pause',
      iterate_creative: 'fa-rotate',
      link_brief_to_campaign: 'fa-link',
      publish_post: 'fa-paper-plane',
    };

    insights.forEach((insight, i) => {
      const x = startX;
      const y = startY + i * (CARD_H + CARD_GAP);
      const confidence = Math.round((Number(insight.vera_confidence) || 0) * 100);
      const actionLabel = labels[insight.action_type] || insight.action_type;
      const icon = icons[insight.action_type] || 'fa-bolt';
      const reasoning = String(insight.vera_reasoning || '').slice(0, 200);
      const reasoningTrunc = (insight.vera_reasoning || '').length > 200 ? '…' : '';
      // expires_at relativo
      let expiresLabel = '';
      if (insight.expires_at) {
        const ms = new Date(insight.expires_at).getTime() - Date.now();
        if (ms > 0) {
          const h = Math.floor(ms / 36e5);
          expiresLabel = h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
        } else {
          expiresLabel = 'vencido';
        }
      }
      const impactItems = insight.impact_estimate && typeof insight.impact_estimate === 'object'
        ? Object.entries(insight.impact_estimate).slice(0, 2).map(([k, v]) =>
            `<span class="cc-vera-impact">${this.escapeHtml(k)}: <strong>${this.escapeHtml(String(v))}</strong></span>`
          ).join('')
        : '';

      const div = document.createElement('div');
      div.className = 'cc-vera-insight';
      div.setAttribute('data-insight-id', String(insight.id));
      div.style.left = `${x}px`;
      div.style.top  = `${y}px`;
      div.style.width  = `${CARD_W}px`;
      div.innerHTML = `
        <div class="cc-vera-head">
          <span class="cc-vera-icon"><i class="fas ${icon}"></i></span>
          <div class="cc-vera-head-text">
            <span class="cc-vera-tag">VERA PROPONE</span>
            <span class="cc-vera-title">${this.escapeHtml(actionLabel)}</span>
          </div>
          <span class="cc-vera-conf" title="Confianza de Vera">${confidence}%</span>
        </div>
        <div class="cc-vera-body">
          <p class="cc-vera-reasoning">${this.escapeHtml(reasoning)}${reasoningTrunc}</p>
          ${impactItems ? `<div class="cc-vera-impacts">${impactItems}</div>` : ''}
        </div>
        <div class="cc-vera-foot">
          ${expiresLabel ? `<span class="cc-vera-expires" title="Tiempo restante"><i class="fas fa-clock"></i> ${expiresLabel}</span>` : '<span></span>'}
          <div class="cc-vera-actions">
            <button type="button" class="cc-vera-btn cc-vera-btn--reject" data-vera-action="reject" data-vera-id="${this.escapeHtml(String(insight.id))}" title="Rechazar"><i class="fas fa-xmark"></i></button>
            <button type="button" class="cc-vera-btn cc-vera-btn--approve" data-vera-action="approve" data-vera-id="${this.escapeHtml(String(insight.id))}" title="Aprobar"><i class="fas fa-check"></i> Aprobar</button>
          </div>
        </div>
      `;
      world.appendChild(div);
    });

    // Conexion bezier al target si existe en placements
    const canvas = document.getElementById('ccCanvas');
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const NS = 'http://www.w3.org/2000/svg';
    insights.forEach((insight) => {
      const targetKey = this._veraInsightTargetKey(insight);
      if (!targetKey) return;
      const targetEl = document.querySelector(`.cc-node[data-node-key="${ccCssEsc(targetKey)}"]`);
      const sourceEl = document.querySelector(`.cc-vera-insight[data-insight-id="${ccCssEsc(String(insight.id))}"]`);
      if (!targetEl || !sourceEl) return;
      const sr = sourceEl.getBoundingClientRect();
      const tr = targetEl.getBoundingClientRect();
      const fromX = (sr.right) - canvasRect.left;
      const fromY = (sr.top + sr.height / 2) - canvasRect.top;
      const toX   = (tr.left) - canvasRect.left;
      const toY   = (tr.top + tr.height / 2) - canvasRect.top;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'cc-vera-edge');
      const dx = toX - fromX;
      const cx1 = fromX + dx * 0.5;
      const cx2 = toX - dx * 0.5;
      path.setAttribute('d', `M ${fromX} ${fromY} C ${cx1} ${fromY}, ${cx2} ${toY}, ${toX} ${toY}`);
      svg.appendChild(path);
    });
  };

  P._veraInsightTargetKey = function (insight) {
    if (!insight || !insight.target_table || !insight.target_id) return null;
    const map = { audience_personas: 'aud', campaigns: 'camp', products: 'products', services: 'services', brand_places: 'places', brand_characters: 'characters', content_flows: 'flows', campaign_briefs: 'briefs' };
    const prefix = map[insight.target_table];
    if (!prefix) return null;
    return `${prefix}:${insight.target_id}`;
  };

  P._approveVeraInsight = async function (insightId) {
    if (!this._supabase) return;
    try {
      const { data: { user } } = await this._supabase.auth.getUser();
      const { error } = await this._supabase
        .from('vera_pending_actions')
        .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: user?.id || null })
        .eq('id', insightId);
      if (error) { console.warn('[CC] approve vera:', error.message); return; }
      // Quitar local + re-render (realtime tambien lo hara, pero damos feedback instantaneo)
      this._veraInsights = (this._veraInsights || []).filter((x) => String(x.id) !== String(insightId));
      this._renderCanvas();
    } catch (e) { console.warn('[CC] approve exception:', e); }
  };

  P._rejectVeraInsight = async function (insightId) {
    if (!this._supabase) return;
    try {
      const { data: { user } } = await this._supabase.auth.getUser();
      const { error } = await this._supabase
        .from('vera_pending_actions')
        .update({ status: 'rejected', rejected_at: new Date().toISOString(), rejected_by: user?.id || null })
        .eq('id', insightId);
      if (error) { console.warn('[CC] reject vera:', error.message); return; }
      this._veraInsights = (this._veraInsights || []).filter((x) => String(x.id) !== String(insightId));
      this._renderCanvas();
    } catch (e) { console.warn('[CC] reject exception:', e); }
  };

  P._installVeraInsightListeners = function () {
    const world = document.getElementById('ccCanvasWorld');
    if (!world || this._ccVeraInsightClick) return;
    this._ccVeraInsightClick = (e) => {
      const btn = e.target.closest('[data-vera-action]');
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();
      const action = btn.getAttribute('data-vera-action');
      const id = btn.getAttribute('data-vera-id');
      if (!id) return;
      if (action === 'approve') this._approveVeraInsight(id);
      else if (action === 'reject') this._rejectVeraInsight(id);
    };
    world.addEventListener('click', this._ccVeraInsightClick);
  };

  /** Test helper expuesto en window.veraCC.* para simular Vera desde consola.
      No es para produccion — solo dev/QA del canvas vivo. */
  P._installVeraSimulator = function () {
    if (typeof window === 'undefined' || window.veraCC) return;
    const view = this;
    window.veraCC = {
      /** Cambia vera_state de un nodo en BD → realtime → pulse en frontend.
          Uso: veraCC.simulate('aud:abc', 'analizando') */
      simulate: async (nodeKey, estado) => {
        if (!view._supabase || !view._strategyId) return console.warn('no strategy');
        const ti = view._typeAndIdFromKey(nodeKey);
        if (!ti) return console.warn('key invalida:', nodeKey);
        const valid = ['idle','analizando','creando','iterando','publicando','midiendo','esperando_aprobacion'];
        if (!valid.includes(estado)) return console.warn('estado invalido. validos:', valid);
        const { error } = await view._supabase
          .from('canvas_node_placements')
          .update({ vera_state: estado })
          .eq('strategy_id', view._strategyId)
          .eq('node_type', ti.node_type)
          .eq('node_id', ti.node_id);
        if (error) return console.warn('error:', error.message);
        console.info(`[veraCC] ${nodeKey} → ${estado}`);
      },
      /** Pasa el nodo a idle. Uso: veraCC.reset('aud:abc') */
      reset: (nodeKey) => window.veraCC.simulate(nodeKey, 'idle'),
      /** Lista los placements actuales con su vera_state */
      list: () => {
        if (!view._canvasNodePlacements) return [];
        const out = [];
        view._canvasNodePlacements.forEach((entry, key) => {
          out.push({ key, vera_state: entry.vera_state, x: entry.x, y: entry.y });
        });
        console.table(out);
        return out;
      },
      /** Pone TODOS los nodos al mismo estado. Uso: veraCC.all('creando') */
      all: async (estado) => {
        if (!view._canvasNodePlacements) return;
        const keys = [...view._canvasNodePlacements.keys()];
        for (const k of keys) await window.veraCC.simulate(k, estado);
      },
    };
    console.info('[CC] Vera simulator: window.veraCC.{simulate, reset, list, all}');
  };

  P._installRealtimeSubs = function () {
    if (!this._supabase || !this._strategyId) return;
    if (this._ccRealtimeChannel && this._ccRealtimeFor === this._strategyId) return;
    // Cleanup canal previo si cambio de strategy
    this._tearDownRealtimeSubs();
    this._ccRealtimeFor = this._strategyId;
    const sid = this._strategyId;
    const channel = this._supabase.channel(`cc-strategy-${sid}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'canvas_node_placements', filter: `strategy_id=eq.${sid}` },
        (payload) => this._onRealtimePlacementChange(payload))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'canvas_edges', filter: `strategy_id=eq.${sid}` },
        (payload) => this._onRealtimeEdgeChange(payload))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'canvas_stickies', filter: `strategy_id=eq.${sid}` },
        (payload) => this._onRealtimeStickyChange(payload))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'canvas_groups', filter: `strategy_id=eq.${sid}` },
        (payload) => this._onRealtimeGroupChange(payload))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'vera_pending_actions', filter: `brand_container_id=eq.${this._containerRow?.id}` },
        (payload) => this._onRealtimeVeraInsightChange(payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') console.info('[CC] Realtime subscribed:', sid);
      });
    this._ccRealtimeChannel = channel;
  };

  P._tearDownRealtimeSubs = function () {
    if (this._ccRealtimeChannel && this._supabase) {
      try { this._supabase.removeChannel(this._ccRealtimeChannel); } catch (_) {}
    }
    this._ccRealtimeChannel = null;
    this._ccRealtimeFor = null;
  };

  /** Handler: cambio en canvas_node_placements (Vera crea/mueve/cambia estado). */
  P._onRealtimePlacementChange = function (payload) {
    const { eventType, new: row, old: oldRow } = payload;
    if (!this._canvasNodePlacements) this._canvasNodePlacements = new Map();
    if (eventType === 'INSERT') {
      const r = row;
      const key = this._keyFromPlacement(r.node_type, r.node_id);
      const entry = {
        id: r.id,
        x: Number(r.position_x) || 0,
        y: Number(r.position_y) || 0,
        is_collapsed: !!r.is_collapsed,
        vera_state: r.vera_state || 'idle',
        vera_reasoning: r.vera_reasoning || null,
      };
      this._canvasNodePlacements.set(key, entry);
      this._ccSuspendPlacementWrite = true;
      this._store.setNodePosition(key, entry.x, entry.y);
      if (entry.is_collapsed) this._store.setCollapsed(key, true);
      // Reconstituir onCanvas / placed (para que aparezca en _canvasNodes)
      if (key.startsWith('camp:')) {
        const id = key.slice(5);
        const c = (this._campaigns || []).find((x) => String(x.id) === id);
        if (c && c.last_synced_at) this._store.nodes.onCanvas.add(id);
      } else if (!key.startsWith('aud:')) {
        const colon = key.indexOf(':');
        if (colon > 0) {
          const type = key.slice(0, colon);
          const id = key.slice(colon + 1);
          if (!(this._placed || []).some((p) => p.type === type && String(p.id) === id)) {
            this._placed.push({ type, id });
          }
        }
      }
      this._ccSuspendPlacementWrite = false;
      this._renderCanvas();
    } else if (eventType === 'UPDATE') {
      const r = row;
      const key = this._keyFromPlacement(r.node_type, r.node_id);
      const existing = this._canvasNodePlacements.get(key);
      const newVeraState = r.vera_state || 'idle';
      const positionChanged = !existing || existing.x !== Number(r.position_x) || existing.y !== Number(r.position_y);
      const veraStateChanged = !existing || existing.vera_state !== newVeraState;
      if (existing) {
        existing.x = Number(r.position_x) || 0;
        existing.y = Number(r.position_y) || 0;
        existing.is_collapsed = !!r.is_collapsed;
        existing.vera_state = newVeraState;
        existing.vera_reasoning = r.vera_reasoning || null;
      }
      if (positionChanged) {
        this._ccSuspendPlacementWrite = true;
        this._store.setNodePosition(key, Number(r.position_x) || 0, Number(r.position_y) || 0);
        this._ccSuspendPlacementWrite = false;
      }
      // Aplicar vera_state al DOM en-place (sin re-render full)
      if (veraStateChanged) this._applyVeraStateToNode(key, newVeraState);
      // Si position cambio, re-render para mover (el sticky/group/identity actual ya esta)
      if (positionChanged) this._scheduleEdges?.();
    } else if (eventType === 'DELETE') {
      const r = oldRow;
      if (!r) return;
      const key = this._keyFromPlacement(r.node_type, r.node_id);
      this._canvasNodePlacements.delete(key);
      // Quitar de onCanvas/_placed si aplica
      if (key.startsWith('camp:')) this._store.nodes.onCanvas.delete(r.node_id);
      else if (!key.startsWith('aud:')) {
        const colon = key.indexOf(':');
        if (colon > 0) {
          const type = key.slice(0, colon);
          this._placed = (this._placed || []).filter((p) => !(p.type === type && String(p.id) === String(r.node_id)));
          if (this._store && this._store.persistPlaced) this._store.persistPlaced();
        }
      }
      delete this._positions[key];
      this._renderCanvas();
    }
  };

  P._onRealtimeEdgeChange = function (payload) {
    const { eventType, new: row, old: oldRow } = payload;
    if (eventType === 'INSERT') {
      const r = row;
      // Las keys de nodo usan prefijos cortos (aud/camp/products...) — convertir
      // con el mismo mapa que _keyFromPlacement, no el source_type crudo, o el
      // edge apunta a nodos inexistentes y la conexion no se dibuja.
      const from = this._keyFromPlacement(r.source_type, r.source_id);
      const to   = this._keyFromPlacement(r.target_type, r.target_id);
      this._ccSuspendRemoteEdges = true;
      this._store.addFreeLink(from, to);
      this._ccSuspendRemoteEdges = false;
      this._renderCanvas();
    } else if (eventType === 'DELETE') {
      const r = oldRow;
      if (!r) return;
      const from = this._keyFromPlacement(r.source_type, r.source_id);
      const to   = this._keyFromPlacement(r.target_type, r.target_id);
      this._ccSuspendRemoteEdges = true;
      this._store.removeFreeLink(from, to);
      this._ccSuspendRemoteEdges = false;
      this._renderCanvas();
    }
  };

  P._onRealtimeStickyChange = function (payload) {
    const { eventType, new: row, old: oldRow } = payload;
    if (!this._stickies) this._stickies = [];
    if (eventType === 'INSERT') {
      const r = row;
      if (this._stickies.some((s) => String(s.id) === String(r.id))) return;
      this._stickies.push({
        id: r.id, content: r.content || '', color: r.color || 'yellow',
        width: r.width || 220, height: r.height || 140,
      });
      this._ccSuspendStickyPos = true;
      this._store.setNodePosition(`sticky:${r.id}`, r.position_x, r.position_y);
      this._ccSuspendStickyPos = false;
      this._renderCanvas();
    } else if (eventType === 'UPDATE') {
      const r = row;
      const local = this._stickies.find((s) => String(s.id) === String(r.id));
      if (local) {
        local.content = r.content || '';
        local.color = r.color || 'yellow';
        local.width = r.width || local.width;
        local.height = r.height || local.height;
        this._ccSuspendStickyPos = true;
        this._store.setNodePosition(`sticky:${r.id}`, r.position_x, r.position_y);
        this._ccSuspendStickyPos = false;
        this._renderCanvas();
      }
    } else if (eventType === 'DELETE') {
      const r = oldRow;
      if (!r) return;
      this._stickies = this._stickies.filter((s) => String(s.id) !== String(r.id));
      delete this._positions[`sticky:${r.id}`];
      this._renderCanvas();
    }
  };

  P._onRealtimeVeraInsightChange = function (payload) {
    const { eventType, new: row, old: oldRow } = payload;
    if (!this._veraInsights) this._veraInsights = [];
    if (eventType === 'INSERT' && row && row.status === 'pending') {
      this._veraInsights.unshift(row);
      this._renderCanvas();
      if (this._activeSection === 'dashboard') this._renderLibrary?.();
    } else if (eventType === 'UPDATE' && row) {
      if (row.status !== 'pending') {
        // Vera ejecuto / humano aprobo / rechazo / expiro → quitar del canvas
        this._veraInsights = this._veraInsights.filter((x) => String(x.id) !== String(row.id));
      } else {
        // Actualizo metadata (razonamiento, confianza) — replace in place
        const idx = this._veraInsights.findIndex((x) => String(x.id) === String(row.id));
        if (idx >= 0) this._veraInsights[idx] = row;
        else this._veraInsights.unshift(row);
      }
      this._renderCanvas();
      if (this._activeSection === 'dashboard') this._renderLibrary?.();
    } else if (eventType === 'DELETE' && oldRow) {
      this._veraInsights = this._veraInsights.filter((x) => String(x.id) !== String(oldRow.id));
      this._renderCanvas();
      if (this._activeSection === 'dashboard') this._renderLibrary?.();
    }
  };

  P._onRealtimeGroupChange = function (payload) {
    const { eventType, new: row, old: oldRow } = payload;
    if (!this._groups) this._groups = [];
    if (eventType === 'INSERT') {
      const r = row;
      if (this._groups.some((g) => String(g.id) === String(r.id))) return;
      this._groups.push({
        id: r.id, title: r.title || '', color: r.color || 'blue',
        width: r.width || 400, height: r.height || 300,
      });
      this._ccSuspendGroupPos = true;
      this._store.setNodePosition(`group:${r.id}`, r.position_x, r.position_y);
      this._ccSuspendGroupPos = false;
      this._renderCanvas();
    } else if (eventType === 'UPDATE') {
      const r = row;
      const local = this._groups.find((g) => String(g.id) === String(r.id));
      if (local) {
        local.title = r.title || '';
        local.color = r.color || local.color;
        local.width = r.width || local.width;
        local.height = r.height || local.height;
        this._ccSuspendGroupPos = true;
        this._store.setNodePosition(`group:${r.id}`, r.position_x, r.position_y);
        this._ccSuspendGroupPos = false;
        this._renderCanvas();
      }
    } else if (eventType === 'DELETE') {
      const r = oldRow;
      if (!r) return;
      this._groups = this._groups.filter((g) => String(g.id) !== String(r.id));
      delete this._positions[`group:${r.id}`];
      this._renderCanvas();
    }
  };

  /** Aplica la clase .cc-node--vera-<estado> al DOM del nodo. */
  P._applyVeraStateToNode = function (key, state) {
    const el = document.querySelector(`.cc-node[data-node-key="${ccCssEsc(key)}"]`);
    if (!el) return;
    ['idle','analizando','creando','iterando','publicando','midiendo','esperando_aprobacion']
      .forEach((s) => el.classList.remove(`cc-node--vera-${s}`));
    if (state && state !== 'idle') el.classList.add(`cc-node--vera-${state}`);
  };

  /** Itera todos los placements y aplica sus vera_state al DOM.
      Se llama tras cada _renderCanvas (los nodos se rebuilden y pierden la clase). */
  P._applyAllVeraStates = function () {
    if (!this._canvasNodePlacements) return;
    this._canvasNodePlacements.forEach((entry, key) => {
      if (entry.vera_state && entry.vera_state !== 'idle') {
        this._applyVeraStateToNode(key, entry.vera_state);
      }
    });
  };

  /** F2-prep.3: 1 vez por brand, migra cc:canvas:pos|oncanvas|placed:<brand>
      al BD como placements en la default strategy. */
  P._migrateLocalStorageToPlacements = async function () {
    if (!this._supabase || !this._containerRow?.id) return;
    const brandId = this._containerRow.id;
    const flagKey = `cc:canvas:migrated:${brandId}`;
    if (localStorage.getItem(flagKey) === '1') return;
    // Buscar la default strategy del brand
    const defaultStrategy = (this._strategies || []).find((s) => s.is_default) || (this._strategies || [])[0];
    if (!defaultStrategy) return;
    const sid = defaultStrategy.id;
    try {
      const positions = (() => {
        try { return JSON.parse(localStorage.getItem(`cc:canvas:pos:${brandId}`)) || {}; } catch (_) { return {}; }
      })();
      const onCanvas = (() => {
        try { return JSON.parse(localStorage.getItem(`cc:canvas:oncanvas:${brandId}`)) || []; } catch (_) { return []; }
      })();
      const placed = (() => {
        try { return JSON.parse(localStorage.getItem(`cc:canvas:placed:${brandId}`)) || []; } catch (_) { return []; }
      })();
      const rowsToUpsert = [];
      Object.keys(positions).forEach((key) => {
        const ti = this._typeAndIdFromKey(key);
        if (!ti) return; // sticky/group ya tienen sus tablas
        const pos = positions[key];
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
        rowsToUpsert.push({
          strategy_id: sid,
          node_type: ti.node_type,
          node_id: ti.node_id,
          position_x: pos.x,
          position_y: pos.y,
        });
      });
      // onCanvas: campanas reales sin position guardada → placement con pos 0,0
      onCanvas.forEach((id) => {
        const key = `camp:${id}`;
        if (!positions[key]) {
          rowsToUpsert.push({ strategy_id: sid, node_type: 'campaign', node_id: String(id), position_x: 0, position_y: 0 });
        }
      });
      // placed identities sin position guardada → placement con pos 0,0
      placed.forEach((p) => {
        if (!p || !p.type || p.id == null) return;
        const key = `${p.type}:${p.id}`;
        if (!positions[key]) {
          const ti = this._typeAndIdFromKey(key);
          if (!ti) return;
          rowsToUpsert.push({ strategy_id: sid, node_type: ti.node_type, node_id: ti.node_id, position_x: 0, position_y: 0 });
        }
      });
      if (rowsToUpsert.length) {
        const { error } = await this._supabase
          .from('canvas_node_placements')
          .upsert(rowsToUpsert, { onConflict: 'strategy_id,node_type,node_id' });
        if (error) {
          console.warn('[CC] migrate localStorage placements:', error.message || error);
          return; // no marcar como migrated; retry next time
        }
        console.info(`[CC] migrated ${rowsToUpsert.length} placements from localStorage to BD`);
      }
      localStorage.setItem(flagKey, '1');
    } catch (e) {
      console.warn('[CC] migrate placements exception:', e);
    }
  };

  // ------------------------------------------------------------------
  // F1.6: persistencia BD de free-links via tabla canvas_edges
  //
  // Modelo: write-through. localStorage sigue siendo cache instantanea;
  // BD es source-of-truth en cada carga. En el primer load por marca,
  // si BD esta vacia y localStorage tiene entries, hacemos backfill.
  //
  // Las mutaciones disparan inserts/deletes async (fire-and-forget) via
  // los listeners on('mutated:free-link-{add,remove}') instalados en
  // _ensureStore. Errores se loguean pero no rompen la UX.
  // ------------------------------------------------------------------

  function ccParseKey(k) {
    if (!k || typeof k !== 'string') return null;
    const colon = k.indexOf(':');
    if (colon <= 0 || colon === k.length - 1) return null;
    return { type: k.slice(0, colon), id: k.slice(colon + 1) };
  }

  P._hydrateRemoteEdges = async function () {
    this._ensureStore();
    const strategyId = this._strategyId;
    const orgId = this._organizationId;
    if (!this._supabase || !strategyId || !orgId) return;
    if (this._ccRemoteHydratedFor === strategyId) return; // idempotente por strategy
    this._ccRemoteHydratedFor = strategyId;
    try {
      const { data: rows, error } = await this._supabase
        .from('canvas_edges')
        .select('source_type, source_id, target_type, target_id')
        .eq('strategy_id', strategyId)
        .eq('edge_kind', 'free');
      if (error) {
        console.warn('[CC] hydrate canvas_edges error (cache local intacta):', error.message || error);
        this._ccRemoteHydratedFor = null; // permitir retry
        return;
      }
      const bdEdges = (rows || []).map((r) => ({
        // Convertir node_type -> prefijo de key (aud/camp/products...) con el
        // mismo mapa que _keyFromPlacement; el source_type crudo no matchea las
        // keys de nodo y las conexiones no se dibujan.
        from: this._keyFromPlacement(r.source_type, r.source_id),
        to:   this._keyFromPlacement(r.target_type, r.target_id),
      }));
      const localCount = (this._store.edges.freeLinks || []).length;

      if (bdEdges.length === 0 && localCount > 0) {
        // Backfill: BD vacia + local tiene → empujar local a BD.
        // Suspender los handlers de eventos para no duplicar inserts.
        console.info(`[CC] canvas_edges backfill: ${localCount} edges → BD`);
        const localCopy = [...this._store.edges.freeLinks];
        for (const e of localCopy) await this._insertEdgeRemote(e.from, e.to);
        return;
      }

      if (bdEdges.length > 0) {
        // BD es la fuente de verdad: reemplazar local con BD.
        // Suspender los handlers para que el replace no dispare inserts/deletes BD.
        this._ccSuspendRemoteEdges = true;
        this._store.edges.freeLinks.length = 0;
        const seen = new Set();
        bdEdges.forEach((e) => {
          // dedup defensivo en ambas direcciones (UNIQUE en BD ya bloquea exact, pero el cliente trata A→B == B→A)
          const k1 = `${e.from}->${e.to}`, k2 = `${e.to}->${e.from}`;
          if (seen.has(k1) || seen.has(k2)) return;
          seen.add(k1);
          this._store.edges.freeLinks.push(e);
        });
        this._store.persistFreeLinks();
        this._ccSuspendRemoteEdges = false;
        // Refrescar si cambio el count vs local previo
        if (this._store.edges.freeLinks.length !== localCount) {
          this._renderCanvas();
        }
      }
    } catch (e) {
      console.warn('[CC] hydrate canvas_edges exception:', e);
      this._ccRemoteHydratedFor = null;
    } finally {
      this._ccSuspendRemoteEdges = false;
    }
  };

  P._insertEdgeRemote = async function (fromKey, toKey) {
    if (!this._supabase || !this._containerRow?.id || !this._organizationId || !this._strategyId) return;
    const f = ccParseKey(fromKey), t = ccParseKey(toKey);
    if (!f || !t) return;
    try {
      const { error } = await this._supabase.from('canvas_edges').insert({
        organization_id: this._organizationId,
        brand_container_id: this._containerRow.id,
        strategy_id: this._strategyId,
        source_type: f.type, source_id: f.id,
        target_type: t.type, target_id: t.id,
        edge_kind: 'free',
      });
      // 23505 = unique violation (ya existe). Silenciar.
      if (error && error.code !== '23505') {
        console.warn('[CC] insert canvas_edge:', error.message || error);
      }
    } catch (e) {
      console.warn('[CC] insert canvas_edge exception:', e);
    }
  };

  P._deleteEdgeRemote = async function (fromKey, toKey) {
    if (!this._supabase || !this._strategyId) return;
    const f = ccParseKey(fromKey), t = ccParseKey(toKey);
    if (!f || !t) return;
    try {
      // Borrar ambas direcciones — nuestro dedup cliente trata A→B == B→A
      const filter = [
        `and(source_type.eq.${f.type},source_id.eq.${f.id},target_type.eq.${t.type},target_id.eq.${t.id})`,
        `and(source_type.eq.${t.type},source_id.eq.${t.id},target_type.eq.${f.type},target_id.eq.${f.id})`,
      ].join(',');
      const { error } = await this._supabase.from('canvas_edges')
        .delete()
        .eq('strategy_id', this._strategyId)
        .eq('edge_kind', 'free')
        .or(filter);
      if (error) {
        console.warn('[CC] delete canvas_edge:', error.message || error);
      }
    } catch (e) {
      console.warn('[CC] delete canvas_edge exception:', e);
    }
  };

  // ------------------------------------------------------------------
  // F1.7: persistencia BD del viewport (zoom + pan) per-usuario-per-brand
  //
  // canvas_views(user_id, brand_container_id, viewport_x, viewport_y, zoom,
  //              theme, last_opened_at) PK compuesta (user_id, brand_container_id).
  // Cada usuario tiene SU propio viewport por marca (zoom y pan personal);
  // el resto del canvas (nodos, edges) sigue siendo per-brand.
  //
  // Hidratacion: idempotente por brand_container_id (_ccViewHydratedFor).
  // Write-through: debounced 1500ms desde mutated:viewport del store, que
  // se emite via wrap de _applyCanvasTransform en F1.1.
  // ------------------------------------------------------------------

  P._hydrateRemoteView = async function () {
    this._ensureStore();
    const strategyId = this._strategyId;
    if (!this._supabase || !strategyId) return;
    if (this._ccViewHydratedFor === strategyId) return;
    this._ccViewHydratedFor = strategyId;
    try {
      const { data: { user } } = await this._supabase.auth.getUser();
      if (!user?.id) return;
      const { data: row, error } = await this._supabase
        .from('canvas_views')
        .select('viewport_x, viewport_y, zoom, theme')
        .eq('user_id', user.id)
        .eq('strategy_id', strategyId)
        .maybeSingle();
      if (error) {
        console.warn('[CC] hydrate canvas_view:', error.message || error);
        this._ccViewHydratedFor = null; // permitir retry
        return;
      }
      if (!row) return; // no hay viewport guardado todavia; deja el default
      const x = Number(row.viewport_x), y = Number(row.viewport_y), z = Number(row.zoom);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || z <= 0) return;
      // Si el usuario ya tocó el viewport mientras estabamos fetcheando
      // (pan/zoom durante el async), respetar su estado y no pisar.
      const cur = this._store.viewport;
      const isDefault = cur.x === 0 && cur.y === 0 && cur.scale === 1;
      if (!isDefault) return;
      // Suspender el listener para que el setViewport no dispare otro upsert
      this._ccSuspendRemoteView = true;
      this._store.setViewport({ x, y, scale: z });
      this._canvasPan = { x, y };
      this._canvasScale = z;
      if (typeof this._applyCanvasTransform === 'function') this._applyCanvasTransform();
      if (typeof this._renderEdges === 'function') this._renderEdges();
      if (typeof this._drawMinimap === 'function') this._drawMinimap();
      this._ccSuspendRemoteView = false;
    } catch (e) {
      console.warn('[CC] hydrate canvas_view exception:', e);
      this._ccViewHydratedFor = null;
    } finally {
      this._ccSuspendRemoteView = false;
    }
  };

  /**
   * Debounce 1500ms: pan/zoom dispara muchos eventos, solo persistimos cuando
   * el usuario se queda quieto. Throttle defensivo en flush.
   */
  P._persistRemoteView = function () {
    if (this._ccViewWriteTimer) clearTimeout(this._ccViewWriteTimer);
    this._ccViewWriteTimer = setTimeout(() => {
      this._ccViewWriteTimer = null;
      this._flushRemoteView();
    }, 1500);
  };

  // ------------------------------------------------------------------
  // F1.8: search en sidebar por seccion
  //
  // Inyecta un input arriba del body del panel cuando una seccion esta
  // activa. La query vive en this._libSearchQuery por seccion (se preserva
  // al cambiar entre secciones). Filtrado es in-place via class toggle
  // (.cc-lib-item--hidden) — no re-renderea el body, asi preserva scroll.
  // Debounce 200ms en input event para no thrashear con cada tecla.
  // ------------------------------------------------------------------

  const _origLibBodyHTML = P._libBodyHTML;
  P._libBodyHTML = function (key) {
    const items = this._libItemsFor(key);
    const query = (this._libSearchQuery && this._libSearchQuery[key]) || '';
    const qEsc = this.escapeHtml(query);
    const kEsc = this.escapeHtml(key);
    const clearBtn = query
      ? `<button type="button" class="cc-lib-search-clear" data-cc-search-clear="${kEsc}" aria-label="Limpiar busqueda"><i class="fas fa-times"></i></button>`
      : '';
    const searchHTML = `<div class="cc-lib-search" data-cc-search-zone="${kEsc}">
      <i class="fas fa-magnifying-glass cc-lib-search-ic"></i>
      <input type="text" class="cc-lib-search-input" data-cc-search-key="${kEsc}" placeholder="Buscar..." value="${qEsc}" autocomplete="off" spellcheck="false" />
      ${clearBtn}
    </div>`;

    // Estados que no listan items: mostrar search + el estado.
    if (items === undefined) return searchHTML + '<div class="cc-lib-loading"><i class="fas fa-spinner fa-spin"></i> Cargando…</div>';
    if (!items.length) return searchHTML + '<div class="cc-lib-empty">Sin elementos.</div>';

    // Pre-filtrar en HTML para que el initial render coincida con la query
    // guardada (no flash de items que luego se ocultan).
    const q = query.trim().toLowerCase();
    const icon = this._libIcon(key);
    let visibleCount = 0;
    const itemsHTML = items.map((it) => {
      const matches = !q
        || String(it.name || '').toLowerCase().includes(q)
        || String(it.sub  || '').toLowerCase().includes(q);
      if (matches) visibleCount++;
      const hiddenClass = matches ? '' : ' cc-lib-item--hidden';
      const subHTML = it.sub ? `<span class="cc-lib-item-sub">${this.escapeHtml(it.sub)}</span>` : '';
      return `<div class="cc-lib-item${hiddenClass}" draggable="true" data-lib-type="${kEsc}" data-lib-id="${this.escapeHtml(String(it.id))}" ${it.camp ? `data-camp-id="${this.escapeHtml(String(it.id))}"` : ''} title="${this.escapeHtml(it.name)}${it.camp ? ' — arrastra al canvas' : ''}">
        <i class="fas ${icon} cc-lib-item-ic"></i>
        <span class="cc-lib-item-name">${this.escapeHtml(it.name)}</span>
        ${subHTML}
      </div>`;
    }).join('');
    const noresults = (q && visibleCount === 0)
      ? '<div class="cc-lib-noresults">Sin resultados</div>'
      : '';
    return searchHTML + itemsHTML + noresults;
  };

  /**
   * Aplica el filtro in-place: toggle .cc-lib-item--hidden + clear button +
   * "Sin resultados". NO re-renderea el body (preserva scroll).
   */
  P._applyLibSearchFilter = function (key) {
    const body = document.getElementById('ccPanelBody');
    if (!body || this._activeSection !== key) return;
    const q = ((this._libSearchQuery && this._libSearchQuery[key]) || '').trim().toLowerCase();
    let visible = 0;
    body.querySelectorAll('.cc-lib-item').forEach((el) => {
      const name = (el.querySelector('.cc-lib-item-name')?.textContent || '').toLowerCase();
      const sub  = (el.querySelector('.cc-lib-item-sub')?.textContent  || '').toLowerCase();
      const matches = !q || name.includes(q) || sub.includes(q);
      el.classList.toggle('cc-lib-item--hidden', !matches);
      if (matches) visible++;
    });
    // Clear button: aparece cuando hay query
    const zone = body.querySelector('.cc-lib-search');
    if (zone) {
      const existing = zone.querySelector('.cc-lib-search-clear');
      if (q && !existing) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cc-lib-search-clear';
        btn.setAttribute('data-cc-search-clear', key);
        btn.setAttribute('aria-label', 'Limpiar busqueda');
        btn.innerHTML = '<i class="fas fa-times"></i>';
        zone.appendChild(btn);
      } else if (!q && existing) {
        existing.remove();
      }
    }
    // No-results placeholder
    let noresEl = body.querySelector('.cc-lib-noresults');
    if (q && visible === 0) {
      if (!noresEl) {
        noresEl = document.createElement('div');
        noresEl.className = 'cc-lib-noresults';
        noresEl.textContent = 'Sin resultados';
        body.appendChild(noresEl);
      }
    } else if (noresEl) {
      noresEl.remove();
    }
  };

  // ------------------------------------------------------------------
  // F1.9: context menu (right-click)
  //
  // contextmenu sobre nodo:
  //   - si el nodo NO esta en selectionSet → single-seleccionarlo primero
  //   - menu: Duplicar / Copiar / Colapsar (single) / Quitar del lienzo
  //     (identity+real) / Borrar / Propiedades (disabled F1.12)
  // contextmenu sobre canvas vacio:
  //   - menu: Pegar (disabled si clipboard vacio) / Agregar nota (disabled
  //     F1.10) / Agregar grupo (disabled F1.11)
  // Cierre: click fuera, Esc, o click en un item.
  // ------------------------------------------------------------------

  P._installCanvasContextMenu = function () {
    const canvas = document.getElementById('ccCanvas');
    if (!canvas) return;
    if (!this._ccCtxHandler) {
      this._ccCtxHandler = (e) => {
        // Skip si el target son inputs / panel flotante / inside del propio menu
        if (e.target.closest('input, textarea, select, .cc-floating-panel, .cc-ctx-menu')) return;
        e.preventDefault();
        e.stopPropagation();
        this._openCanvasContextMenu(e);
      };
      canvas.addEventListener('contextmenu', this._ccCtxHandler);
    }
    if (!this._ccCtxOutside) {
      this._ccCtxOutside = (e) => {
        if (!this._ccCtxOpen) return;
        if (e.target.closest('.cc-ctx-menu')) return;
        this._closeCanvasContextMenu();
      };
      // capture-phase para ganar antes que cualquier otro handler de click
      document.addEventListener('mousedown', this._ccCtxOutside, true);
    }
    if (!this._ccCtxEsc) {
      this._ccCtxEsc = (e) => {
        if (this._ccCtxOpen && (e.key === 'Escape' || e.key === 'Esc')) {
          this._closeCanvasContextMenu();
        }
      };
      document.addEventListener('keydown', this._ccCtxEsc, true);
    }
  };

  P._closeCanvasContextMenu = function () {
    const m = this._ccCtxOpen;
    if (!m) return;
    try { m.remove(); } catch (_) {}
    this._ccCtxOpen = null;
  };

  P._openCanvasContextMenu = function (e) {
    this._ensureStore();
    this._closeCanvasContextMenu();
    const nodeEl = e.target.closest('.cc-node');
    const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
    const M = isMac ? '⌘' : 'Ctrl+';

    // Si right-click sobre un nodo NO seleccionado, single-seleccionarlo
    // primero (UX estandar). Si esta dentro del set actual, mantenerlo.
    if (nodeEl) {
      const key = nodeEl.getAttribute('data-node-key');
      if (!this._store.selectionSet.has(key)) {
        const desc = {
          type: nodeEl.getAttribute('data-type'),
          id: nodeEl.getAttribute('data-id'),
          key,
        };
        if (desc.type === 'identity') desc.type = nodeEl.getAttribute('data-identity-type');
        this._store.setSelection({ key, descriptor: desc });
        this._selectedKey = key;
        this._selected = desc;
        this._renderSelection();
        if (typeof this._focusFlow === 'function') this._focusFlow(key);
      }
    }

    const m = document.createElement('div');
    m.className = 'cc-ctx-menu';
    m.setAttribute('role', 'menu');
    m.style.left = e.clientX + 'px';
    m.style.top  = e.clientY + 'px';

    const items = nodeEl
      ? this._ccCtxItemsForNode(nodeEl, M)
      : this._ccCtxItemsForCanvas(e, M);
    m.innerHTML = items.map((it) => {
      if (it.sep) return '<div class="cc-ctx-sep"></div>';
      const danger = it.danger ? ' cc-ctx-item--danger' : '';
      const dis = it.disabled ? ' disabled' : '';
      const soon = it.soon ? `<span class="cc-ctx-soon">${this.escapeHtml(it.soon)}</span>` : '';
      const kbd = it.kbd ? `<kbd>${this.escapeHtml(it.kbd)}</kbd>` : '';
      return `<button type="button" class="cc-ctx-item${danger}" data-ctx-action="${this.escapeHtml(it.action)}"${dis} role="menuitem">
        <i class="fas ${this.escapeHtml(it.icon)}"></i>
        <span class="cc-ctx-label">${this.escapeHtml(it.label)}</span>
        ${soon}${kbd}
      </button>`;
    }).join('');

    document.body.appendChild(m);
    this._ccCtxOpen = m;

    // Reposicionar si se sale del viewport
    const r = m.getBoundingClientRect();
    if (r.right > window.innerWidth) m.style.left = Math.max(4, window.innerWidth - r.width - 4) + 'px';
    if (r.bottom > window.innerHeight) m.style.top = Math.max(4, window.innerHeight - r.height - 4) + 'px';

    // Click en item
    m.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.cc-ctx-item[data-ctx-action]');
      if (!btn || btn.hasAttribute('disabled')) return;
      const action = btn.getAttribute('data-ctx-action');
      this._closeCanvasContextMenu();
      this._dispatchCtxAction(action, nodeEl, e);
    });
  };

  /** Lista de items para context menu sobre un nodo (selection-aware). */
  P._ccCtxItemsForNode = function (nodeEl, M) {
    const set = this._store.selectionSet;
    const size = set ? set.size : 0;
    const key = nodeEl.getAttribute('data-node-key');
    const type = nodeEl.getAttribute('data-type');
    const isCollapsed = this._collapsed && this._collapsed.has(key);
    // canvas-only types: identity (cualquier subtipo) + campana real
    const canvasOnly = type === 'identity' || type === 'campaign-real';
    const items = [
      { action: 'duplicate', icon: 'fa-clone',           label: size > 1 ? 'Duplicar seleccion' : 'Duplicar', kbd: M + 'D' },
      { action: 'copy',      icon: 'fa-copy',            label: size > 1 ? 'Copiar seleccion'   : 'Copiar',   kbd: M + 'C' },
    ];
    if (size <= 1 && type !== 'sticky' && type !== 'group') {
      items.push({ action: 'collapse', icon: isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up', label: isCollapsed ? 'Expandir' : 'Colapsar' });
    }
    if (canvasOnly) {
      items.push({ action: 'uncanvas', icon: 'fa-eye-slash', label: size > 1 ? 'Quitar del lienzo' : 'Quitar del lienzo' });
    }
    items.push({ sep: true });
    items.push({ action: 'delete', icon: 'fa-trash', label: size > 1 ? 'Borrar seleccion' : 'Borrar', kbd: 'Del', danger: true });
    items.push({ sep: true });
    if (size <= 1) {
      items.push({ action: 'props', icon: 'fa-sliders', label: 'Propiedades' });
    }
    return items;
  };

  /** Lista de items para context menu sobre canvas vacio. */
  P._ccCtxItemsForCanvas = function (e, M) {
    const hasClip = !!(this._ccClipboard && this._ccClipboard.items && this._ccClipboard.items.length);
    return [
      { action: 'paste',  icon: 'fa-paste',        label: 'Pegar',        kbd: M + 'V', disabled: !hasClip },
      { sep: true },
      { action: 'sticky', icon: 'fa-note-sticky',  label: 'Agregar nota' },
      { action: 'group',  icon: 'fa-object-group', label: 'Agregar grupo' },
    ];
  };

  /** Despacha la accion seleccionada del menu. */
  P._dispatchCtxAction = function (action, nodeEl, e) {
    switch (action) {
      case 'duplicate': this._ccDuplicate(); return;
      case 'copy':      this._ccCopyToClipboard(); return;
      case 'paste':     this._ccPasteFromClipboard(); return;
      case 'delete':    this._ccDeleteSelection(); return;
      case 'collapse':
        if (nodeEl) this._toggleCollapse(nodeEl.getAttribute('data-node-key'), nodeEl);
        return;
      case 'uncanvas':
        // Reutiliza la logica de Del: identity → uncanvas; campaign real → uncanvas
        // (NO toca audiencias / campanas conceptuales).
        if (this._store.selectionSet && this._store.selectionSet.size > 0) {
          const keys = [...this._store.selectionSet];
          keys.forEach((key) => {
            if (key.startsWith('camp:')) {
              const id = key.slice(5);
              const row = (this._campaigns || []).find((c) => String(c.id) === String(id));
              if (row && row.last_synced_at) this._removeRealFromCanvas(id);
            } else if (!key.startsWith('aud:') && !key.startsWith('sticky:')) {
              const colon = key.indexOf(':');
              if (colon > 0) this._removeIdentityFromCanvas(key.slice(0, colon), key.slice(colon + 1));
            }
          });
        }
        return;
      case 'sticky':
        // F1.10: crear sticky en el punto del right-click (clientX/Y del evento)
        if (e && Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
          this._createStickyAt(e.clientX, e.clientY);
        }
        return;
      case 'group':
        // F1.11: crear group en el punto del right-click
        if (e && Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
          this._createGroupAt(e.clientX, e.clientY);
        }
        return;
      case 'props':
        // F1.12: el inspector ya esta abierto si hay single-selection
        // (el right-click sobre el nodo lo selecciona). Forzamos render
        // por si la seleccion vino de otro flujo.
        this._renderInspector();
        return;
    }
  };

  // ------------------------------------------------------------------
  // F2: rediseno sidebar — 3 secciones (Estrategias, Nodos, Dashboard)
  //
  // Reemplaza las 8 secciones por entidad (audiencias/campanas/concepts/
  // products/services/places/flows/briefs) por una arquitectura mas
  // semantica: las estrategias se cambian, los tipos de nodos se listan
  // como una paleta unificada, y el dashboard muestra el analisis vivo
  // de la estrategia activa.
  //
  // Sin tocar Canvas.mixin.js: overrideo _librarySections, _libItemsFor,
  // _libBodyHTML, _libIcon. El render del rail + body sigue funcionando
  // tal cual con las nuevas secciones.
  // ------------------------------------------------------------------

  // Estrategias YA NO vive en el rail: tiene su propio sidebar izquierdo
  // (tipo historial, patron de Vera). Ver _renderStrategyPanel / _installStrategyPanel.
  P._librarySections = function () {
    return [
      { key: 'nodos',       label: 'Nodos',       icon: 'fa-circle-nodes' },
      { key: 'dashboard',   label: 'Dashboard',   icon: 'fa-chart-pie' },
    ];
  };

  P._libIcon = function (key) {
    return (this._librarySections().find((s) => s.key === key) || {}).icon || 'fa-circle';
  };

  P._libItemsFor = function (key) {
    if (key === 'dashboard') {
      // Cuenta de pending insights se muestra como badge en el rail
      return Array.isArray(this._veraInsights) ? this._veraInsights : [];
    }
    return [];
  };

  // F2: wrap _fetchLibrary para enriquecer products/services/places/flows
  // con datos visuales (imagen + tipo) usados por _nodosInstancesHTML.
  const _f2OrigFetchLibrary = P._fetchLibrary;
  if (typeof _f2OrigFetchLibrary === 'function') {
    P._fetchLibrary = async function (key) {
      if (!['products', 'services', 'places', 'characters', 'flows'].includes(key)) {
        return _f2OrigFetchLibrary.apply(this, arguments);
      }
      if (this._libCache[key] || (this._libFetching && this._libFetching[key])) return;
      if (!this._supabase) { this._libCache[key] = []; if (typeof this._fillLibSection === 'function') this._fillLibSection(key); return; }
      if (!this._libFetching) this._libFetching = {};
      this._libFetching[key] = true;
      const org = this._organizationId;
      try {
        if (key === 'products') {
          const { data: prods } = await this._supabase
            .from('products')
            .select('id, nombre_producto, tipo_producto')
            .eq('organization_id', org)
            .limit(200);
          const ids = (prods || []).map((p) => p.id);
          const imageMap = {};
          if (ids.length) {
            const { data: imgs } = await this._supabase
              .from('product_images')
              .select('product_id, image_url')
              .in('product_id', ids);
            (imgs || []).forEach((img) => {
              if (img.product_id && img.image_url && !imageMap[img.product_id]) imageMap[img.product_id] = img.image_url;
            });
          }
          this._libCache[key] = (prods || []).map((r) => ({
            id: r.id, name: r.nombre_producto || 'Producto',
            sub: r.tipo_producto || '', imageUrl: imageMap[r.id] || '',
          }));
        } else if (key === 'services') {
          // Services no tiene image table ni tipo; sub = duracion_estimada
          const { data } = await this._supabase
            .from('services')
            .select('id, nombre_servicio, duracion_estimada, precio_base, moneda')
            .eq('organization_id', org)
            .limit(200);
          this._libCache[key] = (data || []).map((r) => ({
            id: r.id, name: r.nombre_servicio || 'Servicio',
            sub: r.duracion_estimada
              ? String(r.duracion_estimada)
              : (r.precio_base ? `${r.precio_base} ${r.moneda || ''}`.trim() : ''),
            imageUrl: '',
          }));
        } else if (key === 'places') {
          // brand_places se filtra via entity_id → brand_entities con organization_id
          const { data: ents } = await this._supabase
            .from('brand_entities')
            .select('id')
            .eq('organization_id', org);
          const eids = (ents || []).map((e) => e.id);
          if (eids.length) {
            const { data: places } = await this._supabase
              .from('brand_places')
              .select('id, nombre_lugar, place_type, city')
              .in('entity_id', eids)
              .limit(200);
            const pids = (places || []).map((p) => p.id);
            const imageMap = {};
            if (pids.length) {
              const { data: imgs } = await this._supabase
                .from('place_images')
                .select('place_id, image_url, image_order')
                .in('place_id', pids)
                .order('image_order', { ascending: true });
              (imgs || []).forEach((img) => {
                if (img.place_id && img.image_url && !imageMap[img.place_id]) imageMap[img.place_id] = img.image_url;
              });
            }
            this._libCache[key] = (places || []).map((r) => ({
              id: r.id, name: r.nombre_lugar || 'Lugar',
              sub: [r.place_type, r.city].filter(Boolean).join(' · '),
              imageUrl: imageMap[r.id] || '',
            }));
          } else {
            this._libCache[key] = [];
          }
        } else if (key === 'characters') {
          // brand_characters se filtra via entity_id → brand_entities con organization_id
          const { data: ents } = await this._supabase
            .from('brand_entities')
            .select('id')
            .eq('organization_id', org);
          const eids = (ents || []).map((e) => e.id);
          if (eids.length) {
            const { data: characters } = await this._supabase
              .from('brand_characters')
              .select('id, nombre_personaje, tipo_personaje')
              .in('entity_id', eids)
              .limit(200);
            const cids = (characters || []).map((c) => c.id);
            const imageMap = {};
            if (cids.length) {
              const { data: imgs } = await this._supabase
                .from('character_images')
                .select('character_id, image_url, image_order')
                .in('character_id', cids)
                .order('image_order', { ascending: true });
              (imgs || []).forEach((img) => {
                if (img.character_id && img.image_url && !imageMap[img.character_id]) imageMap[img.character_id] = img.image_url;
              });
            }
            this._libCache[key] = (characters || []).map((r) => ({
              id: r.id, name: r.nombre_personaje || 'Personaje',
              sub: r.tipo_personaje || '',
              imageUrl: imageMap[r.id] || '',
            }));
          } else {
            this._libCache[key] = [];
          }
        } else if (key === 'flows') {
          // Solo flujos guardados (is_active = true) del usuario actual
          const { data: { user } } = await this._supabase.auth.getUser();
          if (user?.id) {
            const { data } = await this._supabase
              .from('content_flows')
              .select('id, name, output_type, status, is_active, flow_image_url')
              .eq('owner_id', user.id)
              .eq('is_active', true)
              .limit(200);
            this._libCache[key] = (data || []).map((r) => ({
              id: r.id, name: r.name || 'Flow',
              sub: r.output_type || '',
              imageUrl: r.flow_image_url || '',
            }));
          } else {
            this._libCache[key] = [];
          }
        }
      } catch (e) {
        console.warn(`[CC] fetchLibrary ${key}:`, e?.message || e);
        this._libCache[key] = [];
      } finally {
        this._libFetching[key] = false;
        if (typeof this._fillLibSection === 'function') this._fillLibSection(key);
      }
    };
  }

  /** Convierte un timestamp ISO en string relativo "hace X". */
  P._humanDelta = function (iso) {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60e3) return 'hace segundos';
    if (ms < 36e5) return `hace ${Math.floor(ms / 60e3)}m`;
    if (ms < 864e5) return `hace ${Math.floor(ms / 36e5)}h`;
    return `hace ${Math.floor(ms / 864e5)}d`;
  };

  /** Renderiza la lista de INSTANCIAS dragables de un tipo de nodo. */
  P._nodosInstancesHTML = function (catalogItem) {
    const t = catalogItem.type;
    let instances = [];
    let dragHint = '';

    if (t === 'audience') {
      instances = (this._audiences || []).map((a) => ({
        id: a.id, name: a.name || 'Sin nombre',
        sub: a.is_active === false ? 'apagada' : '',
        libType: 'audiences',
      }));
      dragHint = ' — arrastra al canvas';
    } else if (t === 'concept') {
      instances = (this._campaigns || []).filter((c) => !c.last_synced_at).map((c) => ({
        id: c.id, name: c.nombre_campana || 'Sin nombre',
        sub: c.status || '', libType: 'concepts',
      }));
      dragHint = ' — arrastra al canvas';
    } else if (t === 'campaign-real') {
      // Solo las reales que NO esten ya en el canvas
      instances = (this._campaigns || []).filter((c) => c.last_synced_at && !(typeof this._realOnCanvas === 'function' && this._realOnCanvas(c))).map((c) => ({
        id: c.id, name: c.nombre_campana || 'Sin nombre',
        sub: c.platform || '', libType: 'campaigns', camp: true,
      }));
      dragHint = ' — arrastra al canvas';
    } else if (['product', 'service', 'place', 'flow', 'brief'].includes(t)) {
      const libKey = ({ product: 'products', service: 'services', place: 'places', character: 'characters', flow: 'flows', brief: 'briefs' })[t];
      const cached = this._libCache && this._libCache[libKey];
      if (cached === undefined) {
        if (typeof this._fetchLibrary === 'function') {
          this._fetchLibrary(libKey).then(() => {
            if (this._activeSection === 'nodos') {
              const b = document.getElementById('ccPanelBody');
              if (b) b.innerHTML = this._libBodyHTML('nodos');
            }
          }).catch(() => {});
        }
        return '<div class="cc-nodo-sublist"><div class="cc-lib-loading"><i class="fas fa-spinner fa-spin"></i> Cargando…</div></div>';
      }
      instances = (cached || []).map((it) => ({ ...it, libType: libKey }));
      // Render especial: thumbnail + nombre + tipo. Aplica a productos y
      // lugares (que tienen imagenes), tambien a servicios y flows que
      // usan icono de fallback (sin tabla de imagenes).
      if (['product', 'place', 'character', 'service', 'flow'].includes(t)) {
        if (!instances.length) {
          const emptyMsg = ({
            product: 'Sin productos.',
            service: 'Sin servicios.',
            place: 'Sin lugares.',
            character: 'Sin personajes.',
            flow: 'Sin flujos guardados.',
          })[t];
          return `<div class="cc-nodo-sublist"><div class="cc-nodo-empty">${this.escapeHtml(emptyMsg)}</div></div>`;
        }
        const fallbackIcon = ({
          product: 'fa-box',
          service: 'fa-tag',
          place: 'fa-map-pin',
          character: 'fa-masks-theater',
          flow: 'fa-diagram-project',
        })[t];
        const itemsHTML = instances.map((it) => {
          const thumb = it.imageUrl
            ? `<img src="${this.escapeHtml(it.imageUrl)}" alt="" loading="lazy" />`
            : `<i class="fas ${fallbackIcon}"></i>`;
          return `<div class="cc-lib-item cc-nodo-product-item" draggable="true" data-lib-type="${this.escapeHtml(it.libType)}" data-lib-id="${this.escapeHtml(String(it.id))}" title="${this.escapeHtml(it.name)} — arrastra al canvas">
            <span class="cc-nodo-product-thumb">${thumb}</span>
            <span class="cc-nodo-product-text">
              <span class="cc-nodo-product-name">${this.escapeHtml(it.name)}</span>
              ${it.sub ? `<span class="cc-nodo-product-type">${this.escapeHtml(it.sub)}</span>` : ''}
            </span>
          </div>`;
        }).join('');
        return `<div class="cc-nodo-sublist">${itemsHTML}</div>`;
      }
      dragHint = ' — arrastra al canvas';
    } else if (t === 'sticky' || t === 'group') {
      return '<div class="cc-nodo-sublist"><div class="cc-nodo-empty">Se crean desde el lienzo (clic derecho).</div></div>';
    }

    if (!instances.length) {
      return '<div class="cc-nodo-sublist"><div class="cc-nodo-empty">Sin elementos.</div></div>';
    }
    const icon = catalogItem.icon;
    const itemsHTML = instances.map((it) => `
      <div class="cc-lib-item cc-nodo-sub-item" draggable="true" data-lib-type="${this.escapeHtml(it.libType)}" data-lib-id="${this.escapeHtml(String(it.id))}" ${it.camp ? `data-camp-id="${this.escapeHtml(String(it.id))}"` : ''} title="${this.escapeHtml(it.name)}${dragHint}">
        <i class="fas ${this.escapeHtml(icon)} cc-lib-item-ic"></i>
        <span class="cc-lib-item-name">${this.escapeHtml(it.name)}</span>
        ${it.sub ? `<span class="cc-lib-item-sub">${this.escapeHtml(it.sub)}</span>` : ''}
      </div>`).join('');
    return `<div class="cc-nodo-sublist">${itemsHTML}</div>`;
  };

  /** Tipos de nodo disponibles (catalogo agrupado). */
  P._nodosCatalog = function () {
    const cAud  = (this._audiences || []).length;
    const cCamp = (this._campaigns || []).filter((c) => c.last_synced_at).length;
    const cConc = (this._campaigns || []).filter((c) => !c.last_synced_at).length;
    // Nota (sticky) y Grupo se crean desde botones del header (son anotaciones
    // que viven SOLO dentro de la estrategia), ya no como tipos de nodo aqui.
    return [
      { id: 'objetivo-campana',   name: 'Objetivo de Campana',   icon: 'fa-bullseye',        group: 'Objetivos',    count: cConc, type: 'concept',       desc: 'Ancla de la estrategia; define el proposito al que apunta todo el flujo' },
      { id: 'objetivo-audiencia', name: 'Objetivo de Audiencia', icon: 'fa-users',           group: 'Objetivos',    count: cAud,  type: 'audience',      desc: 'El segmento humano que esta estrategia quiere alcanzar' },
      { id: 'campana-real',       name: 'Campana',               icon: 'fa-bullhorn',        group: 'Realidad',     count: cCamp, type: 'campaign-real', desc: 'Campanas sincronizadas desde Meta, Google u otra plataforma' },
      { id: 'producto',           name: 'Producto',              icon: 'fa-box',             group: 'Identidades',                type: 'product',       desc: 'Productos del catalogo de la marca' },
      { id: 'servicio',           name: 'Servicio',              icon: 'fa-tag',             group: 'Identidades',                type: 'service',       desc: 'Servicios que ofrece la marca' },
      { id: 'lugar',              name: 'Lugar',                 icon: 'fa-map-pin',         group: 'Identidades',                type: 'place',         desc: 'Locaciones fisicas de la marca' },
      { id: 'flow',               name: 'Flow',                  icon: 'fa-diagram-project', group: 'Identidades',                type: 'flow',          desc: 'Flujos de contenido del Studio' },
      { id: 'brief',              name: 'Brief',                 icon: 'fa-file-lines',      group: 'Identidades',                type: 'brief',         desc: 'Briefs creativos guardados' },
    ];
  };

  P._libBodyHTML = function (key) {
    if (key === 'nodos') {
      // Drill-down style (n8n): vista A = catalogo de tipos como cards;
      // click en uno → vista B = lista de instancias + boton back arriba.
      const drillId = this._nodosDrillType || null;
      const items = this._nodosCatalog();
      if (drillId) {
        const cur = items.find((it) => it.id === drillId);
        if (!cur) { this._nodosDrillType = null; return this._libBodyHTML('nodos'); }
        const back = `<button type="button" class="cc-nodo-back" data-nodo-back>
          <i class="fas fa-arrow-left"></i>
          <span>${this.escapeHtml(cur.name)}</span>
        </button>`;
        return back + this._nodosInstancesHTML(cur);
      }
      // Vista A: catalogo agrupado, cada item card grande con descripcion
      const groups = new Map();
      items.forEach((it) => {
        if (!groups.has(it.group)) groups.set(it.group, []);
        groups.get(it.group).push(it);
      });
      const html = [];
      groups.forEach((arr, gname) => {
        html.push(`<div class="cc-lib-group">${this.escapeHtml(gname)}</div>`);
        arr.forEach((it) => {
          const count = Number.isFinite(it.count) ? `<span class="cc-nodo-card-count">${it.count}</span>` : '';
          html.push(`<button type="button" class="cc-nodo-card" data-nodo-drill="${this.escapeHtml(it.id)}" title="${this.escapeHtml(it.name)}">
            <span class="cc-nodo-card-icon"><i class="fas ${this.escapeHtml(it.icon)}"></i></span>
            <span class="cc-nodo-card-text">
              <span class="cc-nodo-card-title">${this.escapeHtml(it.name)}${count}</span>
              <span class="cc-nodo-card-desc">${this.escapeHtml(it.desc || '')}</span>
            </span>
            <i class="fas fa-arrow-right cc-nodo-card-arrow"></i>
          </button>`);
        });
      });
      return html.join('');
    }
    if (key === 'dashboard') {
      const insights = this._veraInsights || [];
      const labels = {
        update_persona: 'Actualizar Audiencia',
        create_audience: 'Crear Audiencia',
        create_brief: 'Crear Brief',
        create_campaign: 'Crear Campana',
        pause_campaign: 'Pausar Campana',
        resume_campaign: 'Reactivar Campana',
        launch_campaign: 'Lanzar Campana',
        iterate_creative: 'Iterar Creativo',
        link_brief_to_campaign: 'Vincular Brief',
        publish_post: 'Publicar Post',
        modify_segment: 'Modificar Segmento',
      };
      const icons = {
        update_persona: 'fa-users-gear',
        create_audience: 'fa-users',
        create_brief: 'fa-file-circle-plus',
        create_campaign: 'fa-bullhorn',
        pause_campaign: 'fa-pause',
        resume_campaign: 'fa-play',
        launch_campaign: 'fa-rocket',
        iterate_creative: 'fa-rotate',
        link_brief_to_campaign: 'fa-link',
        publish_post: 'fa-paper-plane',
        modify_segment: 'fa-bullseye',
      };
      // AUTONOMIA PARCIAL: Vera puede HACER cualquier cosa dentro de la
      // plataforma (BD, generacion de assets) sin pedir aprobacion.
      // SOLO pide aprobacion cuando va a TOCAR EL MUNDO EXTERIOR
      // (plataformas, dinero, publicaciones publicas).
      const EXTERNAL_ACTIONS = new Set([
        'pause_campaign', 'resume_campaign', 'launch_campaign',
        'publish_post', 'modify_segment',
      ]);

      // Solo lo EXTERNO aparece aqui. Lo interno Vera lo ejecuta sola y el
      // usuario lo ve via el pulse del nodo en el canvas, no como tarjeta.
      const external = insights.filter((it) => EXTERNAL_ACTIONS.has(it.action_type));

      const header = `<div class="cc-dash-header">
        <span class="cc-dash-count">${external.length}</span>
        <span class="cc-dash-label">acciones esperan tu aprobacion</span>
      </div>`;

      if (external.length === 0) {
        return header + `<div class="cc-dash-empty">
          <i class="fas fa-check-circle"></i>
          <p>Sin acciones pendientes.</p>
          <p class="cc-dash-soon">Vera te avisa solo si necesita aprobacion para publicar, pausar o lanzar algo fuera de la plataforma.</p>
        </div>`;
      }

      const cards = external.map((it) => {
        const confidence = Math.round((Number(it.vera_confidence) || 0) * 100);
        const actionLabel = labels[it.action_type] || it.action_type;
        const icon = icons[it.action_type] || 'fa-bolt';
        const created = it.created_at ? this._humanDelta(it.created_at) : '';
        const priority = it.priority || 0;
        const prClass = priority >= 8 ? ' cc-dash-card--high' : '';
        let expiresLabel = '';
        if (it.expires_at) {
          const ms = new Date(it.expires_at).getTime() - Date.now();
          if (ms > 0) {
            const h = Math.floor(ms / 36e5);
            expiresLabel = h < 24 ? `${h}h restantes` : `${Math.floor(h / 24)}d restantes`;
          } else expiresLabel = 'vencido';
        }
        const impacts = it.impact_estimate && typeof it.impact_estimate === 'object'
          ? Object.entries(it.impact_estimate).slice(0, 3).map(([k, v]) =>
              `<span class="cc-dash-impact">${this.escapeHtml(k)}: <strong>${this.escapeHtml(String(v))}</strong></span>`).join('')
          : '';
        const reasoning = this.escapeHtml(String(it.vera_reasoning || ''));
        return `<div class="cc-dash-card${prClass}" data-dash-focus="${this.escapeHtml(String(it.id))}">
          <div class="cc-dash-card-head">
            <span class="cc-dash-icon"><i class="fas ${icon}"></i></span>
            <div class="cc-dash-card-title">
              <span class="cc-dash-tag">VERA PROPONE</span>
              <span class="cc-dash-action">${this.escapeHtml(actionLabel)}</span>
            </div>
            <span class="cc-dash-conf" title="Confianza">${confidence}%</span>
          </div>
          <p class="cc-dash-reasoning">${reasoning}</p>
          ${impacts ? `<div class="cc-dash-impacts">${impacts}</div>` : ''}
          <div class="cc-dash-card-foot">
            <span class="cc-dash-meta">${this.escapeHtml(created)}${expiresLabel ? ` · ${this.escapeHtml(expiresLabel)}` : ''}</span>
            <div class="cc-dash-actions">
              <button type="button" class="cc-dash-btn cc-dash-btn--reject" data-vera-action="reject" data-vera-id="${this.escapeHtml(String(it.id))}"><i class="fas fa-xmark"></i> Descartar</button>
              <button type="button" class="cc-dash-btn cc-dash-btn--approve" data-vera-action="approve" data-vera-id="${this.escapeHtml(String(it.id))}"><i class="fas fa-check"></i> Aprobar</button>
            </div>
          </div>
        </div>`;
      }).join('');
      return header + `<div class="cc-dash-list">${cards}</div>`;
    }
    return '<div class="cc-lib-empty">Sin elementos.</div>';
  };

  /** Instala listeners de input/click sobre ccPanelBody (1 vez por vista). */
  P._installLibSearch = function () {
    const body = document.getElementById('ccPanelBody');
    if (!body) return;
    if (!this._ccLibSearchInput) {
      this._ccLibSearchInput = (e) => {
        const input = e.target.closest('.cc-lib-search-input');
        if (!input) return;
        const key = input.getAttribute('data-cc-search-key');
        if (!key) return;
        if (!this._libSearchQuery) this._libSearchQuery = {};
        if (this._libSearchTimer) clearTimeout(this._libSearchTimer);
        const val = input.value;
        this._libSearchTimer = setTimeout(() => {
          this._libSearchTimer = null;
          this._libSearchQuery[key] = val;
          this._applyLibSearchFilter(key);
        }, 200);
      };
      body.addEventListener('input', this._ccLibSearchInput);
    }
    if (!this._ccLibSearchClear) {
      this._ccLibSearchClear = (e) => {
        const clear = e.target.closest('.cc-lib-search-clear');
        if (!clear) return;
        e.preventDefault(); e.stopPropagation();
        const key = clear.getAttribute('data-cc-search-clear');
        if (!key) return;
        if (this._libSearchQuery) this._libSearchQuery[key] = '';
        const input = body.querySelector(`.cc-lib-search-input[data-cc-search-key="${ccCssEsc(key)}"]`);
        if (input) input.value = '';
        this._applyLibSearchFilter(key);
        if (input) input.focus();
      };
      body.addEventListener('click', this._ccLibSearchClear);
    }
    // Sprint 2: handler Dashboard — botones Aprobar/Rechazar.
    // Si la insight referencia a un nodo del canvas (target_table+target_id),
    // click en el cuerpo de la card centra el viewport en ese nodo.
    if (!this._ccDashClick) {
      this._ccDashClick = (e) => {
        const btn = e.target.closest('[data-vera-action]');
        if (btn) {
          e.preventDefault(); e.stopPropagation();
          const action = btn.getAttribute('data-vera-action');
          const id = btn.getAttribute('data-vera-id');
          if (!id) return;
          if (action === 'approve') this._approveVeraInsight(id);
          else if (action === 'reject') this._rejectVeraInsight(id);
          return;
        }
        const card = e.target.closest('[data-dash-focus]');
        if (!card) return;
        e.preventDefault(); e.stopPropagation();
        const id = card.getAttribute('data-dash-focus');
        const it = (this._veraInsights || []).find((x) => String(x.id) === String(id));
        if (!it) return;
        const targetKey = this._veraInsightTargetKey(it);
        if (!targetKey) return;
        const el = document.querySelector(`.cc-node[data-node-key="${ccCssEsc(targetKey)}"]`);
        if (!el) return;
        const r = el.getBoundingClientRect();
        const canvas = document.getElementById('ccCanvas');
        if (!canvas) return;
        const cr = canvas.getBoundingClientRect();
        const dx = (cr.width / 2) - (r.left - cr.left + r.width / 2);
        const dy = (cr.height / 2) - (r.top - cr.top + r.height / 2);
        this._canvasPan = { x: (this._canvasPan?.x || 0) + dx, y: (this._canvasPan?.y || 0) + dy };
        if (typeof this._applyCanvasTransform === 'function') this._applyCanvasTransform();
        if (typeof this._renderEdges === 'function') this._renderEdges();
        // Flash sobre el nodo target
        el.classList.add('cc-node--flash');
        setTimeout(() => el.classList.remove('cc-node--flash'), 1200);
      };
      body.addEventListener('click', this._ccDashClick);
    }

    // F2: handler para Nodos drill-down (vista A → vista B)
    if (!this._ccNodosClick) {
      this._ccNodosClick = (e) => {
        // Back: vuelve a vista A
        const back = e.target.closest('[data-nodo-back]');
        if (back) {
          e.preventDefault(); e.stopPropagation();
          this._nodosDrillType = null;
          if (this._activeSection === 'nodos') {
            const b = document.getElementById('ccPanelBody');
            if (b) b.innerHTML = this._libBodyHTML('nodos');
          }
          return;
        }
        // Drill: entra a vista B
        const drill = e.target.closest('[data-nodo-drill]');
        if (drill) {
          e.preventDefault(); e.stopPropagation();
          this._nodosDrillType = drill.getAttribute('data-nodo-drill');
          if (this._activeSection === 'nodos') {
            const b = document.getElementById('ccPanelBody');
            if (b) b.innerHTML = this._libBodyHTML('nodos');
          }
        }
      };
      body.addEventListener('click', this._ccNodosClick);
    }
    // Estrategias (switch + create) se manejan en su propio sidebar izquierdo:
    // ver _installStrategyPanel. Ya no viven en ccPanelBody.
  };

  /** Crea una nueva estrategia con nombre incremental + la activa. */
  P._createStrategyQuick = async function () {
    if (!this._supabase || !this._containerRow?.id || !this._organizationId) return;
    try {
      const existing = (this._strategies || []).filter((s) => /^Estrategia\s+\d+$/i.test(s.name || ''));
      const nextN = existing.length + 2; // "Estrategia general" cuenta como 1
      const { data: { user } } = await this._supabase.auth.getUser();
      const insert = {
        organization_id: this._organizationId,
        brand_container_id: this._containerRow.id,
        name: `Estrategia ${nextN}`,
        color: 'blue',
        icon: 'fa-diagram-project',
        is_default: false,
      };
      if (user?.id) insert.created_by = user.id;
      const { data: row, error } = await this._supabase
        .from('canvas_strategies')
        .insert(insert)
        .select()
        .single();
      if (error) { console.error('[CC] create strategy:', error.message || error); return; }
      this._strategies = [...(this._strategies || []), row];
      // re-render sidebar de estrategias + switch
      if (typeof this._renderStrategyPanel === 'function') this._renderStrategyPanel();
      await this._switchStrategy(row.id);
    } catch (e) {
      console.error('[CC] create strategy exception:', e);
    }
  };

  // ------------------------------------------------------------------
  // Sidebar de Estrategias (izquierda, tipo historial — patron de Vera)
  //
  // Estrategias salio del rail derecho (Nodos/Dashboard) y vive ahora en su
  // propio panel colapsable a la izquierda del canvas. Lista tipo historial:
  // 1 item por estrategia (la activa con acento de marca) + "Nueva estrategia".
  // ------------------------------------------------------------------

  /** Pinta la lista de estrategias en #ccStratList. Reusa el markup
      cc-strategy-item (mismo estilo que tenia en el rail). */
  P._renderStrategyPanel = function () {
    const list = document.getElementById('ccStratList');
    if (!list) return;
    const items  = Array.isArray(this._strategies) ? this._strategies : [];
    const active = this._strategyId;
    const rows = items.map((s) => {
      const isActive = String(s.id) === String(active);
      return `<button type="button" class="cc-strategy-item ${isActive ? 'is-active' : ''}" data-strategy-id="${this.escapeHtml(String(s.id))}" title="${this.escapeHtml(s.name)}">
        <i class="fas ${this.escapeHtml(s.icon || 'fa-diagram-project')} cc-strategy-item-ic"></i>
        <span class="cc-strategy-item-name">${this.escapeHtml(s.name)}</span>
        ${s.is_default ? `<span class="cc-strategy-item-sub">${__('default')}</span>` : ''}
        ${isActive ? '<i class="fas fa-check cc-strategy-check"></i>' : ''}
      </button>`;
    }).join('');
    const empty = items.length ? '' : `<div class="cc-strat-empty">${__('Sin estrategias todavia.')}</div>`;
    list.innerHTML = `${empty}${rows}`;
  };

  /** Cablea el sidebar de estrategias (1 vez por vista). Panel SIEMPRE abierto
      (no colapsable). Boton "Nueva estrategia" en el header + delegacion de
      click en la lista para cambiar de estrategia. */
  P._installStrategyPanel = function () {
    if (this._ccStratWired) return;
    const list = document.getElementById('ccStratList');
    if (!list) return;
    this._ccStratWired = true;

    // Boton "Nueva estrategia" (header).
    document.getElementById('ccStratNew')?.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      this._createStrategyQuick();
    });

    // Switch de estrategia (delegado sobre la lista).
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.cc-strategy-item[data-strategy-id]');
      if (item) {
        e.preventDefault(); e.stopPropagation();
        const id = item.getAttribute('data-strategy-id');
        if (id && id !== this._strategyId) this._switchStrategy(id);
      }
    });

    this._renderStrategyPanel();
  };

  /* ── Nombre de la estrategia activa en el header (editable inline) ──── */

  /** Refleja el nombre de la estrategia activa en el input del header. */
  P._renderStrategyHeaderName = function () {
    const input = document.getElementById('ccStratNameInput');
    if (!input) return;
    // No pisar el valor mientras el usuario esta editando (foco).
    if (document.activeElement === input) return;
    const active = (this._strategies || []).find((s) => String(s.id) === String(this._strategyId));
    input.value = active?.name || '';
  };

  /** Cablea el input del nombre (1 vez): guarda en Enter/blur, revierte en Esc. */
  P._installStrategyNameEditor = function () {
    if (this._ccStratNameWired) return;
    const input = document.getElementById('ccStratNameInput');
    if (!input) return;
    this._ccStratNameWired = true;

    const activeName = () => (this._strategies || [])
      .find((s) => String(s.id) === String(this._strategyId))?.name || '';
    const commit = () => {
      const val = (input.value || '').trim();
      if (!val) { input.value = activeName(); return; } // no permitir nombre vacio
      if (val === activeName()) return;
      this._renameActiveStrategy(val);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
      else if (e.key === 'Escape') { input.value = activeName(); input.blur(); }
    });
    input.addEventListener('blur', commit);
    this._renderStrategyHeaderName();
  };

  /** Renombra la estrategia activa (BD + estado local + re-render lista/header). */
  P._renameActiveStrategy = async function (name) {
    const id = this._strategyId;
    if (!this._supabase || !id) return;
    const clean = String(name || '').trim().slice(0, 120);
    if (!clean) return;
    try {
      const { error } = await this._supabase
        .from('canvas_strategies')
        .update({ name: clean })
        .eq('id', id);
      if (error) { console.error('[CC] rename strategy:', error.message || error); return; }
      const s = (this._strategies || []).find((x) => String(x.id) === String(id));
      if (s) s.name = clean;
      if (this._strategy && String(this._strategy.id) === String(id)) this._strategy.name = clean;
      if (typeof this._renderStrategyPanel === 'function') this._renderStrategyPanel();
      this._renderStrategyHeaderName();
    } catch (e) {
      console.error('[CC] rename strategy exception:', e);
    }
  };

  P._flushRemoteView = async function () {
    if (!this._supabase || !this._containerRow?.id || !this._strategyId || !this._store) return;
    if (this._ccViewFlushInFlight) return; // simple throttle
    this._ccViewFlushInFlight = true;
    try {
      const { data: { user } } = await this._supabase.auth.getUser();
      if (!user?.id) return;
      const v = this._store.viewport;
      const payload = {
        user_id: user.id,
        brand_container_id: this._containerRow.id,
        strategy_id: this._strategyId,
        viewport_x: Number.isFinite(v.x) ? v.x : 0,
        viewport_y: Number.isFinite(v.y) ? v.y : 0,
        zoom:       Number.isFinite(v.scale) && v.scale > 0 ? v.scale : 1,
        last_opened_at: new Date().toISOString(),
      };
      const { error } = await this._supabase
        .from('canvas_views')
        .upsert(payload, { onConflict: 'user_id,strategy_id' });
      if (error) console.warn('[CC] upsert canvas_view:', error.message || error);
    } catch (e) {
      console.warn('[CC] upsert canvas_view exception:', e);
    } finally {
      this._ccViewFlushInFlight = false;
    }
  };

  // ------------------------------------------------------------------
  // F1.10: sticky notes — nodo de primera clase, per-brand en BD
  //
  // canvas_stickies(id, organization_id+brand_container_id, content, color,
  //                 position_x/y, width, height, created_at/by, updated_at).
  // Cada sticky se renderiza como .cc-node con sub-clase .cc-node--sticky
  // para reutilizar drag/select/multi/marquee del chasis. Su body es un
  // <textarea> con data-cc-sticky-content (el guard input/textarea del
  // F1.5 deja el typing fluir sin interferir con atajos de canvas).
  // Drag handle: la cabecera (.cc-sticky-head con data-drag-handle).
  // ------------------------------------------------------------------

  // Wrap _canvasNodes para incluir stickies en el listado base
  const _origCanvasNodes = P._canvasNodes;
  if (typeof _origCanvasNodes === 'function') {
    P._canvasNodes = function () {
      const base = _origCanvasNodes.apply(this, arguments);
      const stickies = (this._stickies || []).map((s) => ({
        key: `sticky:${s.id}`, type: 'sticky', id: s.id, row: s,
      }));
      return base.concat(stickies);
    };
  }

  // Wrap _nodeCampaignHTML: el render itera nodos y delega los tipos no-
  // audience/no-identity a _nodeCampaignHTML como fallback. Interceptamos
  // ese fallback y enrutamos sticky a su propio renderer.
  const _origNodeCampaignHTML = P._nodeCampaignHTML;
  if (typeof _origNodeCampaignHTML === 'function') {
    P._nodeCampaignHTML = function (n, pos) {
      if (n && n.type === 'sticky') return this._nodeStickyHTML(n, pos);
      return _origNodeCampaignHTML.apply(this, arguments);
    };
  }

  P._nodeStickyHTML = function (n, pos) {
    const s = n.row || {};
    const w = Number.isFinite(s.width) && s.width > 60 ? s.width : 220;
    const h = Number.isFinite(s.height) && s.height > 40 ? s.height : 140;
    const content = s.content || '';
    const escId = this.escapeHtml(String(n.id));
    return `<div class="cc-node cc-node--sticky" data-node-key="${this.escapeHtml(n.key)}" data-type="sticky" data-id="${escId}" style="left:${pos.x}px;top:${pos.y}px;width:${w}px;height:${h}px;">
      <div class="cc-sticky-head" data-drag-handle>
        <i class="fas fa-note-sticky"></i>
        <span>Nota</span>
      </div>
      <textarea class="cc-sticky-body" data-cc-sticky-content="${escId}" placeholder="Escribe una nota...">${this.escapeHtml(content)}</textarea>
    </div>`;
  };

  // ── Hydration BD ────────────────────────────────────────────────────
  P._hydrateRemoteStickies = async function () {
    this._ensureStore();
    const strategyId = this._strategyId;
    if (!this._supabase || !strategyId) return;
    if (this._ccStickiesHydratedFor === strategyId) return;
    this._ccStickiesHydratedFor = strategyId;
    try {
      const { data: rows, error } = await this._supabase
        .from('canvas_stickies')
        .select('id, content, color, position_x, position_y, width, height')
        .eq('strategy_id', strategyId);
      if (error) {
        console.warn('[CC] hydrate canvas_stickies:', error.message || error);
        this._ccStickiesHydratedFor = null;
        return;
      }
      this._stickies = (rows || []).map((r) => ({
        id: r.id,
        content: r.content || '',
        color: r.color || 'yellow',
        width:  Number.isFinite(r.width)  && r.width  > 60 ? r.width  : 220,
        height: Number.isFinite(r.height) && r.height > 40 ? r.height : 140,
      }));
      // Posiciones: aplicarlas al store sin disparar el write-through
      this._ccSuspendStickyPos = true;
      this._stickies.forEach((s, idx) => {
        const r = rows[idx];
        const x = Number(r.position_x), y = Number(r.position_y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          this._store.setNodePosition(`sticky:${s.id}`, x, y);
        }
      });
      this._ccSuspendStickyPos = false;
      this._renderCanvas();
    } catch (e) {
      console.warn('[CC] hydrate stickies exception:', e);
      this._ccStickiesHydratedFor = null;
    } finally {
      this._ccSuspendStickyPos = false;
    }
  };

  // ── Create sticky (BD insert + push local + select) ─────────────────
  P._createStickyAt = async function (clientX, clientY) {
    if (!this._supabase || !this._containerRow?.id || !this._organizationId || !this._strategyId) return;
    if (!this._stickies) this._stickies = [];
    try {
      const w = this._worldPointFromClient(clientX, clientY);
      const px = Math.max(0, w.x - 110), py = Math.max(0, w.y - 20);
      const { data: { user } } = await this._supabase.auth.getUser();
      const insert = {
        organization_id: this._organizationId,
        brand_container_id: this._containerRow.id,
        strategy_id: this._strategyId,
        content: '',
        color: 'yellow',
        position_x: px, position_y: py,
        width: 220, height: 140,
      };
      if (user?.id) insert.created_by = user.id;
      const { data: row, error } = await this._supabase
        .from('canvas_stickies')
        .insert(insert)
        .select()
        .single();
      if (error) { console.error('[CC] create sticky:', error.message || error); return; }
      this._stickies.push({
        id: row.id, content: row.content || '', color: row.color || 'yellow',
        width: row.width || 220, height: row.height || 140,
      });
      const key = `sticky:${row.id}`;
      this._ccSuspendStickyPos = true;
      this._store.setNodePosition(key, row.position_x, row.position_y);
      this._ccSuspendStickyPos = false;
      this._renderCanvas();
      // Seleccionar la nueva sticky y darle foco al textarea
      this._store.setSelection({ key, descriptor: { type: 'sticky', id: String(row.id), key } });
      this._selectedKey = key; this._selected = { type: 'sticky', id: String(row.id), key };
      this._renderSelection();
      // foco a la textarea recien renderizada
      requestAnimationFrame(() => {
        const ta = document.querySelector(`textarea[data-cc-sticky-content="${ccCssEsc(String(row.id))}"]`);
        if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      });
    } catch (e) {
      console.error('[CC] create sticky exception:', e);
    }
  };

  // ── Position write-through (debounced) ──────────────────────────────
  P._persistStickyPosition = function (stickyId) {
    if (!this._supabase || !this._containerRow?.id) return;
    if (!this._ccStickyPosTimers) this._ccStickyPosTimers = {};
    if (this._ccStickyPosTimers[stickyId]) clearTimeout(this._ccStickyPosTimers[stickyId]);
    this._ccStickyPosTimers[stickyId] = setTimeout(async () => {
      delete this._ccStickyPosTimers[stickyId];
      const pos = this._positions[`sticky:${stickyId}`];
      if (!pos) return;
      try {
        const { error } = await this._supabase
          .from('canvas_stickies')
          .update({ position_x: pos.x, position_y: pos.y })
          .eq('id', stickyId)
          .eq('brand_container_id', this._containerRow.id);
        if (error) console.warn('[CC] update sticky pos:', error.message || error);
      } catch (e) {
        console.warn('[CC] update sticky pos exception:', e);
      }
    }, 800);
  };

  // ── Content edit (debounced upsert) ─────────────────────────────────
  P._scheduleStickyContentSave = function (stickyId, content) {
    if (!this._supabase || !this._containerRow?.id) return;
    if (!this._ccStickyContentTimers) this._ccStickyContentTimers = {};
    if (this._ccStickyContentTimers[stickyId]) clearTimeout(this._ccStickyContentTimers[stickyId]);
    // Actualizar local in-memory inmediato (para que un re-render no reverta)
    const local = (this._stickies || []).find((x) => String(x.id) === String(stickyId));
    if (local) local.content = content;
    this._ccStickyContentTimers[stickyId] = setTimeout(async () => {
      delete this._ccStickyContentTimers[stickyId];
      try {
        const { error } = await this._supabase
          .from('canvas_stickies')
          .update({ content })
          .eq('id', stickyId)
          .eq('brand_container_id', this._containerRow.id);
        if (error) console.warn('[CC] update sticky content:', error.message || error);
      } catch (e) {
        console.warn('[CC] update sticky content exception:', e);
      }
    }, 800);
  };

  // ── Delete sticky (BD + local) ──────────────────────────────────────
  P._deleteStickyRemote = async function (stickyId) {
    if (!this._supabase || !this._containerRow?.id) return false;
    try {
      const { error } = await this._supabase
        .from('canvas_stickies')
        .delete()
        .eq('id', stickyId)
        .eq('brand_container_id', this._containerRow.id);
      if (error) { console.error('[CC] delete sticky:', error.message || error); return false; }
      this._stickies = (this._stickies || []).filter((s) => String(s.id) !== String(stickyId));
      delete this._positions[`sticky:${stickyId}`];
      this._store.persistPositions();
      return true;
    } catch (e) {
      console.error('[CC] delete sticky exception:', e);
      return false;
    }
  };

  // ── Install: textarea input listener (delegado en world) ────────────
  P._installStickyContentListener = function () {
    const canvas = document.getElementById('ccCanvas');
    if (!canvas || this._ccStickyInput) return;
    this._ccStickyInput = (e) => {
      const ta = e.target.closest('textarea[data-cc-sticky-content]');
      if (!ta) return;
      const id = ta.getAttribute('data-cc-sticky-content');
      if (!id) return;
      this._scheduleStickyContentSave(id, ta.value);
    };
    canvas.addEventListener('input', this._ccStickyInput);
  };

  // ------------------------------------------------------------------
  // F1.11: groups / frames — agrupador por contencion espacial
  //
  // canvas_groups(id, org+brand_container_id, title, color enum, position_x/y,
  //               width/height + CHECKs, created_at/by, updated_at).
  // Group se renderiza como .cc-node con .cc-node--group + variante de color.
  // Children NO viven en BD: al arrastrar el grupo, recalculamos espacialmente
  // que nodos tienen su CENTRO dentro del rect del grupo y los movemos juntos.
  // Asi, mover un nodo manualmente lo "saca" del grupo sin schema cambios.
  // Groups van PRIMERO en _canvasNodes → renderean detras de nodos.
  // ------------------------------------------------------------------

  // Wrap _canvasNodes para prepend groups (sobre el wrap F1.10)
  const _f10CanvasNodes = P._canvasNodes;
  if (typeof _f10CanvasNodes === 'function') {
    P._canvasNodes = function () {
      const lst = _f10CanvasNodes.apply(this, arguments);
      if (!this._groups || !this._groups.length) return lst;
      const groups = this._groups.map((g) => ({ key: `group:${g.id}`, type: 'group', id: g.id, row: g }));
      return groups.concat(lst); // groups primero → renderean detras
    };
  }

  // Wrap _nodeCampaignHTML para enrutar group → _nodeGroupHTML (chained sobre F1.10)
  const _f10NodeCampaignHTML = P._nodeCampaignHTML;
  if (typeof _f10NodeCampaignHTML === 'function') {
    P._nodeCampaignHTML = function (n, pos) {
      if (n && n.type === 'group') return this._nodeGroupHTML(n, pos);
      return _f10NodeCampaignHTML.apply(this, arguments);
    };
  }

  P._nodeGroupHTML = function (n, pos) {
    const g = n.row || {};
    const w = Number.isFinite(g.width)  && g.width  > 80 ? g.width  : 400;
    const h = Number.isFinite(g.height) && g.height > 60 ? g.height : 300;
    const title = g.title || '';
    const color = ['blue','green','purple','orange','red','gray'].includes(g.color) ? g.color : 'blue';
    const escId = this.escapeHtml(String(n.id));
    return `<div class="cc-node cc-node--group cc-group--${color}" data-node-key="${this.escapeHtml(n.key)}" data-type="group" data-id="${escId}" style="left:${pos.x}px;top:${pos.y}px;width:${w}px;height:${h}px;">
      <div class="cc-group-head" data-drag-handle>
        <i class="fas fa-object-group"></i>
        <input type="text" class="cc-group-title" data-cc-group-title="${escId}" placeholder="Sin titulo" value="${this.escapeHtml(title)}" autocomplete="off" spellcheck="false" />
      </div>
      <div class="cc-group-area"></div>
    </div>`;
  };

  // ── Hydration BD ────────────────────────────────────────────────────
  P._hydrateRemoteGroups = async function () {
    this._ensureStore();
    const strategyId = this._strategyId;
    if (!this._supabase || !strategyId) return;
    if (this._ccGroupsHydratedFor === strategyId) return;
    this._ccGroupsHydratedFor = strategyId;
    try {
      const { data: rows, error } = await this._supabase
        .from('canvas_groups')
        .select('id, title, color, position_x, position_y, width, height')
        .eq('strategy_id', strategyId);
      if (error) {
        console.warn('[CC] hydrate canvas_groups:', error.message || error);
        this._ccGroupsHydratedFor = null;
        return;
      }
      this._groups = (rows || []).map((r) => ({
        id: r.id,
        title: r.title || '',
        color: r.color || 'blue',
        width:  Number.isFinite(r.width)  && r.width  > 80 ? r.width  : 400,
        height: Number.isFinite(r.height) && r.height > 60 ? r.height : 300,
      }));
      this._ccSuspendGroupPos = true;
      this._groups.forEach((g, idx) => {
        const r = rows[idx];
        const x = Number(r.position_x), y = Number(r.position_y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          this._store.setNodePosition(`group:${g.id}`, x, y);
        }
      });
      this._ccSuspendGroupPos = false;
      this._renderCanvas();
    } catch (e) {
      console.warn('[CC] hydrate groups exception:', e);
      this._ccGroupsHydratedFor = null;
    } finally {
      this._ccSuspendGroupPos = false;
    }
  };

  // ── Create group (BD insert + push local + select) ──────────────────
  P._createGroupAt = async function (clientX, clientY) {
    if (!this._supabase || !this._containerRow?.id || !this._organizationId || !this._strategyId) return;
    if (!this._groups) this._groups = [];
    try {
      const w = this._worldPointFromClient(clientX, clientY);
      const px = Math.max(0, w.x - 200), py = Math.max(0, w.y - 150);
      const { data: { user } } = await this._supabase.auth.getUser();
      const insert = {
        organization_id: this._organizationId,
        brand_container_id: this._containerRow.id,
        strategy_id: this._strategyId,
        title: '',
        color: 'blue',
        position_x: px, position_y: py,
        width: 400, height: 300,
      };
      if (user?.id) insert.created_by = user.id;
      const { data: row, error } = await this._supabase
        .from('canvas_groups')
        .insert(insert)
        .select()
        .single();
      if (error) { console.error('[CC] create group:', error.message || error); return; }
      this._groups.push({
        id: row.id, title: row.title || '', color: row.color || 'blue',
        width: row.width || 400, height: row.height || 300,
      });
      const key = `group:${row.id}`;
      this._ccSuspendGroupPos = true;
      this._store.setNodePosition(key, row.position_x, row.position_y);
      this._ccSuspendGroupPos = false;
      this._renderCanvas();
      this._store.setSelection({ key, descriptor: { type: 'group', id: String(row.id), key } });
      this._selectedKey = key; this._selected = { type: 'group', id: String(row.id), key };
      this._renderSelection();
      requestAnimationFrame(() => {
        const inp = document.querySelector(`input[data-cc-group-title="${ccCssEsc(String(row.id))}"]`);
        if (inp) inp.focus();
      });
    } catch (e) {
      console.error('[CC] create group exception:', e);
    }
  };

  // ── Position write-through (debounced) ──────────────────────────────
  P._persistGroupPosition = function (groupId) {
    if (!this._supabase || !this._containerRow?.id) return;
    if (!this._ccGroupPosTimers) this._ccGroupPosTimers = {};
    if (this._ccGroupPosTimers[groupId]) clearTimeout(this._ccGroupPosTimers[groupId]);
    this._ccGroupPosTimers[groupId] = setTimeout(async () => {
      delete this._ccGroupPosTimers[groupId];
      const pos = this._positions[`group:${groupId}`];
      if (!pos) return;
      try {
        const { error } = await this._supabase
          .from('canvas_groups')
          .update({ position_x: pos.x, position_y: pos.y })
          .eq('id', groupId)
          .eq('brand_container_id', this._containerRow.id);
        if (error) console.warn('[CC] update group pos:', error.message || error);
      } catch (e) {
        console.warn('[CC] update group pos exception:', e);
      }
    }, 800);
  };

  // ── Title edit (debounced upsert) ───────────────────────────────────
  P._scheduleGroupTitleSave = function (groupId, title) {
    if (!this._supabase || !this._containerRow?.id) return;
    if (!this._ccGroupTitleTimers) this._ccGroupTitleTimers = {};
    if (this._ccGroupTitleTimers[groupId]) clearTimeout(this._ccGroupTitleTimers[groupId]);
    const local = (this._groups || []).find((g) => String(g.id) === String(groupId));
    if (local) local.title = title;
    this._ccGroupTitleTimers[groupId] = setTimeout(async () => {
      delete this._ccGroupTitleTimers[groupId];
      try {
        const { error } = await this._supabase
          .from('canvas_groups')
          .update({ title })
          .eq('id', groupId)
          .eq('brand_container_id', this._containerRow.id);
        if (error) console.warn('[CC] update group title:', error.message || error);
      } catch (e) {
        console.warn('[CC] update group title exception:', e);
      }
    }, 800);
  };

  // ── Delete group (BD + local; NO borra children) ────────────────────
  P._deleteGroupRemote = async function (groupId) {
    if (!this._supabase || !this._containerRow?.id) return false;
    try {
      const { error } = await this._supabase
        .from('canvas_groups')
        .delete()
        .eq('id', groupId)
        .eq('brand_container_id', this._containerRow.id);
      if (error) { console.error('[CC] delete group:', error.message || error); return false; }
      this._groups = (this._groups || []).filter((g) => String(g.id) !== String(groupId));
      delete this._positions[`group:${groupId}`];
      this._store.persistPositions();
      return true;
    } catch (e) {
      console.error('[CC] delete group exception:', e);
      return false;
    }
  };

  // ── Install: title input listener (delegado en canvas) ──────────────
  P._installGroupTitleListener = function () {
    const canvas = document.getElementById('ccCanvas');
    if (!canvas || this._ccGroupInput) return;
    this._ccGroupInput = (e) => {
      const inp = e.target.closest('input[data-cc-group-title]');
      if (!inp) return;
      const id = inp.getAttribute('data-cc-group-title');
      if (!id) return;
      this._scheduleGroupTitleSave(id, inp.value);
    };
    canvas.addEventListener('input', this._ccGroupInput);
  };

  // ── Group drag con children por contencion espacial ─────────────────
  // Wrap _beginNodeDrag (sobre el wrap F1.2+F1.3+F1.10 si lo hay) para
  // detectar type=group y delegar al group-drag con captura espacial.
  const _f10BeginNodeDrag = P._beginNodeDrag;
  if (typeof _f10BeginNodeDrag === 'function') {
    P._beginNodeDrag = function (e, nodeEl) {
      const type = nodeEl && nodeEl.getAttribute('data-type');
      if (type === 'group') { this._beginGroupDrag(e, nodeEl); return; }
      return _f10BeginNodeDrag.apply(this, arguments);
    };
  }

  P._beginGroupDrag = function (e, nodeEl) {
    e.preventDefault(); e.stopPropagation();
    this._ensureStore();
    this._didDrag = false;
    const groupKey = nodeEl.getAttribute('data-node-key');
    const groupId = nodeEl.getAttribute('data-id');
    const group = (this._groups || []).find((g) => String(g.id) === String(groupId));
    if (!group) return;
    const s = this._canvasScale || 1;
    const startMouse = { x: e.clientX, y: e.clientY };

    // Group base
    const gp = this._positions[groupKey];
    const groupBase = gp
      ? { x: gp.x, y: gp.y }
      : { x: parseFloat(nodeEl.style.left) || 0, y: parseFloat(nodeEl.style.top) || 0 };
    const gw = Number(group.width)  || 400;
    const gh = Number(group.height) || 300;

    // Children: nodos cuyo centro caen DENTRO del rect del grupo AHORA.
    // Excluye otros grupos (no anidamos en v1).
    const childBases = new Map();
    document.querySelectorAll('.cc-node').forEach((n) => {
      const k = n.getAttribute('data-node-key');
      if (k === groupKey) return;
      if (k && k.startsWith('group:')) return;
      const cp = this._positions[k];
      if (!cp) return;
      const nw = n.offsetWidth  || 244;
      const nh = n.offsetHeight || 120;
      const cx = cp.x + nw / 2, cy = cp.y + nh / 2;
      if (cx >= groupBase.x && cx <= groupBase.x + gw &&
          cy >= groupBase.y && cy <= groupBase.y + gh) {
        childBases.set(k, { x: cp.x, y: cp.y });
      }
    });

    nodeEl.classList.add('cc-node--dragging');
    const childEls = [];
    childBases.forEach((_, k) => {
      const el = document.querySelector(`.cc-node[data-node-key="${ccCssEsc(k)}"]`);
      if (el) { el.classList.add('cc-node--dragging'); childEls.push(el); }
    });

    const onMove = (ev) => {
      const dx = (ev.clientX - startMouse.x) / s;
      const dy = (ev.clientY - startMouse.y) / s;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._didDrag = true;
      const gx = groupBase.x + dx, gy = groupBase.y + dy;
      nodeEl.style.left = `${gx}px`;
      nodeEl.style.top  = `${gy}px`;
      if (this._positions[groupKey]) { this._positions[groupKey].x = gx; this._positions[groupKey].y = gy; }
      else this._positions[groupKey] = { x: gx, y: gy };
      childBases.forEach((base, k) => {
        const nx = base.x + dx, ny = base.y + dy;
        const el = document.querySelector(`.cc-node[data-node-key="${ccCssEsc(k)}"]`);
        if (el) { el.style.left = `${nx}px`; el.style.top = `${ny}px`; }
        if (this._positions[k]) { this._positions[k].x = nx; this._positions[k].y = ny; }
        else this._positions[k] = { x: nx, y: ny };
      });
      this._scheduleEdges();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      nodeEl.classList.remove('cc-node--dragging');
      childEls.forEach((el) => el.classList.remove('cc-node--dragging'));
      // snap to grid 16
      const baseByKey = new Map();
      const finalByKey = new Map();
      // group
      baseByKey.set(groupKey, groupBase);
      const gpos = this._positions[groupKey];
      if (gpos) {
        gpos.x = Math.round(gpos.x / 16) * 16;
        gpos.y = Math.round(gpos.y / 16) * 16;
        nodeEl.style.left = `${gpos.x}px`;
        nodeEl.style.top  = `${gpos.y}px`;
        finalByKey.set(groupKey, { x: gpos.x, y: gpos.y });
      }
      // children
      childBases.forEach((base, k) => {
        baseByKey.set(k, base);
        const cp = this._positions[k];
        if (!cp) return;
        cp.x = Math.round(cp.x / 16) * 16;
        cp.y = Math.round(cp.y / 16) * 16;
        const el = document.querySelector(`.cc-node[data-node-key="${ccCssEsc(k)}"]`);
        if (el) { el.style.left = `${cp.x}px`; el.style.top = `${cp.y}px`; }
        finalByKey.set(k, { x: cp.x, y: cp.y });
      });
      this._scheduleEdges();
      // Dispatch composite move (group + children) como 1 entrada de undo
      let anyChange = false;
      finalByKey.forEach((p, k) => {
        const b = baseByKey.get(k);
        if (b && (p.x !== b.x || p.y !== b.y)) { anyChange = true; }
      });
      if (anyChange) {
        this._store.dispatch(this._commands.moveNodes(baseByKey, finalByKey));
      } else {
        this._store.persistPositions();
      }
      this._drawMinimap();
      setTimeout(() => { this._didDrag = false; }, 0);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ------------------------------------------------------------------
  // F1.12: side-panel inspector derecho
  //
  // Aside fijo a la derecha que abre cuando hay seleccion single y muestra
  // props profundas / no-inline. Para sticky/group expone color (group) +
  // size (W/H). Para audiencias/campanas muestra resumen + campos clave no
  // disponibles inline. Multi-select o vacio → cierra (slide-out).
  //
  // Sub a mutated:selection del store dispara re-render automatico.
  // Cierre: boton X o Esc (que limpia seleccion → emit → close).
  // Convive con el sidebar izquierdo sin solaparse.
  // ------------------------------------------------------------------

  // El inspector YA NO es un aside separado (#ccInspector): sus opciones
  // editables se renderizan DENTRO del panel flotante derecho (#ccPanelBody),
  // en modo mutuamente excluyente con las secciones Nodos/Dashboard del rail.
  // Al seleccionar un nodo, el panel derecho abre el inspector; al deseleccionar
  // (o cerrar con la X del panel), vuelve a la libreria.
  P._installInspector = function () {
    if (this._inspectorWired) return;
    const host = document.getElementById('ccPanelBody');
    if (!host) return;
    this._inspectorWired = true;

    // Delegacion del inspector sobre #ccPanelBody. Convive con las demas
    // delegaciones del body (nodos/search) porque cada una matchea selectores
    // distintos. El cierre lo maneja #ccPanelToggle (X del panel) que limpia
    // la seleccion (ver _panelClick en Canvas.mixin).
    const hostOf = (el) => el.closest('[data-field-host]');
    host.addEventListener('click', (e) => {
      const colorBtn = e.target.closest('.cc-insp-color-btn[data-color]');
      if (colorBtn) {
        const color = colorBtn.getAttribute('data-color');
        const gid = colorBtn.getAttribute('data-target-id');
        if (gid && color) this._setGroupColor(gid, color);
        return;
      }
      const tagX = e.target.closest('.cc-tag-x');
      if (tagX) {
        e.preventDefault();
        const chip = tagX.closest('.cc-tag');
        const cont = chip ? chip.closest('.cc-field--tags') : null;
        if (chip && cont) { chip.remove(); this._commitTags(cont); }
        return;
      }
      const toggle = e.target.closest('.cc-node-toggle[data-toggle]');
      if (toggle) {
        const h = hostOf(toggle);
        if (h) this._toggleAudienceFlag(h.getAttribute('data-id'), toggle.getAttribute('data-toggle'), h);
        return;
      }
      const del = e.target.closest('.cc-insp-delete[data-del-type]');
      if (del) {
        e.preventDefault();
        this._confirmAndDelete(del.getAttribute('data-del-type'), del.getAttribute('data-del-id'), null);
      }
    });
    const onEdit = (e) => {
      const legacy = e.target.closest('.cc-insp-input[data-insp-field]');
      if (legacy) {
        const field = legacy.getAttribute('data-insp-field');
        const tType = legacy.getAttribute('data-target-type');
        const tId   = legacy.getAttribute('data-target-id');
        if (field && tType && tId) this._scheduleInspectorSave(tType, tId, field, legacy.value);
        return;
      }
      const fieldEl = e.target.closest('[data-field]');
      if (!fieldEl) return;
      const h = hostOf(fieldEl);
      if (!h) return;
      this._queueFieldSave(h, fieldEl, e.type === 'change');
      // Live-sync del nombre visible en el nodo compacto (evita que la tarjeta
      // muestre el nombre viejo mientras editas en el inspector).
      const fld = fieldEl.getAttribute('data-field');
      if (fld === 'name' || fld === 'nombre_campana') {
        const pfx = h.getAttribute('data-type') === 'audience' ? 'aud' : 'camp';
        const nameEl = document.querySelector(`.cc-node[data-node-key="${pfx}:${h.getAttribute('data-id')}"] .cc-node-name`);
        if (nameEl) nameEl.textContent = (fieldEl.value || '').trim() || 'Sin nombre';
      }
    };
    host.addEventListener('input', onEdit);
    host.addEventListener('change', onEdit);
    host.addEventListener('keydown', (e) => {
      const input = e.target.closest('.cc-tag-input');
      if (!input) return;
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); this._addTag(input); }
      else if (e.key === 'Backspace' && input.value === '') {
        const cont = input.closest('.cc-field--tags');
        const chips = cont ? cont.querySelectorAll('.cc-tag') : null;
        if (chips && chips.length) { chips[chips.length - 1].remove(); this._commitTags(cont); }
      }
    });
  };

  /** Sale del modo inspector y devuelve el panel derecho a la libreria
      (seccion activa o cerrado). */
  P._closeInspectorVisually = function () {
    if (!this._inspecting) return;
    this._inspecting = false;
    if (typeof this._renderLibrary === 'function') this._renderLibrary();
  };

  /** Lee store.selection y decide si el panel derecho muestra el inspector del
      nodo (single-selection) o vuelve a la libreria. */
  P._renderInspector = function () {
    const panel = document.getElementById('ccSidebar');
    const body  = document.getElementById('ccPanelBody');
    const title = document.getElementById('ccPanelTitle');
    if (!panel || !body) return;
    this._ensureStore();
    const set = this._store.selectionSet;
    const sel = this._store.selection;
    if (!sel || set.size !== 1) { this._closeInspectorVisually(); return; }
    const built = this._buildInspectorContent(sel.key, sel.descriptor || {});
    if (!built) { this._closeInspectorVisually(); return; }
    // Modo inspector: el panel derecho abre las opciones editables del nodo,
    // mutuamente excluyente con las secciones del rail (activeSection = null).
    this._inspecting = true;
    this._activeSection = null;
    try { localStorage.setItem('cc:panel:active', ''); } catch (_) { /* noop */ }
    if (title) title.innerHTML = built.title;
    body.innerHTML = built.body;
    panel.classList.add('cc-fp-open');
    panel.querySelectorAll('.cc-rail-btn.is-active').forEach((b) => {
      b.classList.remove('is-active'); b.setAttribute('aria-selected', 'false');
    });
  };

  P._buildInspectorContent = function (key, desc) {
    if (!key) return null;
    if (key.startsWith('aud:'))    return this._inspectorAudience(key.slice(4));
    if (key.startsWith('camp:'))   return this._inspectorCampaign(key.slice(5));
    if (key.startsWith('sticky:')) return this._inspectorSticky(key.slice(7));
    if (key.startsWith('group:'))  return this._inspectorGroup(key.slice(6));
    const colon = key.indexOf(':');
    if (colon > 0) return this._inspectorIdentity(key.slice(0, colon), key.slice(colon + 1));
    return null;
  };

  // ── Inspector: audiencia (form completo editable) ────────────────────
  P._inspectorAudience = function (id) {
    const a = (this._audiences || []).find((x) => String(x.id) === String(id));
    if (!a) return { title: '<i class="fas fa-users"></i> Audiencia', body: '<div class="cc-insp-empty">No encontrada.</div>' };
    const eid = this.escapeHtml(String(id));
    const liked = !!a.is_liked, featured = !!a.is_featured, off = a.is_active === false;
    return {
      title: `<i class="fas fa-users"></i> ${this.escapeHtml(a.name || 'Objetivo de Audiencia')}`,
      body: `
        <div class="cc-insp-form" data-field-host data-type="audience" data-id="${eid}">
          ${this._fieldText('Nombre', 'str', 'name', a.name, { placeholder: 'Nombre de la audiencia' })}
          ${this._fieldAgeRange(a.target_age_min, a.target_age_max)}
          ${this._fieldGenders(a.target_genders)}
          ${this._fieldSelect('Awareness', 'awareness_level', a.awareness_level, [
            ['', 'Sin definir'], ['unaware', 'Unaware'], ['problem_aware', 'Problem aware'],
            ['solution_aware', 'Solution aware'], ['product_aware', 'Product aware'], ['most_aware', 'Most aware'],
          ])}
          ${this._fieldArea('Descripcion', 'str', 'description', a.description, { rows: 3, placeholder: 'Quien es esta audiencia' })}
          ${this._fieldTags('Dolores', 'dolores', a.dolores)}
          ${this._fieldTags('Deseos', 'deseos', a.deseos)}
          ${this._fieldTags('Objeciones', 'objeciones', a.objeciones)}
          ${this._fieldTags('Gatillos de compra', 'gatillos_compra', a.gatillos_compra)}
          <div class="cc-insp-flags">
            <button type="button" class="cc-node-toggle cc-toggle-like ${liked ? 'is-on' : ''}" data-toggle="is_liked" title="Me gusta"><i class="fas fa-heart"></i></button>
            <button type="button" class="cc-node-toggle cc-toggle-feature ${featured ? 'is-on' : ''}" data-toggle="is_featured" title="Destacar"><i class="fas fa-star"></i></button>
            <button type="button" class="cc-node-toggle cc-toggle-power ${off ? 'is-off' : 'is-on'}" data-toggle="is_active" title="${off ? 'Encender' : 'Apagar'}"><i class="fas fa-lightbulb"></i></button>
          </div>
          <button type="button" class="cc-insp-delete" data-del-type="audience" data-del-id="${eid}"><i class="fas fa-trash"></i> Eliminar audiencia</button>
        </div>
      `,
    };
  };

  // ── Inspector: campana (real o conceptual) ───────────────────────────
  P._inspectorCampaign = function (id) {
    const row = (this._campaigns || []).find((c) => String(c.id) === String(id));
    if (!row) return { title: '<i class="fas fa-bullhorn"></i> Campana', body: '<div class="cc-insp-empty">No encontrada.</div>' };
    const isReal = !!row.last_synced_at;
    const status = row.status || '—';
    const objetivo = row.objetivo_comercial || '';
    const persona = row.persona_id ? '✓ vinculada' : 'Sin audiencia';
    if (isReal) {
      const imp  = Number(row.cached_impressions) || 0;
      const clk  = Number(row.cached_clicks) || 0;
      const conv = Number(row.cached_conversions) || 0;
      const roas = Number(row.cached_roas);
      return {
        title: `<i class="fas fa-bullhorn"></i> ${this.escapeHtml(row.nombre_campana || 'Campana')}`,
        body: `
          <div class="cc-insp-section">
            <span class="cc-insp-label">Plataforma</span>
            <span class="cc-insp-value">${this.escapeHtml(row.platform || '—')}</span>
          </div>
          <div class="cc-insp-section">
            <span class="cc-insp-label">Estado</span>
            <span class="cc-insp-value">${this.escapeHtml(status)}</span>
          </div>
          <div class="cc-insp-meta">
            <span class="cc-insp-label">Impresiones</span>
            <span class="cc-insp-value">${imp.toLocaleString()}</span>
          </div>
          <div class="cc-insp-meta">
            <span class="cc-insp-label">Clicks</span>
            <span class="cc-insp-value">${clk.toLocaleString()}</span>
          </div>
          <div class="cc-insp-meta">
            <span class="cc-insp-label">Conversiones</span>
            <span class="cc-insp-value">${conv.toLocaleString()}</span>
          </div>
          ${Number.isFinite(roas) ? `<div class="cc-insp-meta">
            <span class="cc-insp-label">ROAS</span>
            <span class="cc-insp-value">${roas.toFixed(2)}x</span>
          </div>` : ''}
          <div class="cc-insp-meta">
            <span class="cc-insp-label">Objetivo de Audiencia</span>
            <span class="cc-insp-value">${persona}</span>
          </div>
          <div class="cc-insp-hint">Lectura desde la plataforma; no editable.</div>
        `,
      };
    }
    const c = row, eid = this.escapeHtml(String(id));
    const linkedName = c.persona_id ? ((this._audiences || []).find((x) => String(x.id) === String(c.persona_id))?.name || 'Audiencia vinculada') : '';
    return {
      title: `<i class="fas fa-bullseye"></i> ${this.escapeHtml(c.nombre_campana || 'Objetivo de Campana')}`,
      body: `
        <div class="cc-insp-form" data-field-host data-type="campaign-concept" data-id="${eid}">
          ${this._fieldText('Nombre', 'str', 'nombre_campana', c.nombre_campana, { placeholder: 'Nombre de la campana' })}
          ${linkedName ? `<div class="cc-node-badges"><span class="cc-node-badge cc-node-badge--link"><i class="fas fa-link"></i> ${this.escapeHtml(linkedName)}</span></div>` : ''}
          ${this._fieldArea('Descripcion interna', 'str', 'descripcion_interna', c.descripcion_interna, { rows: 3, placeholder: 'Objetivo del concepto' })}
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
          <button type="button" class="cc-insp-delete" data-del-type="campaign-concept" data-del-id="${eid}"><i class="fas fa-trash"></i> Eliminar campana</button>
        </div>
      `,
    };
  };

  P._inspectorSticky = function (id) {
    const s = (this._stickies || []).find((x) => String(x.id) === String(id));
    if (!s) return { title: '<i class="fas fa-note-sticky"></i> Nota', body: '<div class="cc-insp-empty">No encontrada.</div>' };
    return {
      title: `<i class="fas fa-note-sticky"></i> Nota`,
      body: `
        <div class="cc-insp-section">
          <span class="cc-insp-label">Tamano (px)</span>
          <div class="cc-insp-row">
            <input class="cc-insp-input" type="number" min="80" step="10" data-insp-field="width"  data-target-type="sticky" data-target-id="${this.escapeHtml(String(id))}" value="${Number(s.width)  || 220}" />
            <span class="cc-insp-row-sep">×</span>
            <input class="cc-insp-input" type="number" min="60" step="10" data-insp-field="height" data-target-type="sticky" data-target-id="${this.escapeHtml(String(id))}" value="${Number(s.height) || 140}" />
          </div>
        </div>
        <div class="cc-insp-hint">El contenido se edita directamente sobre la nota.</div>
      `,
    };
  };

  P._inspectorGroup = function (id) {
    const g = (this._groups || []).find((x) => String(x.id) === String(id));
    if (!g) return { title: '<i class="fas fa-object-group"></i> Grupo', body: '<div class="cc-insp-empty">No encontrado.</div>' };
    const cur = g.color || 'blue';
    const colors = ['blue','green','purple','orange','red','gray'];
    const colorBtns = colors.map((c) => {
      const on = c === cur ? ' is-on' : '';
      return `<button type="button" class="cc-insp-color-btn cc-insp-color-btn--${c}${on}" data-color="${c}" data-target-id="${this.escapeHtml(String(id))}" aria-label="${c}"></button>`;
    }).join('');
    return {
      title: `<i class="fas fa-object-group"></i> ${this.escapeHtml(g.title || 'Grupo')}`,
      body: `
        <div class="cc-insp-section">
          <span class="cc-insp-label">Color</span>
          <div class="cc-insp-colors">${colorBtns}</div>
        </div>
        <div class="cc-insp-section">
          <span class="cc-insp-label">Tamano (px)</span>
          <div class="cc-insp-row">
            <input class="cc-insp-input" type="number" min="100" step="20" data-insp-field="width"  data-target-type="group" data-target-id="${this.escapeHtml(String(id))}" value="${Number(g.width)  || 400}" />
            <span class="cc-insp-row-sep">×</span>
            <input class="cc-insp-input" type="number" min="80"  step="20" data-insp-field="height" data-target-type="group" data-target-id="${this.escapeHtml(String(id))}" value="${Number(g.height) || 300}" />
          </div>
        </div>
        <div class="cc-insp-hint">El titulo se edita en la cabecera del grupo.</div>
      `,
    };
  };

  P._inspectorIdentity = function (type, id) {
    const labels = { products: 'Producto', services: 'Servicio', places: 'Lugar', characters: 'Personaje', flows: 'Flow', briefs: 'Brief' };
    const icons  = { products: 'fa-box', services: 'fa-tag', places: 'fa-map-pin', characters: 'fa-masks-theater', flows: 'fa-diagram-project', briefs: 'fa-file-lines' };
    const placed = (this._placed || []).find((p) => p.type === type && String(p.id) === String(id));
    const name = (placed && placed.name) || labels[type] || 'Identidad';
    const sub  = (placed && placed.sub)  || '';
    return {
      title: `<i class="fas ${icons[type] || 'fa-circle'}"></i> ${this.escapeHtml(name)}`,
      body: `
        <div class="cc-insp-meta">
          <span class="cc-insp-label">Tipo</span>
          <span class="cc-insp-value">${this.escapeHtml(labels[type] || type)}</span>
        </div>
        ${sub ? `<div class="cc-insp-meta">
          <span class="cc-insp-label">Detalle</span>
          <span class="cc-insp-value">${this.escapeHtml(sub)}</span>
        </div>` : ''}
        <div class="cc-insp-hint">Referencia al recurso. La ficha completa se edita en su seccion (Productos, Servicios, etc.).</div>
      `,
    };
  };

  // ── Set group color (BD + DOM class in-place + local) ────────────────
  P._setGroupColor = async function (groupId, color) {
    if (!this._supabase || !this._containerRow?.id) return;
    const colors = ['blue','green','purple','orange','red','gray'];
    if (!colors.includes(color)) return;
    const local = (this._groups || []).find((g) => String(g.id) === String(groupId));
    if (!local) return;
    const prev = local.color || 'blue';
    if (prev === color) return;
    local.color = color;
    const el = document.querySelector(`.cc-node[data-node-key="${ccCssEsc(`group:${groupId}`)}"]`);
    if (el) {
      colors.forEach((c) => el.classList.remove(`cc-group--${c}`));
      el.classList.add(`cc-group--${color}`);
    }
    document.querySelectorAll(`.cc-insp-color-btn[data-target-id="${ccCssEsc(String(groupId))}"]`).forEach((b) => {
      b.classList.toggle('is-on', b.getAttribute('data-color') === color);
    });
    try {
      const { error } = await this._supabase
        .from('canvas_groups')
        .update({ color })
        .eq('id', groupId)
        .eq('brand_container_id', this._containerRow.id);
      if (error) {
        console.warn('[CC] update group color:', error.message || error);
        local.color = prev;
        if (el) {
          el.classList.remove(`cc-group--${color}`);
          el.classList.add(`cc-group--${prev}`);
        }
      }
    } catch (e) {
      console.warn('[CC] update group color exception:', e);
    }
  };

  // ── Inspector input save (debounced) ─────────────────────────────────
  P._scheduleInspectorSave = function (targetType, targetId, field, value) {
    if (!this._supabase || !this._containerRow?.id) return;
    if (!this._ccInspSaveTimers) this._ccInspSaveTimers = {};
    const tkey = `${targetType}:${targetId}:${field}`;
    if (this._ccInspSaveTimers[tkey]) clearTimeout(this._ccInspSaveTimers[tkey]);
    this._ccInspSaveTimers[tkey] = setTimeout(async () => {
      delete this._ccInspSaveTimers[tkey];
      await this._flushInspectorSave(targetType, targetId, field, value);
    }, 800);
  };

  P._flushInspectorSave = async function (targetType, targetId, field, value) {
    let table = null, val = value;
    if (targetType === 'sticky') {
      table = 'canvas_stickies';
      if (field === 'width' || field === 'height') {
        val = Number(value);
        if (!Number.isFinite(val)) return;
        if (field === 'width'  && val < 80) val = 80;
        if (field === 'height' && val < 60) val = 60;
        const el = document.querySelector(`.cc-node[data-node-key="${ccCssEsc(`sticky:${targetId}`)}"]`);
        if (el) el.style[field] = `${val}px`;
        const local = (this._stickies || []).find((x) => String(x.id) === String(targetId));
        if (local) local[field] = val;
      }
    } else if (targetType === 'group') {
      table = 'canvas_groups';
      if (field === 'width' || field === 'height') {
        val = Number(value);
        if (!Number.isFinite(val)) return;
        if (field === 'width'  && val < 100) val = 100;
        if (field === 'height' && val < 80)  val = 80;
        const el = document.querySelector(`.cc-node[data-node-key="${ccCssEsc(`group:${targetId}`)}"]`);
        if (el) el.style[field] = `${val}px`;
        const local = (this._groups || []).find((x) => String(x.id) === String(targetId));
        if (local) local[field] = val;
      }
    } else if (targetType === 'audience') {
      table = 'audience_personas';
      const local = (this._audiences || []).find((x) => String(x.id) === String(targetId));
      if (local) local[field] = val;
    } else if (targetType === 'campaign') {
      table = 'campaigns';
      const local = (this._campaigns || []).find((x) => String(x.id) === String(targetId));
      if (local) local[field] = val;
    }
    if (!table) return;
    try {
      const payload = {};
      payload[field] = val;
      const q = this._supabase.from(table).update(payload).eq('id', targetId);
      // canvas_stickies/groups tienen brand_container_id; audience_personas/campaigns no necesitan
      // pero podemos sumar como guard defensivo (el RLS ya valida)
      const { error } = await q;
      if (error) console.warn(`[CC] update ${table}.${field}:`, error.message || error);
    } catch (e) {
      console.warn(`[CC] update ${table}.${field} exception:`, e);
    }
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

  // Sync seleccion: espejo desde _selectNode al store. F1.3: tambien
  // re-renderiza el set multi (en caso de venir de un multi-set previo
  // que el mixin no conoce, manteniendo el class en sync).
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
      this._renderSelection();
      return r;
    };
  }

  // Cleanup: liberar listeners del store + atajos de teclado + multi-select
  // capture-phase al destruir la vista.
  const _origDestroy = P.destroy;
  P.destroy = function () {
    if (this._ccKeyHandler) {
      document.removeEventListener('keydown', this._ccKeyHandler);
      this._ccKeyHandler = null;
    }
    const canvas = document.getElementById('ccCanvas');
    if (canvas && this._ccMultiClick) {
      canvas.removeEventListener('click', this._ccMultiClick, true);
      this._ccMultiClick = null;
    }
    if (canvas && this._ccMultiMouseDown) {
      canvas.removeEventListener('mousedown', this._ccMultiMouseDown, true);
      this._ccMultiMouseDown = null;
    }
    // F1.6: unsubscribe de los events del store por write-through edges
    if (Array.isArray(this._ccEdgeSubs)) {
      this._ccEdgeSubs.forEach((off) => { try { typeof off === 'function' && off(); } catch (_) {} });
      this._ccEdgeSubs = null;
    }
    this._ccRemoteHydratedFor = null;
    // F1.7: flush pendiente + unsubscribe del viewport
    if (this._ccViewWriteTimer) {
      clearTimeout(this._ccViewWriteTimer);
      this._ccViewWriteTimer = null;
      // intentar flush sincrono final si quedo algo pendiente (fire-and-forget)
      try { this._flushRemoteView(); } catch (_) {}
    }
    if (typeof this._ccViewportSub === 'function') {
      try { this._ccViewportSub(); } catch (_) {}
      this._ccViewportSub = null;
    }
    this._ccViewHydratedFor = null;
    // F1.8: limpiar timers + listeners de search sidebar
    if (this._libSearchTimer) { clearTimeout(this._libSearchTimer); this._libSearchTimer = null; }
    const panelBody = document.getElementById('ccPanelBody');
    if (panelBody && this._ccLibSearchInput) {
      panelBody.removeEventListener('input', this._ccLibSearchInput);
      this._ccLibSearchInput = null;
    }
    if (panelBody && this._ccLibSearchClear) {
      panelBody.removeEventListener('click', this._ccLibSearchClear);
      this._ccLibSearchClear = null;
    }
    // F1.9: cerrar context menu pendiente + desmontar listeners
    if (this._ccCtxOpen) { try { this._ccCtxOpen.remove(); } catch (_) {} this._ccCtxOpen = null; }
    if (canvas && this._ccCtxHandler) {
      canvas.removeEventListener('contextmenu', this._ccCtxHandler);
      this._ccCtxHandler = null;
    }
    if (this._ccCtxOutside) {
      document.removeEventListener('mousedown', this._ccCtxOutside, true);
      this._ccCtxOutside = null;
    }
    if (this._ccCtxEsc) {
      document.removeEventListener('keydown', this._ccCtxEsc, true);
      this._ccCtxEsc = null;
    }
    // F1.10: cleanup stickies — listener + timers + flush pendientes
    if (canvas && this._ccStickyInput) {
      canvas.removeEventListener('input', this._ccStickyInput);
      this._ccStickyInput = null;
    }
    if (this._ccStickyPosTimers) {
      Object.values(this._ccStickyPosTimers).forEach((t) => clearTimeout(t));
      this._ccStickyPosTimers = null;
    }
    if (this._ccStickyContentTimers) {
      Object.values(this._ccStickyContentTimers).forEach((t) => clearTimeout(t));
      this._ccStickyContentTimers = null;
    }
    if (typeof this._ccStickyPosSub === 'function') {
      try { this._ccStickyPosSub(); } catch (_) {}
      this._ccStickyPosSub = null;
    }
    this._ccStickiesHydratedFor = null;
    // F1.11: cleanup groups
    if (canvas && this._ccGroupInput) {
      canvas.removeEventListener('input', this._ccGroupInput);
      this._ccGroupInput = null;
    }
    if (this._ccGroupPosTimers) {
      Object.values(this._ccGroupPosTimers).forEach((t) => clearTimeout(t));
      this._ccGroupPosTimers = null;
    }
    if (this._ccGroupTitleTimers) {
      Object.values(this._ccGroupTitleTimers).forEach((t) => clearTimeout(t));
      this._ccGroupTitleTimers = null;
    }
    if (typeof this._ccGroupPosSub === 'function') {
      try { this._ccGroupPosSub(); } catch (_) {}
      this._ccGroupPosSub = null;
    }
    this._ccGroupsHydratedFor = null;
    // F2-prep.2: cleanup placements state
    if (this._ccPlacementPosTimers) {
      Object.values(this._ccPlacementPosTimers).forEach((t) => clearTimeout(t));
      this._ccPlacementPosTimers = null;
    }
    if (typeof this._ccPlacementPosSub === 'function') {
      try { this._ccPlacementPosSub(); } catch (_) {}
      this._ccPlacementPosSub = null;
    }
    this._ccPlacementsHydratedFor = null;
    this._canvasNodePlacements = null;
    // Sprint 1: tear down Realtime channel
    if (typeof this._tearDownRealtimeSubs === 'function') this._tearDownRealtimeSubs();
    // F2-prep.1: cleanup strategies state
    this._ccStrategiesHydratedFor = null;
    this._strategies = null;
    this._strategyId = null;
    this._strategy = null;
    // F1.12: cleanup inspector — timers + sub + remover DOM
    if (this._ccInspSaveTimers) {
      Object.values(this._ccInspSaveTimers).forEach((t) => clearTimeout(t));
      this._ccInspSaveTimers = null;
    }
    if (typeof this._ccInspectorSub === 'function') {
      try { this._ccInspectorSub(); } catch (_) {}
      this._ccInspectorSub = null;
    }
    const insp = document.getElementById('ccInspector');
    if (insp) insp.remove();
    if (this._store) {
      // dejamos el store en su sitio (la vista se descarta), pero limpiamos
      // listeners por si alguien externo se suscribio durante el ciclo.
      this._store._listeners = Object.create(null);
    }
    if (typeof _origDestroy === 'function') _origDestroy.apply(this, arguments);
  };
})();
