/**
 * EL EDITOR DE PROMPT — texto libre con variables como piezas enteras.
 *
 * Portado del Studio de accounts-arde (`components/PromptEditor.tsx`) a la SPA
 * sin framework de AI Smart Content.
 *
 * Se escribe normal. Pero al tocar una opción del panel, la variable entra AHÍ,
 * donde esté el cursor, encerrada en [] y resaltada; al pasar el mouse muestra
 * la frase que le va a llegar al modelo. Y se borra de un backspace, entera:
 * nadie quiere borrar "[Lente: 85mm (Portrait)]" letra por letra.
 *
 * POR QUÉ NO ES UN <textarea>: un textarea es texto plano — no admite que un
 * trozo tenga color, tooltip ni se comporte como una pieza.
 *
 * La clave del truco es `contenteditable="false"` sobre el chip dentro de un
 * contenedor editable: el navegador lo trata como un átomo y una sola pulsación
 * se lo lleva completo.
 *
 * EL DOM MANDA. El editor no se re-renderiza en cada tecla —eso le tira el
 * cursor al inicio, un bug clásico y desquiciante—: solo se escribe cuando se
 * inserta una variable o cuando el dueño lo vacía a propósito. El resto del
 * tiempo se lee.
 */
(function () {
  'use strict';

  /** La etiqueta de un chip ya escrito, para saber si otro lo reemplaza. */
  function etiquetaDe(el) {
    const m = /^\[([^[\]:]+):/.exec(el.dataset.var || '');
    return m ? m[1].trim().toLowerCase() : null;
  }

  /** Su valor, para poder quitar UNO y no todos los de esa etiqueta. */
  function valorDe(el) {
    const m = /^\[[^[\]:]+:\s*([^[\]]+)\]$/.exec(el.dataset.var || '');
    return m ? m[1].trim() : null;
  }

  class PromptEditor {
    /**
     * @param {HTMLElement} host  contenedor donde se monta (se vacía)
     * @param {object} opts
     * @param {string} [opts.placeholder]
     * @param {() => void} [opts.onEnviar]     Enter sin shift
     * @param {(texto: string) => void} [opts.onCambio]
     * @param {string} [opts.ariaLabel]
     */
    constructor(host, opts = {}) {
      this.host = host;
      this.onCambio = typeof opts.onCambio === 'function' ? opts.onCambio : () => {};
      this.onEnviar = typeof opts.onEnviar === 'function' ? opts.onEnviar : () => {};
      // El último rango conocido: al tocar un tile del panel, el foco ya salió
      // del editor y `getSelection()` ya no apunta adentro. Sin esto, toda
      // variable caería al final en vez de donde estaba el cursor.
      this._rango = null;

      host.innerHTML = '';
      host.classList.add('prompt-editor');

      this.placeholderEl = document.createElement('span');
      this.placeholderEl.className = 'prompt-editor__placeholder';
      this.placeholderEl.textContent = opts.placeholder || '';
      host.appendChild(this.placeholderEl);

      const campo = document.createElement('div');
      campo.className = 'prompt-editor__campo';
      campo.contentEditable = 'true';
      campo.setAttribute('role', 'textbox');
      campo.setAttribute('aria-multiline', 'true');
      campo.setAttribute('aria-label', opts.ariaLabel || opts.placeholder || 'Prompt');
      host.appendChild(campo);
      this.campo = campo;

      this._recordar = () => this._recordarRango();
      campo.addEventListener('input', () => {
        this._recordarRango();
        this._emitir();
      });
      campo.addEventListener('keyup', this._recordar);
      campo.addEventListener('mouseup', this._recordar);
      campo.addEventListener('blur', this._recordar);
      campo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.onEnviar();
        }
      });
      campo.addEventListener('paste', (e) => {
        // Pegar trae HTML ajeno —colores, fuentes, tablas enteras— y lo metería
        // tal cual en el prompt. Solo texto.
        e.preventDefault();
        const t = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, t);
      });

      this._pintarPlaceholder();
    }

    // ── lectura ───────────────────────────────────────────────────────────

    /** Reconstruye el texto: los chips vuelven a su forma `[Etiqueta: Valor]`. */
    get valor() {
      let out = '';
      this.campo.childNodes.forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE) out += n.textContent || '';
        else if (n instanceof HTMLElement) {
          if (n.dataset.var) out += n.dataset.var;
          else if (n.tagName === 'BR') out += '\n';
          else out += n.textContent || '';
        }
      });
      return out;
    }

    /** El texto sin ninguna variable: sirve para saber si el brief está vacío. */
    get textoLibre() {
      return this.valor.replace(window.StudioDireccion.reVariable(), '').trim();
    }

    focus() {
      this.campo.focus();
    }

    // ── escritura ─────────────────────────────────────────────────────────

    /**
     * @param {{etiqueta:string, valor:string, prompt:string}[]} vs
     * @param {object} [opts]
     * @param {boolean} [opts.unica]   el nuevo chip REEMPLAZA al que hubiera con
     *   su misma etiqueta. Hace falta donde dos valores no se suman sino que se
     *   contradicen: `[Lente: 50mm]` junto a `[Lente: 85mm]` es una orden
     *   imposible y el modelo obedecería a uno sin decir cuál. Dos luces o dos
     *   texturas sí conviven — de ahí que no sea el comportamiento por defecto.
     * @param {string[]} [opts.limpiar] otras etiquetas que este chip desplaza.
     */
    insertar(vs, opts = {}) {
      const lista = Array.isArray(vs) ? vs.filter(Boolean) : [];
      if (!lista.length) return;

      // Campo único: fuera el chip anterior de esa etiqueta ANTES de colocar el
      // nuevo, o el rango guardado apuntaría a un nodo que se va a borrar.
      if (opts.unica || (opts.limpiar && opts.limpiar.length)) {
        const etiquetas = new Set((opts.limpiar || []).map((e) => String(e).trim().toLowerCase()));
        if (opts.unica) lista.forEach((v) => etiquetas.add(String(v.etiqueta).trim().toLowerCase()));
        this._borrar(etiquetas);
      }

      let r = this._rango;
      // Sin cursor previo (nunca escribió), va al final.
      if (!r || !this.campo.contains(r.commonAncestorContainer)) {
        r = document.createRange();
        r.selectNodeContents(this.campo);
        r.collapse(false);
      }
      r.deleteContents();

      // Se inserta al revés porque cada pieza entra JUSTO donde arranca el
      // rango: metiéndolas en orden quedarían invertidas.
      const piezas = [];
      lista.forEach((v, i) => {
        if (i > 0) piezas.push(document.createTextNode(' '));
        piezas.push(this._crearChip(v));
      });
      piezas.push(document.createTextNode(' '));
      const alReves = piezas.slice().reverse();
      for (const p of alReves) r.insertNode(p);

      // El cursor queda DESPUÉS de lo insertado, listo para seguir escribiendo.
      const sel = window.getSelection();
      const fin = document.createRange();
      fin.setStartAfter(piezas[piezas.length - 1]);
      fin.collapse(true);
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(fin);
      }
      this._rango = fin.cloneRange();
      this.campo.focus();
      this._emitir();
    }

    /** Quita los chips de esa etiqueta (o solo el de ese valor). */
    quitar(etiqueta, valor) {
      if (this._borrar(new Set([String(etiqueta).trim().toLowerCase()]), valor)) this._emitir();
    }

    /**
     * Reemplaza el contenido por texto plano, sin chips. Lo usa el forjador: lo
     * que vuelve de OpenAI es prosa, y dejar los chips al lado haría creer que
     * la dirección sigue viva como variable cuando ya está redactada dentro.
     */
    escribirTexto(texto) {
      this.campo.textContent = String(texto == null ? '' : texto);
      // El cursor al final, listo para retocar la redacción.
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents(this.campo);
      r.collapse(false);
      if (sel) { sel.removeAllRanges(); sel.addRange(r); }
      this._rango = r.cloneRange();
      this._emitir();
    }

    /** Vacía el editor. Es el único caso en que el dueño manda sobre el DOM. */
    limpiar() {
      this.campo.innerHTML = '';
      this._rango = null;
      this._emitir();
    }

    destroy() {
      this.campo.removeEventListener('keyup', this._recordar);
      this.campo.removeEventListener('mouseup', this._recordar);
      this.campo.removeEventListener('blur', this._recordar);
    }

    // ── interno ───────────────────────────────────────────────────────────

    _crearChip(v) {
      const el = document.createElement('span');
      el.contentEditable = 'false';
      el.dataset.var = `[${v.etiqueta}: ${v.valor}]`;
      // El hover: el nombre está en el chip, la frase completa aquí.
      el.title = v.prompt || `${v.etiqueta}: ${v.valor}`;
      el.className = 'prompt-chip';
      el.textContent = `[${v.valor}]`;
      return el;
    }

    /**
     * Saca del texto los chips de esas etiquetas. Se lleva también el espacio
     * que los seguía, para no ir dejando huecos cada vez que se cambia de
     * opinión. Devuelve cuántos quitó.
     */
    _borrar(etiquetas, valor) {
      if (!etiquetas || !etiquetas.size) return 0;
      let n = 0;
      this.campo.querySelectorAll('[data-var]').forEach((el) => {
        const et = etiquetaDe(el);
        if (!et || !etiquetas.has(et)) return;
        if (valor !== undefined && valorDe(el) !== String(valor).trim()) return;
        const sig = el.nextSibling;
        if (sig && sig.nodeType === Node.TEXT_NODE && sig.textContent === ' ') {
          sig.parentNode.removeChild(sig);
        }
        el.remove();
        n += 1;
      });
      return n;
    }

    _recordarRango() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0);
      if (this.campo.contains(r.commonAncestorContainer)) this._rango = r.cloneRange();
    }

    _pintarPlaceholder() {
      // Se mide sobre el TEXTO reconstruido, no sobre childNodes: al borrar
      // todo, contenteditable deja un `<br>` suelto — con childNodes el campo
      // parecería lleno y el placeholder no volvería nunca.
      const vacio = this.valor.trim() === '';
      this.placeholderEl.style.display = vacio ? '' : 'none';
    }

    _emitir() {
      this._pintarPlaceholder();
      this.onCambio(this.valor);
    }
  }

  window.PromptEditor = PromptEditor;
})();
