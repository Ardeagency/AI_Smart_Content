/**
 * DateRangePicker — selector de rango de fechas (calendario) reutilizable.
 *
 * Reusa el markup y el CSS `living-date-*` del date picker de Production (ya
 * glass-black), pero scopeado por atributos data-drp (no ids) para permitir
 * varias instancias. Una instancia por tab del dashboard; persiste entre
 * re-renders (el mixin llama html() + mount() en cada render).
 *
 * Uso:
 *   const dp = new DateRangePicker({ from, to, onChange: ({from,to}) => {...} });
 *   container.innerHTML = `... ${dp.html()} ...`;
 *   dp.mount(container);   // bindea eventos sobre el DOM recien insertado
 */
class DateRangePicker {
  constructor(opts = {}) {
    this.from = opts.from ? new Date(opts.from) : null;
    this.to   = opts.to   ? new Date(opts.to)   : null;
    this.onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};
    this.allLabel = opts.allLabel || 'Todo el periodo';
    this.label = opts.label || 'Fecha';
    const base = this.to || this.from || new Date();
    this._month = base.getMonth();
    this._year  = base.getFullYear();
    this._root = null;
    this._docClick = null;
  }

  _fmt(d) { return d ? d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; }
  _triggerLabel() {
    if (!this.from && !this.to) return this.allLabel;
    if (this.from && this.to)   return `${this._fmt(this.from)} - ${this._fmt(this.to)}`;
    return this._fmt(this.from || this.to);
  }

  html() {
    const hasRange = !!(this.from || this.to);
    return `
      <div class="living-filter living-filter-date" data-drp>
        <label class="living-filter-label">${this.label}</label>
        <div class="living-date-trigger" data-drp-trigger role="button" tabindex="0" aria-haspopup="true" aria-expanded="false">
          <span class="living-date-value${hasRange ? ' has-range' : ''}" data-drp-value>${this._triggerLabel()}</span>
          <i class="fas fa-calendar-alt living-date-icon" aria-hidden="true"></i>
        </div>
        <div class="living-date-dropdown" data-drp-dropdown aria-hidden="true">
          <div class="living-date-nav">
            <button type="button" class="living-date-nav-btn" data-drp-prev aria-label="Mes anterior"><i class="fas fa-chevron-left"></i></button>
            <span class="living-date-month-year" data-drp-monthyear></span>
            <button type="button" class="living-date-nav-btn" data-drp-next aria-label="Mes siguiente"><i class="fas fa-chevron-right"></i></button>
          </div>
          <div class="living-date-weekdays">
            <span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span>
          </div>
          <div class="living-date-grid" data-drp-grid></div>
          <div class="living-date-actions">
            <button type="button" class="living-date-clear" data-drp-clear>Limpiar</button>
          </div>
        </div>
      </div>`;
  }

  mount(rootEl) {
    if (!rootEl) return;
    this.destroy(); // limpia listener de documento de un mount previo
    this._root = rootEl.matches && rootEl.matches('[data-drp]') ? rootEl : rootEl.querySelector('[data-drp]');
    if (!this._root) return;
    const q = (s) => this._root.querySelector(s);
    this._trigger     = q('[data-drp-trigger]');
    this._dropdown    = q('[data-drp-dropdown]');
    this._valueEl     = q('[data-drp-value]');
    this._gridEl      = q('[data-drp-grid]');
    this._monthYearEl = q('[data-drp-monthyear]');

    this._trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._dropdown?.classList.contains('is-open') ? this._close() : this._open();
    });
    q('[data-drp-prev]')?.addEventListener('click', (e) => { e.stopPropagation(); this._shiftMonth(-1); });
    q('[data-drp-next]')?.addEventListener('click', (e) => { e.stopPropagation(); this._shiftMonth(1); });
    q('[data-drp-clear]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.from = null; this.to = null;
      this._syncTrigger(); this._renderCalendar();
      this._close();
      this.onChange({ from: null, to: null });
    });
    this._gridEl?.addEventListener('click', (e) => this._onGridClick(e));

    // Cerrar al hacer click fuera.
    this._docClick = (e) => { if (this._root && !this._root.contains(e.target)) this._close(); };
    document.addEventListener('click', this._docClick);
  }

  destroy() {
    if (this._docClick) { document.removeEventListener('click', this._docClick); this._docClick = null; }
  }

  _shiftMonth(delta) {
    this._month += delta;
    if (this._month < 0)  { this._month = 11; this._year--; }
    if (this._month > 11) { this._month = 0;  this._year++; }
    this._renderCalendar();
  }

  _syncTrigger() {
    if (!this._valueEl) return;
    this._valueEl.textContent = this._triggerLabel();
    this._valueEl.classList.toggle('has-range', !!(this.from || this.to));
  }

  _renderCalendar() {
    if (!this._gridEl || !this._monthYearEl) return;
    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    this._monthYearEl.textContent = `${monthNames[this._month]} ${this._year}`;
    const first = new Date(this._year, this._month, 1);
    const startPad = (first.getDay() + 6) % 7; // Lunes = 0
    const daysInMonth = new Date(this._year, this._month + 1, 0).getDate();
    const prevMonthDays = new Date(this._year, this._month, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const from = this.from ? new Date(this.from).setHours(0, 0, 0, 0) : null;
    const to   = this.to   ? new Date(this.to).setHours(0, 0, 0, 0)   : null;

    let html = '';
    for (let i = 0; i < startPad; i++) {
      const d = prevMonthDays - startPad + 1 + i;
      html += `<span class="living-date-cell other-month" data-day="${d}" data-other="1">${d}</span>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ts = new Date(this._year, this._month, d).getTime();
      let cls = 'living-date-cell';
      if (ts === today.getTime()) cls += ' today';
      if (from !== null && to !== null && ts >= from && ts <= to) {
        if (ts === from) cls += ' range-start';
        else if (ts === to) cls += ' range-end';
        else cls += ' in-range';
      } else if (from !== null && to === null && ts === from) {
        cls += ' range-start';
      }
      html += `<span class="${cls}" data-day="${d}" data-year="${this._year}" data-month="${this._month}">${d}</span>`;
    }
    const remainder = (startPad + daysInMonth) % 7;
    for (let n = 1; n <= (remainder ? 7 - remainder : 0); n++) {
      html += `<span class="living-date-cell other-month" data-day="${n}" data-other="1">${n}</span>`;
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
    // Primer click (o reinicio) fija el inicio; segundo click cierra el rango.
    if (this.from == null || (this.from != null && this.to != null)) {
      this.from = date; this.to = null;
      this._syncTrigger(); this._renderCalendar();
    } else {
      if (date < this.from) { this.to = new Date(this.from); this.from = date; }
      else { this.to = date; }
      this._syncTrigger(); this._renderCalendar();
      this._close();
      this.onChange({ from: this.from, to: this.to });
    }
  }

  _open() {
    if (this._trigger && this._dropdown) {
      const rect = this._trigger.getBoundingClientRect();
      this._dropdown.style.left = rect.left + 'px';
      this._dropdown.style.top  = (rect.bottom + 4) + 'px';
    }
    this._dropdown?.classList.add('is-open');
    this._dropdown?.setAttribute('aria-hidden', 'false');
    this._trigger?.setAttribute('aria-expanded', 'true');
    this._renderCalendar();
  }

  _close() {
    this._dropdown?.classList.remove('is-open');
    this._dropdown?.setAttribute('aria-hidden', 'true');
    this._trigger?.setAttribute('aria-expanded', 'false');
    if (this._dropdown) { this._dropdown.style.left = ''; this._dropdown.style.top = ''; }
  }
}

window.DateRangePicker = DateRangePicker;
