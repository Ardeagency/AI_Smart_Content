/**
 * AI Smart Content - Suscribirse Page
 * Manejo de selección de planes con checkboxes y registro
 */

class PlanesManager {
    constructor() {
        this.selectedPlan = null;
        this.supabase = null;
        this.init();
    }

    async init() {
        await this.initSupabase();
        this.setupPlanSelection();
        this.setupForm();
        this.setupPasswordToggle();
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

    setupPlanSelection() {
        const planCards = document.querySelectorAll('.plan-card-small');
        
        planCards.forEach(card => {
            card.addEventListener('click', () => {
                this.selectPlan(card);
            });
        });
    }

    selectPlan(cardElement) {
        // Deseleccionar todas las cards
        document.querySelectorAll('.plan-card-small').forEach(card => {
            card.classList.remove('selected');
        });
        
        // Seleccionar la card actual
        cardElement.classList.add('selected');
        
        // Guardar plan seleccionado
        this.selectedPlan = {
            name: cardElement.dataset.plan,
            credits: parseInt(cardElement.dataset.credits),
            price: parseFloat(cardElement.dataset.price)
        };
        
        console.log('Plan seleccionado:', this.selectedPlan);
    }

    setupPasswordToggle() {
        const passwordToggle = document.getElementById('passwordToggle');
        const passwordInput = document.getElementById('regPassword');
        
        if (passwordToggle && passwordInput) {
            passwordToggle.addEventListener('click', () => {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
                
                // Cambiar icono
                passwordToggle.classList.toggle('fa-eye');
                passwordToggle.classList.toggle('fa-eye-slash');
            });
        }
    }

    setupForm() {
        const form = document.getElementById('registrationForm');
        if (!form) return;

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        // Validación de contraseñas en tiempo real
        const password = document.getElementById('regPassword');
        if (password) {
            password.addEventListener('input', () => {
                this.validatePassword(password);
            });
        }
    }

    validatePassword(passwordInput) {
        const password = passwordInput.value;
        if (password.length > 0 && password.length < 8) {
            passwordInput.setCustomValidity('La contraseña debe tener al menos 8 caracteres');
        } else {
            passwordInput.setCustomValidity('');
        }
    }

    async handleSubmit() {
        const form = document.getElementById('registrationForm');
        if (!form || !form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // Validar que se haya seleccionado un plan
        if (!this.selectedPlan) {
            alert('Por favor, selecciona un plan de suscripción');
            return;
        }

        const fullName = document.getElementById('regFullName').value.trim();
        const email = document.getElementById('regEmail').value.trim().toLowerCase();
        const password = document.getElementById('regPassword').value;

        // Validaciones
        if (!fullName) {
            alert('Por favor, ingresa tu nombre completo');
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
            // Validar que fullName no esté vacío
            if (!fullName || fullName.trim() === '') {
                fullName = email; // Usar email como fallback
            }

            // 1. Registrar usuario en Supabase Auth
            // Los metadatos se guardan en raw_user_meta_data (JSONB) en auth.users
            const { data: authData, error: authError } = await this.supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: fullName.trim(),
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

            // 2. Verificar si hay sesión activa
            let session = authData.session;
            
            // 3. Crear perfil en public.profiles usando función SECURITY DEFINER (RPC create_user_profile)
            const { error: createUserError } = await this.supabase.rpc('create_user_profile', {
                p_user_id: authData.user.id,
                p_email: email,
                p_full_name: fullName.trim() || email,
                p_plan_type: this.selectedPlan.name,
                p_credits: this.selectedPlan.credits
            });

            if (createUserError) {
                console.error('❌ Error creando perfil en public.profiles:', createUserError);
                throw new Error(`Error al crear el perfil: ${createUserError.message}`);
            }
            console.log('✅ Perfil creado en public.profiles');

            // 4. Crear suscripción en public.subscriptions usando función SECURITY DEFINER
            const { data: subscriptionId, error: subscriptionError } = await this.supabase.rpc('create_user_subscription', {
                p_user_id: authData.user.id,
                p_plan_type: this.selectedPlan.name,
                p_credits_included: this.selectedPlan.credits,
                p_price: this.selectedPlan.price
            });

            if (subscriptionError) {
                console.error('❌ Error creando suscripción:', subscriptionError);
                throw new Error(`Error al crear la suscripción: ${subscriptionError.message}`);
            }
            console.log('✅ Suscripción creada con ID:', subscriptionId);

            // 5. Si no hay sesión activa, significa que se requiere confirmación de email
            if (!session) {
                console.log('📧 Email requiere confirmación, mostrando pantalla de confirmación...');
                this.showEmailConfirmationScreen(email);
            } else {
                // Si hay sesión activa, redirigir al formulario
                console.log('✅ Sesión activa, redirigiendo a form_org');
                window.location.href = '/form_org';
            }

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
                submitBtn.textContent = 'Crear cuenta';
            }
        }
    }

    /**
     * Mostrar pantalla de confirmación de email
     */
    showEmailConfirmationScreen(email) {
        // Ocultar el formulario
        const subscribeCard = document.querySelector('.subscribe-card');
        if (subscribeCard) {
            subscribeCard.style.display = 'none';
        }

        // Mostrar pantalla de confirmación
        const confirmationScreen = document.getElementById('emailConfirmationScreen');
        const confirmationEmail = document.getElementById('confirmationEmail');
        
        if (confirmationScreen && confirmationEmail) {
            confirmationEmail.textContent = email;
            confirmationScreen.style.display = 'flex';
        }

        // Configurar botón de reenvío
        const btnResend = document.getElementById('btnResendEmail');
        if (btnResend) {
            btnResend.addEventListener('click', () => {
                this.resendConfirmationEmail(email);
            });
        }
    }

    /**
     * Reenviar correo de confirmación
     */
    async resendConfirmationEmail(email) {
        if (!this.supabase) {
            await this.initSupabase();
        }

        try {
            const btnResend = document.getElementById('btnResendEmail');
            if (btnResend) {
                btnResend.disabled = true;
                btnResend.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
            }

            const { error } = await this.supabase.auth.resend({
                type: 'signup',
                email: email
            });

            if (error) {
                throw error;
            }

            alert('Correo de confirmación reenviado. Por favor, revisa tu bandeja de entrada.');

            if (btnResend) {
                btnResend.disabled = false;
                btnResend.innerHTML = '<i class="fas fa-paper-plane"></i> Reenviar correo';
            }
        } catch (error) {
            console.error('❌ Error reenviando correo:', error);
            alert(`Error al reenviar el correo: ${error.message}`);
            
            const btnResend = document.getElementById('btnResendEmail');
            if (btnResend) {
                btnResend.disabled = false;
                btnResend.innerHTML = '<i class="fas fa-paper-plane"></i> Reenviar correo';
            }
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PlanesManager();
});
