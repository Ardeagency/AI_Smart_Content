/**
 * DateRangePicker — selector de rango de fechas reutilizable.
 *
 * Rediseño v2 (estilo referencia): panel de 2 columnas —
 *   - Sidebar de presets (Hoy / Ayer / Últimos 7 días / … / Personalizado).
 *   - Columna principal: dos inputs MM/DD/YYYY (inicio → fin) con hint de
 *     formato + calendario de un mes (semana en domingo; etiquetas via __(),
 *     español como clave) con seleccion de rango.
 * Tema oscuro adaptado al dashboard, acento = --brand-primary.
 *
 * Scopeado por atributos data-drp (no ids) para permitir varias instancias.
 * Persiste entre re-renders (el mixin llama html() + mount() en cada render).
 *
 * Uso:
 *   const dp = new DateRangePicker({ from, to, onChange: ({from,to}) => {...} });
 *   container.innerHTML = `... ${dp.html()} ...`;
 *   dp.mount(container);
 */
class DateRangePicker {
  constructor(opts = {}) {
    this.from = opts.from ? new Date(opts.from) : null;
    this.to   = opts.to   ? new Date(opts.to)   : null;
    this.onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};
    this.allLabel = opts.allLabel || __('Todo el periodo');
    this.label = opts.label || __('Fecha');
    const base = this.to || this.from || new Date();
    this._month = base.getMonth();
    this._year  = base.getFullYear();
    this._root = null;
    this._docClick = null;
  }

  static get PRESETS() {
    return [
      { k: 'today',     label: __('Hoy') },
      { k: 'yesterday', label: __('Ayer') },
      { k: '7d',        label: __('Últimos 7 días') },
      { k: '30d',       label: __('Últimos 30 días') },
      { k: '2m',        label: __('Últimos 2 meses') },
      { k: '3m',        label: __('Últimos 3 meses') },
      { k: '6m',        label: __('Últimos 6 meses') },
      { k: '12m',       label: __('Últimos 12 meses') },
      { k: 'custom',    label: __('Personalizado') },
    ];
  }

  _midnight(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

  /** Rango {from,to} (Dates a medianoche) de un preset, o null para 'custom'. */
  _presetRange(k) {
    const today = this._midnight(new Date());
    const end = new Date(today);
    const start = new Date(today);
    switch (k) {
      case 'today':     return { from: new Date(today), to: new Date(today) };
      case 'yesterday': { const y = new Date(today); y.setDate(y.getDate() - 1); return { from: y, to: new Date(y) }; }
      case '7d':  start.setDate(start.getDate() - 6);  return { from: start, to: end };
      case '30d': start.setDate(start.getDate() - 29); return { from: start, to: end };
      case '2m':  start.setMonth(start.getMonth() - 2);  return { from: start, to: end };
      case '3m':  start.setMonth(start.getMonth() - 3);  return { from: start, to: end };
      case '6m':  start.setMonth(start.getMonth() - 6);  return { from: start, to: end };
      case '12m': start.setMonth(start.getMonth() - 12); return { from: start, to: end };
      default: return null;
    }
  }

  /** Preset activo segun el rango actual; 'custom' si ninguno coincide. */
  _activePreset() {
    if (!this.from || !this.to) return this.from || this.to ? 'custom' : 'custom';
    const f = this._midnight(this.from).getTime();
    const t = this._midnight(this.to).getTime();
    for (const p of DateRangePicker.PRESETS) {
      if (p.k === 'custom') continue;
      const r = this._presetRange(p.k);
      if (r && this._midnight(r.from).getTime() === f && this._midnight(r.to).getTime() === t) return p.k;
    }
    return 'custom';
  }

  _fmtInput(d) {
    if (!d) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}/${dd}/${d.getFullYear()}`;
  }
  _parseInput(str) {
    const m = String(str || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const mm = +m[1], dd = +m[2], yy = +m[3];
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const d = new Date(yy, mm - 1, dd);
    return (d.getMonth() === mm - 1 && d.getDate() === dd) ? d : null;
  }

  _triggerLabel() {
    if (!this.from && !this.to) return this.allLabel;
    if (this.from && this.to)   return `${this._fmtInput(this.from)} - ${this._fmtInput(this.to)}`;
    return this._fmtInput(this.from || this.to);
  }

  html() {
    const hasRange = !!(this.from || this.to);
    const presets = DateRangePicker.PRESETS
      .map((p) => `<button type="button" class="drp2-preset" data-drp-preset="${p.k}"><i class="aisc-ico drp2-preset-check aisc-ico--check" aria-hidden="true"></i><span>${p.label}</span></button>`)
      .join('');
    return `
      <div class="living-filter living-filter-date" data-drp>
        <label class="living-filter-label">${this.label}</label>
        <div class="living-date-trigger" data-drp-trigger role="button" tabindex="0" aria-haspopup="true" aria-expanded="false">
          <span class="living-date-value${hasRange ? ' has-range' : ''}" data-drp-value>${this._triggerLabel()}</span>
          <i class="aisc-ico living-date-icon aisc-ico--calendar" aria-hidden="true"></i>
        </div>
        <div class="living-date-dropdown drp2" data-drp-dropdown aria-hidden="true">
          <div class="drp2-presets" data-drp-presets>${presets}</div>
          <div class="drp2-main">
            <div class="drp2-inputs">
              <div class="drp2-input-wrap">
                <input type="text" class="drp2-input" data-drp-input="from" placeholder="MM/DD/YYYY" inputmode="numeric" autocomplete="off" spellcheck="false" />
                <div class="drp2-hint" aria-hidden="true"><b>MM</b> / DD / YYYY</div>
              </div>
              <i class="aisc-ico drp2-arrow aisc-ico--arrow-right" aria-hidden="true"></i>
              <div class="drp2-input-wrap">
                <input type="text" class="drp2-input" data-drp-input="to" placeholder="MM/DD/YYYY" inputmode="numeric" autocomplete="off" spellcheck="false" />
                <div class="drp2-hint" aria-hidden="true"><b>MM</b> / DD / YYYY</div>
              </div>
            </div>
            <div class="drp2-cal">
              <div class="drp2-nav">
                <button type="button" class="drp2-nav-btn" data-drp-prev aria-label="${__('Mes anterior')}"><i class="aisc-ico aisc-ico--chevron-left"></i></button>
                <span class="drp2-monthyear" data-drp-monthyear></span>
                <button type="button" class="drp2-nav-btn" data-drp-next aria-label="${__('Mes siguiente')}"><i class="aisc-ico aisc-ico--chevron-right"></i></button>
              </div>
              <div class="drp2-weekdays">
                <span>${__('Do')}</span><span>${__('Lu')}</span><span>${__('Ma')}</span><span>${__('Mi')}</span><span>${__('Ju')}</span><span>${__('Vi')}</span><span>${__('Sá')}</span>
              </div>
              <div class="living-date-grid drp2-grid" data-drp-grid></div>
              <div class="drp2-footer">
                <button type="button" class="drp2-clear" data-drp-clear>${__('Limpiar (todo el periodo)')}</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  mount(rootEl) {
    if (!rootEl) return;
    this.destroy();
    this._root = rootEl.matches && rootEl.matches('[data-drp]') ? rootEl : rootEl.querySelector('[data-drp]');
    if (!this._root) return;
    const q = (s) => this._root.querySelector(s);
    this._trigger     = q('[data-drp-trigger]');
    this._dropdown    = q('[data-drp-dropdown]');
    this._valueEl     = q('[data-drp-value]');
    this._gridEl      = q('[data-drp-grid]');
    this._monthYearEl = q('[data-drp-monthyear]');
    this._presetsEl   = q('[data-drp-presets]');
    this._inputFrom   = q('[data-drp-input="from"]');
    this._inputTo     = q('[data-drp-input="to"]');

    this._trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._dropdown?.classList.contains('is-open') ? this._close() : this._open();
    });
    q('[data-drp-prev]')?.addEventListener('click', (e) => { e.stopPropagation(); this._shiftMonth(-1); });
    q('[data-drp-next]')?.addEventListener('click', (e) => { e.stopPropagation(); this._shiftMonth(1); });
    q('[data-drp-clear]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.from = null; this.to = null;
      this._syncAll();
      this._close();
      this.onChange({ from: null, to: null });
    });
    this._gridEl?.addEventListener('click', (e) => this._onGridClick(e));

    // Presets.
    this._presetsEl?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-drp-preset]');
      if (!btn) return;
      e.stopPropagation();
      this._applyPreset(btn.dataset.drpPreset);
    });

    // Inputs MM/DD/YYYY: aplican al cambiar (Enter o blur).
    [this._inputFrom, this._inputTo].forEach((inp) => {
      if (!inp) return;
      inp.addEventListener('click', (e) => e.stopPropagation());
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this._commitInputs(); } });
      inp.addEventListener('change', () => this._commitInputs());
    });

    // Cierra al click afuera. El dropdown se porta a body (fuera de _root), asi
    // que hay que excluir explicitamente los clicks dentro del panel.
    this._docClick = (e) => {
      if (!this._root) return;
      if (this._root.contains(e.target)) return;
      if (this._dropdown && this._dropdown.contains(e.target)) return;
      this._close();
    };
    document.addEventListener('click', this._docClick);
  }

  destroy() {
    if (this._docClick) { document.removeEventListener('click', this._docClick); this._docClick = null; }
    if (this._reposition) {
      window.removeEventListener('scroll', this._reposition, true);
      window.removeEventListener('resize', this._reposition);
      this._reposition = null;
    }
    // Limpia un dropdown porteado de un mount/instancia previa (evita huerfanos en body).
    if (this._portalNode && this._portalNode.parentNode === document.body) {
      document.body.removeChild(this._portalNode);
    }
    this._portalNode = null;
  }

  _shiftMonth(delta) {
    this._month += delta;
    if (this._month < 0)  { this._month = 11; this._year--; }
    if (this._month > 11) { this._month = 0;  this._year++; }
    this._renderCalendar();
  }

  _applyPreset(k) {
    if (k === 'custom') { this._syncPresets(); return; } // custom: solo marca, deja elegir
    const r = this._presetRange(k);
    if (!r) return;
    this.from = r.from; this.to = r.to;
    this._month = this.to.getMonth(); this._year = this.to.getFullYear();
    this._syncAll();
    this._close();
    this.onChange({ from: this.from, to: this.to });
  }

  _commitInputs() {
    const f = this._parseInput(this._inputFrom?.value);
    const t = this._parseInput(this._inputTo?.value);
    if (!f && !t) return;
    if (f && t) {
      this.from = f <= t ? f : t;
      this.to   = f <= t ? t : f;
    } else {
      this.from = f || t; this.to = null;
    }
    const anchor = this.to || this.from;
    this._month = anchor.getMonth(); this._year = anchor.getFullYear();
    this._syncAll();
    if (this.from && this.to) this.onChange({ from: this.from, to: this.to });
  }

  _syncAll() { this._syncTrigger(); this._syncInputs(); this._syncPresets(); this._renderCalendar(); }

  _syncTrigger() {
    if (!this._valueEl) return;
    this._valueEl.textContent = this._triggerLabel();
    this._valueEl.classList.toggle('has-range', !!(this.from || this.to));
  }
  _syncInputs() {
    if (this._inputFrom) this._inputFrom.value = this._fmtInput(this.from);
    if (this._inputTo)   this._inputTo.value   = this._fmtInput(this.to);
  }
  _syncPresets() {
    if (!this._presetsEl) return;
    const active = this._activePreset();
    this._presetsEl.querySelectorAll('[data-drp-preset]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.drpPreset === active);
    });
  }

  _renderCalendar() {
    if (!this._gridEl || !this._monthYearEl) return;
    const monthNames = [__('Enero'), __('Febrero'), __('Marzo'), __('Abril'), __('Mayo'), __('Junio'), __('Julio'), __('Agosto'), __('Septiembre'), __('Octubre'), __('Noviembre'), __('Diciembre')];
    this._monthYearEl.textContent = `${monthNames[this._month]} ${this._year}`;
    const first = new Date(this._year, this._month, 1);
    const startPad = first.getDay(); // Domingo = 0
    const daysInMonth = new Date(this._year, this._month + 1, 0).getDate();
    const prevMonthDays = new Date(this._year, this._month, 0).getDate();
    const today = this._midnight(new Date()).getTime();
    const from = this.from ? this._midnight(this.from).getTime() : null;
    const to   = this.to   ? this._midnight(this.to).getTime()   : null;

    const cell = (cls, d, attrs) => `<span class="living-date-cell ${cls}"${attrs || ''}><span class="drp2-d">${d}</span></span>`;
    let html = '';
    for (let i = 0; i < startPad; i++) {
      const d = prevMonthDays - startPad + 1 + i;
      html += cell('other-month', d, ' data-other="1"');
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ts = new Date(this._year, this._month, d).getTime();
      let cls = '';
      if (ts === today) cls += ' today';
      if (from !== null && to !== null && ts >= from && ts <= to) {
        if (ts === from && ts === to) cls += ' range-start range-end range-single';
        else if (ts === from) cls += ' range-start';
        else if (ts === to)   cls += ' range-end';
        else                  cls += ' in-range';
      } else if (from !== null && to === null && ts === from) {
        cls += ' range-start range-single';
      }
      html += cell(cls.trim(), d, ` data-day="${d}" data-year="${this._year}" data-month="${this._month}"`);
    }
    const remainder = (startPad + daysInMonth) % 7;
    for (let n = 1; n <= (remainder ? 7 - remainder : 0); n++) {
      html += cell('other-month', n, ' data-other="1"');
    }
    this._gridEl.innerHTML = html;
  }

  _onGridClick(e) {
    const cell = e.target.closest('.living-date-cell');
    if (!cell || cell.classList.contains('other-month')) return;
    const date = new Date(
      parseInt(cell.getAttribute('data-year'), 10),
      parseInt(cell.getAttribute('data-month'), 10),
      parseInt(cell.getAttribute('data-day'), 10)
    );
    // Primer click (o reinicio) fija inicio; segundo click cierra el rango.
    if (this.from == null || (this.from != null && this.to != null)) {
      this.from = date; this.to = null;
      this._syncTrigger(); this._syncInputs(); this._syncPresets(); this._renderCalendar();
    } else {
      if (date < this.from) { this.to = new Date(this.from); this.from = date; }
      else { this.to = date; }
      this._syncTrigger(); this._syncInputs(); this._syncPresets(); this._renderCalendar();
      this._close();
      this.onChange({ from: this.from, to: this.to });
    }
  }

  _open() {
    if (!this._dropdown) return;
    // Portal a document.body: el dropdown es position:fixed pero vive dentro del
    // hero (isolation: isolate), que lo atrapa por debajo de las cards. Moverlo a
    // body lo saca de ese stacking context y su z-index pasa a ser global.
    if (this._dropdown.parentNode !== document.body) {
      document.body.appendChild(this._dropdown);
    }
    this._portalNode = this._dropdown;
    this._dropdown.classList.add('is-open');
    this._dropdown.setAttribute('aria-hidden', 'false');
    this._trigger?.setAttribute('aria-expanded', 'true');
    this._syncInputs(); this._syncPresets(); this._renderCalendar();
    this._position();
    // Reposiciona mientras esta abierto: sigue al trigger en scroll/resize y se
    // cierra si el trigger sale de la vista (cualquier contenedor scrolleable).
    this._reposition = () => {
      if (!this._trigger || !this._dropdown) return;
      const r = this._trigger.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.bottom < 0 || r.top > vh) { this._close(); return; }
      this._position();
    };
    window.addEventListener('scroll', this._reposition, true);
    window.addEventListener('resize', this._reposition);
  }

  /** Ancla el panel al trigger, clampeado al viewport, con flip arriba si no cabe. */
  _position() {
    if (!this._trigger || !this._dropdown) return;
    const rect = this._trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dw = this._dropdown.offsetWidth || 540;
    const dh = this._dropdown.offsetHeight || 360;
    const gap = 6;
    let left = rect.left;
    if (left + dw > vw - 12) left = Math.max(12, vw - dw - 12);
    // Por defecto abajo; si no cabe y arriba hay mas espacio, flip.
    let top = rect.bottom + gap;
    if (top + dh > vh - 12 && rect.top - gap - dh > 12) top = rect.top - gap - dh;
    top = Math.max(12, Math.min(top, vh - dh - 12));
    this._dropdown.style.left = left + 'px';
    this._dropdown.style.top  = top + 'px';
  }

  _close() {
    if (!this._dropdown) return;
    if (this._reposition) {
      window.removeEventListener('scroll', this._reposition, true);
      window.removeEventListener('resize', this._reposition);
      this._reposition = null;
    }
    this._dropdown.classList.remove('is-open');
    this._dropdown.setAttribute('aria-hidden', 'true');
    this._trigger?.setAttribute('aria-expanded', 'false');
    this._dropdown.style.left = ''; this._dropdown.style.top = '';
    // Saca el dropdown de body; el proximo render recrea su markup en el filtro.
    if (this._dropdown.parentNode === document.body) {
      document.body.removeChild(this._dropdown);
    }
    this._portalNode = null;
  }
}

window.DateRangePicker = DateRangePicker;
