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

    const close = () => {
      modal.remove();
      document.removeEventListener('keydown', onKey);
      if (typeof onClose === 'function') onClose();
    };

    const onKey = (e) => { if (e.key === 'Escape') close(); };
    overlay.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    const target = portal
      ? (document.getElementById('modals-portal') || document.body)
      : (parentEl || document.body);
    target.appendChild(modal);

    return { modal, bodyEl, close };
  }

  window.Modal = { show };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.Modal;
})();
