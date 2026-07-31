/**
 * DashboardView — BrandAds mixin: "Lo que estás pautando" (tab Mi Marca).
 *
 * El espejo de la galería de Competencia, pero de la casa. Y con dos cosas que
 * de un rival NUNCA se van a poder saber:
 *   · el ESTADO REAL — `effective_status` distingue activo, pausado, y pausado
 *     por su campaña o por su conjunto. De la competencia solo se pueden pedir
 *     los anuncios activos, así que allí el estado se deduce; aquí se sabe.
 *   · el GASTO de cada pieza, cruzando ad_insights_daily por external_ad_id.
 *     Ver el creativo al lado de lo que costó es la pregunta que nadie podía
 *     responder: se sabía cuánto costó cada anuncio y no cuál era.
 *
 * DE DÓNDE SALE: tabla `brand_ads`, que llena el sensor diario meta_own_ads_sync
 * con el creativo que la Graph API sí entrega (thumbnail 600x600 + copy + título).
 *
 * Reusa el lenguaje visual de la galería de Competencia (.cads-*): son la misma
 * idea mirando a dos lados, y deben verse igual.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  const TOPE = 60;

  /* Meta distingue por qué está detenido un anuncio, y no es lo mismo: pausarlo
     a mano es una decisión sobre la pieza; que lo pause su campaña o su conjunto
     es una decisión sobre otra cosa que se lo llevó por delante. */
  const ESTADO = {
    ACTIVE:          { txt: 'Activo',                  vivo: true },
    PAUSED:          { txt: 'Pausado',                 vivo: false },
    CAMPAIGN_PAUSED: { txt: 'Pausado por su campaña',  vivo: false },
    ADSET_PAUSED:    { txt: 'Pausado por su conjunto', vivo: false },
    ARCHIVED:        { txt: 'Archivado',               vivo: false },
    DELETED:         { txt: 'Eliminado',               vivo: false },
    /* Salieron en la cuenta real (26 y 1): no son "pausado" y no deben
       disfrazarse de eso — un anuncio que Meta rechazó es plata que no está
       corriendo por un motivo que se puede arreglar. */
    WITH_ISSUES:     { txt: 'Con problemas',           vivo: false, alerta: true },
    DISAPPROVED:     { txt: 'Rechazado por Meta',      vivo: false, alerta: true },
    PENDING_REVIEW:  { txt: 'En revisión',             vivo: false },
  };

  Object.assign(DashboardView.prototype, {

    async _renderBrandAds(body) {
      if (!body || !this._orgId || !this._supabase) return;

      let host = body.querySelector('#badsCard');
      if (!host) {
        const ancla = body.querySelector('#bgridVera4');
        const html = this._buildBrandAdsShell();
        if (ancla) ancla.insertAdjacentHTML('beforebegin', html);
        else body.insertAdjacentHTML('beforeend', html);
        host = body.querySelector('#badsCard');
        this._bindBrandAds(body);
      }
      if (!host) return;

      let ads = [];
      let gastos = new Map();
      try {
        const [rAds, rIns] = await Promise.all([
          this._supabase
            .from('brand_ads')
            .select('id, external_ad_id, nombre, status, creative_url, copy_text, titulo, cta, link_url, formato, created_time')
            .eq('organization_id', this._orgId)
            .order('created_time', { ascending: false, nullsFirst: false })
            .limit(TOPE),
          /* El rendimiento vive aparte y se agrega aquí: son ~350 filas diarias,
             menos que pedirle a la BD una vista nueva para esto. */
          this._supabase
            .from('ad_insights_daily')
            .select('external_ad_id, spend, impressions, clicks')
            .eq('organization_id', this._orgId),
        ]);
        if (rAds.error) throw rAds.error;
        ads = rAds.data || [];
        for (const i of (rIns.data || [])) {
          const k = i.external_ad_id;
          if (!k) continue;
          const a = gastos.get(k) || { gasto: 0, impresiones: 0, clics: 0 };
          a.gasto += Number(i.spend) || 0;
          a.impresiones += Number(i.impressions) || 0;
          a.clics += Number(i.clicks) || 0;
          gastos.set(k, a);
        }
      } catch (e) {
        console.warn('[BrandAds] no se pudo leer brand_ads:', e?.message || e);
        host.hidden = true;
        return;
      }

      if (!ads.length) { host.hidden = true; return; }
      host.hidden = false;
      this._badsLista = ads.map((a) => ({ ...a, perf: gastos.get(a.external_ad_id) || null }));
      this._badsPintar(body);
    },

    _buildBrandAdsShell() {
      return `
        <section class="bgrid-card cads-card" id="badsCard" hidden>
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
      /* Arranca en ACTIVOS: lo que está corriendo hoy es lo accionable; el
         archivo de lo pausado es consulta, no primera plana. */
      if (this._badsFiltro == null) this._badsFiltro = activos.length ? 'activos' : 'todos';
      const sel = this._badsFiltro;
      const lista = sel === 'activos' ? activos : todos;

      if (nav) {
        nav.innerHTML = [
          ['activos', __('Activos ({n})', { n: activos.length })],
          ['todos', __('Todos ({n})', { n: todos.length })],
        ].map(([v, l]) => `<button type="button" class="bgrid-seg-btn${v === sel ? ' is-active' : ''}" data-bads-filtro="${v}" role="tab">${this._esc(l)}</button>`).join('');
      }

      if (cont) {
        const total = lista.reduce((a, x) => a + (x.perf?.gasto || 0), 0);
        cont.textContent = total > 0
          ? __('{n} anuncios · {gasto} invertidos', { n: lista.length, gasto: this._badsPlata(total) })
          : __('{n} anuncios', { n: lista.length });
      }

      car.innerHTML = lista.map((a) => this._badsTarjeta(a)).join('');
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
      const est = ESTADO[a.status] || { txt: a.status || '—', vivo: false };
      const medio = a.creative_url
        ? `<img class="cads-img" src="${this._esc(a.creative_url)}" alt="" loading="lazy">`
        : `<div class="cads-img--vacia"><i class="aisc-ico aisc-ico--image" aria-hidden="true"></i></div>`;
      const fecha = this._badsFecha(a.created_time);
      const gasto = a.perf?.gasto ? this._badsPlata(a.perf.gasto) : null;
      const etiqueta = [a.nombre || __('Anuncio'), fecha, est.txt, gasto].filter(Boolean).join(' · ');
      return `
        <article class="cads-item" data-bads-id="${this._esc(a.id)}" tabindex="0" role="button"
                 aria-label="${this._esc(etiqueta)}">
          ${medio}
          ${gasto ? `<span class="cads-veces" title="${this._esc(__('Invertido en este anuncio'))}">${this._esc(gasto)}</span>` : ''}
          ${a.formato === 'video' ? `<span class="cads-fmt"><i class="aisc-ico aisc-ico--play" aria-hidden="true"></i></span>` : ''}
          <div class="cads-hover" aria-hidden="true">
            <p class="cads-hover-marca">${this._esc(a.nombre || __('Anuncio'))}</p>
            <p class="cads-hover-fecha">${this._esc(fecha)}</p>
            <p class="cads-hover-estado${est.vivo ? ' is-vivo' : ''}${est.alerta ? ' is-alerta' : ''}">
              <i class="cads-punto" aria-hidden="true"></i>${this._esc(est.txt)}
            </p>
          </div>
        </article>`;
    },

    _badsFecha(iso) {
      if (!iso) return '';
      try {
        return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch (_) { return ''; }
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
      /* Si el archivado en R2 falló, la URL de Meta caduca: glifo neutro en vez
         del icono roto. Fase de captura porque el evento `error` no burbujea. */
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

    _badsModal(a) {
      if (!window.Modal || typeof window.Modal.show !== 'function') return;
      const est = ESTADO[a.status] || { txt: a.status || '—' };
      const p = a.perf;
      const ctr = p && p.impresiones > 0 ? `${((p.clics / p.impresiones) * 100).toFixed(2)}%` : null;
      const cpm = p && p.impresiones > 0 ? this._badsPlata((p.gasto / p.impresiones) * 1000) : null;
      const datos = [
        [__('Estado'), est.txt],
        [__('Creado'), this._badsFecha(a.created_time) || '—'],
        [__('Formato'), a.formato || '—'],
        [__('Llamado a la acción'), a.cta || '—'],
        p ? [__('Invertido'), this._badsPlata(p.gasto)] : null,
        p ? [__('Impresiones'), p.impresiones.toLocaleString('es-CO')] : null,
        ctr ? [__('CTR'), ctr] : null,
        cpm ? [__('Costo por mil'), cpm] : null,
      ].filter(Boolean);
      const body = `
        <div class="cads-modal">
          ${a.creative_url ? `<img class="cads-modal-img" src="${this._esc(a.creative_url)}" alt="">` : ''}
          ${a.titulo ? `<p class="cads-modal-marca">${this._esc(a.titulo)}</p>` : ''}
          ${a.copy_text ? `<p class="cads-modal-copy">${this._esc(a.copy_text)}</p>` : ''}
          <dl class="cads-modal-datos">
            ${datos.map(([k, v]) => `<div><dt>${this._esc(k)}</dt><dd>${this._esc(v)}</dd></div>`).join('')}
          </dl>
          ${a.link_url ? `<a class="cads-modal-link" href="${this._esc(a.link_url)}" target="_blank" rel="noopener noreferrer">${this._esc(__('Ver a dónde lleva'))}</a>` : ''}
        </div>`;
      window.Modal.show({ title: a.nombre || __('Anuncio'), body, className: 'dash-modal cads-modal-wrap' });
    },
  });
})();
