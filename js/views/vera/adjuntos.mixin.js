/**
 * VeraView · Adjuntos del composer (tipo, ícono, subida, chips).
 * L7 fase B (24/09): métodos movidos TAL CUAL desde js/views/VeraView.js a un mixin
 * sobre el prototipo. Usan los helpers de js/views/vera/graficos.js (scripts clásicos:
 * mismo ámbito global). Se carga DESPUÉS de VeraView.js (ver app.js · veraLoader).
 */
(function () {
  'use strict';
  if (typeof window.VeraView !== 'function') return;

  Object.assign(window.VeraView.prototype, {
    /* ── Adjuntos: tipo MIME → backend type ──────────────── */
    _inferAttachmentType(file) {
      const mime = (file.type || '').toLowerCase();
      const name = (file.name || '').toLowerCase();
      if (mime.startsWith('image/')) return 'image';
      if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
      if (mime.startsWith('audio/')) return 'audio';
      if (mime.startsWith('video/')) return 'video';
      if (name.endsWith('.docx') ||
          mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          mime === 'application/msword' || name.endsWith('.doc')) return 'word';
      if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv') ||
          mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          mime === 'application/vnd.ms-excel' || mime === 'text/csv') return 'spreadsheet';
      if (mime.startsWith('text/') || name.endsWith('.md') || name.endsWith('.txt')) return 'text';
      return 'other';
    },

    /* ── Adjuntos: ícono visual por tipo ─────────────────── */
    _attachmentIconClass(type) {
      return ({
        image: 'aisc-ico aisc-ico--image',
        pdf: 'aisc-ico aisc-ico--document',
        audio: 'fa-file-audio',
        video: 'aisc-ico aisc-ico--video',
        word: 'aisc-ico aisc-ico--document',
        spreadsheet: 'aisc-ico aisc-ico--document',
        text: 'aisc-ico aisc-ico--document',
        library: 'aisc-ico aisc-ico--layers'
      })[type] || 'aisc-ico aisc-ico--document';
    },

    /* ── Adjuntos: subir a Supabase Storage ─────────────── */
    /** Adjuntos por el borde (POST /v1/archivos): al mensaje va la URL de galería/pública y el file_id. */
    async _uploadAttachment(att, file) {
      if (!window.StudioDatos) throw new Error(__('Almacenamiento no disponible'));
      const orgId = this.aiState.organization_id;
      try {
        const subido = await window.StudioDatos.subirReferencia(orgId, file);
        att.url = subido.url || `archivo:${subido.file_id}`;
        att.file_id = subido.file_id;
        att.path = subido.object_key || null;
      } catch (e) {
        if (e?.code === 'sin_api') throw new Error(__('Los adjuntos se suben cuando el borde esté configurado.'), { cause: e });
        throw e;
      }
    },

    /* ── Adjuntos: manejar selección + subir en paralelo ──── */
    _handleFileSelection(files) {
      if (!files?.length) return;
      const MAX_BYTES = 25 * 1024 * 1024; // 25MB por archivo
      for (const file of files) {
        if (file.size > MAX_BYTES) {
          console.warn(`[VeraView] archivo excede 25MB, ignorado: ${file.name}`);
          continue;
        }
        const att = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          mime: file.type,
          size: file.size,
          type: this._inferAttachmentType(file),
          url: null,
          status: 'uploading'
        };
        this.aiState.pendingAttachments.push(att);
        this._renderAttachChips();
        this._uploadAttachment(att, file)
          .then(() => { att.status = 'ready'; })
          .catch((err) => {
            console.error('[VeraView] upload falló:', err?.message || err);
            att.status = 'error';
            att.error = err?.message || __('Error al subir');
          })
          .finally(() => {
            this._renderAttachChips();
            this._syncSendBtn?.();
          });
      }
    },

    /* ── Adjuntos: render de chips en composer ───────────── */
    _renderAttachChips() {
      const wrap = document.getElementById('veraAttachChips');
      if (!wrap) return;
      const list = this.aiState.pendingAttachments;
      if (!list.length) { wrap.hidden = true; wrap.innerHTML = ''; return; }
      wrap.hidden = false;
      wrap.innerHTML = list.map(a => {
        const icon = a.type === 'library' ? this._libKindIcon(a.kind) : this._attachmentIconClass(a.type);
        const stateClass = a.status === 'error' ? ' gpt-attach-chip--error'
                          : a.status === 'uploading' ? ' gpt-attach-chip--uploading' : '';
        const spinner = a.status === 'uploading' ? '<i class="aisc-ico fa-spin aisc-ico--loader"></i>' : '';
        const errorTitle = a.status === 'error' ? ` title="${escapeHtml(a.error || __('Error'))}"` : '';
        return `
          <span class="gpt-attach-chip${stateClass}" data-att-id="${escapeHtml(a.id)}"${errorTitle}>
            <i class="fas ${icon}"></i>
            <span class="gpt-attach-chip-name">${escapeHtml(a.name)}</span>
            ${spinner}
            <button type="button" class="gpt-attach-chip-remove" data-remove-id="${escapeHtml(a.id)}" aria-label="${__('Quitar')}">
              <i class="aisc-ico aisc-ico--close"></i>
            </button>
          </span>`;
      }).join('');

      if (!wrap.__bound) {
        wrap.__bound = true;
        wrap.addEventListener('click', (e) => {
          const btn = e.target.closest?.('[data-remove-id]');
          if (!btn) return;
          const id = btn.getAttribute('data-remove-id');
          const idx = this.aiState.pendingAttachments.findIndex(a => a.id === id);
          if (idx >= 0) {
            const att = this.aiState.pendingAttachments[idx];
            // El archivo ya subido se borra por el borde (DELETE /v1/archivos/:id). Si falla,
            // queda en la bóveda de la marca: no es un error para la persona, solo se registra.
            if (att.file_id && window.apiV2?.api?.borrarArchivo) {
              window.apiV2.api.borrarArchivo(att.file_id, this.aiState.organization_id)
                .catch((err) => console.warn('[vera] adjunto quitado sin borrar:', err?.codigo || err?.message));
            }
            this.aiState.pendingAttachments.splice(idx, 1);
            this._renderAttachChips();
            this._syncSendBtn?.();
          }
        });
      }
    },
  });
})();
