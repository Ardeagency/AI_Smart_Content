/**
 * HogarView - Vista principal de organizaciones
 * Muestra todas las organizaciones del usuario en formato de cards
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
    if (window.navigation && !window.navigation.initialized) {
      await window.navigation.render();
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

    const emptyEl = this.querySelector('#hogarEmpty');
    const gridEl = this.querySelector('#organizationsGrid');

    try {
      if (emptyEl) emptyEl.style.display = 'none';
      if (gridEl) gridEl.style.display = 'none';

      // Cargar organizaciones donde el usuario es miembro o owner
      const { data: orgMembers, error: membersError } = await this.supabase
        .from('organization_members')
        .select(`
          organization_id,
          role,
          organizations (
            id,
            name,
            owner_user_id,
            created_at
          )
        `)
        .eq('user_id', this.userId);

      if (membersError) {
        console.error('Error cargando miembros:', membersError);
        throw membersError;
      }

      // También cargar organizaciones donde el usuario es owner
      const { data: ownedOrgs, error: ownedError } = await this.supabase
        .from('organizations')
        .select('*')
        .eq('owner_user_id', this.userId);

      if (ownedError) {
        console.error('Error cargando organizaciones propias:', ownedError);
      }

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

      // Cargar estadísticas para cada organización
      await this.loadOrganizationStats();

      // Renderizar
      if (this.organizations.length === 0) {
        if (emptyEl) emptyEl.style.display = 'flex';
        if (gridEl) gridEl.style.display = 'none';
      } else {
        if (emptyEl) emptyEl.style.display = 'none';
        if (gridEl) gridEl.style.display = 'grid';
        this.renderOrganizations();
      }
    } catch (error) {
      console.error('Error cargando organizaciones:', error);
      this.showError('Error cargando organizaciones. Por favor, recarga la página.');
    }
  }

  /**
   * Cargar estadísticas de cada organización
   */
  async loadOrganizationStats() {
    if (!this.supabase) return;

    for (const org of this.organizations) {
      try {
        // Obtener brand_container_ids primero
        const brandContainerIds = await this.getBrandContainerIds(org.id);
        
        // Cargar estadísticas en paralelo
        const [
          creditsResult,
          brandsResult,
          productsResult,
          campaignsResult,
          membersResult
        ] = await Promise.allSettled([
          // Créditos disponibles
          this.supabase
            .from('organization_credits')
            .select('credits_available, credits_total')
            .eq('organization_id', org.id)
            .maybeSingle(),
          
          // Marcas (brand_containers)
          this.supabase
            .from('brand_containers')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', org.id),
          
          // Productos (solo si hay brand containers)
          brandContainerIds.length > 0
            ? this.supabase
                .from('products')
                .select('id', { count: 'exact', head: true })
                .in('brand_container_id', brandContainerIds)
            : Promise.resolve({ count: 0 }),
          
          // Campañas (solo si hay brand containers)
          brandContainerIds.length > 0
            ? this.supabase
                .from('campaigns')
                .select('id', { count: 'exact', head: true })
                .in('brand_container_id', brandContainerIds)
            : Promise.resolve({ count: 0 }),
          
          // Colaboradores
          this.supabase
            .from('organization_members')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', org.id)
        ]);

        // Procesar resultados
        org.stats = {
          credits_available: creditsResult.status === 'fulfilled' && creditsResult.value.data
            ? creditsResult.value.data.credits_available || 0
            : 0,
          credits_total: creditsResult.status === 'fulfilled' && creditsResult.value.data
            ? creditsResult.value.data.credits_total || 0
            : 0,
          brands_count: brandsResult.status === 'fulfilled' && brandsResult.value.count !== null
            ? brandsResult.value.count
            : 0,
          products_count: productsResult.status === 'fulfilled' && productsResult.value.count !== null
            ? productsResult.value.count
            : 0,
          campaigns_count: campaignsResult.status === 'fulfilled' && campaignsResult.value.count !== null
            ? campaignsResult.value.count
            : 0,
          members_count: membersResult.status === 'fulfilled' && membersResult.value.count !== null
            ? membersResult.value.count
            : 0
        };

        // Brand Gradient Identity: colores desde brand_colors de las marcas de la org
        org.brandColors = await this.getOrganizationBrandColors(org.id);
      } catch (error) {
        console.error(`Error cargando stats para org ${org.id}:`, error);
        org.stats = {
          credits_available: 0,
          credits_total: 0,
          brands_count: 0,
          products_count: 0,
          campaigns_count: 0,
          members_count: 0
        };
        org.brandColors = [];
      }
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
   * Solo base gradient (identidad). Las capas highlight/shadow/noise van en CSS.
   */
  buildBrandGradientCss(brandColors) {
    const palette = this.getBrandUIPalette(brandColors);
    if (!palette) return '';
    return `linear-gradient(135deg, ${palette.primary}, ${palette.secondary})`;
  }

  /**
   * Renderizar organizaciones en el grid
   */
  renderOrganizations() {
    const gridEl = this.querySelector('#organizationsGrid');
    if (!gridEl) return;

    gridEl.innerHTML = this.organizations.map(org => this.renderOrganizationCard(org)).join('');
    
    // Agregar event listeners a las cards
    this.organizations.forEach(org => {
      const card = gridEl.querySelector(`[data-org-id="${org.id}"]`);
      if (card) {
        card.addEventListener('click', (e) => {
          if (!e.target.closest('.org-favorite-btn') && !e.target.closest('.org-edit-btn') && !e.target.closest('.org-card-kebab')) {
            this.navigateToOrganization(org.id);
          }
        });

        const kebabBtn = card.querySelector('.org-card-kebab');
        if (kebabBtn) {
          kebabBtn.addEventListener('click', (e) => e.stopPropagation());
        }

        // Botón de editar
        const editBtn = card.querySelector('.org-edit-btn');
        if (editBtn) {
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.editOrganization(org.id);
          });
        }
      }
    });
  }

  /**
   * Formatear fecha relativa (ej. "hace 5 días", "2 days ago")
   */
  formatRelativeDate(createdAt) {
    if (!createdAt) return '';
    const date = new Date(createdAt);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semana${Math.floor(diffDays / 7) !== 1 ? 's' : ''}`;
    if (diffDays < 365) return `Hace ${Math.floor(diffDays / 30)} mes${Math.floor(diffDays / 30) !== 1 ? 'es' : ''}`;
    return `Hace ${Math.floor(diffDays / 365)} año${Math.floor(diffDays / 365) !== 1 ? 's' : ''}`;
  }

  /**
   * Mapear plan a etiqueta y clase para badge (Starter → neutral, Pro → brand, Enterprise → premium)
   */
  getPlanBadge(planType) {
    const p = (planType || 'starter').toLowerCase();
    if (p === 'pro' || p === 'basico') return { label: p === 'pro' ? 'Pro' : 'Starter', class: 'plan-pro' };
    if (p === 'enterprise' || p === 'empresas') return { label: 'Enterprise', class: 'plan-enterprise' };
    return { label: 'Starter', class: 'plan-starter' };
  }

  /**
   * Renderizar card de organización (Brand Gradient Identity Header + folder body)
   */
  renderOrganizationCard(org) {
    const stats = org.stats || {};
    const logoInitial = org.name ? org.name.charAt(0).toUpperCase() : 'O';
    const membersCount = stats.members_count || 0;
    const creditsRemaining = stats.credits_available ?? 0;
    const creditsTotal = stats.credits_total ?? 0;
    const creditsThreshold = 100;
    const creditsLow = creditsTotal > 0 && creditsRemaining < creditsThreshold;
    const planBadge = this.getPlanBadge(org.plan_type);
    const lastProductionText = org.last_production_at
      ? `Última producción: ${this.formatRelativeDate(org.last_production_at)}`
      : 'Listo para crear tu primera producción';
    const showTeam = membersCount > 1;
    const progressPct = creditsTotal > 0 ? Math.min(100, Math.round((creditsRemaining / creditsTotal) * 100)) : 100;
    const brandColors = org.brandColors || [];
    const hasBranding = brandColors.length > 0;
    const gradientCss = hasBranding ? this.buildBrandGradientCss(brandColors) : '';
    const noProductions = !org.last_production_at;

    const cardStateAttrs = [
      creditsLow ? 'data-credits-low' : '',
      noProductions ? 'data-no-productions' : ''
    ].filter(Boolean).join(' ');

    return `
      <div class="org-card org-card-folder" data-org-id="${org.id}" title="Entrar a ${this.escapeHtml(org.name)}" ${cardStateAttrs}>
        <!-- Brand Gradient Identity Header (36-42%) | fallback: avatar solo si no hay branding -->
        <div class="org-card-cover org-card-cover--identity ${hasBranding ? 'org-card-cover--branded' : ''}" ${hasBranding && gradientCss ? `style="--org-cover-gradient: ${gradientCss}"` : ''}>
          <div class="org-card-cover-inner" aria-hidden="true"></div>
          ${!hasBranding ? `<span class="org-card-cover-initial" aria-hidden="true">${logoInitial}</span>` : ''}
          <button type="button" class="org-card-kebab org-favorite-btn" data-org-id="${org.id}" title="Opciones" aria-label="Opciones">
            <i class="fas fa-ellipsis-v"></i>
          </button>
        </div>
        <!-- Body con folder tab notch | zona segura: título siempre dentro del body -->
        <div class="org-card-body">
          <div class="org-card-body-header">
            <h3 class="org-card-name" title="${this.escapeHtml(org.name)}">${this.escapeHtml(org.name)}</h3>
            <button type="button" class="org-edit-btn org-card-edit" data-org-id="${org.id}" title="Editar organización" aria-label="Editar">
              <i class="fas fa-edit"></i>
            </button>
          </div>
          <div class="org-card-plan-badge ${planBadge.class}">${planBadge.label}</div>
          <div class="org-card-credits">
            <span class="org-card-credits-label">Tokens</span>
            <span class="org-card-credits-value ${creditsLow ? 'credits-low' : ''}">${creditsRemaining} disponibles</span>
            ${creditsTotal > 0 ? `
            <div class="org-card-credits-bar" role="presentation">
              <div class="org-card-credits-bar-fill" style="width: ${progressPct}%"></div>
            </div>
            ` : ''}
          </div>
          ${showTeam ? `
          <div class="org-card-team">
            <div class="org-card-team-avatars">
              <span class="org-card-team-avatar" title="Equipo"><i class="fas fa-users"></i></span>
              <span class="org-card-team-more">+${membersCount - 1}</span>
            </div>
            <span class="org-card-team-label">${membersCount} colaboradores</span>
          </div>
          ` : ''}
          <div class="org-card-activity">
            ${lastProductionText}
          </div>
        </div>
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
      window.router.navigate(`/org/${orgId}/living`);
    }
  }


  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    // Botón crear organización
    const createBtn = this.querySelector('#createOrgBtn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.showCreateModal());
    }

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
   * Mostrar modal de crear organización
   */
  showCreateModal() {
    const modal = this.querySelector('#orgModal');
    const title = this.querySelector('#orgModalTitle');
    const form = this.querySelector('#orgForm');
    
    if (modal) {
      if (title) title.textContent = 'Nueva Organización';
      if (form) form.reset();
      modal.style.display = 'flex';
      this.currentEditOrgId = null;
    }
  }

  /**
   * Editar organización
   */
  editOrganization(orgId) {
    const org = this.organizations.find(o => o.id === orgId);
    if (!org) return;

    const modal = this.querySelector('#orgModal');
    const title = this.querySelector('#orgModalTitle');
    const nameInput = this.querySelector('#orgName');
    const form = this.querySelector('#orgForm');
    
    if (modal) {
      if (title) title.textContent = 'Editar Organización';
      if (nameInput) nameInput.value = org.name;
      if (form) form.reset();
      form.querySelector('#orgName').value = org.name;
      modal.style.display = 'flex';
      this.currentEditOrgId = orgId;
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

        // Crear registro de créditos inicial
        await this.supabase
          .from('organization_credits')
          .insert({
            organization_id: data.id,
            credits_available: 0,
            credits_total: 0
          });

        // Agregar al usuario como miembro con rol owner
        await this.supabase
          .from('organization_members')
          .insert({
            organization_id: data.id,
            user_id: this.userId,
            role: 'owner'
          });
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
