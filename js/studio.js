class StudioManager {
    constructor() {
        // Configuración básica
        this.userId = null;
        this.currentProjectId = null;
        this.supabase = null;
        
        // Datos del usuario
        this.brands = [];
        this.products = [];
        this.productImages = [];
        this.offers = [];
        this.audience = [];
        this.ugc = [];
        this.aesthetics = [];
        this.scenarios = [];
        this.brandGuidelines = [];
        this.compliance = [];
        this.distribution = [];
        
        // Configuración de cards flotantes
        this.activeCard = null;
        
        // Configuración del sujeto
        this.subjectConfig = {};
        
        this.init();
    }

    async init() {
        try {
            // Verificar acceso antes de continuar
            if (typeof verifyUserAccess === 'function') {
                const hasAccess = await verifyUserAccess();
                if (!hasAccess) {
                    return; // La función verifyUserAccess ya redirige
                }
            }

            // Inicializar Supabase
            await this.initSupabase();
            
            // Cargar datos de usuario y proyecto
            if (this.supabase && this.userId) {
                await this.loadUserAndProjectData();
                this.updateNavHeader();
            }

            this.setupEventListeners();
            // Lucide removido - ya no es necesario
        } catch (error) {
            console.error('Error initializing Studio:', error);
            this.showNotification('Error inicializando Studio', 'error');
        }
    }

    async initSupabase() {
        try {
            if (typeof waitForSupabase === 'function') {
                this.supabase = await waitForSupabase(15000);
            } else if (window.supabaseClient) {
                this.supabase = window.supabaseClient;
            } else if (typeof initSupabase === 'function') {
                this.supabase = await initSupabase();
            }

            if (this.supabase) {
                const { data: { user }, error: userError } = await this.supabase.auth.getUser();
                if (user && !userError) {
                    this.userId = user.id;
                }
            }
        } catch (error) {
            console.error('Error inicializando Supabase:', error);
        }
    }

    async loadUserAndProjectData() {
        try {
            // Cargar datos del usuario
            if (this.userId) {
                const { data: userData, error: userError } = await this.supabase
                    .from('users')
                    .select('*')
                    .eq('id', this.userId)
                    .single();

                if (!userError && userData) {
                    this.userData = userData;
                }

                // Cargar proyecto
                const { data: projectData, error: projectError } = await this.supabase
                    .from('projects')
                    .select('id, user_id, nombre_marca, logo_url, sitio_web, instagram_url, tiktok_url, facebook_url, idiomas_contenido, mercado_objetivo, created_at, updated_at')
                    .eq('user_id', this.userId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                console.log('📦 Cargando proyecto para user_id:', this.userId);
                console.log('📦 Resultado de query:', { projectData, projectError });
                
                if (projectError) {
                    console.error('❌ Error cargando proyecto:', projectError);
                } else if (projectData) {
                    console.log('✅ Proyecto cargado:', {
                        id: projectData.id,
                        nombre_marca: projectData.nombre_marca,
                        logo_url: projectData.logo_url,
                        hasLogo: !!projectData.logo_url
                    });
                    this.projectData = projectData;
                    this.currentProjectId = projectData.id;
                } else {
                    console.warn('⚠️ No se encontró proyecto para el usuario');
                }
            }
        } catch (error) {
            console.error('Error cargando datos de usuario y proyecto:', error);
        }
    }

    updateNavHeader() {
        const navBrandLogo = document.getElementById('navBrandLogo');
        const navBrandInitials = document.getElementById('navBrandInitials');
        const navBrandName = document.getElementById('navBrandName');
        const navPlanName = document.getElementById('navPlanName');
        const creditsCount = document.getElementById('creditsCount');

        // Actualizar logo de marca
        if (this.projectData && this.projectData.logo_url) {
            if (navBrandLogo) {
                navBrandLogo.src = this.projectData.logo_url + '?t=' + Date.now();
                navBrandLogo.style.display = 'block';
            }
            if (navBrandInitials) {
                navBrandInitials.style.display = 'none';
            }
        } else if (this.projectData && this.projectData.nombre_marca) {
            // Usar iniciales del nombre de marca
            const initials = this.projectData.nombre_marca
                .split(' ')
                .map(word => word.charAt(0))
                .join('')
                .toUpperCase()
                .substring(0, 2);
            if (navBrandInitials) {
                navBrandInitials.textContent = initials;
                navBrandInitials.style.display = 'block';
            }
            if (navBrandLogo) {
                navBrandLogo.style.display = 'none';
            }
        }

        // Actualizar nombre de marca
        if (navBrandName && this.projectData) {
            navBrandName.textContent = this.projectData.nombre_marca || 'Sin marca';
        }

        // Actualizar plan
        if (navPlanName && this.userData) {
            const planNames = {
                'basico': 'Plan Básico',
                'pro': 'Plan Pro',
                'enterprise': 'Plan Enterprise'
            };
            navPlanName.textContent = planNames[this.userData.plan_type] || 'Plan Básico';
        }

        // Actualizar créditos
        if (creditsCount && this.userData) {
            creditsCount.textContent = this.userData.credits_available || 0;
        }

        // Actualizar créditos en el header (formato: total/restantes)
        const headerCreditsValue = document.getElementById('headerCreditsValue');
        if (headerCreditsValue && this.userData) {
            const total = this.userData.credits_total || 0;
            const restantes = this.userData.credits_available || 0;
            headerCreditsValue.textContent = `${total}/${restantes}`;
        }

        // Actualizar nombre de marca en el header principal
        const brandNameHeader = document.getElementById('brandNameHeader');
        if (brandNameHeader && this.projectData && this.projectData.nombre_marca) {
            brandNameHeader.textContent = this.projectData.nombre_marca;
        } else if (brandNameHeader) {
            brandNameHeader.textContent = 'Sin marca';
        }
    }

    /* =======================================
       Inicialización
       ======================================= */

    async waitForSupabase() {
        // Supabase desactivado
    }

    async checkAuthentication() {
        // Supabase desactivado
    }

    setupSupabase() {
        // Supabase desactivado
    }

    async loadUserData() {
        // Supabase desactivado - inicializar sin datos
        try {
            this.initializeSidebarFields();
            await Promise.allSettled([
                this.loadBrands(),
                this.loadProducts(),
                this.loadOffers(),
                this.loadAudiences()
            ]);
            this.prePopulateConfigurations();
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    // =======================================
    // Funciones de carga de datos
    // =======================================

    async loadBrands() {
        // Supabase desactivado - datos vacíos
        this.brands = [];
        this.updateBrandSelector();
    }

    async loadProducts() {
        // Supabase desactivado - datos vacíos
        this.products = [];
        this.updateProductSelector();
    }

    async loadOffers() {
        // Supabase desactivado - datos vacíos
        this.offers = [];
        this.updateOfferSelector();
    }

    async loadAudiences() {
        // Supabase desactivado - datos vacíos
        this.audience = [];
        this.updateAudienceSelector();
    }


    // =======================================
    // Funciones de UI (mantener las existentes)
    // =======================================

    showLoading(message) {
        // NO modificar el canvas-area directamente - usar CanvasManager
        console.log('📢 showLoading llamado (ignorado, usar CanvasManager.showLoadingAnimation)');
        if (window.canvasManager) {
            window.canvasManager.showLoadingAnimation();
        }
    }

    showNotification(message, type = 'info') {
        // Implementar notificaciones
        console.log(`[${type.toUpperCase()}] ${message}`);
    }




    initializeSidebarFields() {
        console.log('=== INICIALIZANDO CAMPOS DEL SIDEBAR ===');
        
        // Inicializar información de marca
        const brandInfoContainer = document.getElementById('brand-info');
        if (brandInfoContainer) {
            brandInfoContainer.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Estado:</span>
                    <span class="info-value">Selecciona una marca</span>
                </div>
            `;
        }
        
        // Inicializar información de producto
        const productInfoContainer = document.getElementById('product-info');
        if (productInfoContainer) {
            productInfoContainer.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Estado:</span>
                    <span class="info-value">Selecciona un producto</span>
                </div>
            `;
        }
        
        // Inicializar información de oferta
        this.clearOfferInfo();
        
        // Inicializar información de audiencia
        this.clearAudienceInfo();
        
        // Ocultar galería de imágenes inicialmente
        this.hideImageGallery();
        
        console.log('Campos del sidebar inicializados correctamente');
    }

    // Función para actualizar el selector de marcas
    updateBrandSelector() {
        const brandSelector = document.getElementById('brand-selector');
        if (!brandSelector) return;

        // Limpiar opciones existentes
        brandSelector.innerHTML = '<option value="">Seleccionar marca...</option>';

        // Agregar marcas desde Supabase
        this.brands.forEach(brand => {
            const option = document.createElement('option');
            option.value = brand.id;
            option.textContent = brand.projects?.name || `Marca ${brand.id}`;
            brandSelector.appendChild(option);
        });

        console.log('Selector de marcas actualizado:', this.brands.length, 'marcas');
    }

    // Función para actualizar el selector de productos (filtrado por marca)
    updateProductSelector(selectedBrandId = null) {
        const productSelector = document.getElementById('product-selector');
        if (!productSelector) return;

        // Limpiar opciones existentes
        productSelector.innerHTML = '<option value="">Seleccionar producto...</option>';

        // Si no hay marca seleccionada, limpiar productos pero mantener el selector visible
        if (!selectedBrandId) {
            console.log('No hay marca seleccionada, limpiando productos');
            this.hideImageGallery();
            return;
        }

        // Filtrar productos por project_id (selectedBrandId es el project_id)
        const filteredProducts = this.products.filter(product => {
            return product.project_id === selectedBrandId;
        });

            console.log('Filtrando productos:', {
                selectedBrandId,
            totalProducts: this.products.length,
            filteredProducts: filteredProducts.length
        });

        // Agregar productos filtrados
        filteredProducts.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            // Usar nombre_producto según el schema
            option.textContent = product.nombre_producto || `Producto ${product.id}`;
            productSelector.appendChild(option);
        });

        console.log('Selector de productos actualizado:', filteredProducts.length, 'productos para marca', selectedBrandId);
    }

    // Función para actualizar el selector de ofertas
    updateOfferSelector(selectedBrandId = null) {
        const offerSelector = document.getElementById('offer-selector');
        if (!offerSelector) return;

        // Limpiar opciones existentes
        offerSelector.innerHTML = '<option value="">Seleccionar oferta...</option>';

        // Si no hay marca seleccionada, limpiar ofertas
        if (!selectedBrandId) {
            console.log('No hay marca seleccionada, limpiando ofertas');
            return;
        }

        // Agregar ofertas disponibles (campaigns)
        this.offers.forEach(offer => {
            const option = document.createElement('option');
            // Usar objetivo_principal como nombre principal, luego oferta_desc
            option.value = offer.id;
            option.textContent = offer.objetivo_principal || offer.oferta_desc || `Oferta ${offer.id}`;
            offerSelector.appendChild(option);
        });

        console.log('Selector de ofertas actualizado:', this.offers.length, 'ofertas');
    }

    // Función para actualizar el selector de audiencias
    updateAudienceSelector() {
        const audienceSelector = document.getElementById('audience-selector');
        if (!audienceSelector) return;

        // Limpiar opciones existentes
        audienceSelector.innerHTML = '<option value="">Seleccionar audiencia...</option>';

        // Agregar audiencias disponibles
        this.audience.forEach(audience => {
            const option = document.createElement('option');
            option.value = audience.id;
            option.textContent = audience.buyer_persona?.name || `Audiencia ${audience.id}`;
            audienceSelector.appendChild(option);
        });

        console.log('Selector de audiencias actualizado:', this.audience.length, 'audiencias');
    }

    // Función para manejar la selección de marca desde el dropdown
    async selectBrandFromDropdown(brandId) {
        console.log('=== MARCA SELECCIONADA ===');
        console.log('ID de marca:', brandId);
        
        if (!brandId || !this.supabase) {
            console.error('❌ No hay brandId o supabase disponible');
            return;
        }
        
        try {
            // 1. Cargar información básica de la marca (brands table)
            console.log('📋 Cargando información básica de la marca...');
            const { data: brandData, error: brandError } = await this.supabase
                .from('brands')
                .select('*')
                .eq('project_id', brandId)
                .maybeSingle();
            
            if (brandError) {
                console.error('❌ Error cargando información de marca:', brandError);
            } else if (brandData) {
                console.log('✅ Información de marca cargada:', brandData);
                this.updateBrandInfo(brandData);
            } else {
                console.log('ℹ️ No hay información de marca configurada');
                this.clearBrandInfo();
            }
            
            // 2. Cargar productos de la marca
            console.log('📦 Cargando productos de la marca...');
            const { data: products, error: productsError } = await this.supabase
                .from('products')
                .select('*')
                .eq('project_id', brandId)
                .order('created_at', { ascending: false });
            
            if (productsError) {
                console.error('❌ Error cargando productos:', productsError);
                this.products = [];
            } else {
                console.log(`✅ ${products?.length || 0} producto(s) encontrado(s)`);
                this.products = products || [];
                
                // Poblar selector de productos
                if (typeof populateProductSelector === 'function') {
                    populateProductSelector(this.products);
                } else {
        this.updateProductSelector(brandId);
                }
            }
            
            // 3. Cargar ofertas/campañas de la marca
            console.log('🎁 Cargando ofertas de la marca...');
            const { data: campaigns, error: campaignsError } = await this.supabase
                .from('campaigns')
                .select('*')
                .eq('project_id', brandId)
                .order('created_at', { ascending: false });
            
            if (campaignsError) {
                console.error('❌ Error cargando ofertas:', campaignsError);
                this.offers = [];
            } else {
                console.log(`✅ ${campaigns?.length || 0} oferta(s) encontrada(s)`);
                this.offers = campaigns || [];
                
                // Poblar selector de ofertas
                if (typeof populateOfferSelector === 'function') {
                    populateOfferSelector(this.offers);
                } else {
                    this.updateOfferSelector(brandId);
                }
            }
        
        // Limpiar selección de producto cuando cambia la marca
        this.clearProductSelection();
        
            console.log('✅ Datos de marca cargados completamente');
        } catch (error) {
            console.error('❌ Error en selectBrandFromDropdown:', error);
        }
    }


    // Función para mostrar/ocultar galería de imágenes
    showImageGallery() {
        const imageGallery = document.getElementById('product-image-gallery');
        if (imageGallery) {
            imageGallery.style.display = 'block';
            console.log('Galería de imágenes mostrada');
        }
    }

    hideImageGallery() {
        const imageGallery = document.getElementById('product-image-gallery');
        if (imageGallery) {
            imageGallery.style.display = 'none';
            console.log('Galería de imágenes ocultada');
        }
    }

    // Función para limpiar selección de producto
    clearProductSelection() {
        const productSelector = document.getElementById('product-selector');
        if (productSelector) {
            productSelector.value = '';
        }
        
        // Limpiar información del producto en el acordeón
        const productInfoContainer = document.getElementById('product-info');
        if (productInfoContainer) {
            productInfoContainer.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Estado:</span>
                    <span class="info-value">Selecciona un producto</span>
                </div>
            `;
        }
        
        // Ocultar galería de imágenes
        this.hideImageGallery();
    }

    // Función para actualizar la información de marca en el acordeón
    updateBrandInfo(brandData) {
        console.log('📝 Actualizando información de marca:', brandData);
        
        const brandInfoContainer = document.getElementById('brand-info');
        if (!brandInfoContainer) {
            console.error('❌ No se encontró el contenedor brand-info');
            return;
        }
        
        // Ocultar indicador de carga si existe
        const loadingIndicator = brandInfoContainer.querySelector('.loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
        
        const brandTone = document.getElementById('brand-tone');
        const brandKeywordsYes = document.getElementById('brand-keywords-yes');
        const brandKeywordsNo = document.getElementById('brand-keywords-no');
        const brandDosDonts = document.getElementById('brand-dos-donts');
        
        // Asegurar que los elementos estén visibles
        if (brandInfoContainer.style.display === 'none') {
            brandInfoContainer.style.display = 'block';
        }
        
        // Actualizar Tono de Voz
        if (brandTone) {
            const tonoVoz = brandData.tono_voz || 'No configurado';
            brandTone.textContent = typeof tonoVoz === 'string' ? tonoVoz : (tonoVoz?.value || 'No configurado');
            console.log('✅ Tono de voz actualizado:', brandTone.textContent);
        } else {
            console.warn('⚠️ No se encontró brand-tone');
        }
        
        // Actualizar Palabras Clave (Sí)
        if (brandKeywordsYes) {
            const palabrasUsar = brandData.palabras_usar || '';
            if (palabrasUsar) {
                brandKeywordsYes.textContent = palabrasUsar;
            } else {
                brandKeywordsYes.innerHTML = '<span class="empty">No configurado</span>';
            }
            console.log('✅ Palabras clave (Sí) actualizadas:', brandKeywordsYes.textContent);
        } else {
            console.warn('⚠️ No se encontró brand-keywords-yes');
        }
        
        // Actualizar Palabras Clave (No)
        if (brandKeywordsNo) {
            const palabrasEvitar = brandData.palabras_evitar || [];
            if (Array.isArray(palabrasEvitar) && palabrasEvitar.length > 0) {
                brandKeywordsNo.textContent = palabrasEvitar.join(', ');
            } else if (typeof palabrasEvitar === 'string' && palabrasEvitar) {
                brandKeywordsNo.textContent = palabrasEvitar;
            } else {
                brandKeywordsNo.innerHTML = '<span class="empty">No configurado</span>';
            }
            console.log('✅ Palabras clave (No) actualizadas:', brandKeywordsNo.textContent);
        } else {
            console.warn('⚠️ No se encontró brand-keywords-no');
        }
        
        // Actualizar Dos y Don'ts
        if (brandDosDonts) {
            const reglasCreativas = brandData.reglas_creativas || '';
            if (reglasCreativas) {
                brandDosDonts.textContent = reglasCreativas;
            } else {
                brandDosDonts.innerHTML = '<span class="empty">No configurado</span>';
            }
            console.log('✅ Dos y Don\'ts actualizados:', brandDosDonts.textContent);
        } else {
            console.warn('⚠️ No se encontró brand-dos-donts');
        }
        
        console.log('✅ Información de marca actualizada completamente');
    }
    
    clearBrandInfo() {
        const brandTone = document.getElementById('brand-tone');
        const brandKeywordsYes = document.getElementById('brand-keywords-yes');
        const brandKeywordsNo = document.getElementById('brand-keywords-no');
        const brandDosDonts = document.getElementById('brand-dos-donts');
        
        if (brandTone) brandTone.textContent = 'No seleccionado';
        if (brandKeywordsYes) brandKeywordsYes.innerHTML = '<span class="empty">No configurado</span>';
        if (brandKeywordsNo) brandKeywordsNo.innerHTML = '<span class="empty">No configurado</span>';
        if (brandDosDonts) brandDosDonts.innerHTML = '<span class="empty">No configurado</span>';
    }

    // Función para actualizar la información de producto en el acordeón
    updateProductInfo(productData) {
        console.log('📝 Actualizando información de producto:', productData);
        
        const productInfoContainer = document.getElementById('product-info');
        if (!productInfoContainer) {
            console.error('❌ No se encontró el contenedor product-info');
            return;
        }
        
        // Formatear precio según schema.sql
        const precio = productData.precio_producto;
        const moneda = productData.moneda || 'USD';
        const priceDisplay = precio && precio > 0 ? 
            `${moneda} $${parseFloat(precio).toFixed(2)}` : 
            'No disponible';
        
        // Formatear beneficios (beneficio_1, beneficio_2, beneficio_3)
        const beneficios = [];
        if (productData.beneficio_1) beneficios.push(productData.beneficio_1);
        if (productData.beneficio_2) beneficios.push(productData.beneficio_2);
        if (productData.beneficio_3) beneficios.push(productData.beneficio_3);
        const benefitsDisplay = beneficios.length > 0 ? beneficios.join(', ') : 'No disponible';
        
        // Formatear ingredientes
        const ingredientsDisplay = productData.ingredientes || 'No disponible';
        
        // Actualizar el contenido del contenedor según schema.sql
        productInfoContainer.innerHTML = `
            <div class="info-item">
                <span class="info-label">NOMBRE:</span>
                <span class="info-value">${productData.nombre_producto || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">TIPO DE PRODUCTO:</span>
                <span class="info-value">${productData.tipo_producto || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">DESCRIPCIÓN:</span>
                <span class="info-value long-text">${productData.descripcion_producto || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">PRECIO:</span>
                <span class="info-value">${priceDisplay}</span>
            </div>
            ${beneficios.length > 0 ? `
            <div class="info-item">
                <span class="info-label">BENEFICIOS:</span>
                <span class="info-value">${benefitsDisplay}</span>
            </div>
            ` : ''}
            ${productData.ingredientes ? `
            <div class="info-item">
                <span class="info-label">INGREDIENTES:</span>
                <span class="info-value long-text">${ingredientsDisplay}</span>
            </div>
            ` : ''}
            ${productData.diferenciacion ? `
            <div class="info-item">
                <span class="info-label">DIFERENCIACIÓN:</span>
                <span class="info-value long-text">${productData.diferenciacion}</span>
            </div>
            ` : ''}
            ${productData.modo_uso ? `
            <div class="info-item">
                <span class="info-label">MODO DE USO:</span>
                <span class="info-value long-text">${productData.modo_uso}</span>
            </div>
            ` : ''}
        `;
        
        console.log('Información de producto actualizada correctamente');
    }

    // Función para actualizar la información de oferta en el acordeón
    updateOfferInfo(offerData) {
        console.log('Actualizando información de oferta:', offerData);
        
        const offerInfoContainer = document.getElementById('offer-info');
        if (!offerInfoContainer) {
            console.error('No se encontró el contenedor offer-info');
            return;
        }
        
        // Actualizar el contenido del contenedor
        offerInfoContainer.innerHTML = `
            <div class="info-item">
                <span class="info-label">Objetivo Principal:</span>
                <span class="info-value">${offerData.main_objective || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Descripción:</span>
                <span class="info-value long-text">${offerData.offer_desc || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Call to Action:</span>
                <span class="info-value">${offerData.cta || 'No disponible'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">URL:</span>
                <span class="info-value">
                    ${offerData.cta_url ? `<a href="${offerData.cta_url}" target="_blank" class="url-link">${offerData.cta_url}</a>` : 'No disponible'}
                </span>
            </div>
            <div class="info-item">
                <span class="info-label">Válido hasta:</span>
                <span class="info-value date">${offerData.offer_valid_until || 'No disponible'}</span>
            </div>
            ${offerData.kpis && offerData.kpis.length > 0 ? `
            <div class="info-item">
                <span class="info-label">KPIs:</span>
                <span class="info-value array">
                    ${offerData.kpis.map(kpi => `<span class="tag">${kpi}</span>`).join('')}
                </span>
            </div>
            ` : ''}
        `;
        
        console.log('Información de oferta actualizada correctamente');
    }

    // Función para actualizar la información de audiencia en el acordeón
    updateAudienceInfo(audienceData) {
        console.log('Actualizando información de audiencia:', audienceData);
        
        const audienceInfoContainer = document.getElementById('audience-info');
        if (!audienceInfoContainer) {
            console.error('No se encontró el contenedor audience-info');
            return;
        }
        
        // Actualizar el contenido del contenedor
        audienceInfoContainer.innerHTML = `
            <div class="info-item">
                <span class="info-label">Persona de Compra:</span>
                <span class="info-value">${audienceData.buyer_persona?.name || 'No disponible'}</span>
            </div>
            ${audienceData.interests && audienceData.interests.length > 0 ? `
            <div class="info-item">
                <span class="info-label">Intereses:</span>
                <span class="info-value array">
                    ${audienceData.interests.map(interest => `<span class="tag">${interest}</span>`).join('')}
                </span>
            </div>
            ` : ''}
            ${audienceData.pains && audienceData.pains.length > 0 ? `
            <div class="info-item">
                <span class="info-label">Dolores:</span>
                <span class="info-value array">
                    ${audienceData.pains.map(pain => `<span class="tag">${pain}</span>`).join('')}
                </span>
            </div>
            ` : ''}
            ${audienceData.contexts && audienceData.contexts.length > 0 ? `
            <div class="info-item">
                <span class="info-label">Contextos:</span>
                <span class="info-value array">
                    ${audienceData.contexts.map(context => `<span class="tag">${context}</span>`).join('')}
                </span>
            </div>
            ` : ''}
            ${audienceData.language_codes && audienceData.language_codes.length > 0 ? `
            <div class="info-item">
                <span class="info-label">Idiomas:</span>
                <span class="info-value array">
                    ${audienceData.language_codes.map(lang => `<span class="tag">${lang}</span>`).join('')}
                </span>
            </div>
            ` : ''}
        `;
        
        console.log('Información de audiencia actualizada correctamente');
    }

    // Función para limpiar información de oferta
    clearOfferInfo() {
        const offerInfoContainer = document.getElementById('offer-info');
        if (offerInfoContainer) {
            offerInfoContainer.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Estado:</span>
                    <span class="info-value">No seleccionado</span>
                </div>
            `;
        }
    }

    // Función para limpiar información de audiencia
    clearAudienceInfo() {
        const audienceInfoContainer = document.getElementById('audience-info');
        if (audienceInfoContainer) {
            audienceInfoContainer.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Estado:</span>
                    <span class="info-value">No seleccionado</span>
                </div>
            `;
        }
    }

    prePopulateConfigurations() {
        // Implementar pre-población de configuraciones
    }

    setupEventListeners() {
        // Implementar event listeners
    }

    // =======================================
    // Funciones de navegación (mantener las existentes)
    // =======================================

    showSidebarSection(sectionNumber) {
        // Implementar navegación del sidebar
    }

    // =======================================
    // Funciones de logout (mantener las existentes)
    // =======================================

    logout() {
        window.location.href = '/login.html';
    }

    /* =======================================
       FUNCIONES DE IMÁGENES DE PRODUCTO DINÁMICAS
       ======================================= */

    // Función para cargar imágenes de producto desde Supabase
    async loadProductImages(productId = null) {
        console.log('🖼️ loadProductImages llamada con productId:', productId);
        try {
            console.log('🔍 Estado de Supabase:', {
                supabase: !!this.supabase,
                userId: this.userId,
                productId: productId
            });
            
            if (!this.supabase || !this.userId) {
                console.log('Sin autenticación: no se pueden cargar imágenes');
                this.hideImageGallery();
                return;
            }

            // Si no hay productId, no cargar imágenes y ocultar galería
            if (!productId) {
                console.log('No hay producto seleccionado, ocultando galería de imágenes');
                this.hideImageGallery();
                return;
            }

                // Buscar el producto seleccionado para obtener su project_id
                const selectedProduct = this.products.find(p => p.id === productId);
            if (!selectedProduct || !selectedProduct.project_id) {
                    console.log('Producto no encontrado o sin project_id:', productId);
                this.productImages = [];
                this.renderProductImages();
                this.hideImageGallery();
                return;
            }

            console.log('📸 Cargando imágenes del producto desde product_images...');

            // Usar tabla product_images según schema.sql
            const { data: images, error: imagesError } = await this.supabase
                .from('product_images')
                .select('*')
                .eq('product_id', productId)
                .order('image_order', { ascending: true });

            if (imagesError) {
                console.error('❌ Error cargando imágenes de producto:', imagesError);
                this.productImages = [];
                this.renderProductImages();
                this.hideImageGallery();
                return;
            }

            console.log(`✅ ${images?.length || 0} imagen(es) encontrada(s) para el producto`);
            
            this.productImages = images || [];
            this.renderProductImages();
            
            // Mostrar galería de imágenes si hay imágenes disponibles
            if (this.productImages.length > 0) {
                this.showImageGallery();
            } else {
                this.hideImageGallery();
            }

        } catch (error) {
            console.error('Error cargando imágenes de producto:', error);
            this.showNotification('Error cargando imágenes de producto', 'error');
        }
    }


    // Función para renderizar las imágenes de producto (solo galería)
    renderProductImages() {
        console.log('🎨 Renderizando imágenes de producto...', this.productImages.length);
        
        try {
        const container = document.getElementById('dynamic-product-images');
        if (!container) {
            console.error('❌ No se encontró el contenedor dynamic-product-images');
            return;
        }

            if (!this.productImages || this.productImages.length === 0) {
            container.innerHTML = `
                <div class="loading-placeholder">
                    <span>No hay imágenes disponibles</span>
                </div>
            `;
            return;
        }

            // Renderizar imágenes desde product_images (usar image_url según schema.sql)
            const imagesHTML = this.productImages.map((image, index) => {
                const imageUrl = image.image_url || '';
                    if (!imageUrl) {
                    console.warn('⚠️ Imagen sin image_url:', image);
                    return '';
                }
                
                return `
                    <div class="image-item" data-image-id="${image.id}">
                        <img src="${imageUrl}?t=${Date.now()}" alt="Imagen ${index + 1}" loading="lazy" 
                             onerror="this.parentElement.style.display='none'; console.error('Error cargando imagen:', '${imageUrl}')">
                    </div>
                `;
            }).filter(html => html).join('');

            container.innerHTML = imagesHTML || `
                <div class="loading-placeholder">
                    <span>No hay imágenes disponibles</span>
                </div>
            `;

        console.log(`✅ ${this.productImages.length} imágenes renderizadas correctamente`);
        } catch (error) {
            console.error('Error en renderProductImages:', error);
            this.showNotification('Error renderizando imágenes', 'error');
        }
    }


    // Función para refrescar las imágenes de producto
    async refreshProductImages() {
        const productSelector = document.getElementById('product-selector');
        const selectedProductId = productSelector ? productSelector.value : null;
        
        this.showNotification('Actualizando imágenes...', 'info');
        await this.loadProductImages(selectedProductId);
        this.showNotification('Imágenes actualizadas', 'success');
    }

    /* =======================================
       FUNCIONES DE CONFIGURACIÓN DE SUJETO
       ======================================= */

    /**
     * Actualizar género del sujeto
     * @param {string} gender - Género seleccionado
     */
    updateGender(gender) {
        console.log('Género actualizado:', gender);
        // El DataCollector leerá el valor directamente del DOM
        // Esta función permite validaciones o actualizaciones futuras
        if (!this.subjectConfig) {
            this.subjectConfig = {};
        }
        this.subjectConfig.gender = gender;
    }

    /**
     * Actualizar edad del sujeto
     * @param {string} age - Edad seleccionada
     */
    updateAge(age) {
        console.log('Edad actualizada:', age);
        if (!this.subjectConfig) {
            this.subjectConfig = {};
        }
        this.subjectConfig.age = age;
    }

    /**
     * Actualizar etnia del sujeto
     * @param {string} ethnicity - Etnia seleccionada
     */
    updateEthnicity(ethnicity) {
        console.log('Etnia actualizada:', ethnicity);
        if (!this.subjectConfig) {
            this.subjectConfig = {};
        }
        this.subjectConfig.ethnicity = ethnicity;
    }

    /**
     * Actualizar color de ojos del sujeto
     * @param {string} eyes - Color de ojos seleccionado
     */
    updateEyes(eyes) {
        console.log('Color de ojos actualizado:', eyes);
        if (!this.subjectConfig) {
            this.subjectConfig = {};
        }
        this.subjectConfig.eyes = eyes;
    }

    /**
     * Actualizar estilo de cabello del sujeto
     * @param {string} hair - Estilo de cabello seleccionado
     */
    updateHair(hair) {
        console.log('Estilo de cabello actualizado:', hair);
        if (!this.subjectConfig) {
            this.subjectConfig = {};
        }
        this.subjectConfig.hair = hair;
    }

    /**
     * Actualizar expresión del sujeto
     * @param {string} expression - Expresión seleccionada
     */
    updateExpression(expression) {
        console.log('Expresión actualizada:', expression);
        if (!this.subjectConfig) {
            this.subjectConfig = {};
        }
        this.subjectConfig.expression = expression;
    }

    /**
     * Actualizar estilo de vestimenta del sujeto
     * @param {string} style - Estilo de vestimenta seleccionado
     */
    updateStyle(style) {
        console.log('Estilo de vestimenta actualizado:', style);
        if (!this.subjectConfig) {
            this.subjectConfig = {};
        }
        this.subjectConfig.style = style;
    }

    /**
     * Actualizar tono del sujeto
     * @param {string} tone - Tono seleccionado
     */
    updateTone(tone) {
        console.log('Tono actualizado:', tone);
        if (!this.subjectConfig) {
            this.subjectConfig = {};
        }
        this.subjectConfig.tone = tone;
    }

    /**
     * Actualizar personalidad del sujeto
     * @param {string} personality - Personalidad seleccionada
     */
    updatePersonality(personality) {
        console.log('Personalidad actualizada:', personality);
        if (!this.subjectConfig) {
            this.subjectConfig = {};
        }
        this.subjectConfig.personality = personality;
    }

    /**
     * Actualizar estética del sujeto
     * @param {string} aesthetic - Estética seleccionada
     */
    updateAesthetic(aesthetic) {
        console.log('Estética actualizada:', aesthetic);
        if (!this.subjectConfig) {
            this.subjectConfig = {};
        }
        this.subjectConfig.aesthetic = aesthetic;
    }

    /**
     * Actualizar realismo del sujeto
     * @param {string} realism - Realismo seleccionado
     */
    updateRealism(realism) {
        console.log('Realismo actualizado:', realism);
        if (!this.subjectConfig) {
            this.subjectConfig = {};
        }
        this.subjectConfig.realism = realism;
    }

    // Función para manejar la selección de producto desde el dropdown
    async selectProductFromDropdown(productId) {
        console.log('Producto seleccionado:', productId);
        
        // Si no hay producto seleccionado, ocultar galería de imágenes
        if (!productId) {
            this.hideImageGallery();
            return;
        }

        // Si hay producto seleccionado, cargar y mostrar su información
                const product = this.products.find(p => p.id === productId);
        if (product) {
            this.updateProductInfo(product);
        }

        // Cargar imágenes del producto seleccionado
        await this.loadProductImages(productId);
    }

    // Función para manejar la selección de oferta desde el dropdown
    async selectOfferFromDropdown(offerId) {
        console.log('Oferta seleccionada:', offerId);
        
        // Si no hay oferta seleccionada, limpiar información
        if (!offerId) {
            this.clearOfferInfo();
            return;
        }

        // Si hay oferta seleccionada, cargar y mostrar su información
        const offer = this.offers.find(o => o.id === offerId);
        if (offer) {
            this.updateOfferInfo(offer);
        }
    }

    // Función para manejar la selección de audiencia desde el dropdown
    async selectAudienceFromDropdown(audienceId) {
        console.log('Audiencia seleccionada:', audienceId);
        
        // Si no hay audiencia seleccionada, limpiar información
        if (!audienceId) {
            this.clearAudienceInfo();
            return;
        }

        // Si hay audiencia seleccionada, cargar y mostrar su información
        const audience = this.audience.find(a => a.id === audienceId);
        if (audience) {
            this.updateAudienceInfo(audience);
        }
    }



    /* =======================================
       FUNCIONES FALTANTES DEL SIDEBAR
       ======================================= */

    // Funciones de Avatar
    selectAvatarFromDropdown(avatarId) {
        console.log('Avatar seleccionado:', avatarId);
        // Implementar lógica de selección de avatar
    }

    updateCharacterType(characterType) {
        console.log('Tipo de personaje actualizado:', characterType);
        // Implementar lógica de tipo de personaje
    }

    toggleTrait(trait, isChecked) {
        console.log(`Trait ${trait}:`, isChecked);
        // Implementar lógica de traits
    }

    toggleEnergy(energy, isChecked) {
        console.log(`Energía ${energy}:`, isChecked);
        // Implementar lógica de energía
    }

    toggleGender(gender, isChecked) {
        console.log(`Género ${gender}:`, isChecked);
        // Implementar lógica de género
    }

    toggleVoice(voice, isChecked) {
        console.log(`Voz ${voice}:`, isChecked);
        // Implementar lógica de voz
    }

    updateAvatarLanguage(language) {
        console.log('Idioma del avatar actualizado:', language);
        // Implementar lógica de idioma
    }

    toggleValue(value, isChecked) {
        console.log(`Valor ${value}:`, isChecked);
        // Implementar lógica de valores
    }

    updateAvatarAge(age) {
        console.log('Edad del avatar actualizada:', age);
        const ageDisplay = document.getElementById('age-display');
        if (ageDisplay) {
            ageDisplay.textContent = `${age} años`;
        }
    }

    updateAvatarCountry(country) {
        console.log('País del avatar actualizado:', country);
        // Implementar lógica de país
    }

    toggleAccent(accent, isChecked) {
        console.log(`Acento ${accent}:`, isChecked);
        // Implementar lógica de acento
    }

    handleAvatarImageUpload(files) {
        console.log('Imágenes de avatar subidas:', files);
        // Implementar lógica de subida de imágenes
    }

    handleAvatarVideoUpload(files) {
        console.log('Video de avatar subido:', files);
        // Implementar lógica de subida de video
    }

    createNewAvatar() {
        console.log('Creando nuevo avatar...');
        // Implementar lógica de creación de avatar
    }

    // Funciones de Estilo
    selectStyleFromDropdown(styleId) {
        console.log('Estilo seleccionado:', styleId);
        // Implementar lógica de selección de estilo
    }

    removeStyle() {
        console.log('Removiendo estilo...');
        // Implementar lógica de remoción de estilo
    }

    // Funciones de Estética
    selectAestheticFromDropdown(aestheticId) {
        console.log('Estética seleccionada:', aestheticId);
        // Implementar lógica de selección de estética
    }

    toggleMood(mood, isChecked) {
        console.log(`Ánimo ${mood}:`, isChecked);
        // Implementar lógica de ánimo
    }

    togglePalette(palette, isChecked) {
        console.log(`Paleta ${palette}:`, isChecked);
        // Implementar lógica de paleta
    }

    toggleLighting(lighting, isChecked) {
        console.log(`Iluminación ${lighting}:`, isChecked);
        // Implementar lógica de iluminación
    }

    toggleCamera(camera, isChecked) {
        console.log(`Cámara ${camera}:`, isChecked);
        // Implementar lógica de cámara
    }

    togglePace(pace, isChecked) {
        console.log(`Paso ${pace}:`, isChecked);
        // Implementar lógica de paso
    }

    createNewAesthetic() {
        console.log('Creando nueva estética...');
        // Implementar lógica de creación de estética
    }

    removeAesthetic() {
        console.log('Removiendo estética...');
        // Implementar lógica de remoción de estética
    }

    toggleFreeMode(mode) {
        console.log(`Modo libre ${mode}:`, true);
        // Implementar lógica de modo libre
    }

    // Funciones de Plataforma
    togglePlatform(platform, isChecked) {
        console.log(`Plataforma ${platform}:`, isChecked);
        // Implementar lógica de plataforma
    }

    toggleFormat(format, isChecked) {
        console.log(`Formato ${format}:`, isChecked);
        // Implementar lógica de formato
    }

    // Funciones de Escenario
    selectScenarioFromDropdown(scenarioId) {
        console.log('Escenario seleccionado:', scenarioId);
        // Implementar lógica de selección de escenario
    }

    toggleLocation(location, isChecked) {
        console.log(`Ubicación ${location}:`, isChecked);
        // Implementar lógica de ubicación
    }

    toggleAmbience(ambience, isChecked) {
        console.log(`Ambiente ${ambience}:`, isChecked);
        // Implementar lógica de ambiente
    }

    toggleHygiene(hygiene, isChecked) {
        console.log(`Higiene ${hygiene}:`, isChecked);
        // Implementar lógica de higiene
    }

    toggleBackdrop(backdrop, isChecked) {
        console.log(`Fondo ${backdrop}:`, isChecked);
        // Implementar lógica de fondo
    }

    createNewScenario() {
        console.log('Creando nuevo escenario...');
        // Implementar lógica de creación de escenario
    }

    // Funciones de IA
    updateCreativity(creativity) {
        console.log('Creatividad actualizada:', creativity);
        const creativityDisplay = document.getElementById('creativity-display');
        if (creativityDisplay) {
            creativityDisplay.textContent = creativity;
        }
    }

    // Funciones de Navegación del Sidebar
    showSidebarSection(sectionNumber) {
        console.log(`Mostrando sección ${sectionNumber} del sidebar`);
        
        // Ocultar todas las secciones
        const sections = document.querySelectorAll('.studio-sidebar');
        sections.forEach(section => {
            section.style.display = 'none';
        });
        
        // Mostrar la sección seleccionada
        const targetSection = document.getElementById(`sidebar-section-${sectionNumber}`);
        if (targetSection) {
            targetSection.style.display = 'block';
            console.log(`✅ Sección ${sectionNumber} mostrada`);
        } else {
            console.error(`❌ Sección ${sectionNumber} no encontrada`);
        }
    }

    // Funciones de Generación
    generateScripts() {
        console.log('Generando guiones...');
        // Implementar lógica de generación de guiones
    }

    testGenerateScenes() {
        console.log('Probando generación de escenas...');
        // Implementar lógica de prueba de escenas
    }

    testGenerateFinalUGC() {
        console.log('Probando generación final de UGC...');
        // Implementar lógica de prueba de UGC final
    }

}

// Funciones wrapper globales para configuración de sujeto
// Estas funciones evitan errores si studioManager aún no está inicializado
// Se definen antes del DOMContentLoaded para que estén disponibles inmediatamente
window.updateGender = function(gender) {
    if (window.studioManager && window.studioManager.updateGender) {
        window.studioManager.updateGender(gender);
    } else {
        console.warn('studioManager.updateGender no está disponible aún');
    }
};

window.updateAge = function(age) {
    if (window.studioManager && window.studioManager.updateAge) {
        window.studioManager.updateAge(age);
    } else {
        console.warn('studioManager.updateAge no está disponible aún');
    }
};

window.updateEthnicity = function(ethnicity) {
    if (window.studioManager && window.studioManager.updateEthnicity) {
        window.studioManager.updateEthnicity(ethnicity);
    } else {
        console.warn('studioManager.updateEthnicity no está disponible aún');
    }
};

window.updateEyes = function(eyes) {
    if (window.studioManager && window.studioManager.updateEyes) {
        window.studioManager.updateEyes(eyes);
    } else {
        console.warn('studioManager.updateEyes no está disponible aún');
    }
};

window.updateHair = function(hair) {
    if (window.studioManager && window.studioManager.updateHair) {
        window.studioManager.updateHair(hair);
    } else {
        console.warn('studioManager.updateHair no está disponible aún');
    }
};

window.updateExpression = function(expression) {
    if (window.studioManager && window.studioManager.updateExpression) {
        window.studioManager.updateExpression(expression);
    } else {
        console.warn('studioManager.updateExpression no está disponible aún');
    }
};

window.updateStyle = function(style) {
    if (window.studioManager && window.studioManager.updateStyle) {
        window.studioManager.updateStyle(style);
    } else {
        console.warn('studioManager.updateStyle no está disponible aún');
    }
};

window.updateTone = function(tone) {
    if (window.studioManager && window.studioManager.updateTone) {
        window.studioManager.updateTone(tone);
    } else {
        console.warn('studioManager.updateTone no está disponible aún');
    }
};

window.updatePersonality = function(personality) {
    if (window.studioManager && window.studioManager.updatePersonality) {
        window.studioManager.updatePersonality(personality);
    } else {
        console.warn('studioManager.updatePersonality no está disponible aún');
    }
};

window.updateAesthetic = function(aesthetic) {
    if (window.studioManager && window.studioManager.updateAesthetic) {
        window.studioManager.updateAesthetic(aesthetic);
    } else {
        console.warn('studioManager.updateAesthetic no está disponible aún');
    }
};

window.updateRealism = function(realism) {
    if (window.studioManager && window.studioManager.updateRealism) {
        window.studioManager.updateRealism(realism);
    } else {
        console.warn('studioManager.updateRealism no está disponible aún');
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.studioManager = new StudioManager();
});

function logout() {
    window.location.href = '/login.html';
}

// Función global para navegación de sidebar (fallback)
function showSidebarSection(sectionNumber) {
    if (window.studioManager && window.studioManager.showSidebarSection) {
        window.studioManager.showSidebarSection(sectionNumber);
    }
}


// Funciones globales para manejo de imágenes de producto
function refreshProductImages() {
    if (window.studioManager && window.studioManager.refreshProductImages) {
        window.studioManager.refreshProductImages();
    }
}

