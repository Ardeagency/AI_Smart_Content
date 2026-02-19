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
      const orgIds = this.organizations.map(o => o.id);

      // Créditos por organización (organization_credits)
      const { data: creditsRows } = await this.supabase
        .from('organization_credits')
        .select('organization_id, credits_available, credits_total')
        .in('organization_id', orgIds);
      const creditsByOrg = {};
      (creditsRows || []).forEach(r => { creditsByOrg[r.organization_id] = r; });

      // Marcas por organización (brand_containers: nombre_marca, logo_url — primera marca para logo flotante)
      const { data: containersRows } = await this.supabase
        .from('brand_containers')
        .select('organization_id, nombre_marca, logo_url')
        .in('organization_id', orgIds);
      const marcasByOrg = {};
      const firstBrandByOrg = {};
      (containersRows || []).forEach(r => {
        if (!marcasByOrg[r.organization_id]) marcasByOrg[r.organization_id] = [];
        if (r.nombre_marca) marcasByOrg[r.organization_id].push(r.nombre_marca);
        if (!firstBrandByOrg[r.organization_id]) firstBrandByOrg[r.organization_id] = { nombre_marca: r.nombre_marca, logo_url: r.logo_url || '' };
      });

      // Miembros por organización: user_id (ordenados, para avatares máx 4)
      const { data: membersRows } = await this.supabase
        .from('organization_members')
        .select('organization_id, user_id')
        .in('organization_id', orgIds)
        .order('created_at', { ascending: true });
      const membersByOrg = {};
      orgIds.forEach(id => { membersByOrg[id] = []; });
      (membersRows || []).forEach(r => {
        if (r.user_id) membersByOrg[r.organization_id].push(r.user_id);
      });
      const allMemberIds = [...new Set((membersRows || []).map(m => m.user_id).filter(Boolean))];
      let avatarByUser = {};
      if (allMemberIds.length > 0) {
        const { data: profiles } = await this.supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', allMemberIds);
        (profiles || []).forEach(p => { avatarByUser[p.id] = { avatar_url: '', full_name: p.full_name || '' }; });
      }

      // Plan y costo: owner_user_id → profiles.plan_type y subscriptions (price, currency)
      const ownerIds = [...new Set(this.organizations.map(o => o.owner_user_id).filter(Boolean))];
      let planByUser = {};
      let costByUser = {};
      if (ownerIds.length > 0) {
        const { data: profileRows } = await this.supabase
          .from('profiles')
          .select('id, plan_type')
          .in('id', ownerIds);
        (profileRows || []).forEach(u => { planByUser[u.id] = u.plan_type || '—'; });

        const { data: subRows } = await this.supabase
          .from('subscriptions')
          .select('user_id, price, currency')
          .in('user_id', ownerIds)
          .order('created_at', { ascending: false });
        (subRows || []).forEach(s => {
          if (costByUser[s.user_id] == null) costByUser[s.user_id] = { price: s.price, currency: s.currency || 'USD' };
        });
      }

      // Colores de marca para degradado inferior y enriquecer org
      for (const org of this.organizations) {
        try {
          org.brandColors = await this.getOrganizationBrandColors(org.id);
        } catch (error) {
          console.error(`Error cargando brand colors para org ${org.id}:`, error);
          org.brandColors = [];
        }
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
      }

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
   * Renderizar cards de organizaciones (premium: header 30% gradiente marca, content 70%, créditos + avatares, config solo en hover)
   */
  renderOrganizations() {
    const gridEl = this.querySelector('#organizationsGrid');
    if (!gridEl) return;
    gridEl.innerHTML = this.organizations.map(org => this.renderOrgCard(org)).join('');
    this.organizations.forEach(org => {
      const card = gridEl.querySelector(`[data-org-id="${org.id}"]`);
      if (!card) return;
      const go = () => this.navigateToOrganization(org.id);
      card.addEventListener('click', (e) => {
        if (e.target.closest('.org-card-config-icon')) return;
        go();
      });
      card.addEventListener('keydown', (e) => {
        if (e.target.closest('.org-card-config-icon')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      });
      const configIcon = card.querySelector('.org-card-config-icon');
      if (configIcon) {
        configIcon.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (window.router) {
            window.router.navigate(`/org/${org.id}/organization`);
          } else {
            window.location.href = `/org/${org.id}/organization`;
          }
        });
      }
    });
  }

  /**
   * Card estilo FUNCTIONALITY IN CARDS: estrella, menú, icono tipo, nombre, separador, créditos, tags.
   */
  renderOrgCard(org) {
    const name = this.escapeHtml(org.name || '');
    const credits = org.credits_available != null ? `${org.credits_available}` : '0';
    const logoUrl = (org.firstBrandLogo || '').trim();
    const brandInitial = (org.marcaNames && org.marcaNames[0]) ? org.marcaNames[0].charAt(0).toUpperCase() : 'O';
    const logoHtml = logoUrl
      ? `<img src="${this.escapeHtml(logoUrl)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling&&this.nextElementSibling.classList.add('visible')"><span class="org-card-logo-initial">${brandInitial}</span>`
      : `<span class="org-card-logo-initial visible">${brandInitial}</span>`;
    const planRaw = String(org.planType || '').replace(/_/g, '');
    const planInitial = planRaw ? planRaw.charAt(0).toUpperCase() : 'A';
    const tagHtml = `<span class="org-card-tag">${planInitial}</span>`;
    return `
      <div class="org-card org-card-premium" data-org-id="${org.id}" role="button" tabindex="0" title="Entrar a ${name}">
        <span class="org-card-fav-icon" aria-hidden="true"><i class="far fa-star"></i></span>
        <button type="button" class="org-card-config-icon" aria-label="Configuración" title="Configuración"><i class="fas fa-ellipsis-v"></i></button>
        <div class="org-card-icon-wrap">${logoHtml}</div>
        <h3 class="org-card-org-name">${name}</h3>
        <div class="org-card-separator"></div>
        <div class="org-card-footer">
          <div class="org-card-credits-wrap">Créditos: <span class="org-card-credits-num">${credits}</span></div>
          <div class="org-card-tags">${tagHtml}</div>
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
      window.router.navigate(`/org/${orgId}/historial`);
    }
  }


  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    // Botón nueva organización → redirige a form_org (formulario de registro)
    const createBtn = this.querySelector('#createOrgBtn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        if (window.router) {
          window.router.navigate('/form_org');
        } else {
          window.location.href = '/form_org';
        }
      });
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
