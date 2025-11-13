/**
 * AI Smart Content - Planes Page
 * Manejo de selección de planes y modal de registro
 */

class PlanesManager {
    constructor() {
        this.selectedPlan = null;
        this.supabase = null;
        this.init();
    }

    async init() {
        await this.initSupabase();
        this.setupPlanButtons();
        this.setupModal();
        this.setupForm();
    }

    async initSupabase() {
        try {
            if (typeof waitForSupabase === 'function') {
                this.supabase = await waitForSupabase();
            } else if (window.supabaseClient) {
                this.supabase = window.supabaseClient;
            }
            
            // Si aún no tenemos Supabase, intentar inicializar directamente
            if (!this.supabase && typeof initSupabase === 'function') {
                this.supabase = await initSupabase();
            }
        } catch (error) {
            console.error('Error initializing Supabase:', error);
            // No lanzar el error, solo loguearlo
            // El código verificará si this.supabase está disponible antes de usarlo
        }
    }

    setupPlanButtons() {
        const planButtons = document.querySelectorAll('.plan-btn');
        planButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const plan = e.currentTarget.dataset.plan;
                const credits = e.currentTarget.dataset.credits;
                const price = e.currentTarget.dataset.price;
                this.selectPlan(plan, credits, price);
            });
        });
    }

    selectPlan(plan, credits, price) {
        this.selectedPlan = {
            name: plan,
            credits: credits,
            price: price
        };
        this.openModal();
    }

    setupModal() {
        const overlay = document.getElementById('registrationOverlay');
        const closeBtn = document.getElementById('closeModal');
        const cancelBtn = document.getElementById('cancelBtn');

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeModal();
            }
        });

        // Close buttons
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeModal());
        }

        // Close on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('active')) {
                this.closeModal();
            }
        });
    }

    openModal() {
        const overlay = document.getElementById('registrationOverlay');
        const planInfo = document.getElementById('selectedPlanInfo');
        
        if (!overlay || !planInfo) return;

        // Update plan info
        const planNames = {
            'basico': 'Plan Básico',
            'pro': 'Plan Pro',
            'enterprise': 'Plan Enterprise'
        };
        
        planInfo.textContent = `${planNames[this.selectedPlan.name]} - ${this.selectedPlan.credits} créditos - $${this.selectedPlan.price}/mes`;
        
        // Show modal
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeModal() {
        const overlay = document.getElementById('registrationOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    setupForm() {
        const form = document.getElementById('registrationForm');
        if (!form) return;

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        // Password confirmation validation
        const password = document.getElementById('regPassword');
        const confirmPassword = document.getElementById('regConfirmPassword');
        
        if (confirmPassword) {
            confirmPassword.addEventListener('input', () => {
                if (password.value !== confirmPassword.value) {
                    confirmPassword.setCustomValidity('Las contraseñas no coinciden');
                } else {
                    confirmPassword.setCustomValidity('');
                }
            });
        }

        // Prevenir que el navegador autocomplete el nombre con el email
        const nameInput = document.getElementById('regName');
        const emailInput = document.getElementById('regEmail');
        
        if (nameInput && emailInput) {
            // Limpiar el campo de nombre si el navegador lo llena con el email
            nameInput.addEventListener('focus', () => {
                if (nameInput.value === emailInput.value) {
                    nameInput.value = '';
                }
            });

            // Prevenir que el email se copie al nombre cuando el navegador autocompleta
            emailInput.addEventListener('input', () => {
                if (nameInput.value === emailInput.value && nameInput !== document.activeElement) {
                    nameInput.value = '';
                }
            });

            // Limpiar el nombre si detectamos que contiene un email
            nameInput.addEventListener('blur', () => {
                const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (emailPattern.test(nameInput.value) && nameInput.value === emailInput.value) {
                    nameInput.value = '';
                }
            });
        }
    }

    async handleSubmit() {
        const form = document.getElementById('registrationForm');
        if (!form || !form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('regConfirmPassword').value;

        // Validate password match
        if (password !== confirmPassword) {
            alert('Las contraseñas no coinciden');
            return;
        }

        if (password.length < 8) {
            alert('La contraseña debe tener al menos 8 caracteres');
            return;
        }

        // Disable submit button
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creando cuenta...';
        }

        try {
            // Initialize Supabase if not already done
            if (!this.supabase) {
                await this.initSupabase();
            }

            if (!this.supabase) {
                // Intentar inicializar una vez más antes de fallar
                this.supabase = await waitForSupabase();
                
                if (!this.supabase) {
                    const config = window.SUPABASE_CONFIG || {};
                    let errorMsg = 'Supabase no está disponible. ';
                    
                    if (!config.url || !config.anonKey) {
                        errorMsg += 'Las variables de configuración no están disponibles. Por favor, contacta al administrador.';
                    } else {
                        errorMsg += 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
                    }
                    
                    throw new Error(errorMsg);
                }
            }

            // Split name into first and last name
            const nameParts = name.split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            const fullName = name;

            // Register user in Supabase Auth
            const { data, error } = await this.supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: fullName,
                        first_name: firstName,
                        last_name: lastName,
                        plan_type: this.selectedPlan.name
                }
            }
        });

            if (error) {
                throw error;
            }

            if (data.user) {
                console.log('✅ Usuario creado en auth.users:', data.user.id);
                
                // El trigger handle_new_user() creará automáticamente el registro en public.users
                // Esperar un momento para que el trigger se ejecute
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Verificar que el usuario existe en public.users
                let userExists = false;
                let retries = 0;
                const maxRetries = 5;

                while (!userExists && retries < maxRetries) {
                    const { data: existingUser, error: checkError } = await this.supabase
                        .from('users')
                        .select('id')
                        .eq('id', data.user.id)
                        .maybeSingle();

                    if (checkError && checkError.code !== 'PGRST116') {
                        console.error('Error verificando usuario:', checkError);
                    }

                    if (existingUser) {
                        userExists = true;
                        console.log('✅ Usuario encontrado en public.users');
                    } else {
                        console.log(`⏳ Usuario no encontrado, intentando crear... (intento ${retries + 1}/${maxRetries})`);
                        
                        // Intentar crear el usuario manualmente
                        const { error: createError } = await this.supabase
                            .from('users')
                            .insert({
                                id: data.user.id,
                                email: data.user.email,
                                full_name: data.user.user_metadata?.full_name || data.user.email,
                                plan_type: data.user.user_metadata?.plan_type || 'basico',
                                credits_available: 0,
                                credits_total: 0,
                                form_verified: false
                            });

                        if (createError) {
                            console.warn('Error creando usuario (puede que ya exista):', createError);
                        } else {
                            console.log('✅ Usuario creado manualmente en public.users');
                            userExists = true;
                        }
                    }

                    if (!userExists) {
                        retries++;
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }

                if (!userExists) {
                    throw new Error('No se pudo crear el usuario en public.users después de varios intentos');
                }

                const credits = parseInt(this.selectedPlan.credits);
                const planType = this.selectedPlan.name;

                // Actualizar el usuario con el plan_type y créditos
                try {
                    const { error: updateUserError } = await this.supabase
                        .from('users')
                        .update({
                            plan_type: planType,
                            credits_available: credits,
                            credits_total: credits
                        })
                        .eq('id', data.user.id);

                    if (updateUserError) {
                        console.error('Error actualizando usuario:', updateUserError);
                        throw new Error(`Error al asignar plan: ${updateUserError.message}`);
                    }
                    console.log('✅ Usuario actualizado con plan y créditos');
                } catch (updateError) {
                    console.error('Error actualizando usuario:', updateError);
                    throw updateError;
                }

                // Crear suscripción con el plan seleccionado
                try {
                    const now = new Date();
                    const expiresAt = new Date(now);
                    expiresAt.setMonth(expiresAt.getMonth() + 1); // 1 mes desde ahora

                    console.log('📝 Creando suscripción...', {
                        user_id: data.user.id,
                        plan_type: planType,
                        credits: credits,
                        price: parseFloat(this.selectedPlan.price)
                    });

                    const { data: subscription, error: subscriptionError } = await this.supabase
                        .from('subscriptions')
                        .insert({
                            user_id: data.user.id,
                            plan_type: planType,
                            status: 'active',
                            credits_included: credits,
                            price: parseFloat(this.selectedPlan.price),
                            currency: 'USD',
                            started_at: now.toISOString(),
                            expires_at: expiresAt.toISOString()
                        })
                        .select()
                        .single();

                    if (subscriptionError) {
                        console.error('❌ Error creando suscripción:', subscriptionError);
                        console.error('Código:', subscriptionError.code);
                        console.error('Mensaje:', subscriptionError.message);
                        console.error('Detalles:', subscriptionError.details);
                        console.error('Hint:', subscriptionError.hint);
                        throw new Error(`Error al crear suscripción: ${subscriptionError.message} (Código: ${subscriptionError.code || 'N/A'})`);
                    } else {
                        console.log('✅ Suscripción creada exitosamente:', subscription);
                    }
                } catch (subError) {
                    console.error('❌ Error creando suscripción:', subError);
                    // Mostrar error pero no bloquear el flujo completamente
                    alert(`Advertencia: La suscripción no se pudo crear: ${subError.message}\n\nEl usuario tiene el plan asignado, pero la suscripción no se registró. Por favor, contacta al administrador.`);
                }

                // Cerrar modal
                this.closeModal();
                form.reset();

                // Redirigir al formulario de registro de datos
                window.location.href = 'form-record.html';
            }
        } catch (error) {
            console.error('Error en registro:', error);
            
            let errorMessage = 'Error al crear la cuenta. Intenta nuevamente.';
            if (error.message.includes('User already registered')) {
                errorMessage = 'Este email ya está registrado. Inicia sesión en su lugar.';
            } else if (error.message.includes('Password')) {
                errorMessage = 'La contraseña no cumple con los requisitos de seguridad';
            } else if (error.message.includes('Email')) {
                errorMessage = 'El email no es válido';
            }
            
            alert(errorMessage);
            
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Proceder al Pago';
            }
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PlanesManager();
});

