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

  // F1.2: wrap _beginNodeDrag. onMove mantiene update visual directo (sin
  // pasar por store por performance). onUp captura from/to y dispatchea
  // un move-node command (mergeable: drags consecutivos del mismo nodo
  // colapsan en 1 entrada de undo).
  P._beginNodeDrag = function (e, nodeEl) {
    e.preventDefault(); e.stopPropagation();
    this._ensureStore();
    this._didDrag = false;
    const key = nodeEl.getAttribute('data-node-key');
    const cur = this._positions[key];
    const base = cur
      ? { x: cur.x, y: cur.y }
      : { x: parseFloat(nodeEl.style.left) || 0, y: parseFloat(nodeEl.style.top) || 0 };
    const startMouse = { x: e.clientX, y: e.clientY };
    const s = this._canvasScale || 1;
    nodeEl.classList.add('cc-node--dragging');
    const onMove = (ev) => {
      const dx = (ev.clientX - startMouse.x) / s;
      const dy = (ev.clientY - startMouse.y) / s;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._didDrag = true;
      const nx = base.x + dx, ny = base.y + dy;
      nodeEl.style.left = `${nx}px`;
      nodeEl.style.top  = `${ny}px`;
      // mutacion in place sin emit/persist: visual durante drag
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
        // snap-to-grid 16px al soltar
        pos.x = Math.round(pos.x / 16) * 16;
        pos.y = Math.round(pos.y / 16) * 16;
        nodeEl.style.left = `${pos.x}px`;
        nodeEl.style.top  = `${pos.y}px`;
        this._scheduleEdges();
      }
      const toX = pos ? pos.x : base.x;
      const toY = pos ? pos.y : base.y;
      if (toX !== base.x || toY !== base.y) {
        // dispatch: do() re-aplica la misma posicion (no-op visual), undo() vuelve a base
        this._store.dispatch(this._commands.moveNode(key, base.x, base.y, toX, toY));
      } else {
        // sin movimiento neto: persistir lo actual igual (defensivo)
        this._store.persistPositions();
      }
      this._drawMinimap();
      setTimeout(() => { this._didDrag = false; }, 0);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // F1.2: atajos de teclado (Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z o Ctrl/Cmd+Y redo).
  // Ignora si el target es un input/textarea/contenteditable (no robar al usuario).
  P._installCanvasShortcuts = function () {
    if (this._ccKeyHandler) return;
    this._ccKeyHandler = (e) => {
      if (!this._store) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = (e.key || '').toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) { if (this._store.redo()) this._renderCanvas(); }
        else            { if (this._store.undo()) this._renderCanvas(); }
      } else if (k === 'y') {
        e.preventDefault();
        if (this._store.redo()) this._renderCanvas();
      }
    };
    document.addEventListener('keydown', this._ccKeyHandler);
  };

  // Wrap _setupCanvasListeners para instalar atajos despues del setup original.
  const _origSetupCanvasListeners = P._setupCanvasListeners;
  if (typeof _origSetupCanvasListeners === 'function') {
    P._setupCanvasListeners = function () {
      const r = _origSetupCanvasListeners.apply(this, arguments);
      this._ensureStore();
      this._installCanvasShortcuts();
      return r;
    };
  }

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

  // Cleanup: liberar listeners del store + atajos de teclado al destruir la vista.
  const _origDestroy = P.destroy;
  P.destroy = function () {
    if (this._ccKeyHandler) {
      document.removeEventListener('keydown', this._ccKeyHandler);
      this._ccKeyHandler = null;
    }
    if (this._store) {
      // dejamos el store en su sitio (la vista se descarta), pero limpiamos
      // listeners por si alguien externo se suscribio durante el ciclo.
      this._store._listeners = Object.create(null);
    }
    if (typeof _origDestroy === 'function') _origDestroy.apply(this, arguments);
  };
})();
