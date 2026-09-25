/**
 * DashboardView — BrandAds mixin: «Lo que estás pautando» (pestaña Mi Marca).
 *
 * El espejo de la galería de Competencia, pero de la casa, con dos cosas que de un rival nunca
 * se saben: el ESTADO REAL del anuncio (activo, pausado por su campaña o por su conjunto,
 * rechazado…) y el GASTO de cada pieza.
 *
 * DE DÓNDE SALE: marketing.anuncios_rendimiento (P2, 20260925171000) por
 * DashboardDatos.anuncios(), que ya trae el rendimiento acumulado de cada anuncio (`perf`).
 * Sin la vista, la sección queda en su sitio como «todavía no».
 * Reusa el lenguaje visual de la galería de Competencia (.cads-*, comp-grid.css).
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  const TOPE = 60;

  /* Meta distingue por qué está detenido un anuncio, y no es lo mismo. */
  const ESTADO = {
    ACTIVE:          { txt: () => __('Activo'),                  vivo: true },
    PAUSED:          { txt: () => __('Pausado'),                 vivo: false },
    CAMPAIGN_PAUSED: { txt: () => __('Pausado por su campaña'),  vivo: false },
    ADSET_PAUSED:    { txt: () => __('Pausado por su conjunto'), vivo: false },
    ARCHIVED:        { txt: () => __('Archivado'),               vivo: false },
    DELETED:         { txt: () => __('Eliminado'),               vivo: false },
    WITH_ISSUES:     { txt: () => __('Con problemas'),           vivo: false, alerta: true },
    DISAPPROVED:     { txt: () => __('Rechazado por Meta'),      vivo: false, alerta: true },
    PENDING_REVIEW:  { txt: () => __('En revisión'),             vivo: false },
  };
  const estadoDe = (s) => {
    const e = ESTADO[s];
    return e ? { txt: e.txt(), vivo: e.vivo, alerta: !!e.alerta } : { txt: s || '—', vivo: false, alerta: false };
  };

  Object.assign(DashboardView.prototype, {

    async _renderBrandAds(body) {
      if (!body || !this._orgId || !window.DashboardDatos) return;
      let host = body.querySelector('#badsCard');
      if (!host) {
        const nodos = this._nodos(this._buildBrandAdsShell());
        const ancla = body.querySelector('#bgridVera4');
        if (ancla) ancla.before(...nodos);
        else body.append(...nodos);
        host = body.querySelector('#badsCard');
        this._bindBrandAds(body);
      }
      if (!host) return;
      const r = await window.DashboardDatos.anuncios(this._orgId, { limite: TOPE });
      if (!this._sigue('my-brands')) return;
      const car = body.querySelector('#badsCarrusel');
      const nav = body.querySelector('#badsFiltros');
      const cont = body.querySelector('#badsCount');
      if (r.falta || !(r.datos || []).length) {
        if (nav) this._pintar(nav, '');
        if (cont) cont.textContent = '';
        const texto = r.falta
          ? this._faltaTexto(r, __('Aparece cuando la base cruce tus anuncios con lo que costó cada uno.'))
          : __('Aparece cuando tengas anuncios en Meta conectados a tu marca.');
        this._pintar(car, this._todaviaNo(__('Todavía no'), texto));
        return;
      }
      this._badsLista = r.datos;
      this._badsPintar(body);
    },

    _buildBrandAdsShell() {
      return `
        <section class="bgrid-card cads-card" id="badsCard">
          <header class="bgrid-card-head">
            <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--campaign" aria-hidden="true"></i>${this._esc(__('Lo que estás pautando'))}</span>
            <span class="cads-count" id="badsCount"></span>
          </header>
          <p class="bgrid-card-sub">${this._esc(__('Tus anuncios en Meta con lo que costó cada uno · toca uno para verlo completo'))}</p>
          <nav class="cads-filtros" id="badsFiltros" role="tablist"></nav>
          <div class="cads-carrusel" id="badsCarrusel"></div>
        </section>`;
    },

    _badsPintar(body) {
      const car = body.querySelector('#badsCarrusel');
      const cont = body.querySelector('#badsCount');
      const nav = body.querySelector('#badsFiltros');
      if (!car) return;
      const todos = this._badsLista || [];
      const activos = todos.filter((a) => a.status === 'ACTIVE');
      // Arranca en ACTIVOS: lo que corre hoy es lo accionable.
      if (this._badsFiltro == null) this._badsFiltro = activos.length ? 'activos' : 'todos';
      const sel = this._badsFiltro;
      const lista = sel === 'activos' ? activos : todos;
      if (nav) {
        // «Todos» solo si de verdad son todos: se piden los TOPE más recientes.
        const etiquetaTodos = todos.length >= TOPE ? __('Últimos ({n})', { n: todos.length }) : __('Todos ({n})', { n: todos.length });
        this._pintar(nav, [
          ['activos', __('Activos ({n})', { n: activos.length })],
          ['todos', etiquetaTodos],
        ].map(([v, l]) => `<button type="button" class="bgrid-seg-btn${v === sel ? ' is-active' : ''}" data-bads-filtro="${v}" role="tab">${this._esc(l)}</button>`).join(''));
      }
      if (cont) {
        const total = lista.reduce((a, x) => a + (x.perf?.gasto || 0), 0);
        cont.textContent = total > 0
          ? __('{n} anuncios · {gasto} invertidos', { n: lista.length, gasto: this._badsPlata(total) })
          : __('{n} anuncios', { n: lista.length });
      }
      this._pintar(car, lista.map((a) => this._badsTarjeta(a)).join(''));
      car.scrollLeft = 0;
    },

    /* Cifra corta y legible: $1,2 M dice más de un vistazo que $1.204.533. */
    _badsPlata(v) {
      const n = Number(v) || 0;
      if (n >= 1000000) return `$${(n / 1000000).toFixed(1).replace('.', ',')} M`;
      if (n >= 1000) return `$${Math.round(n / 1000)} K`;
      return `$${Math.round(n)}`;
    },

    _badsTarjeta(a) {
      const est = estadoDe(a.status);
      const medio = a.creative_url
        ? `<img class="cads-img" src="${this._esc(a.creative_url)}" alt="" loading="lazy">`
        : '<div class="cads-img--vacia"><i class="aisc-ico aisc-ico--image" aria-hidden="true"></i></div>';
      const fecha = this._badsFecha(a.created_time);
      const gasto = a.perf?.gasto ? this._badsPlata(a.perf.gasto) : null;
      const etiqueta = [a.nombre || __('Anuncio'), fecha, est.txt, gasto].filter(Boolean).join(' · ');
      return `
        <article class="cads-item" data-bads-id="${this._esc(a.id)}" tabindex="0" role="button" aria-label="${this._esc(etiqueta)}">
          ${medio}
          ${gasto ? `<span class="cads-veces" title="${this._esc(__('Invertido en este anuncio'))}">${this._esc(gasto)}</span>` : ''}
          ${a.formato === 'video' ? '<span class="cads-fmt"><i class="aisc-ico aisc-ico--play" aria-hidden="true"></i></span>' : ''}
          <div class="cads-hover" aria-hidden="true">
            <p class="cads-hover-marca">${this._esc(a.nombre || __('Anuncio'))}</p>
            <p class="cads-hover-fecha">${this._esc(fecha)}</p>
            <p class="cads-hover-estado${est.vivo ? ' is-vivo' : ''}${est.alerta ? ' is-alerta' : ''}">${this._esc(est.txt)}</p>
          </div>
        </article>`;
    },

    _badsFecha(iso) {
      if (!iso) return '';
      try {
        return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch (e) { return String(iso).slice(0, 10); }
    },

    _bindBrandAds(body) {
      if (body.dataset.badsBound === '1') return;
      body.dataset.badsBound = '1';
      const abrir = (el) => {
        const a = (this._badsLista || []).find((x) => String(x.id) === String(el?.dataset?.badsId));
        if (a) this._badsModal(a);
      };
      body.addEventListener('click', (e) => {
        const f = e.target.closest('[data-bads-filtro]');
        if (f) { this._badsFiltro = f.dataset.badsFiltro; this._badsPintar(body); return; }
        const it = e.target.closest('[data-bads-id]');
        if (it) abrir(it);
      });
      body.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const it = e.target.closest('[data-bads-id]');
        if (it) { e.preventDefault(); abrir(it); }
      });
      /* Si el creativo archivado falló, glifo neutro en vez del icono roto (el `error` no burbujea: captura). */
      body.addEventListener('error', (e) => {
        const img = e.target;
        if (!img || img.tagName !== 'IMG' || !img.classList.contains('cads-img')) return;
        img.hidden = true;
        const caja = img.parentElement;
        if (caja && !caja.querySelector('.cads-img--vacia')) {
          caja.prepend(...this._nodos('<div class="cads-img--vacia"><i class="aisc-ico aisc-ico--image" aria-hidden="true"></i></div>'));
        }
      }, true);
    },

    _badsModal(a) {
      const est = estadoDe(a.status);
      const p = a.perf;
      const ctr = p && p.impresiones > 0 ? `${((p.clics / p.impresiones) * 100).toFixed(2)}%` : null;
      const cpm = p && p.impresiones > 0 ? this._badsPlata((p.gasto / p.impresiones) * 1000) : null;
      const datos = [
        [__('Estado'), est.txt],
        [__('Creado'), this._badsFecha(a.created_time) || '—'],
        [__('Formato'), a.formato || '—'],
        [__('Llamado a la acción'), a.cta || '—'],
        p ? [__('Invertido'), this._badsPlata(p.gasto)] : null,
        p ? [__('Impresiones'), Number(p.impresiones || 0).toLocaleString('es-CO')] : null,
        ctr ? [__('CTR'), ctr] : null,
        cpm ? [__('Costo por mil'), cpm] : null,
      ].filter(Boolean);
      const html = `
        <div class="cads-modal">
          ${a.creative_url ? `<img class="cads-modal-img" src="${this._esc(a.creative_url)}" alt="">` : ''}
          ${a.titulo ? `<p class="cads-modal-marca">${this._esc(a.titulo)}</p>` : ''}
          ${a.copy_text ? `<p class="cads-modal-copy">${this._esc(a.copy_text)}</p>` : ''}
          <dl class="cads-modal-datos">
            ${datos.map(([k, v]) => `<div><dt>${this._esc(k)}</dt><dd>${this._esc(v)}</dd></div>`).join('')}
          </dl>
          ${a.link_url ? `<a class="cads-modal-link" href="${this._esc(a.link_url)}" target="_blank" rel="noopener noreferrer">${this._esc(__('Ver a dónde lleva'))}</a>` : ''}
        </div>`;
      this._modal({ titulo: a.nombre || __('Anuncio'), html, clase: 'cads-modal-wrap' });
    },
  });
})();
