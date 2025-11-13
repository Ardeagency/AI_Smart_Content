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
            // Separar nombre completo en first_name y last_name para metadata
            const nameParts = fullName.split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';

            // 1. Registrar usuario en Supabase Auth
            const { data: authData, error: authError } = await this.supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: fullName || email,
                        first_name: firstName,
                        last_name: lastName,
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

            // 2. Esperar un momento para que la sesión se establezca
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verificar si hay sesión activa
            const { data: { session: currentSession } } = await this.supabase.auth.getSession();
            
            if (currentSession) {
                console.log('✅ Sesión activa encontrada');
            } else {
                console.log('⚠️ No hay sesión activa, intentando continuar...');
                // Si no hay sesión, puede ser que el email requiera confirmación
                // Intentar crear el usuario de todas formas
            }

            // 3. Crear usuario en public.users
            const { error: createUserError } = await this.supabase
                .from('users')
                .insert({
                    id: authData.user.id,
                    email: email,
                    full_name: fullName,
                    plan_type: this.selectedPlan.name,
                    credits_available: this.selectedPlan.credits,
                    credits_total: this.selectedPlan.credits,
                    form_verified: false
                });

            if (createUserError) {
                console.error('❌ Error creando usuario en public.users:', createUserError);
                throw new Error(`Error al crear el perfil: ${createUserError.message}`);
            }
            console.log('✅ Usuario creado en public.users');

            // 4. Crear suscripción en public.subscriptions
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

            // 5. Redirigir directamente a form-record.html (sin alert)
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
                submitBtn.textContent = 'Crear cuenta';
            }
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PlanesManager();
});
