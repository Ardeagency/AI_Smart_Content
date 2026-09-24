/**
 * VeraView · Panel de artefactos, galería y resumen de artifacts.
 * L7 fase B (24/09): métodos movidos TAL CUAL desde js/views/VeraView.js a un mixin
 * sobre el prototipo. Usan los helpers de js/views/vera/graficos.js (scripts clásicos:
 * mismo ámbito global). Se carga DESPUÉS de VeraView.js (ver app.js · veraLoader).
 */
(function () {
  'use strict';
  if (typeof window.VeraView !== 'function') return;

  Object.assign(window.VeraView.prototype, {
    /* ── Panel de artefactos (Canvas) ────────────────────────
       Abre los bloques [artifact]/[html] de Vera en un panel derecho grande, con
       vista previa / código / copiar / descargar / pantalla completa. Reusa el
       srcdoc del iframe inline (que ya tiene el HTML completo). */

    // Llamado desde el botón "Abrir en panel" del bloque inline.
    _openArtifactPanel(btnEl) {
      const block = btnEl?.closest?.('.vera-artifact-block, .vera-html-block');
      if (!block) return;
      // La tarjeta de artifact NO monta iframe: guarda el documento en data-srcdoc.
      // Las vistas (```html) sí siguen teniendo su iframe inline.
      const iframe = block.querySelector('iframe');
      const srcdoc = block.dataset.srcdoc || iframe?.srcdoc || iframe?.getAttribute('srcdoc') || '';
      if (!srcdoc) return;
      // El título real del documento, si la tarjeta lo leyó; si no, el rótulo.
      const rawLabel = block.querySelector('.vera-artifact-bar span')?.textContent || '';
      const title = block.dataset.title
        || rawLabel.replace(/^[⬡\s]+/, '').replace(/·.*$/, '').trim()
        || __('Artefacto');
      this._showArtifactPanel({ srcdoc, title });
    },

    _showArtifactPanel({ srcdoc, title }) {
      const panel = document.getElementById('veraArtifactPanel');
      const body = document.getElementById('veraArtifactBody');
      const titleEl = document.getElementById('veraArtifactTitle');
      const layout = document.getElementById('chatcontainer');
      if (!panel || !body) return;

      this._artifactSrcdoc = srcdoc;
      this._artifactView = 'preview';
      if (titleEl) titleEl.textContent = title || __('Artefacto');
      this._renderArtifactBody();

      panel.hidden = false;
      requestAnimationFrame(() => layout?.classList.add('artifact-open'));
      // El panel ocupa la derecha → colapsa el rail de historial para no solapar.
      this._artifactReopenHistory = !document.getElementById('chatcontainer')?.classList.contains('history-collapsed');
      this.toggleHistory(true);
    },

    _renderArtifactBody() {
      const body = document.getElementById('veraArtifactBody');
      if (!body) return;
      const viewBtn = document.getElementById('veraArtifactView');
      const codeBtn = document.getElementById('veraArtifactCode');
      if (this._artifactView === 'code') {
        body.innerHTML = `<pre class="vera-artifact-code"><code>${escapeHtml(this._artifactSrcdoc || '')}</code></pre>`;
        this._artifactFrame = null;
      } else {
        body.innerHTML = '';
        const f = document.createElement('iframe');
        f.className = 'vera-artifact-panel-frame';
        // Este SÍ lleva allow-modals, y a propósito: `window.print()` cuenta como
        // modal y sin el permiso el botón "Guardar como PDF" dejaría de funcionar.
        // El riesgo de un alert() que congele la pestaña se acota a este marco,
        // que solo existe cuando el usuario abre el artifact a mano; los bloques
        // inline —que se pintan solos en cada mensaje— van sin él.
        f.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
        f.srcdoc = this._artifactSrcdoc || '';
        body.appendChild(f);
        this._artifactFrame = f;
      }
      viewBtn?.classList.toggle('active', this._artifactView === 'preview');
      codeBtn?.classList.toggle('active', this._artifactView === 'code');
    },

    _closeArtifactPanel() {
      const panel = document.getElementById('veraArtifactPanel');
      const body = document.getElementById('veraArtifactBody');
      const layout = document.getElementById('chatcontainer');
      layout?.classList.remove('artifact-open');
      if (body) body.innerHTML = '';
      this._artifactFrame = null;
      this._artifactSrcdoc = '';
      // Oculta tras la transición.
      setTimeout(() => { if (panel && !layout?.classList.contains('artifact-open')) panel.hidden = true; }, 260);
      if (this._artifactReopenHistory && !this._isMobile()) this.toggleHistory(false);
      this._artifactReopenHistory = false;
    },

    _bindArtifactPanel() {
      // Guard POR ELEMENTO (no por instancia): seguro ante re-render del DOM y sin
      // doble-bind si el DOM persiste (bfcache). Si el panel se reconstruye, los
      // elementos nuevos no tienen el flag y se enlazan.
      const on = (id, fn) => {
        const el = document.getElementById(id);
        if (!el || el.__artBound) return;
        el.__artBound = true;
        el.addEventListener('click', fn);
      };
      on('veraArtifactClose', () => this._closeArtifactPanel());
      on('veraArtifactView', () => { this._artifactView = 'preview'; this._renderArtifactBody(); });
      on('veraArtifactCode', () => { this._artifactView = 'code'; this._renderArtifactBody(); });
      on('veraArtifactFull', () => { try { this._artifactFrame?.requestFullscreen?.(); } catch (_) { /* el navegador puede negar la pantalla completa */ } });
      on('veraArtifactPdf', () => {
        // Imprime el artefacto (Guardar como PDF). Requiere la vista previa (iframe).
        const doPrint = () => {
          try { this._artifactFrame?.contentWindow?.postMessage({ type: 'vera_print' }, '*'); } catch (_) { /* el iframe ya no existe */ }
        };
        if (this._artifactView !== 'preview') {
          this._artifactView = 'preview';
          this._renderArtifactBody();
          setTimeout(doPrint, 250); // deja cargar el iframe nuevo
        } else {
          doPrint();
        }
      });
      on('veraArtifactCopy', () => {
        const txt = this._artifactSrcdoc || '';
        navigator.clipboard?.writeText(txt).then(() => this._flashArtifactBtn('veraArtifactCopy')).catch(() => {});
      });
      on('veraArtifactDownload', () => {
        try {
          const blob = new Blob([this._artifactSrcdoc || ''], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'artefacto-vera.html';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (_) { /* sin descarga: el artefacto sigue en pantalla */ }
      });
    },

    _flashArtifactBtn(id) {
      const b = document.getElementById(id);
      if (!b) return;
      const i = b.querySelector('i');
      const prev = i?.className;
      if (i) i.className = 'aisc-ico aisc-ico--check';
      setTimeout(() => { if (i && prev) i.className = prev; }, 1200);
    },

    /* ── Galería de archivos generados (vera_artifacts) ──────── */
    _bindGallery() {
      // Guard por elemento (igual que _bindArtifactPanel): seguro ante re-render.
      const on = (id, fn) => {
        const el = document.getElementById(id);
        if (!el || el.__galBound) return;
        el.__galBound = true;
        el.addEventListener('click', fn);
      };
      on('veraGalleryBtn', () => this._openGallery());
      on('veraGalleryClose', () => this._closeGallery());
      on('veraGalleryScrim', () => this._closeGallery());
      on('veraGalleryRefresh', () => this._loadArtifacts(true));
    },

    _openGallery() {
      const ov = document.getElementById('veraGalleryOverlay');
      if (!ov) return;
      ov.hidden = false;
      requestAnimationFrame(() => ov.classList.add('open'));
      // Esc cierra: listener solo mientras está abierto (sin fugas entre remounts).
      if (!this._galKeyHandler) this._galKeyHandler = (e) => { if (e.key === 'Escape') this._closeGallery(); };
      document.addEventListener('keydown', this._galKeyHandler);
      this._loadArtifacts();
    },

    _closeGallery() {
      const ov = document.getElementById('veraGalleryOverlay');
      if (!ov) return;
      ov.classList.remove('open');
      if (this._galKeyHandler) document.removeEventListener('keydown', this._galKeyHandler);
      setTimeout(() => { if (!ov.classList.contains('open')) ov.hidden = true; }, 220);
    },

    /** vera_artifacts no existe en la base nueva: los archivos de Vera llegan como salidas (Producciones). */
    async _loadArtifacts(_force) {
      const body = document.getElementById('veraGalleryBody');
      const countEl = document.getElementById('veraGalleryCount');
      if (!body) return;
      body.dataset.loaded = '1';
      if (countEl) countEl.textContent = '';
      body.innerHTML = this._galleryMsg(__('Los archivos que produce Vera se ven en Producción.'));
    },

    _renderGallery(list) {
      const body = document.getElementById('veraGalleryBody');
      if (!body) return;
      if (!list.length) {
        body.innerHTML = (window.BaseView && window.BaseView.emptyState)
          ? window.BaseView.emptyState({
              icon: 'aisc-ico aisc-ico--folder',
              title: __('Aún no hay archivos'),
              subtitle: __('Pídele a Vera un informe, una presentación o una tabla y aparecerá aquí para descargar.'),
              compact: true,
            })
          : this._galleryMsg(__('Aún no hay archivos.'));
        return;
      }
      const cards = list.map((a) => {
        const ic = this._artifactIcon(a.format);
        const fmt = String(a.format || '').toUpperCase();
        const meta = [fmt, this._humanBytes(a.bytes), this._relTime(a.created_at)].filter(Boolean).join(' · ');
        const url = a.public_url || '#';
        const fmtClass = escapeHtml(String(a.format || 'file').toLowerCase());
        return `
          <a class="vera-gallery-card" href="${escapeHtml(url)}" target="_blank" rel="noopener" download
             title="${escapeHtml(a.title || fmt)}">
            <div class="vera-gallery-card-icon vera-gallery-card-icon--${fmtClass}"><i class="fas ${ic}"></i></div>
            <div class="vera-gallery-card-meta">
              <div class="vera-gallery-card-title">${escapeHtml(a.title || __('Sin título'))}</div>
              <div class="vera-gallery-card-sub">${escapeHtml(meta)}</div>
            </div>
            <div class="vera-gallery-card-dl"><i class="aisc-ico aisc-ico--dowload"></i></div>
          </a>`;
      }).join('');
      body.innerHTML = `<div class="vera-gallery-grid">${cards}</div>`;
    },

    _galleryMsg(msg) {
      return `<div class="vera-gallery-msg">${escapeHtml(msg)}</div>`;
    },

    _artifactIcon(format) {
      const f = String(format || '').toLowerCase();
      if (f === 'pdf') return 'aisc-ico aisc-ico--document';
      if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(f)) return 'aisc-ico aisc-ico--image';
      if (f === 'xlsx' || f === 'csv') return 'aisc-ico aisc-ico--document';
      if (f === 'docx' || f === 'doc') return 'aisc-ico aisc-ico--document';
      if (f === 'html') return 'aisc-ico aisc-ico--document';
      return 'aisc-ico aisc-ico--document';
    },

    _humanBytes(n) {
      n = Number(n) || 0;
      if (!n) return '';
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    },

    /* ── Resumen de un artifact para su tarjeta en el chat ─────────────────────
       El título y la primera línea se LEEN del HTML que escribió Vera; no se
       inventan ni se piden aparte. Si el documento no dice cómo se llama, la
       tarjeta se queda sin subtítulo antes que rellenar el hueco con ruido. */
    _textoPlano(html) {
      return String(html || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
    },

    _recortar(s, max) {
      return s.length > max ? `${s.slice(0, max - 1)}…` : s;
    },

    _tituloDeArtifact(code) {
      const src = String(code || '');
      const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(src)
        || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(src)
        || /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(src);
      return this._recortar(this._textoPlano(m?.[1] || ''), 90);
    },

    _resumenDeArtifact(code) {
      const src = String(code || '');
      const titulo = this._tituloDeArtifact(src);
      const parrafos = src.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
      for (const p of parrafos) {
        const t = this._textoPlano(p);
        // Se descarta lo que solo repite el título: dos veces lo mismo no resume.
        if (t.length >= 12 && t !== titulo) return this._recortar(t, 110);
      }
      return '';
    },

    _relTime(iso) {
      if (!iso) return '';
      try {
        const d = new Date(iso);
        const diff = (Date.now() - d.getTime()) / 1000;
        if (diff < 60) return 'hace un momento';
        if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
        if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
        if (diff < 604800) return `hace ${Math.floor(diff / 86400)} d`;
        return d.toLocaleDateString();
      } catch (_) { return ''; }
    },

    _isMobile() {
      return !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
    },

    // collapsed === undefined → alterna. true → oculta, false → muestra.
    toggleHistory(collapsed) {
      const layout = document.getElementById('chatcontainer');
      if (!layout) return;
      const next = collapsed === undefined
        ? !layout.classList.contains('history-collapsed')
        : !!collapsed;
      layout.classList.toggle('history-collapsed', next);
      // En móvil el historial es un drawer temporal: no persistimos su estado.
      if (!this._isMobile()) {
        try { localStorage.setItem('veraHistoryCollapsed', next ? 'true' : 'false'); } catch (_) { /* navegación privada: vale solo esta sesión */ }
      }
    },

    _applyHistoryCollapsed() {
      const layout = document.getElementById('chatcontainer');
      if (!layout) return;
      let collapsed = false;
      if (this._isMobile()) {
        collapsed = true; // móvil: drawer cerrado por defecto
      } else {
        try { collapsed = localStorage.getItem('veraHistoryCollapsed') === 'true'; } catch (_) { /* navegación privada: se queda expandido */ }
      }
      layout.classList.toggle('history-collapsed', collapsed);
    },

    async selectConversation(id) {
      if (!id) return;
      if (id !== this.aiState.active_conversation_id) {
        this.aiState.active_conversation_id = id;
        await this.loadMessages();
        this.renderMessages();
        this.renderHistory();
        const c = (this.aiState.conversations || []).find((x) => x.id === id);
        this._setConversationUrl(id, c?.title);
      }
      if (this._isMobile()) this.toggleHistory(true);
    },

    startNewConversation() {
      this.aiState.active_conversation_id = null;
      this.aiState.messages = [];
      this._setConversationUrl(null); // vuelve a /vera (nueva conversación)
      this.renderWelcome();
      this.renderHistory();
      const input = document.getElementById('veraInput');
      if (input) requestAnimationFrame(() => input.focus());
      if (this._isMobile()) this.toggleHistory(true);
    },

    // Refresca el rail tras un intercambio (nueva conversación o título nuevo).
    // Debounced: el backend puede tardar en generar el título de la sesión.
    _refreshHistorySoon() {
      if (this._histRefreshTimer) clearTimeout(this._histRefreshTimer);
      this._histRefreshTimer = setTimeout(async () => {
        await this.loadConversations();
        this.renderHistory();
      }, 1200);
    },

    /* Genera el titulo de una conversacion recien creada con OpenAI (Netlify fn
       api-name-conversation), a partir del primer mensaje del usuario. Best-effort,
       una sola vez por conversacion; al exito repinta el rail con el titulo nuevo. */
    /** Título de la conversación: las primeras palabras del primer mensaje (sin OpenAI, ADR-0052). */
    _nameConversationSoon(convId, primerTexto = '') {
      if (!convId || !window.VeraDatos) return;
      this._namedConvs = this._namedConvs || new Set();
      if (this._namedConvs.has(convId)) return;
      this._namedConvs.add(convId);
      const titulo = window.VeraDatos.mapeo.tituloDesde(primerTexto);
      if (!titulo) return;
      setTimeout(async () => {
        try {
          await window.VeraDatos.renombrar(convId, titulo);
          await this.loadConversations();
          this.renderHistory();
          if (this.aiState.active_conversation_id === convId) this._setConversationUrl(convId, titulo);
        } catch (_) { /* best-effort: si falla, queda "Nueva conversación" */ }
      }, 300);
    },
  });
})();
