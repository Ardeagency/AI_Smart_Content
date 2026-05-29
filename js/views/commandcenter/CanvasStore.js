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
      // re-scope cambia de marca → la hidratacion remota debe correr de nuevo
      this._ccRemoteHydratedFor = null;
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
      } else {
        const colon = key.indexOf(':');
        if (colon > 0) {
          const t = key.slice(0, colon);
          const id = key.slice(colon + 1);
          canvasItems.push({ type: 'identity', identityType: t, id, key });
        }
      }
    });

    // Confirmar SOLO si hay BD destructivo
    if (bdItems.length) {
      const audCount  = bdItems.filter((x) => x.type === 'audience').length;
      const campCount = bdItems.filter((x) => x.type === 'campaign-concept').length;
      const parts = [];
      if (audCount)  parts.push(`${audCount} audiencia${audCount > 1 ? 's' : ''}`);
      if (campCount) parts.push(`${campCount} campana${campCount > 1 ? 's' : ''} conceptual${campCount > 1 ? 'es' : ''}`);
      const bdSummary = parts.join(' y ') + ' permanentemente';
      const canvasSummary = canvasItems.length
        ? ` y quitar ${canvasItems.length} nodo${canvasItems.length > 1 ? 's' : ''} mas del lienzo`
        : '';
      const msg = `Vas a eliminar ${bdSummary}${canvasSummary}. ¿Continuar?`;
      if (!window.confirm(msg)) return;
    }

    // Canvas-only primero (sincrono / instant)
    canvasItems.forEach((item) => {
      try {
        if (item.type === 'identity') this._removeIdentityFromCanvas(item.identityType, item.id);
        else if (item.type === 'campaign-real') this._removeRealFromCanvas(item.id);
      } catch (e) { console.error('[CC] canvas remove error:', e); }
    });

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
      // F1.6: fire-and-forget hidratacion remota. Si la marca ya se hidrato
      // antes en esta misma vista, _hydrateRemoteEdges se sale solo.
      this._hydrateRemoteEdges();
      return r;
    };
  }

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
    const brandId = this._containerRow?.id;
    const orgId = this._organizationId;
    if (!this._supabase || !brandId || !orgId) return;
    if (this._ccRemoteHydratedFor === brandId) return; // idempotente por marca
    this._ccRemoteHydratedFor = brandId;
    try {
      const { data: rows, error } = await this._supabase
        .from('canvas_edges')
        .select('source_type, source_id, target_type, target_id')
        .eq('brand_container_id', brandId)
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
    if (!this._supabase || !this._containerRow?.id || !this._organizationId) return;
    const f = ccParseKey(fromKey), t = ccParseKey(toKey);
    if (!f || !t) return;
    try {
      const { error } = await this._supabase.from('canvas_edges').insert({
        organization_id: this._organizationId,
        brand_container_id: this._containerRow.id,
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
    if (!this._supabase || !this._containerRow?.id) return;
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
        .eq('brand_container_id', this._containerRow.id)
        .eq('edge_kind', 'free')
        .or(filter);
      if (error) {
        console.warn('[CC] delete canvas_edge:', error.message || error);
      }
    } catch (e) {
      console.warn('[CC] delete canvas_edge exception:', e);
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
    if (this._store) {
      // dejamos el store en su sitio (la vista se descarta), pero limpiamos
      // listeners por si alguien externo se suscribio durante el ciclo.
      this._store._listeners = Object.create(null);
    }
    if (typeof _origDestroy === 'function') _origDestroy.apply(this, arguments);
  };
})();
