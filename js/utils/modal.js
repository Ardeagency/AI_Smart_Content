/**
 * Modal — primitiva compartida para diálogos modales.
 *
 * Reemplaza los 3 patrones distintos de modal que existían (Navigation settings,
 * ColorEditor, DevLead inline) con una API mínima. Los consumidores existentes
 * migrarán en futuros rounds; nuevos modales deben usar esta primitiva.
 *
 * Uso:
 *   const { modal, close } = window.Modal.show({
 *     title: 'Editar color',
 *     body:  '<div>...</div>',       // HTML string o DOM Element
 *     className: 'color-editor',     // clase extra en .modal-content (opcional)
 *     portal: true,                  // true = #modals-portal (default), false = parentEl
 *     parentEl: someContainer,       // solo si portal = false
 *     onClose: () => { ... }         // callback opcional al cerrar
 *   });
 *
 *   // `modal` es el elemento raíz (.modal)
 *   // `close()` cierra y destruye
 *
 * @module Modal
 */
(function () {
  'use strict';

  function show({ title, body, className, portal = true, parentEl, onClose } = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const content = document.createElement('div');
    content.className = 'modal-content' + (className ? ` ${className}` : '');

    const header = document.createElement('div');
    header.className = 'modal-header';
    const h3 = document.createElement('h3');
    h3.textContent = title || '';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Cerrar');
    closeBtn.innerHTML = '&times;';
    header.appendChild(h3);
    header.appendChild(closeBtn);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'modal-body';
    if (typeof body === 'string') {
      bodyEl.innerHTML = body;
    } else if (body instanceof HTMLElement) {
      bodyEl.appendChild(body);
    }

    content.appendChild(header);
    content.appendChild(bodyEl);

    const modal = document.createElement('div');
    modal.className = 'modal modal-open';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.style.display = 'flex';
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

    const close = () => {
      modal.remove();
      document.removeEventListener('keydown', onKey);
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
        try { previousFocus.focus(); } catch (_) {}
      }
    };
    // Bandera setada justo despues del appendChild (ver mas abajo).
    let portalA11yRestored = false;

    const onKey = (e) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      // Focus trap: Tab cicla dentro del modal, Shift+Tab también.
      const items = focusables();
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && active === last) { first.focus(); e.preventDefault(); }
    };
    overlay.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    const target = portal
      ? (document.getElementById('modals-portal') || document.body)
      : (parentEl || document.body);
    target.appendChild(modal);

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
      try { target.focus(); } catch (_) {}
    }, 0);

    return { modal, bodyEl, close };
  }

  window.Modal = { show };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.Modal;
})();
