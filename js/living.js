/**
 * AI Smart Content - Living Page
 * Página principal de la interfaz de usuario
 */

class LivingManager {
    constructor() {
        this.supabase = null;
        this.userId = null;
        this.userData = null;
        this.projectData = null;
        this.brandData = null;
        this.init();
    }

    async init() {
        // Verificar acceso antes de continuar
        if (typeof verifyUserAccess === 'function') {
            const hasAccess = await verifyUserAccess();
            if (!hasAccess) {
                return; // La función verifyUserAccess ya redirige
            }
        }

        await this.initSupabase();
        if (this.supabase && this.userId) {
            console.log('✅ Supabase inicializado, cargando datos...');
            console.log('👤 User ID:', this.userId);
            await this.loadUserData();
            await this.loadProjectData();
            if (this.projectData) {
                console.log('✅ Proyecto encontrado:', this.projectData.id);
                await this.loadBrandData();
                await this.loadBrandFiles();
                await this.loadProducts();
                await this.loadCampaigns();
            } else {
                console.warn('⚠️ No se encontró proyecto para el usuario');
            }
            this.renderAll();
            this.updateNavHeader();
        } else {
            console.error('❌ No se pudo inicializar Supabase o no hay usuario');
            console.log('Supabase:', this.supabase);
            console.log('UserId:', this.userId);
        }
        this.setupEventListeners();
        this.setupEditableInputs();
        this.setupMultiselects();
        this.setupFileUpload();
        this.setupClickableCards();
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

        // Actualizar nombre de marca en el header principal
        const brandNameHeader = document.getElementById('brandNameHeader');
        if (brandNameHeader && this.projectData && this.projectData.nombre_marca) {
            brandNameHeader.textContent = this.projectData.nombre_marca;
        } else if (brandNameHeader) {
            brandNameHeader.textContent = 'Sin marca';
        }
    }

    async initSupabase() {
        try {
            if (typeof waitForSupabase === 'function') {
                this.supabase = await waitForSupabase();
            } else if (window.supabaseClient) {
                this.supabase = window.supabaseClient;
            }

            if (this.supabase) {
                const { data: { user } } = await this.supabase.auth.getUser();
                if (user) {
                    this.userId = user.id;
                }
            }
        } catch (error) {
            console.error('Error initializing Supabase:', error);
        }
    }

    async loadUserData() {
        if (!this.supabase || !this.userId) return;

        try {
            // Cargar desde users (tiene plan_type y credits_available)
            const { data, error } = await this.supabase
                .from('users')
                .select('*')
                .eq('id', this.userId)
                .single();

            if (error) {
                // Si no existe en users, intentar desde user_profiles y crear en users
                if (error.code === 'PGRST116') {
                    console.log('⚠️ Usuario no encontrado en users, intentando desde user_profiles...');
                    
                    const { data: profileData, error: profileError } = await this.supabase
                        .from('user_profiles')
                        .select('*')
                        .eq('id', this.userId)
                        .single();

                    if (!profileError && profileData) {
                        // Obtener email del usuario autenticado
                        const { data: { user } } = await this.supabase.auth.getUser();
                        
                        // Crear usuario en users con datos básicos
                        const { error: createError } = await this.supabase
                            .from('users')
                            .insert({
                                id: this.userId,
                                email: user?.email || profileData.email,
                                full_name: profileData.full_name || user?.email,
                                plan_type: 'basico',
                                credits_available: 0,
                                credits_total: 0
                            });

                        if (!createError) {
                            // Recargar desde users
                            const { data: newUserData, error: reloadError } = await this.supabase
                                .from('users')
                                .select('*')
                                .eq('id', this.userId)
                                .single();
                            
                            if (!reloadError) {
                                this.userData = newUserData;
                                console.log('✅ Usuario creado y cargado desde users:', newUserData);
                                return;
                            }
                        }
                    }
                }
                throw error;
            }
            
            // Obtener email del usuario autenticado si no está en la tabla
            if (!data.email) {
                const { data: { user } } = await this.supabase.auth.getUser();
                if (user) {
                    data.email = user.email;
                }
            }
            
            this.userData = data;
            console.log('✅ Datos de usuario cargados desde users:', data);
            console.log('💰 Créditos disponibles:', data.credits_available, '| Créditos totales:', data.credits_total);
        } catch (error) {
            console.error('❌ Error loading user data:', error);
            // Si falla, al menos obtener el email del usuario autenticado
            try {
                const { data: { user } } = await this.supabase.auth.getUser();
                if (user) {
                    this.userData = {
                        id: user.id,
                        email: user.email,
                        full_name: user.user_metadata?.full_name || user.email,
                        plan_type: 'basico',
                        credits_available: 0,
                        credits_total: 0
                    };
                    console.log('✅ Usando datos básicos del usuario autenticado');
                }
            } catch (authError) {
                console.error('❌ Error obteniendo usuario autenticado:', authError);
            }
        }
    }

    async loadProjectData() {
        if (!this.supabase || !this.userId) {
            console.warn('⚠️ No se puede cargar proyecto: Supabase o userId no disponible');
            return;
        }

        try {
            console.log('📋 Cargando proyecto para usuario:', this.userId);
            const { data, error } = await this.supabase
                .from('projects')
                .select('*')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    console.warn('⚠️ No se encontró proyecto para el usuario');
                    this.projectData = null;
                } else {
                    console.error('❌ Error cargando proyecto:', error);
                    throw error;
                }
            } else {
                this.projectData = data;
                console.log('✅ Proyecto cargado:', data);
            }
        } catch (error) {
            console.error('❌ Error loading project data:', error);
            this.projectData = null;
        }
    }

    async loadBrandData() {
        if (!this.supabase || !this.projectData) return;

        try {
            const { data, error } = await this.supabase
                .from('brands')
                .select('*')
                .eq('project_id', this.projectData.id)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            this.brandData = data;
        } catch (error) {
            console.error('Error loading brand data:', error);
        }
    }

    async loadBrandFiles() {
        if (!this.supabase || !this.projectData) return;

        try {
            const { data, error } = await this.supabase
                .from('brand_files')
                .select('*')
                .eq('project_id', this.projectData.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.brandFiles = data || [];
        } catch (error) {
            console.error('Error loading brand files:', error);
            this.brandFiles = [];
        }
    }

    async loadProducts() {
        if (!this.supabase || !this.projectData) return;

        try {
            const { data: products, error: productsError } = await this.supabase
                .from('products')
                .select('*')
                .eq('project_id', this.projectData.id)
                .order('created_at', { ascending: false });

            if (productsError) throw productsError;

            // Cargar imágenes de cada producto
            if (products && products.length > 0) {
                for (const product of products) {
                    const { data: images, error: imagesError } = await this.supabase
                        .from('product_images')
                        .select('*')
                        .eq('product_id', product.id)
                        .order('image_order', { ascending: true });

                    if (!imagesError) {
                        product.images = images || [];
                    }
                }
            }

            this.products = products || [];
        } catch (error) {
            console.error('Error loading products:', error);
            this.products = [];
        }
    }

    async loadCampaigns() {
        if (!this.supabase || !this.projectData) return;

        try {
            const { data, error } = await this.supabase
                .from('campaigns')
                .select('*')
                .eq('project_id', this.projectData.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.campaigns = data || [];
        } catch (error) {
            console.error('Error loading campaigns:', error);
            this.campaigns = [];
        }
    }

    renderAll() {
        this.renderProfileCard();
        this.renderUserInfo();
        this.renderBrandInfo();
        this.renderBrandGuidelines();
        this.renderBrandFiles();
        this.renderProducts();
        this.renderCampaigns();
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
    }

    setupMultiselects() {
        // Mercados objetivo
        this.initMultiselect('mercadosObjetivo', 'mercadosObjetivoInput', () => {
            this.saveProjectField('mercado_objetivo', this.getMultiselectValues('mercadosObjetivoInput'));
        });

        // Idiomas contenido
        this.initMultiselect('idiomasContenido', 'idiomasContenidoInput', () => {
            this.saveProjectField('idiomas_contenido', this.getMultiselectValues('idiomasContenidoInput'));
        });

        // Palabras a evitar
        this.initMultiselect('palabrasEvitar', 'palabrasEvitarInput', () => {
            this.saveBrandField('palabras_evitar', this.getMultiselectValues('palabrasEvitarInput'));
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
        if (hiddenInputId === 'mercadosObjetivoInput' && this.projectData?.mercado_objetivo) {
            selectedValues = Array.isArray(this.projectData.mercado_objetivo) 
                ? this.projectData.mercado_objetivo 
                : [];
        } else if (hiddenInputId === 'idiomasContenidoInput' && this.projectData?.idiomas_contenido) {
            selectedValues = Array.isArray(this.projectData.idiomas_contenido) 
                ? this.projectData.idiomas_contenido 
                : [];
        } else if (hiddenInputId === 'palabrasEvitarInput' && this.brandData?.palabras_evitar) {
            selectedValues = Array.isArray(this.brandData.palabras_evitar) 
                ? this.brandData.palabras_evitar 
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
            valueDisplay.classList.remove('has-selection');
            trigger.querySelector('.multiselect-tags')?.remove();
        } else {
            valueDisplay.classList.add('has-selection');
            
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
        if (!this.supabase || !this.projectData) return;

        try {
            // Upload to Supabase Storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${this.projectData.id}/${Date.now()}_${file.name}`;
            const filePath = `brand-files/${fileName}`;

            const { data: uploadData, error: uploadError } = await this.supabase.storage
                .from('brand-files')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: { publicUrl } } = this.supabase.storage
                .from('brand-files')
                .getPublicUrl(filePath);

            // Save to database
            const { error: dbError } = await this.supabase
                .from('brand_files')
                .insert({
                    project_id: this.projectData.id,
                    file_name: file.name,
                    file_url: publicUrl,
                    file_type: fileExt,
                    file_size: file.size
                });

            if (dbError) throw dbError;

            console.log('✅ Archivo subido correctamente:', file.name);
        } catch (error) {
            console.error('Error al subir archivo:', error);
            alert(`Error al subir ${file.name}. Por favor, intenta de nuevo.`);
        }
    }

    setupClickableCards() {
        // Productos card
        const productsCard = document.querySelector('.clickable-card:has(#productsList)');
        if (productsCard) {
            productsCard.addEventListener('click', (e) => {
                if (!e.target.closest('a')) {
                    window.location.href = 'products.html';
                }
            });
        }

        // Campañas card
        const campaignsCard = document.querySelector('.clickable-card:has(#campaignsList)');
        if (campaignsCard) {
            campaignsCard.addEventListener('click', (e) => {
                if (!e.target.closest('a')) {
                    window.location.href = 'studio.html';
                }
            });
        }
    }

    async saveBrandField(fieldName, value) {
        if (!this.supabase || !this.brandData) return;

        try {
            const { error } = await this.supabase
                .from('brands')
                .update({ [fieldName]: value || null })
                .eq('project_id', this.projectData.id);

            if (error) throw error;

            this.brandData[fieldName] = value || null;
            console.log(`${fieldName} actualizado correctamente`);
        } catch (error) {
            console.error(`Error al guardar ${fieldName}:`, error);
            alert(`Error al guardar ${fieldName}. Por favor, intenta de nuevo.`);
        }
    }

    async saveProjectField(fieldName, value) {
        if (!this.supabase || !this.projectData) return;

        try {
            const { error } = await this.supabase
                .from('projects')
                .update({ [fieldName]: value || null })
                .eq('id', this.projectData.id);

            if (error) throw error;

            this.projectData[fieldName] = value || null;
            console.log(`${fieldName} actualizado correctamente`);
        } catch (error) {
            console.error(`Error al guardar ${fieldName}:`, error);
            alert(`Error al guardar ${fieldName}. Por favor, intenta de nuevo.`);
        }
    }

    renderProfileCard() {
        // Logo de marca como foto de perfil
        const profileLogo = document.getElementById('profileBrandLogo');
        const profilePlaceholder = document.getElementById('profilePlaceholder');
        
        if (this.projectData && this.projectData.logo_url) {
            if (profileLogo) {
                profileLogo.src = this.projectData.logo_url + '?t=' + Date.now();
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

        // Nombre del usuario (no nombre de marca)
        const profileName = document.getElementById('profileUserName');
        if (profileName && this.userData) {
            profileName.textContent = this.userData.full_name || this.userData.email || 'Usuario';
        }

        // Inputs editables para web, instagram, facebook y tiktok
        const socialLinksContainer = document.getElementById('profileSocialLinks');
        if (socialLinksContainer && this.projectData) {
            socialLinksContainer.innerHTML = '';
            
            // Web
            const webInput = this.createSocialInput('sitio_web', 'fas fa-globe', 'Sitio web', this.projectData.sitio_web || '');
            socialLinksContainer.appendChild(webInput);

            // Instagram
            const instagramInput = this.createSocialInput('instagram_url', 'fab fa-instagram', 'Instagram', this.projectData.instagram_url || '');
            socialLinksContainer.appendChild(instagramInput);

            // Facebook
            const facebookInput = this.createSocialInput('facebook_url', 'fab fa-facebook', 'Facebook', this.projectData.facebook_url || '');
            socialLinksContainer.appendChild(facebookInput);

            // TikTok
            const tiktokInput = this.createSocialInput('tiktok_url', 'fab fa-tiktok', 'TikTok', this.projectData.tiktok_url || '');
            socialLinksContainer.appendChild(tiktokInput);
        }

        // Detalles: correo, plan, créditos
        const profileEmail = document.getElementById('profileEmail');
        const profilePlan = document.getElementById('profilePlan');
        const profileCredits = document.getElementById('profileCredits');

        console.log('🔍 Renderizando detalles de perfil:', {
            userData: this.userData,
            email: this.userData?.email,
            plan_type: this.userData?.plan_type,
            credits_available: this.userData?.credits_available
        });

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
            profileCredits.textContent = credits;
            console.log('💰 Créditos mostrados:', credits, 'de userData.credits_available:', this.userData.credits_available);
        } else {
            console.warn('⚠️ No se encontró profileCredits o userData:', {
                profileCredits: !!profileCredits,
                userData: !!this.userData
            });
        }
    }

    createSocialInput(fieldName, iconClass, label, value) {
        const container = document.createElement('div');
        container.className = 'profile-social-input-container';
        
        const icon = document.createElement('i');
        icon.className = iconClass;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'profile-social-input';
        input.placeholder = `Agregar ${label}`;
        input.value = value;
        input.dataset.field = fieldName;
        
        // Guardar cambios cuando el usuario termine de editar
        let saveTimeout;
        input.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                this.saveSocialField(fieldName, input.value);
            }, 1000); // Guardar después de 1 segundo sin escribir
        });
        
        input.addEventListener('blur', () => {
            clearTimeout(saveTimeout);
            this.saveSocialField(fieldName, input.value);
        });
        
        container.appendChild(icon);
        container.appendChild(input);
        
        return container;
    }

    async saveSocialField(fieldName, value) {
        if (!this.supabase || !this.projectData) return;
        
        try {
            const { error } = await this.supabase
                .from('projects')
                .update({ [fieldName]: value || null })
                .eq('id', this.projectData.id);
            
            if (error) throw error;
            
            // Actualizar datos locales
            this.projectData[fieldName] = value || null;
            
            console.log(`${fieldName} actualizado correctamente`);
        } catch (error) {
            console.error(`Error al guardar ${fieldName}:`, error);
            alert(`Error al guardar ${fieldName}. Por favor, intenta de nuevo.`);
        }
    }

    renderUserInfo() {
        if (!this.userData) return;

        const userNameEl = document.getElementById('userName');
        const userEmailEl = document.getElementById('userEmail');
        const userPlanEl = document.getElementById('userPlan');
        const userCreditsEl = document.getElementById('userCredits');
        const userCreditsTotalEl = document.getElementById('userCreditsTotal');
        const creditsCountEl = document.getElementById('creditsCount');

        if (userNameEl) {
            userNameEl.textContent = this.userData.full_name || 'No especificado';
        }
        if (userEmailEl) {
            userEmailEl.textContent = this.userData.email || '-';
        }
        if (userPlanEl) {
            const planNames = {
                'basico': 'Básico',
                'pro': 'Pro',
                'enterprise': 'Enterprise'
            };
            userPlanEl.textContent = planNames[this.userData.plan_type] || this.userData.plan_type || '-';
        }
        if (userCreditsEl) {
            userCreditsEl.textContent = this.userData.credits_available || 0;
        }
        if (userCreditsTotalEl) {
            userCreditsTotalEl.textContent = this.userData.credits_total || 0;
        }
        if (creditsCountEl) {
            creditsCountEl.textContent = this.userData.credits_available || 0;
        }
    }

    renderBrandInfo() {
        if (!this.projectData) return;

        const brandNameEl = document.getElementById('brandName');
        const brandEmailEl = document.getElementById('brandEmail');
        const brandLogoEl = document.getElementById('brandLogo');
        const logoPlaceholderEl = document.getElementById('logoPlaceholder');
        const brandLinksEl = document.getElementById('brandLinks');

        if (brandNameEl) {
            brandNameEl.textContent = this.projectData.nombre_marca || 'Sin nombre';
        }

        if (brandEmailEl && this.userData) {
            brandEmailEl.textContent = this.userData.email || '-';
        }

        // Logo
        if (this.projectData.logo_url) {
            console.log('🖼️ Cargando logo desde:', this.projectData.logo_url);
            if (brandLogoEl) {
                // Agregar timestamp para evitar cache
                const logoUrl = this.projectData.logo_url + (this.projectData.logo_url.includes('?') ? '&' : '?') + 't=' + Date.now();
                brandLogoEl.src = logoUrl;
                brandLogoEl.style.display = 'block';
                brandLogoEl.onerror = () => {
                    console.error('❌ Error cargando imagen del logo');
                    if (brandLogoEl) brandLogoEl.style.display = 'none';
                    if (logoPlaceholderEl) logoPlaceholderEl.style.display = 'flex';
                };
                brandLogoEl.onload = () => {
                    console.log('✅ Logo cargado exitosamente');
                };
            }
            if (logoPlaceholderEl) {
                logoPlaceholderEl.style.display = 'none';
            }
        } else {
            console.log('ℹ️ No hay logo disponible');
            if (brandLogoEl) brandLogoEl.style.display = 'none';
            if (logoPlaceholderEl) logoPlaceholderEl.style.display = 'flex';
        }

        // Links
        if (brandLinksEl) {
            brandLinksEl.innerHTML = '';
            if (this.projectData.sitio_web) {
                const webLink = document.createElement('a');
                webLink.href = this.projectData.sitio_web;
                webLink.target = '_blank';
                webLink.className = 'brand-link';
                webLink.innerHTML = '<i class="fas fa-globe"></i> Sitio Web';
                brandLinksEl.appendChild(webLink);
            }
            if (this.projectData.instagram_url) {
                const igLink = document.createElement('a');
                igLink.href = this.projectData.instagram_url;
                igLink.target = '_blank';
                igLink.className = 'brand-link';
                igLink.innerHTML = '<i class="fab fa-instagram"></i> Instagram';
                brandLinksEl.appendChild(igLink);
            }
            if (this.projectData.tiktok_url) {
                const tiktokLink = document.createElement('a');
                tiktokLink.href = this.projectData.tiktok_url;
                tiktokLink.target = '_blank';
                tiktokLink.className = 'brand-link';
                tiktokLink.innerHTML = '<i class="fab fa-tiktok"></i> TikTok';
                brandLinksEl.appendChild(tiktokLink);
            }
        }
    }

    renderBrandGuidelines() {
        // Poblar inputs editables
        const tonoVozInput = document.getElementById('tonoVozInput');
        const palabrasUsarInput = document.getElementById('palabrasUsarInput');
        const reglasCreativasInput = document.getElementById('reglasCreativasInput');

        if (tonoVozInput && this.brandData) {
            tonoVozInput.value = this.brandData.tono_voz || '';
        }

        if (palabrasUsarInput && this.brandData) {
            palabrasUsarInput.value = this.brandData.palabras_usar || '';
        }

        if (reglasCreativasInput && this.brandData) {
            reglasCreativasInput.value = this.brandData.reglas_creativas || '';
        }
    }

    renderMarketsAndLanguages() {
        // Esta función ahora se maneja en setupMultiselects
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
                    <a href="products.html" class="btn btn-primary" style="margin-top: 1rem;">Gestionar Productos</a>
                </div>
            `;
            return;
        }

        // Ordenar por fecha de creación (más recientes primero) y mostrar los últimos
        const sortedProducts = [...this.products].sort((a, b) => {
            const dateA = new Date(a.created_at || 0);
            const dateB = new Date(b.created_at || 0);
            return dateB - dateA;
        });

        sortedProducts.forEach(product => {
            const productCard = document.createElement('div');
            productCard.className = 'product-card-horizontal';

            const mainImage = product.images && product.images.length > 0 
                ? product.images[0].image_url 
                : null;

            const precio = product.precio_producto 
                ? `${product.moneda || 'USD'} $${parseFloat(product.precio_producto).toFixed(2)}`
                : 'Precio no definido';

            // Combinar beneficios (beneficio_1, beneficio_2, beneficio_3)
            const beneficiosArray = [];
            if (product.beneficio_1) beneficiosArray.push(product.beneficio_1);
            if (product.beneficio_2) beneficiosArray.push(product.beneficio_2);
            if (product.beneficio_3) beneficiosArray.push(product.beneficio_3);
            const beneficios = beneficiosArray.length > 0 
                ? beneficiosArray.join(' • ') 
                : 'Sin beneficios especificados';

            const descripcion = product.descripcion_producto || 'Sin descripción';
            const productId = product.id || product.product_id;

            productCard.innerHTML = `
                <div class="product-card-image-horizontal">
                    ${mainImage 
                        ? `<img src="${mainImage}" alt="${product.nombre_producto}" onerror="this.parentElement.innerHTML='<div class=\\'no-image\\'><i class=\\'fas fa-image\\'></i></div>'">`
                        : `<div class="no-image"><i class="fas fa-image"></i></div>`
                    }
                </div>
                <div class="product-card-content-horizontal">
                    <h3 class="product-card-title-horizontal">${product.nombre_producto || 'Sin nombre'}</h3>
                    <div class="product-card-price">${precio}</div>
                    <span class="product-card-type-badge">${this.formatProductType(product.tipo_producto)}</span>
                    <div class="product-card-benefits">
                        <div class="product-card-benefits-label">Beneficios:</div>
                        <div>${beneficios}</div>
                    </div>
                    <p class="product-card-description">${descripcion}</p>
                    <a href="products.html?edit=${productId}" class="product-card-edit-btn">
                        <i class="fas fa-edit"></i> Editar
                    </a>
                </div>
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
                    <a href="studio.html" class="btn btn-primary" style="margin-top: 1rem;">Crear Campaña</a>
                </div>
            `;
            return;
        }

        // Ordenar por fecha de creación (más recientes primero)
        const sortedCampaigns = [...this.campaigns].sort((a, b) => {
            const dateA = new Date(a.created_at || 0);
            const dateB = new Date(b.created_at || 0);
            return dateB - dateA;
        });

        sortedCampaigns.forEach(campaign => {
            const campaignCard = document.createElement('div');
            campaignCard.className = 'campaign-card-horizontal';

            const objetivoPrincipal = campaign.objetivo_principal || 'Sin objetivo definido';
            const oferta = campaign.oferta_desc || 'Sin oferta';
            const audiencia = campaign.audiencia_desc || 'Sin audiencia definida';
            const intenciones = campaign.intenciones || 'Sin intenciones especificadas';
            const cta = campaign.cta || 'Ver más';
            const ctaUrl = campaign.cta_url || '#';

            campaignCard.innerHTML = `
                <div class="campaign-card-content-horizontal">
                    <h3 class="campaign-card-title-horizontal">${objetivoPrincipal}</h3>
                    <div class="campaign-card-field">
                        <div class="campaign-card-field-label">Oferta</div>
                        <div class="campaign-card-field-value">${oferta}</div>
                    </div>
                    <div class="campaign-card-field">
                        <div class="campaign-card-field-label">Audiencia</div>
                        <div class="campaign-card-field-value">${audiencia}</div>
                    </div>
                    <div class="campaign-card-field">
                        <div class="campaign-card-field-label">Intenciones</div>
                        <div class="campaign-card-field-value">${intenciones}</div>
                    </div>
                    <a href="${ctaUrl}" target="_blank" class="campaign-card-cta-btn">
                        ${cta} <i class="fas fa-arrow-right"></i>
                    </a>
                </div>
            `;

            campaignsListEl.appendChild(campaignCard);
        });
    }

    formatFileSize(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    formatProductType(type) {
        const typeNames = {
            'bebida': 'Bebida',
            'bebida_alcoholica': 'Bebida Alcohólica',
            'agua': 'Agua',
            'energetica': 'Energética',
            'alimento': 'Alimento',
            'snack': 'Snack',
            'suplemento_alimenticio': 'Suplemento Alimenticio',
            'cosmetico': 'Cosmético',
            'skincare': 'Skincare',
            'maquillaje': 'Maquillaje',
            'perfume': 'Perfume',
            'cuidado_cabello': 'Cuidado del Cabello',
            'cuidado_personal': 'Cuidado Personal',
            'higiene': 'Higiene',
            'app': 'App',
            'electronico': 'Electrónico',
            'smartphone': 'Smartphone',
            'tablet': 'Tablet',
            'accesorio_tech': 'Accesorio Tech',
            'gadget': 'Gadget',
            'ropa': 'Ropa',
            'calzado': 'Calzado',
            'accesorio_moda': 'Accesorio de Moda',
            'reloj': 'Reloj',
            'joyeria': 'Joyería',
            'suplemento': 'Suplemento',
            'vitamina': 'Vitamina',
            'fitness': 'Fitness',
            'bienestar': 'Bienestar',
            'salud': 'Salud',
            'hogar': 'Hogar',
            'decoracion': 'Decoración',
            'mueble': 'Mueble',
            'electrodomestico': 'Electrodoméstico',
            'servicio': 'Servicio',
            'educacion': 'Educación',
            'financiero': 'Financiero',
            'salud_servicio': 'Salud (Servicio)',
            'entretenimiento': 'Entretenimiento',
            'libro': 'Libro',
            'juego': 'Juego',
            'juguete': 'Juguete',
            'automotriz': 'Automotriz',
            'deportivo': 'Deportivo',
            'otro': 'Otro'
        };
        return typeNames[type] || type;
    }

    setupEventListeners() {
        // Navigation ya se maneja en navigation.js
    }

    // ============================================
    // MODALES DE EDICIÓN
    // ============================================

    openEditUserModal() {
        if (!this.userData) return;
        
        const modal = this.createModal('Editar Información de Usuario', this.getUserEditForm());
        this.showModal(modal);
    }

    openEditBrandModal() {
        if (!this.projectData) return;
        
        const modal = this.createModal('Editar Datos de Marca', this.getBrandEditForm());
        this.showModal(modal);
    }

    openEditLogoModal() {
        if (!this.projectData) return;
        
        const modal = this.createModal('Editar Logo', this.getLogoEditForm());
        this.showModal(modal);
    }

    openEditGuidelinesModal() {
        if (!this.brandData) return;
        
        const modal = this.createModal('Editar Lineamientos de Marca', this.getGuidelinesEditForm());
        this.showModal(modal);
    }

    openEditMarketsModal() {
        if (!this.projectData) return;
        
        const modal = this.createModal('Editar Mercado e Idiomas', this.getMarketsEditForm());
        this.showModal(modal);
    }

    openEditFilesModal() {
        if (!this.projectData) return;
        
        const modal = this.createModal('Gestionar Archivos de Identidad', this.getFilesEditForm());
        this.showModal(modal);
    }

    // ============================================
    // FORMULARIOS DE EDICIÓN
    // ============================================

    getUserEditForm() {
        return `
            <form id="editUserForm" class="edit-form">
                <div class="form-group">
                    <label>Nombre completo</label>
                    <input type="text" id="editUserName" value="${this.userData.full_name || ''}" class="form-input" required>
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="editUserEmail" value="${this.userData.email || ''}" class="form-input" required>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        `;
    }

    getBrandEditForm() {
        return `
            <form id="editBrandForm" class="edit-form">
                <div class="form-group">
                    <label>Nombre de la marca</label>
                    <input type="text" id="editBrandName" value="${this.projectData.nombre_marca || ''}" class="form-input" required>
                </div>
                <div class="form-group">
                    <label>Sitio web</label>
                    <input type="url" id="editBrandWebsite" value="${this.projectData.sitio_web || ''}" class="form-input">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Instagram</label>
                        <input type="text" id="editBrandInstagram" value="${this.projectData.instagram_url || ''}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>TikTok</label>
                        <input type="text" id="editBrandTikTok" value="${this.projectData.tiktok_url || ''}" class="form-input">
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        `;
    }

    getLogoEditForm() {
        return `
            <form id="editLogoForm" class="edit-form">
                <div class="form-group">
                    <label>Logo actual</label>
                    <div class="logo-preview-container">
                        ${this.projectData.logo_url ? `<img src="${this.projectData.logo_url}" alt="Logo" style="max-width: 200px; max-height: 200px; border-radius: 8px;">` : '<p>No hay logo</p>'}
                    </div>
                </div>
                <div class="form-group">
                    <label>Nuevo logo</label>
                    <div class="upload-zone" id="logoUploadZone">
                        <input type="file" id="editLogoFile" accept="image/*,.svg" hidden>
                        <i class="fas fa-cloud-upload-alt"></i>
                        <p>Haz clic para subir nuevo logo</p>
                        <p style="font-size: 0.85rem; color: var(--text-muted);">PNG, JPG, SVG - Máx 5MB</p>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        `;
    }

    getGuidelinesEditForm() {
        const tonoVozOptions = [
            'amigable', 'premium', 'tecnico', 'irreverente', 'divertido', 'profesional',
            'casual', 'inspirador', 'autoritario', 'empatico', 'humoristico', 'serio',
            'joven', 'tradicional', 'innovador', 'calido', 'directo', 'poetico',
            'energico', 'tranquilo'
        ].map(tono => {
            const selected = this.brandData?.tono_voz === tono ? 'selected' : '';
            const tonoNames = {
                'amigable': 'Amigable', 'premium': 'Premium', 'tecnico': 'Técnico',
                'irreverente': 'Irreverente', 'divertido': 'Divertido', 'profesional': 'Profesional',
                'casual': 'Casual', 'inspirador': 'Inspirador', 'autoritario': 'Autoritario',
                'empatico': 'Empático', 'humoristico': 'Humorístico', 'serio': 'Serio',
                'joven': 'Joven', 'tradicional': 'Tradicional', 'innovador': 'Innovador',
                'calido': 'Cálido', 'directo': 'Directo', 'poetico': 'Poético',
                'energico': 'Enérgico', 'tranquilo': 'Tranquilo'
            };
            return `<option value="${tono}" ${selected}>${tonoNames[tono] || tono}</option>`;
        }).join('');

        const palabrasEvitar = Array.isArray(this.brandData?.palabras_evitar) 
            ? this.brandData.palabras_evitar.join(', ') 
            : '';

        return `
            <form id="editGuidelinesForm" class="edit-form">
                <div class="form-group">
                    <label>Tono de voz</label>
                    <select id="editTonoVoz" class="form-select" required>
                        <option value="">Seleccionar...</option>
                        ${tonoVozOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>Palabras a usar siempre</label>
                    <textarea id="editPalabrasUsar" class="form-textarea" rows="3">${this.brandData?.palabras_usar || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Palabras a evitar (separadas por comas)</label>
                    <textarea id="editPalabrasEvitar" class="form-textarea" rows="3" placeholder="barato, caro, artificial...">${palabrasEvitar}</textarea>
                </div>
                <div class="form-group">
                    <label>Reglas creativas</label>
                    <textarea id="editReglasCreativas" class="form-textarea" rows="4">${this.brandData?.reglas_creativas || ''}</textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        `;
    }

    getMarketsEditForm() {
        const mercados = Array.isArray(this.projectData?.mercado_objetivo) 
            ? this.projectData.mercado_objetivo.join(', ') 
            : '';
        const idiomas = Array.isArray(this.projectData?.idiomas_contenido) 
            ? this.projectData.idiomas_contenido.join(', ') 
            : '';

        return `
            <form id="editMarketsForm" class="edit-form">
                <div class="form-group">
                    <label>Mercados objetivo (separados por comas)</label>
                    <textarea id="editMercados" class="form-textarea" rows="4" placeholder="mexico, colombia, spain...">${mercados}</textarea>
                    <small style="color: var(--text-muted);">Ejemplo: mexico, colombia, spain, usa</small>
                </div>
                <div class="form-group">
                    <label>Idiomas para contenido (separados por comas)</label>
                    <textarea id="editIdiomas" class="form-textarea" rows="4" placeholder="español, ingles, portugues...">${idiomas}</textarea>
                    <small style="color: var(--text-muted);">Ejemplo: español, ingles, portugues</small>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        `;
    }

    getFilesEditForm() {
        const filesList = this.brandFiles && this.brandFiles.length > 0
            ? this.brandFiles.map(file => `
                <div class="file-item-edit">
                    <div class="file-info">
                        <i class="fas fa-file"></i>
                        <span>${file.file_name}</span>
                    </div>
                    <button type="button" class="btn-delete-file" onclick="livingManager.deleteBrandFile('${file.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `).join('')
            : '<p style="color: var(--text-muted);">No hay archivos</p>';

        return `
            <form id="editFilesForm" class="edit-form">
                <div class="form-group">
                    <label>Archivos actuales</label>
                    <div class="files-list-edit">
                        ${filesList}
                    </div>
                </div>
                <div class="form-group">
                    <label>Agregar nuevos archivos</label>
                    <div class="upload-zone" id="brandFilesUploadZone">
                        <input type="file" id="editBrandFiles" multiple accept="image/*,.pdf,.zip,.doc,.docx" hidden>
                        <i class="fas fa-folder-plus"></i>
                        <p>Haz clic para agregar archivos</p>
                        <p style="font-size: 0.85rem; color: var(--text-muted);">PDF, ZIP, DOC, Imágenes - Máx 10MB c/u</p>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cerrar</button>
                    <button type="button" class="btn btn-primary" onclick="livingManager.saveBrandFiles()">Guardar Archivos</button>
                </div>
            </form>
        `;
    }

    // ============================================
    // UTILIDADES DE MODAL
    // ============================================

    createModal(title, content) {
        const modal = document.createElement('div');
        modal.className = 'edit-modal';
        modal.innerHTML = `
            <div class="modal-overlay" onclick="this.closest('.edit-modal').remove()"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" onclick="this.closest('.edit-modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;
        return modal;
    }

    showModal(modal) {
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('show'), 10);
        this.setupModalListeners(modal);
    }

    setupModalListeners(modal) {
        // Logo upload
        const logoUploadZone = modal.querySelector('#logoUploadZone');
        const logoInput = modal.querySelector('#editLogoFile');
        if (logoUploadZone && logoInput) {
            logoUploadZone.addEventListener('click', () => logoInput.click());
            logoInput.addEventListener('change', (e) => {
                if (e.target.files[0]) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        // Guardar el input file antes de reemplazar el contenido
                        const fileInput = logoUploadZone.querySelector('input[type="file"]');
                        logoUploadZone.innerHTML = `
                            <input type="file" id="editLogoFile" accept="image/*,.svg" hidden>
                            <img src="${event.target.result}" style="max-width: 200px; max-height: 200px; border-radius: 8px; margin-bottom: 0.5rem;">
                            <p>Logo seleccionado</p>
                            <p style="font-size: 0.85rem; color: var(--text-muted);">${e.target.files[0].name}</p>
                        `;
                        // Restaurar el input file y asignar el archivo seleccionado
                        const newInput = logoUploadZone.querySelector('#editLogoFile');
                        if (newInput) {
                            // Crear un nuevo FileList con el archivo seleccionado
                            const dataTransfer = new DataTransfer();
                            dataTransfer.items.add(e.target.files[0]);
                            newInput.files = dataTransfer.files;
                            // Agregar listener nuevamente
                            newInput.addEventListener('change', (ev) => {
                                if (ev.target.files[0]) {
                                    const newReader = new FileReader();
                                    newReader.onload = (newEvent) => {
                                        const currentInput = logoUploadZone.querySelector('input[type="file"]');
                                        logoUploadZone.innerHTML = `
                                            <input type="file" id="editLogoFile" accept="image/*,.svg" hidden>
                                            <img src="${newEvent.target.result}" style="max-width: 200px; max-height: 200px; border-radius: 8px; margin-bottom: 0.5rem;">
                                            <p>Logo seleccionado</p>
                                            <p style="font-size: 0.85rem; color: var(--text-muted);">${ev.target.files[0].name}</p>
                                        `;
                                        const restoredInput = logoUploadZone.querySelector('#editLogoFile');
                                        if (restoredInput) {
                                            const newDataTransfer = new DataTransfer();
                                            newDataTransfer.items.add(ev.target.files[0]);
                                            restoredInput.files = newDataTransfer.files;
                                        }
                                    };
                                    newReader.readAsDataURL(ev.target.files[0]);
                                }
                            });
                        }
                    };
                    reader.readAsDataURL(e.target.files[0]);
                }
            });
        }

        // Brand files upload
        const filesUploadZone = modal.querySelector('#brandFilesUploadZone');
        const filesInput = modal.querySelector('#editBrandFiles');
        if (filesUploadZone && filesInput) {
            filesUploadZone.addEventListener('click', () => filesInput.click());
        }

        // Form submissions
        const userForm = modal.querySelector('#editUserForm');
        if (userForm) {
            userForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveUserData(modal);
            });
        }

        const brandForm = modal.querySelector('#editBrandForm');
        if (brandForm) {
            brandForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveBrandData(modal);
            });
        }

        const logoForm = modal.querySelector('#editLogoForm');
        if (logoForm) {
            logoForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveLogo(modal);
            });
        }

        const guidelinesForm = modal.querySelector('#editGuidelinesForm');
        if (guidelinesForm) {
            guidelinesForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveGuidelines(modal);
            });
        }

        const marketsForm = modal.querySelector('#editMarketsForm');
        if (marketsForm) {
            marketsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveMarkets(modal);
            });
        }
    }

    // ============================================
    // GUARDAR DATOS
    // ============================================

    async saveUserData(modal) {
        const fullName = modal.querySelector('#editUserName').value.trim();
        const email = modal.querySelector('#editUserEmail').value.trim();

        try {
            const { error } = await this.supabase
                .from('users')
                .update({
                    full_name: fullName,
                    email: email
                })
                .eq('id', this.userId);

            if (error) throw error;

            await this.loadUserData();
            this.renderUserInfo();
            modal.remove();
            this.showNotification('✅ Información de usuario actualizada', 'success');
        } catch (error) {
            console.error('Error guardando usuario:', error);
            alert(`Error al guardar: ${error.message}`);
        }
    }

    async saveBrandData(modal) {
        const nombreMarca = modal.querySelector('#editBrandName').value.trim();
        const sitioWeb = modal.querySelector('#editBrandWebsite').value.trim() || null;
        const instagram = modal.querySelector('#editBrandInstagram').value.trim() || null;
        const tiktok = modal.querySelector('#editBrandTikTok').value.trim() || null;

        try {
            const { error } = await this.supabase
                .from('projects')
                .update({
                    nombre_marca: nombreMarca,
                    sitio_web: sitioWeb,
                    instagram_url: instagram,
                    tiktok_url: tiktok
                })
                .eq('id', this.projectData.id);

            if (error) throw error;

            await this.loadProjectData();
            this.renderBrandInfo();
            modal.remove();
            this.showNotification('✅ Datos de marca actualizados', 'success');
        } catch (error) {
            console.error('Error guardando marca:', error);
            alert(`Error al guardar: ${error.message}`);
        }
    }

    async saveLogo(modal) {
        // Buscar el input file en el modal (puede estar en diferentes lugares)
        let logoInput = modal.querySelector('#editLogoFile');
        
        // Si no se encuentra, buscar en todo el modal
        if (!logoInput) {
            logoInput = modal.querySelector('input[type="file"]');
        }
        
        // Verificar que existe y tiene un archivo
        if (!logoInput) {
            console.error('❌ No se encontró el input file en el modal');
            this.showNotification('⚠️ Error: No se encontró el campo de archivo', 'error');
            return;
        }
        
        console.log('📋 Input file encontrado:', logoInput);
        console.log('📋 Archivos en input:', logoInput.files);
        console.log('📋 Número de archivos:', logoInput.files.length);
        
        if (!logoInput.files || logoInput.files.length === 0) {
            console.warn('⚠️ No se seleccionó ningún archivo de logo');
            console.warn('📋 Estado del input:', {
                value: logoInput.value,
                files: logoInput.files,
                filesLength: logoInput.files ? logoInput.files.length : 0
            });
            this.showNotification('⚠️ Por favor selecciona un archivo de logo', 'error');
            return;
        }

        const logoFile = logoInput.files[0];
        
        // Validar tamaño del archivo (5MB máximo)
        if (logoFile.size > 5 * 1024 * 1024) {
            alert('El archivo es demasiado grande. Máximo 5MB.');
            return;
        }

        // Deshabilitar botón de submit mientras se sube
        const submitBtn = modal.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Subiendo...';
        }
        
        try {
            console.log('📤 Iniciando subida de logo...');
            console.log('📋 Archivo:', logoFile.name, 'Tamaño:', logoFile.size, 'Tipo:', logoFile.type);
            
            const fileExt = logoFile.name.split('.').pop();
            const fileName = `${this.userId}/${this.projectData.id}/logo.${fileExt}`;

            console.log('📁 Ruta del archivo:', fileName);

            // Verificar que tenemos Supabase y userId
            if (!this.supabase) {
                throw new Error('Supabase no está inicializado');
            }
            if (!this.userId) {
                throw new Error('No hay usuario autenticado');
            }
            if (!this.projectData || !this.projectData.id) {
                throw new Error('No hay proyecto disponible');
            }

            // Intentar eliminar logo anterior si existe
            try {
                console.log('🗑️ Intentando eliminar logo anterior...');
                const { data: listData } = await this.supabase.storage
                    .from('brand-logos')
                    .list(`${this.userId}/${this.projectData.id}`, {
                        search: 'logo'
                    });
                
                if (listData && listData.length > 0) {
                    const filesToRemove = listData.map(f => `${this.userId}/${this.projectData.id}/${f.name}`);
                    await this.supabase.storage
                        .from('brand-logos')
                        .remove(filesToRemove);
                    console.log('✅ Logo anterior eliminado');
                }
            } catch (removeError) {
                console.log('ℹ️ No se encontró logo anterior o error al eliminar:', removeError.message);
            }

            // Subir nuevo logo
            console.log('📤 Subiendo nuevo logo...');
            const { data: uploadData, error: uploadError } = await this.supabase.storage
                .from('brand-logos')
                .upload(fileName, logoFile, {
                    upsert: true,
                    contentType: logoFile.type,
                    cacheControl: '3600'
                });

            if (uploadError) {
                console.error('❌ Error al subir logo:', uploadError);
                throw new Error(`Error al subir logo: ${uploadError.message}`);
            }

            console.log('✅ Logo subido exitosamente:', uploadData);

            // Obtener URL pública
            const { data: { publicUrl } } = this.supabase.storage
                .from('brand-logos')
                .getPublicUrl(fileName);

            console.log('🔗 URL pública del logo:', publicUrl);

            // Actualizar proyecto con la nueva URL
            console.log('💾 Actualizando proyecto con nueva URL de logo...');
            const { error: updateError } = await this.supabase
                .from('projects')
                .update({ logo_url: publicUrl })
                .eq('id', this.projectData.id);

            if (updateError) {
                console.error('❌ Error al actualizar proyecto:', updateError);
                throw new Error(`Error al actualizar proyecto: ${updateError.message}`);
            }

            console.log('✅ Proyecto actualizado exitosamente');

            // Recargar datos del proyecto
            await this.loadProjectData();
            
            // Renderizar nuevamente la información de la marca
            this.renderBrandInfo();
            
            // Cerrar modal
            modal.remove();
            
            // Mostrar notificación de éxito
            this.showNotification('✅ Logo actualizado exitosamente', 'success');
            
        } catch (error) {
            console.error('❌ Error completo guardando logo:', error);
            console.error('Detalles:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });
            
            // Reactivar botón
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Guardar';
            }
            
            let errorMessage = `Error al guardar logo: ${error.message}`;
            if (error.details) {
                errorMessage += `\n\nDetalles: ${error.details}`;
            }
            if (error.hint) {
                errorMessage += `\n\nSugerencia: ${error.hint}`;
            }
            
            alert(errorMessage);
            this.showNotification(`❌ Error: ${error.message}`, 'error');
        }
    }

    async saveGuidelines(modal) {
        const tonoVoz = modal.querySelector('#editTonoVoz').value;
        const palabrasUsar = modal.querySelector('#editPalabrasUsar').value.trim() || null;
        const palabrasEvitarText = modal.querySelector('#editPalabrasEvitar').value.trim();
        const reglasCreativas = modal.querySelector('#editReglasCreativas').value.trim() || null;

        const palabrasEvitar = palabrasEvitarText
            ? palabrasEvitarText.split(',').map(p => p.trim()).filter(p => p)
            : [];

        try {
            if (this.brandData) {
                // Actualizar
                const { error } = await this.supabase
                    .from('brands')
                    .update({
                        tono_voz: tonoVoz,
                        palabras_usar: palabrasUsar,
                        palabras_evitar: palabrasEvitar,
                        reglas_creativas: reglasCreativas
                    })
                    .eq('id', this.brandData.id);

                if (error) throw error;
            } else {
                // Crear
                const { error } = await this.supabase
                    .from('brands')
                    .insert({
                        project_id: this.projectData.id,
                        tono_voz: tonoVoz,
                        palabras_usar: palabrasUsar,
                        palabras_evitar: palabrasEvitar,
                        reglas_creativas: reglasCreativas
                    });

                if (error) throw error;
            }

            await this.loadBrandData();
            this.renderBrandGuidelines();
            modal.remove();
            this.showNotification('✅ Lineamientos actualizados', 'success');
        } catch (error) {
            console.error('Error guardando lineamientos:', error);
            alert(`Error al guardar: ${error.message}`);
        }
    }

    async saveMarkets(modal) {
        const mercadosText = modal.querySelector('#editMercados').value.trim();
        const idiomasText = modal.querySelector('#editIdiomas').value.trim();

        const mercadoObjetivo = mercadosText
            ? mercadosText.split(',').map(m => m.trim()).filter(m => m)
            : [];
        const idiomasContenido = idiomasText
            ? idiomasText.split(',').map(i => i.trim()).filter(i => i)
            : [];

        try {
            const { error } = await this.supabase
                .from('projects')
                .update({
                    mercado_objetivo: mercadoObjetivo,
                    idiomas_contenido: idiomasContenido
                })
                .eq('id', this.projectData.id);

            if (error) throw error;

            await this.loadProjectData();
            this.renderMarketsAndLanguages();
            modal.remove();
            this.showNotification('✅ Mercado e idiomas actualizados', 'success');
        } catch (error) {
            console.error('Error guardando mercados:', error);
            alert(`Error al guardar: ${error.message}`);
        }
    }

    async saveBrandFiles() {
        const filesInput = document.querySelector('#editBrandFiles');
        if (!filesInput || !filesInput.files.length) return;

        const files = Array.from(filesInput.files);
        
        try {
            for (const file of files) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${this.userId}/${this.projectData.id}/${Date.now()}_${file.name}`;

                const { error: uploadError } = await this.supabase.storage
                    .from('brand-files')
                    .upload(fileName, file, {
                        contentType: file.type
                    });

                if (uploadError) {
                    console.error('Error subiendo archivo:', file.name, uploadError);
                    continue;
                }

                const { data: { publicUrl } } = this.supabase.storage
                    .from('brand-files')
                    .getPublicUrl(fileName);

                await this.supabase
                    .from('brand_files')
                    .insert({
                        project_id: this.projectData.id,
                        file_name: file.name,
                        file_url: publicUrl,
                        file_type: file.type,
                        file_size: file.size
                    });
            }

            await this.loadBrandFiles();
            this.renderBrandFiles();
            this.showNotification('✅ Archivos agregados', 'success');
        } catch (error) {
            console.error('Error guardando archivos:', error);
            alert(`Error al guardar archivos: ${error.message}`);
        }
    }

    async deleteBrandFile(fileId) {
        if (!confirm('¿Estás seguro de eliminar este archivo?')) return;

        try {
            const { data: file, error: fetchError } = await this.supabase
                .from('brand_files')
                .select('file_url')
                .eq('id', fileId)
                .single();

            if (fetchError) throw fetchError;

            // Extraer path del URL para eliminar de storage
            const url = new URL(file.file_url);
            const pathParts = url.pathname.split('/');
            const fileName = pathParts.slice(pathParts.indexOf('brand-files') + 1).join('/');

            // Eliminar de storage
            await this.supabase.storage
                .from('brand-files')
                .remove([fileName]);

            // Eliminar de base de datos
            const { error: deleteError } = await this.supabase
                .from('brand_files')
                .delete()
                .eq('id', fileId);

            if (deleteError) throw deleteError;

            await this.loadBrandFiles();
            this.renderBrandFiles();
            this.showNotification('✅ Archivo eliminado', 'success');
        } catch (error) {
            console.error('Error eliminando archivo:', error);
            alert(`Error al eliminar: ${error.message}`);
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Initialize when DOM is ready
let livingManager;
document.addEventListener('DOMContentLoaded', () => {
    livingManager = new LivingManager();
    window.livingManager = livingManager;
});

