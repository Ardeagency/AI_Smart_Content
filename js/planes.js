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
            // Registrar usuario en Supabase Auth
            const { data, error } = await this.supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: name || email
                    }
                }
            });

            if (error) {
                throw error;
            }

            if (data.user) {
                // Cerrar modal
                this.closeModal();
                form.reset();
                
                // Mostrar mensaje de éxito
                alert('¡Cuenta creada exitosamente! Redirigiendo...');
                
                // Redirigir al formulario de registro de datos
                setTimeout(() => {
                    window.location.href = 'form-record.html';
                }, 1500);
            }
        } catch (error) {
            console.error('Error en registro:', error);
            
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
