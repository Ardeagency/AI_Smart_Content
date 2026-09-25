/**
 * EnObrasView — lo que se ve mientras una sección se trae a la base nueva.
 * Gris, honesto y SIN llamadas a la base (regla del corte). Usa el ADN.
 */
class EnObrasView extends BaseView {
  async render() {
    const container = document.getElementById('app-container');
    if (!container) return;
    const nombre = this._nombreDeSeccion();
    window.Estado.pintar(container, `
      <section class="en-obras" aria-live="polite">
        <span class="en-obras-eyebrow">${this.escapeHtml(__('EN OBRAS'))}</span>
        <h1 class="en-obras-titulo">${this.escapeHtml(nombre)}</h1>
        <p class="en-obras-texto">${this.escapeHtml(__('Esta sección se está trayendo a la nueva base de AI Smart Content. Vuelve en unos días; el resto de la consola sigue funcionando.'))}</p>
        <a class="btn btn-secondary" href="${this.escapeHtml(this._rutaInicio())}" data-route="${this.escapeHtml(this._rutaInicio())}">${this.escapeHtml(__('Volver al inicio'))}</a>
      </section>`);
  }

  _nombreDeSeccion() {
    const seg = (window.EnObras?.segmento(window.location.pathname) || '').split('/')[0];
    const nombres = {
      dashboard: __('Tablero'), production: __('Producción'), monitoring: __('Monitoreo'), predictor: __('Simulador'),
      'command-center': __('Campañas'), tasks: __('Tareas'), image: __('Imagen'), video: __('Video'), vera: 'Vera',
      studio: __('Flujos'), brand: __('Identidad'), brands: __('Identidad'), 'brand-organization': __('Identidad'),
      'brand-storage': __('Almacenamiento'), products: __('Productos'), services: __('Servicios'), places: __('Escenarios'),
      characters: __('Personajes'), organization: __('Organización'), plans: __('Planes'), credits: __('Créditos'),
      'execution-history': __('Historial'),
    };
    return nombres[seg] || __('Esta sección');
  }

  _rutaInicio() {
    const m = window.location.pathname.match(/^\/org\/[^/]+\/[^/]+/);
    return m ? `${m[0]}/dashboard` : '/home';
  }
}
window.EnObrasView = EnObrasView;
