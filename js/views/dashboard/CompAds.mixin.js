/**
 * DashboardView — CompAds mixin: "Lo que están pautando" (tab Competencia).
 *
 * La galería de los anuncios que la competencia tiene CORRIENDO en Meta, con su
 * creativo real. Es la prueba material de lo que Vera afirma en las cards de
 * arriba: una cosa es leer "el rival empujó producto en julio" y otra ver los
 * seis anuncios con los que lo empujó.
 *
 * DE DÓNDE SALE: tabla `competitor_ads`, que llena el sensor semanal
 * meta_ad_library_sync leyendo la Biblioteca de Anuncios pública de Meta. Solo
 * competidores — los referentes culturales no se barren (decisión de JC).
 * La lectura es directa: competitor_ads tiene RLS org-scoped
 * (is_developer() OR is_org_member(organization_id)).
 *
 * POR QUÉ AGRUPA POR CREATIVO: Meta devuelve un registro por anuncio, y una
 * misma pieza suele correr en varios anuncios a la vez (distinta campaña, mismo
 * arte). Sin agrupar, la galería repite la misma imagen seis veces y parece un
 * error. Agrupada, ese "×6" es justo la señal interesante: cuánto está
 * apostando el rival por ESE mensaje.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  const TOPE = 60;          // anuncios que se traen (los más recientes)
  const VISIBLES = 12;      // los que se pintan antes de "ver más"

  Object.assign(DashboardView.prototype, {

    async _renderCompAds(body) {
      if (!body || !this._orgId || !this._supabase) return;

      // La sección se monta una vez; luego solo se repinta su contenido.
      let host = body.querySelector('#cadsCard');
      if (!host) {
        const anclaV4 = body.querySelector('#cgridVera4');
        const html = this._buildCompAdsShell();
        if (anclaV4) anclaV4.insertAdjacentHTML('beforebegin', html);
        else body.insertAdjacentHTML('beforeend', html);
        host = body.querySelector('#cadsCard');
        this._bindCompAds(body);
      }
      if (!host) return;

      let filas = [];
      try {
        const { data, error } = await this._supabase
          .from('competitor_ads')
          .select('id, creative_url, copy_text, first_seen_at, last_seen_at, targeting, ad_archive_id, intelligence_entities(name)')
          .eq('organization_id', this._orgId)
          .order('first_seen_at', { ascending: false })
          .limit(TOPE);
        if (error) throw error;
        filas = data || [];
      } catch (e) {
        console.warn('[CompAds] no se pudo leer competitor_ads:', e?.message || e);
        host.hidden = true;
        return;
      }

      if (!filas.length) { host.hidden = true; return; }
      host.hidden = false;
      this._cadsGrupos = this._cadsAgrupar(filas);
      this._cadsPintar(body);
    },

    _buildCompAdsShell() {
      return `
        <section class="bgrid-card cads-card" id="cadsCard" hidden>
          <header class="bgrid-card-head">
            <span class="bgrid-card-title"><i class="aisc-ico aisc-ico--campaign" aria-hidden="true"></i>${this._esc(__('Lo que están pautando'))}</span>
            <span class="cads-count" id="cadsCount"></span>
          </header>
          <p class="bgrid-card-sub">${this._esc(__('Anuncios que tus competidores tienen corriendo en Meta · toca uno para verlo completo'))}</p>
          <nav class="cads-filtros" id="cadsFiltros" role="tablist"></nav>
          <div class="cads-grid" id="cadsGrid"></div>
          <footer class="cads-foot" id="cadsFoot"></footer>
        </section>`;
    },

    /* Un mismo arte corriendo en varios anuncios = una sola tarjeta con ×N. */
    _cadsAgrupar(filas) {
      const mapa = new Map();
      for (const f of filas) {
        const marca = f.intelligence_entities?.name || '—';
        // La clave es el creativo; si no hay imagen, el copy evita fusionar
        // anuncios que no tienen nada que ver.
        const clave = `${marca}|${f.creative_url || (f.copy_text || '').slice(0, 80)}`;
        const g = mapa.get(clave);
        if (g) {
          g.veces++;
          if (f.first_seen_at < g.desde) g.desde = f.first_seen_at;
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
          activo: t.activo === true,
          urlLibrary: t.ad_library_url || (f.ad_archive_id ? `https://www.facebook.com/ads/library/?id=${f.ad_archive_id}` : null),
          veces: 1,
        });
      }
      return [...mapa.values()].sort((a, b) => String(b.desde).localeCompare(String(a.desde)));
    },

    _cadsPintar(body) {
      const grid = body.querySelector('#cadsGrid');
      const cont = body.querySelector('#cadsCount');
      const nav = body.querySelector('#cadsFiltros');
      const foot = body.querySelector('#cadsFoot');
      if (!grid) return;

      const todos = this._cadsGrupos || [];
      const marcas = [...new Set(todos.map((g) => g.marca))].sort();
      const sel = this._cadsMarca && marcas.includes(this._cadsMarca) ? this._cadsMarca : '';
      const lista = sel ? todos.filter((g) => g.marca === sel) : todos;
      const tope = this._cadsVerTodo ? lista.length : VISIBLES;

      if (nav && marcas.length > 1) {
        nav.innerHTML = [['', __('Todas')], ...marcas.map((m) => [m, m])]
          .map(([v, l]) => `<button type="button" class="bgrid-seg-btn${v === sel ? ' is-active' : ''}" data-cads-marca="${this._esc(v)}" role="tab">${this._esc(l)}</button>`)
          .join('');
      }

      if (cont) {
        const n = lista.reduce((a, g) => a + g.veces, 0);
        cont.textContent = sel
          ? __('{n} anuncios', { n })
          : __('{n} anuncios · {m} marcas', { n, m: marcas.length });
      }

      grid.innerHTML = lista.slice(0, tope).map((g) => this._cadsTarjeta(g)).join('');

      if (foot) {
        foot.innerHTML = lista.length > VISIBLES
          ? `<button type="button" class="cads-mas" data-cads-mas="1">${this._esc(this._cadsVerTodo ? __('Ver menos') : __('Ver los {n}', { n: lista.length }))}</button>`
          : '';
      }
    },

    _cadsTarjeta(g) {
      const dias = Math.max(0, Math.floor((Date.now() - new Date(g.desde).getTime()) / 86400000));
      /* "Lleva N días al aire" es la señal barata de que algo le funciona: un
         anuncio malo se apaga en días, uno rentable lleva meses. */
      const antig = dias < 1 ? __('nuevo hoy') : dias === 1 ? __('1 día al aire') : __('{n} días al aire', { n: dias });
      const medio = g.creativo
        ? `<img class="cads-img" src="${this._esc(g.creativo)}" alt="" loading="lazy">`
        : `<div class="cads-img cads-img--vacia"><i class="aisc-ico aisc-ico--image" aria-hidden="true"></i></div>`;
      const copy = (g.copy || '').replace(/\s+/g, ' ').trim();
      return `
        <article class="cads-item" data-cads-id="${this._esc(g.id)}" tabindex="0" role="button"
                 aria-label="${this._esc(__('Ver el anuncio de {marca}', { marca: g.marca }))}">
          <div class="cads-media">
            ${medio}
            ${g.veces > 1 ? `<span class="cads-veces" title="${this._esc(__('El mismo arte corriendo en varios anuncios a la vez'))}">×${g.veces}</span>` : ''}
            ${g.formato === 'VIDEO' ? `<span class="cads-fmt"><i class="aisc-ico aisc-ico--play" aria-hidden="true"></i></span>` : ''}
          </div>
          <div class="cads-info">
            <p class="cads-marca">${this._esc(g.marca)}</p>
            <p class="cads-copy">${this._esc(copy.slice(0, 90))}${copy.length > 90 ? '…' : ''}</p>
            <p class="cads-meta">${this._esc(antig)}${g.cta ? ` · ${this._esc(g.cta)}` : ''}</p>
          </div>
        </article>`;
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
        if (m) { this._cadsMarca = m.dataset.cadsMarca || ''; this._cadsVerTodo = false; this._cadsPintar(body); return; }
        if (e.target.closest('[data-cads-mas]')) { this._cadsVerTodo = !this._cadsVerTodo; this._cadsPintar(body); return; }
        const it = e.target.closest('[data-cads-id]');
        if (it) abrir(it);
      });
      body.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const it = e.target.closest('[data-cads-id]');
        if (it) { e.preventDefault(); abrir(it); }
      });
    },

    _cadsModal(g) {
      if (!window.Modal || typeof window.Modal.show !== 'function') return;
      const dias = Math.max(0, Math.floor((Date.now() - new Date(g.desde).getTime()) / 86400000));
      const fecha = (iso) => { try { return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (_) { return ''; } };
      const datos = [
        [__('Al aire desde'), `${fecha(g.desde)} · ${dias} ${__('días')}`],
        [__('Última vez visto'), fecha(g.visto)],
        [__('Formato'), g.formato || '—'],
        [__('Llamado a la acción'), g.cta || '—'],
        [__('Dónde se muestra'), g.plataformas.length ? g.plataformas.join(' · ') : '—'],
        [__('Anuncios con este arte'), String(g.veces)],
      ];
      const body = `
        <div class="cads-modal">
          ${g.creativo ? `<img class="cads-modal-img" src="${this._esc(g.creativo)}" alt="">` : ''}
          <p class="cads-modal-marca">${this._esc(g.marca)}</p>
          ${g.copy ? `<p class="cads-modal-copy">${this._esc(g.copy)}</p>` : ''}
          <dl class="cads-modal-datos">
            ${datos.map(([k, v]) => `<div><dt>${this._esc(k)}</dt><dd>${this._esc(v)}</dd></div>`).join('')}
          </dl>
          ${g.urlLibrary ? `<a class="cads-modal-link" href="${this._esc(g.urlLibrary)}" target="_blank" rel="noopener noreferrer">${this._esc(__('Verlo en la Biblioteca de Anuncios de Meta'))}</a>` : ''}
        </div>`;
      window.Modal.show({ title: __('Anuncio de {marca}', { marca: g.marca }), body, className: 'dash-modal cads-modal-wrap' });
    },
  });
})();
