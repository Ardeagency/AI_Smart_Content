/**
 * DashboardView — Tendencies mixin (pestaña «Tendencias»).
 *
 * La ruta viva de v1 (8520ff8a^): la columna izquierda abre con la Intuición sobre el mercado
 * (Vera4.mixin, _renderIntuicionDelTab) y sigue con los OCÉANOS AZULES; a la derecha, el
 * calendario de PRÓXIMAS FECHAS; debajo, la rejilla de cards.vera4 del mercado. El resto del
 * Tendencias de v1 (pulso del nicho, señales emergentes, marcas emergentes, sincronización con el
 * mundo) llevaba muerto desde julio y no se porta.
 *
 * Datos (DashboardDatos):
 *   · oceanos(org)         → intel.content_gaps sin atender (existe hoy).
 *   · fechasProximas(org)  → intel.fechas_proximas (P3, 20260925172000). Sin la vista, la card del
 *                            calendario sale en su sitio con «todavía no». El veredicto
 *                            Utilizar/Descartar solo se pinta si Vera lo puso: nunca uno inventado.
 * Descartar un océano: la base todavía no guarda la decisión (content_gaps no tiene columna y solo
 * escribe el sistema), así que se descarta para esta persona en este navegador. «Trabajarlo» abre
 * Vera con el brief cargado (/vera?q=…).
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  // Se traducen al pintar (__(MONTHS[i]) / __(DOW_LONG[i])); las claves, para el extractor:
  // i18n-keep: __('enero') __('febrero') __('marzo') __('abril') __('mayo') __('junio') __('julio') __('agosto') __('septiembre') __('octubre') __('noviembre') __('diciembre')
  // i18n-keep: __('lunes') __('martes') __('miércoles') __('jueves') __('viernes') __('sábado') __('domingo')
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const DOW_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

  Object.assign(DashboardView.prototype, {

    /* ── El shell de la pestaña: océanos a la izquierda, calendario a la derecha. ── */
    async _renderTendFechasOnly(body) {
      if (!body || !window.DashboardDatos || !this._orgId) return;
      const [oc, fe] = await Promise.all([
        window.DashboardDatos.oceanos(this._orgId),
        window.DashboardDatos.fechasProximas(this._orgId),
      ]);
      if (!body.isConnected || !this._sigue('tendencies')) return;
      const oceanos = this._buildTendOceanosHtml(oc);
      const card = this._buildTendFechasCard(fe);
      this._pintar(body, `
        <div class="insight-page mb-dash" id="tendPage">
          <div class="mb-layout">
            <div class="tend-main">${oceanos}</div>
            <aside class="mb-layout-aside tend-aside">${card}</aside>
          </div>
        </div>`);
      this._bindTendCalendar(body);
      this._bindTendOceanos(body);
    },

    /* ══ Océanos azules ═════════════════════════════════════════════════════
       Un océano azul = el mercado BUSCA algo que ni la marca ni su competencia cubren. Aquí se
       muestran los que siguen abiertos: la X lo descarta, el ✳ lo trabaja con Vera. ══════════ */
    _tendOcKey() { return `tend:oceanos:descartados:${this._orgId || 'global'}`; },

    _tendOcDescartados() {
      try { return new Set(JSON.parse(localStorage.getItem(this._tendOcKey()) || '[]')); } catch (e) { console.warn('[Tendencies] descartes:', e && e.message); return new Set(); }
    },

    _buildTendOceanosHtml(r) {
      const esc = (s) => this._esc(s);
      const titulo = `
          <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--compass" aria-hidden="true"></i>${esc(__('Océanos azules'))}</span>
          <p class="bgrid-card-sub">${esc(__('Lo que tu nicho busca y aún nadie responde · territorio abierto para tu marca'))}</p>`;
      const fuera = this._tendOcDescartados();
      const oceans = (r && !r.falta && Array.isArray(r.datos) ? r.datos : []).filter((o) => !fuera.has(String(o.id)));
      this._tendOceanos = oceans;
      if (!oceans.length) {
        const texto = this._faltaTexto(r, fuera.size
          ? __('Descartaste los que había. Aparecen nuevos cuando Vera detecte otro hueco en tu nicho.')
          : __('Aparece cuando Vera detecte lo que tu nicho busca y nadie responde.'));
        return `<section class="cgrid-card--aud tend-oceanos" id="tendOceanosCard">${titulo}${this._todaviaNo(__('Océanos azules'), texto)}</section>`;
      }
      const intentLabel = { alta: __('Alta demanda'), media: __('Demanda media'), baja: __('Demanda baja') };
      const fichas = oceans.map((o) => {
        const terms = Array.isArray(o.demand_terms) ? o.demand_terms.slice(0, 3) : [];
        const chips = terms.map((t) => `<span class="tend-oc-chip">${esc(String(t))}</span>`).join('');
        const intent = intentLabel[o.intent] ? o.intent : 'media';
        return `
          <article class="cga-item tend-oc" data-oc-id="${esc(o.id)}">
            <div class="cga-top">
              <span class="tend-oc-intent tend-oc-intent--${esc(intent)}">${esc(intentLabel[intent])}</span>
              <h4 class="cga-quien">${esc(o.gap_phrase)}</h4>
              ${o.angle ? `<span class="tend-oc-angle">${esc(o.angle)}</span>` : ''}
              ${chips ? `<div class="tend-oc-chips">${chips}</div>` : ''}
            </div>
            <div class="cga-foot">
              <span class="cga-hint">${esc(__('el mercado lo busca · nadie lo cubre'))}</span>
              <span class="tend-oc-acts">
                <button type="button" class="cga-add tend-oc-no" data-oc-act="dismissed"
                        title="${esc(__('No me interesa'))}" aria-label="${esc(__('Descartar océano'))}">
                  <i class="aisc-ico aisc-ico--close" aria-hidden="true"></i>
                </button>
                <button type="button" class="cga-add tend-oc-do" data-oc-act="work"
                        title="${esc(__('Trabajarlo con Vera'))}" aria-label="${esc(__('Trabajar este océano con Vera'))}">
                  <i class="aisc-ico aisc-ico--sparkle" aria-hidden="true"></i>
                </button>
              </span>
            </div>
          </article>`;
      }).join('');
      return `<section class="cgrid-card--aud tend-oceanos" id="tendOceanosCard">${titulo}<div class="cgrid-aud" id="tendOceanosList">${fichas}</div></section>`;
    },

    _bindTendOceanos(root) {
      const card = root?.querySelector?.('#tendOceanosCard');
      if (!card) return;
      card.querySelectorAll('.tend-oc').forEach((el) => this._vestirPanelDeMarca?.(el));
      if (card._tendOcBound) return;
      card._tendOcBound = true;
      card.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-oc-act]');
        if (!btn) return;
        const item = btn.closest('.tend-oc');
        const id = item?.dataset.ocId;
        if (!id || btn.disabled) return;
        const oc = (this._tendOceanos || []).find((o) => String(o.id) === String(id));
        if (btn.dataset.ocAct === 'work') { this._tendOceanoAVera(oc); return; }
        btn.disabled = true;
        const fuera = this._tendOcDescartados();
        fuera.add(String(id));
        try { localStorage.setItem(this._tendOcKey(), JSON.stringify([...fuera])); } catch (e) { console.warn('[Tendencies] no se pudo recordar el descarte:', e && e.message); }
        item.classList.add('is-adoptada');
        setTimeout(() => {
          item.remove();
          if (!card.querySelector('.tend-oc')) {
            const nuevo = this._nodos(this._buildTendOceanosHtml({ datos: [], falta: null }));
            card.replaceWith(...nuevo);
          }
        }, 280);
      });
    },

    /* «Trabajarlo» = abrir Vera con un brief del océano precargado (/vera?q=<prompt>). */
    _tendOceanoAVera(oc) {
      if (!oc) return;
      const terms = Array.isArray(oc.demand_terms) ? oc.demand_terms.slice(0, 6) : [];
      const prompt = [
        __('Quiero trabajar este océano azul que detectaste en Tendencias: «{g}».', { g: oc.gap_phrase }),
        oc.angle ? __('El ángulo: {a}.', { a: oc.angle }) : '',
        terms.length ? __('El mercado lo busca así: {t}.', { t: terms.join(', ') }) : '',
        __('Ayúdame a desarrollar contenido para capitalizarlo: ideas de posts, gancho y formato por plataforma.'),
      ].filter(Boolean).join(' ');
      const url = `${this._prefijo()}/vera?q=${encodeURIComponent(prompt)}`;
      if (window.router?.navigate) window.router.navigate(url);
      else window.location.href = url;
    },

    /* ══ Próximas fechas: CALENDARIO de mes ═══════════════════════════════
       Los días con evento se marcan y son clicables; el detalle del día seleccionado se pinta
       bajo la grilla sobre el color de la marca. ══════════════════════════════ */
    _fmtEventDay(iso) {
      const M = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? [String(Number(m[3])), M[Number(m[2]) - 1]] : ['', ''];
    },

    _buildTendFechasCard(r) {
      const holidays = r && !r.falta && Array.isArray(r.datos) ? r.datos : [];
      const evs = holidays
        .map((h) => {
          const rd = h.raw_data || {};
          const iso = String(h.event_date || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
          return {
            date: iso,
            name: String(h.event_name || ''),
            reason: h.event_description || rd.reason || '',
            verdict: String(rd.verdict || ''),
            intl: String(rd.scope || '') === 'international',
          };
        })
        .filter((e) => e.date)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      if (!evs.length) {
        const texto = this._faltaTexto(r, __('Aparece cuando la base tenga los festivos y fechas de tu mercado.'));
        return `
          <section class="tend-cal-card" id="tendCalCard">
            <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--calendar" aria-hidden="true"></i>${this._esc(__('Próximas Fechas'))}</span>
            ${this._todaviaNo(__('Próximas Fechas'), texto)}
          </section>`;
      }
      this._tendCalEvents = evs;
      // Mes visible: se conserva entre repintados si aún tiene sentido; si no, el del próximo evento.
      const months = [...new Set(evs.map((e) => e.date.slice(0, 7)))];
      if (!this._tendCalMonth || !months.includes(this._tendCalMonth)) this._tendCalMonth = months[0];
      this._tendCalMonths = months;
      this._syncTendCalSel();
      return this._buildTendCalHtml();
    },

    /* El día seleccionado siempre pertenece al mes visible y tiene evento. */
    _syncTendCalSel() {
      const evs = this._tendCalEvents || [];
      const inMonth = evs.filter((e) => e.date.slice(0, 7) === this._tendCalMonth);
      if (!inMonth.some((e) => e.date === this._tendCalSel)) {
        this._tendCalSel = inMonth.length ? inMonth[0].date : null;
      }
    },

    _buildTendCalHtml() {
      const esc = (s) => this._esc(s);
      const evs = this._tendCalEvents || [];
      const months = this._tendCalMonths || [];
      const ym = this._tendCalMonth;
      const [y, m] = ym.split('-').map(Number);

      // Grilla del mes (aritmética en UTC: sin corrimiento por zona horaria).
      const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // 0 = lunes
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const byDate = new Map();
      evs.forEach((e) => { if (!byDate.has(e.date)) byDate.set(e.date, []); byDate.get(e.date).push(e); });
      const today = new Date();
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      let cells = '';
      for (let i = 0; i < firstDow; i++) cells += '<span class="tend-cal-day is-empty"></span>';
      for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${ym}-${String(d).padStart(2, '0')}`;
        const dayEvs = byDate.get(iso) || [];
        if (!dayEvs.length) {
          cells += iso === todayIso
            ? `<span class="tend-cal-day is-today" data-panel-marca="1">${d}</span>`
            : `<span class="tend-cal-day">${d}</span>`;
          continue;
        }
        const useful = dayEvs.some((e) => e.verdict !== 'descartar');
        const cls = ['tend-cal-day', 'has-ev', useful ? 'is-use' : 'is-skip'];
        if (iso === todayIso) cls.push('is-today');
        if (iso === this._tendCalSel) cls.push('is-sel');
        cells += `<button type="button" class="${cls.join(' ')}" data-tend-cal-day="${iso}"
          ${iso === todayIso ? 'data-panel-marca="1"' : ''}
          title="${esc(dayEvs.map((e) => e.name).join(' · '))}">${d}</button>`;
      }

      const idx = months.indexOf(ym);
      const prevOk = idx > 0;
      const nextOk = idx >= 0 && idx < months.length - 1;

      // Panel del día seleccionado: el color de la marca, día grande + día de la semana + eventos.
      const sel = (byDate.get(this._tendCalSel) || []);
      let detail;
      if (sel.length) {
        const [sy, sm, sd] = this._tendCalSel.split('-').map(Number);
        const dowIdx = (new Date(Date.UTC(sy, sm - 1, sd)).getUTCDay() + 6) % 7;
        const items = sel.map((e) => {
          // El veredicto es de Vera: si no lo puso, no hay etiqueta (nunca una inventada).
          const tag = e.verdict === 'utilizar'
            ? `<span class="tend-cal-tag tend-cal-tag--use">${esc(__('Utilizar'))}</span>`
            : e.verdict === 'descartar'
              ? `<span class="tend-cal-tag tend-cal-tag--skip">${esc(__('Descartar'))}</span>`
              : '';
          const globe = e.intl ? `<i class="aisc-ico aisc-ico--places tend-cal-globe" title="${esc(__('Evento internacional'))}"></i> ` : '';
          return `
            <div class="tend-cal-ev${e.verdict === 'descartar' ? ' is-muted' : ''}">
              <div class="tend-cal-ev-top"><span class="tend-cal-ev-name">${globe}${esc(e.name)}</span>${tag}</div>
              ${e.reason ? `<span class="tend-cal-ev-reason">${esc(e.reason)}</span>` : ''}
            </div>`;
        }).join('');
        detail = `
          <div class="tend-cal-panel" data-panel-marca="1">
            <div class="tend-cal-panel-head">
              <span class="tend-cal-panel-day">${sd}</span>
              <span class="tend-cal-panel-dow">${esc(__(DOW_LONG[dowIdx]))}</span>
            </div>
            <div class="tend-cal-panel-evs">${items}</div>
          </div>`;
      } else {
        detail = `<p class="tend-cal-hint">${esc(__('Sin fechas relevantes este mes.'))}</p>`;
      }
      const mes = __(MONTHS[m - 1]);

      return `
        <section class="tend-cal-card" id="tendCalCard">
          <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--calendar" aria-hidden="true"></i>${esc(__('Próximas Fechas'))}</span>
          <div class="tend-cal-nav">
            <button type="button" class="tend-cal-arrow" data-tend-cal-nav="-1" ${prevOk ? '' : 'disabled'}
              aria-label="${esc(__('Mes anterior'))}"><i class="aisc-ico aisc-ico--chevron-left"></i></button>
            <span class="tend-cal-title">${esc(mes.charAt(0).toUpperCase() + mes.slice(1))} ${y}</span>
            <button type="button" class="tend-cal-arrow" data-tend-cal-nav="1" ${nextOk ? '' : 'disabled'}
              aria-label="${esc(__('Mes siguiente'))}"><i class="aisc-ico aisc-ico--chevron-right"></i></button>
          </div>
          <div class="tend-cal-dow">${DOW.map((d) => `<span>${d}</span>`).join('')}</div>
          <div class="tend-cal-grid">${cells}</div>
          <div class="tend-cal-detail">${detail}</div>
        </section>`;
    },

    /* Navegación + selección del calendario (delegado en la card). */
    _bindTendCalendar(root) {
      const card = root?.querySelector?.('#tendCalCard');
      if (!card) return;
      // Color sólido de la marca + tinta resuelta por luminancia (el ayudante de Mi Marca).
      card.querySelectorAll('[data-panel-marca]').forEach((el) => this._vestirPanelDeMarca?.(el));
      if (card._tendCalBound || !this._tendCalEvents) return;
      card._tendCalBound = true;
      card.addEventListener('click', (ev) => {
        const nav = ev.target.closest('[data-tend-cal-nav]');
        const day = ev.target.closest('[data-tend-cal-day]');
        if (!nav && !day) return;
        if (nav) {
          const months = this._tendCalMonths || [];
          const next = months[months.indexOf(this._tendCalMonth) + Number(nav.dataset.tendCalNav)];
          if (!next) return;
          this._tendCalMonth = next;
          this._syncTendCalSel();
        } else {
          this._tendCalSel = day.dataset.tendCalDay;
        }
        const host = card.parentElement;
        card.replaceWith(...this._nodos(this._buildTendCalHtml()));
        this._bindTendCalendar(host);
      });
    },
  });
})();
