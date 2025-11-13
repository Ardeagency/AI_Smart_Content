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
            } else if (typeof initSupabase === 'function') {
                this.supabase = await initSupabase();
            }
        } catch (error) {
            console.error('Error initializing Supabase:', error);
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
            credits: parseInt(credits),
            price: parseFloat(price)
        };
        this.openModal();
    }

    setupModal() {
        const overlay = document.getElementById('registrationOverlay');
        const closeBtn = document.getElementById('closeModal');
        const cancelBtn = document.getElementById('cancelBtn');

        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.closeModal();
                }
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeModal());
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay?.classList.contains('active')) {
                this.closeModal();
            }
        });
    }

    openModal() {
        const overlay = document.getElementById('registrationOverlay');
        const planInfo = document.getElementById('selectedPlanInfo');
        
        if (!overlay || !planInfo) return;

        const planNames = {
            'basico': 'Plan Básico',
            'pro': 'Plan Pro',
            'enterprise': 'Plan Enterprise'
        };
        
        planInfo.textContent = `${planNames[this.selectedPlan.name]} - ${this.selectedPlan.credits} créditos - $${this.selectedPlan.price}/mes`;
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

        // Validación de contraseñas
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
    }

    async handleSubmit() {
        const form = document.getElementById('registrationForm');
        if (!form || !form.checkValidity()) {
            form.reportValidity();
            return;
        }

        if (!this.selectedPlan) {
            alert('Por favor, selecciona un plan primero');
            return;
        }

        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim().toLowerCase();
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('regConfirmPassword').value;

        // Validaciones
        if (password !== confirmPassword) {
            alert('Las contraseñas no coinciden');
            return;
        }

        if (password.length < 8) {
            alert('La contraseña debe tener al menos 8 caracteres');
            return;
        }

        // Inicializar Supabase
        if (!this.supabase) {
            await this.initSupabase();
        }

        if (!this.supabase) {
            alert('Error: No se pudo conectar con el servidor. Por favor, recarga la página.');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creando cuenta...';
        }

        try {
            // 1. Registrar usuario en Supabase Auth
            const { data: authData, error: authError } = await this.supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: name || email,
                        plan_type: this.selectedPlan.name
                    }
                }
            });

            if (authError) {
                throw authError;
            }

            if (!authData.user) {
                throw new Error('No se pudo crear el usuario');
            }

            console.log('✅ Usuario creado en auth.users:', authData.user.id);

            // Asegurar que tenemos una sesión activa para que auth.uid() funcione con RLS
            let session = authData.session;
            
            if (!session) {
                // Si no hay sesión, hacer signIn automático para activar la sesión
                console.log('⚠️ No hay sesión automática, haciendo signIn...');
                const { data: signInData, error: signInError } = await this.supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (signInError) {
                    console.warn('⚠️ Error en signIn automático:', signInError);
                    // Intentar obtener la sesión de otra manera
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const { data: { session: currentSession } } = await this.supabase.auth.getSession();
                    session = currentSession;
                } else {
                    session = signInData.session;
                    console.log('✅ Sesión activada mediante signIn');
                }
            } else {
                console.log('✅ Sesión activa desde signUp');
            }

            if (!session) {
                throw new Error('No se pudo establecer una sesión activa. Por favor, intenta iniciar sesión manualmente.');
            }

            // 2. Crear usuario en public.users directamente (ahora con sesión activa)
            const { error: createUserError } = await this.supabase
                .from('users')
                .insert({
                    id: authData.user.id,
                    email: email,
                    full_name: name || email,
                    plan_type: this.selectedPlan.name,
                    credits_available: this.selectedPlan.credits,
                    credits_total: this.selectedPlan.credits,
                    form_verified: false
                });

            if (createUserError) {
                console.error('❌ Error creando usuario en public.users:', createUserError);
                throw new Error(`Error al crear el perfil de usuario: ${createUserError.message}`);
            }
            console.log('✅ Usuario creado en public.users');

            // 3. Crear suscripción
            const now = new Date();
            const expiresAt = new Date(now);
            expiresAt.setMonth(expiresAt.getMonth() + 1);

            const { data: subscription, error: subscriptionError } = await this.supabase
                .from('subscriptions')
                .insert({
                    user_id: authData.user.id,
                    plan_type: this.selectedPlan.name,
                    status: 'active',
                    credits_included: this.selectedPlan.credits,
                    price: this.selectedPlan.price,
                    currency: 'USD',
                    started_at: now.toISOString(),
                    expires_at: expiresAt.toISOString()
                })
                .select()
                .single();

            if (subscriptionError) {
                console.error('❌ Error creando suscripción:', subscriptionError);
                throw new Error(`Error al crear la suscripción: ${subscriptionError.message}`);
            }

            console.log('✅ Suscripción creada:', subscription);

            // 5. Éxito - cerrar modal y redirigir
            this.closeModal();
            form.reset();
            alert('¡Cuenta creada exitosamente!');
            window.location.href = 'form-record.html';

        } catch (error) {
            console.error('❌ Error en registro:', error);
            
            let errorMessage = 'Error al crear la cuenta. Intenta nuevamente.';
            
            if (error.message) {
                if (error.message.includes('already registered') || error.message.includes('already exists')) {
                    errorMessage = 'Este email ya está registrado. Por favor, inicia sesión.';
                } else if (error.message.includes('Password')) {
                    errorMessage = 'La contraseña no cumple con los requisitos de seguridad';
                } else if (error.message.includes('Email')) {
                    errorMessage = 'El email no es válido';
                } else {
                    errorMessage = error.message;
                }
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
