/**
 * VideoView — página de generación de video con Seedance 2.0 (vía KIE).
 *
 * Un solo modelo: no hay paso de "elegir modelo". Kling 3.0, su Director
 * Console, su panel de Cinematografía, el Asset Stack y el carrusel de
 * Escenas salieron de esta página; el backend de Kling (functions/kling-*)
 * NO se tocó porque js/living.js lo sigue usando como poller genérico de KIE.
 *
 * ESTADO DEL MOTOR (leer antes de tocar):
 *  - Conservado y funcional: polling de la tarea KIE (pollTask), persistencia
 *    del video en R2 (downloadAndUploadKieVideo), cobro dinámico de créditos
 *    (kie-task-finalize, dentro de pollTask), registro en system_ai_outputs
 *    y el contexto de marca (loadBrandData / buildBrandContextForAPI).
 *  - Pendiente: el endpoint de creación. No existe
 *    functions/seedance-video-create.js, así que SEEDANCE_BACKEND_READY es
 *    false y los botones avisan en pantalla en vez de disparar una tarea
 *    contra un endpoint inexistente (un 404 sería un fallo mudo). Al
 *    desplegar la función: poner el flag en true y completar
 *    buildSeedancePayload() con los params reales de KIE.
 */
class VideoView extends BaseView {
  static documentTitle = 'Video';

  /**
   * Interruptor único del cableado de Seedance. Mientras sea false la página
   * es operable pero no produce: explica lo que falta en vez de fallar mudo.
   */
  static get SEEDANCE_BACKEND_READY() {
    return false;
  }
  /** POST: crear tarea Seedance en KIE. Pendiente de desplegar. */
  static get SEEDANCE_VIDEO_CREATE_API() {
    return '/.netlify/functions/seedance-video-create';
  }
  /**
   * GET: estado de la tarea. El archivo conserva el nombre `kling-video-status`
   * por historia, pero es el poller genérico de cualquier taskId de kie.ai
   * (lo comparte Studio en js/living.js). No renombrar sin migrar ambos.
   */
  static get KIE_TASK_STATUS_API() {
    return '/.netlify/functions/kling-video-status';
  }
  static get KIE_VIDEO_DOWNLOAD_API() {
    return '/.netlify/functions/kie-video-download';
  }
  /** Doc KIE: empezar polling 2-3s; dejar de hacer polling a los 10-15 min. Usamos 3s y máximo 12 min. */
  static get POLL_INTERVAL_MS() { return 3000; }
  static get POLL_MAX_DURATION_MS() { return 12 * 60 * 1000; }
  /** Tope del textarea del Director Console (px); no debe comerse el canvas. */
  static get DIRECTOR_BRIEF_MAX_HEIGHT_PX() { return 200; }
  /** Tope adicional como fracción del alto de ventana (el menor con DIRECTOR_BRIEF_MAX_HEIGHT_PX gana). */
  static get DIRECTOR_BRIEF_MAX_VIEWPORT_FRAC() { return 0.26; }

  constructor() {
    super();
    this.templatePath = null;
    this._pollInterval = null;
    this.supabase = null;
    this.organizationId = null;
    this.brandContainerId = null;
    this.dbData = { products: [], services: [], entities: [], audiences: [], campaigns: [] };
    this.selectedCampaignId = '';
    this.selectedAudienceId = '';
    // Tokens del ultimo cine-prompt — usados al finalize del video para
    // cobrar dinamico (KIE_real + OpenAI_tokens + 5 markup). Init explicito
    // para que primer acceso no sea undefined (P3#2 audit 2026-05-25).
    this._cinePromptTokens = null;
    this._lastKieOutputId = null;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth && window.router) {
        window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    if (window.supabaseService) {
      this.supabase = await window.supabaseService.getClient();
    } else if (window.supabase) {
      this.supabase = window.supabase;
    }
    this.organizationId = window.currentOrgId || this.routeParams?.orgId || null;
  }

  renderHTML() {
    return `
      <div class="organization-container video-view-container" id="videoPage">
        <div class="video-layout">
          <div class="video-content-row">
            <main class="video-main">
              <section class="video-canvas video-canva-view" id="videoCanvaView" aria-label="${window.__('Canvas — producción')}">

                <div class="video-canvas-idle" id="videoCanvasIdle">
                  <div class="video-canvas-idle-content">
                    <p class="video-canvas-idle__eyebrow">Stand by</p>
                    <h3 class="video-canvas-idle__title">${window.__('Listo para producir')}</h3>
                    <p class="video-canvas-idle__hint">${window.__('Describe la secuencia completa abajo. Seedance 2.0 produce el arco entero — apertura, desarrollo y cierre — en una sola pasada.')}</p>
                  </div>
                </div>

                <div class="video-status-area" id="videoStatusArea" style="display: none;">
                  <div class="video-status-card" id="videoStatusCard">
                    <div class="video-status-spinner" id="videoStatusSpinner" style="display: none;"></div>
                    <p class="video-status-text" id="videoStatusText">—</p>
                  </div>
                </div>

                <div class="video-result-area" id="videoResultArea" style="display: none;">
                  <div class="video-result-card">
                    <div class="video-result-card-header">
                      <span class="video-result-output-badge">OUTPUT</span>
                      <h2 class="video-result-title">${window.__('Video generado')}</h2>
                    </div>
                    <div class="video-result-player-wrap">
                      <video id="videoResultPlayer" class="video-result-player" controls playsinline></video>
                    </div>
                    <div class="video-result-actions">
                      <a id="videoResultDownload" class="btn btn-secondary video-download-btn" href="#" download target="_blank" rel="noopener">
                        <i class="aisc-ico aisc-ico--dowload"></i> ${window.__('Descargar')}
                      </a>
                    </div>
                  </div>
                </div>

                <div class="video-error-area" id="videoErrorArea" style="display: none;">
                  <div class="video-error-card">
                    <div class="video-error-icon-wrap"><i class="aisc-ico aisc-ico--alert-warning"></i></div>
                    <p class="video-error-text" id="videoErrorText">—</p>
                  </div>
                </div>

              </section>

              <section class="video-director-console-zone video-prompt-wrap video-main-director" id="seedanceFooterControl" aria-label="${window.__('Director Console Seedance — secuencia narrativa')}">
                <div class="video-prompt-footer-card video-prompt-footer-card-center">
                  <div class="video-prompt-footer-card-inner video-director-console">

                    <input type="file" id="seedanceImageUpload" accept="image/jpeg,image/png,image/jpg,video/mp4,video/quicktime,video/x-msvideo" multiple style="display: none;" aria-hidden="true">

                    <div class="video-director-console-content">
                      <textarea
                        id="seedancePromptInput"
                        class="video-director-brief-input video-director-brief-input-large"
                        placeholder="${window.__('Storyboard: describe la secuencia completa — apertura, desarrollo y cierre. Seedance produce el arco entero en una sola pasada.')}"
                        rows="3"
                        autocomplete="off"
                        aria-label="${window.__('Storyboard narrativo (Seedance lo cocina con OpenAI)')}"
                      ></textarea>
                    </div>
                    <div class="video-director-attachments-row">
                      <div class="video-attachments-list" id="seedanceElementsList" aria-live="polite"></div>
                    </div>

                    <div class="video-director-controls">
                      <button type="button" class="video-director-btn-add" id="seedancePromptAdd" aria-label="${window.__('Añadir referencia visual')}"><i class="aisc-ico aisc-ico--add"></i></button>
                      <button type="button" class="video-director-toggle video-prompt-toggle" id="seedanceGenAudioToggle" title="${window.__('Generar audio')}" aria-pressed="true"><i class="aisc-ico aisc-ico--volume"></i><span>Audio</span></button>
                      <button type="button" class="video-director-toggle video-prompt-toggle" id="seedanceWebSearchToggle" title="${window.__('Búsqueda online')}" aria-pressed="false"><i class="aisc-ico aisc-ico--globe"></i><span>Web</span></button>
                      <div class="video-prompt-aspect-wrap">
                        <select id="seedanceResolution" class="video-director-select" aria-label="${window.__('Resolución')}">
                          <option value="480p">480p</option>
                          <option value="720p" selected>720p</option>
                          <option value="1080p">1080p</option>
                        </select>
                        <i class="aisc-ico video-prompt-aspect-chevron aisc-ico--chevron-down" aria-hidden="true"></i>
                      </div>
                      <div class="video-prompt-aspect-wrap">
                        <select id="seedanceAspectRatio" class="video-director-select" aria-label="${window.__('Relación de aspecto')}">
                          <option value="16:9" selected>16:9</option>
                          <option value="9:16">9:16</option>
                          <option value="1:1">1:1</option>
                          <option value="4:3">4:3</option>
                          <option value="3:4">3:4</option>
                          <option value="21:9">21:9 cinemascope</option>
                          <option value="adaptive">${window.__('Adaptable')}</option>
                        </select>
                        <i class="aisc-ico video-prompt-aspect-chevron aisc-ico--chevron-down" aria-hidden="true"></i>
                      </div>
                      <div class="video-prompt-duration-wrap seedance-duration-wrap">
                        <input type="number" id="seedanceDuration" class="video-director-select seedance-duration-input" min="4" max="15" step="1" value="5" aria-label="${window.__('Duración en segundos')}">
                        <span class="seedance-duration-unit">s</span>
                      </div>
                      <button type="button" class="video-director-btn-generate" id="seedancePromptSend" aria-label="${window.__('Producir la secuencia')}" data-state="production"><i class="aisc-ico aisc-ico--play"></i><span>${window.__('PRODUCIR')}</span></button>
                    </div>

                  </div>
                </div>
              </section>
            </main>

            <aside class="video-sidebar-console" aria-label="${window.__('Sidebar Seedance — secuencias narrativas')}">
              <div class="video-prompt-footer-card video-sidebar-card">
                <div class="video-prompt-footer-card-inner video-sidebar-inner">

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Contexto de producción')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Tipo de campaña conceptual, audiencia y productos que la secuencia debe respetar.')}</p>
                    <div class="video-left-block">
                      <h4 class="video-prompt-panel-title">${window.__('¿De qué trata?')}</h4>
                      <select id="seedanceCampaignSelect" class="video-prompt-db-select video-asset-scope-select" aria-label="${window.__('Concepto de campaña')}" data-conceptual="1">
                        <option value="">${window.__('— Sin definir')}</option>
                        <option value="Brand awareness">${window.__('Brand awareness · presentar la marca')}</option>
                        <option value="Product launch">${window.__('Lanzamiento de producto')}</option>
                        <option value="Lifestyle storytelling">${window.__('Lifestyle · contar una historia')}</option>
                        <option value="Educational">${window.__('Educativo · enseñar o explicar')}</option>
                        <option value="Sale / promo">${window.__('Promoción · oferta o descuento')}</option>
                        <option value="Testimonial">${window.__('Testimonial · clientes reales')}</option>
                        <option value="Reactivation">${window.__('Reactivación · clientes dormidos')}</option>
                        <option value="Seasonal moment">${window.__('Momento estacional · fecha clave')}</option>
                        <option value="Behind the scenes">${window.__('Behind the scenes · cercanía marca')}</option>
                      </select>
                    </div>
                    <div class="video-left-block">
                      <h4 class="video-prompt-panel-title">${window.__('¿A quién le habla?')}</h4>
                      <select id="seedanceAudienceSelect" class="video-prompt-db-select video-asset-scope-select" aria-label="${window.__('Audiencia conceptual')}" data-conceptual="1">
                        <option value="">${window.__('— Sin definir')}</option>
                        <option value="Young professionals 25-35">${window.__('Profesionales jóvenes (25–35)')}</option>
                        <option value="Established professionals 35-50">${window.__('Profesionales establecidos (35–50)')}</option>
                        <option value="Aspirational youth 18-28">${window.__('Aspiracionales jóvenes (18–28)')}</option>
                        <option value="Mass market">${window.__('Mercado masivo')}</option>
                        <option value="Premium / luxury audience">${window.__('Premium · audiencia de lujo')}</option>
                        <option value="Niche enthusiasts">${window.__('Nicho · entusiastas de la categoría')}</option>
                        <option value="Decision makers B2B">${window.__('Decision makers · B2B')}</option>
                        <option value="Existing customers">${window.__('Clientes existentes')}</option>
                        <option value="Parents / families">${window.__('Padres y familias')}</option>
                      </select>
                    </div>
                  </div>

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Frames Clave')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Ancla el inicio y/o final de la secuencia con una imagen. La IA construirá el arco narrativo entre ambas.')}</p>
                    <div class="seedance-frames-grid">
                      <button type="button" class="seedance-frame-slot" data-frame="first" id="seedanceFirstFrameSlot">
                        <i class="aisc-ico aisc-ico--image" aria-hidden="true"></i>
                        <span class="seedance-frame-slot-label">First Frame</span>
                        <span class="seedance-frame-slot-hint">${window.__('Click para subir')}</span>
                      </button>
                      <button type="button" class="seedance-frame-slot" data-frame="last" id="seedanceLastFrameSlot">
                        <i class="aisc-ico aisc-ico--image" aria-hidden="true"></i>
                        <span class="seedance-frame-slot-label">Last Frame</span>
                        <span class="seedance-frame-slot-hint">${window.__('Click para subir')}</span>
                      </button>
                    </div>
                  </div>

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Referencias Multimodales')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Imágenes, videos y audios que la IA usa como inspiración. Mutuamente excluyentes con Frames Clave.')}</p>

                    <div class="seedance-ref-group">
                      <div class="seedance-ref-group-header">
                        <h4 class="video-prompt-panel-title">${window.__('Imágenes')} <span class="seedance-ref-limit" id="seedanceRefImgCount">0 / 9</span></h4>
                        <button type="button" class="seedance-ref-add-btn" id="seedanceAddRefImg"><i class="aisc-ico aisc-ico--add" aria-hidden="true"></i></button>
                      </div>
                      <div class="seedance-ref-list" id="seedanceRefImgList" aria-live="polite"></div>
                    </div>

                    <div class="seedance-ref-group">
                      <div class="seedance-ref-group-header">
                        <h4 class="video-prompt-panel-title">${window.__('Videos')} <span class="seedance-ref-limit" id="seedanceRefVidCount">0 / 3 · ≤15s</span></h4>
                        <button type="button" class="seedance-ref-add-btn" id="seedanceAddRefVid"><i class="aisc-ico aisc-ico--add" aria-hidden="true"></i></button>
                      </div>
                      <div class="seedance-ref-list" id="seedanceRefVidList" aria-live="polite"></div>
                    </div>

                    <div class="seedance-ref-group">
                      <div class="seedance-ref-group-header">
                        <h4 class="video-prompt-panel-title">${window.__('Audios')} <span class="seedance-ref-limit" id="seedanceRefAudCount">0 / 3 · ≤15s</span></h4>
                        <button type="button" class="seedance-ref-add-btn" id="seedanceAddRefAud"><i class="aisc-ico aisc-ico--add" aria-hidden="true"></i></button>
                      </div>
                      <div class="seedance-ref-list" id="seedanceRefAudList" aria-live="polite"></div>
                    </div>
                  </div>

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Audio & Atmósfera')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Seedance puede generar el audio de la secuencia. Activar aumenta el costo de créditos.')}</p>
                    <label class="seedance-toggle-row">
                      <input type="checkbox" id="seedanceGenerateAudio">
                      <span class="seedance-toggle-track" aria-hidden="true"><span class="seedance-toggle-thumb"></span></span>
                      <span class="seedance-toggle-label">${window.__('Generar audio')}</span>
                    </label>
                    <div class="video-left-block">
                      <h4 class="video-prompt-panel-title">${window.__('Tipo de sonido')}</h4>
                      <div class="seedance-audio-tiles">
                        <button type="button" class="seedance-audio-tile" data-audio-type="ambient"><i class="aisc-ico aisc-ico--wind" aria-hidden="true"></i><span>${window.__('Diegético')}</span></button>
                        <button type="button" class="seedance-audio-tile" data-audio-type="music"><i class="aisc-ico aisc-ico--music" aria-hidden="true"></i><span>${window.__('Música')}</span></button>
                        <button type="button" class="seedance-audio-tile" data-audio-type="voice"><i class="aisc-ico aisc-ico--microphone" aria-hidden="true"></i><span>${window.__('Voz')}</span></button>
                        <button type="button" class="seedance-audio-tile" data-audio-type="silence"><i class="aisc-ico aisc-ico--volume" aria-hidden="true"></i><span>${window.__('Silencio')}</span></button>
                      </div>
                    </div>
                  </div>

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Pacing & Narrativa')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Cómo fluye la historia: ritmo, evolución emocional y estilo de transición entre tomas.')}</p>
                    <div class="video-cine-row"><label class="video-cine-label">${window.__('Ritmo global')}</label>
                      <select id="seedancePacing" class="video-cine-select">
                        <option value="">${window.__('— Auto')}</option>
                        <option value="Slow contemplative">${window.__('Lento contemplativo')}</option>
                        <option value="Balanced">${window.__('Equilibrado')}</option>
                        <option value="Fast dynamic">${window.__('Rápido dinámico')}</option>
                      </select>
                    </div>
                    <div class="video-cine-row"><label class="video-cine-label">${window.__('Arco emocional')}</label>
                      <select id="seedanceArc" class="video-cine-select">
                        <option value="">${window.__('— Auto')}</option>
                        <option value="Continuous">${window.__('Continuo')}</option>
                        <option value="Crescendo">Crescendo</option>
                        <option value="Decrescendo">Decrescendo</option>
                        <option value="Climax at end">${window.__('Climax al final')}</option>
                      </select>
                    </div>
                    <div class="video-cine-row"><label class="video-cine-label">${window.__('Transiciones')}</label>
                      <select id="seedanceTransitions" class="video-cine-select">
                        <option value="">${window.__('— Auto')}</option>
                        <option value="Hard cuts">${window.__('Cortes secos')}</option>
                        <option value="Soft fades">${window.__('Fundidos suaves')}</option>
                        <option value="Match cuts">Match cuts</option>
                        <option value="Whip pans">Whip pans</option>
                        <option value="Morph">Morph / dissolve</option>
                      </select>
                    </div>
                  </div>

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Estilo Visual')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('Mood narrativo y nivel de realismo de la secuencia completa.')}</p>
                    <div class="video-cine-row"><label class="video-cine-label">${window.__('Mood narrativo')}</label>
                      <select id="seedanceMood" class="video-cine-select">
                        <option value="">${window.__('— Auto')}</option>
                        <option value="Cinematic">${window.__('Cinematográfico')}</option>
                        <option value="Documentary">${window.__('Documental')}</option>
                        <option value="Editorial">Editorial</option>
                        <option value="Music video">Music video</option>
                        <option value="Dreamlike">${window.__('Sueño / Onírico')}</option>
                        <option value="Commercial bright">${window.__('Comercial luminoso')}</option>
                      </select>
                    </div>
                    <div class="video-cine-row"><label class="video-cine-label">${window.__('Realismo')}</label>
                      <select id="seedanceRealism" class="video-cine-select">
                        <option value="">${window.__('— Auto')}</option>
                        <option value="Realistic">${window.__('Realista')}</option>
                        <option value="Stylized">${window.__('Estilizado')}</option>
                        <option value="Hyperreal">${window.__('Hiperreal')}</option>
                        <option value="Surreal">Surreal</option>
                        <option value="3D animated">${window.__('3D animado')}</option>
                      </select>
                    </div>
                  </div>

                </div>
              </div>
              <button type="button" class="video-sidebar-help" id="seedanceSidebarHelpBtn" aria-label="${window.__('Ayuda Seedance')}" title="${window.__('Ayuda Seedance')}">?</button>
              <div class="video-sidebar-help-popover" id="seedanceSidebarHelpPopover" role="dialog" aria-label="${window.__('Ayuda Seedance')}">
                <h4>${window.__('Seedance 2.0 — secuencias narrativas')}</h4>
                <p><strong>${window.__('Frames Clave')}</strong>${window.__(': una imagen de inicio + una de cierre. La IA construye el arco entre ambas.')}</p>
                <p><strong>${window.__('Referencias Multimodales')}</strong>${window.__(': imágenes para estilo, videos para movimiento, audios para vibe. Hasta 9/3/3 respectivamente.')}</p>
                <p><strong>Audio</strong>${window.__(': Seedance genera el audio de la secuencia. Activarlo cuesta créditos extra pero devuelve un video listo para publicar.')}</p>
              </div>
            </aside>
          </div>

        </div>
      </div>
    `;
  }

  async init() {
    this.idleArea = this.container.querySelector('#videoCanvasIdle');
    this.sendBtn = this.container.querySelector('#seedancePromptSend');
    this.promptInput = this.container.querySelector('#seedancePromptInput');
    this.aspectSelect = this.container.querySelector('#seedanceAspectRatio');

    // Botón PRODUCIR. No dispara nada mientras el endpoint de creación no
    // exista: startGeneration() explica qué falta, en el canvas.
    if (this.sendBtn && this.sendBtn.dataset.boundSeedanceSend !== '1') {
      this.sendBtn.dataset.boundSeedanceSend = '1';
      this.sendBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.startGeneration();
      });
    }
    if (this.promptInput) {
      this.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.startGeneration();
        }
      });
      this.promptInput.addEventListener('input', () => this.scheduleResizeDirectorBriefInput());
      this.promptInput.addEventListener('paste', () => this.scheduleResizeDirectorBriefInput());
    }

    // Seedance: toggle Audio + Web search (solo UI state, sin wiring backend aún)
    ['seedanceGenAudioToggle', 'seedanceWebSearchToggle'].forEach((id) => {
      const btn = this.container.querySelector('#' + id);
      if (!btn || btn.dataset.boundToggle === '1') return;
      btn.dataset.boundToggle = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const pressed = btn.getAttribute('aria-pressed') === 'true';
        btn.setAttribute('aria-pressed', !pressed);
        btn.classList.toggle('active', !pressed);
      });
    });
    // Seedance: botón de ayuda del sidebar
    const seedanceHelpBtn = this.container.querySelector('#seedanceSidebarHelpBtn');
    const seedanceHelpPopover = this.container.querySelector('#seedanceSidebarHelpPopover');
    if (seedanceHelpBtn && seedanceHelpPopover && seedanceHelpBtn.dataset.boundHelp !== '1') {
      seedanceHelpBtn.dataset.boundHelp = '1';
      seedanceHelpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        seedanceHelpPopover.classList.toggle('is-open');
      });
      document.addEventListener('click', (e) => {
        if (!seedanceHelpPopover.classList.contains('is-open')) return;
        if (seedanceHelpPopover.contains(e.target) || seedanceHelpBtn.contains(e.target)) return;
        seedanceHelpPopover.classList.remove('is-open');
      });
    }
    // Seedance: audio type tiles (toggle exclusive)
    this.container.querySelectorAll('.seedance-audio-tile[data-audio-type]').forEach((tile) => {
      if (tile.dataset.boundAudio === '1') return;
      tile.dataset.boundAudio = '1';
      tile.addEventListener('click', (e) => {
        e.preventDefault();
        const wasActive = tile.classList.contains('is-active');
        this.container.querySelectorAll('.seedance-audio-tile[data-audio-type]').forEach((t) => t.classList.remove('is-active'));
        if (!wasActive) tile.classList.add('is-active');
      });
    });

    this.statusArea = this.container.querySelector('#videoStatusArea');
    this.statusText = this.container.querySelector('#videoStatusText');
    this.statusSpinner = this.container.querySelector('#videoStatusSpinner');
    this.resultArea = this.container.querySelector('#videoResultArea');
    this.resultPlayer = this.container.querySelector('#videoResultPlayer');
    this.resultDownload = this.container.querySelector('#videoResultDownload');
    this.errorArea = this.container.querySelector('#videoErrorArea');
    this.errorText = this.container.querySelector('#videoErrorText');

    // Contexto de marca: alimenta buildBrandContextForAPI() y el linaje de
    // system_ai_outputs. Los selects de campaña/audiencia son conceptuales
    // (opciones fijas en el HTML), no vienen de la BD.
    await this.loadBrandData();
    const campaignSelect = this.container.querySelector('#seedanceCampaignSelect');
    const audienceSelect = this.container.querySelector('#seedanceAudienceSelect');
    if (campaignSelect) {
      campaignSelect.addEventListener('change', () => {
        this.selectedCampaignId = campaignSelect.value || '';
      });
    }
    if (audienceSelect) {
      audienceSelect.addEventListener('change', () => {
        this.selectedAudienceId = audienceSelect.value || '';
      });
    }

    this.scheduleResizeDirectorBriefInput();
    this._resizeDirectorBriefOnWin = () => this.scheduleResizeDirectorBriefInput();
    window.addEventListener('resize', this._resizeDirectorBriefOnWin);
  }

  /** Altura del textarea según contenido (vacío ≈ una línea; crece hasta un máximo). */
  scheduleResizeDirectorBriefInput() {
    if (this._resizeDirectorBriefRaf) {
      cancelAnimationFrame(this._resizeDirectorBriefRaf);
    }
    this._resizeDirectorBriefRaf = requestAnimationFrame(() => {
      this._resizeDirectorBriefRaf = null;
      this.resizeDirectorBriefInput();
    });
  }

  resizeDirectorBriefInput() {
    const ta = this.promptInput;
    if (!ta || ta.tagName !== 'TEXTAREA') return;
    const maxPx = Math.min(
      VideoView.DIRECTOR_BRIEF_MAX_HEIGHT_PX,
      Math.floor(window.innerHeight * VideoView.DIRECTOR_BRIEF_MAX_VIEWPORT_FRAC)
    );
    // El storyboard de Seedance nace de tres renglones (rows="3"): si le
    // aplicamos el mínimo de una línea, el autoresize lo colapsa en cuanto
    // está vacío y el campo deja de pedir una secuencia.
    const minPx = ta.classList.contains('video-director-brief-input-large') ? 96 : 44;
    ta.style.height = '0px';
    const sh = ta.scrollHeight;
    const next = Math.min(Math.max(sh, minPx), maxPx);
    ta.style.height = `${next}px`;
    ta.style.overflowY = sh > maxPx ? 'auto' : 'hidden';
  }

  async getBrandContainerId() {
    if (!this.supabase) return null;
    try {
      // Regla central de aislamiento: marca dentro de la org activa, sin fallback
      // cross-org a user_id (ver js/org-url.js resolveActiveBrandContainerId).
      const uid = this.userId || (await this.supabase.auth.getUser())?.data?.user?.id || null;
      return await window.resolveActiveBrandContainerId(this.supabase, this.organizationId, uid);
    } catch (e) {
      console.error('VideoView getBrandContainerId:', e);
      return null;
    }
  }

  async loadBrandData() {
    this.brandContainerId = await this.getBrandContainerId();
    if (!this.supabase || !this.brandContainerId) return;
    try {
      const bcId = this.brandContainerId;
      // Modelo nuevo: las columnas "brand-level" viven en brand_containers
      // (nicho_core, arquetipo, verbal_dna, etc.) y brand_profiles se filtra
      // por brand_container_id en vez de brand_id.
      const { data: brandRow } = await this.supabase
        .from('brand_containers')
        .select(
          'id, nicho_core, sub_nichos, arquetipo, propuesta_valor, mision_vision, verbal_dna, visual_dna, palabras_clave, palabras_prohibidas, objetivos_estrategicos'
        )
        .eq('id', bcId)
        .maybeSingle();
      this.dbData.brand = brandRow || null;
      this.dbData.brandProfiles = [];
      if (brandRow?.id) {
        const { data: profiles } = await this.supabase.from('brand_profiles').select('section, content').eq('brand_container_id', brandRow.id);
        this.dbData.brandProfiles = profiles || [];
      }
      // audiences: tabla legacy reemplazada por audience_personas (BUG-005).
      // campaigns: contexto_temporal/objetivos_estrategicos/tono_modificador
      // viven en campaign_briefs (BUG-006); resolvemos vía embed PostgREST
      // usando la FK campaigns.brief_id → campaign_briefs.id.
      //
      // Scope por tabla (modelo org vs brand_container):
      //  - products/audience_personas/campaigns: tienen brand_container_id,
      //    filtran por sub-marca.
      //  - services/brand_entities: org-scope (compartidos entre todas las
      //    sub-marcas de la org), filtran por organization_id. Filtrar por
      //    brand_container_id en estas tablas dispara 400 (columna inexistente).
      const orgId = this.organizationId || window.currentOrgId;
      const [productsRes, servicesRes, entitiesRes, audiencesRes, campaignsRes] = await Promise.all([
        this.supabase.from('products').select('id, entity_id, nombre_producto, brand_container_id').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50),
        orgId
          ? this.supabase.from('services').select('id, entity_id, nombre_servicio').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(50)
          : Promise.resolve({ data: [] }),
        orgId
          ? this.supabase.from('brand_entities').select('id, name, entity_type, description').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(50)
          : Promise.resolve({ data: [] }),
        this.supabase.from('audience_personas').select('id, name, description, estilo_lenguaje').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50),
        this.supabase.from('campaigns').select('id, nombre_campana, descripcion_interna, persona_id, brief_id, campaign_briefs:brief_id(contexto_temporal, objetivos_estrategicos, tono_modificador)').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50)
      ]);
      this.dbData.products = productsRes.data || [];
      this.dbData.services = servicesRes.data || [];
      this.dbData.entities = entitiesRes.data || [];
      this.dbData.audiences = audiencesRes.data || [];
      // Aplanar campos del brief al row de campaña para que el resto del
      // código siga accediendo como c.contexto_temporal, c.tono_modificador, etc.
      this.dbData.campaigns = (campaignsRes.data || []).map((c) => {
        const brief = c.campaign_briefs || {};
        return {
          id: c.id,
          nombre_campana: c.nombre_campana,
          descripcion_interna: c.descripcion_interna,
          persona_id: c.persona_id,
          brief_id: c.brief_id,
          contexto_temporal: brief.contexto_temporal || null,
          objetivos_estrategicos: brief.objetivos_estrategicos || null,
          tono_modificador: brief.tono_modificador || null,
        };
      });
      const productIds = this.dbData.products.map((p) => p.id).filter(Boolean);
      if (productIds.length > 0) {
        const { data: imgs } = await this.supabase.from('product_images').select('product_id, image_url, image_type, image_order').in('product_id', productIds).order('image_order', { ascending: true });
        const byProduct = {};
        (imgs || []).forEach((img) => {
          if (!byProduct[img.product_id]) byProduct[img.product_id] = [];
          byProduct[img.product_id].push(img.image_url);
        });
        this.dbData.products.forEach((p) => {
          p.image_urls = (byProduct[p.id] || []).slice(0, 4);
        });
      }
      this.renderCampaignDropdown();
      this.renderAudienceDropdown();
    } catch (e) {
      console.error('VideoView loadBrandData:', e);
    }
  }

  renderCampaignDropdown() {
    // Conceptual: opciones hardcoded en el HTML, NO se popula desde BD.
    // Las campañas en /video son conceptos narrativos (Brand awareness, Product
    // launch, etc.) no campañas reales del CRM. El backend recibe el string
    // conceptual y OpenAI lo usa como contexto del prompt.
    const select = this.container.querySelector('#seedanceCampaignSelect');
    if (!select) return;
    if (this.selectedCampaignId && Array.from(select.options).some((o) => o.value === this.selectedCampaignId)) {
      select.value = this.selectedCampaignId;
    }
  }

  renderAudienceDropdown() {
    // Conceptual: opciones hardcoded en HTML, NO BD. Misma lógica que campañas.
    const select = this.container.querySelector('#seedanceAudienceSelect');
    if (!select) return;
    if (this.selectedAudienceId && Array.from(select.options).some((o) => o.value === this.selectedAudienceId)) {
      select.value = this.selectedAudienceId;
    }
  }

  hideAllFeedback() {
    if (this.idleArea) this.idleArea.style.display = 'flex';
    if (this.statusArea) this.statusArea.style.display = 'none';
    if (this.resultArea) this.resultArea.style.display = 'none';
    if (this.errorArea) this.errorArea.style.display = 'none';
  }

  showStatus(message, showSpinner = true) {
    this.hideAllFeedback();
    if (this.idleArea) this.idleArea.style.display = 'none';
    if (this.statusArea) this.statusArea.style.display = 'block';
    if (this.statusText) this.statusText.textContent = message;
    if (this.statusSpinner) this.statusSpinner.style.display = showSpinner ? 'block' : 'none';
  }

  showResult(url) {
    this.hideAllFeedback();
    if (this.idleArea) this.idleArea.style.display = 'none';
    if (this.resultArea) this.resultArea.style.display = 'block';
    if (this.resultPlayer) {
      this.resultPlayer.src = url;
      this.resultPlayer.load();
    }
    if (this.resultDownload) {
      this.resultDownload.href = url;
      this.resultDownload.download = '';
    }
  }

  /**
   * Persiste el video de KIE en R2 (media.aismartcontent.io) via kie-output-persist:
   * el worker de ingesta lo descarga server-side — el video ya no pasa por el
   * browser ni por Supabase Storage. Devuelve URLs completas (los lectores hacen
   * pass-through cuando storage_path empieza con http).
   * @param {string} kieVideoUrl - URL del video devuelta por KIE (resultUrls[0])
   * @param {string} taskId - ID de la tarea KIE (para nombre de archivo)
   * @returns {{ publicUrl: string, storagePath: string } | null}
   */
  async downloadAndUploadKieVideo(kieVideoUrl, taskId) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session?.access_token) return null;

    this.showStatus(window.__('Guardando en tu cuenta…'), true);
    try {
      const res = await fetch('/.netlify/functions/kie-output-persist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ kie_url: kieVideoUrl, task_id: taskId, kind: 'video' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || window.__('Descarga fallida: {status}', { status: res.status }));
      }
      return { publicUrl: data.public_url || null, storagePath: data.storage_path };
    } catch (err) {
      console.error('VideoView downloadAndUploadKieVideo:', err);
      throw err;
    }
  }

  showError(message) {
    this.hideAllFeedback();
    if (this.idleArea) this.idleArea.style.display = 'none';
    if (this.errorArea) this.errorArea.style.display = 'block';
    if (this.errorText) this.errorText.textContent = message;
  }

  buildBrandContextForAPI() {
    const d = this.dbData || {};
    const brand = d.brand || {};
    const arr = (v) => (Array.isArray(v) ? v : []);
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    return {
      brand_voice: {
        nicho_core: brand.nicho_core || '',
        sub_nichos: arr(brand.sub_nichos),
        arquetipo: brand.arquetipo || null,
        propuesta_valor: brand.propuesta_valor || null,
        mision_vision: brand.mision_vision || null,
        verbal_dna: obj(brand.verbal_dna),
        visual_dna: obj(brand.visual_dna),
        palabras_clave: arr(brand.palabras_clave),
        palabras_prohibidas: arr(brand.palabras_prohibidas),
        objetivos_estrategicos: arr(brand.objetivos_estrategicos)
      },
      brand_profiles: (d.brandProfiles || []).map((p) => ({ section: p.section, content: p.content })),
      entities: (d.entities || []).map((e) => ({ name: e.name, entity_type: e.entity_type, description: e.description })),
      products: (d.products || []).map((p) => ({ name: p.nombre_producto })),
      audiences: (d.audiences || []).map((a) => ({ name: a.name, description: a.description, estilo_lenguaje: a.estilo_lenguaje })),
      campaigns: (d.campaigns || []).map((c) => ({ name: c.nombre_campana, description: c.descripcion_interna, audience_id: c.persona_id, contexto_temporal: c.contexto_temporal, objetivos_estrategicos: c.objetivos_estrategicos, tono_modificador: c.tono_modificador })),
      selected_campaign: this.selectedCampaignId ? (d.campaigns || []).find((c) => String(c.id) === String(this.selectedCampaignId)) || null : null,
      selected_audience: this.selectedAudienceId ? (d.audiences || []).find((a) => String(a.id) === String(this.selectedAudienceId)) || null : null
    };
  }

  async saveSystemAIOutput(record) {
    if (!this.supabase) return null;
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user?.id) return null;
      const brandContainerId = this.brandContainerId || await this.getBrandContainerId();
      if (!brandContainerId) return null;
      // Schema unificado runs_outputs <-> system_ai_outputs (2026-05-22).
      // Pueblan automaticamente los campos comunes desde el state del view;
      // el caller solo pasa lo especifico (provider, output_type, prompt,
      // metadata, etc.).
      const briefId = this._resolveSelectedBriefId();
      const entityId = this._resolveSelectedEntityId();
      const row = {
        brand_container_id: brandContainerId,
        organization_id: this.organizationId || null,
        user_id: user.id,
        campaign_id: this.selectedCampaignId || null,
        persona_id: this.selectedAudienceId || null,
        brief_id: briefId,
        entity_id: entityId,
        ...record,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await this.supabase.from('system_ai_outputs').insert(row).select('id').single();
      if (error) {
        console.warn('VideoView saveSystemAIOutput:', error.message);
        return null;
      }
      return data?.id || null;
    } catch (e) {
      console.warn('VideoView saveSystemAIOutput:', e);
      return null;
    }
  }

  /**
   * Resuelve brief_id desde la campana seleccionada (campaigns.brief_id ya
   * viene aplanado en dbData.campaigns). Devuelve null si no hay campana
   * seleccionada o la campana no tiene brief.
   */
  _resolveSelectedBriefId() {
    if (!this.selectedCampaignId) return null;
    const c = (this.dbData?.campaigns || []).find((x) => String(x.id) === String(this.selectedCampaignId));
    return c?.brief_id || null;
  }

  /**
   * Resuelve entity_id para dar linaje canonico al output.
   *
   * DEVUELVE SIEMPRE null hoy: el selector de assets (Asset Stack) era del
   * panel de Kling y salio con el. El sidebar de Seedance todavia no elige
   * producto/servicio, asi que no hay de donde sacar la FK a brand_entities.
   * Cuando el sidebar de Seedance tenga selector de asset, leerlo aqui
   * (products.entity_id / services.entity_id) en vez de devolver null.
   */
  _resolveSelectedEntityId() {
    return null;
  }

  async updateSystemAIOutput(id, updates) {
    if (!this.supabase || !id) return;
    try {
      await this.supabase.from('system_ai_outputs').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    } catch (e) {
      console.warn('VideoView updateSystemAIOutput:', e);
    }
  }

  /**
   * Lee los controles del Director Console y del sidebar de Seedance y los
   * deja en el shape que espera la funcion de creacion.
   *
   * OJO al cablear: esto es lo que la UI SABE hoy, no el contrato final de
   * KIE. Los frames clave (#seedanceFirstFrameSlot / #seedanceLastFrameSlot)
   * y las referencias multimodales (imagenes / videos / audios del sidebar)
   * son maqueta — no tienen binding ni subida a Storage — por eso no salen
   * aqui. Anadirlos al mismo tiempo que su wiring, no antes: un campo que
   * KIE no reconoce se ignora en silencio.
   */
  buildSeedancePayload() {
    const val = (sel, fallback) => {
      const el = this.container.querySelector(sel);
      return el && el.value ? String(el.value) : fallback;
    };
    const pressed = (sel) => {
      const el = this.container.querySelector(sel);
      return el ? el.getAttribute('aria-pressed') === 'true' : false;
    };
    const checked = (sel) => {
      const el = this.container.querySelector(sel);
      return !!(el && el.checked);
    };
    const audioTile = this.container.querySelector('.seedance-audio-tile.is-active');

    return {
      action: 'createTask',
      prompt: (this.promptInput && this.promptInput.value) ? this.promptInput.value.trim() : '',
      duration: val('#seedanceDuration', '5'),
      resolution: val('#seedanceResolution', '720p'),
      aspect_ratio: val('#seedanceAspectRatio', '16:9'),
      generate_audio: checked('#seedanceGenerateAudio') || pressed('#seedanceGenAudioToggle'),
      audio_type: audioTile ? audioTile.getAttribute('data-audio-type') : null,
      web_search: pressed('#seedanceWebSearchToggle'),
      direction: {
        pacing: val('#seedancePacing', ''),
        arc: val('#seedanceArc', ''),
        transitions: val('#seedanceTransitions', ''),
        mood: val('#seedanceMood', ''),
        realism: val('#seedanceRealism', '')
      },
      campaign: this.selectedCampaignId || null,
      audience: this.selectedAudienceId || null,
      brand_context: this.buildBrandContextForAPI(),
      organization_id: this.organizationId || null,
      openai_input_tokens: this._cinePromptTokens?.input || 0,
      openai_output_tokens: this._cinePromptTokens?.output || 0,
      openai_model: this._cinePromptTokens?.model || 'gpt-4o-mini'
    };
  }

  /**
   * Dispara la produccion. Mientras SEEDANCE_BACKEND_READY sea false no hay
   * a quien disparar: se lo dice al usuario en el canvas en vez de pegarle a
   * un endpoint inexistente (un 404 devolveria HTML y el error seria opaco).
   *
   * Al desplegar functions/seedance-video-create.js queda por escribir solo
   * el POST: la respuesta trae taskId y de ahi en adelante el camino ya
   * existe — saveSystemAIOutput() y pollTask(taskId), que resuelven guardado
   * en R2, cobro de creditos y render del resultado.
   */
  async startGeneration() {
    const payload = this.buildSeedancePayload();

    if (!payload.prompt) {
      this.showError(window.__('Escribe primero el storyboard: qué pasa en la apertura, en el desarrollo y en el cierre.'));
      return;
    }
    if (!this.organizationId) {
      this.showError(window.__('Selecciona una organización para producir videos.'));
      return;
    }
    if (!VideoView.SEEDANCE_BACKEND_READY) {
      this.showError(window.__('Seedance 2.0 todavía no está conectado: falta desplegar la función de creación de tarea. El resto del camino (guardado, créditos y resultado) ya está listo y se enciende con ese despliegue.'));
      return;
    }

    this.showError(window.__('Seedance 2.0 marcado como listo pero sin POST de creación implementado. Completa startGeneration() antes de activar el flag.'));
  }

  stopPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    if (this._pollVisibilityHandler) {
      document.removeEventListener('visibilitychange', this._pollVisibilityHandler);
      this._pollVisibilityHandler = null;
    }
  }

  async pollTask(taskId) {
    const statusUrl = `${VideoView.KIE_TASK_STATUS_API}?taskId=${encodeURIComponent(taskId)}`;
    const pollStartedAt = Date.now();
    console.log('[Video] Polling estado → GET', statusUrl, '(cada', VideoView.POLL_INTERVAL_MS / 1000, 's, máx', VideoView.POLL_MAX_DURATION_MS / 60000, 'min)');

    const poll = async () => {
      if (Date.now() - pollStartedAt > VideoView.POLL_MAX_DURATION_MS) {
        this.stopPolling();
        this.showError(window.__('La generación superó el tiempo máximo de espera (12 min). Comprueba el estado en KIE o reintenta con un prompt más corto.'));
        if (this._lastKieOutputId) {
          await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'Timeout de polling (12 min)' });
          this._lastKieOutputId = null;
        }
        return;
      }
      // Pausamos el fetch a KIE cuando la pestaña está oculta. El timeout se sigue
      // midiendo contra wall-clock (pollStartedAt), así que no se alarga la espera total.
      // Ahorra ~20 llamadas/min a KIE por cada tab en background generando video.
      if (document.hidden) return;
      try {
        const res = await fetch(statusUrl);
        let data = {};
        try {
          data = await res.json();
        } catch (parseErr) {
          console.error('[Video] GET', statusUrl, ': respuesta no es JSON. Status:', res.status, '→ ¿función desplegada?', parseErr);
          this.stopPolling();
          this.showError(window.__('El servicio de video no respondió correctamente (estado {status}). Intenta de nuevo en unos minutos.', { status: res.status }));
          if (this._lastKieOutputId) {
            await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'Status ' + res.status });
            this._lastKieOutputId = null;
          }
          return;
        }

        if (!res.ok) {
          console.warn('[Video] GET', statusUrl, 'error:', res.status, data);
          this.stopPolling();
          this.showError(data.error || window.__('Error al consultar el estado'));
          if (this._lastKieOutputId) {
            await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: data.error || 'Error al consultar el estado' });
            this._lastKieOutputId = null;
          }
          return;
        }

        const state = data.data?.state;
        console.log('[Video] GET estado →', res.status, 'state:', state, 'data.data:', data.data);
        if (state === 'success') {
          this.stopPolling();
          let resultJson = data.data?.resultJson;
          if (typeof resultJson === 'string') {
            try {
              resultJson = JSON.parse(resultJson);
            } catch (_) {}
          }
          const urls = resultJson?.resultUrls;
          const kieUrl = Array.isArray(urls) && urls.length > 0 ? urls[0] : null;
          if (kieUrl) {
            try {
              const uploaded = await this.downloadAndUploadKieVideo(kieUrl, taskId);
              if (uploaded?.publicUrl) {
                this.showResult(uploaded.publicUrl);

                // Cobro dinamico: kie-task-finalize lee creditsConsumed real
                // de KIE + suma OpenAI tokens del cine-prompt + 5 cred markup.
                // Reemplaza el cobro fijo previo de 25 cred (deduct_credits_for_video).
                let finalizeResult = null;
                try {
                  const { data: { session } } = await this.supabase.auth.getSession();
                  const accessToken = session?.access_token;
                  if (accessToken && this.organizationId) {
                    const finalizeRes = await fetch('/.netlify/functions/kie-task-finalize', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                      body: JSON.stringify({
                        task_id: taskId,
                        kind: 'video_generated',
                        organization_id: this.organizationId,
                        source_output_id: this._lastKieOutputId || null,
                        openai_input_tokens: this._cinePromptTokens?.input || 0,
                        openai_output_tokens: this._cinePromptTokens?.output || 0,
                        openai_model: this._cinePromptTokens?.model || 'gpt-4o-mini'
                      })
                    });
                    finalizeResult = await finalizeRes.json().catch(() => null);
                    if (!finalizeRes.ok) {
                      console.warn('[Video] finalize fallo, video guardado sin cobro:', finalizeResult);
                    } else if (window.appNavigation && typeof window.appNavigation.loadCreditsFromDb === 'function') {
                      window.appNavigation.loadCreditsFromDb(this.organizationId);
                    }
                  }
                } catch (e) {
                  console.warn('[Video] finalize exception:', e);
                }

                if (this._lastKieOutputId) {
                  // Merge metadata: preserva kind y campos del insert original.
                  await this.updateSystemAIOutput(this._lastKieOutputId, {
                    status: 'completed',
                    storage_path: uploaded.storagePath,
                    metadata: {
                      kind: 'video_generated',
                      resultUrls: urls,
                      video_url: uploaded.publicUrl,
                      kie_source_url: kieUrl,
                      credits_charged: finalizeResult?.credits_charged ?? null,
                      cost_breakdown: finalizeResult?.cost_breakdown ?? null
                    },
                    error_message: null
                  });
                  this._lastKieOutputId = null;
                }
              } else {
                this.showError(window.__('No se pudo guardar el video en tu cuenta'));
                if (this._lastKieOutputId) {
                  await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'No se pudo guardar el video en tu cuenta' });
                  this._lastKieOutputId = null;
                }
              }
            } catch (err) {
              this.showError(err.message || window.__('Error al descargar o guardar el video'));
              if (this._lastKieOutputId) {
                await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: err.message || 'Error al descargar o guardar el video' });
                this._lastKieOutputId = null;
              }
            }
          } else {
            this.showError(window.__('No se encontró URL del video en la respuesta'));
            if (this._lastKieOutputId) {
              await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'No se encontró URL del video en la respuesta' });
              this._lastKieOutputId = null;
            }
          }
          return;
        }
        if (state === 'fail') {
          this.stopPolling();
          const rawMsg = data.data?.failMsg || data.data?.failCode || window.__('La generación falló');
          const is524 = String(data.data?.failCode || '') === '524' || /timeout/i.test(rawMsg);
          const msg = is524
            ? window.__('La generación tardó demasiado en KIE (error 524). Prueba: modo Estándar, duración 5s, una sola imagen de referencia, o acorta el prompt.')
            : rawMsg;
          this.showError(msg);
          if (this._lastKieOutputId) {
            await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: msg });
            this._lastKieOutputId = null;
          }
          return;
        }

        this.showStatus(window.__('Generando video (Seedance 2.0). Esto puede tardar unos minutos…'), true);
      } catch (err) {
        this.stopPolling();
        this.showError(err.message || window.__('Error al consultar el estado'));
        if (this._lastKieOutputId) {
          await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: err.message || 'Error al consultar el estado' });
          this._lastKieOutputId = null;
        }
      }
    };

    await poll();
    this._pollInterval = setInterval(poll, VideoView.POLL_INTERVAL_MS);
    // Al volver a la pestaña, un poll inmediato evita esperar 3s al próximo tick.
    this._pollVisibilityHandler = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', this._pollVisibilityHandler);
  }

  onLeave() {
    this.stopPolling();
    if (this._resizeDirectorBriefOnWin) {
      window.removeEventListener('resize', this._resizeDirectorBriefOnWin);
      this._resizeDirectorBriefOnWin = null;
    }
  }

  destroy() {
    this.stopPolling();
    if (this._resizeDirectorBriefOnWin) {
      window.removeEventListener('resize', this._resizeDirectorBriefOnWin);
      this._resizeDirectorBriefOnWin = null;
    }
  }
}

window.VideoView = VideoView;
