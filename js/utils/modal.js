/**
 * Modal — LA forma principal de la consola (ADN v2, 15/09/2026).
 *
 * JC fijó tres modales y una sola piel: PRINCIPAL (esta: ← Volver · título · × ·
 * cuerpo · pie, 880 centrado; la de «Adjuntar producto»), EDITORIAL (detalle de
 * flujo: se queda como está) y EDICIÓN (producción: se queda como está). Todo lo
 * demás —Ajustes, Monitoreado, equipo, org, confirmaciones…— pasa por aquí.
 * La piel vive en css/bundle.css (.modal-*); NO se redefine por familia.
 *
 * Uso:
 *   const { modal, bodyEl, close, setTitle, setBack } = window.Modal.show({
 *     title: 'Adjuntar producto',
 *     body:  '<div>...</div>',       // HTML string o DOM Element
 *     intro: 'Elegí cómo…',          // párrafo bajo la cabecera (opcional)
 *     footer: '<button…>' | Element, // pie con acciones (opcional)
 *     onBack: () => { ... },         // muestra «← Volver» a la izquierda del título (opcional)
 *     backLabel: 'Volver',           // rótulo del botón (opcional)
 *     size: 'sm' | 'md' | 'lg',      // 480 / 640 / 880 (default lg)
 *     className: 'color-editor',     // clase extra en .modal-content (opcional)
 *     portal: true,                  // true = #modals-portal (default), false = parentEl
 *     parentEl: someContainer,       // solo si portal = false
 *     onClose: () => { ... }         // callback opcional al cerrar
 *   });
 *
 *   // `modal` es el elemento raíz (.modal) · `close()` cierra y destruye
 *   // `setTitle(texto, iconClass?)` y `setBack(fn|null)` sirven a los wizards por pasos.
 *
 * @module Modal
 */
(function () {
  'use strict';

  const t = (s) => (typeof window.__ === 'function' ? window.__(s) : s);

  function show({ title, body, intro, footer, onBack, backLabel, size, className, portal = true, parentEl, onClose } = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const content = document.createElement('div');
    content.className = 'modal-content' + (size ? ` modal-content--${size}` : '') + (className ? ` ${className}` : '');

    const header = document.createElement('div');
    header.className = 'modal-header';
    const headerLeft = document.createElement('div');
    headerLeft.className = 'modal-header-left';
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'modal-back';
    backBtn.hidden = true;
    backBtn.innerHTML = `<i class="aisc-ico aisc-ico--arrow-left" aria-hidden="true"></i><span>${t(backLabel || 'Volver')}</span>`;
    const h3 = document.createElement('h3');
    h3.id = 'modal-title-' + Math.random().toString(36).slice(2, 8);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'modal-close';
    closeBtn.setAttribute('aria-label', t('Cerrar'));
    closeBtn.innerHTML = '&times;';
    headerLeft.appendChild(backBtn);
    headerLeft.appendChild(h3);
    header.appendChild(headerLeft);
    header.appendChild(closeBtn);

    let backHandler = null;
    const setBack = (fn) => {
      if (backHandler) backBtn.removeEventListener('click', backHandler);
      backHandler = typeof fn === 'function' ? fn : null;
      if (backHandler) backBtn.addEventListener('click', backHandler);
      backBtn.hidden = !backHandler;
    };
    const setTitle = (texto, iconClass) => {
      h3.textContent = '';
      if (iconClass) {
        const i = document.createElement('i'); i.className = iconClass; i.setAttribute('aria-hidden', 'true');
        h3.appendChild(i);
      }
      h3.appendChild(document.createTextNode(texto || ''));
    };
    setTitle(title || '');
    setBack(onBack);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'modal-body';
    if (intro) {
      const p = document.createElement('p');
      p.className = 'modal-intro';
      p.textContent = intro;
      bodyEl.appendChild(p);
    }
    if (typeof body === 'string') {
      bodyEl.insertAdjacentHTML('beforeend', body);
    } else if (body instanceof HTMLElement) {
      bodyEl.appendChild(body);
    }

    content.appendChild(header);
    content.appendChild(bodyEl);

    let footerEl = null;
    if (footer) {
      footerEl = document.createElement('div');
      footerEl.className = 'modal-footer';
      if (typeof footer === 'string') footerEl.innerHTML = footer;
      else if (footer instanceof HTMLElement) footerEl.appendChild(footer);
      content.appendChild(footerEl);
    }

    // Anfitrión = <dialog> nativo (L4, 24/09): showModal() lo sube a la capa
    // superior del navegador (sin guerra de z-index), deja inerte el resto de la
    // página, atrapa el foco y Esc cierra SOLO el de arriba (antes un keydown en
    // document cerraba todos los apilados a la vez). El DOM de adentro no cambia
    // (.modal-overlay/.modal-content/.modal-header…): la piel y el CSS de cada
    // familia (className) siguen aplicando igual. Mismo contrato que Capas.
    const modal = document.createElement('dialog');
    modal.className = 'modal modal-open';
    modal.setAttribute('aria-labelledby', h3.id);
    modal.appendChild(overlay);
    modal.appendChild(content);

    // A11y: guardar quién tenía el foco para devolvérselo al cerrar.
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]),' +
                      'input:not([disabled]):not([type="hidden"]), select:not([disabled]),' +
                      '[tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
    const focusables = () => Array.from(content.querySelectorAll(FOCUSABLE))
      .filter((el) => !el.hasAttribute('inert') && el.offsetParent !== null);

    let cerrado = false;
    const close = () => {
      if (cerrado) return;
      cerrado = true;
      if (modal.open) modal.close();
      modal.remove();
      // A11y: si activamos el portal antes (aria-hidden false) y ya no quedan
      // modales montados ahi, restauramos aria-hidden="true".
      if (portalA11yRestored) {
        const portalEl = document.getElementById('modals-portal');
        if (portalEl && portalEl.children.length === 0) {
          portalEl.setAttribute('aria-hidden', 'true');
        }
      }
      if (typeof onClose === 'function') onClose();
      // Devolver foco al disparador (botón que abrió el modal, link, etc.).
      // Si el elemento ya no está en el DOM, dejar el foco donde caiga natural.
      if (previousFocus && document.contains(previousFocus)) {
        try { previousFocus.focus(); } catch (_) { /* el foco previo ya no existe */ }
      }
    };
    // Bandera setada justo despues del appendChild (ver mas abajo).
    let portalA11yRestored = false;

    // Esc: el navegador dispara `cancel` solo en el dialog de arriba. Se toma para
    // cerrar por close() (onClose, devolver el foco, sacarlo del DOM).
    modal.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    overlay.addEventListener('click', close);
    closeBtn.addEventListener('click', close);

    const target = portal
      ? (document.getElementById('modals-portal') || document.body)
      : (parentEl || document.body);
    target.appendChild(modal);
    modal.showModal();

    // A11y: si el target es #modals-portal y tenia aria-hidden="true" por defecto,
    // lo desactivamos mientras este modal viva. Sin esto el navegador bloquea
    // el foco dentro del modal porque el ancestro esta marcado como oculto.
    if (target && target.id === 'modals-portal' && target.getAttribute('aria-hidden') === 'true') {
      target.setAttribute('aria-hidden', 'false');
      portalA11yRestored = true;
    }

    // Foco inicial: primer focusable del body, o el botón de cerrar como
    // fallback. Espera un microtick para que el navegador termine el layout
    // y el elemento ya esté visible (offsetParent != null).
    setTimeout(() => {
      const items = focusables();
      const target = items.find((el) => el !== closeBtn) || items[0] || closeBtn;
      try { target.focus(); } catch (_) { /* el elemento no admite foco */ }
    }, 0);

    return { modal, bodyEl, footerEl, close, setTitle, setBack };
  }

  window.Modal = { show };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.Modal;
})();
