/**
 * Avisos — la campana de la consola (ADR-0054): panel, lista y tarjeta por tipo.
 *
 * Un aviso es un HECHO tipado (`type_code` + `metadata` con parámetros); el texto
 * es presentación: aquí se traduce con `__()` y los parámetros que el tipo declara
 * (`alert_types.params`). Si el tipo no tiene render, o le falta un parámetro, se
 * pinta el respaldo `title/body` que dejó la base — nunca una tarjeta vacía.
 * Cada tipo tiene icono, etiqueta y resolutor de enlace (por familia si no
 * declara uno). El test `avisos-render.test.js` falla si aparece un tipo activo
 * sin las tres cosas.
 *
 * Navigation.js solo monta la campana: abre/cierra el panel y refresca el punto.
 * Los datos van por AvisosDatos; el markdown del cuerpo por MarkdownLite.
 */
(function () {
  'use strict';

  const t = (k, p) => (typeof window.__ === 'function' ? window.__(k, p) : k);
  const esc = (s) => (window.MarkdownLite ? window.MarkdownLite.escapar(s) : String(s == null ? '' : s));
  const num = (v) => (v == null || v === '' ? null : Number(v).toLocaleString('es'));

  /* ── Familias: icono y ruta por defecto ──────────────────────────────────── */
  const FAMILIAS = Object.freeze({
    billing: { icono: 'aisc-ico--credit-card', etiqueta: 'Créditos y plan', ruta: '/credits' },
    credits: { icono: 'aisc-ico--zap', etiqueta: 'Créditos', ruta: '/credits' },
    flows: { icono: 'aisc-ico--flow', etiqueta: 'Flujos', ruta: '/production' },
    ops: { icono: 'aisc-ico--alert-info', etiqueta: 'Plataforma', ruta: '/organization' },
    ingest: { icono: 'aisc-ico--radar', etiqueta: 'Monitoreo', ruta: '/monitoring' },
    agent: { icono: 'aisc-ico--sparkles', etiqueta: 'Vera', ruta: '/vera' },
    intel: { icono: 'aisc-ico--growth', etiqueta: 'Inteligencia', ruta: '/dashboard' },
    marketing: { icono: 'aisc-ico--megaphone', etiqueta: 'Marketing', ruta: '/command-center' },
  });

  /* ── Render por tipo: titulo(p)/cuerpo(p) con los params del contrato; null = respaldo ── */
  const techo = (p) => (p.techo === 'plataforma' ? t('el techo de la plataforma') : t('el techo de la marca'));
  const RENDER = Object.freeze({
    'billing.provider_cap_near': { icono: 'aisc-ico--credit-card', etiqueta: 'Gasto cerca del tope', params: ['gastado', 'tope', 'medidor'],
      titulo: (p) => t('{medidor} va en {gastado} de {tope} USD', { medidor: p.medidor, gastado: num(p.gastado), tope: num(p.tope) }),
      cuerpo: (p) => t('Este mes ya se gastó el {pct}% de {techo}. Si sigue así, se detiene al llegar al tope.', { pct: Math.round((Number(p.gastado) / Math.max(1, Number(p.tope))) * 100), techo: techo(p) }), ruta: '/organization' },
    'billing.provider_cap_hit': { icono: 'aisc-ico--credit-card', etiqueta: 'Tope de gasto alcanzado', params: ['gastado', 'tope', 'medidor'],
      titulo: (p) => t('{medidor} llegó a su tope ({tope} USD)', { medidor: p.medidor, tope: num(p.tope) }),
      cuerpo: (p) => t('Se gastaron {gastado} USD, {techo}. Las corridas que usan este medidor quedan detenidas hasta el próximo ciclo o hasta subir el tope.', { gastado: num(p.gastado), techo: techo(p) }), ruta: '/organization' },
    'billing.low_credit': { icono: 'aisc-ico--zap', etiqueta: 'Créditos bajos', params: [], titulo: null, cuerpo: null, ruta: '/credits' },
    'credits.exhausted': { icono: 'aisc-ico--zap', etiqueta: 'Sin créditos', params: ['disponible'],
      titulo: () => t('La marca se detuvo: no quedan créditos'),
      cuerpo: (p) => t('Disponible: {n} créditos. Nada que cueste vuelve a correr hasta recargar.', { n: num(p.disponible) }), ruta: '/credits' },
    'billing.payment_failed': { icono: 'aisc-ico--credit-card', etiqueta: 'Pago fallido', params: [], titulo: null, cuerpo: null, ruta: '/organization' },
    'billing.plan_expiring': { icono: 'aisc-ico--calendar', etiqueta: 'Plan por vencer', params: [], titulo: null, cuerpo: null, ruta: '/plans' },
    'flows.schedule_stuck': { icono: 'aisc-ico--flow', etiqueta: 'Programación atascada', params: ['fallos', 'motivo'],
      titulo: (p) => t('Una programación falló {n} veces seguidas', { n: num(p.fallos) }),
      cuerpo: (p) => t('Último motivo: {motivo}. Quedó en pausa hasta que alguien la revise.', { motivo: p.motivo }), ruta: '/production' },
    'ops.job_dead': { icono: 'aisc-ico--alert-info', etiqueta: 'Trabajo caído', params: ['kind', 'intentos'],
      titulo: (p) => t('Murió el trabajo «{kind}»', { kind: p.kind }),
      cuerpo: (p) => t('Agotó sus {n} intentos. Lo que tenía que hacer NO se hizo.', { n: num(p.intentos) }), ruta: '/organization' },
    'ops.schedule_mute': { icono: 'aisc-ico--clock', etiqueta: 'Agenda muda', params: ['kind', 'ultimo_exito'],
      titulo: (p) => t('La agenda «{kind}» lleva tiempo sin correr bien', { kind: p.kind }),
      cuerpo: (p) => t('Último éxito: {cuando}.', { cuando: fecha(p.ultimo_exito) }), ruta: '/organization' },
    'ingest.source_mute': { icono: 'aisc-ico--radar', etiqueta: 'Fuente muda', params: ['actor', 'target', 'dias'],
      titulo: (p) => t('{actor} lleva {dias} días sin traer nada de {target}', { actor: p.actor, dias: num(p.dias), target: p.target }),
      cuerpo: (p) => t('{n} corridas seguidas sin datos. Revisa la fuente o el acceso.', { n: num(p.corridas) }), ruta: '/monitoring' },
    'ingest.quota_near': { icono: 'aisc-ico--radar', etiqueta: 'Cuota cerca del tope', params: [], titulo: null, cuerpo: null, ruta: '/monitoring' },
    'ingest.schedule_stale': { icono: 'aisc-ico--clock', etiqueta: 'Agenda desactualizada', params: [], titulo: null, cuerpo: null, ruta: '/monitoring' },
    'ingest.quota_exhausted': { icono: 'aisc-ico--radar', etiqueta: 'Cuota agotada', params: [], titulo: null, cuerpo: null, ruta: '/monitoring' },
    'ingest.quota_blind': { icono: 'aisc-ico--radar', etiqueta: 'Cuota sin medir', params: [], titulo: null, cuerpo: null, ruta: '/monitoring' },
    'ingest.source_down': { icono: 'aisc-ico--radar', etiqueta: 'Proveedor caído', params: [], titulo: null, cuerpo: null, ruta: '/monitoring' },
    'agent.template_outdated': { icono: 'aisc-ico--sparkles', etiqueta: 'Vera desactualizada', params: ['template_code', 'tiene', 'hay'],
      titulo: (p) => t('Tu Vera usa una versión vieja de «{plantilla}»', { plantilla: p.template_code }),
      cuerpo: (p) => t('Tiene la v{tiene}; hay v{hay}. Actualízala desde Seguridad › Agentes.', { tiene: p.tiene, hay: p.hay }), ruta: '/vera' },
    'agent.note': { icono: 'aisc-ico--sparkles', etiqueta: 'Nota de Vera', params: [], titulo: null, cuerpo: null, ruta: '/vera' },
    'agent.needs_approval': { icono: 'aisc-ico--sparkles', etiqueta: 'Vera pide aprobación', params: [], titulo: null, cuerpo: null, ruta: '/vera' },
    'agent.job_dead': { icono: 'aisc-ico--sparkles', etiqueta: 'Turno de Vera caído', params: [], titulo: null, cuerpo: null, ruta: '/vera' },
    'intel.critical_signal': { icono: 'aisc-ico--growth', etiqueta: 'Señal crítica', params: [], titulo: null, cuerpo: null, ruta: '/dashboard' },
    'marketing.approval': { icono: 'aisc-ico--megaphone', etiqueta: 'Aprobación de campaña', params: [], titulo: null, cuerpo: null, ruta: '/command-center' },
  });

  function fecha(iso) {
    if (!iso) return t('nunca');
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function haceCuanto(iso) {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms)) return '';
    const m = Math.round(ms / 60000);
    if (m < 1) return t('ahora');
    if (m < 60) return t('hace {n} min', { n: m });
    const h = Math.round(m / 60);
    if (h < 24) return t('hace {n} h', { n: h });
    const d = Math.round(h / 24);
    if (d < 30) return t('hace {n} d', { n: d });
    return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  }

  /** Icono, etiqueta y ruta de un aviso (tipo o, si no, familia). */
  function presentacion(aviso) {
    const r = RENDER[aviso.type] || null;
    const fam = FAMILIAS[aviso.family] || FAMILIAS.ops;
    return { icono: r?.icono || fam.icono, etiqueta: r?.etiqueta || aviso.tipo?.name || fam.etiqueta, ruta: aviso.link || r?.ruta || fam.ruta };
  }

  /** Título y cuerpo traducidos por tipo si el aviso trae TODOS los params; si no, el respaldo de la base. */
  function texto(aviso) {
    const r = RENDER[aviso.type];
    const p = aviso.params || {};
    const completos = r && r.titulo && (r.params || []).every((k) => p[k] != null && p[k] !== '');
    if (completos) {
      try { return { titulo: r.titulo(p), cuerpo: r.cuerpo ? r.cuerpo(p) : '', traducido: true }; } catch (_) { /* cae al respaldo */ }
    }
    return { titulo: aviso.title || '', cuerpo: aviso.body || '', traducido: false };
  }

  /** Enlace ya con el prefijo de la marca (o absoluto). */
  function enlace(ruta) {
    if (!ruta) return '';
    if (/^https?:\/\//i.test(ruta)) return ruta;
    const nav = window.appNavigation;
    return (nav && typeof nav._resolveActionUrl === 'function') ? nav._resolveActionUrl(ruta) : ruta;
  }

  function tarjeta(aviso) {
    const { icono, etiqueta, ruta } = presentacion(aviso);
    const { titulo, cuerpo } = texto(aviso);
    const href = enlace(ruta);
    const cuerpoHtml = cuerpo ? (window.MarkdownLite ? window.MarkdownLite.render(cuerpo) : `<p>${esc(cuerpo)}</p>`) : '';
    const veces = aviso.veces > 1 ? `<span class="aviso-veces" title="${esc(t('Se repitió mientras seguía vivo'))}">×${esc(aviso.veces)}</span>` : '';
    return `
      <article class="aviso aviso--${esc(aviso.severity)}${aviso.is_read ? ' aviso--leido' : ''}" data-aviso-id="${esc(aviso.id)}" data-aviso-href="${esc(href)}">
        <span class="aviso-icono" aria-hidden="true"><i class="aisc-ico ${esc(icono)}"></i></span>
        <div class="aviso-cuerpo">
          <div class="aviso-cabecera">
            <span class="aviso-etiqueta">${esc(t(etiqueta))}</span>
            ${veces}
            <time class="aviso-cuando" datetime="${esc(aviso.created_at || '')}">${esc(haceCuanto(aviso.created_at))}</time>
          </div>
          <h4 class="aviso-titulo">${esc(titulo)}</h4>
          ${cuerpoHtml ? `<div class="aviso-texto">${cuerpoHtml}</div>` : ''}
          <div class="aviso-acciones">
            ${href ? `<button type="button" class="aviso-btn aviso-btn--ir" data-aviso-ir>${esc(t('Abrir'))} <i class="aisc-ico aisc-ico--chevron-right" aria-hidden="true"></i></button>` : ''}
            ${aviso.is_read ? '' : `<button type="button" class="aviso-btn" data-aviso-leer>${esc(t('Marcar como leído'))}</button>`}
          </div>
        </div>
      </article>`;
  }

  /* ── Panel ──────────────────────────────────────────────────────────────── */
  const estado = { pestana: 'unread', avisos: [], newest: null, orgId: null, cargando: false };

  function orgActual() { return window.currentOrgId || window.appNavigation?.currentOrgId || null; }

  function cabecera(total) {
    const configHref = enlace('/organization/avisos');
    return `
      <div class="avisos-cabecera">
        <div class="avisos-titulo"><i class="aisc-ico aisc-ico--notification" aria-hidden="true"></i> <span>${esc(t('Avisos'))}</span>${total ? ` <span class="avisos-cuenta">${esc(total)}</span>` : ''}</div>
        <div class="avisos-pestanas" role="tablist">
          <button type="button" role="tab" class="avisos-pestana${estado.pestana === 'unread' ? ' is-activa' : ''}" data-avisos-pestana="unread">${esc(t('Sin leer'))}</button>
          <button type="button" role="tab" class="avisos-pestana${estado.pestana === 'all' ? ' is-activa' : ''}" data-avisos-pestana="all">${esc(t('Todos'))}</button>
        </div>
        <div class="avisos-herramientas">
          ${total ? `<button type="button" class="aviso-btn" data-avisos-todo>${esc(t('Marcar todo como leído'))}</button>` : ''}
          <a class="aviso-btn aviso-btn--link" href="${esc(configHref)}" data-route="${esc(configHref)}">${esc(t('Preferencias'))}</a>
        </div>
      </div>`;
  }

  /** Pinta el panel completo dentro de `contenedor` y cablea los clics. `alCerrar` cierra el panel que lo aloja. */
  async function pintar(contenedor, { alCerrar = null } = {}) {
    if (!contenedor) return;
    const orgId = orgActual();
    estado.orgId = orgId;
    contenedor.innerHTML = `<div class="avisos">${cabecera(0)}<div class="avisos-lista"><div class="avisos-vacio">${esc(t('Cargando…'))}</div></div></div>`;
    if (!orgId || !window.AvisosDatos) return;
    estado.cargando = true;
    try {
      const [c, lista] = await Promise.all([window.AvisosDatos.contador(orgId), window.AvisosDatos.lista(orgId, { estado: estado.pestana, limite: 50 })]);
      estado.avisos = lista; estado.newest = c.newest;
      const cuerpo = lista.length
        ? lista.map(tarjeta).join('')
        : `<div class="avisos-vacio"><i class="aisc-ico aisc-ico--check" aria-hidden="true"></i><p>${esc(estado.pestana === 'unread' ? t('Estás al día: nada sin leer.') : t('Sin avisos todavía.'))}</p></div>`;
      contenedor.innerHTML = `<div class="avisos">${cabecera(c.total)}<div class="avisos-lista">${cuerpo}</div></div>`;
      cablear(contenedor, alCerrar);
    } catch (e) {
      console.warn('[avisos] pintar:', e?.message || e);
      contenedor.innerHTML = `<div class="avisos">${cabecera(0)}<div class="avisos-lista"><div class="avisos-vacio">${esc(t('No se pudieron cargar los avisos.'))}</div></div></div>`;
      cablear(contenedor, alCerrar);
    } finally { estado.cargando = false; }
  }

  function cablear(contenedor, alCerrar) {
    if (contenedor.dataset.avisosCableado === '1') return;
    contenedor.dataset.avisosCableado = '1';
    contenedor.addEventListener('click', async (e) => {
      const pest = e.target.closest('[data-avisos-pestana]');
      if (pest) { e.preventDefault(); estado.pestana = pest.getAttribute('data-avisos-pestana'); await pintar(contenedor, { alCerrar }); return; }
      if (e.target.closest('[data-avisos-todo]')) {
        e.preventDefault();
        try { await window.AvisosDatos.marcarTodo(estado.orgId, estado.newest); } catch (err) { console.warn('[avisos] marcar todo:', err?.message || err); }
        avisarCambio(); await pintar(contenedor, { alCerrar }); return;
      }
      const card = e.target.closest('[data-aviso-id]');
      if (!card) return;
      const aviso = estado.avisos.find((a) => String(a.id) === card.getAttribute('data-aviso-id'));
      if (!aviso) return;
      if (e.target.closest('[data-aviso-leer]')) {
        e.preventDefault();
        try { await window.AvisosDatos.marcar(aviso, 'read'); } catch (err) { console.warn('[avisos] marcar:', err?.message || err); }
        avisarCambio(); await pintar(contenedor, { alCerrar }); return;
      }
      if (e.target.closest('[data-aviso-ir]') || e.target.closest('.aviso-titulo')) {
        e.preventDefault();
        const href = card.getAttribute('data-aviso-href');
        if (!aviso.is_read) { try { await window.AvisosDatos.marcar(aviso, href ? 'acted' : 'read'); } catch (_) { /* se navega igual */ } avisarCambio(); }
        if (typeof alCerrar === 'function') alCerrar();
        if (href) { if (/^https?:\/\//i.test(href)) window.open(href, '_blank', 'noopener'); else if (window.router) window.router.navigate(href); else window.location.href = href; }
      }
    });
  }

  function avisarCambio() { try { document.dispatchEvent(new CustomEvent('notifications-updated')); } catch (_) { /* nada */ } }

  /** Punto rojo de la campana: hay o no hay avisos vivos sin leer. */
  async function refrescarPunto(badgeEl) {
    if (!badgeEl) return 0;
    const orgId = orgActual();
    if (!orgId || !window.AvisosDatos) { badgeEl.hidden = true; badgeEl.setAttribute('aria-hidden', 'true'); return 0; }
    try {
      const c = await window.AvisosDatos.contador(orgId);
      badgeEl.textContent = '';
      if (c.total > 0) { badgeEl.hidden = false; badgeEl.removeAttribute('aria-hidden'); } else { badgeEl.hidden = true; badgeEl.setAttribute('aria-hidden', 'true'); }
      return c.total;
    } catch (_) { badgeEl.hidden = true; badgeEl.setAttribute('aria-hidden', 'true'); return 0; }
  }

  window.Avisos = Object.freeze({ RENDER, FAMILIAS, tarjeta, pintar, refrescarPunto, presentacion, texto, haceCuanto });
})();
