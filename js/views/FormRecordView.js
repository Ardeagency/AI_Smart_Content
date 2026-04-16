/**
 * FormRecordView — redirect shim de la ruta legacy `/form_org`.
 *
 * El formulario multi-step original vivía aquí. Desde que se unificó en /create,
 * esta vista solo reenvía. Conservamos la entrada en app.js por si hay bookmarks o
 * enlaces externos apuntando a /form_org. Cuando el log `[legacy-route]` de app.js
 * confirme cero tráfico, borrar la ruta y este archivo.
 */
class FormRecordView extends BaseView {
  renderHTML() {
    return '<div class="page-content"><p class="text-muted">Redirigiendo…</p></div>';
  }

  async onEnter() {
    if (window.router) {
      console.warn('[legacy-route] /form_org → /create');
      window.router.navigate('/create', true);
    }
  }
}

window.FormRecordView = FormRecordView;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormRecordView;
}
