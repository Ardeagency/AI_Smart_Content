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
      // Ocultar estados iniciales
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
          // No navegar si se hace clic en el botón de favorito o editar
          if (!e.target.closest('.org-favorite-btn') && !e.target.closest('.org-edit-btn')) {
            this.navigateToOrganization(org.id);
          }
        });

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
   * Renderizar card de organización
   */
  renderOrganizationCard(org) {
    const stats = org.stats || {};
    const logoInitial = org.name ? org.name.charAt(0).toUpperCase() : 'O';
    
    return `
      <div class="org-card" data-org-id="${org.id}">
        <div class="org-card-header">
          <div class="org-logo">
            ${logoInitial}
          </div>
          <button class="org-favorite-btn" data-org-id="${org.id}" title="Marcar como favorito">
            <i class="far fa-star"></i>
          </button>
        </div>
        
        <div class="org-card-body">
          <h3 class="org-name">${this.escapeHtml(org.name)}</h3>
          <div class="org-role-badge ${org.role}">
            ${org.role === 'owner' ? 'Propietario' : 'Colaborador'}
          </div>
        </div>
        
        <div class="org-card-stats">
          <div class="org-stat-item">
            <div class="org-stat-icon">
              <i class="fas fa-coins"></i>
            </div>
            <div class="org-stat-content">
              <div class="org-stat-value">${stats.credits_available || 0}</div>
              <div class="org-stat-label">Tokens</div>
            </div>
          </div>
          
          <div class="org-stat-item">
            <div class="org-stat-icon">
              <i class="fas fa-tags"></i>
            </div>
            <div class="org-stat-content">
              <div class="org-stat-value">${stats.brands_count || 0}</div>
              <div class="org-stat-label">Marcas</div>
            </div>
          </div>
          
          <div class="org-stat-item">
            <div class="org-stat-icon">
              <i class="fas fa-box"></i>
            </div>
            <div class="org-stat-content">
              <div class="org-stat-value">${stats.products_count || 0}</div>
              <div class="org-stat-label">Productos</div>
            </div>
          </div>
          
          <div class="org-stat-item">
            <div class="org-stat-icon">
              <i class="fas fa-bullhorn"></i>
            </div>
            <div class="org-stat-content">
              <div class="org-stat-value">${stats.campaigns_count || 0}</div>
              <div class="org-stat-label">Campañas</div>
            </div>
          </div>
        </div>
        
        <div class="org-card-footer">
          <div class="org-members">
            <i class="fas fa-users"></i>
            <span>${stats.members_count || 0} colaborador${stats.members_count !== 1 ? 'es' : ''}</span>
          </div>
          <div class="org-actions">
            <button class="btn btn-secondary btn-sm org-edit-btn" data-org-id="${org.id}">
              <i class="fas fa-edit"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Navegar a una organización (ir a living con esa organización seleccionada)
   */
  navigateToOrganization(orgId) {
    // Guardar organización seleccionada en el estado
    if (window.appState) {
      window.appState.set('selectedOrganizationId', orgId, true);
    }
    
    // Navegar a living
    if (window.router) {
      window.router.navigate('/living');
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
   * Limpiar al salir de la vista
   */
  async destroy() {
    this.organizations = [];
    this.supabase = null;
    this.userId = null;
    await super.destroy();
  }
}

// Hacer disponible globalmente
window.HogarView = HogarView;
