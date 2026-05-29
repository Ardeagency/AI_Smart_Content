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

  // _relayout reasignaba this._positions = {}; ahora vacia in place via store.
  P._relayout = function () {
    this._ensureStore();
    this._store.clearPositions();
    this._store.setViewport({ x: 0, y: 0, scale: 1 });
    this._canvasPan = { x: 0, y: 0 };
    this._canvasScale = 1;
    this._renderCanvas();
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
        // F1.6: fire-and-forget hidratacion remota. Si la marca ya se hidrato
        // antes en esta misma vista, _hydrateRemoteEdges se sale solo.
        this._hydrateRemoteEdges();
        // F1.7: hidrata viewport per-usuario despues del setup. Tambien idempotente.
        this._hydrateRemoteView();
        // F1.10: hidrata stickies + escucha edits en textareas
        this._hydrateRemoteStickies();
        // F1.11: hidrata groups + escucha edits del title input
        this._hydrateRemoteGroups();
      });
      // F1.8: search en sidebar (input+clear listeners en ccPanelBody)
      this._installLibSearch();
      // F1.9: context menu (right-click) sobre canvas
      this._installCanvasContextMenu();
      // F1.10: listener de texto en stickies (delegado, no depende de strategy)
      this._installStickyContentListener();
      // F1.11: listener de title de group (delegado, no depende de strategy)
      this._installGroupTitleListener();
      // F1.12 eliminado por decision del usuario (2026-05-29) — sidebar
      // derecho del inspector retirado del UX. Codigo de _installInspector
      // / _renderInspector queda dormido (no se invoca).
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

    const NS = 'http://www.w3.org/2000/svg';
    idsToRender.forEach((campId) => {
      const data = this._adData[String(campId)];
      if (!data || !Array.isArray(data.adsets) || data.adsets.length === 0) return;
      const parentKey = `camp:${campId}`;
      const pos = this._positions[parentKey];
      if (!pos) return;
      const PARENT_W = 280;
      const PARENT_H = 140;
      const ADSET_W = 220, ADSET_H = 56, ADSET_GAP = 28;
      const AD_W    = 220, AD_H    = 200, AD_GAP    = 24; // card preview vertical
      const ROW1_Y  = pos.y + PARENT_H + 60;
      const ROW2_Y  = ROW1_Y + ADSET_H + 60;

      const adsets = data.adsets.slice(0, 6);
      const totalAdsetsW = adsets.length * ADSET_W + (adsets.length - 1) * ADSET_GAP;
      const adsetsStartX = pos.x + PARENT_W / 2 - totalAdsetsW / 2;
      const parentBottomX = pos.x + PARENT_W / 2;
      const parentBottomY = pos.y + PARENT_H;

      adsets.forEach((aset, i) => {
        const aX = adsetsStartX + i * (ADSET_W + ADSET_GAP);
        const aY = ROW1_Y;
        const aCenterX = aX + ADSET_W / 2;

        // Satelite Conjunto de anuncios
        const div = document.createElement('div');
        div.className = 'cc-satellite cc-satellite--adset';
        div.setAttribute('data-satellite-parent', String(campId));
        div.setAttribute('data-satellite-type', 'adset');
        div.setAttribute('data-satellite-id', String(aset.id));
        div.style.left = `${aX}px`;
        div.style.top  = `${aY}px`;
        div.style.width  = `${ADSET_W}px`;
        div.style.height = `${ADSET_H}px`;
        const asetName = (aset.name && String(aset.name).trim()) || '';
        const asetTitle = asetName || `${fmt(aset.impr)} impresiones`;
        div.innerHTML = `
          <span class="cc-satellite-icon"><i class="fas fa-layer-group"></i></span>
          <div class="cc-satellite-text">
            <span class="cc-satellite-type">Conjunto de anuncios</span>
            <span class="cc-satellite-name" title="${this.escapeHtml(asetTitle)}">${this.escapeHtml(asetTitle)}</span>
            <span class="cc-satellite-sub">${fmt(aset.impr)} impr · ${fmt(aset.conv)} conv</span>
          </div>`;
        world.appendChild(div);

        // Edge padre → conjunto
        const path1 = document.createElementNS(NS, 'path');
        path1.setAttribute('class', 'cc-satellite-edge');
        const dy = aY - parentBottomY;
        const cy1 = parentBottomY + dy * 0.45;
        const cy2 = aY - dy * 0.45;
        path1.setAttribute('d', `M ${parentBottomX} ${parentBottomY} C ${parentBottomX} ${cy1}, ${aCenterX} ${cy2}, ${aCenterX} ${aY}`);
        svg.appendChild(path1);

        // Anuncios del conjunto (tope 3 cards preview por conjunto)
        const ads = Array.isArray(aset.ads) ? aset.ads.slice(0, 3) : [];
        if (!ads.length) return;
        const totalAdsW = ads.length * AD_W + (ads.length - 1) * AD_GAP;
        const adsStartX = aCenterX - totalAdsW / 2;
        const adsetBottomX = aCenterX;
        const adsetBottomY = aY + ADSET_H;
        ads.forEach((ad, j) => {
          const adX = adsStartX + j * (AD_W + AD_GAP);
          const adY = ROW2_Y;
          const adCenterX = adX + AD_W / 2;
          const adv = document.createElement('div');
          adv.className = 'cc-satellite cc-satellite--ad';
          adv.setAttribute('data-satellite-parent', String(campId));
          adv.setAttribute('data-satellite-type', 'ad');
          adv.setAttribute('data-satellite-id', String(ad.id));
          adv.style.left = `${adX}px`;
          adv.style.top  = `${adY}px`;
          adv.style.width  = `${AD_W}px`;
          adv.style.height = `${AD_H}px`;
          // Texto del anuncio: title (headline) || body || generated_copy
          const headline = ad.title || ad.body || ad.copy || '';
          const adName = (ad.name && String(ad.name).trim()) || 'Sin nombre';
          adv.innerHTML = `
            <div class="cc-satellite-thumb"><i class="fas fa-image"></i></div>
            <div class="cc-satellite-body">
              <span class="cc-satellite-type">Anuncio</span>
              <span class="cc-satellite-name" title="${this.escapeHtml(adName)}">${this.escapeHtml(adName)}</span>
              ${headline ? `<span class="cc-satellite-headline">${this.escapeHtml(headline)}</span>` : ''}
              <span class="cc-satellite-cta"><i class="fas fa-arrow-up-right-from-square"></i>&nbsp;Mas info</span>
              <span class="cc-satellite-sub" style="margin-top:2px;">${fmt(ad.impr)} impr</span>
            </div>`;
          world.appendChild(adv);

          // Edge conjunto → anuncio
          const path2 = document.createElementNS(NS, 'path');
          path2.setAttribute('class', 'cc-satellite-edge');
          const ddy = adY - adsetBottomY;
          const ccy1 = adsetBottomY + ddy * 0.45;
          const ccy2 = adY - ddy * 0.45;
          path2.setAttribute('d', `M ${adsetBottomX} ${adsetBottomY} C ${adsetBottomX} ${ccy1}, ${adCenterX} ${ccy2}, ${adCenterX} ${adY}`);
          svg.appendChild(path2);
        });
      });
    });
  };

  // Wrap _renderCanvas para tambien renderear satelites despues del paint
  const _f12RenderCanvas = P._renderCanvas;
  if (typeof _f12RenderCanvas === 'function') {
    P._renderCanvas = function () {
      const r = _f12RenderCanvas.apply(this, arguments);
      this._renderCampaignSatellites();
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
      return r;
    };
  }

  // Wrap _renderEdges: tras un re-render completo de edges, tambien los satelites
  const _f12RenderEdges = P._renderEdges;
  if (typeof _f12RenderEdges === 'function') {
    P._renderEdges = function () {
      const r = _f12RenderEdges.apply(this, arguments);
      this._renderCampaignSatellites();
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
    this._stickies = null;
    this._groups = null;
    // Re-hydrate
    await this._hydrateRemoteEdges();
    await this._hydrateRemoteView();
    await this._hydrateRemoteStickies();
    await this._hydrateRemoteGroups();
    this._renderCanvas();
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
        from: `${r.source_type}:${r.source_id}`,
        to:   `${r.target_type}:${r.target_id}`,
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

  P._installInspector = function () {
    if (document.getElementById('ccInspector')) return;
    const aside = document.createElement('aside');
    aside.id = 'ccInspector';
    aside.className = 'cc-inspector';
    aside.setAttribute('role', 'complementary');
    aside.setAttribute('aria-hidden', 'true');
    aside.innerHTML = `
      <header class="cc-inspector-head">
        <span class="cc-inspector-title">Inspector</span>
        <button type="button" class="cc-inspector-close" aria-label="Cerrar inspector"><i class="fas fa-times"></i></button>
      </header>
      <div class="cc-inspector-body"></div>
    `;
    document.body.appendChild(aside);

    // X: limpia seleccion (que ya cierra el inspector via emit)
    aside.querySelector('.cc-inspector-close').addEventListener('click', () => {
      this._ensureStore();
      this._store.clearSelection();
      this._selectedKey = null; this._selected = null;
      this._renderSelection();
      if (this._focusSet) this._clearFocus();
      this._renderInspector();
    });

    // Delegacion: clicks color + inputs size/text
    aside.addEventListener('click', (e) => {
      const colorBtn = e.target.closest('.cc-insp-color-btn[data-color]');
      if (colorBtn) {
        const color = colorBtn.getAttribute('data-color');
        const gid = colorBtn.getAttribute('data-target-id');
        if (gid && color) this._setGroupColor(gid, color);
      }
    });
    aside.addEventListener('input', (e) => {
      const inp = e.target.closest('.cc-insp-input[data-insp-field]');
      if (!inp) return;
      const field = inp.getAttribute('data-insp-field');
      const tType = inp.getAttribute('data-target-type');
      const tId   = inp.getAttribute('data-target-id');
      if (!field || !tType || !tId) return;
      this._scheduleInspectorSave(tType, tId, field, inp.value);
    });
  };

  P._closeInspectorVisually = function () {
    const aside = document.getElementById('ccInspector');
    if (!aside) return;
    aside.classList.remove('is-open');
    aside.setAttribute('aria-hidden', 'true');
  };

  /** Lee store.selection y decide open + contenido. */
  P._renderInspector = function () {
    const aside = document.getElementById('ccInspector');
    if (!aside) return;
    this._ensureStore();
    const set = this._store.selectionSet;
    const sel = this._store.selection;
    if (!sel || set.size !== 1) { this._closeInspectorVisually(); return; }
    const titleEl = aside.querySelector('.cc-inspector-title');
    const bodyEl  = aside.querySelector('.cc-inspector-body');
    const built = this._buildInspectorContent(sel.key, sel.descriptor || {});
    if (!built) { this._closeInspectorVisually(); return; }
    if (titleEl) titleEl.innerHTML = built.title;
    if (bodyEl)  bodyEl.innerHTML  = built.body;
    aside.classList.add('is-open');
    aside.setAttribute('aria-hidden', 'false');
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

  // ── Inspector: audiencia ─────────────────────────────────────────────
  P._inspectorAudience = function (id) {
    const row = (this._audiences || []).find((a) => String(a.id) === String(id));
    if (!row) return { title: '<i class="fas fa-users"></i> Audiencia', body: '<div class="cc-insp-empty">No encontrada.</div>' };
    const align = Number.isFinite(Number(row.alignment_score))
      ? `${(Number(row.alignment_score) * 100).toFixed(0)}%`
      : '—';
    const awareness = row.awareness_level || '—';
    const flags = [];
    if (row.is_liked) flags.push('Me gusta');
    if (row.is_featured) flags.push('Destacada');
    if (row.is_active === false) flags.push('Apagada');
    return {
      title: `<i class="fas fa-users"></i> ${this.escapeHtml(row.name || 'Objetivo de Audiencia')}`,
      body: `
        <div class="cc-insp-section">
          <span class="cc-insp-label">Descripcion</span>
          <textarea class="cc-insp-input" rows="3" data-insp-field="description" data-target-type="audience" data-target-id="${this.escapeHtml(String(id))}" placeholder="Sin descripcion">${this.escapeHtml(row.description || '')}</textarea>
        </div>
        <div class="cc-insp-section">
          <span class="cc-insp-label">Nivel de conciencia</span>
          <span class="cc-insp-value">${this.escapeHtml(awareness)}</span>
        </div>
        <div class="cc-insp-meta">
          <span class="cc-insp-label">Alineamiento</span>
          <span class="cc-insp-value">${align}</span>
        </div>
        <div class="cc-insp-meta">
          <span class="cc-insp-label">Flags</span>
          <span class="cc-insp-value">${flags.length ? flags.map((f) => this.escapeHtml(f)).join(' · ') : '—'}</span>
        </div>
        <div class="cc-insp-hint">Mas campos editables inline en el nodo.</div>
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
    return {
      title: `<i class="fas fa-lightbulb"></i> ${this.escapeHtml(row.nombre_campana || 'Objetivo de Campana')}`,
      body: `
        <div class="cc-insp-section">
          <span class="cc-insp-label">Objetivo comercial</span>
          <textarea class="cc-insp-input" rows="3" data-insp-field="objetivo_comercial" data-target-type="campaign" data-target-id="${this.escapeHtml(String(id))}" placeholder="Define el objetivo...">${this.escapeHtml(objetivo)}</textarea>
        </div>
        <div class="cc-insp-section">
          <span class="cc-insp-label">Estado</span>
          <span class="cc-insp-value">${this.escapeHtml(status)}</span>
        </div>
        <div class="cc-insp-meta">
          <span class="cc-insp-label">Audiencia</span>
          <span class="cc-insp-value">${persona}</span>
        </div>
        <div class="cc-insp-hint">Mas campos editables inline en el nodo.</div>
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
    const labels = { products: 'Producto', services: 'Servicio', places: 'Lugar', flows: 'Flow', briefs: 'Brief' };
    const icons  = { products: 'fa-box', services: 'fa-tag', places: 'fa-map-pin', flows: 'fa-diagram-project', briefs: 'fa-file-lines' };
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
