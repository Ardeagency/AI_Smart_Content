/**
 * Shell — el cascarón ÚNICO de la consola (L3, 24/09). Sustituye a Navigation.js
 * y sus tres mixins. Queda FIJO: solo transiciona #app-container
 * (js/ui/transiciones.js). Estilos en css/modules/shell.css, solo tokens.
 *
 *   ┌ sidebar ──────────────┐┌ topbar ─────────────────────────────────────┐
 *   │ [marca ▾] plan        ││ ☰  Marca › Sección          ⚡  🔔  (JC)    │
 *   │ Inicio · Vera         │└─────────────────────────────────────────────┘
 *   │ CREAR  Studio …       │  #app-container (lo pinta cada vista)
 *   │ MARCA  Identidad …    │
 *   │ ── créditos (lectura) │
 *   │ ── Configuración  «   │
 *   └───────────────────────┘
 *
 * Reglas:
 * - Lo que está «en obras» (js/en-obras.js) NO aparece en la navegación: la ruta
 *   sigue pintando su página gris, pero el menú de un SaaS no enseña obras.
 * - Cada ítem pide su capacidad (authService.hasPermission); la UI oculta, la base
 *   autoriza (ADR-0050).
 * - Datos por window.ShellDatos (js/services/ShellDataService.js): cero .from() aquí.
 * - Nunca alert()/confirm()/prompt(): los paneles deciden en su sitio.
 * - Compatibilidad con las vistas (window.appNavigation): render(), initialized,
 *   currentOrgId, loadCreditsFromDb(), collapseForImmersive(), restoreFromImmersive(),
 *   getUserSidebarRoute(), getOrgBasePath(); ids #appHeader, #headerTitle,
 *   #headerProductionSlot; clases de body has-sidebar / sidebar-collapsed / no-nav.
 */
(function () {
  'use strict';

  const t = (s, p) => (typeof window.__ === 'function' ? window.__(s, p) : s);
  const esc = (s) => (window.BaseView?.escapeHtml ? window.BaseView.escapeHtml(s) : String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])));
  const ICONO_VER = '20260924a';
  const icono = (src) => `<img src="${src}?nav=${ICONO_VER}" class="shell-icono" alt="" width="16" height="16" aria-hidden="true">`;

  /* Mapa de navegación del SaaS (L3). `ruta` = segmento bajo /org/:short/:slug.
     i18n-keep: __('Inicio') __('Vera') __('Crear') __('Studio') __('Imagen') __('Video')
     __('Producciones') __('Historial') __('Marca') __('Identidad') __('Productos')
     __('Servicios') __('Escenarios') __('Personajes') __('Competencia') */
  const MENU = [
    { seccion: null, items: [
      { id: 'inicio', etiqueta: 'Inicio', ruta: 'dashboard', icono: '/recursos/icons/dashboard.svg', cap: 'insights.view' },
      { id: 'vera', etiqueta: 'Vera', ruta: 'vera', icono: '/recursos/vera/Vera.svg', cap: 'vera.chat' },
    ] },
    { seccion: 'Crear', items: [
      { id: 'studio', etiqueta: 'Studio', ruta: 'studio/flows', icono: '/recursos/icons/flows.svg', cap: 'studio.create', hijos: 'flujos' },
      { id: 'imagen', etiqueta: 'Imagen', ruta: 'image', icono: '/recursos/icons/image.svg', cap: 'studio.create' },
      { id: 'video', etiqueta: 'Video', ruta: 'video', icono: '/recursos/icons/video.svg', cap: 'video.create' },
      { id: 'producciones', etiqueta: 'Producciones', ruta: 'production', icono: '/recursos/icons/Production.svg', cap: 'production.create' },
      { id: 'historial', etiqueta: 'Historial', ruta: 'execution-history', icono: '/recursos/icons/history.svg', cap: 'production.create' },
    ] },
    { seccion: 'Marca', items: [
      { id: 'identidad', etiqueta: 'Identidad', ruta: 'brand', icono: '/recursos/icons/Brands.svg', cap: 'brand.identity.edit', hijos: [
        { etiqueta: 'Productos', ruta: 'products' },
        { etiqueta: 'Servicios', ruta: 'services' },
        { etiqueta: 'Escenarios', ruta: 'places' },
        { etiqueta: 'Personajes', ruta: 'characters' },
      ] },
      { id: 'competencia', etiqueta: 'Competencia', ruta: 'monitoring', icono: '/recursos/icons/monitoring.svg', cap: 'monitoring.view' },
    ] },
  ];

  /* Título de la topbar por segmento (el más largo que coincida gana).
     BaseView.updateHeaderContext() lo puede afinar desde la vista. */
  const TITULOS = {
    dashboard: 'Inicio', vera: 'Vera', 'studio/flows': 'Studio', 'studio/catalog': 'Studio', studio: 'Studio',
    image: 'Imagen', video: 'Video', production: 'Producciones', 'execution-history': 'Historial',
    brand: 'Identidad', brands: 'Identidad', 'brand-organization': 'Identidad', products: 'Productos',
    'product-detail': 'Producto', services: 'Servicios', places: 'Escenarios', characters: 'Personajes',
    monitoring: 'Competencia', organization: 'Configuración', configuracion: 'Configuración', cuenta: 'Tu cuenta',
    plans: 'Planes', credits: 'Créditos',
    'plans/cancel': 'Planes',
    '404': 'Página no encontrada', '403': 'Sin acceso',
  };
  /* i18n-keep: __('Configuración') __('Planes') __('Créditos') __('Producto')
     __('Página no encontrada') __('Sin acceso') */

  const CLAVE_COLAPSADO = 'sidebarCollapsed';
  const CLAVE_ABIERTO = 'shellSubmenuAbierto';

  function leer(clave) { try { return localStorage.getItem(clave); } catch (_) { return null; } }
  function guardar(clave, v) { try { localStorage.setItem(clave, v); } catch (_) { /* navegación privada */ } }

  function segmento(path) {
    return String(path || '').split('?')[0].replace(/^\/org\/[^/]+\/[^/]+/, '').replace(/^\/+|\/+$/g, '');
  }

  function iniciales(nombre) {
    const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '·';
  }

  function hace(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    const min = Math.floor((Date.now() - d) / 60000);
    if (min < 1) return t('ahora');
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} h`;
    const dias = Math.floor(h / 24);
    if (dias < 7) return t('{n} d', { n: dias });
    return d.toLocaleDateString(window.i18n?.getLocale?.() || 'es', { day: 'numeric', month: 'short' });
  }

  class Shell {
    constructor() {
      this.container = document.getElementById('navigation-container');
      this.initialized = false;
      this.currentOrgId = null;
      this.isCollapsed = leer(CLAVE_COLAPSADO) === 'true';
      this._inmersivo = null;
      this._panel = null;          // { id, nodo, boton }
      this._drawerAbierto = false;
      this._categorias = [];
      this._guardados = false;
      this._orgNombre = '';
      this._globales = false;
      this._sondeo = null;
    }

    /* ── Rutas ─────────────────────────────────────────────────────────── */

    /** ¿La ruta actual lleva shell? Las de acceso no; todo lo demás que requiere sesión, sí. */
    _llevaShell() {
      const p = window.location.pathname || '/';
      if (p.startsWith('/invitacion')) return false;
      return !['/', '/login', '/signin', '/recuperar', '/cambiar-contrasena', '/verification', '/mfa', '/index.html'].includes(p);
    }

    getOrgBasePath() {
      if (!this.currentOrgId) return '';
      const nombre = this._orgNombre || window.currentOrgName || '';
      if (nombre && window.getOrgPathPrefix) return window.getOrgPathPrefix(this.currentOrgId, nombre) || '';
      if (window.currentOrgSlug && window.getOrgShortId) return `/org/${window.getOrgShortId(this.currentOrgId)}/${window.currentOrgSlug}`;
      return '';
    }

    getUserSidebarRoute(sufijo) {
      const base = this.getOrgBasePath();
      return base ? `${base}/${sufijo}` : `/${sufijo}`;
    }

    /** Enlace de un aviso (Avisos.js): una ruta corta cuelga de la marca actual. */
    _resolveActionUrl(ruta) {
      const u = String(ruta || '').trim();
      if (!u || /^https?:\/\//i.test(u) || u.startsWith('/org/')) return u;
      const base = this.getOrgBasePath();
      return base ? `${base}${u.startsWith('/') ? u : `/${u}`}` : u;
    }

    _visible(item) {
      if (window.EnObras?.es(`/${item.ruta}`)) return false;
      if (!item.cap || !window.authService?.hasPermission) return true;
      return window.authService.hasPermission(item.cap);
    }

    /* ── Render ────────────────────────────────────────────────────────── */

    async render() {
      if (!this.container) return;
      if (!this._llevaShell()) {
        this._desmontar();
        return;
      }
      const orgId = window.currentOrgId || null;
      if (this.initialized && orgId === this.currentOrgId) {
        this._marcarActivo();
        this._titulo();
        return;
      }
      this.currentOrgId = orgId;
      this._orgNombre = window.currentOrgName || '';

      if (orgId && window.ShellDatos) {
        const [cats, guardados] = await Promise.all([
          window.ShellDatos.categoriasDeFlujos().catch(() => []),
          window.ShellDatos.tieneGuardados(orgId).catch(() => false),
        ]);
        this._categorias = cats || [];
        this._guardados = !!guardados;
      }

      window.Estado.pintar(this.container, this._html());
      document.body.classList.remove('no-nav', 'has-header-only');
      document.body.classList.add('has-sidebar');
      this._aplicarColapso();
      this._enlazar();
      this._globalesUnaVez();
      this._marcarActivo();
      this._titulo();
      this._banner();
      this.initialized = true;

      // Datos que llegan después sin bloquear la pintura del shell.
      this._pintarMarca();
      this.loadCreditsFromDb();
      this._pintarPlan();
      this._refrescarPuntos();
      this._sondear();
    }

    _desmontar() {
      this._cerrarPanel();
      this._cerrarDrawer();
      window.Estado.pintar(this.container, '');
      document.body.classList.remove('has-sidebar', 'sidebar-collapsed', 'has-header-only');
      document.body.classList.add('no-nav');
      this.initialized = false;
      this.currentOrgId = null;
      if (this._sondeo) { clearInterval(this._sondeo); this._sondeo = null; }
    }

    _html() {
      const ruta = (s) => esc(this.getUserSidebarRoute(s));
      const abierto = leer(CLAVE_ABIERTO) || '';

      const grupos = MENU.map((g) => {
        const items = g.items.filter((i) => this._visible(i));
        if (!items.length) return '';
        const lis = items.map((i) => {
          const href = ruta(i.ruta);
          const hijos = this._hijos(i);
          const enlace = `
            <a href="${href}" class="shell-enlace" data-ruta="${href}" data-id="${i.id}" title="${esc(t(i.etiqueta))}">
              ${icono(i.icono)}<span class="shell-texto">${esc(t(i.etiqueta))}</span>
            </a>`;
          if (!hijos.length) return `<li>${enlace}</li>`;
          const id = `shell-sub-${i.id}`;
          const esAbierto = abierto === i.id;
          return `
            <li class="shell-grupo${esAbierto ? ' is-abierto' : ''}" data-grupo="${i.id}">
              <div class="shell-grupo-cabeza">
                ${enlace}
                <button type="button" class="shell-desplegar" aria-expanded="${esAbierto}" aria-controls="${id}" aria-label="${esc(t('Mostrar {x}', { x: t(i.etiqueta) }))}">
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              </div>
              <ul class="shell-sub" id="${id}">
                ${hijos.map((h) => `<li><a href="${esc(h.href)}" class="shell-enlace shell-enlace--sub" data-ruta="${esc(h.href)}">${esc(h.etiqueta)}</a></li>`).join('')}
              </ul>
            </li>`;
        }).join('');
        return `
          <div class="shell-seccion">
            ${g.seccion ? `<p class="shell-seccion-titulo" aria-hidden="true">${esc(t(g.seccion))}</p>` : ''}
            <ul class="shell-lista">${lis}</ul>
          </div>`;
      }).join('');

      const creditos = ruta('credits');
      const config = ruta('configuracion/general');
      const planes = ruta('plans');

      return `
        <div class="shell-velo" id="navOverlay" hidden></div>
        <aside class="shell-sidebar" id="sideNavigation" aria-label="${esc(t('Navegación principal'))}">
          <div class="shell-marca">
            <button type="button" class="shell-marca-btn" id="shellMarcaBtn" aria-labelledby="navOrgName" aria-haspopup="true" aria-expanded="false" aria-controls="shellPanelMarcas">
              <span class="shell-marca-logo" id="shellMarcaLogo" aria-hidden="true">${esc(iniciales(this._orgNombre))}</span>
              <span class="shell-marca-texto">
                <span class="shell-marca-nombre" id="navOrgName">${esc(this._orgNombre || t('Tu marca'))}</span>
                <span class="shell-marca-plan" id="navOrgPlan"></span>
              </span>
              <svg class="shell-marca-flecha" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>

          <nav class="shell-menu" aria-label="${esc(t('Secciones'))}">${grupos}</nav>

          <div class="shell-pie">
            <div class="nav-plan-card" id="navPlanCard" hidden>
              <div class="nav-plan-card-heading">
                <span class="nav-plan-card-title">${esc(t('Actualiza tu plan'))}</span>
                <span class="nav-plan-card-name" id="navPlanName">—</span>
              </div>
              <a href="${planes}" class="nav-plan-card-cta" id="navUpgradeBtn" data-ruta="${planes}" aria-label="${esc(t('Ver los planes'))}">
                <i class="aisc-ico aisc-ico--flecha-landing-1-seccion-2 nav-plan-card-arrow" aria-hidden="true"></i>
              </a>
            </div>
            <a href="${creditos}" class="shell-creditos" data-ruta="${creditos}" title="${esc(t('Créditos'))}">
              <span class="shell-creditos-fila">
                ${icono('/recursos/icons/credits.svg')}
                <span class="shell-texto">${esc(t('Créditos'))}</span>
                <span class="shell-creditos-valor" id="navTokensValue">—</span>
              </span>
              <span class="shell-creditos-barra" aria-hidden="true"><span class="shell-creditos-relleno" id="shellCreditosRelleno"></span></span>
            </a>
            <a href="${config}" class="shell-enlace" data-ruta="${config}" data-id="configuracion" title="${esc(t('Configuración'))}">
              ${icono('/recursos/icons/settings.svg')}<span class="shell-texto">${esc(t('Configuración'))}</span>
            </a>
            <div class="shell-firma">
              <img src="/recursos/logos/logo-03.svg?nav=${ICONO_VER}" class="shell-firma-logo" alt="AI Smart Content" width="96" height="10">
              <button type="button" class="shell-icono-btn shell-colapsar" id="sidebarToggleBtn" aria-pressed="${this.isCollapsed}" aria-label="${esc(t('Contraer el menú'))}">
                <svg viewBox="0 0 12 10" width="12" height="10" aria-hidden="true"><path d="M4.8 .6L.6 4.8l4.2 4.2M10.6.6L6.5 4.8l4.1 4.2" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
          </div>
        </aside>

        <header class="shell-topbar app-header" id="appHeader">
          <div class="shell-topbar-fila">
            <button type="button" class="shell-icono-btn shell-hamburguesa" id="headerHamburger" aria-label="${esc(t('Abrir el menú'))}" aria-controls="sideNavigation" aria-expanded="false">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
            <nav class="shell-migas" aria-label="${esc(t('Estás en'))}">
              <ol>
                <li class="shell-migas-marca" id="shellMigasMarca">${esc(this._orgNombre)}</li>
                <li><h1 class="shell-titulo header-title" id="headerTitle" aria-current="page"></h1></li>
              </ol>
            </nav>
            <div class="shell-acciones">
              <span class="shell-accion">
                <button type="button" class="shell-icono-btn" data-panel="actividad" id="headerActivityBtn" aria-haspopup="true" aria-expanded="false" aria-label="${esc(t('Lo que Vera espera de ti'))}" title="${esc(t('Lo que Vera espera de ti'))}">
                  ${icono('/recursos/icons/Actividad.svg')}
                </button>
                <span class="shell-punto" id="headerActivityBadge" hidden></span>
              </span>
              <span class="shell-accion">
                <button type="button" class="shell-icono-btn" data-panel="avisos" id="headerNotificationsBtn" aria-haspopup="true" aria-expanded="false" aria-label="${esc(t('Avisos'))}" title="${esc(t('Avisos'))}">
                  ${icono('/recursos/icons/notification.svg')}
                </button>
                <span class="shell-punto" id="headerNotificationsBadge" hidden aria-hidden="true"></span>
              </span>
              <button type="button" class="shell-avatar" data-panel="cuenta" id="userMenuBtn" aria-haspopup="true" aria-expanded="false" aria-label="${esc(t('Tu cuenta'))}">
                <span id="shellAvatarIniciales">${esc(this._inicialesPersona())}</span>
              </button>
            </div>
          </div>
          <div class="header-production-slot" id="headerProductionSlot" aria-hidden="true"></div>
        </header>`;
    }

    _hijos(item) {
      if (Array.isArray(item.hijos)) {
        return item.hijos.filter((h) => !window.EnObras?.es(`/${h.ruta}`))
          .map((h) => ({ etiqueta: t(h.etiqueta), href: this.getUserSidebarRoute(h.ruta) }));
      }
      if (item.hijos === 'flujos') {
        const out = [];
        if (this._guardados) out.push({ etiqueta: t('Mis flujos'), href: this.getUserSidebarRoute('studio/flows/saved') });
        (this._categorias || []).forEach((c) => out.push({ etiqueta: c.name, href: this.getUserSidebarRoute(`studio/flows/${c.id}`) }));
        return out;
      }
      return [];
    }

    _inicialesPersona() {
      const u = window.authService?.getCurrentUser?.();
      return iniciales(u?.full_name || u?.user_metadata?.full_name || u?.email || '');
    }

    /* ── Estado vivo ───────────────────────────────────────────────────── */

    _marcarActivo() {
      const actual = window.location.pathname;
      const enlaces = this.container.querySelectorAll('[data-ruta]');
      let mejor = null; let largo = 0;
      enlaces.forEach((a) => {
        a.classList.remove('is-activo');
        a.removeAttribute('aria-current');
        const r = a.dataset.ruta;
        if (!r || !actual.startsWith(r)) return;
        const resto = actual.slice(r.length);
        if (resto && !resto.startsWith('/')) return;
        if (r.length > largo) { largo = r.length; mejor = a; }
      });
      if (!mejor) return;
      mejor.classList.add('is-activo');
      mejor.setAttribute('aria-current', 'page');
      const grupo = mejor.closest('.shell-grupo');
      if (grupo && !grupo.classList.contains('is-abierto')) this._abrirGrupo(grupo, true, false);
    }

    _titulo() {
      const el = document.getElementById('headerTitle');
      if (!el) return;
      const seg = segmento(window.location.pathname);
      let titulo = '';
      let largo = -1;
      for (const [clave, valor] of Object.entries(TITULOS)) {
        if ((seg === clave || seg.startsWith(clave + '/')) && clave.length > largo) { titulo = valor; largo = clave.length; }
      }
      el.textContent = titulo ? t(titulo) : '';
      const migas = document.getElementById('shellMigasMarca');
      if (migas) migas.textContent = this._orgNombre || '';
    }

    async _pintarMarca() {
      if (!this.currentOrgId || !window.ShellDatos) return;
      const o = await window.ShellDatos.marca(this.currentOrgId).catch(() => null);
      if (!o) return;
      this._orgNombre = o.name || this._orgNombre;
      const nombre = document.getElementById('navOrgName');
      if (nombre) nombre.textContent = this._orgNombre;
      const logo = document.getElementById('shellMarcaLogo');
      if (logo) {
        if (o.logo_url) {
          const img = document.createElement('img');
          img.src = o.logo_url; img.alt = ''; img.width = 28; img.height = 28;
          logo.replaceChildren(img);
        } else {
          logo.textContent = iniciales(this._orgNombre);
        }
      }
      this._titulo();
    }

    async _pintarPlan() {
      const tarjeta = document.getElementById('navPlanCard');
      const chip = document.getElementById('navOrgPlan');
      if (!this.currentOrgId || !window.ShellDatos) return;
      try {
        const [o, planes] = await Promise.all([window.ShellDatos.marca(this.currentOrgId), window.ShellDatos.planes()]);
        const actual = planes.find((p) => p.tier === o?.plan) || null;
        if (chip) chip.textContent = actual?.name || '';
        const piso = actual ? Number(actual.monthly_credits) || 0 : -Infinity;
        const siguiente = planes.find((p) => (Number(p.monthly_credits) || 0) > piso) || null;
        if (!tarjeta) return;
        if (!siguiente) { tarjeta.hidden = true; return; }
        const nombre = document.getElementById('navPlanName');
        if (nombre) nombre.textContent = siguiente.name;
        const cta = document.getElementById('navUpgradeBtn');
        if (cta) cta.setAttribute('aria-label', t('Ver el plan {plan}', { plan: siguiente.name }));
        tarjeta.hidden = false;
      } catch (e) {
        console.warn('[shell] plan:', e?.message || e);
      }
    }

    /** Créditos del pie (solo lectura). Lo llaman también las vistas tras gastar. */
    async loadCreditsFromDb(orgId) {
      const id = orgId || this.currentOrgId;
      const valor = document.getElementById('navTokensValue');
      const relleno = document.getElementById('shellCreditosRelleno');
      if (!id || !valor || !window.ShellDatos) return;
      try {
        const c = await window.ShellDatos.creditos(id);
        if (!c) { valor.textContent = '—'; return; }
        const n = Math.floor(c.disponibles);
        valor.textContent = n >= 10000 ? `${Math.floor(n / 100) / 10}K` : n.toLocaleString(window.i18n?.getLocale?.() || 'es');
        if (relleno) relleno.style.setProperty('--lleno-f', String(c.delPlan > 0 ? Math.min(1, c.disponibles / c.delPlan) : 0)); // scaleX: sin animar width
      } catch (e) {
        valor.textContent = '—';
      }
    }

    refreshCredits() {
      if (window.apiClient && this.currentOrgId) window.apiClient.invalidate(`nav:credits:${this.currentOrgId}`);
      this.loadCreditsFromDb();
    }

    async _refrescarPuntos() {
      const avisos = document.getElementById('headerNotificationsBadge');
      if (avisos && window.Avisos) await window.Avisos.refrescarPunto(avisos).catch(() => {});
      const act = document.getElementById('headerActivityBadge');
      if (act && window.ShellDatos && this.currentOrgId) {
        const n = await window.ShellDatos.cuantosPendientes(this.currentOrgId).catch(() => 0);
        act.hidden = !(n > 0);
      }
    }

    _sondear() {
      if (this._sondeo) clearInterval(this._sondeo);
      // Avisos y pendientes de Vera: cada 60 s con la pestaña visible; créditos cada 25 s.
      let tic = 0;
      this._sondeo = setInterval(() => {
        if (document.hidden || !this.initialized) return;
        tic += 1;
        this.loadCreditsFromDb();
        if (tic % 2 === 0) this._refrescarPuntos();
      }, 30000);
    }

    _banner() {
      const existente = document.getElementById('demoBanner');
      const mant = String(window.AISC_MANTENIMIENTO || '').trim();
      if (!mant) {
        existente?.remove();
        document.body.classList.remove('has-demo-banner');
        return;
      }
      if (existente) return;
      const b = document.createElement('div');
      b.id = 'demoBanner';
      b.className = 'demo-banner demo-banner--mantenimiento';
      b.setAttribute('role', 'status');
      const texto = document.createElement('span');
      texto.className = 'demo-banner__text';
      texto.textContent = t('Mantenimiento en curso ({cuando}): lo que guardes ahora puede no quedar. Volvemos enseguida.', { cuando: mant });
      b.append(texto);
      document.body.insertBefore(b, document.body.firstChild);
      document.body.classList.add('has-demo-banner');
    }

    /* ── Colapso, inmersivo, drawer ────────────────────────────────────── */

    _aplicarColapso() {
      const sb = document.getElementById('sideNavigation');
      sb?.classList.toggle('is-colapsado', this.isCollapsed);
      document.body.classList.toggle('sidebar-collapsed', this.isCollapsed);
      const btn = document.getElementById('sidebarToggleBtn');
      if (btn) {
        btn.setAttribute('aria-pressed', String(this.isCollapsed));
        btn.setAttribute('aria-label', this.isCollapsed ? t('Expandir el menú') : t('Contraer el menú'));
      }
    }

    toggleSidebarCollapse() {
      this.isCollapsed = !this.isCollapsed;
      guardar(CLAVE_COLAPSADO, String(this.isCollapsed));
      this._aplicarColapso();
    }

    /** Vistas inmersivas (Vera): contrae sin tocar la preferencia guardada. */
    collapseForImmersive() {
      if (this._inmersivo) return;
      this._inmersivo = { previo: this.isCollapsed };
      this.isCollapsed = true;
      this._aplicarColapso();
    }

    restoreFromImmersive() {
      if (!this._inmersivo) return;
      this.isCollapsed = this._inmersivo.previo;
      this._inmersivo = null;
      this._aplicarColapso();
    }

    _abrirDrawer() {
      const sb = document.getElementById('sideNavigation');
      const velo = document.getElementById('navOverlay');
      if (!sb) return;
      this._drawerAbierto = true;
      this._focoPrevio = document.activeElement;
      sb.classList.add('is-abierto');
      if (velo) velo.hidden = false;
      document.body.classList.add('nav-open');
      document.getElementById('headerHamburger')?.setAttribute('aria-expanded', 'true');
      document.getElementById('app-container')?.setAttribute('inert', '');
      sb.querySelector('button, a')?.focus();
    }

    _cerrarDrawer() {
      if (!this._drawerAbierto) return;
      this._drawerAbierto = false;
      document.getElementById('sideNavigation')?.classList.remove('is-abierto');
      const velo = document.getElementById('navOverlay');
      if (velo) velo.hidden = true;
      document.body.classList.remove('nav-open');
      document.getElementById('headerHamburger')?.setAttribute('aria-expanded', 'false');
      document.getElementById('app-container')?.removeAttribute('inert');
      if (this._focoPrevio?.focus) this._focoPrevio.focus();
    }

    /** Foco atrapado dentro del drawer móvil (Tab / Shift+Tab dan la vuelta). */
    _atraparFoco(e) {
      if (!this._drawerAbierto || e.key !== 'Tab') return;
      const sb = document.getElementById('sideNavigation');
      const foco = [...sb.querySelectorAll('a[href], button:not([disabled])')].filter((n) => n.offsetParent !== null);
      if (!foco.length) return;
      const primero = foco[0]; const ultimo = foco[foco.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    }

    _abrirGrupo(grupo, abrir, recordar = true) {
      grupo.classList.toggle('is-abierto', abrir);
      grupo.querySelector('.shell-desplegar')?.setAttribute('aria-expanded', String(abrir));
      if (recordar) guardar(CLAVE_ABIERTO, abrir ? grupo.dataset.grupo : '');
    }

    /* ── Paneles (marca · actividad · avisos · cuenta) ─────────────────── */

    _alternarPanel(id, boton) {
      if (this._panel?.id === id) { this._cerrarPanel(); return; }
      this._cerrarPanel();
      const nodo = document.createElement('div');
      nodo.className = `shell-panel shell-panel--${id}`;
      nodo.id = id === 'marcas' ? 'shellPanelMarcas' : `shellPanel-${id}`;
      nodo.setAttribute('role', 'dialog');
      nodo.setAttribute('aria-label', boton.getAttribute('aria-label') || t('Panel'));
      document.body.appendChild(nodo);
      this._panel = { id, nodo, boton };
      boton.setAttribute('aria-expanded', 'true');
      this._ubicarPanel();
      if (id === 'marcas') this._panelMarcas(nodo);
      else if (id === 'cuenta') this._panelCuenta(nodo);
      else if (id === 'avisos') this._panelAvisos(nodo);
      else if (id === 'actividad') this._panelActividad(nodo);
    }

    _ubicarPanel() {
      if (!this._panel) return;
      const { nodo, boton, id } = this._panel;
      const r = boton.getBoundingClientRect();
      const margen = 12;
      const ancho = Math.min(id === 'marcas' ? 280 : 384, window.innerWidth - margen * 2);
      nodo.style.setProperty('--panel-ancho', `${ancho}px`);
      nodo.style.top = `${Math.round(r.bottom + 8)}px`;
      const izquierda = id === 'marcas' ? r.left : r.right - ancho;
      nodo.style.left = `${Math.round(Math.max(margen, Math.min(izquierda, window.innerWidth - ancho - margen)))}px`;
    }

    _cerrarPanel(devolverFoco = false) {
      if (!this._panel) return;
      const { nodo, boton } = this._panel;
      nodo.remove();
      boton.setAttribute('aria-expanded', 'false');
      if (devolverFoco) boton.focus();
      this._panel = null;
    }

    async _panelMarcas(nodo) {
      window.Estado.pintar(nodo, `<p class="shell-panel-titulo">${esc(t('Tus marcas'))}</p><ul class="shell-panel-lista" aria-busy="true"><li class="skeleton skeleton-text"></li><li class="skeleton skeleton-text"></li></ul>`);
      const marcas = window.ShellDatos ? await window.ShellDatos.marcas() : [];
      if (this._panel?.nodo !== nodo) return;
      const seg = segmento(window.location.pathname) || 'dashboard';
      const lista = marcas.map((m) => {
        const actual = m.id === this.currentOrgId;
        const prefijo = window.getOrgPathPrefix ? window.getOrgPathPrefix(m.id, m.name) : '';
        const destino = prefijo ? `${prefijo}/${seg.split('/')[0]}` : '/home'; // se escapa al pintarlo
        return `<li><a href="${esc(destino)}" class="shell-panel-opcion${actual ? ' is-actual' : ''}" data-ruta="${esc(destino)}"${actual ? ' aria-current="true"' : ''}>
          <span class="shell-marca-logo shell-marca-logo--sm" aria-hidden="true">${m.logo_url ? `<img src="${esc(m.logo_url)}" alt="" width="24" height="24">` : esc(iniciales(m.name))}</span>
          <span class="shell-panel-opcion-texto"><span>${esc(m.name)}</span><small>${esc(t(m.role === 'owner' ? 'Propietaria' : m.role === 'admin' ? 'Administración' : m.role === 'viewer' ? 'Lectura' : 'Edición'))}</small></span>
          ${actual ? '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
        </a></li>`;
      }).join('');
      window.Estado.pintar(nodo, `<p class="shell-panel-titulo">${esc(t('Tus marcas'))}</p><ul class="shell-panel-lista">${lista || `<li class="shell-panel-vacio">${esc(t('Aún no perteneces a ninguna marca.'))}</li>`}</ul>`);
      nodo.querySelector('a')?.focus();
    }

    _panelCuenta(nodo) {
      const u = window.authService?.getCurrentUser?.() || {};
      const nombre = u.full_name || u.user_metadata?.full_name || '';
      const idioma = window.i18n?.getLocale?.() || 'es';
      window.Estado.pintar(nodo, `
        <div class="shell-panel-persona">
          <span class="shell-avatar shell-avatar--grande" aria-hidden="true">${esc(this._inicialesPersona())}</span>
          <span class="shell-panel-opcion-texto"><span>${esc(nombre || u.email || '')}</span>${nombre ? `<small>${esc(u.email || '')}</small>` : ''}</span>
        </div>
        <div class="shell-panel-bloque">
          <p class="shell-panel-titulo" id="shellIdiomaTitulo">${esc(t('Idioma'))}</p>
          <div class="shell-segmento" role="radiogroup" aria-labelledby="shellIdiomaTitulo">
            <button type="button" role="radio" aria-checked="${idioma === 'es'}" data-idioma="es">Español</button>
            <button type="button" role="radio" aria-checked="${idioma === 'en'}" data-idioma="en">English</button>
          </div>
        </div>
        <ul class="shell-panel-lista">
          <li><a href="${esc(this.getUserSidebarRoute('cuenta/perfil'))}" class="shell-panel-opcion" data-ruta="${esc(this.getUserSidebarRoute('cuenta/perfil'))}">${esc(t('Mi cuenta'))}</a></li>
          <li><a href="${esc(this.getUserSidebarRoute('cuenta/seguridad'))}" class="shell-panel-opcion" data-ruta="${esc(this.getUserSidebarRoute('cuenta/seguridad'))}">${esc(t('Cambiar contraseña'))}</a></li>
          <li><button type="button" class="shell-panel-opcion" data-accion="salir">${esc(t('Cerrar sesión'))}</button></li>
        </ul>`);
      nodo.querySelector('[aria-checked="true"]')?.focus();
    }

    /** Título (opcional) + cuerpo vacío de un panel, por DOM (el título es texto). */
    _estructuraPanel(nodo, titulo) {
      const cuerpo = document.createElement('div');
      cuerpo.className = 'shell-panel-cuerpo';
      if (!titulo) { nodo.replaceChildren(cuerpo); return cuerpo; }
      const h = document.createElement('p');
      h.className = 'shell-panel-titulo';
      h.textContent = titulo;
      nodo.replaceChildren(h, cuerpo);
      return cuerpo;
    }

    async _panelAvisos(nodo) {
      const cuerpo = this._estructuraPanel(nodo, null); // Avisos.pintar trae su propia cabecera
      cuerpo.id = 'notificationsFlyoutBody';
      if (!window.Avisos) { cuerpo.textContent = t('Los avisos no están disponibles ahora.'); return; }
      await window.Avisos.pintar(cuerpo, { alCerrar: () => this._cerrarPanel() });
      this._refrescarPuntos();
    }

    async _panelActividad(nodo) {
      const cuerpo = this._estructuraPanel(nodo, t('Lo que Vera espera de ti'));
      cuerpo.setAttribute('aria-busy', 'true');
      for (let i = 0; i < 2; i++) { const s = document.createElement('div'); s.className = 'skeleton skeleton-text'; cuerpo.append(s); }
      let lista = null;
      try {
        lista = window.ShellDatos ? await window.ShellDatos.pendientesDeVera(this.currentOrgId) : [];
      } catch (e) {
        console.warn('[shell] pendientes de Vera:', e?.message || e);
      }
      if (this._panel?.nodo !== nodo) return;
      cuerpo.removeAttribute('aria-busy');
      const vacio = (texto) => `<p class="shell-panel-vacio">${esc(texto)}</p>`;
      const pendientes = (lista || []).filter((a) => !a.decided_at);
      const resto = (lista || []).filter((a) => a.decided_at).slice(0, 10);
      const tarjeta = (a) => {
        const estado = !a.decided_at ? '' : a.approved ? t('Aprobada') : t('Descartada');
        return `
          <li class="shell-actividad${a.decided_at ? ' is-decidida' : ''}" data-id="${esc(a.id)}">
            <div class="shell-actividad-cabeza"><span>${esc(a.summary || a.action)}</span><time datetime="${esc(a.created_at)}">${esc(hace(a.created_at))}</time></div>
            ${estado ? `<p class="shell-actividad-estado">${esc(estado)}</p>` : `
            <div class="shell-actividad-acciones">
              <button type="button" class="btn btn-primary btn-sm" data-decidir="aprobar">${esc(t('Aprobar'))}</button>
              <button type="button" class="btn btn-secondary btn-sm" data-decidir="descartar">${esc(t('Descartar'))}</button>
            </div>`}
          </li>`;
      };
      window.Estado.pintar(cuerpo, !lista ? vacio(t('No pudimos leer la actividad de Vera. Intenta en un momento.'))
        : !lista.length ? vacio(t('Vera no tiene nada pendiente contigo.')) : `
        ${pendientes.length ? `<p class="shell-panel-subtitulo">${esc(t('Esperan tu decisión'))} · ${pendientes.length}</p><ul class="shell-panel-lista">${pendientes.map(tarjeta).join('')}</ul>` : ''}
        ${resto.length ? `<p class="shell-panel-subtitulo">${esc(t('Decididas'))}</p><ul class="shell-panel-lista">${resto.map(tarjeta).join('')}</ul>` : ''}`);
    }

    /** Descartar pide el motivo EN la tarjeta (≥ 5 caracteres, lo exige el borde). */
    async _decidir(li, decision) {
      const id = li?.dataset.id;
      const api = window.apiV2?.api;
      if (!id) return;
      const avisar = (m, tipo = 'error') => window.showToast?.(m, { type: tipo });
      if (!api) { avisar(t('Las decisiones de Vera todavía no se toman desde esta consola.')); return; }
      if (decision === 'descartar' && !li.querySelector('.shell-actividad-motivo')) {
        const acciones = li.querySelector('.shell-actividad-acciones');
        acciones.insertAdjacentHTML('beforebegin', `
          <label class="shell-actividad-motivo">
            <span>${esc(t('¿Por qué la descartas?'))}</span>
            <textarea rows="2" minlength="5" required></textarea>
          </label>`);
        acciones.querySelector('[data-decidir="descartar"]').textContent = t('Descartar con este motivo');
        li.querySelector('textarea').focus();
        return;
      }
      let nota;
      if (decision === 'descartar') {
        nota = li.querySelector('textarea').value.trim();
        if (nota.length < 5) { li.querySelector('textarea').focus(); avisar(t('Escribe un motivo de al menos 5 caracteres.')); return; }
      }
      li.setAttribute('aria-busy', 'true');
      try {
        await api.decidirAprobacion(id, this.currentOrgId, decision === 'descartar' ? 'rechazar' : 'aprobar', nota);
        avisar(decision === 'descartar' ? t('Descartada.') : t('Aprobada. Vera sigue con ello.'), 'success');
        if (this._panel?.id === 'actividad') this._panelActividad(this._panel.nodo);
        this._refrescarPuntos();
      } catch (e) {
        li.removeAttribute('aria-busy');
        avisar(e?.codigo === 'sin_permiso' || e?.status === 403 ? t('Tu rol no puede decidir esta acción.') : (e?.message || t('No se pudo decidir. Intenta de nuevo.')));
      }
    }

    /* ── Eventos ───────────────────────────────────────────────────────── */

    /** Enlaces del shell: navegación SPA + prefetch al pasar el cursor. */
    _enlazar() {
      const raiz = this.container;
      if (raiz._shellEnlazado) return; // el contenedor vive toda la sesión: una sola vez
      raiz._shellEnlazado = true;
      raiz.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-ruta]');
        if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
          e.preventDefault();
          window.router?.navigate(a.dataset.ruta);
          this._cerrarDrawer();
          return;
        }
        const desplegar = e.target.closest('.shell-desplegar');
        if (desplegar) {
          const grupo = desplegar.closest('.shell-grupo');
          this._abrirGrupo(grupo, !grupo.classList.contains('is-abierto'));
          return;
        }
        const panel = e.target.closest('[data-panel]');
        if (panel) { e.stopPropagation(); this._alternarPanel(panel.dataset.panel, panel); return; }
        if (e.target.closest('#shellMarcaBtn')) { e.stopPropagation(); this._alternarPanel('marcas', document.getElementById('shellMarcaBtn')); return; }
        if (e.target.closest('#sidebarToggleBtn')) { this.toggleSidebarCollapse(); return; }
        if (e.target.closest('#headerHamburger')) { this._drawerAbierto ? this._cerrarDrawer() : this._abrirDrawer(); return; }
        if (e.target.closest('#navOverlay')) this._cerrarDrawer();
      });
      const prefetch = (e) => {
        const a = e.target.closest?.('a[data-ruta]');
        if (!a || a._prefetch) return;
        a._prefetch = true;
        const ir = () => window.router?.prefetch?.(a.dataset.ruta);
        if (window.requestIdleCallback) window.requestIdleCallback(ir, { timeout: 250 }); else setTimeout(ir, 0);
      };
      raiz.addEventListener('pointerover', prefetch);
      raiz.addEventListener('focusin', prefetch);
    }

    /** Listeners de documento: una sola vez por sesión (el shell es singleton). */
    _globalesUnaVez() {
      if (this._globales) return;
      this._globales = true;
      document.addEventListener('click', (e) => {
        if (!this._panel) return;
        const { nodo, boton } = this._panel;
        const opcion = e.target.closest('.shell-panel a[data-ruta]');
        if (opcion) { e.preventDefault(); this._cerrarPanel(); window.router?.navigate(opcion.dataset.ruta); return; }
        const idioma = e.target.closest('.shell-panel [data-idioma]');
        if (idioma) { this._cambiarIdioma(idioma.dataset.idioma); return; }
        if (e.target.closest('.shell-panel [data-accion="salir"]')) { this._salir(); return; }
        const decidir = e.target.closest('.shell-panel [data-decidir]');
        if (decidir) { this._decidir(decidir.closest('.shell-actividad'), decidir.dataset.decidir); return; }
        if (!nodo.contains(e.target) && !boton.contains(e.target)) this._cerrarPanel();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (this._panel) { this._cerrarPanel(true); return; }
          if (this._drawerAbierto) { this._cerrarDrawer(); return; }
        }
        this._atraparFoco(e);
      });
      window.addEventListener('resize', () => {
        this._ubicarPanel();
        if (this._drawerAbierto && window.matchMedia('(min-width: 861px)').matches) this._cerrarDrawer();
      });
      window.addEventListener('routechange', () => {
        this._cerrarPanel();
        this._cerrarDrawer();
        this._marcarActivo();
        this._titulo();
      });
      document.addEventListener('credits-updated', () => this.refreshCredits());
      document.addEventListener('notifications-updated', () => this._refrescarPuntos());
      document.addEventListener('visibilitychange', () => { if (!document.hidden && this.initialized) this.loadCreditsFromDb(); });
    }

    async _cambiarIdioma(locale) {
      this._cerrarPanel();
      if (window.i18n?.setLocale) await window.i18n.setLocale(locale);
    }

    async _salir() {
      this._cerrarPanel();
      try { await window.authService?.logout(); } catch (e) { console.warn('[shell] salir:', e?.message || e); }
      window.router?.navigate('/login', true);
    }
  }

  window.Shell = Shell;
  window.appNavigation = new Shell();
})();
