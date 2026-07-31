/**
 * VeraPulse — el sensor de Vera en el tablero.
 *
 * Muestra si Vera está trabajando AHORA y qué está haciendo. En reposo el
 * logo se apaga y no dice nada: el sensor solo habla cuando hay actividad
 * real (rpc get_vera_pulse, que lee sensor_runs + vera_session_audit).
 *
 * Nada aquí es decorativo. La frase se deriva del `sensor_type` que de verdad
 * corrió y, cuando el sensor apuntaba a una entidad monitoreada, la nombra.
 * Si el tipo es desconocido, dice algo genérico antes que inventar.
 *
 * Uso:
 *   const pulso = new VeraPulse({ supabase, orgId });
 *   pulso.mount(hostEl);   // pinta y arranca el sondeo
 *   pulso.destroy();       // al salir de la vista
 */
(function () {
  const RUTA_LOGO = '/recursos/vera/Logoverablanco.svg';

  /* Cada cuánto se le pregunta a la BD. Los sensores duran de 0,1s a 14s y
     corren encadenados; 15s alcanza para atrapar el ciclo sin castigar la BD.
     El sondeo se PAUSA con la pestaña oculta (nada de timers ciegos). */
  const CADA_MS = 15000;

  /* Una de cada CUANTAS frases es traviesa. El resto son profesionales:
     el guiño sorprende justamente porque es raro. */
  const TRAVIESA_1_DE = 5;

  const T = (s) => (typeof window.__ === 'function' ? window.__(s) : s);

  /* ── El vocabulario de Vera ────────────────────────────────────────────
     Por cada tipo de sensor: frases normales y (opcional) traviesas. {n} se
     reemplaza por la entidad observada; una frase con {n} solo se elige si
     hay entidad. `soloRival` marca las que exigen competidor DIRECTO — sin
     eso, "amenazando a X" podría caerle a un perfil propio. */
  const VOCABULARIO = {
    social: {
      normales: ['leyendo lo que publica {n}', 'revisando publicaciones nuevas', 'leyendo redes sociales'],
      traviesas: ['scrolleando redes', 'chismoseando el feed de {n}'],
    },
    meta_page_insights: {
      normales: ['midiendo el alcance de {n}', 'revisando el rendimiento en Meta'],
      traviesas: ['contando seguidores uno por uno'],
    },
    meta_posts: { normales: ['recogiendo las publicaciones de Meta', 'ordenando lo publicado'] },
    meta_ad_library_sync: {
      normales: ['revisando la pauta de la competencia', 'mirando qué anuncios están corriendo'],
      traviesas: ['espiando los anuncios de {n}'],
    },
    meta_ads_audiences_sync: { normales: ['revisando las audiencias de pauta'] },
    meta_audience_demographics: { normales: ['leyendo la audiencia', 'estudiando a quién le llegas'] },
    meta_campaign_ad_insights: { normales: ['analizando las campañas', 'midiendo qué campaña rinde'] },
    meta_campaign_audience_demographics: { normales: ['cruzando audiencias de campaña'] },
    threat_detection: {
      normales: ['buscando amenazas', 'vigilando el terreno'],
      traviesas: ['amenazando a {n}'],
      soloRival: true,
    },
    audience_alignment_analysis: { normales: ['comparando tu audiencia con la real'] },
    brand_audience_heatmap_compute: { normales: ['dibujando el mapa de tu audiencia'] },
    brand_indexer: {
      normales: ['ordenando lo que sabe de tu marca'],
      traviesas: ['haciendo memoria'],
    },
    trends_keywords: {
      normales: ['cazando palabras que suben', 'midiendo qué se está buscando'],
      traviesas: ['leyendo el futuro'],
    },
    trends_run: { normales: ['midiendo tendencias'] },
    shopify_metrics: { normales: ['observando las ventas', 'revisando la tienda'] },
    mercadolibre_metrics: { normales: ['revisando Mercado Libre'] },
    google_ads_insights: { normales: ['revisando Google Ads'] },
    tiktok_video_insights: {
      normales: ['midiendo los videos de TikTok'],
      traviesas: ['viendo TikToks'],
    },
    ga4_audience_demographics: { normales: ['leyendo el tráfico de la web'] },
    comment_harvest: { normales: ['leyendo comentarios', 'escuchando lo que dicen'] },
    mission_generation: {
      normales: ['decidiendo qué hacer', 'armando el plan'],
      traviesas: ['maquinando'],
    },
    /* Sesiones de razonamiento (vera_session_audit.kind) */
    dashboard_reading: { normales: ['escribiendo tu lectura', 'pensando el tablero'] },
    brand_diagnosis: { normales: ['diagnosticando tu marca'] },
    brand_mimarca_cards: { normales: ['redactando tus tarjetas'] },
  };

  /* Sin vocabulario para ese tipo: se dice lo único que se sabe con certeza. */
  const GENERICAS = ['trabajando en tus datos', 'procesando información'];

  const esRival = (tipoEntidad) => tipoEntidad === 'competidor_directo';

  function elegirFrase(pulso) {
    const voc = VOCABULARIO[pulso.tipo] || null;
    const entidad = pulso.entidad && pulso.entidad.nombre ? pulso.entidad.nombre : null;
    const rival = pulso.entidad ? esRival(pulso.entidad.tipo) : false;

    const usable = (lista) =>
      (lista || []).filter((f) => (f.includes('{n}') ? !!entidad : true));

    const normales = usable(voc && voc.normales).length ? usable(voc.normales) : GENERICAS;
    /* Las traviesas de un vocabulario marcado soloRival exigen rival real. */
    const traviesas = voc && (!voc.soloRival || rival) ? usable(voc.traviesas) : [];

    const vaTraviesa = traviesas.length && Math.floor(Math.random() * TRAVIESA_1_DE) === 0;
    const banco = vaTraviesa ? traviesas : normales;
    const frase = banco[Math.floor(Math.random() * banco.length)];
    /* Se traduce ANTES de meter el nombre: la clave del catálogo lleva {n}.
       (Estas frases viven en un array, así que i18n-extract no las detecta:
       sus traducciones se mantienen a mano en js/i18n/en.js.) */
    return T(frase).replace('{n}', entidad || '');
  }

  /* Detalle honesto para el tooltip: las cifras que el sensor acaba de traer. */
  function detalleStats(stats) {
    if (!stats || typeof stats !== 'object') return '';
    const partes = Object.entries(stats)
      .filter(([, v]) => typeof v === 'number' && v > 0)
      .slice(0, 3)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v.toLocaleString('es-CO')}`);
    return partes.join(' · ');
  }

  function hace(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    if (!isFinite(ms) || ms < 0) return '';
    const min = Math.floor(ms / 60000);
    if (min < 1) return T('hace segundos');
    if (min < 60) return T('hace {n} min').replace('{n}', min);
    const h = Math.floor(min / 60);
    if (h < 24) return T('hace {n} h').replace('{n}', h);
    return T('hace {n} d').replace('{n}', Math.floor(h / 24));
  }

  class VeraPulse {
    constructor({ supabase, orgId } = {}) {
      this.sb = supabase || window.supabase || null;
      this.orgId = orgId || null;
      this.host = null;
      this.timer = null;
      this._onVis = null;
      /* Clave de la actividad en curso: mientras no cambie, la frase NO se
         re-sortea (si no, el texto bailaría en cada sondeo). */
      this._clave = null;
      this._frase = '';
    }

    /* Re-montable: el tablero reescribe la barra del hero en cada cambio de
       tab, así que mount() puede llamarse varias veces. Se desconecta primero
       para no acumular timers ni listeners. */
    mount(host) {
      if (!host) return;
      this._desconectar();
      this.host = host;
      host.innerHTML = this._html({ activa: false });
      if (!this.sb || !this.orgId) return; // sin sesión no hay pulso: queda apagado
      this._onVis = () => {
        if (document.visibilityState === 'visible') this._arrancar();
        else this._parar();
      };
      document.addEventListener('visibilitychange', this._onVis);
      this._arrancar();
    }

    _arrancar() {
      if (this.timer) return;
      this._sondear();
      this.timer = setInterval(() => this._sondear(), CADA_MS);
    }

    _parar() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }

    async _sondear() {
      try {
        const { data, error } = await this.sb.rpc('get_vera_pulse', { p_org_id: this.orgId });
        if (error) throw error;
        this._pintar(data || { activa: false });
      } catch (e) {
        /* Un pulso que no se puede leer se apaga; nunca se finge actividad. */
        console.warn('[VeraPulse] sin pulso:', e && e.message ? e.message : e);
        this._pintar({ activa: false });
      }
    }

    _pintar(pulso) {
      if (!this.host) return;
      if (pulso.activa) {
        const clave = `${pulso.tipo}|${pulso.desde}`;
        if (clave !== this._clave) {
          this._clave = clave;
          this._frase = elegirFrase(pulso);
        }
      } else {
        this._clave = null;
        this._frase = '';
      }
      this.host.innerHTML = this._html(pulso);
    }

    _html(pulso) {
      const activa = !!pulso.activa;
      /* Tooltip: en actividad, el detalle técnico real (paso o cifras del
         sensor); en reposo, cuándo fue la última señal. */
      let title = T('Vera');
      if (activa) {
        const extra = pulso.paso || detalleStats(pulso.stats);
        title = extra ? `${T('Vera')} · ${extra}` : T('Vera trabajando');
      } else if (pulso.ultimo && pulso.ultimo.cuando) {
        title = `${T('Vera')} · ${T('última señal')} ${hace(pulso.ultimo.cuando)}`;
      }

      const puntos = activa
        ? '<span class="vera-pulse-dots" aria-hidden="true"><i></i><i></i><i></i></span>'
        : '';
      const frase = activa && this._frase
        ? `<span class="vera-pulse-frase">${this._esc(this._frase)}</span>`
        : '';

      return `
        <div class="vera-pulse${activa ? ' is-activa' : ''}" role="status" aria-live="polite" title="${this._esc(title)}">
          <img class="vera-pulse-logo" src="${RUTA_LOGO}" alt="${this._esc(T('Vera'))}" width="60" height="23">
          ${puntos}
          ${frase}
        </div>`;
    }

    _esc(s) {
      if (s == null) return '';
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    _desconectar() {
      this._parar();
      if (this._onVis) {
        document.removeEventListener('visibilitychange', this._onVis);
        this._onVis = null;
      }
    }

    destroy() {
      this._desconectar();
      this.host = null;
    }
  }

  /* Expuesto para prueba: las reglas de qué frase se puede decir (nunca {n}
     sin entidad, "amenazando" solo a rival real) se verifican en
     test/vera-pulse.test.js sin tener que montar el DOM. */
  VeraPulse._elegirFrase = elegirFrase;
  VeraPulse._VOCABULARIO = VOCABULARIO;

  window.VeraPulse = VeraPulse;
})();
