/**
 * Páginas de estado DENTRO de la consola (L1, 24/09): 404 y 403 con el shell,
 * la piel de EnObrasView y SIN llamadas a la base. Antes el 404 sacaba a la
 * persona a aismartcontent.io/404 y el 403 la mandaba a Vera sin decir por qué.
 */
class PaginaEstadoView extends BaseView {
  /** { eyebrow, titulo, texto } — lo define cada subclase. */
  contenido() { return { eyebrow: '', titulo: '', texto: '' }; }

  async render() {
    const container = document.getElementById('app-container');
    if (!container) return;
    const c = this.contenido();
    const inicio = PaginaEstadoView.rutaInicio();
    window.Estado.pintar(container, `
      <section class="en-obras" aria-live="polite">
        <span class="en-obras-eyebrow">${this.escapeHtml(c.eyebrow)}</span>
        <h1 class="en-obras-titulo">${this.escapeHtml(c.titulo)}</h1>
        <p class="en-obras-texto">${this.escapeHtml(c.texto)}</p>
        <a class="btn btn-secondary" href="${this.escapeHtml(inicio)}" data-route="${this.escapeHtml(inicio)}">${this.escapeHtml(__('Volver al inicio'))}</a>
      </section>`);
    const a = container.querySelector('a[data-route]');
    if (a) this.addEventListener(a, 'click', (e) => { e.preventDefault(); window.router?.navigate(inicio); });
    if (typeof this.updateHeaderContext === 'function') this.updateHeaderContext(c.titulo, null, window.currentOrgName || null);
  }

  static rutaInicio() {
    const m = window.location.pathname.match(/^\/org\/[^/]+\/[^/]+/);
    return m ? `${m[0]}/dashboard` : '/home';
  }
}

class NoEncontradaView extends PaginaEstadoView {
  contenido() {
    return {
      eyebrow: '404',
      titulo: __('Esta página no existe'),
      texto: __('Puede que el enlace esté mal escrito o que la página se haya movido. Desde el inicio llegas a todo lo de tu marca.'),
    };
  }
}

class SinPermisoView extends PaginaEstadoView {
  contenido() {
    return {
      eyebrow: '403',
      titulo: __('Tu rol no tiene acceso a esta sección'),
      texto: __('Quien administra tu marca puede darte el permiso desde Organización › Miembros.'),
    };
  }
}

window.PaginaEstadoView = PaginaEstadoView;
window.NoEncontradaView = NoEncontradaView;
window.SinPermisoView = SinPermisoView;
