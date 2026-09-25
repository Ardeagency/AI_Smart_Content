/**
 * VeraView — Vera (chat conversacional)
 *
 * Layout: área de mensajes + composer (sin sidebar ni topbar).
 * Principio: 1 org → 1 cerebro (OpenClaw). Frontend → Backend API → OpenClaw.
 */

/* Helpers de render (gráficos, Mermaid, Prism, iframes): js/views/vera/graficos.js.
   Secciones del chat en mixins: js/views/vera/{historial,biblioteca,artefactos,render,adjuntos}.mixin.js. */

class VeraView extends (window.BaseView || class {}) {
  /** El router contrae el sidebar ANTES de la transición (ver router.js, cambiar()). */
  static inmersiva = true;

  constructor() {
    super();
    this.templatePath = null;
    this.aiState = {
      organization_id: null,
      active_conversation_id: null,
      messages: [],
      conversations: [],
      isLoading: false,
      pendingAttachments: []
    };
    this.organizationName = '';
    this.supabase = null;
    this.userId = null;
    this._initWidgetBridge();
  }

  /* ── Bridge para iframes sandbox de VERA (```html / ```artifact) ──
     Escucha 2 tipos de mensajes desde iframes null-origin:
      1) `vera_resize` → ajusta height del iframe.
      2) `vera_action` → widget invoca accion en plataforma (allowlist).

     L7: un listener POR INSTANCIA vía this.addEventListener (BaseView lo quita en
     destroy()). Antes un guard estático lo registraba una sola vez con el `this` de
     la PRIMERA instancia: al volver a Vera, las acciones de widget iban a una vista
     ya destruida. */
  _initWidgetBridge() {
    // Allowlist de actionType. Read-only ejecutan directo en backend;
    // write actions se persisten en vera_pending_actions para revision humana.
    const ACTION_ALLOWLIST = new Set([
      // Read
      'get_metric',
      'list_campaigns',
      'list_products',
      'list_brands',
      'list_audiences',
      'list_pending_actions',
      // Write con pending_action
      'propose_brief',
      'flag_competitor',
    ]);

    this.addEventListener(window, 'message', async (event) => {
      const t = event.data?.type;
      if (!t) return;

      if (t === 'vera_resize') {
        const frames = document.querySelectorAll('.vera-sandbox-frame, .vera-artifact-frame');
        frames.forEach((frame) => {
          try {
            if (frame.contentWindow === event.source) fitSandboxFrame(frame, event.data);
          } catch (_) { /* contentWindow puede ser inaccesible si el iframe se removio */ }
        });
        return;
      }

      if (t === 'vera_action') {
        // Validar que event.source es uno de nuestros iframes (anti-spoofing).
        const iframe = [...document.querySelectorAll('.vera-sandbox-frame, .vera-artifact-frame')]
          .find((f) => f.contentWindow === event.source);
        if (!iframe) return; // mensaje no viene de iframe nuestro -> ignorar

        const { requestId, actionType, payload } = event.data || {};
        const reply = (ok, data, error) => {
          try { event.source.postMessage({ type: 'vera_action_result', requestId, ok, data, error }, '*'); }
          catch (_) { /* iframe puede haberse removido */ }
        };

        if (!requestId || typeof actionType !== 'string') {
          reply(false, null, 'invalid_request'); return;
        }
        if (!ACTION_ALLOWLIST.has(actionType)) {
          reply(false, null, `action_not_allowed:${actionType}`); return;
        }
        if (!this.aiState.organization_id) {
          reply(false, null, 'no_organization_context'); return;
        }

        // Corte ADR-0052: api-widget-action se apagó; la acción de un widget se le dice a Vera como mensaje.
        if (window.VeraDatos) {
          try { await this.sendMessage(__('Acción del widget «{tipo}»: {carga}', { tipo: actionType, carga: JSON.stringify(payload || {}).slice(0, 500) })); reply(true, { encolado: true }, null); }
          catch (e) { reply(false, null, e?.message || 'error'); }
          return;
        }
        reply(false, null, 'sin_puente'); // sin VeraDatos no hay a quién decírselo
        return;
      }
    });
  }

  /* ── onEnter: auth + org data ────────────────────────── */
  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }

    // Vista inmersiva: al entrar a Vera se colapsa el sidebar global para dar
    // todo el ancho al chat + su propio historial. Recuerda el estado previo y
    // lo restaura en onLeave() — no toca la preferencia global del usuario.
    try { window.appNavigation?.collapseForImmersive?.(); } catch (_) { /* el shell puede no estar montado */ }

    this.aiState.organization_id =
      this.routeParams?.orgId || window.currentOrgId || null; // de la ruta (L7), no de localStorage

    if (!this.aiState.organization_id) {
      const url =
        window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
          ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
          : '/create';
      if (window.router) window.router.navigate(url, true);
      return;
    }

    if (window.appState) window.appState.set('selectedOrganizationId', this.aiState.organization_id, true);
    localStorage.setItem('selectedOrganizationId', this.aiState.organization_id);

    try {
      this.supabase = window.supabase || (window.supabaseService && (await window.supabaseService.getClient()));
      const user = window.authService?.getCurrentUser();
      if (!user?.id && this.supabase) {
        const { data: { user: u } } = await this.supabase.auth.getUser();
        this.userId = u?.id;
      } else {
        this.userId = user?.id;
      }
    } catch (e) {
      console.warn('VeraView supabase:', e);
    }

    this.organizationName = (window.currentOrgName || '').trim();
    if (!this.organizationName && this.supabase && this.aiState.organization_id) {
      try {
        // Reuse el cache de Navigation (`nav:org:${orgId}`): si ya se cargó el
        // sidebar, esta lectura es instantánea sin pegar a Supabase.
        const orgId = this.aiState.organization_id;
        const fetcher = async () => {
          // Base nueva: el nombre viene en mi_contexto (ContextoDataService).
          if (window.contextoService) { await window.contextoService.cargar(); const o = window.contextoService.org(orgId); return o ? { name: o.name, plan: o.plan || '' } : null; }
          return null;
        };
        const cached = window.apiClient
          ? await window.apiClient.query(`nav:org:${orgId}`, fetcher, { ttl: 5 * 60 * 1000, staleWhileRevalidate: true })
          : await fetcher();
        this.organizationName = cached?.name ? String(cached.name) : '';
      } catch (err) {
        // Antes era silencio total y el nombre mostraba "Organización" sin pista de por qué.
        console.warn('[VeraView] no se pudo resolver organization.name:', err?.message || err);
      }
    }
    if (!this.organizationName) this.organizationName = __('Organización');
  }

  /* ── HTML skeleton ───────────────────────────────────── */
  renderHTML() {
    return `
      <div id="chatcontainer" class="gpt-layout">
        <aside class="vera-history" id="veraHistory" aria-label="${__('Conversaciones recientes')}">
          <div class="vera-history-head">
            <button class="vera-history-new" id="veraNewChat" title="${__('Nuevo chat')}">
              <i class="aisc-ico aisc-ico--edit"></i><span>${__('Nuevo chat')}</span>
            </button>
            <button class="vera-history-collapse" id="veraHistoryCollapse" title="${__('Ocultar')}" aria-label="${__('Ocultar')}">
              <i class="aisc-ico aisc-ico--chevron-right"></i>
            </button>
          </div>
          <button class="vera-history-search" id="veraHistorySearchBtn" title="${__('Buscar chats')}">
            <i class="aisc-ico aisc-ico--search"></i><span>${__('Buscar chats')}</span>
          </button>
          <input type="text" class="vera-history-search-input" id="veraHistorySearchInput" placeholder="${__('Buscar…')}" hidden />
          <button class="vera-history-search vera-history-gallery" id="veraGalleryBtn" title="${__('Archivos generados')}">
            <i class="aisc-ico aisc-ico--folder"></i><span>${__('Archivos generados')}</span>
          </button>
          <div class="vera-history-list" id="veraHistoryList"></div>
        </aside>
        <button class="vera-history-open" id="veraHistoryOpen" title="${__('Mostrar conversaciones')}" aria-label="${__('Mostrar conversaciones')}">
          <i class="aisc-ico aisc-ico--history"></i>
        </button>
        <div class="vera-history-scrim" id="veraHistoryScrim"></div>
        <div class="gpt-main" id="gptMain">
          <div class="gpt-messages-scroll" id="veraMessagesWrap">
            <div class="gpt-messages-inner" id="veraMessageList"></div>
          </div>
          <div class="gpt-composer-wrap" id="chatInputOverlay">
            <div class="gpt-composer" id="veraInputWrap">
              <div class="gpt-attach-chips" id="veraAttachChips" hidden></div>
              <textarea
                class="gpt-composer-textarea"
                id="veraInput"
                placeholder="${__('Pregunta lo que quieras — escribe @ para traer un producto, una estrategia, una producción…')}"
                rows="1"
              ></textarea>
              <div class="gpt-composer-row">
                <div class="gpt-composer-btns">
                  <div class="vera-plus-wrap">
                    <button class="gpt-composer-icon" id="veraPlus" title="${__('Adjuntar')}" aria-haspopup="true" aria-expanded="false">
                      <i class="aisc-ico aisc-ico--add"></i>
                    </button>
                    <div class="vera-plus-menu" id="veraPlusMenu" hidden role="menu">
                      <button class="vera-plus-item" id="veraMenuFiles" role="menuitem">
                        <i class="aisc-ico aisc-ico--paperclip"></i><span>${__('Agregar archivos o fotos')}</span>
                      </button>
                      <div class="vera-plus-sep"></div>
                      <button class="vera-plus-item" data-lib-type="product" role="menuitem"><i class="aisc-ico aisc-ico--product"></i><span>${__('Producto')}</span></button>
                      <button class="vera-plus-item" data-lib-type="campaign" role="menuitem"><i class="aisc-ico aisc-ico--campaign"></i><span>${__('Campaña')}</span></button>
                      <button class="vera-plus-item" data-lib-type="campaign_objective" role="menuitem"><i class="aisc-ico aisc-ico--goal"></i><span>${__('Objetivo de campaña')}</span></button>
                      <button class="vera-plus-item" data-lib-type="audience_objective" role="menuitem"><i class="aisc-ico aisc-ico--audience"></i><span>${__('Objetivo de audiencia')}</span></button>
                      <button class="vera-plus-item" data-lib-type="brief" role="menuitem"><i class="aisc-ico aisc-ico--copy"></i><span>${__('Brief')}</span></button>
                      <button class="vera-plus-item" data-lib-type="service" role="menuitem"><i class="aisc-ico aisc-ico--brief"></i><span>${__('Servicios')}</span></button>
                      <button class="vera-plus-item" data-lib-type="strategy" role="menuitem"><i class="aisc-ico aisc-ico--goal"></i><span>${__('Estrategia')}</span></button>
                      <button class="vera-plus-item" data-lib-type="production" role="menuitem"><i class="aisc-ico aisc-ico--flows"></i><span>${__('Producción')}</span></button>
                      <button class="vera-plus-item" data-lib-type="flow" role="menuitem"><i class="aisc-ico aisc-ico--flows"></i><span>${__('Flujo')}</span></button>
                      <button class="vera-plus-item" data-lib-type="place" role="menuitem"><i class="aisc-ico aisc-ico--places"></i><span>${__('Lugares')}</span></button>
                      <button class="vera-plus-item" data-lib-type="character" role="menuitem"><i class="aisc-ico aisc-ico--characters"></i><span>${__('Personajes')}</span></button>
                    </div>
                  </div>
                </div>
                <button class="gpt-send-btn" id="veraSend" title="${__('Enviar')}" disabled>
                  <i class="aisc-ico aisc-ico--arrow-up"></i>
                </button>
              </div>
              <input type="file" id="veraFileInput" multiple hidden
                accept="image/*,application/pdf,audio/*,video/*,
                       .doc,.docx,.xls,.xlsx,.csv,.txt,.md,
                       application/msword,
                       application/vnd.openxmlformats-officedocument.wordprocessingml.document,
                       application/vnd.ms-excel,
                       application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
                       text/csv,text/plain,text/markdown" />
            </div>
          </div>
        </div>
        <aside class="vera-artifact-panel" id="veraArtifactPanel" hidden aria-label="${__('Panel de artefacto')}">
          <div class="vera-artifact-panel-head">
            <span class="vera-artifact-panel-title" id="veraArtifactTitle">${__('Artefacto')}</span>
            <div class="vera-artifact-panel-actions">
              <button class="vera-artifact-act" id="veraArtifactView" data-view="preview" title="${__('Vista previa')}"><i class="aisc-ico aisc-ico--eye"></i></button>
              <button class="vera-artifact-act" id="veraArtifactCode" title="${__('Ver código')}"><i class="aisc-ico aisc-ico--coding"></i></button>
              <button class="vera-artifact-act" id="veraArtifactCopy" title="${__('Copiar')}"><i class="aisc-ico aisc-ico--copy"></i></button>
              <button class="vera-artifact-act" id="veraArtifactPdf" title="${__('Descargar como PDF')}"><i class="aisc-ico aisc-ico--document"></i></button>
              <button class="vera-artifact-act" id="veraArtifactDownload" title="${__('Descargar HTML')}"><i class="aisc-ico aisc-ico--dowload"></i></button>
              <button class="vera-artifact-act" id="veraArtifactFull" title="${__('Pantalla completa')}"><i class="aisc-ico aisc-ico--expand"></i></button>
              <button class="vera-artifact-act vera-artifact-act--close" id="veraArtifactClose" title="${__('Cerrar')}"><i class="aisc-ico aisc-ico--close"></i></button>
            </div>
          </div>
          <div class="vera-artifact-panel-body" id="veraArtifactBody"></div>
        </aside>
        <div class="vera-gallery-overlay" id="veraGalleryOverlay" hidden>
          <div class="vera-gallery-scrim" id="veraGalleryScrim"></div>
          <div class="vera-gallery-modal" role="dialog" aria-modal="true" aria-label="${__('Archivos generados')}">
            <div class="vera-gallery-head">
              <div class="vera-gallery-head-title">
                <i class="aisc-ico aisc-ico--folder"></i>
                <span>${__('Archivos generados')}</span>
                <span class="vera-gallery-count" id="veraGalleryCount"></span>
              </div>
              <div class="vera-gallery-head-actions">
                <button class="vera-artifact-act" id="veraGalleryRefresh" title="${__('Actualizar')}"><i class="aisc-ico aisc-ico--refresh"></i></button>
                <button class="vera-artifact-act vera-artifact-act--close" id="veraGalleryClose" title="${__('Cerrar')}"><i class="aisc-ico aisc-ico--close"></i></button>
              </div>
            </div>
            <div class="vera-gallery-body" id="veraGalleryBody"></div>
          </div>
        </div>
      </div>
    `;
  }

  /* ── init: wire up everything ────────────────────────── */
  async init() {
    if (!this.container) return;

    this.bindInput();
    this._requestNotificationPermission();

    // Handler global de seleccion de opciones del input-area (CLARIFY / PILLS).
    // Re-asignado en init de cada onEnter — si VeraView se monta varias veces,
    // siempre apunta a la instancia activa.
    window._veraSelectOption = (text) => {
      // Marca la card seleccionada para feedback visual
      document.querySelectorAll('.vera-input-option-card').forEach((c) => {
        c.classList.remove('selected');
        const title = c.querySelector('.vera-option-title')?.textContent;
        if (title === text) c.classList.add('selected');
      });
      // Pequeno delay para que el usuario vea el highlight, luego envia
      setTimeout(() => {
        this._hideInputOptions();
        this.sendMessage(text);
      }, 250);
    };

    // Por defecto Vera abre en "nueva conversación". Solo si la URL apunta a
    // una conversación concreta (?c=<id>) la cargamos — así un refresh mantiene
    // al usuario en la misma conversación (deep-link).
    const urlConvId = this._getUrlConversationId();
    if (urlConvId) {
      this.aiState.active_conversation_id = urlConvId;
      await this.loadMessages();
      if (this.aiState.messages.length) {
        this.renderMessages();
      } else {
        // id inválido / ajeno / sin mensajes → nueva conversación limpia.
        this.aiState.active_conversation_id = null;
        this._setConversationUrl(null);
        this.renderWelcome();
      }
    } else {
      this.renderWelcome();
    }

    // Panel de artefactos (Canvas) — botones del header.
    this._bindArtifactPanel();

    // Galería de archivos generados (vera_artifacts) — modal del sidebar.
    this._bindGallery();

    // Historial de conversaciones (rail izquierdo, estilo ChatGPT).
    this.bindHistory();
    this._applyHistoryCollapsed();
    await this.loadConversations();
    this.renderHistory();

    // Si entramos por deep-link, completa el slug del título en la URL.
    if (this.aiState.active_conversation_id) {
      const c = (this.aiState.conversations || []).find((x) => x.id === this.aiState.active_conversation_id);
      this._setConversationUrl(this.aiState.active_conversation_id, c?.title);
    }

    // Prefill desde ?q=<prompt> (usado por Monitoring → cards de perfiles).
    // Precarga el textarea sin enviar, deja la URL limpia y enfoca.
    try {
      const params = new URLSearchParams(window.location.search || '');
      const q = params.get('q');
      if (q) {
        const input = document.getElementById('veraInput');
        if (input) {
          input.value = q;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          requestAnimationFrame(() => input.focus());
        }
        params.delete('q');
        const search = params.toString();
        const cleanUrl = window.location.pathname + (search ? '?' + search : '') + window.location.hash;
        window.history.replaceState(null, '', cleanUrl);
      }
    } catch (_) { /* no-op */ }
  }

  _bindMediaHover() {
    const root = document.getElementById('veraMessageList');
    if (!root || root.__veraMediaHoverBound) return;
    root.__veraMediaHoverBound = true;

    root.addEventListener(
      'mouseenter',
      async (e) => {
        const el = e.target?.closest?.('video.gpt-md-video');
        if (!el) return;
        try {
          el.controls = false;
          el.currentTime = 0;
          await el.play();
        } catch (_) { /* el navegador bloqueó el autoplay: queda quieto */ }
      },
      true
    );

    root.addEventListener(
      'mouseleave',
      (e) => {
        const el = e.target?.closest?.('video.gpt-md-video');
        if (!el) return;
        try {
          el.pause();
          el.currentTime = 0;
          el.controls = true;
        } catch (_) { /* el video ya no está en el DOM */ }
      },
      true
    );
  }

  /* ── Active conversation (última sesión) ─────────────── */
  async loadActiveConversation() {
    if (!window.VeraDatos || !this.aiState.organization_id || !this.userId) return;
    const lista = await window.VeraDatos.conversaciones(this.aiState.organization_id, { mias: true, userId: this.userId, limite: 1 });
    if (lista[0]?.id) this.aiState.active_conversation_id = lista[0].id;
  }

  _getUrlConversationId() {
    try { return new URLSearchParams(window.location.search || '').get('c') || ''; }
    catch (_) { return ''; }
  }

  _slugify(s) {
    return String(s || '')
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  // Sincroniza la URL con la conversación activa (replaceState: no ensucia el
  // history). id null/'' → limpia los params (vuelve a /vera = nueva conversación).
  _setConversationUrl(id, title) {
    try {
      const base = window.location.pathname || '/vera';
      if (!id) { window.history.replaceState(null, '', base); return; }
      const params = new URLSearchParams();
      params.set('c', id);
      const slug = this._slugify(title);
      if (slug) params.set('t', slug);
      window.history.replaceState(null, '', `${base}?${params.toString()}`);
    } catch (_) { /* no-op */ }
  }

  /* ── Messages ────────────────────────────────────────── */
  async loadMessages() {
    if (!window.VeraDatos || !this.aiState.active_conversation_id) {
      this.aiState.messages = [];
      return;
    }
    try {
      this.aiState.messages = await window.VeraDatos.mensajes(this.aiState.active_conversation_id);
    } catch (_) {
      this.aiState.messages = [];
    }
  }

  // Nombre para el saludo: primero el nombre real del usuario, si no la org.
  _greetingName() {
    const user = (window.authService?.getCurrentUser?.()) || {};
    const emailPrefix = String(user.email || '').split('@')[0];
    const fn = String(user.full_name || '').trim();
    // full_name puede ser el prefijo del email (fallback de AuthService) → lo ignoramos.
    if (fn && fn.toLowerCase() !== emailPrefix.toLowerCase() && fn !== 'Demo visitor') {
      return fn.split(/\s+/)[0];
    }
    const org = (this.organizationName || '').trim();
    if (org && org !== __('Organización')) return org;
    return '';
  }

  // Estado "nuevo chat": el composer se centra verticalmente junto al saludo.
  // Con mensajes vuelve a su sitio (anclado abajo).
  _setWelcomeMode(on) {
    const main = document.getElementById('gptMain');
    if (main) main.classList.toggle('is-welcome', !!on);
    // Al salir de la bienvenida: parar la rotacion del subtitulo y quitar los chips.
    if (!on) {
      this._stopSubtitleRotation();
      document.getElementById('veraQuickSuggest')?.remove();
    }
  }

  // Saludo segun la hora local del usuario (mas "vivo" que un "Hola" fijo).
  _timeGreeting() {
    const h = new Date().getHours();
    if (h < 12) return __('Buenos días');
    if (h < 19) return __('Buenas tardes');
    return __('Buenas noches');
  }

  // Frases que rota el subtitulo de bienvenida.
  _welcomePhrases() {
    return [
      __('¿En qué puedo ayudarte hoy?'),
      __('Puedo analizar tu marca y tu competencia.'),
      __('Pídeme ideas de contenido o una campaña.'),
      __('Dime qué quieres lograr y lo resolvemos.'),
    ];
  }

  _startSubtitleRotation() {
    this._stopSubtitleRotation();
    const phrases = this._welcomePhrases();
    if (phrases.length < 2) return;
    let i = 0;
    this._welcomeSubTimer = setInterval(() => {
      const el = document.getElementById('veraWelcomeSub');
      // Auto-limpieza si el subtitulo ya no esta en el DOM (salio de la bienvenida).
      if (!el || !el.isConnected) { this._stopSubtitleRotation(); return; }
      i = (i + 1) % phrases.length;
      el.classList.add('is-swapping');
      setTimeout(() => {
        el.textContent = phrases[i];
        el.classList.remove('is-swapping');
      }, 260);
    }, 3800);
  }

  _stopSubtitleRotation() {
    if (this._welcomeSubTimer) {
      clearInterval(this._welcomeSubTimer);
      this._welcomeSubTimer = null;
    }
  }

  // Opciones seleccionables debajo del input (composer). Al hacer clic, envian.
  _renderQuickSuggestions() {
    const wrap = document.getElementById('chatInputOverlay');
    if (!wrap) return;
    this._quickItems = [
      { label: __('Analiza mi marca'), prompt: __('Analiza el estado de mi marca y dame los puntos clave.') },
      { label: __('Ideas de contenido'), prompt: __('Dame 5 ideas de contenido para esta semana.') },
      { label: __('¿Cómo va mi pauta?'), prompt: __('¿Cómo va el rendimiento de mis campañas activas?') },
      { label: __('Analiza mi competencia'), prompt: __('Analiza a mis competidores y qué están haciendo.') },
    ];
    let box = document.getElementById('veraQuickSuggest');
    if (!box) {
      box = document.createElement('div');
      box.className = 'gpt-quick-suggest';
      box.id = 'veraQuickSuggest';
      wrap.appendChild(box); // queda debajo del .gpt-composer
    }
    window.Estado.pintar(box, this._quickItems
      .map((it, idx) => `<button type="button" class="gpt-quick-chip" data-idx="${idx}">${escapeHtml(it.label)}</button>`)
      .join(''));
    if (!box.__bound) {
      box.__bound = true;
      box.addEventListener('click', (e) => {
        const btn = e.target.closest('.gpt-quick-chip');
        if (!btn) return;
        const idx = Number(btn.getAttribute('data-idx'));
        const item = (this._quickItems || [])[idx];
        if (item) this.sendMessage(item.prompt.trim());
      });
    }
  }

  renderWelcome() {
    const list = document.getElementById('veraMessageList');
    if (!list) return;
    this._setWelcomeMode(true);
    const name = this._greetingName();
    const salute = this._timeGreeting();
    const greeting = name ? `${salute}, ${escapeHtml(name)}` : salute;
    window.Estado.pintar(list, `
      <div class="gpt-welcome gpt-welcome--hero">
        <div class="gpt-welcome-mark gpt-welcome-mark--wordmark">
          <img src="${VERA_WORDMARK_SRC}" alt="Vera" height="44" decoding="async" />
        </div>
        <h1 class="gpt-welcome-title gpt-welcome-title--anim">${greeting}</h1>
      </div>
    `);
    this._renderQuickSuggestions();
  }

  _bindTaskEvents() {
    const root = document.getElementById('veraMessageList');
    if (!root || root.__veraTaskBound) return;
    root.__veraTaskBound = true;

    root.addEventListener('change', async (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      if (!el.classList.contains('gpt-task-checkbox')) return;
      const idx = Number(el.getAttribute('data-task-idx') || '0');
      const taskText = el.getAttribute('data-task-text') || '';
      const sourceMessageId = el.getAttribute('data-message-id') || '';
      const checked = !!el.checked;

      // Corte ADR-0052: api-task-event se apagó; el evento queda en memoria y viaja
      // en el próximo mensaje (no dispara una respuesta de Vera por sí solo).
      (this._eventosPendientes ||= []).push({ sourceMessageId, idx, taskText, checked });
    });
  }

  _bindQuickReplyButtons() {
    const root = document.getElementById('veraMessageList');
    if (!root || root.__veraQuickRepliesBound) return;
    root.__veraQuickRepliesBound = true;

    root.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('button.gpt-qr-btn');
      if (!btn) return;
      const text = btn.getAttribute('data-qr-text') || '';
      if (!text.trim()) return;
      if (this.aiState.isLoading) return;

      // Disable the whole quick reply group after selection (prevents double clicks)
      const group = btn.closest?.('[data-qr="true"]');
      if (group) {
        group.querySelectorAll?.('button.gpt-qr-btn')?.forEach?.((b) => (b.disabled = true));
        group.setAttribute('data-qr-used', 'true');
      }

      this.sendMessage(text.trim());
    });
  }

  /* Opciones interactivas [CLARIFY]/[PILLS]: click en una opcion la ENVIA como
     respuesta del usuario. Delegacion idempotente sobre la lista de mensajes. */
  _bindInteractiveOptions() {
    // Se enlaza en #chatcontainer (no en la lista de mensajes) para cubrir tanto
    // las opciones inline como el widget DOCKEADO sobre el composer.
    const root = document.getElementById('chatcontainer');
    if (!root || root.__veraInteractiveBound) return;
    root.__veraInteractiveBound = true;

    root.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('[data-vera-send]');
      if (!btn) return;
      const block = btn.closest('.vera-interactive');
      if (block && block.classList.contains('answered')) return;
      if (this.aiState.isLoading) return;
      const value = btn.getAttribute('data-vera-send') || '';
      if (!value.trim()) return;
      // Bloquea reenvio y marca la opcion elegida.
      if (block) {
        block.classList.add('answered');
        btn.classList.add('selected');
      }
      // Si el mensaje trae VARIOS grupos interactivos (formulario multi-parametro,
      // p.ej. Escenario + Formato + Movimiento), acumula cada seleccion en el
      // composer en vez de enviar — asi el usuario junta todas las decisiones y
      // envia una sola vez. Con un solo grupo (quick reply) se envia de inmediato.
      const msgEl = btn.closest('.gpt-msg');
      const groupCount = msgEl ? msgEl.querySelectorAll('.vera-interactive').length : 1;
      if (groupCount > 1) {
        const input = document.getElementById('veraInput');
        if (input) {
          const cur = (input.value || '').trim();
          input.value = cur ? `${cur}, ${value.trim()}` : value.trim();
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
          try { input.selectionStart = input.selectionEnd = input.value.length; } catch (_) { /* el campo no admite selección */ }
        }
        return;
      }
      this._undockQuestion();
      this.sendMessage(value.trim());
    });
  }

  _focusComposer() {
    const input = document.getElementById('veraInput');
    if (!input) return;
    input.focus();
    try { input.selectionStart = input.selectionEnd = input.value.length; } catch (_) { /* el campo no admite selección */ }
  }

  /* Controlador del widget [CLARIFY]: pager "n de N", teclado (↑↓ opciones,
     ←→ paginas), modos multi (toggle + Confirmar) y rank (drag + Confirmar),
     "Algo más" (foca el composer), "Omitir"/cerrar. El envio en modo single lo
     maneja la delegacion data-vera-send. */
  _initClarifyWidgets() {
    const widgets = document.querySelectorAll('.vera-clarify:not(.__init)');
    widgets.forEach((w) => {
      w.classList.add('__init');
      const pagesEls = Array.from(w.querySelectorAll('.vera-clarify-page'));
      const total = pagesEls.length;
      const qEl = w.querySelector('.vera-clarify-q');
      const countEl = w.querySelector('.vera-clarify-count');
      const confirmBtn = w.querySelector('[data-vera-confirm]');
      let page = 0;
      let focusIdx = -1;

      const currentPage = () => pagesEls[page];
      const currentMode = () => currentPage()?.getAttribute('data-mode') || 'single';
      const currentOpts = () => Array.from(currentPage().querySelectorAll('.vera-opt'));

      const refreshConfirm = () => {
        if (!confirmBtn) return;
        const mode = currentMode();
        if (mode === 'single') { confirmBtn.hidden = true; return; }
        confirmBtn.hidden = false;
        if (mode === 'multi') {
          const any = currentPage().querySelector('.vera-opt--check.checked');
          confirmBtn.disabled = !any;
        } else {
          confirmBtn.disabled = false; // rank: siempre hay un orden valido
        }
      };

      const clearFocus = () => currentOpts().forEach((o) => o.classList.remove('is-focused'));
      const setFocus = (i) => {
        const opts = currentOpts();
        if (!opts.length) return;
        clearFocus();
        focusIdx = (i + opts.length) % opts.length;
        opts[focusIdx].classList.add('is-focused');
        opts[focusIdx].focus({ preventScroll: true });
      };
      const showPage = (i) => {
        if (total < 1) return;
        page = (i + total) % total;
        pagesEls.forEach((p, idx) => { p.hidden = idx !== page; });
        if (qEl) qEl.textContent = currentPage().getAttribute('data-q') || '';
        if (countEl) countEl.textContent = __('{n} de {total}', { n: page + 1, total });
        focusIdx = -1;
        clearFocus();
        refreshConfirm();
      };

      // Cerrar (X) / Omitir descartan la pregunta sin enviar y desmontan el dock.
      const dismiss = () => {
        const dock = w.closest('#veraDock');
        w.classList.add('answered', 'dismissed');
        if (dock) dock.remove();
      };
      const submit = (value) => {
        const v = String(value || '').trim();
        if (!v) return;
        w.classList.add('answered');
        this._undockQuestion();
        this.sendMessage(v);
      };

      // Toggle de checkboxes (modo multi)
      w.addEventListener('click', (e) => {
        const chk = e.target.closest('.vera-opt--check');
        if (!chk || !w.contains(chk)) return;
        chk.classList.toggle('checked');
        chk.setAttribute('aria-pressed', chk.classList.contains('checked') ? 'true' : 'false');
        refreshConfirm();
      });

      // Confirmar (multi / rank): reune la seleccion de la pagina activa y envia.
      confirmBtn?.addEventListener('click', () => {
        const mode = currentMode();
        if (mode === 'multi') {
          const sel = Array.from(currentPage().querySelectorAll('.vera-opt--check.checked'))
            .map((el) => el.getAttribute('data-vera-value') || '').filter(Boolean);
          if (sel.length) submit(sel.join(', '));
        } else if (mode === 'rank') {
          const order = Array.from(currentPage().querySelectorAll('.vera-opt--rank'))
            .map((el) => el.getAttribute('data-vera-value') || '').filter(Boolean);
          if (order.length) submit(order.join(' > '));
        }
      });

      // Drag para reordenar (modo rank)
      this._bindRankDrag(w, refreshConfirm);

      w.querySelector('.vera-clarify-prev')?.addEventListener('click', () => showPage(page - 1));
      w.querySelector('.vera-clarify-next')?.addEventListener('click', () => showPage(page + 1));
      w.querySelector('.vera-clarify-close')?.addEventListener('click', dismiss);
      w.querySelector('[data-vera-skip]')?.addEventListener('click', dismiss);
      w.querySelector('[data-vera-more]')?.addEventListener('click', () => this._focusComposer());

      w.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setFocus(focusIdx + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setFocus(focusIdx - 1); }
        else if (e.key === 'ArrowRight' && total > 1) { e.preventDefault(); showPage(page + 1); }
        else if (e.key === 'ArrowLeft' && total > 1) { e.preventDefault(); showPage(page - 1); }
        // En modo single, Enter sobre la opcion enfocada dispara su click → envia.
      });

      refreshConfirm();
    });
  }

  /* Drag-and-drop minimo para opciones rank: reordena por posicion y renumera. */
  _bindRankDrag(w, onChange) {
    const renumber = (list) => list.querySelectorAll('.vera-opt-rank-num')
      .forEach((n, i) => { n.textContent = i + 1; });

    w.querySelectorAll('.vera-opt-list').forEach((list) => {
      if (!list.querySelector('.vera-opt--rank')) return;

      list.addEventListener('dragstart', (e) => {
        const li = e.target.closest('.vera-opt--rank');
        if (li) li.classList.add('dragging');
      });
      list.addEventListener('dragend', (e) => {
        const li = e.target.closest('.vera-opt--rank');
        if (li) li.classList.remove('dragging');
        renumber(list);
        if (typeof onChange === 'function') onChange();
      });
      list.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = list.querySelector('.vera-opt--rank.dragging');
        if (!dragging) return;
        const after = Array.from(list.querySelectorAll('.vera-opt--rank:not(.dragging)'))
          .find((el) => e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
        if (after) list.insertBefore(dragging, after);
        else list.appendChild(dragging);
      });
    });
  }

  /* Ancla la pregunta activa (el [CLARIFY] del ultimo turno de Vera) como parte
     del contenedor del input: la mueve a un dock encima del composer. El textarea
     sigue usable debajo. Las preguntas de turnos previos quedan inline como
     registro estatico (.answered). */
  _dockActiveClarify() {
    const list = document.getElementById('veraMessageList');
    const overlay = document.getElementById('chatInputOverlay');
    if (!list || !overlay) return;

    // Si ya hay una pregunta anclada y sigue vigente, no la toques (evita que un
    // re-render intermedio la pierda).
    const existing = document.querySelector('#veraDock .vera-clarify');
    if (existing && !existing.classList.contains('answered') && !existing.classList.contains('dismissed')) {
      return;
    }
    this._undockQuestion();

    // Solo se ancla la pregunta del ULTIMO mensaje (turno mas reciente).
    const lastMsg = list.lastElementChild;
    const active = lastMsg ? lastMsg.querySelector('.vera-clarify:not(.answered):not(.dismissed)') : null;

    // Preguntas historicas → registro estatico inline.
    list.querySelectorAll('.vera-clarify').forEach((w) => { if (w !== active) w.classList.add('answered'); });

    if (!active) return;

    const dock = document.createElement('div');
    dock.id = 'veraDock';
    dock.className = 'vera-dock';
    overlay.insertBefore(dock, overlay.firstChild);
    active.classList.add('is-docked');
    dock.appendChild(active);

    // Si la burbuja fuente quedo sin texto (solo era la pregunta), la ocultamos.
    const srcContent = lastMsg.querySelector?.('.gpt-msg-content');
    if (srcContent && !srcContent.textContent.trim() && !srcContent.querySelector('img,video,iframe,table')) {
      lastMsg.style.display = 'none';
    }
  }

  _undockQuestion() {
    document.getElementById('veraDock')?.remove();
  }

  async renderMessages() {
    const list = document.getElementById('veraMessageList');
    const scroll = document.getElementById('veraMessagesWrap');
    if (!list) return;

    if (!this.aiState.messages.length) {
      this.renderWelcome();
      return;
    }
    this._setWelcomeMode(false);

    // Pre-render asíncrono: para cada mensaje del asistente convertimos markdown
    // a HTML antes de pintar (los del usuario se escapan dentro de _msgHTML).
    const prepared = await Promise.all(this.aiState.messages.map(async (m) => {
      if (m.role === 'assistant' || m.role === 'error' || m.role === 'vera') {
        try {
          const html = await this.renderMarkdown(m.content || '');
          return { ...m, _renderedContent: html };
        } catch (e) {
          console.warn('VeraView.renderMessages: render falló para msg', m.id, e?.message || e);
          return { ...m, _renderedContent: '' };
        }
      }
      return m;
    }));

    this._undockQuestion();
    window.Estado.pintar(list, prepared.map(m => this._msgHTML(m)).join(''));
    this._bindMediaHover();
    this._bindTaskEvents();
    this._bindQuickReplyButtons();
    this._bindInteractiveOptions();
    this._initClarifyWidgets();
    this._dockActiveClarify();
    this._processChatRichContent(list);
    if (scroll) setTimeout(() => { scroll.scrollTop = scroll.scrollHeight; }, 20);

    // Handler global para action pills emitidos por bloques [ACTIONS].
    if (typeof window !== 'undefined') {
      window._veraSendAction = (text) => this.sendMessage(text);
      // Aprobacion de accion de escritura (gate APPROVE_ACTION): persiste el
      // TASK_EVENT (igual que el checkbox) y dispara a Vera para que ejecute.
      window._veraApproveAction = async (key, msgId, btnEl) => {
        if (btnEl) { btnEl.disabled = true; btnEl.textContent = __('✓ Aprobado'); btnEl.classList.add('vera-approve-pill--done'); }
        // Sin task-event en v2 (ADR-0052): la aprobación viaja como mensaje a Vera.
        this.sendMessage(__('Aprobado, procede con la acción.'));
      };
      window._veraOpenArtifact = (btnEl) => this._openArtifactPanel(btnEl);
    }
  }

  /* ── Render adjuntos dentro de un mensaje del usuario ── */
  _renderUserAttachments(attachments) {
    const list = Array.isArray(attachments) ? attachments : [];
    if (!list.length) return '';
    const items = list.map(a => {
      const type = String(a.type || '').toLowerCase();
      const name = escapeHtml(a.name || __('archivo'));
      const url = a.url || '#';
      if (type === 'image') {
        return `<a class="gpt-msg-att gpt-msg-att--image" href="${escapeHtml(url)}" target="_blank" rel="noopener">
          <img src="${escapeHtml(url)}" alt="${name}" loading="lazy" />
        </a>`;
      }
      const icon = this._attachmentIconClass(type);
      return `<a class="gpt-msg-att gpt-msg-att--file" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${name}">
        <i class="fas ${icon}"></i>
        <span>${name}</span>
      </a>`;
    }).join('');
    return `<div class="gpt-msg-attachments">${items}</div>`;
  }

  /* ── Typing / Activity indicator ────────────────────── */
  /* ── Pegado al fondo, pero solo si el usuario YA estaba abajo ──────────────
     El chat forzaba scrollTop = scrollHeight en cada append y en cada estado
     (cada 5s durante esperas de hasta 12 min): si subías a releer una respuesta
     mientras Vera trabajaba, te devolvía al fondo una y otra vez. Ahora solo se
     sigue al que ya estaba mirando el final; leer atrás no se interrumpe.
     `forzar` es para lo que el usuario acaba de provocar (su propio mensaje). */
  _pegadoAlFondo(scroll, margen = 120) {
    if (!scroll) return false;
    return (scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight) <= margen;
  }

  _irAlFondo(scroll, forzar = false) {
    if (!scroll) return;
    if (!forzar && !this._pegadoAlFondo(scroll)) return;
    scroll.scrollTop = scroll.scrollHeight;
  }

  showTypingIndicator(statusText) {
    const list = document.getElementById('veraMessageList');
    const scroll = document.getElementById('veraMessagesWrap');
    if (!list) return;
    const welcome = list.querySelector('.gpt-welcome');
    if (welcome) welcome.remove();
    document.getElementById('gptTyping')?.remove();
    list.insertAdjacentHTML('beforeend', `
      <div id="gptTyping" class="gpt-msg gpt-msg--assistant gpt-msg--typing">
        <div class="gpt-msg-avatar">
          <img class="gpt-msg-avatar-img" src="${VERA_AVATAR_SRC}" alt="Vera" loading="lazy" decoding="async" />
        </div>
        <div class="gpt-msg-content">
          <div class="gpt-typing-dots"><span></span><span></span><span></span></div>
          <div class="gpt-typing-status" id="veraStatusText">${statusText ? escapeHtml(statusText) : ''}</div>
        </div>
      </div>
    `);
    // Forzado: aparece justo después de que el usuario mandó su mensaje.
    this._irAlFondo(scroll, true);
  }

  updateTypingStatus(text) {
    const el = document.getElementById('veraStatusText');
    if (el) el.textContent = text || '';
    // Solo sigue al que ya estaba abajo: esto corre cada 5s durante toda la espera.
    this._irAlFondo(document.getElementById('veraMessagesWrap'));
  }

  hideTypingIndicator() {
    document.getElementById('gptTyping')?.remove();
  }

  /**
   * «Detener» mientras Vera trabaja: POST /v1/turnos/:id/cancelar MARCA el turno y el bucle
   * lo mira entre pasos; al parar escribe «Detuve lo que estaba haciendo» y la espera se
   * cierra sola con ese mensaje. El botón vive dentro del indicador y se va con él.
   */
  _mostrarDetener() {
    const turno = this._turnoActivo;
    const cont = document.querySelector('#gptTyping .gpt-msg-content');
    if (!turno || !cont || cont.querySelector('.gpt-typing-stop') || !window.VeraDatos?.cancelarTurno) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gpt-typing-stop';
    b.textContent = __('Detener');
    b.addEventListener('click', async () => {
      b.disabled = true;
      b.textContent = __('Deteniendo…');
      try {
        const r = await window.VeraDatos.cancelarTurno(turno);
        if (r?.cancelado === true) {
          this._deteniendo = true;
          this.updateTypingStatus(this._getWaitMessage(0));
        } else {
          b.textContent = __('Ya está terminando');
        }
      } catch (e) {
        console.warn('[VeraView] cancelar turno:', e?.codigo || e?.message || e);
        b.disabled = false;
        b.textContent = __('Detener');
        window.showToast?.(__('No se pudo detener. Intenta de nuevo.'), { type: 'error' });
      }
    });
    cont.appendChild(b);
  }

  /* _playNotificationSound() vive ahora en BaseView (chime canonico de la
     plataforma, compartido con Studio); VeraView lo hereda tal cual. */

  /**
   * Solicita permiso de notificaciones del navegador (llamar una vez al iniciar).
   */
  async _requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => {});
    }
  }

  /**
   * Muestra una notificación del sistema si la pestaña no tiene foco.
   */
  _showBrowserNotification(text) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.hasFocus()) return; // Solo si el usuario está en otra pestaña

    try {
      const notif = new Notification(__('Vera terminó de trabajar'), {
        body: text ? text.slice(0, 100) : __('Tu solicitud está lista.'),
        icon: '/img/vera-avatar.png',
        badge: '/img/vera-avatar.png',
        tag: 'vera-response', // Reemplaza notificaciones anteriores
      });
      notif.onclick = () => { window.focus(); notif.close(); };
      setTimeout(() => notif.close(), 8000);
    } catch (_) { /* sin permiso de notificaciones: nada que avisar */ }
  }

  /* ── Input binding ───────────────────────────────────── */
  bindInput() {
    const input = document.getElementById('veraInput');
    const sendBtn = document.getElementById('veraSend');
    if (!input) return;

    const autoResize = () => {
      input.style.height = 'auto';
      const next = Math.min(180, input.scrollHeight || 0);
      if (next > 0) input.style.height = `${next}px`;
    };

    const syncSendBtn = () => {
      if (!sendBtn) return;
      const hasText = !!(input.value || '').trim();
      const hasReadyAttachment = this.aiState.pendingAttachments.some(a => a.status === 'ready');
      sendBtn.disabled = (!hasText && !hasReadyAttachment) || this.aiState.isLoading;
    };
    this._syncSendBtn = syncSendBtn;

    this.addEventListener(input, 'input', () => { autoResize(); syncSendBtn(); this._refrescarOmnibox(); });
    // Mover el cursor también cambia el `@…` que se está escribiendo.
    this.addEventListener(input, 'click', () => this._refrescarOmnibox());
    this.addEventListener(input, 'blur', () => setTimeout(() => this._cerrarOmnibox(), 120));
    autoResize();
    syncSendBtn();

    const send = () => {
      const text = (input.value || '').trim();
      const hasReadyAttachment = this.aiState.pendingAttachments.some(a => a.status === 'ready');
      if ((!text && !hasReadyAttachment) || this.aiState.isLoading) return;
      this.sendMessage(text);
      input.value = '';
      input.style.height = 'auto';
      syncSendBtn();
    };

    this.addEventListener(input, 'keydown', (e) => {
      // Con el omnibox abierto, las flechas y el Enter son SUYOS: Enter elige el
      // elemento, no envía el mensaje a medio escribir.
      if (this._omni) {
        if (e.key === 'ArrowDown')  { e.preventDefault(); this._moverOmnibox(1);  return; }
        if (e.key === 'ArrowUp')    { e.preventDefault(); this._moverOmnibox(-1); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this._elegirDelOmnibox(); return; }
        if (e.key === 'Escape')     { e.preventDefault(); this._cerrarOmnibox(); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    if (sendBtn) this.addEventListener(sendBtn, 'click', send);

    // Menú "+" del composer: archivos/fotos o biblioteca.
    const plusBtn = document.getElementById('veraPlus');
    const plusMenu = document.getElementById('veraPlusMenu');
    const fileInput = document.getElementById('veraFileInput');
    const closeMenu = () => {
      if (!plusMenu) return;
      plusMenu.hidden = true;
      plusBtn?.setAttribute('aria-expanded', 'false');
    };
    this._closeComposerMenu = closeMenu;

    if (plusBtn && plusMenu) {
      this.addEventListener(plusBtn, 'click', (e) => {
        e.stopPropagation();
        if (this.aiState.isLoading) return;
        const open = plusMenu.hidden;
        plusMenu.hidden = !open;
        plusBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      // Cierra al hacer click fuera o con Escape.
      this.addEventListener(document, 'click', (e) => {
        if (plusMenu.hidden) return;
        if (!e.target.closest?.('.vera-plus-wrap')) closeMenu();
      });
      this.addEventListener(document, 'keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
      });
    }

    const filesItem = document.getElementById('veraMenuFiles');
    if (filesItem && fileInput) {
      this.addEventListener(filesItem, 'click', () => { closeMenu(); fileInput.click(); });
    }
    // Items de tipo de biblioteca (Producto, Campaña, etc.) → picker de ese tipo.
    if (plusMenu) {
      this.addEventListener(plusMenu, 'click', (e) => {
        const it = e.target.closest('[data-lib-type]');
        if (!it) return;
        closeMenu();
        this._openLibraryPicker(it.getAttribute('data-lib-type'));
      });
    }
    if (fileInput) {
      this.addEventListener(fileInput, 'change', (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        this._handleFileSelection(files);
      });
    }
  }

  /* ── Send message ──────────────────────────────────────
     opts.confirmedHighCost — pasa true cuando el usuario aceptó la
     advertencia de costo y queremos que el backend salte el pre-check. */
  async sendMessage(text, opts = {}) {
    if (!this.aiState.organization_id) return;
    // Ocupada: se AVISA. Antes se descartaba el envio en silencio mientras el
    // mensaje de espera invitaba justamente a "enviar otro mensaje" — el texto
    // prometia algo que el codigo prohibia, y sin decirlo.
    if (this.aiState.isLoading) {
      window.showToast?.(__('Vera está trabajando en tu mensaje anterior. En cuanto responda, sigue.'), { type: 'info' });
      return;
    }

    // Al enviar (opcion o texto libre) se retira la pregunta anclada al composer.
    if (!opts.confirmedHighCost) this._undockQuestion();

    // Tomamos snapshot de adjuntos listos y limpiamos pendientes antes de enviar.
    const ready = this.aiState.pendingAttachments.filter(a => a.status === 'ready');
    const libItems = ready.filter(a => a.type === 'library');
    const fileReady = ready.filter(a => a.type !== 'library');
    if (!text && !fileReady.length && !libItems.length) return;
    const attachments = fileReady.map(a => ({
      url: a.url, type: a.type, name: a.name, mime: a.mime
    }));
    // Referencias de biblioteca para mostrar como chips en el mensaje del usuario.
    const libraryRefs = libItems.map(a => ({ kind: a.kind, id: a.refId, name: a.name }));
    // Mensaje que recibe Vera: texto + bloque de contexto de biblioteca.
    const messageToSend = `${text || ''}${this._buildLibraryContext(libItems)}`;
    if (!opts.confirmedHighCost) {
      // Solo limpiamos los adjuntos en el primer intento — si llega
      // confirmación y reenviamos, ya no hay attachments para mostrar como chips.
      this.aiState.pendingAttachments = [];
      this._renderAttachChips();
    }

    this.aiState.isLoading = true;

    const sendBtn = document.getElementById('veraSend');
    const input = document.getElementById('veraInput');
    if (sendBtn) sendBtn.disabled = true;

    // Mostrar mensaje del usuario inmediatamente solo en el primer intento.
    let userMsg = null;
    if (!opts.confirmedHighCost) {
      userMsg = {
        id: `local-user-${Date.now()}`,
        role: 'user',
        content: text, // display limpio; el contexto de biblioteca va aparte
        attachments,
        libraryRefs,
        created_at: new Date().toISOString()
      };
      this.aiState.messages.push(userMsg);
      this.appendMessage(userMsg);
    }
    this.showTypingIndicator();

    try {
      // Corte ADR-0052: la conversación se crea por PostgREST (ai.conversations) y el
      // mensaje va por el borde: POST /v1/conversaciones/:id/mensajes {texto, id_cliente}.
      // El borde guarda el `user` y ENCOLA el turno; la respuesta llega como filas
      // `assistant` en ai.messages (también «sin créditos» / «tope» / «cancelado»).
      if (!window.VeraDatos) throw new Error(__('Vera no está disponible. Recarga la página.'));
      let convId = this.aiState.active_conversation_id;
      let nueva = false;
      if (!convId) {
        const conv = await window.VeraDatos.crearConversacion(this.aiState.organization_id, { userId: this.userId, marketId: this.aiState.brand_container_id || null });
        convId = conv.id; nueva = true;
        this.aiState.active_conversation_id = convId;
        this._setConversationUrl(convId);
      }
      // uuid v4 siempre (el borde valida id_cliente con z.uuid()), también fuera de contexto seguro.
      const idCliente = window.apiV2?.nuevoIdCliente?.();
      const envio = await window.VeraDatos.enviar(convId, messageToSend, idCliente);
      this._turnoActivo = envio?.turno_id || null;
      this._mostrarDetener();
      if (userMsg && envio?.mensaje_id) userMsg.id = envio.mensaje_id;
      if (nueva) { this._refreshHistorySoon(); this._nameConversationSoon(convId, text); }
      await this._waitForAsyncResponse(convId, null);
    } catch (err) {
      console.error('VeraView sendMessage:', err);
      this.hideTypingIndicator();
      const code = err?.code || err?.codigo;
      const texto = code === 'sin_api' ? __('Vera aún no responde en esta consola: el borde no está configurado.')
        : code === 'sin_agente' ? __('Esta marca no tiene una Vera activa todavía.')
        : code === 'sin_saldo' ? __('No hay créditos para que Vera piense. Recarga saldo y vuelve a escribirle.')
        : (err?.http === 403 || code === '42501') ? __('Tu rol no puede conversar con Vera en esta marca (permiso conversar_con_agente).')
        : __('Lo siento, hubo un error al procesar tu mensaje. Inténtalo de nuevo.');
      const errMsg = {
        id: `local-error-${Date.now()}`,
        role: 'error',
        content: texto,
        created_at: new Date().toISOString()
      };
      this.aiState.messages.push(errMsg);
      this.appendMessage(errMsg);
    } finally {
      this._turnoActivo = null;
      this._deteniendo = false;
      this.aiState.isLoading = false;
      if (sendBtn) sendBtn.disabled = !(input?.value || '').trim();
    }
  }

  /* Pregunta al usuario si quiere continuar con una tarea costosa (Capas.confirmar). */
  async _confirmHighCost(estimate) {
    if (!estimate) return true;
    const usdMin = Number(estimate.usd_min || 0).toFixed(2);
    const usdMax = Number(estimate.usd_max || 0).toFixed(2);
    const minutesRange = `${estimate.minutes_min || 1}-${estimate.minutes_max || 10} ${__('min')}`;
    const reasons = (estimate.reasons || []).filter(Boolean).join(' · ');
    const texto =
      `${__('Costo estimado:')} $${usdMin} – $${usdMax} USD · ${__('Duración estimada:')} ${minutesRange}` +
      (reasons ? `. ${__('Razones:')} ${reasons}` : '');
    return window.Capas.confirmar({
      titulo: __('Vera detectó una tarea potencialmente costosa. ¿Continuar?'),
      texto,
      aceptar: __('Ejecutar'),
      cancelar: __('Replantear'),
    });
  }

  _removeMessage(id) {
    const idx = this.aiState.messages.findIndex(m => m.id === id);
    if (idx >= 0) this.aiState.messages.splice(idx, 1);
    // El nodo del mensaje lleva `data-message-id` (ver _msgHTML); este método
    // buscaba `data-msg-id` —el atributo del bloque [CONFIRM]— y por eso NUNCA
    // borraba nada de la pantalla: el mensaje descartado seguía visible.
    const esc = window.CSS?.escape ? window.CSS.escape(id) : String(id).replace(/"/g, '\\"');
    document.querySelector(`[data-message-id="${esc}"]`)?.remove();
  }

  /* ── Mensajes de espera cíclicos (cuando no hay status del backend) ─────── */
  _getWaitMessage(elapsedMs) {
    if (this._deteniendo) return __('Vera se detiene al terminar el paso en curso…');
    if (elapsedMs < 15_000)  return __('Vera está pensando…');
    if (elapsedMs < 40_000)  return __('Vera está procesando tu solicitud…');
    if (elapsedMs < 90_000)  return __('Vera está trabajando en segundo plano…');
    if (elapsedMs < 180_000) return __('Vera está realizando tareas complejas — puede tardar unos minutos…');
    if (elapsedMs < 360_000) return __('Vera sigue activa — procesando en background…');
    // NO invitar a "enviar otro mensaje": el composer está bloqueado hasta que
    // Vera responda. Prometer lo que la pantalla no deja hacer es peor que callar.
    return __('Vera lleva un buen rato trabajando. Puedes dejarla y volver: la respuesta te espera en este chat.');
  }

  /* ── Espera la respuesta async SOLO via Supabase Realtime ───────────────── */
  //
  // Diseño intencional:
  //   - SIN polling: no se consulta "el último mensaje por fecha" para evitar
  //     que un mensaje anterior aparezca mientras Vera procesa el nuevo.
  //   - SOLO Realtime: escucha INSERTs en ai_messages filtrados por
  //     conversation_id (server-side, Supabase lo garantiza).
  //   - El mensaje se muestra ÚNICAMENTE cuando entra en tiempo real con el
  //     conversation_id exacto de esta conversación.
  //   - Si el tiempo de espera se agota, se avisa al usuario que recargue —
  //     nunca se carga el historial para "adivinar" la respuesta.
  //
  async _waitForAsyncResponse(conversationId, token, opts = {}) {
    return new Promise((resolve) => {
      const startTime    = Date.now();
      const NOTIFY_AFTER_MS = 5_000;
      // 12 minutos — OpenClaw puede tardar hasta 10 min en tareas complejas.
      // `opts.maxWaitMs` lo acorta para esperas que DEBEN ser inmediatas (el
      // bloque de confirmación ya está escrito en la BD cuando llegamos aquí):
      // si algo va mal ahí, hay que fallar rápido y decirlo, no colgar 12 min.
      const MAX_WAIT_MS  = opts.maxWaitMs || 12 * 60 * 1000;
      const TICK_MS      = 5_000;
      // Polling de respaldo: primer check a los 5s, luego cada 6s
      const POLL_FIRST_MS    = 5_000;
      const POLL_INTERVAL_MS = 6_000;

      let resolved     = false;
      let lastStatusAt = Date.now();
      let tickInterval = null;
      let pollInterval = null;
      let firstPollTimeout = null;
      let channel      = null;

      // Cancelacion al navegar fuera de Vera: el router llama onLeave(), que
      // invoca este cierre para matar ticker + polling (6s) + canal realtime.
      // Sin esto, mandar un mensaje y navegar dejaba estos timers golpeando
      // Supabase en background hasta MAX_WAIT_MS (12 min). Las closures capturan
      // las variables por referencia, asi que leen el valor ya asignado.
      this._cancelAsyncWait = () => {
        if (resolved) return;
        resolved = true;
        clearInterval(tickInterval);
        clearInterval(pollInterval);
        clearTimeout(firstPollTimeout);
        try { channel?.unsubscribe(); } catch (_) { /* el canal ya se cerró */ }
        this._cancelAsyncWait = null;
        resolve();
      };

      // ── Cierra la espera y muestra el mensaje ─────────────────────────────
      const finish = (msg) => {
        if (resolved) return;
        resolved = true;
        clearInterval(tickInterval);
        clearInterval(pollInterval);
        clearTimeout(firstPollTimeout);
        this._cancelAsyncWait = null;
        try { channel?.unsubscribe(); } catch (_) { /* el canal ya se cerró */ }
        this.hideTypingIndicator();

        if (msg) {
          const isError = msg.role === 'error' || msg.metadata?.error;
          const displayMsg = {
            id: msg.id || `local-${Date.now()}`,
            role: isError ? 'error' : 'assistant',
            content: msg.content,
            // Se arrastra el metadata: el [CONFIRM] lleva ahí el mensaje original
            // que el botón "Autorizar" tiene que reenviar. Recortarlo aquí dejaba
            // el botón muerto para todo lo que llegara en vivo.
            metadata: msg.metadata || null,
            created_at: msg.created_at || new Date().toISOString()
          };
          this.aiState.messages.push(displayMsg);
          this.appendMessage(displayMsg);

          if (!isError && Date.now() - startTime >= NOTIFY_AFTER_MS) {
            this._playNotificationSound();
            this._showBrowserNotification(msg.content);
          }
        }
        resolve();
      };

      // ── Procesa cada mensaje recibido (Realtime o polling) ────────────────
      const handleMsg = (msg) => {
        if (!msg?.role || !msg?.content) return;

        // Solo mensajes de ESTA conversación
        if (msg.conversation_id && msg.conversation_id !== conversationId) return;

        if (msg.role === 'status') {
          lastStatusAt = Date.now();
          this.updateTypingStatus(msg.content);
          return;
        }

        if (msg.role === 'assistant' || msg.role === 'error') {
          finish(msg);
        }
      };

      // ── Polling de respaldo: busca mensajes NUEVOS (> startIso) ──────────
      // Garantiza que si Realtime falla, igual mostramos la respuesta.
      // El filtro created_at > startIso previene cargar el mensaje anterior.
      const doPoll = async () => {
        if (resolved || !window.VeraDatos) return;
        try {
          // Se descarta por ID, no por fecha (el reloj del navegador no es el de Postgres).
          const vistos = new Set((this.aiState.messages || []).map((m) => m.id));
          const nuevos = await window.VeraDatos.respuestasNuevas(conversationId, vistos);
          if (nuevos[0]) handleMsg(nuevos[0]);
        } catch (err) {
          // Fallback poll del chat: si esto falla repetidamente, el usuario verá
          // "escribiendo…" sin respuesta. Logueamos para poder diagnosticar.
          console.warn('[VeraView] polling fallback falló:', err?.message || err);
        }
      };

      // ── Ticker de UI ──────────────────────────────────────────────────────
      tickInterval = setInterval(() => {
        if (resolved) return;
        const elapsed = Date.now() - startTime;

        if (elapsed >= MAX_WAIT_MS) {
          clearInterval(tickInterval);
          clearInterval(pollInterval);
          clearTimeout(firstPollTimeout);
          if (!resolved) {
            resolved = true;
            this._cancelAsyncWait = null;
            try { channel?.unsubscribe(); } catch (_) { /* el canal ya se cerró */ }
            this.hideTypingIndicator();
            const timeoutMsg = {
              id: `local-timeout-${Date.now()}`,
              role: 'error',
              content: opts.timeoutMsg
                // Sin estado del turno desde la consola: no se promete una respuesta que puede no
                // llegar (si el trabajo cayó sin escribir, no llega nunca). Se dice qué hacer.
                || __('Vera no respondió en 12 minutos. Recarga la página: si su respuesta no aparece, vuelve a enviarle el mensaje.'),
              created_at: new Date().toISOString()
            };
            this.aiState.messages.push(timeoutMsg);
            this.appendMessage(timeoutMsg);
            resolve();
          }
          return;
        }

        // Mostrar ticker solo si no hay actividad reciente del backend
        if (Date.now() - lastStatusAt > 10_000) {
          this.updateTypingStatus(this._getWaitMessage(elapsed));
        }
      }, TICK_MS);

      // Primer poll a los 5s, luego cada 6s — cubre casos donde Realtime no entrega
      firstPollTimeout = setTimeout(() => { doPoll(); pollInterval = setInterval(doPoll, POLL_INTERVAL_MS); }, POLL_FIRST_MS);

      // ── Supabase Realtime — entrega instantánea ───────────────────────────
      if (!this.supabase) {
        // Sin cliente Supabase no podemos escuchar — informar al usuario
        finish({
          role: 'error',
          content: __('No se pudo conectar al tiempo real. Recarga la página para ver la respuesta de Vera.')
        });
        return;
      }

      try {
        channel = this.supabase
          .channel(`vera-msg-${conversationId}-${Date.now()}`)
          .on('postgres_changes', {
            // Base nueva: ai.messages (la 180000 la publica; hasta entonces el sondeo es la red).
            event: 'INSERT',
            schema: 'ai',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          }, (payload) => {
            handleMsg(window.VeraDatos ? window.VeraDatos.mapeo.mensajeAV1(payload.new) : payload.new);
          })
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.warn('VeraView Realtime: canal con error, estado:', status);
            }
          });
      } catch (e) {
        console.warn('VeraView: Realtime no disponible:', e.message);
        finish({
          role: 'error',
          content: __('No se pudo conectar al tiempo real. Recarga la página para ver la respuesta de Vera.')
        });
      }
    });
  }
}

/* Expuesto para prueba: la convergencia del alto de los iframes se verifica en
   test/vera-artifact-altura.test.js sin navegador. */
VeraView._fitSandboxFrame = fitSandboxFrame;

window.VeraView = VeraView;
