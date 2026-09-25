/**
 * VeraView · Historial de conversaciones (rail izquierdo).
 * L7 fase B (24/09): métodos movidos TAL CUAL desde js/views/VeraView.js a un mixin
 * sobre el prototipo. Usan los helpers de js/views/vera/graficos.js (scripts clásicos:
 * mismo ámbito global). Se carga DESPUÉS de VeraView.js (ver app.js · veraLoader).
 */
(function () {
  'use strict';
  if (typeof window.VeraView !== 'function') return;

  Object.assign(window.VeraView.prototype, {
    /* ── Historial de conversaciones (rail izquierdo) ────── */

    // Al salir de Vera (router.onLeave) restauramos el sidebar global.
    onLeave() {
      try { window.appNavigation?.restoreFromImmersive?.(); } catch (_) { /* el shell puede no estar montado */ }
      // Matar cualquier espera async en vuelo (ticker + polling 6s + realtime) para
      // que no siga golpeando Supabase en background tras salir de Vera.
      try { this._cancelAsyncWait?.(); } catch (_) { /* nada que cancelar */ }
      // El modal de adjuntar (#veraLibModal) vive en <body>; si se navega con el
      // abierto (teclado/back) quedaba huerfano tapando la vista siguiente.
      try { document.getElementById('veraLibModal')?.remove(); } catch (_) { /* ya no estaba */ }
    },

    /**
     * Carga las conversaciones del usuario en esta organización. Pide el conteo
     * de mensajes embebido (FK ai_messages_conv_fkey) para filtrar las sesiones
     * vacías (p. ej. "Sesión de voz" sin mensajes) que solo serían ruido.
     */
    async loadConversations() {
      this.aiState.conversations = [];
      if (!window.VeraDatos || !this.aiState.organization_id || !this.userId) return;
      try {
        // ai.conversations (las mías en la marca); en el rail solo las que ya tienen mensajes.
        const lista = await window.VeraDatos.conversaciones(this.aiState.organization_id, { mias: true, userId: this.userId, limite: 60 });
        this.aiState.conversations = lista.filter((c) => (c.ai_messages?.[0]?.count || 0) > 0);
      } catch (_) { /* lista vacía si falla */ }
    },

    // Agrupa por antigüedad relativa al día actual (estilo ChatGPT).
    _historyBucket(updatedAt) {
      const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const now = new Date();
      const d = new Date(updatedAt);
      if (Number.isNaN(d.getTime())) return __('Anteriores');
      const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
      if (diff <= 0) return __('Hoy');
      if (diff === 1) return __('Ayer');
      if (diff <= 7) return __('Últimos 7 días');
      if (diff <= 30) return __('Últimos 30 días');
      return __('Anteriores');
    },

    _convTitle(c) {
      const t = (c?.title || '').trim();
      if (!t || t === 'Sesión de voz') return __('Conversación');
      return t;
    },

    renderHistory() {
      const list = document.getElementById('veraHistoryList');
      if (!list) return;
      let convs = this.aiState.conversations || [];
      const q = (this._historySearch || '').trim().toLowerCase();
      if (q) convs = convs.filter((c) => this._convTitle(c).toLowerCase().includes(q));

      if (!convs.length) {
        window.Estado.pintar(list, `<div class="vera-history-empty">${q ? __('Sin resultados.') : __('Aún no tienes chats.<br>Escribe abajo para empezar.')}</div>`);
        return;
      }
      // Lista plana "Recientes" (ya viene ordenada por updated_at desc).
      const active = this.aiState.active_conversation_id;
      let html = `<div class="vera-history-group">${__('Recientes')}</div>`;
      for (const c of convs) {
        const title = this._convTitle(c);
        const safe = escapeHtml(title);
        const attr = safe.replace(/"/g, '&quot;');
        // Vera pudo INICIAR el hilo (metadata.initiated_by='vera'): lo marcamos para
        // que el usuario vea que ella le escribió, no al revés.
        const byVera = c?.metadata?.initiated_by === 'vera';
        let cls = c.id === active ? 'vera-history-item active' : 'vera-history-item';
        if (byVera) cls += ' vera-history-item--from-vera';
        const badge = byVera
          ? `<span class="vera-history-item-badge" title="${__('Vera te escribió')}">${__('Vera')}</span>`
          : '';
        html += `<button class="${cls}" data-conv-id="${c.id}" title="${attr}"><span class="vera-history-item-title">${safe}</span>${badge}</button>`;
      }
      window.Estado.pintar(list, html);
    },

    bindHistory() {
      const list = document.getElementById('veraHistoryList');
      if (list && !list.__veraHistBound) {
        list.__veraHistBound = true;
        list.addEventListener('click', (e) => {
          const item = e.target.closest('.vera-history-item');
          if (!item) return;
          const id = item.getAttribute('data-conv-id');
          if (id) this.selectConversation(id);
        });
      }
      const wire = (id, fn) => {
        const el = document.getElementById(id);
        if (el && !el.__veraBound) { el.__veraBound = true; el.addEventListener('click', fn); }
      };
      wire('veraNewChat', () => this.startNewConversation());
      wire('veraHistoryCollapse', () => this.toggleHistory(true));
      wire('veraHistoryOpen', () => this.toggleHistory(false));
      wire('veraHistoryScrim', () => this.toggleHistory(true));

      // Buscar chats: toggle del input + filtro en vivo.
      const searchBtn = document.getElementById('veraHistorySearchBtn');
      const searchInput = document.getElementById('veraHistorySearchInput');
      if (searchBtn && searchInput && !searchBtn.__veraBound) {
        searchBtn.__veraBound = true;
        searchBtn.addEventListener('click', () => {
          const show = searchInput.hidden;
          searchInput.hidden = !show;
          searchBtn.classList.toggle('active', show);
          if (show) {
            requestAnimationFrame(() => searchInput.focus());
          } else {
            searchInput.value = '';
            this._historySearch = '';
            this.renderHistory();
          }
        });
      }
      if (searchInput && !searchInput.__veraBound) {
        searchInput.__veraBound = true;
        searchInput.addEventListener('input', () => {
          this._historySearch = searchInput.value;
          this.renderHistory();
        });
      }
    },
  });
})();
