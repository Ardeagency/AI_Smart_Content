/**
 * HogarView - Vista principal de organizaciones (selector de orgs)
 * Estilos: css/hogar.css (variables --living-* con fallbacks; living.css carga después).
 * Carga organizaciones y colores de marca (brand_colors) para degradados.
 */
class HogarView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'hogar.html';
    this.supabase = null;
    this.userId = null;
    this.organizations = [];
  }

  /**
   * Hook llamado al entrar a la vista
   */
  async onEnter() {
    // Verificar autenticación
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) {
          window.router.navigate('/login', true);
        }
        return;
      }
    } else {
      const isAuth = await this.checkAuthentication();
      if (!isAuth) {
        if (window.router) {
          window.router.navigate('/login', true);
        }
        return;
      }
    }

    // Renderizar Navigation si no está visible
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
  }

  /**
   * Renderizar la vista
   */
  async render() {
    await super.render();
    await this.initSupabase();
    await this.loadOrganizations();
    this.setupEventListeners();
    
    // Hacer disponible globalmente para acceso desde event listeners
    window.hogarView = this;
  }

  /**
   * Inicializar Supabase
   */
  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      } else if (typeof waitForSupabase === 'function') {
        this.supabase = await waitForSupabase();
      }

      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) {
          this.userId = user.id;
        }
      }
    } catch (error) {
      console.error('Error inicializando Supabase:', error);
    }
  }

  /**
   * Cargar organizaciones del usuario
   */
  async loadOrganizations() {
    if (!this.supabase || !this.userId) {
      this.showError('No se pudo inicializar la conexión');
      return;
    }

    const gridEl = this.querySelector('#organizationsGrid');

    try {
      if (gridEl) gridEl.style.display = 'none';

      const [membersResult, ownedResult] = await Promise.all([
        this.supabase.from('organization_members').select(`
          organization_id, role,
          organizations ( id, name, owner_user_id, created_at )
        `).eq('user_id', this.userId),
        this.supabase.from('organizations').select('*').eq('owner_user_id', this.userId)
      ]);

      const { data: orgMembers, error: membersError } = membersResult;
      const { data: ownedOrgs, error: ownedError } = ownedResult;

      if (membersError) throw membersError;

      // Combinar y deduplicar organizaciones
      const orgsMap = new Map();
      
      // Agregar organizaciones donde es owner
      if (ownedOrgs) {
        ownedOrgs.forEach(org => {
          orgsMap.set(org.id, {
            ...org,
            role: 'owner'
          });
        });
      }

      // Agregar organizaciones donde es miembro
      if (orgMembers) {
        orgMembers.forEach(member => {
          if (member.organizations) {
            const org = member.organizations;
            if (!orgsMap.has(org.id)) {
              orgsMap.set(org.id, {
                ...org,
                role: member.role
              });
            }
          }
        });
      }

      this.organizations = Array.from(orgsMap.values());
      const orgIds = this.organizations.map(o => o.id);

      const [creditsRes, containersRes, membersRes] = await Promise.all([
        this.supabase.from('organization_credits')
          .select('organization_id, credits_available, credits_total')
          .in('organization_id', orgIds),
        this.supabase.from('brand_containers')
          .select('organization_id, nombre_marca, logo_url')
          .in('organization_id', orgIds),
        this.supabase.from('organization_members')
          .select('organization_id, user_id')
          .in('organization_id', orgIds)
          .order('created_at', { ascending: true })
      ]);

      const creditsRows = creditsRes.data;
      const containersRows = containersRes.data;
      const membersRows = membersRes.data;

      const creditsByOrg = {};
      (creditsRows || []).forEach(r => { creditsByOrg[r.organization_id] = r; });

      const marcasByOrg = {};
      const firstBrandByOrg = {};
      (containersRows || []).forEach(r => {
        if (!marcasByOrg[r.organization_id]) marcasByOrg[r.organization_id] = [];
        if (r.nombre_marca) marcasByOrg[r.organization_id].push(r.nombre_marca);
        if (!firstBrandByOrg[r.organization_id]) firstBrandByOrg[r.organization_id] = { nombre_marca: r.nombre_marca, logo_url: r.logo_url || '' };
      });

      const membersByOrg = {};
      orgIds.forEach(id => { membersByOrg[id] = []; });
      (membersRows || []).forEach(r => {
        if (r.user_id) membersByOrg[r.organization_id].push(r.user_id);
      });
      const allMemberIds = [...new Set((membersRows || []).map(m => m.user_id).filter(Boolean))];
      const ownerIds = [...new Set(this.organizations.map(o => o.owner_user_id).filter(Boolean))];

      const parallelQueries = [];
      parallelQueries.push(
        allMemberIds.length > 0
          ? this.supabase.from('profiles').select('id, full_name').in('id', allMemberIds)
          : Promise.resolve({ data: [] })
      );
      parallelQueries.push(
        ownerIds.length > 0
          ? this.supabase.from('profiles').select('id, plan_type').in('id', ownerIds)
          : Promise.resolve({ data: [] })
      );
      parallelQueries.push(
        ownerIds.length > 0
          ? (ownerIds.length === 1
              ? this.supabase.from('subscriptions').select('user_id, price, currency').eq('user_id', ownerIds[0]).order('created_at', { ascending: false })
              : this.supabase.from('subscriptions').select('user_id, price, currency').in('user_id', ownerIds).order('created_at', { ascending: false }))
          : Promise.resolve({ data: [] })
      );
      parallelQueries.push(
        ...this.organizations.map(org =>
          this.getOrganizationBrandColors(org.id).catch(() => [])
        )
      );

      const parallelResults = await Promise.all(parallelQueries);

      let avatarByUser = {};
      (parallelResults[0].data || []).forEach(p => { avatarByUser[p.id] = { avatar_url: '', full_name: p.full_name || '' }; });

      let planByUser = {};
      (parallelResults[1].data || []).forEach(u => { planByUser[u.id] = u.plan_type || '—'; });

      let costByUser = {};
      (parallelResults[2].data || []).forEach(s => {
        if (costByUser[s.user_id] == null) costByUser[s.user_id] = { price: s.price, currency: s.currency || 'USD' };
      });

      this.organizations.forEach((org, i) => {
        org.brandColors = parallelResults[3 + i] || [];
        const cred = creditsByOrg[org.id];
        org.credits_available = cred ? cred.credits_available : 0;
        org.credits_total = cred ? cred.credits_total : 0;
        org.marcaNames = marcasByOrg[org.id] || [];
        const firstBrand = firstBrandByOrg[org.id];
        org.firstBrandLogo = firstBrand ? (firstBrand.logo_url || '') : '';
        const memberIds = membersByOrg[org.id] || [];
        org.membersCount = memberIds.length;
        org.memberAvatars = memberIds.slice(0, 4).map(uid => avatarByUser[uid] || { avatar_url: '', full_name: '' });
        const ownerId = org.owner_user_id;
        org.planType = ownerId ? (planByUser[ownerId] || '—') : '—';
        const cost = ownerId ? costByUser[ownerId] : null;
        org.planCost = cost ? `${cost.currency} ${Number(cost.price)}` : '—';
      });

      if (gridEl) {
        gridEl.style.display = 'flex';
        this.renderOrganizations();
      }
    } catch (error) {
      console.error('Error cargando organizaciones:', error);
      this.showError('Error cargando organizaciones. Por favor, recarga la página.');
    }
  }

  /**
   * Obtener IDs de brand_containers de una organización
   */
  async getBrandContainerIds(organizationId) {
    if (!this.supabase) return [];
    
    try {
      const { data, error } = await this.supabase
        .from('brand_containers')
        .select('id')
        .eq('organization_id', organizationId);
      
      if (error) throw error;
      return data ? data.map(b => b.id) : [];
    } catch (error) {
      console.error('Error obteniendo brand containers:', error);
      return [];
    }
  }

  /**
   * Cargar colores de marca de la organización (desde brand_colors vía brands → brand_containers)
   * Devuelve array de hex hasta 3 colores para el Brand Gradient Identity Header.
   */
  async getOrganizationBrandColors(organizationId) {
    if (!this.supabase) return [];
    const brandContainerIds = await this.getBrandContainerIds(organizationId);
    if (brandContainerIds.length === 0) return [];

    try {
      const { data: brands } = await this.supabase
        .from('brands')
        .select('id')
        .in('project_id', brandContainerIds);
      const brandIds = brands ? brands.map(b => b.id) : [];
      if (brandIds.length === 0) return [];

      const { data: colors } = await this.supabase
        .from('brand_colors')
        .select('hex_value')
        .in('brand_id', brandIds);

      if (!colors || colors.length === 0) return [];
      const seen = new Set();
      const hexes = [];
      for (const row of colors) {
        const raw = (row.hex_value || '').trim();
        const clean = raw.replace(/^#/, '');
        if (!clean || !/^[0-9A-Fa-f]{6}$/.test(clean)) continue;
        const normalized = `#${clean}`;
        if (!seen.has(normalized)) {
          seen.add(normalized);
          hexes.push(normalized);
          if (hexes.length >= 3) break;
        }
      }
      return hexes;
    } catch (error) {
      console.error('Error cargando brand colors:', error);
      return [];
    }
  }

  /**
   * Brand Color Intelligence: hex → HSL
   */
  hexToHSL(hex) {
    const clean = hex.replace(/^#/, '');
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        default: h = ((r - g) / d + 4) / 6;
      }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  /**
   * HSL → hex
   */
  hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    const r = Math.round(f(0) * 255);
    const g = Math.round(f(8) * 255);
    const b = Math.round(f(4) * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Filtrar y puntuar colores (excluir L>85, L<18, S<15, S>90). Máx 3 colores.
   */
  filterAndScoreBrandColors(hexes) {
    const MIN_L = 18, MAX_L = 85, MIN_S = 15, MAX_S = 90;
    const idealL = 45, idealS = 50;
    const out = [];
    for (const hex of hexes.slice(0, 5)) {
      const { h, s, l } = this.hexToHSL(hex);
      if (l > MAX_L || l < MIN_L || s < MIN_S || s > MAX_S) continue;
      const scoreL = 30 - Math.abs(l - idealL) / 2;
      const scoreS = 40 - Math.abs(s - idealS) / 2;
      const score = Math.max(0, scoreL + scoreS);
      out.push({ hex, h, s, l, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  /**
   * Obtener primary y secondary. Si solo hay uno, secondary = derivado (shift hue + ajuste L/S).
   */
  getBrandUIPalette(brandColors) {
    if (!brandColors || brandColors.length === 0) return null;
    const filtered = this.filterAndScoreBrandColors(brandColors);
    if (filtered.length === 0) {
      const raw = brandColors[0];
      const { h, s, l } = this.hexToHSL(raw);
      const primary = this.hslToHex(h, Math.min(90, Math.max(20, s)), Math.min(75, Math.max(25, l)));
      const secondary = this.hslToHex(h, Math.min(85, s + 5), Math.max(15, l - 18));
      return { primary, secondary };
    }
    const primary = filtered[0].hex;
    let secondary = null;
    for (let i = 1; i < filtered.length; i++) {
      const diff = Math.abs(filtered[i].h - filtered[0].h);
      const hueDiff = Math.min(diff, 360 - diff);
      if (hueDiff > 20) {
        secondary = filtered[i].hex;
        break;
      }
    }
    if (!secondary) {
      const { h, s, l } = this.hexToHSL(primary);
      secondary = this.hslToHex(h, Math.min(90, s + 10), Math.max(18, l - 12));
    }
    return { primary, secondary };
  }

  /**
   * Gradiente para header de card: máximo 2 colores, oscurecidos para contraste.
   */
  buildBrandGradientHeaderCss(brandColors) {
    const palette = this.getBrandUIPalette(brandColors);
    if (!palette) return '';
    const primary = this.darkenHex(palette.primary, 0.75);
    const secondary = this.darkenHex(palette.secondary, 0.7);
    return `linear-gradient(135deg, ${primary}, ${secondary})`;
  }

  darkenHex(hex, factor) {
    const { h, s, l } = this.hexToHSL(hex);
    const newL = Math.max(15, Math.min(45, l * factor));
    return this.hslToHex(h, s, newL);
  }

  /**
   * Renderizar cards de organizaciones + card "Nueva Organización" (estilo referencia: icono, título, descripción).
   */
  renderOrganizations() {
    const gridEl = this.querySelector('#organizationsGrid');
    if (!gridEl) return;
    const orgCardsHtml = this.organizations.map(org => this.renderOrgCard(org)).join('');
    const newCardHtml = this.renderNewOrgCard();
    gridEl.innerHTML = orgCardsHtml + newCardHtml;

    this.organizations.forEach(org => {
      const card = gridEl.querySelector(`[data-org-id="${org.id}"]`);
      if (!card) return;
      const go = () => this.navigateToOrganization(org.id);
      card.addEventListener('click', () => go());
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      });
    });

    const newCard = gridEl.querySelector('[data-new-org]');
    if (newCard) {
      const goNew = () => {
        if (window.router) {
          window.router.navigate('/form_org');
        } else {
          window.location.href = '/form_org';
        }
      };
      newCard.addEventListener('click', () => goNew());
      newCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goNew();
        }
      });
    }
  }

  /**
   * Card de organización: título + círculo de créditos (arco con gradiente púrpura–naranja). Estilo referencia.
   */
  renderOrgCard(org) {
    const name = this.escapeHtml(org.name || '');
    const credits = org.credits_available != null ? `${org.credits_available}` : '0';
    const safeId = `credits-${String(org.id).replace(/[^a-z0-9-]/gi, '')}`;
    return `
      <div class="org-card org-card-premium" data-org-id="${org.id}" role="button" tabindex="0" title="Entrar a ${name}">
        <h3 class="org-card-org-name">${name}</h3>
        <div class="org-card-credits-circle" aria-hidden="true">
          <svg class="org-card-credits-arc" viewBox="0 0 40 40">
            <defs>
              <linearGradient id="${safeId}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#8B5CF6"/>
                <stop offset="100%" stop-color="#F97316"/>
              </linearGradient>
            </defs>
            <circle cx="20" cy="20" r="16" fill="none" stroke="url(#${safeId})" stroke-width="2.5" stroke-dasharray="70 30" stroke-linecap="round" transform="rotate(-135 20 20)"/>
            <circle class="org-card-credits-dot" cx="12.7" cy="34.3" r="1.8" fill="white"/>
          </svg>
          <span class="org-card-credits-value">${credits}</span>
          <span class="org-card-credits-label">Créditos</span>
        </div>
      </div>
    `;
  }

  /**
   * Card "Nueva Organización": icono plus, título y descripción. Mismo estilo vidrio que las de org.
   */
  renderNewOrgCard() {
    return `
      <div class="org-card org-card-premium org-card--new" data-new-org role="button" tabindex="0" title="Crear nueva organización">
        <span class="org-card-icon org-card-icon--new" aria-hidden="true"><i class="fas fa-plus"></i></span>
        <h3 class="org-card-org-name">Nueva Organización</h3>
        <p class="org-card-desc">Crea una organización para gestionar tus marcas y contenido</p>
      </div>
    `;
  }

  /**
   * Navegar a una organización (ir a living con esa organización seleccionada)
   */
  navigateToOrganization(orgId) {
    // Guardar organización seleccionada en el estado (para compatibilidad)
    if (window.appState) {
      window.appState.set('selectedOrganizationId', orgId, true);
    }
    
    // Navegar a la ruta de organización
    if (window.router) {
      window.router.navigate(`/org/${orgId}/historial`);
    }
  }


  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    // Modal de organización
    const modal = this.querySelector('#orgModal');
    const modalClose = this.querySelector('#orgModalClose');
    const modalCancel = this.querySelector('#orgModalCancel');
    const orgForm = this.querySelector('#orgForm');

    if (modalClose) {
      modalClose.addEventListener('click', () => this.hideModal());
    }

    if (modalCancel) {
      modalCancel.addEventListener('click', () => this.hideModal());
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideModal();
        }
      });
    }

    if (orgForm) {
      orgForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleOrgSubmit();
      });
    }
  }


  /**
   * Ocultar modal
   */
  hideModal() {
    const modal = this.querySelector('#orgModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Manejar submit del formulario
   */
  async handleOrgSubmit() {
    if (!this.supabase || !this.userId) {
      this.showError('No se pudo inicializar la conexión');
      return;
    }

    const nameInput = this.querySelector('#orgName');
    const submitBtn = this.querySelector('#orgModalSubmit');
    
    if (!nameInput || !nameInput.value.trim()) {
      alert('Por favor ingresa un nombre para la organización');
      return;
    }

    const orgName = nameInput.value.trim();
    
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }

    try {
      if (this.currentEditOrgId) {
        // Actualizar organización existente
        const { error } = await this.supabase
          .from('organizations')
          .update({ name: orgName })
          .eq('id', this.currentEditOrgId)
          .eq('owner_user_id', this.userId); // Solo el owner puede editar

        if (error) throw error;
      } else {
        // Crear nueva organización
        const { data, error } = await this.supabase
          .from('organizations')
          .insert({
            name: orgName,
            owner_user_id: this.userId
          })
          .select()
          .single();

        if (error) throw error;

        await Promise.all([
          this.supabase.from('organization_credits').insert({
            organization_id: data.id,
            credits_available: 0,
            credits_total: 0
          }),
          this.supabase.from('organization_members').insert({
            organization_id: data.id,
            user_id: this.userId,
            role: 'owner'
          })
        ]);
      }

      this.hideModal();
      await this.loadOrganizations();
    } catch (error) {
      console.error('Error guardando organización:', error);
      alert(`Error: ${error.message || 'No se pudo guardar la organización'}`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Guardar';
      }
    }
  }

  /**
   * Escapar HTML para prevenir XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Mostrar error
   */
  showError(message) {
    const container = this.container;
    if (container) {
      container.innerHTML = `
        <div class="error-container">
          <i class="fas fa-exclamation-triangle"></i>
          <h2>Error</h2>
          <p>${this.escapeHtml(message)}</p>
          <button class="btn btn-primary" onclick="window.location.reload()">Recargar</button>
        </div>
      `;
    }
  }

  /**
   * Verificar autenticación
   */
  async checkAuthentication() {
    if (window.authService) {
      return await window.authService.isAuthenticated();
    }
    if (this.supabase) {
      const { data: { user } } = await this.supabase.auth.getUser();
      return !!user;
    }
    return false;
  }

  /**
   * Hook al salir de la vista - sin limpieza
   */
  async onLeave() {
    // Sin limpieza - el navegador maneja todo automáticamente
  }
}

// Hacer disponible globalmente
window.HogarView = HogarView;
