/**
 * InsightView – Panel de inteligencia de marca.
 * Sub-páginas: My Brands · Competence · Tendencies · Strategy
 */
class InsightView extends BaseView {
  constructor() {
    super();
    this._activeTab = 'my-brands';
  }

  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
  }

  async render() {
    await super.render();
    this.updateHeaderContext('Insight', null, window.currentOrgName || '');
    const container = document.getElementById('app-container');
    if (!container) return;
    container.innerHTML = this._buildShell();
    this._setupTabs();
    this._renderTab(this._activeTab);
  }

  renderHTML() { return this._buildShell(); }

  // ── Shell ──────────────────────────────────────────────────────────────────

  _buildShell() {
    const tabs = [
      { id: 'my-brands',  icon: 'fa-layer-group', label: 'My Brands'  },
      { id: 'competence', icon: 'fa-chess',        label: 'Competence' },
      { id: 'tendencies', icon: 'fa-fire',         label: 'Tendencies' },
      { id: 'strategy',   icon: 'fa-route',        label: 'Strategy'   },
    ];
    return `
      <div class="insight-page page-content" id="insightPage">
        <nav class="insight-subnav" id="insightSubnav">
          ${tabs.map(t => `
            <button class="insight-subnav-btn${this._activeTab === t.id ? ' active' : ''}" data-tab="${t.id}">
              <i class="fas ${t.icon}"></i><span>${t.label}</span>
            </button>`).join('')}
        </nav>
        <div class="insight-tab-body" id="insightTabBody"></div>
      </div>`;
  }

  _setupTabs() {
    const nav = document.getElementById('insightSubnav');
    if (!nav) return;
    nav.addEventListener('click', e => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      this._activeTab = btn.dataset.tab;
      nav.querySelectorAll('.insight-subnav-btn')
        .forEach(b => b.classList.toggle('active', b.dataset.tab === this._activeTab));
      this._renderTab(this._activeTab);
    });
  }

  _renderTab(tabId) {
    const body = document.getElementById('insightTabBody');
    if (!body) return;
    if (tabId === 'my-brands') {
      body.innerHTML = this._loadingHTML();
      this._loadMyBrands(body);
      return;
    }
    const map = {
      competence: () => this._pageComingSoon('Competence', 'fa-chess',  'Analiza a tu competencia: sus publicaciones, métricas y posicionamiento en redes sociales.'),
      tendencies: () => this._pageComingSoon('Tendencies', 'fa-fire',   'Descubre tendencias de contenido, hashtags y temas relevantes para tu industria en tiempo real.'),
      strategy:   () => this._pageComingSoon('Strategy',  'fa-route',   'Obtén recomendaciones estratégicas basadas en el rendimiento de tus campañas y el mercado.'),
    };
    body.innerHTML = (map[tabId] || (() => ''))();
  }

  // ── My Brands ──────────────────────────────────────────────────────────────

  async _loadMyBrands(body) {
    try {
      const supabase = await this.getSupabaseClient();
      if (!supabase) throw new Error('Sin conexión a base de datos.');

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) throw new Error('Sin sesión activa.');

      const userId = session.user.id;
      const token  = session.access_token;

      const { data: containers } = await supabase
        .from('brand_containers')
        .select('id, nombre_marca, logo_url')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      const bc = containers?.[0];
      if (!bc) {
        body.innerHTML = this._pageConnectPrompt();
        this._bindConnectPrompt();
        return;
      }

      const { data: fbRows } = await supabase
        .from('brand_integrations')
        .select('id')
        .eq('brand_container_id', bc.id)
        .eq('platform', 'facebook')
        .eq('is_active', true)
        .limit(1);

      const { data: goRows } = await supabase
        .from('brand_integrations')
        .select('id')
        .eq('brand_container_id', bc.id)
        .eq('platform', 'google')
        .eq('is_active', true)
        .limit(1);

      const hasFb = (fbRows?.length || 0) > 0;
      const hasGo = (goRows?.length || 0) > 0;

      if (!hasFb && !hasGo) {
        body.innerHTML = this._pageConnectPrompt();
        this._bindConnectPrompt();
        return;
      }

      const authH = { Authorization: `Bearer ${token}` };
      const [ytRes, metaRes] = await Promise.all([
        hasGo
          ? fetch(`/api/brand/videos-youtube?brand_container_id=${encodeURIComponent(bc.id)}&limit=25`, { headers: authH })
          : Promise.resolve(null),
        hasFb
          ? fetch(`/api/brand/posts-meta?brand_container_id=${encodeURIComponent(bc.id)}&limit=20`, { headers: authH })
          : Promise.resolve(null)
      ]);

      let ytData = null;
      if (hasGo && ytRes) {
        ytData = await ytRes.json().catch(() => ({}));
        if (!ytRes.ok) ytData = { error: ytData.error || `HTTP ${ytRes.status}` };
      }

      let metaData = null;
      if (hasFb && metaRes) {
        metaData = await metaRes.json().catch(() => ({}));
        if (!metaRes.ok) metaData = { error: metaData.error || `HTTP ${metaRes.status}` };
      }

      body.innerHTML = this._buildMyBrandsPanels({ bc, hasGo, hasFb, ytData, metaData });

    } catch (e) {
      body.innerHTML = this._errorHTML(e?.message || 'Error al cargar datos.');
    }
  }

  /**
   * Paneles apilados: YouTube (Google) y/o Meta (Facebook + Instagram).
   */
  _buildMyBrandsPanels({ bc, hasGo, hasFb, ytData, metaData }) {
    const parts = [];
    if (hasGo) {
      parts.push(`<section class="insight-panel insight-panel--youtube" aria-label="YouTube">${this._buildYoutubeSection(ytData, bc)}</section>`);
    }
    if (hasFb) {
      parts.push(`<section class="insight-panel insight-panel--meta" aria-label="Meta">${this._buildPostsFeed(metaData, bc)}</section>`);
    }
    return `<div class="insight-mb-stack">${parts.join('')}</div>`;
  }

  _buildYoutubeSection(data, bc) {
    if (!data) {
      return `<div class="ytb-inline-error"><i class="fab fa-youtube"></i><span>Sin respuesta de YouTube.</span></div>`;
    }
    if (data.error) {
      return `<div class="ytb-inline-error"><i class="fab fa-youtube"></i><span>${this._esc(data.error)}</span></div>`;
    }

    const { channel, videos = [], message } = data;
    if (!channel) {
      return `
        <div class="ytb-feed">
          <div class="ytb-empty"><i class="fab fa-youtube"></i><p>${this._esc(message || 'No se encontró canal de YouTube para esta cuenta.')}</p></div>
        </div>`;
    }

    const vCount = videos.length;
    return `
      <div class="ytb-feed">
        <div class="ytb-header">
          <div class="ytb-account">
            ${channel.thumbnailUrl
              ? `<img src="${this._esc(channel.thumbnailUrl)}" class="ytb-page-avatar" alt="">`
              : `<div class="ytb-page-avatar-icon"><i class="fab fa-youtube"></i></div>`}
            <div class="ytb-account-info">
              <span class="ytb-account-name">${this._esc(channel.title || bc.nombre_marca)}</span>
              <div class="ytb-account-badges">
                <span class="ytb-badge"><i class="fab fa-youtube"></i> ${vCount} vídeos recientes</span>
                ${channel.subscriberCount != null
                  ? `<span class="ytb-badge ytb-badge--muted"><i class="fas fa-users"></i> ${Number(channel.subscriberCount).toLocaleString('es')} suscriptores</span>`
                  : ''}
              </div>
            </div>
          </div>
          ${channel.videoCount != null
            ? `<span class="ytb-stat"><i class="fas fa-photo-video"></i> ${Number(channel.videoCount).toLocaleString('es')} en el canal</span>`
            : ''}
        </div>
        ${vCount === 0
          ? `<div class="ytb-empty"><i class="fas fa-film"></i><span>No hay vídeos en la lista de subidas.</span></div>`
          : `<div class="ytb-grid">${videos.map(v => this._youtubeCard(v)).join('')}</div>`}
      </div>`;
  }

  _youtubeCard(v) {
    const date = v.publishedAt
      ? new Date(v.publishedAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
    return `
      <article class="ytb-card">
        ${v.thumbnailUrl
          ? `<a href="${this._esc(v.videoUrl || '#')}" target="_blank" rel="noopener" class="ytb-card-media">
               <img src="${this._esc(v.thumbnailUrl)}" alt="" loading="lazy">
               <span class="ytb-play"><i class="fab fa-youtube"></i></span>
             </a>`
          : `<div class="ytb-card-media ytb-card-media--empty"><i class="fab fa-youtube"></i></div>`}
        <div class="ytb-card-body">
          <div class="ytb-card-meta">
            <i class="fab fa-youtube ytb-icon"></i>
            <span class="ytb-card-date">${date}</span>
            ${v.videoUrl
              ? `<a href="${this._esc(v.videoUrl)}" target="_blank" rel="noopener" class="ytb-card-link" title="Abrir en YouTube"><i class="fas fa-external-link-alt"></i></a>`
              : ''}
          </div>
          <p class="ytb-card-title">${this._esc((v.title || 'Sin título').slice(0, 120))}${(v.title || '').length > 120 ? '…' : ''}</p>
        </div>
      </article>`;
  }

  _bindConnectPrompt() {
    const btn = document.getElementById('insightGoToBrands');
    if (btn) btn.addEventListener('click', () => {
      localStorage.setItem('brands_open_info', '1');
      window.router?.navigate('/brands');
    });
  }

  // ── Feed de posts ──────────────────────────────────────────────────────────

  _buildPostsFeed(data, bc) {
    if (data?.error) {
      return `<div class="mbf-inline-error"><i class="fab fa-facebook"></i><span>${this._esc(data.error)}</span></div>`;
    }

    const { page, facebook_posts = [], instagram_posts = [], instagram_username } = data;

    const fbCount = facebook_posts.length;
    const igCount = instagram_posts.length;

    // Mezclar y ordenar por fecha descendente
    const allPosts = [
      ...facebook_posts.map(p => ({ ...p, network: 'facebook' })),
      ...instagram_posts.map(p => ({ ...p, network: 'instagram' }))
    ].sort((a, b) => new Date(b.created_time) - new Date(a.created_time));

    return `
      <div class="mbf-feed">

        <!-- Header de cuenta conectada -->
        <div class="mbf-header">
          <div class="mbf-account">
            ${page?.picture
              ? `<img src="${this._esc(page.picture)}" class="mbf-page-avatar" alt="">`
              : `<div class="mbf-page-avatar-icon"><i class="fab fa-facebook"></i></div>`}
            <div class="mbf-account-info">
              <span class="mbf-account-name">${this._esc(page?.name || bc.nombre_marca)}</span>
              <div class="mbf-account-badges">
                <span class="mbf-badge mbf-badge--fb"><i class="fab fa-facebook"></i> ${fbCount} posts</span>
                ${igCount > 0
                  ? `<span class="mbf-badge mbf-badge--ig"><i class="fab fa-instagram"></i> ${instagram_username ? '@' + this._esc(instagram_username) : ''} · ${igCount} posts</span>`
                  : `<span class="mbf-badge mbf-badge--dim"><i class="fab fa-instagram"></i> Sin cuenta IG vinculada</span>`}
              </div>
            </div>
          </div>
          ${page?.fans ? `<span class="mbf-fans"><i class="fas fa-users"></i> ${Number(page.fans).toLocaleString('es')} seguidores</span>` : ''}
        </div>

        ${allPosts.length === 0
          ? `<div class="mbf-empty"><i class="fas fa-inbox"></i><span>No se encontraron publicaciones recientes.</span></div>`
          : `<div class="mbf-grid">${allPosts.map(p => this._postCard(p)).join('')}</div>`}

      </div>`;
  }

  _postCard(post) {
    const isFb = post.network === 'facebook';
    const eng  = post.likes + post.comments + post.shares;
    const date = post.created_time
      ? new Date(post.created_time).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
    const isVideo = post.media_type === 'video';

    return `
      <article class="mbf-card">
        ${post.picture
          ? `<div class="mbf-card-media${isVideo ? ' mbf-card-media--video' : ''}">
               <img src="${this._esc(post.picture)}" alt="" loading="lazy">
               ${isVideo ? `<div class="mbf-play-icon"><i class="fas fa-play-circle"></i></div>` : ''}
             </div>`
          : `<div class="mbf-card-media mbf-card-media--empty"><i class="fas fa-file-alt"></i></div>`}

        <div class="mbf-card-body">
          <div class="mbf-card-network">
            <i class="fab fa-${isFb ? 'facebook mbf-icon--fb' : 'instagram mbf-icon--ig'}"></i>
            <span class="mbf-card-date">${date}</span>
            ${post.permalink
              ? `<a href="${this._esc(post.permalink)}" target="_blank" rel="noopener" class="mbf-card-link" title="Ver publicación"><i class="fas fa-external-link-alt"></i></a>`
              : ''}
          </div>
          ${post.message
            ? `<p class="mbf-card-text">${this._esc(post.message.slice(0, 140))}${post.message.length > 140 ? '…' : ''}</p>`
            : `<p class="mbf-card-text mbf-card-text--empty">Sin texto</p>`}
          <div class="mbf-card-metrics">
            <span><i class="fas fa-heart"></i> ${post.likes.toLocaleString('es')}</span>
            <span><i class="fas fa-comment"></i> ${post.comments.toLocaleString('es')}</span>
            ${post.shares > 0 ? `<span><i class="fas fa-share"></i> ${post.shares.toLocaleString('es')}</span>` : ''}
            <span class="mbf-card-eng"><i class="fas fa-bolt"></i> ${eng.toLocaleString('es')}</span>
          </div>
        </div>
      </article>`;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _pageConnectPrompt() {
    return `
      <div class="insight-integrations-prompt">
        <div class="insight-int-platforms">
          <div class="insight-int-logo insight-int-logo--google" title="Google">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <div class="insight-int-logo insight-int-logo--meta" title="Meta">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" fill="#1877F2"/>
            </svg>
          </div>
        </div>
        <h2 class="insight-int-title">Conecta tu marca</h2>
        <p class="insight-int-desc">
          Vincula tu cuenta de <strong>Google</strong> y <strong>Meta</strong> para acceder a métricas
          reales en tiempo real: Analytics, YouTube, Facebook, Instagram, Ads y mucho más,
          todo centralizado en un solo panel.
        </p>
        <button class="insight-int-cta" id="insightGoToBrands">
          <i class="fas fa-plug"></i>
          Conectar integraciones
          <i class="fas fa-arrow-right insight-int-cta-arrow"></i>
        </button>
      </div>`;
  }

  _pageComingSoon(title, icon, description) {
    return `
      <div class="insight-coming-soon">
        <div class="insight-cs-icon"><i class="fas ${icon}"></i></div>
        <h2 class="insight-cs-title">${title}</h2>
        <p class="insight-cs-desc">${description}</p>
        <span class="insight-cs-badge">Próximamente</span>
      </div>`;
  }

  _loadingHTML() {
    return `<div class="insight-loading"><i class="fas fa-spinner fa-spin"></i><span>Cargando datos…</span></div>`;
  }

  _errorHTML(msg) {
    return `<div class="insight-error-state"><i class="fas fa-exclamation-triangle"></i><span>${this._esc(msg)}</span></div>`;
  }

  _esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }
}

window.InsightView = InsightView;
