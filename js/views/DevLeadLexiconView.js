/**
 * DevLeadLexiconView - Admin del léxico de dimensiones (shell).
 * Estado: shell "Próximamente". Implementación detallada en sprint D13.
 *
 * Cuando se detalle, consume:
 *   dimension_lexicon (37 pending) · v_orphan_topics (1.488 candidatos)
 */
class DevLeadLexiconView extends DevBaseView {
  constructor() {
    super();
    this.templatePath = null;
  }

  renderHTML() {
    return `
      <div class="dev-page">
        <div class="dash-coming-soon" style="
          display:flex;align-items:center;justify-content:center;
          flex-direction:column;gap:8px;
          min-height:60vh;padding:48px 24px;
        ">
          <h2 style="margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em;">
            Léxico
          </h2>
          <p style="margin:0;color:var(--text-muted);">Próximamente</p>
        </div>
      </div>`;
  }
}

window.DevLeadLexiconView = DevLeadLexiconView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DevLeadLexiconView;
}
