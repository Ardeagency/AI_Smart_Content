/**
 * Estado — lo que una vista o una sección muestra cuando NO tiene su contenido:
 * cargando, vacío, error, «todavía no» y en obras. Una sola puerta para los cinco;
 * reusa las pieles que ya existían (skeleton de bundle.css, .empty-state de
 * empty-state.css, .section-error de error-state.css, .en-obras) en vez de pintar
 * una sexta. Devuelve HTML (texto ya escapado) para meterlo donde la vista pinte.
 *
 *   Estado.pintar(zona, Estado.cargando('tarjetas', 6));
 *   Estado.pintar(zona, Estado.vacio({ titulo: 'Aún no hay productos', accion: 'Agregar producto', accionId: 'nuevo' }));
 *   Estado.pintar(zona, Estado.error({ texto: e.message }));     // botón data-estado="reintentar"
 *   Estado.pintar(zona, Estado.todaviaNo({ titulo: 'Editar una producción' }));
 *   Estado.alReintentar(zona, () => this.cargar());        // un listener, idempotente
 *
 * Reglas: una sección vacía NUNCA queda en blanco ni con «relation does not exist»;
 * un error dice qué pasó en palabras y ofrece reintentar; lo que aún no existe en la
 * base nueva dice «todavía no» (nunca un botón que no hace nada).
 */
(function () {
  'use strict';

  const t = (s) => (typeof window.__ === 'function' ? window.__(s) : s);
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

  const FORMAS_CARGA = ['tarjetas', 'filas', 'texto', 'bloque'];

  /** Esqueleto con la FORMA del contenido que viene (el layout no salta al llegar). */
  function cargando(forma, cuantos) {
    const f = FORMAS_CARGA.includes(forma) ? forma : 'bloque';
    const n = Math.max(1, Math.min(24, Number(cuantos) || (f === 'tarjetas' ? 6 : 3)));
    let cuerpo;
    if (f === 'tarjetas') {
      const cols = n >= 4 ? 4 : 3;
      cuerpo = '<div class="skeleton-grid skeleton-grid--' + cols + '">' +
        '<div class="skeleton skeleton-card"></div>'.repeat(n) + '</div>';
    } else if (f === 'filas') {
      cuerpo = ('<div class="skeleton-row"><span class="skeleton skeleton-circle skeleton-circle--sm"></span>' +
        '<div class="estado-fila"><span class="skeleton skeleton-text skeleton-text--w75"></span>' +
        '<span class="skeleton skeleton-text skeleton-text--sm skeleton-text--w35"></span></div></div>').repeat(n);
    } else if (f === 'texto') {
      cuerpo = '<span class="skeleton skeleton-text skeleton-text--w90"></span>'.repeat(n);
    } else {
      cuerpo = '<div class="skeleton skeleton-text skeleton-text--lg skeleton-text--w35"></div>' +
        '<div class="skeleton skeleton-card skeleton-card--lg"></div>';
    }
    return '<div class="estado estado--cargando" aria-busy="true" aria-label="' + esc(t('Cargando')) + '">' + cuerpo + '</div>';
  }

  /** Vacío: la plantilla canónica (.empty-state, Figma 133:14). */
  function vacio(o) {
    const op = o || {};
    const icono = op.icono || 'aisc-ico aisc-ico--inbox';
    const clases = ['empty-state', 'estado', 'estado--vacio', op.compacto && 'empty-state--compact', op.llenar && 'empty-state--fill']
      .filter(Boolean).join(' ');
    const accion = op.accion
      ? '<div class="ple-actions"><button type="button" class="ple-btn ple-btn--primary" data-estado="accion"' +
        (op.accionId ? ' data-action="' + esc(op.accionId) + '"' : '') + '>' + esc(op.accion) + '</button></div>'
      : '';
    return '<div class="' + clases + '"><div class="ple-content">' +
      '<div class="ple-medallion" aria-hidden="true"><i class="' + esc(icono) + '"></i></div>' +
      '<h3 class="ple-title">' + esc(op.titulo || t('Todavía no hay nada aquí')) + '</h3>' +
      (op.texto ? '<p class="ple-subtitle">' + esc(op.texto) + '</p>' : '') +
      accion + '</div></div>';
  }

  /** Error de sección: qué pasó, en palabras, y reintentar (si no se apaga). */
  function error(o) {
    const op = typeof o === 'string' ? { texto: o } : (o || {});
    const reintentar = op.reintentar === false ? '' :
      '<button type="button" class="section-error-retry" data-estado="reintentar">' + esc(t('Reintentar')) + '</button>';
    return '<div class="section-error estado estado--error" role="alert">' +
      '<div class="section-error-icon" aria-hidden="true"><i class="aisc-ico aisc-ico--alert-error"></i></div>' +
      '<div class="section-error-title">' + esc(op.titulo || t('No se pudo cargar')) + '</div>' +
      (op.texto ? '<p class="section-error-msg">' + esc(op.texto) + '</p>' : '') +
      reintentar + '</div>';
  }

  /** «Todavía no»: algo que la base nueva aún no expone. Chico, dentro de la vista. */
  function todaviaNo(o) {
    const op = typeof o === 'string' ? { titulo: o } : (o || {});
    return '<div class="estado estado--todavia-no" role="status">' +
      '<span class="en-obras-eyebrow">' + esc(t('TODAVÍA NO')) + '</span>' +
      '<p class="estado__titulo">' + esc(op.titulo || t('Esto todavía no está disponible')) + '</p>' +
      '<p class="estado__texto">' + esc(op.texto || t('Lo estamos trayendo a la nueva base. El resto de la página funciona.')) + '</p>' +
      '</div>';
  }

  /** En obras: la página entera (mismo aspecto que EnObrasView). */
  function enObras(o) {
    const op = typeof o === 'string' ? { nombre: o } : (o || {});
    return '<section class="en-obras estado estado--en-obras" aria-live="polite">' +
      '<span class="en-obras-eyebrow">' + esc(t('EN OBRAS')) + '</span>' +
      '<h1 class="en-obras-titulo">' + esc(op.nombre || t('Esta sección')) + '</h1>' +
      '<p class="en-obras-texto">' + esc(op.texto || t('Esta sección se está trayendo a la nueva base de AI Smart Content. Vuelve en unos días; el resto de la consola sigue funcionando.')) + '</p>' +
      '</section>';
  }

  /**
   * Engancha reintentar/acción UNA vez por zona (delegado: sobrevive a re-pintar
   * el estado dentro de la zona). Devuelve una función para soltarlo.
   */
  function enlazar(zona, tipo, fn) {
    if (!zona || typeof fn !== 'function') return () => {};
    const clave = 'estado' + tipo;
    if (zona[clave]) zona.removeEventListener('click', zona[clave]);
    const oyente = (e) => {
      const b = e.target && e.target.closest ? e.target.closest('[data-estado="' + tipo + '"]') : null;
      if (!b || !zona.contains(b)) return;
      if (tipo === 'reintentar') b.disabled = true;
      fn(e);
    };
    zona[clave] = oyente;
    zona.addEventListener('click', oyente);
    return () => { zona.removeEventListener('click', oyente); delete zona[clave]; };
  }

  /**
   * Pinta un estado en la zona (reemplaza lo que había). La vista no asigna HTML a mano:
   * el HTML sale de estas funciones, que ya escapan todo lo interpolado.
   */
  function pintar(zona, html) {
    if (!zona) return;
    // DOMParser deja los <script> INERTES (como asignar HTML al elemento). createContextualFragment
    // los ejecutaba al insertar (medido por -46 en Chrome, 24/09): no volver a usarlo.
    const doc = new DOMParser().parseFromString(String(html == null ? '' : html), 'text/html');
    zona.replaceChildren(...doc.body.childNodes);
  }

  window.Estado = {
    cargando, vacio, error, todaviaNo, enObras, pintar,
    alReintentar: (zona, fn) => enlazar(zona, 'reintentar', fn),
    alAccion: (zona, fn) => enlazar(zona, 'accion', fn),
  };
})();
