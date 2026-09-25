/**
 * VeraView · Adjuntar de biblioteca y omnibox «@».
 * L7 fase B (24/09): métodos movidos TAL CUAL desde js/views/VeraView.js a un mixin
 * sobre el prototipo. Usan los helpers de js/views/vera/graficos.js (scripts clásicos:
 * mismo ámbito global). Se carga DESPUÉS de VeraView.js (ver app.js · veraLoader).
 */
(function () {
  'use strict';
  if (typeof window.VeraView !== 'function') return;

  Object.assign(window.VeraView.prototype, {
    /* ── Adjuntar de biblioteca ──────────────────────────────
       Permite adjuntar productos, campañas, audiencias y marcas de la
       plataforma como contexto para Vera. Se anexan como referencias compactas
       (tipo + nombre + id) al mensaje; Vera las lee y puede profundizar con sus
       herramientas. En el chat se muestran como chips, no como texto crudo. */

    // Tipos adjuntables. kind === key. Cada uno define label, icono y un loader
    // que devuelve [{id, name, meta}].
    _libTypeDef(kind) {
      const orgId = this.aiState.organization_id;
      // Corte ADR-0052: los datos del picker salen de VeraDatos.universo (elements_full,
      // flows.vista_org); las etiquetas e iconos siguen abajo. Lo que aún no existe en la
      // base nueva (campañas, audiencias, estrategias, briefs, producciones) devuelve [].
      if (window.VeraDatos) {
        const etiquetas = { product: [__('Producto'), 'aisc-ico aisc-ico--product'], service: [__('Servicio'), 'aisc-ico aisc-ico--service'], place: [__('Escenario'), 'aisc-ico aisc-ico--place'], character: [__('Personaje'), 'aisc-ico aisc-ico--character'], flow: [__('Flujo'), 'aisc-ico aisc-ico--flow'], campaign: [__('Campaña'), 'aisc-ico aisc-ico--megaphone'], campaign_objective: [__('Objetivo de campaña'), 'aisc-ico aisc-ico--target'], audience_objective: [__('Audiencia'), 'aisc-ico aisc-ico--users'], brief: [__('Brief'), 'aisc-ico aisc-ico--document'], strategy: [__('Estrategia'), 'aisc-ico aisc-ico--growth'], production: [__('Producción'), 'aisc-ico aisc-ico--image'], brand: [__('Marca'), 'aisc-ico aisc-ico--brand'] };
        const [label, icon] = etiquetas[kind] || [kind, 'aisc-ico aisc-ico--document'];
        return { label, icon, load: async () => { const u = await window.VeraDatos.universo(orgId); return u[kind] || []; } };
      }
      return null;
    },

    _libKindLabel(kind) {
      const d = this._libTypeDef(kind);
      return d ? d.label : 'Dato';
    },
    _libKindIcon(kind) {
      const d = this._libTypeDef(kind);
      return d?.icon || 'aisc-ico aisc-ico--layers';
    },

    /* Todos los tipos adjuntables, en el orden en que se ofrecen. Una sola lista:
       el menú `+`, el omnibox `@` y el parseo de los chips leen de aquí, así que
       añadir un tipo es tocar `_libTypeDef` y esta constante, y nada más. */
    _libKinds() {
      return ['product', 'service', 'strategy', 'production', 'flow', 'campaign',
        'campaign_objective', 'audience_objective', 'brief', 'place', 'character'];
    },

    /* ── Omnibox `@` ───────────────────────────────────────────────────────────
       Escribes `@wake` y sale lo que coincide, de TODOS los tipos a la vez, sin
       salir del composer. El menú `+` sigue existiendo para quien prefiera
       navegar por tipo, pero obligaba a saber la categoría antes que el nombre:
       uno piensa "WAKEUP Refresh", no "eso es un producto".
       Es una capa de búsqueda sobre los mismos `load()` del picker — no hay una
       segunda fuente de datos que se pueda desincronizar. */

    // Normaliza para buscar sin tildes ni mayúsculas ("cafe" encuentra "Café").
    _normalizar(s) {
      return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    },

    /* Ordena por qué tan bien casa: primero lo que EMPIEZA por lo escrito, luego
       lo que empieza una palabra, y al final lo que solo lo contiene. Con
       "wake" el producto "WAKEUP" tiene que salir antes que "Campaña de wake". */
    _puntuarCoincidencia(nombre, q) {
      const n = this._normalizar(nombre);
      const idx = n.indexOf(q);
      if (idx < 0) return -1;
      if (idx === 0) return 0;
      return / /.test(n.charAt(idx - 1)) ? 1 : 2;
    },

    _filtrarCandidatos(items, query, tope = 8) {
      const q = this._normalizar(query).trim();
      const con = items
        .map((it) => ({ it, p: q ? this._puntuarCoincidencia(it.name, q) : 0 }))
        .filter((x) => x.p >= 0);
      con.sort((a, b) => (a.p - b.p) || String(a.it.name).localeCompare(String(b.it.name)));
      return con.slice(0, tope).map((x) => x.it);
    },

    /* Lee el `@…` que el cursor está escribiendo. Solo cuenta si la arroba abre
       palabra (para no capturar correos) y si lo tecleado no trae espacios. */
    _tokenArroba(valor, cursor) {
      const antes = String(valor || '').slice(0, cursor);
      const at = antes.lastIndexOf('@');
      if (at < 0) return null;
      const previo = at > 0 ? antes.charAt(at - 1) : ' ';
      if (!/[\s(]/.test(previo)) return null;
      const query = antes.slice(at + 1);
      if (/[\s\n]/.test(query)) return null;
      return { desde: at, hasta: cursor, query };
    },

    /* Carga (y cachea 5 min) todos los tipos, aplanados con su kind. La caducidad
       importa: si creas un producto en otra pestaña y vuelves, el buscador tiene
       que encontrarlo sin recargar la página. */
    async _cargarUniverso() {
      const VIGENCIA_MS = 5 * 60 * 1000;
      if (this._universo && (Date.now() - (this._universoAt || 0)) < VIGENCIA_MS) return this._universo;
      this._universoAt = Date.now();
      // Corte: el universo (@menciones) sale de VeraDatos.universo (elements_full + flows.vista_org).
      if (window.VeraDatos) {
        try {
          const u = await window.VeraDatos.universo(this.aiState.organization_id);
          this._universo = Object.entries(u).flatMap(([kind, items]) => (items || []).map((it) => ({ ...it, kind })));
          return this._universo;
        } catch (err) { console.warn('[VeraView] omnibox:', err?.message || err); this._universo = []; return this._universo; }
      }
      const kinds = this._libKinds();
      const cargas = await Promise.all(kinds.map(async (kind) => {
        try {
          const def = this._libTypeDef(kind);
          const items = def ? await def.load() : [];
          return (items || []).map((it) => ({ ...it, kind }));
        } catch (err) {
          // Un tipo que falla no puede dejar mudo al buscador entero.
          console.warn(`[VeraView] omnibox: no se pudo cargar "${kind}":`, err?.message || err);
          return [];
        }
      }));
      this._universo = cargas.flat();
      return this._universo;
    },

    _cerrarOmnibox() {
      document.getElementById('veraOmnibox')?.remove();
      this._omni = null;
    },

    _pintarOmnibox(items, token) {
      const wrap = document.getElementById('veraInputWrap') || document.getElementById('chatcontainer');
      if (!wrap) return;
      if (!items.length) { this._cerrarOmnibox(); return; }

      this._omni = { items, token, activo: 0 };
      let box = document.getElementById('veraOmnibox');
      if (!box) {
        box = document.createElement('div');
        box.id = 'veraOmnibox';
        box.className = 'vera-omnibox';
        box.setAttribute('role', 'listbox');
        wrap.appendChild(box);
        // El ratón elige lo mismo que el teclado.
        box.addEventListener('mousedown', (e) => {
          e.preventDefault(); // no robar el foco del composer
          const fila = e.target.closest?.('[data-omni-idx]');
          if (fila) this._elegirDelOmnibox(Number(fila.getAttribute('data-omni-idx')));
        });
      }
      window.Estado.pintar(box, items.map((it, i) => `
        <div class="vera-omni-item${i === 0 ? ' is-active' : ''}" data-omni-idx="${i}" role="option" aria-selected="${i === 0}">
          <i class="aisc-ico ${escapeHtml((this._libKindIcon(it.kind) || '').replace('aisc-ico ', ''))}"></i>
          <span class="vera-omni-name">${escapeHtml(it.name)}</span>
          <span class="vera-omni-kind">${escapeHtml(this._libKindLabel(it.kind))}${it.meta ? ` · ${escapeHtml(it.meta)}` : ''}</span>
        </div>`).join(''));
    },

    _moverOmnibox(paso) {
      if (!this._omni) return;
      const n = this._omni.items.length;
      this._omni.activo = (this._omni.activo + paso + n) % n;
      document.querySelectorAll('#veraOmnibox .vera-omni-item').forEach((el, i) => {
        const on = i === this._omni.activo;
        el.classList.toggle('is-active', on);
        el.setAttribute('aria-selected', String(on));
        if (on) el.scrollIntoView({ block: 'nearest' });
      });
    },

    /* Adjunta lo elegido y BORRA el `@…` del texto: el adjunto ya se ve como chip,
       dejarlo además escrito lo contaría dos veces. */
    _elegirDelOmnibox(idx) {
      const st = this._omni;
      const input = document.getElementById('veraInput');
      if (!st || !input) return;
      const it = st.items[Number.isInteger(idx) ? idx : st.activo];
      if (!it) return;

      const valor = input.value || '';
      input.value = valor.slice(0, st.token.desde) + valor.slice(st.token.hasta);
      const pos = st.token.desde;
      this._cerrarOmnibox();

      const yaEstan = this.aiState.pendingAttachments
        .filter((a) => a.type === 'library' && a.kind === it.kind)
        .map((a) => ({ id: a.refId, name: a.name }));
      if (!yaEstan.some((x) => x.id === it.id)) yaEstan.push({ id: it.id, name: it.name });
      this._setLibraryAttachmentsForType(it.kind, yaEstan);

      input.focus();
      try { input.setSelectionRange(pos, pos); } catch (_) { /* navegador viejo */ }
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },

    /* Llamado en cada tecleo del composer. Sin `@` en curso, no hace nada. */
    async _refrescarOmnibox() {
      const input = document.getElementById('veraInput');
      if (!input || !this.aiState.organization_id || !this.supabase) return this._cerrarOmnibox();
      const token = this._tokenArroba(input.value, input.selectionStart ?? (input.value || '').length);
      if (!token) return this._cerrarOmnibox();

      // Cada tecla invalida la búsqueda anterior: si dos cargas se cruzan, solo
      // se pinta la del texto que sigue escrito.
      const sello = (this._omniSello = (this._omniSello || 0) + 1);
      const universo = await this._cargarUniverso();
      if (sello !== this._omniSello) return;
      const actual = this._tokenArroba(input.value, input.selectionStart ?? (input.value || '').length);
      if (!actual) return this._cerrarOmnibox();

      this._pintarOmnibox(this._filtrarCandidatos(universo, actual.query), actual);
    },

    // Picker de UN tipo (Producto, Campaña, etc.). La selección se acumula con la
    // de otros tipos ya adjuntados; al confirmar solo se reemplazan los de ESTE tipo.
    _openLibraryPicker(typeKey) {
      if (document.getElementById('veraLibModal')) return;
      if (!this.supabase || !this.aiState.organization_id) return;
      const def = this._libTypeDef(typeKey);
      if (!def) return;

      this._libCache = this._libCache || {};
      const selected = new Map(); // id -> {kind, id, name}
      this.aiState.pendingAttachments
        .filter((a) => a.type === 'library' && a.kind === typeKey)
        .forEach((a) => selected.set(a.refId, { kind: typeKey, id: a.refId, name: a.name }));

      const overlay = document.createElement('div');
      overlay.id = 'veraLibModal';
      overlay.className = 'vera-lib-modal';
      window.Estado.pintar(overlay, `
        <div class="vera-lib-scrim" data-lib-close></div>
        <div class="vera-lib-panel" role="dialog" aria-label="${__('Adjuntar {tipo}', { tipo: escapeHtml(def.label) })}">
          <div class="vera-lib-head">
            <span class="vera-lib-title"><i class="fas ${def.icon}"></i> ${__('Adjuntar {tipo}', { tipo: escapeHtml(def.label) })}</span>
            <button class="vera-lib-x" data-lib-close aria-label="${__('Cerrar')}"><i class="aisc-ico aisc-ico--close"></i></button>
          </div>
          <input type="text" class="vera-lib-search" id="veraLibSearch" placeholder="${__('Buscar…')}" />
          <div class="vera-lib-list" id="veraLibList"></div>
          <div class="vera-lib-foot">
            <span class="vera-lib-count" id="veraLibCount">${__('0 seleccionados')}</span>
            <div class="vera-lib-foot-actions">
              <button class="vera-lib-cancel" data-lib-close>${__('Cancelar')}</button>
              <button class="vera-lib-confirm" id="veraLibConfirm">${__('Adjuntar')}</button>
            </div>
          </div>
        </div>`);
      document.body.appendChild(overlay);

      const listEl = overlay.querySelector('#veraLibList');
      const searchEl = overlay.querySelector('#veraLibSearch');
      const countEl = overlay.querySelector('#veraLibCount');
      const confirmBtn = overlay.querySelector('#veraLibConfirm');

      const updateFoot = () => {
        countEl.textContent = __('{n} seleccionado(s)', { n: selected.size });
      };

      const renderList = (items) => {
        const q = (searchEl.value || '').trim().toLowerCase();
        const filtered = q ? items.filter((it) => it.name.toLowerCase().includes(q)) : items;
        if (!filtered.length) {
          window.Estado.pintar(listEl, `<div class="vera-lib-empty">${items.length ? __('Sin resultados.') : __('No hay {tipo}s disponibles.', { tipo: def.label.toLowerCase() })}</div>`);
          return;
        }
        window.Estado.pintar(listEl, filtered.map((it) => `
          <label class="vera-lib-item">
            <input type="checkbox" data-lib-id="${escapeHtml(it.id)}"${selected.has(it.id) ? ' checked' : ''} />
            <span class="vera-lib-item-body">
              <span class="vera-lib-item-name">${escapeHtml(it.name)}</span>
              ${it.meta ? `<span class="vera-lib-item-meta">${escapeHtml(it.meta)}</span>` : ''}
            </span>
          </label>`).join(''));
      };

      const load = async () => {
        if (!this._libCache[typeKey]) {
          window.Estado.pintar(listEl, `<div class="vera-lib-loading"><i class="aisc-ico fa-spin aisc-ico--loader"></i> ${__('Cargando…')}</div>`);
          try { this._libCache[typeKey] = await def.load(); }
          catch (_) { this._libCache[typeKey] = []; }
        }
        renderList(this._libCache[typeKey]);
      };

      overlay.addEventListener('click', (e) => {
        if (e.target.closest('[data-lib-close]')) overlay.remove();
      });
      listEl.addEventListener('change', (e) => {
        const cb = e.target.closest('input[data-lib-id]');
        if (!cb) return;
        const id = cb.getAttribute('data-lib-id');
        const it = (this._libCache[typeKey] || []).find((x) => x.id === id);
        if (!it) return;
        if (cb.checked) selected.set(id, { kind: typeKey, id, name: it.name });
        else selected.delete(id);
        updateFoot();
      });
      searchEl.addEventListener('input', () => renderList(this._libCache[typeKey] || []));
      confirmBtn.addEventListener('click', () => {
        this._setLibraryAttachmentsForType(typeKey, Array.from(selected.values()));
        overlay.remove();
      });
      overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.remove(); });

      updateFoot();
      load();
      setTimeout(() => searchEl.focus(), 50);
    },

    // Reemplaza los adjuntos de biblioteca de UN tipo por la selección dada,
    // conservando los de otros tipos.
    _setLibraryAttachmentsForType(typeKey, items) {
      const keepIds = new Set(items.map((i) => i.id));
      this.aiState.pendingAttachments = this.aiState.pendingAttachments.filter(
        (a) => a.type !== 'library' || a.kind !== typeKey || keepIds.has(a.refId)
      );
      const existing = new Set(
        this.aiState.pendingAttachments.filter((a) => a.type === 'library' && a.kind === typeKey).map((a) => a.refId)
      );
      items.forEach((i) => {
        if (existing.has(i.id)) return;
        this.aiState.pendingAttachments.push({
          id: `lib-${typeKey}-${i.id}`, type: 'library', kind: typeKey,
          refId: i.id, name: i.name, status: 'ready'
        });
      });
      this._renderAttachChips();
      this._syncSendBtn?.();
      const input = document.getElementById('veraInput');
      if (input) requestAnimationFrame(() => input.focus());
    },

    // Bloque de contexto que se ANEXA al mensaje enviado a Vera (no al display).
    _buildLibraryContext(libItems) {
      if (!libItems || !libItems.length) return '';
      const lines = libItems.map((a) => {
        const name = String(a.name || '').replace(/[|\n\r]/g, ' ').trim();
        return `- ${this._libKindLabel(a.kind)} | ${name} | ${a.refId}`;
      });
      return `\n\n<<DATOS_BIBLIOTECA>>\n${lines.join('\n')}\n<</DATOS_BIBLIOTECA>>\nEl usuario adjuntó estos elementos de la biblioteca de la plataforma como foco; úsalos y, si necesitas más detalle, amplíalos con tus herramientas.`;
    },

    // Separa el bloque <<DATOS_BIBLIOTECA>> del texto visible y lo parsea a chips.
    _parseLibraryContext(content) {
      const raw = String(content || '');
      const m = raw.match(/<<DATOS_BIBLIOTECA>>\n([\s\S]*?)\n<<\/DATOS_BIBLIOTECA>>/);
      if (!m) return { text: raw, refs: [] };
      // Se deriva de los tipos reales: una segunda lista escrita a mano se queda
      // vieja en cuanto se añade un tipo, y el chip sale como "Dato" genérico.
      const labelToKind = {};
      this._libKinds().forEach((k) => { labelToKind[this._libKindLabel(k)] = k; });
      const refs = m[1].split('\n').map((line) => {
        const p = line.replace(/^-\s*/, '').split('|').map((s) => s.trim());
        return { kind: labelToKind[p[0]] || 'data', name: p[1] || '', id: p[2] || '' };
      }).filter((r) => r.name);
      const text = raw.replace(/\n*<<DATOS_BIBLIOTECA>>[\s\S]*$/, '').trim();
      return { text, refs };
    },

    _renderLibraryRefs(refs) {
      const list = Array.isArray(refs) ? refs : [];
      if (!list.length) return '';
      const items = list.map((r) => `
        <span class="gpt-msg-att gpt-msg-att--lib" title="${escapeHtml(this._libKindLabel(r.kind))}">
          <i class="fas ${this._libKindIcon(r.kind)}"></i>
          <span>${escapeHtml(r.name)}</span>
        </span>`).join('');
      return `<div class="gpt-msg-attachments gpt-msg-attachments--lib">${items}</div>`;
    },
  });
})();
