/**
 * BrandsView - Vista de marcas
 * Lista de marcas y detalle individual con tabs (Identity, Visual, Assets, AI Rules)
 * Usa la misma estructura que living-v1.html
 */
class BrandsView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'brands.html';
    this.supabase = null;
    this.userId = null;
    this.userData = null;
    this.brandContainerId = null; // brand_container_id
    this.brandData = null;
    this.brandFiles = [];
    this.products = [];
    this.campaigns = [];
    this.brandId = null; // Para vista de detalle
    this.eventListenersSetup = false;
    this.savingFields = new Set();
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) {
          window.router.navigate('/login', true);
        }
        return;
      }
    }
    if (window.navigation && !window.navigation.initialized) {
      await window.navigation.render();
    }
  }

  async render() {
    await super.render();
    await this.initSupabase();
    
    // Verificar si hay brandId en los parámetros de ruta o en la URL
    if (this.routeParams && this.routeParams.brandId) {
      this.brandId = this.routeParams.brandId;
      await this.renderBrandDetail();
    } else {
      const path = window.location.pathname;
      const match = path.match(/\/brands\/([^\/]+)/);
      if (match) {
        this.brandId = match[1];
        await this.renderBrandDetail();
      } else {
        await this.renderBrandsList();
      }
    }
  }

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

  async renderBrandsList() {
    console.log('Renderizando lista de marcas...');
    
    if (!this.supabase || !this.userId) {
      console.error('❌ Supabase o userId no disponible');
      return;
    }

    try {
      // Cargar datos del usuario
      await this.loadUserData();
      
      // Cargar brand_container del usuario (proyecto)
      await this.loadBrandContainer();
      
      if (this.brandContainerId) {
        // Cargar datos de la marca
        await this.loadBrandData();
        await this.loadBrandFiles();
        await this.loadProducts();
        await this.loadCampaigns();
        
        // Inicializar CampaignsManager si está disponible
        if (window.CampaignsManager) {
          this.campaignsManager = new window.CampaignsManager(
            this.supabase,
            this.userId,
            this.brandContainerId
          );
          await this.campaignsManager.loadCampaigns();
        }
      }
      
      // Renderizar todo
      this.renderAll();
      
      // Configurar event listeners solo una vez
      if (!this.eventListenersSetup) {
        this.setupEventListeners();
        this.setupEditableInputs();
        this.setupMultiselects();
        this.setupFileUpload();
        this.eventListenersSetup = true;
      }
    } catch (error) {
      console.error('❌ Error renderizando lista de marcas:', error);
    }
  }

  async loadUserData() {
    if (!this.supabase || !this.userId) return;

    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', this.userId)
        .single();

      if (error) throw error;
      this.userData = data;
      console.log('✅ Datos de usuario cargados');
    } catch (error) {
      console.error('❌ Error cargando datos de usuario:', error);
    }
  }

  async loadBrandContainer() {
    if (!this.supabase || !this.userId) return;

    try {
      const { data, error } = await this.supabase
        .from('brand_containers')
        .select('*')
        .eq('user_id', this.userId)
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        this.brandContainerId = data.id;
        this.brandContainerData = data;
        console.log('✅ Brand container cargado:', data.id);
      } else {
        console.warn('⚠️ No se encontró brand container para el usuario');
      }
    } catch (error) {
      console.error('❌ Error cargando brand container:', error);
    }
  }

  async loadBrandData() {
    if (!this.supabase || !this.brandContainerId) return;

    try {
      const { data, error } = await this.supabase
        .from('brands')
        .select('*')
        .eq('project_id', this.brandContainerId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      this.brandData = data;
      console.log('✅ Datos de marca cargados');
    } catch (error) {
      console.error('❌ Error cargando datos de marca:', error);
    }
  }

  async loadBrandFiles() {
    if (!this.supabase || !this.brandContainerId) return;

    try {
      const { data, error } = await this.supabase
        .from('brand_assets')
        .select('*')
        .eq('brand_container_id', this.brandContainerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      this.brandFiles = data || [];
      console.log('✅ Archivos de marca cargados:', this.brandFiles.length);
    } catch (error) {
      console.error('❌ Error cargando archivos de marca:', error);
      this.brandFiles = [];
    }
  }

  async loadProducts() {
    if (!this.supabase || !this.brandContainerId) return;

    try {
      const { data: products, error: productsError } = await this.supabase
        .from('products')
        .select('*')
        .eq('brand_container_id', this.brandContainerId)
        .order('created_at', { ascending: false })
        .limit(5); // Solo los primeros 5 para la vista

      if (productsError) throw productsError;

      // Cargar imágenes de cada producto
      if (products && products.length > 0) {
        for (const product of products) {
          const { data: images, error: imagesError } = await this.supabase
            .from('product_images')
            .select('*')
            .eq('product_id', product.id)
            .order('image_order', { ascending: true })
            .limit(1); // Solo la primera imagen

          if (!imagesError && images && images.length > 0) {
            product.main_image = images[0];
          }
        }
      }

      this.products = products || [];
      console.log('✅ Productos cargados:', this.products.length);
    } catch (error) {
      console.error('❌ Error cargando productos:', error);
      this.products = [];
    }
  }

  async loadCampaigns() {
    if (!this.supabase || !this.brandContainerId) return;

    try {
      const { data, error } = await this.supabase
        .from('campaigns')
        .select('*')
        .eq('brand_container_id', this.brandContainerId)
        .order('created_at', { ascending: false })
        .limit(5); // Solo las primeras 5 para la vista

      if (error) throw error;
      this.campaigns = data || [];
      console.log('✅ Campañas cargadas:', this.campaigns.length);
    } catch (error) {
      console.error('❌ Error cargando campañas:', error);
      this.campaigns = [];
    }
  }

  renderAll() {
    this.renderProfileCard();
    this.renderBrandGuidelines();
    this.renderBrandFiles();
    this.renderProducts();
    this.renderCampaigns();
  }

  renderProfileCard() {
    // Logo de marca como foto de perfil
    const profileLogo = document.getElementById('profileBrandLogo');
    const profilePlaceholder = document.getElementById('profilePlaceholder');
    
    if (this.brandContainerData && this.brandContainerData.logo_url) {
      if (profileLogo) {
        profileLogo.src = this.brandContainerData.logo_url + '?t=' + Date.now();
        profileLogo.style.display = 'block';
      }
      if (profilePlaceholder) {
        profilePlaceholder.style.display = 'none';
      }
    } else {
      if (profileLogo) {
        profileLogo.style.display = 'none';
      }
      if (profilePlaceholder) {
        profilePlaceholder.style.display = 'flex';
      }
    }

    // Nombre de la marca
    const profileName = document.getElementById('profileUserName');
    if (profileName && this.brandContainerData) {
      profileName.textContent = this.brandContainerData.nombre_marca || 'Sin nombre de marca';
    }

    // Links sociales
    const socialLinksContainer = document.getElementById('profileSocialLinks');
    if (socialLinksContainer && this.brandContainerData) {
      socialLinksContainer.innerHTML = '';
      
      if (this.brandContainerData.sitio_web) {
        const webLink = document.createElement('a');
        webLink.href = this.brandContainerData.sitio_web;
        webLink.target = '_blank';
        webLink.className = 'profile-social-link';
        webLink.innerHTML = '<i class="fas fa-globe"></i>';
        socialLinksContainer.appendChild(webLink);
      }
      
      if (this.brandContainerData.instagram_url) {
        const igLink = document.createElement('a');
        igLink.href = this.brandContainerData.instagram_url;
        igLink.target = '_blank';
        igLink.className = 'profile-social-link';
        igLink.innerHTML = '<i class="fab fa-instagram"></i>';
        socialLinksContainer.appendChild(igLink);
      }
      
      if (this.brandContainerData.facebook_url) {
        const fbLink = document.createElement('a');
        fbLink.href = this.brandContainerData.facebook_url;
        fbLink.target = '_blank';
        fbLink.className = 'profile-social-link';
        fbLink.innerHTML = '<i class="fab fa-facebook"></i>';
        socialLinksContainer.appendChild(fbLink);
      }
    }

    // Detalles: correo, plan, créditos
    const profileEmail = document.getElementById('profileEmail');
    const profilePlan = document.getElementById('profilePlan');
    const profileCredits = document.getElementById('profileCredits');

    if (profileEmail && this.userData) {
      profileEmail.textContent = this.userData.email || '-';
    }

    if (profilePlan && this.userData) {
      const planNames = {
        'basico': 'Plan Básico',
        'pro': 'Plan Pro',
        'enterprise': 'Plan Enterprise'
      };
      profilePlan.textContent = planNames[this.userData.plan_type] || this.userData.plan_type || 'Plan Básico';
    }

    if (profileCredits && this.userData) {
      const credits = this.userData.credits_available !== null && this.userData.credits_available !== undefined 
        ? this.userData.credits_available 
        : 0;
      profileCredits.textContent = credits.toString();
    }
  }

  renderBrandGuidelines() {
    // Poblar inputs editables
    const tonoVozInput = document.getElementById('tonoVozInput');
    const palabrasUsarInput = document.getElementById('palabrasUsarInput');
    const reglasCreativasInput = document.getElementById('reglasCreativasInput');
    const personalidadMarcaInput = document.getElementById('personalidadMarcaInput');
    const quienesSomosInput = document.getElementById('quienesSomosInput');

    if (tonoVozInput && this.brandData) {
      tonoVozInput.value = this.brandData.tono_voz || '';
    }

    if (palabrasUsarInput && this.brandData) {
      palabrasUsarInput.value = this.brandData.palabras_usar || '';
    }

    if (reglasCreativasInput && this.brandData) {
      reglasCreativasInput.value = this.brandData.reglas_creativas || '';
    }

    if (personalidadMarcaInput && this.brandData) {
      personalidadMarcaInput.value = this.brandData.personalidad_marca || '';
    }

    if (quienesSomosInput && this.brandData) {
      quienesSomosInput.value = this.brandData.quienes_somos || '';
    }
  }

  renderBrandFiles() {
    const filesListEl = document.getElementById('brandFilesList');
    if (!filesListEl) return;

    filesListEl.innerHTML = '';

    if (!this.brandFiles || this.brandFiles.length === 0) {
      filesListEl.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>No hay archivos adjuntados</p>
        </div>
      `;
      return;
    }

    this.brandFiles.forEach(file => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';

      const fileExtension = file.file_name.split('.').pop().toLowerCase();
      const iconMap = {
        'pdf': 'fa-file-pdf',
        'doc': 'fa-file-word',
        'docx': 'fa-file-word',
        'zip': 'fa-file-archive',
        'jpg': 'fa-file-image',
        'jpeg': 'fa-file-image',
        'png': 'fa-file-image'
      };
      const icon = iconMap[fileExtension] || 'fa-file';

      fileItem.innerHTML = `
        <div class="file-info">
          <div class="file-icon">
            <i class="fas ${icon}"></i>
          </div>
          <div class="file-details">
            <p class="file-name">${file.file_name}</p>
            <span class="file-size">${this.formatFileSize(file.file_size)}</span>
          </div>
        </div>
        <a href="${file.file_url}" target="_blank" class="file-link">
          <i class="fas fa-external-link-alt"></i>
          Ver
        </a>
      `;

      filesListEl.appendChild(fileItem);
    });
  }

  renderProducts() {
    const productsListEl = document.getElementById('productsList');
    if (!productsListEl) return;

    productsListEl.innerHTML = '';

    if (!this.products || this.products.length === 0) {
      productsListEl.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-box-open"></i>
          <p>No hay productos registrados</p>
          <a href="/products" class="btn btn-primary" style="margin-top: 1rem;">Gestionar Productos</a>
        </div>
      `;
      return;
    }

    this.products.forEach(product => {
      const productCard = document.createElement('div');
      productCard.className = 'product-card-horizontal';
      
      const imageUrl = product.main_image?.image_url || '';
      
      productCard.innerHTML = `
        <div class="product-image">
          ${imageUrl ? `<img src="${imageUrl}" alt="${product.name}">` : '<i class="fas fa-box"></i>'}
        </div>
        <div class="product-info">
          <h3>${product.name || 'Sin nombre'}</h3>
          <p>${product.description || 'Sin descripción'}</p>
        </div>
        <a href="/products/${product.id}" class="product-link">
          <i class="fas fa-arrow-right"></i>
        </a>
      `;

      productsListEl.appendChild(productCard);
    });
  }

  renderCampaigns() {
    const campaignsListEl = document.getElementById('campaignsList');
    if (!campaignsListEl) return;

    campaignsListEl.innerHTML = '';

    if (!this.campaigns || this.campaigns.length === 0) {
      campaignsListEl.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-megaphone"></i>
          <p>No hay campañas creadas</p>
          <button class="btn btn-primary" style="margin-top: 1rem;" onclick="openCampaignModal()">Crear Campaña</button>
        </div>
      `;
      return;
    }

    this.campaigns.forEach(campaign => {
      const campaignCard = document.createElement('div');
      campaignCard.className = 'campaign-card-horizontal';
      
      campaignCard.innerHTML = `
        <div class="campaign-info">
          <h3>${campaign.name || 'Sin nombre'}</h3>
          <p>${campaign.description || 'Sin descripción'}</p>
        </div>
        <a href="/campaigns/${campaign.id}" class="campaign-link">
          <i class="fas fa-arrow-right"></i>
        </a>
      `;

      campaignsListEl.appendChild(campaignCard);
    });
  }

  setupEditableInputs() {
    // Tono de voz
    const tonoVozInput = document.getElementById('tonoVozInput');
    if (tonoVozInput) {
      tonoVozInput.addEventListener('change', () => {
        this.saveBrandField('tono_voz', tonoVozInput.value);
      });
    }

    // Palabras a usar
    const palabrasUsarInput = document.getElementById('palabrasUsarInput');
    if (palabrasUsarInput) {
      let saveTimeout;
      palabrasUsarInput.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          this.saveBrandField('palabras_usar', palabrasUsarInput.value);
        }, 1000);
      });
      palabrasUsarInput.addEventListener('blur', () => {
        clearTimeout(saveTimeout);
        this.saveBrandField('palabras_usar', palabrasUsarInput.value);
      });
    }

    // Reglas creativas
    const reglasCreativasInput = document.getElementById('reglasCreativasInput');
    if (reglasCreativasInput) {
      let saveTimeout;
      reglasCreativasInput.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          this.saveBrandField('reglas_creativas', reglasCreativasInput.value);
        }, 1000);
      });
      reglasCreativasInput.addEventListener('blur', () => {
        clearTimeout(saveTimeout);
        this.saveBrandField('reglas_creativas', reglasCreativasInput.value);
      });
    }

    // Personalidad de marca
    const personalidadMarcaInput = document.getElementById('personalidadMarcaInput');
    if (personalidadMarcaInput) {
      let saveTimeout;
      personalidadMarcaInput.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          this.saveBrandField('personalidad_marca', personalidadMarcaInput.value);
        }, 1000);
      });
      personalidadMarcaInput.addEventListener('blur', () => {
        clearTimeout(saveTimeout);
        this.saveBrandField('personalidad_marca', personalidadMarcaInput.value);
      });
    }

    // Quiénes somos
    const quienesSomosInput = document.getElementById('quienesSomosInput');
    if (quienesSomosInput) {
      let saveTimeout;
      quienesSomosInput.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          this.saveBrandField('quienes_somos', quienesSomosInput.value);
        }, 1000);
      });
      quienesSomosInput.addEventListener('blur', () => {
        clearTimeout(saveTimeout);
        this.saveBrandField('quienes_somos', quienesSomosInput.value);
      });
    }
  }

  setupMultiselects() {
    // Palabras a evitar
    this.initMultiselect('palabrasEvitar', 'palabrasEvitarInput', () => {
      this.saveBrandField('palabras_evitar', this.getMultiselectValues('palabrasEvitarInput'));
    });

    // Objetivos de marca
    this.initMultiselect('objetivosMarca', 'objetivosMarcaInput', () => {
      this.saveBrandField('objetivos_marca', this.getMultiselectValues('objetivosMarcaInput'));
    });
  }

  initMultiselect(wrapperId, hiddenInputId, onChangeCallback) {
    const wrapper = document.getElementById(wrapperId + 'Wrapper');
    const trigger = document.getElementById(wrapperId + 'Trigger');
    const valueDisplay = document.getElementById(wrapperId + 'Value');
    const dropdown = document.getElementById(wrapperId + 'Dropdown');
    const hiddenInput = document.getElementById(hiddenInputId);
    
    if (!wrapper || !trigger || !valueDisplay || !dropdown || !hiddenInput) return;

    let selectedValues = [];
    const optionLabels = {};

    // Store option labels
    dropdown.querySelectorAll('.multiselect-option').forEach(option => {
      const value = option.dataset.value;
      optionLabels[value] = option.textContent.trim();
    });

    // Load existing values
    if (hiddenInputId === 'palabrasEvitarInput' && this.brandData?.palabras_evitar) {
      selectedValues = Array.isArray(this.brandData.palabras_evitar) 
        ? this.brandData.palabras_evitar 
        : [];
    } else if (hiddenInputId === 'objetivosMarcaInput' && this.brandData?.objetivos_marca) {
      selectedValues = Array.isArray(this.brandData.objetivos_marca) 
        ? this.brandData.objetivos_marca 
        : [];
    }

    // Update UI with existing values
    selectedValues.forEach(value => {
      const option = dropdown.querySelector(`[data-value="${value}"]`);
      if (option) option.classList.add('selected');
    });
    this.updateMultiselectDisplay(wrapperId, selectedValues, optionLabels);
    hiddenInput.value = JSON.stringify(selectedValues);

    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      this.closeAllMultiselects();
      if (!isOpen) {
        dropdown.classList.add('open');
        trigger.classList.add('open');
      }
    });

    // Handle option clicks
    dropdown.querySelectorAll('.multiselect-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = option.dataset.value;
        const index = selectedValues.indexOf(value);
        
        if (index > -1) {
          selectedValues.splice(index, 1);
          option.classList.remove('selected');
        } else {
          selectedValues.push(value);
          option.classList.add('selected');
        }

        this.updateMultiselectDisplay(wrapperId, selectedValues, optionLabels);
        hiddenInput.value = JSON.stringify(selectedValues);
        
        if (onChangeCallback) {
          onChangeCallback();
        }
      });
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        dropdown.classList.remove('open');
        trigger.classList.remove('open');
      }
    });
  }

  updateMultiselectDisplay(wrapperId, selectedValues, optionLabels) {
    const valueDisplay = document.getElementById(wrapperId + 'Value');
    const trigger = document.getElementById(wrapperId + 'Trigger');
    if (!valueDisplay || !trigger) return;

    if (selectedValues.length === 0) {
      valueDisplay.textContent = 'Seleccionar...';
      valueDisplay.classList.remove('has-selection', 'has-tags');
      trigger.classList.remove('has-tags');
      trigger.querySelector('.multiselect-tags')?.remove();
    } else {
      valueDisplay.classList.add('has-selection');
      trigger.classList.add('has-tags');
      
      const existingTags = trigger.querySelector('.multiselect-tags');
      if (existingTags) existingTags.remove();

      const tagsContainer = document.createElement('div');
      tagsContainer.className = 'multiselect-tags';

      selectedValues.forEach(value => {
        const tag = document.createElement('div');
        tag.className = 'multiselect-tag';
        tag.innerHTML = `
          <span>${optionLabels[value] || value}</span>
          <span class="multiselect-tag-remove" data-value="${value}">×</span>
        `;
        tagsContainer.appendChild(tag);

        tag.querySelector('.multiselect-tag-remove').addEventListener('click', (e) => {
          e.stopPropagation();
          const index = selectedValues.indexOf(value);
          if (index > -1) {
            selectedValues.splice(index, 1);
            const option = document.querySelector(`#${wrapperId}Dropdown [data-value="${value}"]`);
            if (option) option.classList.remove('selected');
            this.updateMultiselectDisplay(wrapperId, selectedValues, optionLabels);
            const hiddenInput = document.getElementById(wrapperId + 'Input');
            if (hiddenInput) hiddenInput.value = JSON.stringify(selectedValues);
          }
        });
      });

      valueDisplay.textContent = '';
      valueDisplay.classList.add('has-tags');
      valueDisplay.appendChild(tagsContainer);
    }
  }

  closeAllMultiselects() {
    document.querySelectorAll('.multiselect-dropdown').forEach(dropdown => {
      dropdown.classList.remove('open');
    });
    document.querySelectorAll('.multiselect-trigger').forEach(trigger => {
      trigger.classList.remove('open');
    });
  }

  getMultiselectValues(hiddenInputId) {
    const hiddenInput = document.getElementById(hiddenInputId);
    if (!hiddenInput || !hiddenInput.value) return [];
    try {
      return JSON.parse(hiddenInput.value);
    } catch {
      return [];
    }
  }

  setupFileUpload() {
    const fileUpload = document.getElementById('brandFileUpload');
    if (fileUpload) {
      fileUpload.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        for (const file of files) {
          await this.uploadBrandFile(file);
        }
        
        // Reset input
        fileUpload.value = '';
        
        // Reload files
        await this.loadBrandFiles();
        this.renderBrandFiles();
      });
    }
  }

  async uploadBrandFile(file) {
    if (!this.supabase || !this.brandContainerId) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${this.brandContainerId}/${Date.now()}_${file.name}`;
      const filePath = `brand-files/${fileName}`;

      const { data: uploadData, error: uploadError } = await this.supabase.storage
        .from('brand-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = this.supabase.storage
        .from('brand-files')
        .getPublicUrl(filePath);

      const { error: dbError } = await this.supabase
        .from('brand_assets')
        .insert({
          brand_container_id: this.brandContainerId,
          file_name: file.name,
          file_url: publicUrl,
          file_type: fileExt,
          file_size: file.size
        });

      if (dbError) throw dbError;

      console.log('✅ Archivo subido correctamente:', file.name);
    } catch (error) {
      console.error('❌ Error al subir archivo:', error);
      alert(`Error al subir ${file.name}. Por favor, intenta de nuevo.`);
    }
  }

  async saveBrandField(fieldName, value) {
    if (!this.supabase || !this.brandData || !this.brandContainerId) return;

    const saveKey = `brand_${fieldName}`;
    if (this.savingFields.has(saveKey)) {
      console.log(`⏳ Guardado de ${fieldName} ya en curso, ignorando llamada duplicada`);
      return;
    }

    this.savingFields.add(saveKey);

    try {
      const { error } = await this.supabase
        .from('brands')
        .update({ [fieldName]: value || null })
        .eq('project_id', this.brandContainerId);

      if (error) throw error;

      if (!this.brandData) this.brandData = {};
      this.brandData[fieldName] = value || null;
      console.log(`✅ ${fieldName} actualizado correctamente`);
    } catch (error) {
      console.error(`❌ Error al guardar ${fieldName}:`, error);
      alert(`Error al guardar ${fieldName}. Por favor, intenta de nuevo.`);
    } finally {
      this.savingFields.delete(saveKey);
    }
  }

  setupEventListeners() {
    // Botón crear marca
    const createBrandBtn = document.getElementById('createBrandBtn');
    if (createBrandBtn) {
      createBrandBtn.addEventListener('click', () => {
        // TODO: Implementar modal de creación de marca
        console.log('Crear nueva marca');
      });
    }
  }

  formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  async renderBrandDetail() {
    // TODO: Implementar vista de detalle con tabs
    console.log('Renderizando detalle de marca:', this.brandId);
    
    // Ocultar lista y mostrar detalle
    const listContainer = document.getElementById('brandsListContainer');
    const detailContainer = document.getElementById('brandDetailContainer');
    
    if (listContainer) listContainer.style.display = 'none';
    if (detailContainer) detailContainer.style.display = 'block';
  }
}

window.BrandsView = BrandsView;
