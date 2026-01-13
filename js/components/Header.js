/**
 * Header Component - Componente de header principal
 * Muestra ruta/marca, tokens y avatar del usuario
 */
class Header {
  constructor() {
    this.container = document.getElementById('header-container');
    this.supabase = null;
    this.userData = null;
    this.brandData = null;
    this.initialized = false;
  }

  /**
   * Renderizar el componente de header
   */
  async render(pageTitle = null, brandName = null) {
    if (!this.container) {
      // Crear contenedor si no existe
      this.container = document.createElement('div');
      this.container.id = 'header-container';
      const appContainer = document.getElementById('app-container');
      if (appContainer) {
        appContainer.insertBefore(this.container, appContainer.firstChild);
      }
    }

    // Renderizar HTML del header
    this.container.innerHTML = this.getHeaderHTML(pageTitle, brandName);

    // Inicializar
    await this.loadUserData();
    await this.loadBrandData();
    this.updateHeader();
    this.setupEventListeners();

    this.initialized = true;
    console.log('✅ Header component renderizado');
  }

  /**
   * Obtener HTML del header
   */
  getHeaderHTML(pageTitle = null, brandName = null) {
    const title = pageTitle || this.getPageTitleFromRoute();
    const brand = brandName || '';

    return `
      <header class="main-header">
        <div class="header-content">
          <div class="header-left">
            <div class="header-breadcrumb">
              <span class="header-route">${title}</span>
              ${brand ? `<span class="header-separator">/</span><span class="header-brand">${brand}</span>` : ''}
            </div>
          </div>
          <div class="header-right">
            <div class="header-credits" id="headerCredits">
              <span class="header-credits-value" id="headerCreditsValue">0/0</span>
            </div>
            <div class="header-user-avatar" id="headerUserAvatar">
              <div class="avatar-placeholder" id="avatarPlaceholder">
                <i class="fas fa-user"></i>
              </div>
              <img id="avatarImage" src="" alt="Avatar" style="display: none;">
            </div>
            <button class="hamburger-menu" id="hamburgerMenu">
              <div class="hamburger-line"></div>
              <div class="hamburger-line"></div>
              <div class="hamburger-line"></div>
            </button>
          </div>
        </div>
      </header>
    `;
  }

  /**
   * Obtener título de página desde la ruta actual
   */
  getPageTitleFromRoute() {
    const path = window.location.pathname || '/';
    const routeMap = {
      '/': 'Hogar',
      '/hogar': 'Hogar',
      '/brands': 'Marcas',
      '/products': 'Productos',
      '/campaigns': 'Campañas',
      '/audiences': 'Audiencias',
      '/create': 'Crear Contenido',
      '/content': 'Biblioteca',
      '/settings': 'Ajustes',
      '/living': 'Living',
      '/studio': 'Studio'
    };

    // Buscar ruta exacta
    if (routeMap[path]) {
      return routeMap[path];
    }

    // Buscar rutas dinámicas
    if (path.startsWith('/brands/')) {
      return 'Marcas';
    }
    if (path.startsWith('/products/')) {
      return 'Productos';
    }
    if (path.startsWith('/campaigns/')) {
      return 'Campañas';
    }
    if (path.startsWith('/audiences/')) {
      return 'Audiencias';
    }
    if (path.startsWith('/content/')) {
      return 'Biblioteca';
    }

    return 'AI Smart Content';
  }

  /**
   * Cargar datos del usuario
   */
  async loadUserData() {
    const supabase = await this.getSupabaseClient();
    if (!supabase) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();

        if (data) {
          this.userData = data;
        }
      }
    } catch (error) {
      console.error('Error cargando datos de usuario:', error);
    }
  }

  /**
   * Cargar datos de marca
   */
  async loadBrandData() {
    const supabase = await this.getSupabaseClient();
    if (!supabase || !this.userData) return;

    try {
      // Cargar brand_container del usuario
      const { data: brandContainer } = await supabase
        .from('brand_containers')
        .select('*')
        .eq('user_id', this.userData.id)
        .limit(1)
        .single();

      if (brandContainer) {
        this.brandData = brandContainer;
      }
    } catch (error) {
      console.error('Error cargando datos de marca:', error);
    }
  }

  /**
   * Actualizar header con datos cargados
   */
  updateHeader() {
    // Actualizar créditos
    const creditsValue = document.getElementById('headerCreditsValue');
    if (creditsValue && this.userData) {
      const available = this.userData.credits_available || 0;
      const total = this.userData.credits_total || 0;
      creditsValue.textContent = `${total}/${available}`;
    }

    // Actualizar avatar
    const avatarImage = document.getElementById('avatarImage');
    const avatarPlaceholder = document.getElementById('avatarPlaceholder');

    if (this.userData && this.userData.avatar_url) {
      if (avatarImage) {
        avatarImage.src = this.userData.avatar_url;
        avatarImage.style.display = 'block';
      }
      if (avatarPlaceholder) {
        avatarPlaceholder.style.display = 'none';
      }
    } else {
      if (avatarImage) {
        avatarImage.style.display = 'none';
      }
      if (avatarPlaceholder) {
        avatarPlaceholder.style.display = 'flex';
        // Mostrar iniciales si hay nombre
        if (this.userData && this.userData.full_name) {
          const initials = this.getInitials(this.userData.full_name);
          avatarPlaceholder.textContent = initials;
        }
      }
    }

    // Actualizar marca en el breadcrumb si hay brandData
    if (this.brandData && this.brandData.nombre_marca) {
      const brandElement = document.querySelector('.header-brand');
      if (brandElement) {
        brandElement.textContent = this.brandData.nombre_marca;
      } else {
        // Agregar marca si no existe
        const routeElement = document.querySelector('.header-route');
        if (routeElement) {
          const separator = document.createElement('span');
          separator.className = 'header-separator';
          separator.textContent = '/';
          const brand = document.createElement('span');
          brand.className = 'header-brand';
          brand.textContent = this.brandData.nombre_marca;
          routeElement.parentElement.appendChild(separator);
          routeElement.parentElement.appendChild(brand);
        }
      }
    }
  }

  /**
   * Obtener iniciales del nombre
   */
  getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    if (hamburgerMenu && window.navigation) {
      hamburgerMenu.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          window.navigation.toggleNavigation();
        }
      });
    }
  }

  /**
   * Obtener cliente de Supabase
   */
  async getSupabaseClient() {
    if (window.supabaseService) {
      return await window.supabaseService.getClient();
    }
    
    if (typeof window.appLoader !== 'undefined' && window.appLoader.waitFor) {
      try {
        return await window.appLoader.waitFor();
      } catch (error) {
        return null;
      }
    }
    return window.supabase || null;
  }

  /**
   * Actualizar título y marca dinámicamente
   */
  updateTitle(pageTitle, brandName = null) {
    const routeElement = document.querySelector('.header-route');
    if (routeElement) {
      routeElement.textContent = pageTitle;
    }

    if (brandName) {
      let brandElement = document.querySelector('.header-brand');
      if (!brandElement) {
        const routeEl = document.querySelector('.header-route');
        if (routeEl) {
          const separator = document.createElement('span');
          separator.className = 'header-separator';
          separator.textContent = '/';
          brandElement = document.createElement('span');
          brandElement.className = 'header-brand';
          routeEl.parentElement.appendChild(separator);
          routeEl.parentElement.appendChild(brandElement);
        }
      }
      if (brandElement) {
        brandElement.textContent = brandName;
      }
    }
  }
}

// Crear instancia global
window.header = new Header();

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Header;
}
