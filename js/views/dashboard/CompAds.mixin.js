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
          <div class="cads-carrusel" id="cadsGrid"></div>
        </section>`;
    },

    /* Un mismo arte corriendo en varios anuncios = una sola tarjeta con ×N. */
    _cadsAgrupar(filas) {
      /* ¿SIGUE CORRIENDO? No se puede creer el `activo` que trae Meta: el
         barrido solo pide anuncios ACTIVOS, así que todos llegan en true y el
         dato no distinguiría nada. Se deriva de lo que nosotros observamos: si
         el último barrido de esa marca ya no lo trajo, el rival lo apagó.
         Margen de 1 día para no marcar como muerto lo que solo se cruzó con un
         barrido a medias. */
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
          urlLibrary: t.ad_library_url || (f.ad_archive_id ? `https://www.facebook.com/ads/library/?id=${f.ad_archive_id}` : null),
          sigueCorriendo: (Date.parse(f.last_seen_at || 0) || 0) >= (ultimoPorMarca.get(marca) || 0) - MARGEN,
          veces: 1,
        });
      }
      return [...mapa.values()].sort((a, b) => String(b.desde).localeCompare(String(a.desde)));
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

      /* El carrusel los muestra TODOS: se navega desplazando, no paginando.
         Vuelve al inicio al cambiar de marca, si no el filtro parece vacío
         cuando el carrusel se quedó desplazado a la derecha. */
      grid.innerHTML = lista.map((g) => this._cadsTarjeta(g)).join('');
      grid.scrollLeft = 0;
    },

    /* Solo la pieza. Cuándo se publicó y si sigue corriendo aparecen al pasar
       el cursor: el creativo se lee de un vistazo y el dato está cuando se
       busca, no compitiendo con la imagen. */
    _cadsTarjeta(g) {
      const medio = g.creativo
        ? `<img class="cads-img" src="${this._esc(g.creativo)}" alt="" loading="lazy">`
        : `<div class="cads-img--vacia"><i class="aisc-ico aisc-ico--image" aria-hidden="true"></i></div>`;
      const publicado = this._cadsFecha(g.desde);
      const dias = Math.max(0, Math.floor((Date.now() - new Date(g.desde).getTime()) / 86400000));
      const estado = g.sigueCorriendo
        ? __('Sigue al aire · {n} días', { n: dias })
        : __('Ya no está al aire');
      const etiqueta = `${g.marca} · ${publicado} · ${estado}`;
      return `
        <article class="cads-item" data-cads-id="${this._esc(g.id)}" tabindex="0" role="button"
                 aria-label="${this._esc(etiqueta)}">
          ${medio}
          ${g.veces > 1 ? `<span class="cads-veces" title="${this._esc(__('El mismo arte corriendo en varios anuncios a la vez'))}">×${g.veces}</span>` : ''}
          ${g.formato === 'VIDEO' ? `<span class="cads-fmt"><i class="aisc-ico aisc-ico--play" aria-hidden="true"></i></span>` : ''}
          <div class="cads-hover" aria-hidden="true">
            <p class="cads-hover-marca">${this._esc(g.marca)}</p>
            <p class="cads-hover-fecha">${this._esc(publicado)}</p>
            <p class="cads-hover-estado${g.sigueCorriendo ? ' is-vivo' : ''}">
              <i class="cads-punto" aria-hidden="true"></i>${this._esc(estado)}
            </p>
          </div>
        </article>`;
    },

    _cadsFecha(iso) {
      try {
        return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch (_) { return ''; }
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
        if (it) { e.preventDefault(); abrir(it); }
      });
      /* Si el archivado en R2 falló, creative_url quedó apuntando a la CDN de
         Meta — y esa caduca. Mismo patrón que .cgp-post-thumb: nunca el icono
         roto del navegador, siempre el glifo sobre superficie neutra.
         El listener va en fase de CAPTURA porque el evento `error` de una
         imagen no burbujea. */
      body.addEventListener('error', (e) => {
        const img = e.target;
        if (!img || img.tagName !== 'IMG' || !img.classList.contains('cads-img')) return;
        img.hidden = true;
        const caja = img.parentElement;
        if (caja && !caja.querySelector('.cads-img--vacia')) {
          caja.insertAdjacentHTML('afterbegin',
            '<div class="cads-img--vacia"><i class="aisc-ico aisc-ico--image" aria-hidden="true"></i></div>');
        }
      }, true);
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
