/**
 * UI Primitives — Button, Card, Input, Dialog, Dropdown, Tabs.
 *
 * Patrón: cada primitiva expone una función `.html(opts)` que devuelve string
 * HTML (usable dentro del `renderHTML()` de cualquier vista), y opcionalmente
 * un binder `.bind(rootEl)` para enganchar comportamiento.
 *
 * Reutilizan las clases del bundle.css (.btn, .card, .form-input, .glass). Si
 * agregás una nueva variante, agregá su CSS en bundle.css y documentalo aquí.
 *
 * Ejemplo de uso en una vista:
 *
 *   renderHTML() {
 *     return `
 *       ${UI.Card.html({
 *         title: 'Mi tarjeta',
 *         body: '<p>Contenido</p>',
 *         footer: UI.Button.html({ label: 'Guardar', variant: 'primary', id: 'saveBtn' })
 *       })}
 *     `;
 *   }
 *
 *   async init() {
 *     this.querySelector('#saveBtn').addEventListener('click', () => this.save());
 *   }
 *
 * Reglas:
 * - 100% de los botones del producto deberían ser UI.Button. Si una vista
 *   pinta `<button>` a mano, es un candidato a refactor.
 * - Nunca interpolar strings sin escapar: usar UI._esc.
 * - Las primitivas son stateless (excepto Tabs/Dropdown que tienen controllers).
 */
(function () {
  'use strict';

  const _esc = (s) => {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]
    ));
  };

  /** Atributos data-* desde un objeto plano. */
  const _dataAttrs = (obj) => {
    if (!obj) return '';
    return Object.entries(obj)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `data-${_esc(k)}="${_esc(v)}"`)
      .join(' ');
  };

  /** Junta clases ignorando falsy. */
  const _cls = (...parts) => parts.filter(Boolean).join(' ');

  // ─────────────────────────────────────────── Button

  const Button = {
    /**
     * @param {object} o
     * @param {string} [o.label]                — texto del botón
     * @param {string} [o.icon]                 — clase FA o Phosphor (ej. 'fas fa-plus')
     * @param {'primary'|'secondary'|'icon'} [o.variant='primary']
     * @param {'sm'|'md'|'lg'} [o.size='md']
     * @param {'button'|'submit'|'reset'} [o.type='button']
     * @param {boolean} [o.block]               — width: 100%
     * @param {boolean} [o.disabled]
     * @param {boolean} [o.loading]             — muestra spinner y deshabilita
     * @param {string} [o.id]
     * @param {string} [o.className]
     * @param {string} [o.href]                 — si está, renderiza <a>
     * @param {string} [o.ariaLabel]
     * @param {Object<string,string>} [o.dataset]
     */
    html(o = {}) {
      const {
        label = '', icon = null, variant = 'primary', size = 'md',
        type = 'button', block = false, disabled = false, loading = false,
        id = '', className = '', href = null, ariaLabel = null, dataset = null
      } = o;

      const tag = href ? 'a' : 'button';
      const isDisabled = disabled || loading;
      const cls = _cls(
        'btn',
        `btn-${variant}`,
        size === 'sm' ? 'btn-sm' : (size === 'lg' ? 'btn-lg' : ''),
        block ? 'btn-block' : '',
        loading ? 'is-loading' : '',
        className
      );

      const idAttr     = id ? `id="${_esc(id)}"` : '';
      const typeAttr   = tag === 'button' ? `type="${_esc(type)}"` : '';
      const hrefAttr   = href ? `href="${_esc(href)}"` : '';
      const ariaAttr   = ariaLabel ? `aria-label="${_esc(ariaLabel)}"` : '';
      const disAttr    = isDisabled ? (tag === 'button' ? 'disabled' : 'aria-disabled="true"') : '';
      const dataAttr   = _dataAttrs(dataset);
      const iconHtml   = loading
        ? '<i class="aisc-ico fa-spin aisc-ico--loader" aria-hidden="true"></i>'
        : (icon ? `<i class="${_esc(icon)}" aria-hidden="true"></i>` : '');
      const labelHtml  = label ? `<span class="btn-label">${_esc(label)}</span>` : '';

      return `<${tag} ${idAttr} class="${cls}" ${typeAttr} ${hrefAttr} ${ariaAttr} ${disAttr} ${dataAttr}>${iconHtml}${labelHtml}</${tag}>`;
    }
  };

  // ─────────────────────────────────────────── Card

  const Card = {
    /**
     * @param {object} o
     * @param {string} [o.title]
     * @param {string} [o.subtitle]
     * @param {string} [o.body]          — HTML
     * @param {string} [o.footer]        — HTML
     * @param {string} [o.actions]       — HTML (alineado a la derecha del header)
     * @param {boolean} [o.interactive]  — agrega .card-interactive (cursor pointer + hover)
     * @param {string} [o.className]
     * @param {string} [o.id]
     * @param {Object<string,string>} [o.dataset]
     */
    html(o = {}) {
      const {
        title, subtitle, body = '', footer, actions,
        interactive = false, className = '', id = '', dataset = null
      } = o;

      const cls = _cls('card', interactive ? 'card-interactive' : '', className);
      const idAttr = id ? `id="${_esc(id)}"` : '';
      const dataAttr = _dataAttrs(dataset);

      const headerHtml = (title || subtitle || actions) ? `
        <div class="card-header">
          <div class="card-header-text">
            ${title ? `<h3 class="card-title">${_esc(title)}</h3>` : ''}
            ${subtitle ? `<div class="card-subtitle">${_esc(subtitle)}</div>` : ''}
          </div>
          ${actions ? `<div class="card-actions">${actions}</div>` : ''}
        </div>` : '';

      const footerHtml = footer ? `<div class="card-footer">${footer}</div>` : '';

      return `<div ${idAttr} class="${cls}" ${dataAttr}>${headerHtml}<div class="card-body">${body}</div>${footerHtml}</div>`;
    }
  };

  // ─────────────────────────────────────────── Input (text/email/password/textarea/select)

  const Input = {
    /**
     * Input con label opcional, error y helper. Devuelve un .form-field completo.
     *
     * @param {object} o
     * @param {string} o.name
     * @param {'text'|'email'|'password'|'number'|'url'|'tel'|'textarea'|'select'} [o.type='text']
     * @param {string} [o.label]
     * @param {string} [o.value]
     * @param {string} [o.placeholder]
     * @param {string} [o.helper]
     * @param {string} [o.error]
     * @param {boolean} [o.required]
     * @param {boolean} [o.disabled]
     * @param {boolean} [o.readonly]
     * @param {boolean} [o.autofocus]
     * @param {string} [o.autocomplete]
     * @param {number} [o.rows=4]         — solo textarea
     * @param {Array<{value, label, selected?}>} [o.options]  — solo select
     * @param {string} [o.id]
     * @param {string} [o.className]
     */
    html(o = {}) {
      const {
        name, type = 'text', label, value = '', placeholder = '', helper, error,
        required = false, disabled = false, readonly = false, autofocus = false,
        autocomplete, rows = 4, options = [], id, className = ''
      } = o;
      if (!name) throw new Error('UI.Input.html: name es obligatorio');

      const inputId = id || `f-${name}-${Math.random().toString(36).slice(2, 7)}`;
      const labelHtml = label ? `<label for="${_esc(inputId)}" class="form-label">${_esc(label)}${required ? ' <span class="form-required">*</span>' : ''}</label>` : '';

      const baseAttrs = [
        `id="${_esc(inputId)}"`,
        `name="${_esc(name)}"`,
        required ? 'required' : '',
        disabled ? 'disabled' : '',
        readonly ? 'readonly' : '',
        autofocus ? 'autofocus' : '',
        autocomplete ? `autocomplete="${_esc(autocomplete)}"` : '',
        error ? 'aria-invalid="true"' : ''
      ].filter(Boolean).join(' ');

      let control;
      if (type === 'textarea') {
        control = `<textarea ${baseAttrs} class="form-textarea ${_esc(className)}" placeholder="${_esc(placeholder)}" rows="${_esc(rows)}">${_esc(value)}</textarea>`;
      } else if (type === 'select') {
        const opts = options.map((opt) => {
          const sel = (opt.selected || String(opt.value) === String(value)) ? 'selected' : '';
          return `<option value="${_esc(opt.value)}" ${sel}>${_esc(opt.label)}</option>`;
        }).join('');
        control = `<select ${baseAttrs} class="form-input ${_esc(className)}">${opts}</select>`;
      } else {
        control = `<input ${baseAttrs} type="${_esc(type)}" class="form-input ${_esc(className)}" value="${_esc(value)}" placeholder="${_esc(placeholder)}">`;
      }

      const helperHtml = error
        ? `<div class="form-error" role="alert">${_esc(error)}</div>`
        : (helper ? `<div class="form-helper">${_esc(helper)}</div>` : '');

      return `<div class="form-field${error ? ' form-field--error' : ''}">${labelHtml}${control}${helperHtml}</div>`;
    }
  };

  // ─────────────────────────────────────────── Dialog (wrapper sobre Modal)

  const Dialog = {
    /**
     * Abre un diálogo modal usando la primitiva existente window.Modal.
     * @param {object} opts — title, body (HTML|Element), footer (HTML), className, onClose
     * @returns {{ modal: HTMLElement, close: () => void } | null}
     */
    open(opts = {}) {
      if (!window.Modal || typeof window.Modal.show !== 'function') {
        console.error('UI.Dialog: window.Modal no está cargado');
        return null;
      }
      let body = opts.body || '';
      if (opts.footer) {
        const footerHtml = typeof opts.footer === 'string'
          ? opts.footer
          : (opts.footer instanceof HTMLElement ? opts.footer.outerHTML : '');
        if (typeof body === 'string') {
          body = body + `<div class="modal-footer">${footerHtml}</div>`;
        }
      }
      return window.Modal.show({
        title: opts.title,
        body,
        className: opts.className,
        portal: opts.portal !== false,
        parentEl: opts.parentEl,
        onClose: opts.onClose
      });
    },
    /** Helper común: confirmación con dos botones. Resuelve true/false. */
    confirm({ title = 'Confirmar', message = '', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', variant = 'primary' } = {}) {
      return new Promise((resolve) => {
        const body = `
          <p class="dialog-message">${_esc(message)}</p>
          <div class="modal-footer dialog-footer">
            ${Button.html({ label: cancelLabel, variant: 'secondary', id: '_dialogCancel' })}
            ${Button.html({ label: confirmLabel, variant, id: '_dialogConfirm' })}
          </div>
        `;
        const handle = window.Modal && window.Modal.show({
          title,
          body,
          onClose: () => resolve(false)
        });
        if (!handle) { resolve(false); return; }
        const wrap = handle.modal;
        wrap.querySelector('#_dialogConfirm')?.addEventListener('click', () => { resolve(true);  handle.close(); });
        wrap.querySelector('#_dialogCancel') ?.addEventListener('click', () => { resolve(false); handle.close(); });
      });
    }
  };

  // ─────────────────────────────────────────── Dropdown

  const Dropdown = {
    /**
     * @param {object} o
     * @param {string} o.id                     — id del wrapper (.ui-dropdown)
     * @param {string} o.trigger                — HTML del botón gatillo
     * @param {Array<{label, value?, icon?, danger?, separator?, disabled?}>} o.items
     * @param {'start'|'end'} [o.align='end']   — alineación del menú
     */
    html(o = {}) {
      const { id, trigger, items = [], align = 'end' } = o;
      if (!id || !trigger) throw new Error('UI.Dropdown.html: id y trigger son obligatorios');

      const itemsHtml = items.map((it) => {
        if (it.separator) return '<li class="ui-dropdown-separator" role="separator"></li>';
        const cls = _cls('ui-dropdown-item', it.danger ? 'ui-dropdown-item--danger' : '', it.disabled ? 'is-disabled' : '');
        const dis = it.disabled ? 'aria-disabled="true"' : '';
        const val = it.value != null ? `data-value="${_esc(it.value)}"` : '';
        const icon = it.icon ? `<i class="${_esc(it.icon)}" aria-hidden="true"></i>` : '';
        return `<li class="${cls}" role="menuitem" ${val} ${dis}>${icon}<span>${_esc(it.label)}</span></li>`;
      }).join('');

      return `
        <div class="ui-dropdown ui-dropdown--${_esc(align)}" id="${_esc(id)}" data-ui-dropdown>
          <div class="ui-dropdown-trigger" data-ui-dropdown-trigger aria-haspopup="menu" aria-expanded="false" tabindex="0">
            ${trigger}
          </div>
          <ul class="ui-dropdown-menu" role="menu" data-ui-dropdown-menu>${itemsHtml}</ul>
        </div>`;
    },
    /**
     * Conecta comportamiento: abrir/cerrar, ESC, click afuera, callback de selección.
     * @param {HTMLElement} rootEl  — elemento .ui-dropdown
     * @param {object} [opts]
     * @param {(value: string, item: HTMLElement) => void} [opts.onSelect]
     * @returns {() => void} dispose
     */
    bind(rootEl, opts = {}) {
      if (!rootEl) return () => {};
      const trigger = rootEl.querySelector('[data-ui-dropdown-trigger]');
      const menu    = rootEl.querySelector('[data-ui-dropdown-menu]');
      if (!trigger || !menu) return () => {};

      const open  = () => { rootEl.classList.add('is-open');  trigger.setAttribute('aria-expanded', 'true'); };
      const close = () => { rootEl.classList.remove('is-open'); trigger.setAttribute('aria-expanded', 'false'); };
      const toggle = (e) => {
        e.stopPropagation();
        rootEl.classList.contains('is-open') ? close() : open();
      };

      const onItemClick = (e) => {
        const item = e.target.closest('.ui-dropdown-item');
        if (!item || item.classList.contains('is-disabled')) return;
        const value = item.dataset.value || '';
        if (opts.onSelect) opts.onSelect(value, item);
        close();
      };
      const onDocClick = (e) => { if (!rootEl.contains(e.target)) close(); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };

      trigger.addEventListener('click', toggle);
      trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); }
      });
      menu.addEventListener('click', onItemClick);
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onKey);

      return () => {
        trigger.removeEventListener('click', toggle);
        menu.removeEventListener('click', onItemClick);
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKey);
      };
    }
  };

  // ─────────────────────────────────────────── Tabs

  const Tabs = {
    /**
     * @param {object} o
     * @param {string} o.id
     * @param {Array<{key, label, badge?, disabled?}>} o.tabs
     * @param {string} [o.active]   — key de la pestaña activa (default: primera)
     */
    html(o = {}) {
      const { id, tabs = [], active } = o;
      if (!id || tabs.length === 0) throw new Error('UI.Tabs.html: id y tabs son obligatorios');
      const activeKey = active || tabs[0].key;

      const buttons = tabs.map((t) => {
        const isActive = t.key === activeKey;
        const cls = _cls('ui-tab', isActive ? 'is-active' : '', t.disabled ? 'is-disabled' : '');
        const badge = (t.badge != null && t.badge !== '') ? `<span class="ui-tab-badge">${_esc(t.badge)}</span>` : '';
        const dis = t.disabled ? 'aria-disabled="true"' : '';
        return `<button type="button" role="tab" class="${cls}" data-ui-tab="${_esc(t.key)}" aria-selected="${isActive}" ${dis}><span>${_esc(t.label)}</span>${badge}</button>`;
      }).join('');

      return `
        <div class="ui-tabs" id="${_esc(id)}" data-ui-tabs role="tablist">
          ${buttons}
        </div>`;
    },
    /**
     * @param {HTMLElement} rootEl
     * @param {(key: string) => void} onChange
     * @returns {{ setActive: (key: string) => void, dispose: () => void }}
     */
    bind(rootEl, onChange) {
      if (!rootEl) return { setActive: () => {}, dispose: () => {} };

      const setActive = (key) => {
        rootEl.querySelectorAll('[data-ui-tab]').forEach((btn) => {
          const isActive = btn.dataset.uiTab === key;
          btn.classList.toggle('is-active', isActive);
          btn.setAttribute('aria-selected', String(isActive));
        });
      };

      const onClick = (e) => {
        const btn = e.target.closest('[data-ui-tab]');
        if (!btn || btn.classList.contains('is-disabled')) return;
        const key = btn.dataset.uiTab;
        setActive(key);
        if (typeof onChange === 'function') onChange(key);
      };

      rootEl.addEventListener('click', onClick);

      return {
        setActive,
        dispose: () => rootEl.removeEventListener('click', onClick)
      };
    }
  };

  // ─────────────────────────────────────────── Expose

  window.UI = { Button, Card, Input, Dialog, Dropdown, Tabs, _esc };
})();
