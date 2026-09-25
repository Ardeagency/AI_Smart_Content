/**
 * DashboardView — CompAds mixin: «Lo que están pautando» (pestaña Competencia, diseño de v1).
 *
 * La galería de los anuncios que la competencia tiene corriendo en Meta, con su creativo
 * real: la prueba material de lo que Vera afirma en las cards de arriba.
 *
 * DE DÓNDE SALE: intel.anuncios_competencia (P2, 20260925171000) por
 * DashboardDatos.anunciosCompetencia — marca normalizada y `sigue_corriendo` ya calculado
 * por la vista (el barrido solo trae activos: si el último barrido de esa marca ya no lo
 * trajo, el rival lo apagó). Sin la vista, la card queda en su sitio con «todavía no».
 *
 * POR QUÉ AGRUPA POR CREATIVO: una misma pieza suele correr en varios anuncios a la vez. Sin
 * agrupar, la galería repite la imagen seis veces; agrupada, ese «×6» es justo la señal:
 * cuánto está apostando el rival por ESE mensaje.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  Object.assign(DashboardView.prototype, {

    async _renderCompAds(body) {
      if (!body || !this._orgId || !window.DashboardDatos) return;

      // La sección se monta una vez; luego solo se repinta su contenido.
      let host = body.querySelector('#cadsCard');
      if (!host) {
        const nodos = this._nodos(this._buildCompAdsShell());
        const anclaV4 = body.querySelector('#cgridVera4');
        if (anclaV4) anclaV4.before(...nodos);
        else (body.querySelector('.cgrid') || body).append(...nodos);
        host = body.querySelector('#cadsCard');
        this._bindCompAds(body);
      }
      if (!host) return;
      const grid = body.querySelector('#cadsGrid');
      const titulo = __('Lo que están pautando');

      const r = await window.DashboardDatos.anunciosCompetencia(this._orgId);
      if (!this._sigue('competence')) return;
      if (r.falta) {
        this._cadsGrupos = [];
        this._pintar(grid, this._todaviaNo(titulo, this._faltaTexto(r, __('Aparece cuando la base tenga los anuncios que tu competencia corre en Meta.'))));
        return;
      }
      const filas = r.datos || [];
      if (!filas.length) {
        this._cadsGrupos = [];
        this._pintar(grid, this._todaviaNo(titulo, __('Aún no hay anuncios de tu competencia corriendo en Meta.')));
        return;
      }
      this._cadsGrupos = this._cadsAgrupar(filas);
      this._cadsPintar(body);
    },

    _buildCompAdsShell() {
      return `
        <section class="bgrid-card cads-card" id="cadsCard">
          <header class="bgrid-card-head">
            <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--campaign" aria-hidden="true"></i>${this._esc(__('Lo que están pautando'))}</span>
            <span class="cads-count" id="cadsCount"></span>
          </header>
          <p class="bgrid-card-sub">${this._esc(__('Anuncios que tus competidores tienen corriendo en Meta · toca uno para verlo completo'))}</p>
          <nav class="cads-filtros" id="cadsFiltros" role="tablist"></nav>
          <div class="cads-carrusel" id="cadsGrid"><div class="cgrid-load">${this._esc(__('Buscando sus anuncios…'))}</div></div>
        </section>`;
    },

    /* Un mismo arte corriendo en varios anuncios = una sola tarjeta con ×N. */
    _cadsAgrupar(filas) {
      // ¿SIGUE CORRIENDO? Lo trae la vista; si no, se deriva como en v1: el último barrido
      // de esa marca ya no lo trajo ⇒ el rival lo apagó (margen de 1 día).
      const ultimoPorMarca = new Map();
      for (const f of filas) {
        const m = f.intelligence_entities?.name || '—';
        const t = Date.parse(f.last_seen_at || 0) || 0;
        if (t > (ultimoPorMarca.get(m) || 0)) ultimoPorMarca.set(m, t);
      }
      const MARGEN = 24 * 3600 * 1000;
      const mapa = new Map();
      for (const f of filas) {
        const marca = f.intelligence_entities?.name || '—';
        const clave = `${marca}|${f.creative_url || (f.copy_text || '').slice(0, 80)}`;
        const vivo = typeof f.sigue_corriendo === 'boolean'
          ? f.sigue_corriendo
          : (Date.parse(f.last_seen_at || 0) || 0) >= (ultimoPorMarca.get(marca) || 0) - MARGEN;
        const g = mapa.get(clave);
        if (g) {
          g.veces++;
          if (f.first_seen_at && (!g.desde || f.first_seen_at < g.desde)) g.desde = f.first_seen_at;
          if (f.last_seen_at && (!g.visto || f.last_seen_at > g.visto)) g.visto = f.last_seen_at;
          g.sigueCorriendo = g.sigueCorriendo || vivo;
          continue;
        }
        const t = f.targeting || {};
        mapa.set(clave, {
          id: f.id,
          marca,
          creativo: f.creative_url || null,
          copy: f.copy_text || '',
          desde: f.first_seen_at,
          visto: f.last_seen_at,
          cta: t.cta_text || null,
          formato: t.display_format || null,
          plataformas: Array.isArray(t.publisher_platforms) ? t.publisher_platforms : [],
          urlLibrary: t.ad_library_url || null,
          sigueCorriendo: vivo,
          veces: 1,
        });
      }
      return [...mapa.values()].sort((a, b) => String(b.desde || '').localeCompare(String(a.desde || '')));
    },

    _cadsPintar(body) {
      const grid = body.querySelector('#cadsGrid');
      const cont = body.querySelector('#cadsCount');
      const nav = body.querySelector('#cadsFiltros');
      if (!grid) return;
      const todos = this._cadsGrupos || [];
      const marcas = [...new Set(todos.map((g) => g.marca))].sort();
      const sel = this._cadsMarca && marcas.includes(this._cadsMarca) ? this._cadsMarca : '';
      const lista = sel ? todos.filter((g) => g.marca === sel) : todos;

      if (nav) {
        this._pintar(nav, marcas.length > 1
          ? [['', __('Todas')], ...marcas.map((m) => [m, m])]
            .map(([v, l]) => `<button type="button" class="bgrid-seg-btn${v === sel ? ' is-active' : ''}" data-cads-marca="${this._esc(v)}" role="tab">${this._esc(l)}</button>`)
            .join('')
          : '');
      }
      if (cont) {
        const n = lista.reduce((a, g) => a + g.veces, 0);
        cont.textContent = sel ? __('{n} anuncios', { n }) : __('{n} anuncios · {m} marcas', { n, m: marcas.length });
      }
      this._pintar(grid, lista.map((g) => this._cadsTarjeta(g)).join(''));
      grid.scrollLeft = 0;
    },

    _cadsDias(iso) {
      const t = Date.parse(iso || '');
      return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 86400000));
    },

    /* Solo la pieza. Cuándo se publicó y si sigue corriendo aparecen al pasar el cursor. */
    _cadsTarjeta(g) {
      const esc = (s) => this._esc(s);
      const medio = g.creativo
        ? `<img class="cads-img" src="${esc(g.creativo)}" alt="" loading="lazy">`
        : '<div class="cads-img--vacia"><i class="aisc-ico aisc-ico--image" aria-hidden="true"></i></div>';
      const publicado = this._cadsFecha(g.desde);
      const estado = g.sigueCorriendo
        ? __('Sigue al aire · {n} días', { n: this._cadsDias(g.desde) })
        : __('Ya no está al aire');
      const etiqueta = [g.marca, publicado, estado].filter(Boolean).join(' · ');
      return `
        <article class="cads-item" data-cads-id="${esc(g.id)}" tabindex="0" role="button" aria-label="${esc(etiqueta)}">
          ${medio}
          ${g.veces > 1 ? `<span class="cads-veces" title="${esc(__('El mismo arte corriendo en varios anuncios a la vez'))}">${esc(`×${g.veces}`)}</span>` : ''}
          ${String(g.formato || '').toUpperCase() === 'VIDEO' ? '<span class="cads-fmt"><i class="aisc-ico aisc-ico--play" aria-hidden="true"></i></span>' : ''}
          <div class="cads-hover" aria-hidden="true">
            <p class="cads-hover-marca">${esc(g.marca)}</p>
            <p class="cads-hover-fecha">${esc(publicado)}</p>
            <p class="cads-hover-estado${g.sigueCorriendo ? ' is-vivo' : ''}">${esc(estado)}</p>
          </div>
        </article>`;
    },

    _cadsFecha(iso) {
      if (!iso) return '';
      try {
        const loc = (window.i18n && window.i18n.getLocale && window.i18n.getLocale() === 'en') ? 'en-US' : 'es-CO';
        return new Date(iso).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
      } catch (e) { return ''; }
    },

    _bindCompAds(body) {
      if (body.dataset.cadsBound === '1') return;
      body.dataset.cadsBound = '1';
      const abrir = (el) => {
        const id = el?.dataset?.cadsId;
        const g = (this._cadsGrupos || []).find((x) => String(x.id) === String(id));
        if (g) this._cadsModal(g);
      };
      body.addEventListener('click', (e) => {
        const m = e.target.closest('[data-cads-marca]');
        if (m) { this._cadsMarca = m.dataset.cadsMarca || ''; this._cadsPintar(body); return; }
        const it = e.target.closest('[data-cads-id]');
        if (it) abrir(it);
      });
      body.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const it = e.target.closest('[data-cads-id]');
        if (it && e.target === it) { e.preventDefault(); abrir(it); }
      });
      // Creativo caído (URL de Meta que caducó): glifo neutro, nunca el icono roto.
      // Fase de CAPTURA: el evento `error` de una imagen no burbujea.
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

    _cadsModal(g) {
      const esc = (s) => this._esc(s);
      const fecha = (iso) => {
        if (!iso) return '—';
        try { return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return '—'; }
      };
      const datos = [
        [__('Al aire desde'), g.desde ? `${fecha(g.desde)} · ${this._cadsDias(g.desde)} ${__('días')}` : '—'],
        [__('Última vez visto'), fecha(g.visto)],
        [__('Formato'), g.formato || '—'],
        [__('Llamado a la acción'), g.cta || '—'],
        [__('Dónde se muestra'), g.plataformas.length ? g.plataformas.join(' · ') : '—'],
        [__('Anuncios con este arte'), String(g.veces)],
      ];
      const html = `
        <div class="cads-modal">
          ${g.creativo ? `<img class="cads-modal-img" src="${esc(g.creativo)}" alt="">` : ''}
          <p class="cads-modal-marca">${esc(g.marca)}</p>
          ${g.copy ? `<p class="cads-modal-copy">${esc(g.copy)}</p>` : ''}
          <dl class="cads-modal-datos">
            ${datos.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
          </dl>
          ${g.urlLibrary ? `<a class="cads-modal-link" href="${esc(g.urlLibrary)}" target="_blank" rel="noopener noreferrer">${esc(__('Verlo en la Biblioteca de Anuncios de Meta'))}</a>` : ''}
        </div>`;
      this._modal({ titulo: __('Anuncio de {marca}', { marca: g.marca }), html, clase: 'cads-modal-wrap', tamano: 'md' });
    },
  });
})();
